const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { sqliteDbPath } = require("../config/env");

let dbInstance = null;

function resolveDbPath() {
  if (path.isAbsolute(sqliteDbPath)) {
    return sqliteDbPath;
  }
  return path.resolve(__dirname, "..", "..", sqliteDbPath);
}

function initializeDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  const filePath = resolveDbPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      reviewCount INTEGER NOT NULL DEFAULT 0,
      fakeRate REAL NOT NULL DEFAULT 0,
      sarcasmRate REAL NOT NULL DEFAULT 0,
      avgTrust REAL NOT NULL DEFAULT 0,
      productTrustScore REAL NOT NULL DEFAULT 0,
      featureScores TEXT NOT NULL DEFAULT '{}',
      lastUpdatedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      UNIQUE(name, category)
    );

    CREATE TABLE IF NOT EXISTS consumers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      externalId TEXT NOT NULL DEFAULT '',
      verified INTEGER NOT NULL DEFAULT 0,
      reviewCount INTEGER NOT NULL DEFAULT 0,
      avgTrust REAL NOT NULL DEFAULT 0,
      consumerTrustScore REAL NOT NULL DEFAULT 0,
      suspiciousReviewRate REAL NOT NULL DEFAULT 0,
      riskFlags TEXT NOT NULL DEFAULT '[]',
      lastUpdatedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_consumers_externalId
      ON consumers(externalId) WHERE externalId <> '';

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      externalId TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      normalizedTextHash TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'unknown',
      translatedText TEXT NOT NULL DEFAULT '',
      translatedFrom TEXT NOT NULL DEFAULT '',
      rating REAL,
      verifiedPurchase INTEGER NOT NULL DEFAULT 0,
      productId TEXT NOT NULL,
      consumerId TEXT NOT NULL,
      nearDuplicateScore REAL NOT NULL DEFAULT 0,
      nearDuplicateCluster TEXT NOT NULL DEFAULT '',
      flags TEXT NOT NULL DEFAULT '{}',
      analysisStatus TEXT NOT NULL DEFAULT 'pending',
      analysisError TEXT NOT NULL DEFAULT '',
      sarcasmScore REAL NOT NULL DEFAULT 0,
      sarcasmExplanation TEXT NOT NULL DEFAULT '',
      isFake INTEGER NOT NULL DEFAULT 0,
      fakeConfidence REAL NOT NULL DEFAULT 0,
      fakeReason TEXT NOT NULL DEFAULT '',
      spamLikelihood REAL NOT NULL DEFAULT 0,
      overallSentiment TEXT NOT NULL DEFAULT 'neutral',
      featureSentiments TEXT NOT NULL DEFAULT '[]',
      actionableInsights TEXT NOT NULL DEFAULT '[]',
      reviewTrustScore REAL NOT NULL DEFAULT 0,
      trustBreakdown TEXT NOT NULL DEFAULT '{}',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY(productId) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY(consumerId) REFERENCES consumers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_product_hash
      ON reviews(productId, normalizedTextHash);
    CREATE INDEX IF NOT EXISTS idx_reviews_product_created
      ON reviews(productId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_reviews_created
      ON reviews(createdAt DESC);

    CREATE TABLE IF NOT EXISTS model_runs (
      id TEXT PRIMARY KEY,
      reviewId TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      promptVersion TEXT NOT NULL,
      status TEXT NOT NULL,
      latencyMs REAL NOT NULL DEFAULT 0,
      requestHash TEXT NOT NULL,
      responsePayload TEXT,
      errorMessage TEXT NOT NULL DEFAULT '',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY(reviewId) REFERENCES reviews(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_model_runs_review
      ON model_runs(reviewId, createdAt DESC);
  `);

  dbInstance = db;
  return dbInstance;
}

function getDatabase() {
  return initializeDatabase();
}

module.exports = {
  initializeDatabase,
  getDatabase,
};
