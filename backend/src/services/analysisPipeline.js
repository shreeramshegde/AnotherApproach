const env = require("../config/env");
const mongoose = require("mongoose");
const { Review } = require("../models/Review");
const { ModelRun } = require("../models/ModelRun");
const { sha256 } = require("../utils/hash");
const { detectSarcasm } = require("./grokService");
const { analyzeReviewWithGemini } = require("./geminiService");
const {
  computeReviewTrust,
  refreshProductAggregate,
  refreshConsumerAggregate,
  refreshDailyMetric,
} = require("./trustService");

const inFlightReviewAnalyses = new Set();

async function recordModelRun({
  reviewId,
  provider,
  model,
  status,
  latencyMs,
  inputPayload,
  outputPayload,
  errorMessage = "",
}) {
  await ModelRun.create({
    reviewId,
    provider,
    model,
    promptVersion: env.promptVersion,
    status,
    latencyMs,
    requestHash: sha256(JSON.stringify(inputPayload)),
    responsePayload: outputPayload,
    errorMessage,
  });
}

async function runStep({
  reviewId,
  provider,
  model,
  inputPayload,
  execute,
}) {
  const startedAt = Date.now();
  try {
    const result = await execute();
    const status = result.providerStatus === "success" ? "success" : "skipped";
    await recordModelRun({
      reviewId,
      provider,
      model,
      status,
      latencyMs: Date.now() - startedAt,
      inputPayload,
      outputPayload: result.rawResponse || result,
    });
    return result;
  } catch (error) {
    await recordModelRun({
      reviewId,
      provider,
      model,
      status: "failed",
      latencyMs: Date.now() - startedAt,
      inputPayload,
      outputPayload: null,
      errorMessage: error.message,
    });
    throw error;
  }
}

async function analyzeReviewById(reviewId) {
  if (!mongoose.isValidObjectId(reviewId)) {
    const error = new Error(`Invalid review id: ${reviewId}`);
    error.statusCode = 400;
    error.isClientSafe = true;
    throw error;
  }

  const review = await Review.findById(reviewId);
  if (!review) {
    const error = new Error(`Review not found: ${reviewId}`);
    error.statusCode = 404;
    error.isClientSafe = true;
    throw error;
  }

  if (inFlightReviewAnalyses.has(String(reviewId))) {
    const error = new Error(`Analysis already running for review: ${reviewId}`);
    error.statusCode = 409;
    error.isClientSafe = true;
    throw error;
  }

  inFlightReviewAnalyses.add(String(reviewId));
  try {
    const analyzedText = review.text;
    const sarcasm = await runStep({
      reviewId: review._id,
      provider: "grok",
      model: env.grokModel,
      inputPayload: { text: analyzedText },
      execute: () => detectSarcasm(analyzedText),
    });

    const geminiInput = {
      reviewText: analyzedText,
      title: review.title,
      rating: review.rating,
      language: review.language,
      sarcasmScore: sarcasm.sarcasmScore,
      productId: String(review.productId),
      consumerId: String(review.consumerId),
    };
    const gemini = await runStep({
      reviewId: review._id,
      provider: "gemini",
      model: env.geminiModel,
      inputPayload: geminiInput,
      execute: () => analyzeReviewWithGemini(geminiInput),
    });

    const isAmbiguous = Boolean(
      sarcasm.isAmbiguous || gemini.overallSentiment === "ambiguous"
    );
    const trust = computeReviewTrust({
      fakeConfidence: gemini.fakeConfidence,
      sarcasmScore: sarcasm.sarcasmScore,
      spamLikelihood: gemini.spamLikelihood,
      isAmbiguous,
      verifiedPurchase: review.verifiedPurchase,
    });

    review.translatedText = "";
    review.translatedFrom = "";
    review.sarcasmScore = sarcasm.sarcasmScore;
    review.sarcasmExplanation = sarcasm.explanation;
    review.flags.hasSarcasm = sarcasm.sarcasmScore >= 0.55;
    review.flags.isAmbiguous = isAmbiguous;
    review.isFake = gemini.isFake;
    review.fakeConfidence = gemini.fakeConfidence;
    review.fakeReason = gemini.fakeReason;
    review.spamLikelihood = gemini.spamLikelihood;
    review.flags.isSpamSuspected = review.flags.isSpamSuspected || gemini.spamLikelihood >= 0.75;
    review.overallSentiment = gemini.overallSentiment;
    review.featureSentiments = gemini.featureSentiments;
    review.actionableInsights = gemini.actionableInsights;
    review.reviewTrustScore = trust.score;
    review.trustBreakdown = trust.breakdown;
    review.analysisStatus = "completed";
    review.analysisError = "";
    await review.save();

    await Promise.all([
      refreshProductAggregate(review.productId),
      refreshConsumerAggregate(review.consumerId),
      refreshDailyMetric(review.createdAt),
    ]);

    return review;
  } catch (error) {
    review.analysisStatus = "failed";
    review.analysisError = error.message;
    await review.save();
    throw error;
  } finally {
    inFlightReviewAnalyses.delete(String(reviewId));
  }
}

async function analyzeInBackground(reviewIds) {
  const ids = Array.from(reviewIds || []);
  const chunkSize = Math.max(env.analysisBatchSize, 1);

  for (let i = 0; i < ids.length; i += chunkSize) {
    const batch = ids.slice(i, i + chunkSize);
    await Promise.allSettled(batch.map((id) => analyzeReviewById(id)));
  }
}

module.exports = { analyzeReviewById, analyzeInBackground };
