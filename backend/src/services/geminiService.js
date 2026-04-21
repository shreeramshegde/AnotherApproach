const { geminiApiKey, geminiModel } = require("../config/env");
const { extractFirstJsonObject } = require("../utils/json");
const { clamp } = require("../utils/parsers");

function heuristicFallback(input) {
  const suspiciousWords =
    /guaranteed|perfect|must buy|best product ever|100%|sponsored|discount/i;
  const isSuspicious = suspiciousWords.test(input.reviewText);

  return {
    isFake: isSuspicious,
    fakeConfidence: isSuspicious ? 0.64 : 0.22,
    fakeReason: isSuspicious
      ? "Heuristic detected promotional or exaggerated phrasing."
      : "No strong fake-review heuristic signal.",
    overallSentiment: "neutral",
    spamLikelihood: isSuspicious ? 0.6 : 0.2,
    sarcasmScore: 0.2,
    isAmbiguous: false,
    sarcasmExplanation: "Heuristic fallback: no model-based sarcasm detection available.",
    featureSentiments: [],
    actionableInsights: [],
    providerStatus: "skipped",
    rawResponse: { reason: "missing_gemini_api_key", heuristic: true },
  };
}

async function analyzeReviewWithGemini(input) {
  if (!input?.reviewText?.trim()) {
    throw new Error("analyzeReviewWithGemini requires reviewText.");
  }

  if (!geminiApiKey) {
    return heuristicFallback(input);
  }

  const prompt = `
You analyze retail product reviews. Return STRICT JSON only:
{
  "isFake": boolean,
  "fakeConfidence": number,
  "fakeReason": string,
  "overallSentiment": "positive" | "negative" | "neutral" | "mixed" | "ambiguous",
  "spamLikelihood": number,
  "sarcasmScore": number,
  "isAmbiguous": boolean,
  "sarcasmExplanation": string,
  "featureSentiments": [
    {
      "feature": string,
      "sentiment": "positive" | "negative" | "neutral" | "mixed" | "ambiguous",
      "confidence": number,
      "evidence": string
    }
  ],
  "actionableInsights": [string]
}
Rules:
- fakeConfidence and spamLikelihood are in [0,1].
- sarcasmScore is in [0,1]; >= 0.55 means strong sarcasm.
- Include at least 3 major features when possible (packaging, quality, delivery, taste, durability, support, etc).
- Use "ambiguous" when sarcasm/mixed wording blocks clear polarity.
- Keep evidence snippets short.

Input:
${JSON.stringify(input)}
  `.trim();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
  let timeoutId;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 15_000);
    let response;
    let payload;

    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });
    payload = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", response.status, payload);
      return {
        ...heuristicFallback(input),
        rawResponse: {
          reason: "gemini_request_failed",
          status: response.status,
          payload,
        },
      };
    }

    const content = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = extractFirstJsonObject(content);

    const featureSentiments = Array.isArray(parsed.featureSentiments)
      ? parsed.featureSentiments.map((entry) => ({
          feature: String(entry.feature || "general"),
          sentiment: String(entry.sentiment || "neutral"),
          confidence: clamp(Number(entry.confidence) || 0, 0, 1),
          evidence: String(entry.evidence || ""),
        }))
      : [];

    return {
      isFake: Boolean(parsed.isFake),
      fakeConfidence: clamp(Number(parsed.fakeConfidence) || 0, 0, 1),
      fakeReason: String(parsed.fakeReason || ""),
      overallSentiment: String(parsed.overallSentiment || "neutral"),
      spamLikelihood: clamp(Number(parsed.spamLikelihood) || 0, 0, 1),
      sarcasmScore: clamp(Number(parsed.sarcasmScore) || 0, 0, 1),
      isAmbiguous: Boolean(parsed.isAmbiguous),
      sarcasmExplanation: String(parsed.sarcasmExplanation || ""),
      featureSentiments,
      actionableInsights: Array.isArray(parsed.actionableInsights)
        ? parsed.actionableInsights.map((x) => String(x))
        : [],
      providerStatus: "success",
      rawResponse: payload,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      return {
        ...heuristicFallback(input),
        rawResponse: { reason: "gemini_request_timeout" },
      };
    }
    console.error("Gemini fallback due to error:", error.message);
    return {
      ...heuristicFallback(input),
      rawResponse: { reason: "gemini_request_exception", message: error.message },
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

module.exports = { analyzeReviewWithGemini };
