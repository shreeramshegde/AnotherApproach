const crypto = require("crypto");
const { getDatabase } = require("../db/sqlite");

const db = getDatabase();

function nowMs() {
  return Date.now();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function parseJson(text, fallback) {
  if (!text) {
    return fallback;
  }
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function normalizeName(value) {
  return (value || "").trim().toLowerCase();
}

function toDate(value) {
  return value ? new Date(value) : null;
}

function rowToProduct(row) {
  if (!row) return null;
  return {
    _id: row.id,
    name: row.name,
    category: row.category,
    reviewCount: Number(row.reviewCount || 0),
    fakeRate: Number(row.fakeRate || 0),
    sarcasmRate: Number(row.sarcasmRate || 0),
    avgTrust: Number(row.avgTrust || 0),
    productTrustScore: Number(row.productTrustScore || 0),
    featureScores: parseJson(row.featureScores, {}),
    lastUpdatedAt: toDate(row.lastUpdatedAt),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

function rowToConsumer(row) {
  if (!row) return null;
  return {
    _id: row.id,
    name: row.name,
    externalId: row.externalId || "",
    verified: Boolean(row.verified),
    reviewCount: Number(row.reviewCount || 0),
    avgTrust: Number(row.avgTrust || 0),
    consumerTrustScore: Number(row.consumerTrustScore || 0),
    suspiciousReviewRate: Number(row.suspiciousReviewRate || 0),
    riskFlags: parseJson(row.riskFlags, []),
    lastUpdatedAt: toDate(row.lastUpdatedAt),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

function rowToReview(row) {
  if (!row) return null;
  return {
    _id: row.id,
    source: row.source,
    externalId: row.externalId || "",
    title: row.title || "",
    text: row.text,
    normalizedTextHash: row.normalizedTextHash,
    language: row.language || "unknown",
    translatedText: row.translatedText || "",
    translatedFrom: row.translatedFrom || "",
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    verifiedPurchase: Boolean(row.verifiedPurchase),
    productId: row.productId,
    consumerId: row.consumerId,
    nearDuplicateScore: Number(row.nearDuplicateScore || 0),
    nearDuplicateCluster: row.nearDuplicateCluster || "",
    flags: parseJson(row.flags, {
      isDuplicate: false,
      isNearDuplicate: false,
      isSpamSuspected: false,
      hasSarcasm: false,
      isAmbiguous: false,
    }),
    analysisStatus: row.analysisStatus || "pending",
    analysisError: row.analysisError || "",
    sarcasmScore: Number(row.sarcasmScore || 0),
    sarcasmExplanation: row.sarcasmExplanation || "",
    isFake: Boolean(row.isFake),
    fakeConfidence: Number(row.fakeConfidence || 0),
    fakeReason: row.fakeReason || "",
    spamLikelihood: Number(row.spamLikelihood || 0),
    overallSentiment: row.overallSentiment || "neutral",
    featureSentiments: parseJson(row.featureSentiments, []),
    actionableInsights: parseJson(row.actionableInsights, []),
    reviewTrustScore: Number(row.reviewTrustScore || 0),
    trustBreakdown: parseJson(row.trustBreakdown, {
      fakePenalty: 0,
      sarcasmPenalty: 0,
      spamPenalty: 0,
      ambiguityPenalty: 0,
      verifiedBonus: 0,
    }),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

function getOrCreateProduct({ name, category }) {
  const safeName = (name || "Unknown Product").trim();
  const safeCategory = (category || "general").trim();
  const existing = db
    .prepare("SELECT * FROM products WHERE name = ? AND category = ?")
    .get(safeName, safeCategory);
  if (existing) {
    return rowToProduct(existing);
  }

  const timestamp = nowMs();
  const id = createId("prd");
  db.prepare(
    `INSERT INTO products (
      id, name, category, reviewCount, fakeRate, sarcasmRate, avgTrust, productTrustScore,
      featureScores, lastUpdatedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, 0, 0, 0, 0, 0, '{}', NULL, ?, ?)`
  ).run(id, safeName, safeCategory, timestamp, timestamp);

  return rowToProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(id));
}

function getOrCreateConsumer({ name, externalId, verified }) {
  const safeExternalId = (externalId || "").trim();
  const safeName = (name || "Anonymous").trim();
  const verifiedInt = verified ? 1 : 0;

  if (!safeExternalId) {
    const rows = db
      .prepare("SELECT * FROM consumers WHERE externalId = ''")
      .all();
    const existing = rows.find(
      (item) => normalizeName(item.name) === normalizeName(safeName)
    );
    if (existing) {
      db.prepare("UPDATE consumers SET verified = ?, updatedAt = ? WHERE id = ?").run(
        verifiedInt,
        nowMs(),
        existing.id
      );
      return rowToConsumer(db.prepare("SELECT * FROM consumers WHERE id = ?").get(existing.id));
    }

    const id = createId("cns");
    const timestamp = nowMs();
    db.prepare(
      `INSERT INTO consumers (
        id, name, externalId, verified, reviewCount, avgTrust, consumerTrustScore,
        suspiciousReviewRate, riskFlags, lastUpdatedAt, createdAt, updatedAt
      ) VALUES (?, ?, '', ?, 0, 0, 0, 0, '[]', NULL, ?, ?)`
    ).run(id, safeName, verifiedInt, timestamp, timestamp);

    return rowToConsumer(db.prepare("SELECT * FROM consumers WHERE id = ?").get(id));
  }

  const existingByExternalId = db
    .prepare("SELECT * FROM consumers WHERE externalId = ?")
    .get(safeExternalId);
  if (existingByExternalId) {
    db.prepare("UPDATE consumers SET verified = ?, updatedAt = ? WHERE id = ?").run(
      verifiedInt,
      nowMs(),
      existingByExternalId.id
    );
    return rowToConsumer(
      db.prepare("SELECT * FROM consumers WHERE id = ?").get(existingByExternalId.id)
    );
  }

  const id = createId("cns");
  const timestamp = nowMs();
  db.prepare(
    `INSERT INTO consumers (
      id, name, externalId, verified, reviewCount, avgTrust, consumerTrustScore,
      suspiciousReviewRate, riskFlags, lastUpdatedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, '[]', NULL, ?, ?)`
  ).run(id, safeName, safeExternalId, verifiedInt, timestamp, timestamp);

  return rowToConsumer(db.prepare("SELECT * FROM consumers WHERE id = ?").get(id));
}

function addReview(payload) {
  const productExists = db.prepare("SELECT 1 FROM products WHERE id = ? LIMIT 1").get(payload.productId);
  if (!productExists) {
    throw new Error(`Cannot add review: product does not exist (${payload.productId}).`);
  }

  const consumerExists = db
    .prepare("SELECT 1 FROM consumers WHERE id = ? LIMIT 1")
    .get(payload.consumerId);
  if (!consumerExists) {
    throw new Error(`Cannot add review: consumer does not exist (${payload.consumerId}).`);
  }

  const id = createId("rev");
  const timestamp = nowMs();

  db.prepare(
    `INSERT INTO reviews (
      id, source, externalId, title, text, normalizedTextHash, language, translatedText, translatedFrom,
      rating, verifiedPurchase, productId, consumerId, nearDuplicateScore, nearDuplicateCluster, flags,
      analysisStatus, analysisError, sarcasmScore, sarcasmExplanation, isFake, fakeConfidence, fakeReason,
      spamLikelihood, overallSentiment, featureSentiments, actionableInsights, reviewTrustScore,
      trustBreakdown, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    payload.source || "manual",
    payload.externalId || "",
    payload.title || "",
    payload.text || "",
    payload.normalizedTextHash,
    payload.language || "unknown",
    payload.translatedText || "",
    payload.translatedFrom || "",
    payload.rating ?? null,
    payload.verifiedPurchase ? 1 : 0,
    payload.productId,
    payload.consumerId,
    payload.nearDuplicateScore || 0,
    payload.nearDuplicateCluster || "",
    JSON.stringify(
      payload.flags || {
        isDuplicate: false,
        isNearDuplicate: false,
        isSpamSuspected: false,
        hasSarcasm: false,
        isAmbiguous: false,
      }
    ),
    payload.analysisStatus || "pending",
    payload.analysisError || "",
    payload.sarcasmScore || 0,
    payload.sarcasmExplanation || "",
    payload.isFake ? 1 : 0,
    payload.fakeConfidence || 0,
    payload.fakeReason || "",
    payload.spamLikelihood || 0,
    payload.overallSentiment || "neutral",
    JSON.stringify(payload.featureSentiments || []),
    JSON.stringify(payload.actionableInsights || []),
    payload.reviewTrustScore || 0,
    JSON.stringify(
      payload.trustBreakdown || {
        fakePenalty: 0,
        sarcasmPenalty: 0,
        spamPenalty: 0,
        ambiguityPenalty: 0,
        verifiedBonus: 0,
      }
    ),
    timestamp,
    timestamp
  );

  return getReviewById(id);
}

function addModelRun(modelRun) {
  const reviewExists = db
    .prepare("SELECT 1 FROM reviews WHERE id = ? LIMIT 1")
    .get(modelRun.reviewId);
  if (!reviewExists) {
    throw new Error(`Cannot add model run: review does not exist (${modelRun.reviewId}).`);
  }

  const id = createId("run");
  const timestamp = nowMs();

  db.prepare(
    `INSERT INTO model_runs (
      id, reviewId, provider, model, promptVersion, status, latencyMs, requestHash,
      responsePayload, errorMessage, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    modelRun.reviewId,
    modelRun.provider,
    modelRun.model,
    modelRun.promptVersion,
    modelRun.status,
    modelRun.latencyMs || 0,
    modelRun.requestHash,
    modelRun.responsePayload ? JSON.stringify(modelRun.responsePayload) : null,
    modelRun.errorMessage || "",
    timestamp,
    timestamp
  );

  return { _id: id, ...modelRun, createdAt: new Date(timestamp), updatedAt: new Date(timestamp) };
}

function getReviewById(reviewId) {
  return rowToReview(db.prepare("SELECT * FROM reviews WHERE id = ?").get(reviewId));
}

function getProductById(productId) {
  return rowToProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(productId));
}

function getConsumerById(consumerId) {
  return rowToConsumer(db.prepare("SELECT * FROM consumers WHERE id = ?").get(consumerId));
}

function getAllReviews() {
  return db.prepare("SELECT * FROM reviews").all().map(rowToReview);
}

function getAllProducts() {
  return db.prepare("SELECT * FROM products").all().map(rowToProduct);
}

function getAllConsumers() {
  return db.prepare("SELECT * FROM consumers").all().map(rowToConsumer);
}

function getCompletedReviewsByProduct(productId) {
  return db
    .prepare(
      "SELECT * FROM reviews WHERE productId = ? AND analysisStatus = 'completed'"
    )
    .all(productId)
    .map(rowToReview);
}

function getCompletedReviewsByConsumer(consumerId) {
  return db
    .prepare(
      "SELECT * FROM reviews WHERE consumerId = ? AND analysisStatus = 'completed'"
    )
    .all(consumerId)
    .map(rowToReview);
}

function getRecentReviewsByProduct(productId, limit = 40) {
  return db
    .prepare("SELECT * FROM reviews WHERE productId = ? ORDER BY createdAt DESC LIMIT ?")
    .all(productId, limit)
    .map(rowToReview);
}

function existsDuplicateReview(productId, normalizedTextHash) {
  const row = db
    .prepare(
      "SELECT 1 FROM reviews WHERE productId = ? AND normalizedTextHash = ? LIMIT 1"
    )
    .get(productId, normalizedTextHash);
  return Boolean(row);
}

function updateProductAggregate(productId, payload) {
  db.prepare(
    `UPDATE products
     SET reviewCount = ?, avgTrust = ?, fakeRate = ?, sarcasmRate = ?, productTrustScore = ?,
         featureScores = ?, lastUpdatedAt = ?, updatedAt = ?
     WHERE id = ?`
  ).run(
    payload.reviewCount || 0,
    payload.avgTrust || 0,
    payload.fakeRate || 0,
    payload.sarcasmRate || 0,
    payload.productTrustScore || 0,
    JSON.stringify(payload.featureScores || {}),
    payload.lastUpdatedAt ? payload.lastUpdatedAt.getTime() : null,
    nowMs(),
    productId
  );
}

function updateConsumerAggregate(consumerId, payload) {
  db.prepare(
    `UPDATE consumers
     SET reviewCount = ?, avgTrust = ?, consumerTrustScore = ?, suspiciousReviewRate = ?,
         riskFlags = ?, lastUpdatedAt = ?, updatedAt = ?
     WHERE id = ?`
  ).run(
    payload.reviewCount || 0,
    payload.avgTrust || 0,
    payload.consumerTrustScore || 0,
    payload.suspiciousReviewRate || 0,
    JSON.stringify(payload.riskFlags || []),
    payload.lastUpdatedAt ? payload.lastUpdatedAt.getTime() : null,
    nowMs(),
    consumerId
  );
}

function updateReviewAnalysis(reviewId, payload) {
  db.prepare(
    `UPDATE reviews
     SET translatedText = ?, translatedFrom = ?, sarcasmScore = ?, sarcasmExplanation = ?,
         flags = ?, isFake = ?, fakeConfidence = ?, fakeReason = ?, spamLikelihood = ?,
         overallSentiment = ?, featureSentiments = ?, actionableInsights = ?,
         reviewTrustScore = ?, trustBreakdown = ?, analysisStatus = ?, analysisError = ?,
         updatedAt = ?
     WHERE id = ?`
  ).run(
    payload.translatedText || "",
    payload.translatedFrom || "",
    payload.sarcasmScore || 0,
    payload.sarcasmExplanation || "",
    JSON.stringify(payload.flags || {}),
    payload.isFake ? 1 : 0,
    payload.fakeConfidence || 0,
    payload.fakeReason || "",
    payload.spamLikelihood || 0,
    payload.overallSentiment || "neutral",
    JSON.stringify(payload.featureSentiments || []),
    JSON.stringify(payload.actionableInsights || []),
    payload.reviewTrustScore || 0,
    JSON.stringify(payload.trustBreakdown || {}),
    payload.analysisStatus || "pending",
    payload.analysisError || "",
    nowMs(),
    reviewId
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
  updateProductAggregate,
  updateConsumerAggregate,
  updateReviewAnalysis,
};
