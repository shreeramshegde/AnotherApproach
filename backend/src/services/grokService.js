const { grokApiKey, grokModel } = require("../config/env");
const { extractFirstJsonObject } = require("../utils/json");
const { clamp } = require("../utils/parsers");

function heuristicSarcasm(text) {
  const exaggeratedPattern =
    /yeah right|totally|amazing\s+.*(not)|best ever.*(not)|wow+.*(terrible|bad)/i;
  const hasExclamation = (text.match(/!/g) || []).length >= 3;
  const score = exaggeratedPattern.test(text) || hasExclamation ? 0.62 : 0.18;
  return {
    sarcasmScore: score,
    isAmbiguous: score >= 0.55,
    explanation:
      score >= 0.55
        ? "Heuristic detected exaggerated phrasing likely indicating sarcasm."
        : "Heuristic found no strong sarcasm cues.",
    providerStatus: "skipped",
    rawResponse: { reason: "missing_grok_api_key", heuristic: true },
  };
}

async function detectSarcasm(text) {
  if (!text || !text.trim()) {
    throw new Error("detectSarcasm requires non-empty text.");
  }

  if (!grokApiKey) {
    return heuristicSarcasm(text);
  }

  const instruction = `
You are a sarcasm detector for retail product reviews.
Return STRICT JSON with this schema:
{
  "sarcasmScore": number (0 to 1),
  "isAmbiguous": boolean,
  "explanation": string
}
Rules:
- sarcasmScore >= 0.55 implies strong sarcasm.
- Use "isAmbiguous": true when sentiment cannot be confidently mapped to positive/negative because of sarcasm or mixed cues.
- No markdown, no extra keys, no prose outside JSON.
Review:
${text}
  `.trim();

  let timeoutId;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 15_000);
    let response;
    let payload;

    response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${grokApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: grokModel,
        messages: [
          { role: "system", content: "You output only valid JSON." },
          { role: "user", content: instruction },
        ],
        temperature: 0.1,
      }),
      signal: controller.signal,
    });
    payload = await response.json();
    if (!response.ok) {
      console.error("Grok API error:", response.status, payload);
      return {
        ...heuristicSarcasm(text),
        rawResponse: {
          reason: "grok_request_failed",
          status: response.status,
          payload,
        },
      };
    }

    const content = payload?.choices?.[0]?.message?.content;
    const parsed = extractFirstJsonObject(content);

    return {
      sarcasmScore: clamp(Number(parsed.sarcasmScore) || 0, 0, 1),
      isAmbiguous: Boolean(parsed.isAmbiguous),
      explanation: String(parsed.explanation || ""),
      providerStatus: "success",
      rawResponse: payload,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      return {
        ...heuristicSarcasm(text),
        rawResponse: { reason: "grok_request_timeout" },
      };
    }
    console.error("Grok fallback due to error:", error.message);
    return {
      ...heuristicSarcasm(text),
      rawResponse: { reason: "grok_request_exception", message: error.message },
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

module.exports = { detectSarcasm };
