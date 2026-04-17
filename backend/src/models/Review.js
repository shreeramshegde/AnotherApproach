const mongoose = require("mongoose");

const featureSentimentSchema = new mongoose.Schema(
  {
    feature: { type: String, required: true, trim: true },
    sentiment: {
      type: String,
      enum: ["positive", "negative", "neutral", "mixed", "ambiguous"],
      required: true,
    },
    confidence: { type: Number, min: 0, max: 1, required: true },
    evidence: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["csv", "json", "manual", "api-feed"],
      default: "manual",
    },
    externalId: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
    text: { type: String, required: true, trim: true },
    normalizedTextHash: { type: String, required: true, index: true },
    language: { type: String, trim: true, default: "unknown" },
    translatedText: { type: String, trim: true, default: "" },
    translatedFrom: { type: String, trim: true, default: "" },
    rating: { type: Number, min: 0, max: 5, default: null },
    verifiedPurchase: { type: Boolean, default: false },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    consumerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Consumer",
      required: true,
      index: true,
    },
    nearDuplicateScore: { type: Number, min: 0, max: 1, default: 0 },
    nearDuplicateCluster: { type: String, default: "" },
    flags: {
      isDuplicate: { type: Boolean, default: false },
      isNearDuplicate: { type: Boolean, default: false },
      isSpamSuspected: { type: Boolean, default: false },
      hasSarcasm: { type: Boolean, default: false },
      isAmbiguous: { type: Boolean, default: false },
    },
    analysisStatus: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    analysisError: { type: String, default: "" },
    sarcasmScore: { type: Number, min: 0, max: 1, default: 0 },
    sarcasmExplanation: { type: String, default: "" },
    isFake: { type: Boolean, default: false },
    fakeConfidence: { type: Number, min: 0, max: 1, default: 0 },
    fakeReason: { type: String, default: "" },
    spamLikelihood: { type: Number, min: 0, max: 1, default: 0 },
    overallSentiment: {
      type: String,
      enum: ["positive", "negative", "neutral", "mixed", "ambiguous"],
      default: "neutral",
    },
    featureSentiments: { type: [featureSentimentSchema], default: [] },
    actionableInsights: { type: [String], default: [] },
    reviewTrustScore: { type: Number, min: 0, max: 100, default: 0 },
    trustBreakdown: {
      fakePenalty: { type: Number, default: 0 },
      sarcasmPenalty: { type: Number, default: 0 },
      spamPenalty: { type: Number, default: 0 },
      ambiguityPenalty: { type: Number, default: 0 },
      verifiedBonus: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

reviewSchema.index({ productId: 1, normalizedTextHash: 1 });
reviewSchema.index({ createdAt: -1 });

const Review = mongoose.model("Review", reviewSchema);

module.exports = { Review };
