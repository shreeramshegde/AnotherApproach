const crypto = require("crypto");

const state = {
  reviews: [],
  products: [],
  consumers: [],
  modelRuns: [],
};

const MAX_IN_MEMORY_REVIEWS = Number.parseInt(process.env.MAX_IN_MEMORY_REVIEWS || "10000", 10);
const MAX_IN_MEMORY_MODEL_RUNS = Number.parseInt(
  process.env.MAX_IN_MEMORY_MODEL_RUNS || "50000",
  10
);

function now() {
  return new Date();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizeName(value) {
  return (value || "").trim().toLowerCase();
}

function enforceCap(list, cap) {
  while (list.length >= cap) {
    list.shift();
  }
}

function getOrCreateProduct({ name, category }) {
  const safeName = (name || "Unknown Product").trim();
  const safeCategory = (category || "general").trim();
  let product = state.products.find(
    (item) => item.name === safeName && item.category === safeCategory
  );
  if (!product) {
    product = {
      _id: createId("prd"),
      name: safeName,
      category: safeCategory,
      reviewCount: 0,
      fakeRate: 0,
      sarcasmRate: 0,
      avgTrust: 0,
      productTrustScore: 0,
      featureScores: {},
      lastUpdatedAt: null,
      createdAt: now(),
      updatedAt: now(),
    };
    state.products.push(product);
  }
  return product;
}

function getOrCreateConsumer({ name, externalId, verified }) {
  const safeExternalId = (externalId || "").trim();
  const safeName = (name || "Anonymous").trim();
  if (!safeExternalId) {
    let consumer = state.consumers.find(
      (item) =>
        !item.externalId && normalizeName(item.name) === normalizeName(safeName)
    );
    if (!consumer) {
      consumer = {
        _id: createId("cns"),
        name: safeName,
        externalId: "",
        verified: Boolean(verified),
        reviewCount: 0,
        avgTrust: 0,
        consumerTrustScore: 0,
        suspiciousReviewRate: 0,
        riskFlags: [],
        lastUpdatedAt: null,
        createdAt: now(),
        updatedAt: now(),
      };
      state.consumers.push(consumer);
    } else {
      consumer.verified = Boolean(verified);
      consumer.updatedAt = now();
    }
    return consumer;
  }

  let consumer = state.consumers.find((item) => item.externalId === safeExternalId);
  if (!consumer) {
    consumer = {
      _id: createId("cns"),
      name: safeName,
      externalId: safeExternalId,
      verified: Boolean(verified),
      reviewCount: 0,
      avgTrust: 0,
      consumerTrustScore: 0,
      suspiciousReviewRate: 0,
      riskFlags: [],
      lastUpdatedAt: null,
      createdAt: now(),
      updatedAt: now(),
    };
    state.consumers.push(consumer);
  } else {
    consumer.verified = Boolean(verified);
    consumer.updatedAt = now();
  }
  return consumer;
}

function addReview(payload) {
  enforceCap(state.reviews, MAX_IN_MEMORY_REVIEWS);
  const timestamp = now();
  const review = {
    _id: createId("rev"),
    source: payload.source || "manual",
    externalId: payload.externalId || "",
    title: payload.title || "",
    text: payload.text || "",
    normalizedTextHash: payload.normalizedTextHash,
    language: payload.language || "unknown",
    translatedText: payload.translatedText || "",
    translatedFrom: payload.translatedFrom || "",
    rating: payload.rating ?? null,
    verifiedPurchase: Boolean(payload.verifiedPurchase),
    productId: payload.productId,
    consumerId: payload.consumerId,
    nearDuplicateScore: payload.nearDuplicateScore || 0,
    nearDuplicateCluster: payload.nearDuplicateCluster || "",
    flags: payload.flags || {
      isDuplicate: false,
      isNearDuplicate: false,
      isSpamSuspected: false,
      hasSarcasm: false,
      isAmbiguous: false,
    },
    analysisStatus: payload.analysisStatus || "pending",
    analysisError: payload.analysisError || "",
    sarcasmScore: payload.sarcasmScore || 0,
    sarcasmExplanation: payload.sarcasmExplanation || "",
    isFake: Boolean(payload.isFake),
    fakeConfidence: payload.fakeConfidence || 0,
    fakeReason: payload.fakeReason || "",
    spamLikelihood: payload.spamLikelihood || 0,
    overallSentiment: payload.overallSentiment || "neutral",
    featureSentiments: payload.featureSentiments || [],
    actionableInsights: payload.actionableInsights || [],
    reviewTrustScore: payload.reviewTrustScore || 0,
    trustBreakdown: payload.trustBreakdown || {
      fakePenalty: 0,
      sarcasmPenalty: 0,
      spamPenalty: 0,
      ambiguityPenalty: 0,
      verifiedBonus: 0,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  state.reviews.push(review);
  return review;
}

function addModelRun(modelRun) {
  enforceCap(state.modelRuns, MAX_IN_MEMORY_MODEL_RUNS);
  const timestamp = now();
  const entry = {
    _id: createId("run"),
    ...modelRun,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  state.modelRuns.push(entry);
  return entry;
}

function getReviewById(reviewId) {
  return state.reviews.find((item) => item._id === reviewId) || null;
}

function getProductById(productId) {
  return state.products.find((item) => item._id === productId) || null;
}

function getConsumerById(consumerId) {
  return state.consumers.find((item) => item._id === consumerId) || null;
}

function getAllReviews() {
  return state.reviews;
}

function getAllProducts() {
  return state.products;
}

function getAllConsumers() {
  return state.consumers;
}

function getRecentReviewsByProduct(productId, limit = 40) {
  return state.reviews
    .filter((item) => item.productId === productId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

function existsDuplicateReview(productId, normalizedTextHash) {
  return state.reviews.some(
    (item) => item.productId === productId && item.normalizedTextHash === normalizedTextHash
  );
}

module.exports = {
  getOrCreateProduct,
  getOrCreateConsumer,
  addReview,
  addModelRun,
  getReviewById,
  getProductById,
  getConsumerById,
  getAllReviews,
  getAllProducts,
  getAllConsumers,
  getRecentReviewsByProduct,
  existsDuplicateReview,
};
