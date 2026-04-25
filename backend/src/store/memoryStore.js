const crypto = require("crypto");
const { getDatabase } = require("../db/mongodb");

function now() {
  return new Date();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizeName(value) {
  return (value || "").trim().toLowerCase();
}

function getCollections() {
  const db = getDatabase();
  return {
    products: db.collection("products"),
    consumers: db.collection("consumers"),
    reviews: db.collection("reviews"),
    modelRuns: db.collection("model_runs"),
  };
}

async function getOrCreateProduct({ name, category }) {
  const { products } = getCollections();
  const safeName = (name || "Unknown Product").trim();
  const safeCategory = (category || "general").trim();

  const existing = await products.findOne({ name: safeName, category: safeCategory });
  if (existing) {
    return existing;
  }

  const timestamp = now();
  const created = {
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
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await products.insertOne(created);
  return created;
}

async function getOrCreateConsumer({ name, externalId, verified }) {
  const { consumers } = getCollections();
  const safeExternalId = (externalId || "").trim();
  const safeName = (name || "Anonymous").trim();
  const verifiedBool = Boolean(verified);

  if (!safeExternalId) {
    const existingWithoutExternal = await consumers
      .find({
        $or: [{ externalId: "" }, { externalId: { $exists: false } }],
      })
      .toArray();
    const existing = existingWithoutExternal.find(
      (item) => normalizeName(item.name) === normalizeName(safeName)
    );
    if (existing) {
      await consumers.updateOne(
        { _id: existing._id },
        {
          $set: { verified: verifiedBool, updatedAt: now() },
          $unset: { externalId: "" },
        }
      );
      return consumers.findOne({ _id: existing._id });
    }

    const timestamp = now();
    const created = {
      _id: createId("cns"),
      name: safeName,
      verified: verifiedBool,
      reviewCount: 0,
      avgTrust: 0,
      consumerTrustScore: 0,
      suspiciousReviewRate: 0,
      riskFlags: [],
      lastUpdatedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await consumers.insertOne(created);
    return created;
  }

  const existingByExternalId = await consumers.findOne({ externalId: safeExternalId });
  if (existingByExternalId) {
    await consumers.updateOne(
      { _id: existingByExternalId._id },
      { $set: { verified: verifiedBool, updatedAt: now() } }
    );
    return consumers.findOne({ _id: existingByExternalId._id });
  }

  const timestamp = now();
  const created = {
    _id: createId("cns"),
    name: safeName,
    externalId: safeExternalId,
    verified: verifiedBool,
    reviewCount: 0,
    avgTrust: 0,
    consumerTrustScore: 0,
    suspiciousReviewRate: 0,
    riskFlags: [],
    lastUpdatedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await consumers.insertOne(created);
  return created;
}

async function addReview(payload) {
  const { products, consumers, reviews } = getCollections();

  const [productExists, consumerExists] = await Promise.all([
    products.findOne({ _id: payload.productId }, { projection: { _id: 1 } }),
    consumers.findOne({ _id: payload.consumerId }, { projection: { _id: 1 } }),
  ]);
  if (!productExists) {
    throw new Error(`Cannot add review: product does not exist (${payload.productId}).`);
  }
  if (!consumerExists) {
    throw new Error(`Cannot add review: consumer does not exist (${payload.consumerId}).`);
  }

  const timestamp = now();
  const created = {
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
      isBotLikely: false,
      hasSarcasm: false,
      needsHumanReview: false,
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
  await reviews.insertOne(created);
  return created;
}

async function addModelRun(modelRun) {
  const { reviews, modelRuns } = getCollections();
  const reviewExists = await reviews.findOne({ _id: modelRun.reviewId }, { projection: { _id: 1 } });
  if (!reviewExists) {
    throw new Error(`Cannot add model run: review does not exist (${modelRun.reviewId}).`);
  }

  const timestamp = now();
  const created = {
    _id: createId("run"),
    reviewId: modelRun.reviewId,
    provider: modelRun.provider,
    model: modelRun.model,
    promptVersion: modelRun.promptVersion,
    status: modelRun.status,
    latencyMs: modelRun.latencyMs || 0,
    requestHash: modelRun.requestHash,
    responsePayload: modelRun.responsePayload || null,
    errorMessage: modelRun.errorMessage || "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await modelRuns.insertOne(created);
  return created;
}

async function getReviewById(reviewId) {
  const { reviews } = getCollections();
  return reviews.findOne({ _id: reviewId });
}

async function getProductById(productId) {
  const { products } = getCollections();
  return products.findOne({ _id: productId });
}

async function getConsumerById(consumerId) {
  const { consumers } = getCollections();
  return consumers.findOne({ _id: consumerId });
}

async function getAllReviews() {
  const { reviews } = getCollections();
  return reviews.find({}).toArray();
}

async function getAllProducts() {
  const { products } = getCollections();
  return products.find({}).toArray();
}

async function getAllConsumers() {
  const { consumers } = getCollections();
  return consumers.find({}).toArray();
}

async function getCompletedReviewsByProduct(productId) {
  const { reviews } = getCollections();
  return reviews.find({ productId, analysisStatus: "completed" }).toArray();
}

async function getCompletedReviewsByConsumer(consumerId) {
  const { reviews } = getCollections();
  return reviews.find({ consumerId, analysisStatus: "completed" }).toArray();
}

async function getRecentReviewsByProduct(productId, limit = 40) {
  const { reviews } = getCollections();
  return reviews.find({ productId }).sort({ createdAt: -1 }).limit(limit).toArray();
}

async function existsDuplicateReview(productId, normalizedTextHash) {
  const { reviews } = getCollections();
  const row = await reviews.findOne(
    { productId, normalizedTextHash },
    { projection: { _id: 1 } }
  );
  return Boolean(row);
}

async function findDuplicateReview(productId, normalizedTextHash) {
  const { reviews } = getCollections();
  return reviews.findOne({ productId, normalizedTextHash });
}

async function updateProductAggregate(productId, payload) {
  const { products } = getCollections();
  await products.updateOne(
    { _id: productId },
    {
      $set: {
        reviewCount: payload.reviewCount || 0,
        avgTrust: payload.avgTrust || 0,
        fakeRate: payload.fakeRate || 0,
        sarcasmRate: payload.sarcasmRate || 0,
        productTrustScore: payload.productTrustScore || 0,
        featureScores: payload.featureScores || {},
        lastUpdatedAt: payload.lastUpdatedAt || null,
        updatedAt: now(),
      },
    }
  );
}

async function updateConsumerAggregate(consumerId, payload) {
  const { consumers } = getCollections();
  await consumers.updateOne(
    { _id: consumerId },
    {
      $set: {
        reviewCount: payload.reviewCount || 0,
        avgTrust: payload.avgTrust || 0,
        consumerTrustScore: payload.consumerTrustScore || 0,
        suspiciousReviewRate: payload.suspiciousReviewRate || 0,
        riskFlags: payload.riskFlags || [],
        lastUpdatedAt: payload.lastUpdatedAt || null,
        updatedAt: now(),
      },
    }
  );
}

async function updateReviewAnalysis(reviewId, payload) {
  const { reviews } = getCollections();
  await reviews.updateOne(
    { _id: reviewId },
    {
      $set: {
        translatedText: payload.translatedText || "",
        translatedFrom: payload.translatedFrom || "",
        sarcasmScore: payload.sarcasmScore || 0,
        sarcasmExplanation: payload.sarcasmExplanation || "",
        flags: payload.flags || {},
        isFake: Boolean(payload.isFake),
        fakeConfidence: payload.fakeConfidence || 0,
        fakeReason: payload.fakeReason || "",
        spamLikelihood: payload.spamLikelihood || 0,
        overallSentiment: payload.overallSentiment || "neutral",
        featureSentiments: payload.featureSentiments || [],
        actionableInsights: payload.actionableInsights || [],
        reviewTrustScore: payload.reviewTrustScore || 0,
        trustBreakdown: payload.trustBreakdown || {},
        analysisStatus: payload.analysisStatus || "pending",
        analysisError: payload.analysisError || "",
        updatedAt: now(),
      },
    }
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
  getCompletedReviewsByProduct,
  getCompletedReviewsByConsumer,
  getRecentReviewsByProduct,
  existsDuplicateReview,
  findDuplicateReview,
  updateProductAggregate,
  updateConsumerAggregate,
  updateReviewAnalysis,
};
