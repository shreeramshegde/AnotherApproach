const env = require("../config/env");
const store = require("../store/memoryStore");
const { sha256 } = require("../utils/hash");
const { analyzeReviewWithGemini } = require("./geminiService");
const {
  computeReviewTrust,
  refreshProductAggregate,
  refreshConsumerAggregate,
  refreshDailyMetric,
} = require("./trustService");

const inFlightReviewAnalyses = new Set();

function toSerializableModelOutput(result) {
  return result.rawResponse || result;
}

function recordModelRun({
  reviewId,
  provider,
  model,
  status,
  latencyMs,
  inputPayload,
  outputPayload,
  errorMessage = "",
}) {
  return store.addModelRun({
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
      outputPayload: toSerializableModelOutput(result),
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
  const review = await store.getReviewById(reviewId);
  if (!review) {
    const error = new Error(`Review not found: ${reviewId}`);
    error.statusCode = 404;
    error.isClientSafe = true;
    throw error;
  }

  if (inFlightReviewAnalyses.has(reviewId)) {
    const error = new Error(`Analysis already running for review: ${reviewId}`);
    error.statusCode = 409;
    error.isClientSafe = true;
    throw error;
  }

  inFlightReviewAnalyses.add(reviewId);
  try {
    const geminiInput = {
      reviewText: review.text,
      title: review.title,
      rating: review.rating,
      language: review.language,
      productId: review.productId,
      consumerId: review.consumerId,
    };
    const gemini = await runStep({
      reviewId: review._id,
      provider: "gemini",
      model: env.geminiModel,
      inputPayload: geminiInput,
      execute: () => analyzeReviewWithGemini(geminiInput),
    });

    const isAmbiguous = Boolean(gemini.isAmbiguous || gemini.overallSentiment === "ambiguous");
    const trust = computeReviewTrust({
      fakeConfidence: gemini.fakeConfidence,
      sarcasmScore: gemini.sarcasmScore,
      spamLikelihood: gemini.spamLikelihood,
      isAmbiguous,
      verifiedPurchase: review.verifiedPurchase,
    });

    const updatedFlags = {
      ...(review.flags || {}),
      hasSarcasm: gemini.sarcasmScore >= 0.55,
      isBotLikely: Boolean(review.flags?.isBotLikely),
      isAmbiguous,
      isSpamSuspected: Boolean(
        review.flags?.isSpamSuspected || gemini.spamLikelihood >= 0.75
      ),
      needsHumanReview: Boolean(isAmbiguous || gemini.sarcasmScore >= 0.55),
    };

    await store.updateReviewAnalysis(reviewId, {
      translatedText: "",
      translatedFrom: "",
      sarcasmScore: gemini.sarcasmScore,
      sarcasmExplanation: gemini.sarcasmExplanation,
      flags: updatedFlags,
      isFake: gemini.isFake,
      fakeConfidence: gemini.fakeConfidence,
      fakeReason: gemini.fakeReason,
      spamLikelihood: gemini.spamLikelihood,
      overallSentiment: gemini.overallSentiment,
      featureSentiments: gemini.featureSentiments,
      actionableInsights: gemini.actionableInsights,
      reviewTrustScore: trust.score,
      trustBreakdown: trust.breakdown,
      analysisStatus: "completed",
      analysisError: "",
    });

    await refreshProductAggregate(review.productId);
    await refreshConsumerAggregate(review.consumerId);
    refreshDailyMetric(review.createdAt);

    return store.getReviewById(reviewId);
  } catch (error) {
    await store.updateReviewAnalysis(reviewId, {
      translatedText: review.translatedText,
      translatedFrom: review.translatedFrom,
      sarcasmScore: review.sarcasmScore,
      sarcasmExplanation: review.sarcasmExplanation,
      flags: review.flags,
      isFake: review.isFake,
      fakeConfidence: review.fakeConfidence,
      fakeReason: review.fakeReason,
      spamLikelihood: review.spamLikelihood,
      overallSentiment: review.overallSentiment,
      featureSentiments: review.featureSentiments,
      actionableInsights: review.actionableInsights,
      reviewTrustScore: review.reviewTrustScore,
      trustBreakdown: review.trustBreakdown,
      analysisStatus: "failed",
      analysisError: error.message,
    });
    throw error;
  } finally {
    inFlightReviewAnalyses.delete(reviewId);
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
