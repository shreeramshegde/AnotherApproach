const { clamp } = require("../utils/parsers");
const store = require("../store/memoryStore");

function computeReviewTrust({
  fakeConfidence,
  sarcasmScore,
  spamLikelihood,
  isAmbiguous,
  verifiedPurchase,
}) {
  const fakePenalty = fakeConfidence * 55;
  const sarcasmPenalty = sarcasmScore * 15;
  const spamPenalty = spamLikelihood * 25;
  const ambiguityPenalty = isAmbiguous ? 10 : 0;
  const verifiedBonus = verifiedPurchase ? 8 : 0;

  const score = clamp(
    100 - fakePenalty - sarcasmPenalty - spamPenalty - ambiguityPenalty + verifiedBonus,
    0,
    100
  );

  return {
    score,
    breakdown: {
      fakePenalty,
      sarcasmPenalty,
      spamPenalty,
      ambiguityPenalty,
      verifiedBonus,
    },
  };
}

function refreshProductAggregate(productId) {
  const product = store.getProductById(productId);
  if (!product) {
    return;
  }

  const reviews = store
    .getAllReviews()
    .filter((item) => item.productId === productId && item.analysisStatus === "completed");

  if (reviews.length === 0) {
    Object.assign(product, {
      reviewCount: 0,
      avgTrust: 0,
      fakeRate: 0,
      sarcasmRate: 0,
      productTrustScore: 0,
      featureScores: {},
      lastUpdatedAt: new Date(),
      updatedAt: new Date(),
    });
    return;
  }

  const reviewCount = reviews.length;
  const avgTrust =
    reviews.reduce((acc, item) => acc + (item.reviewTrustScore || 0), 0) / reviewCount;
  const fakeRate =
    reviews.reduce((acc, item) => acc + (item.isFake ? 1 : 0), 0) / reviewCount;
  const sarcasmRate =
    reviews.reduce((acc, item) => acc + ((item.sarcasmScore || 0) >= 0.55 ? 1 : 0), 0) /
    reviewCount;

  const featureStats = new Map();
  for (const review of reviews) {
    for (const feature of review.featureSentiments || []) {
      if (!feature?.feature) {
        continue;
      }
      const score =
        feature.sentiment === "positive" ? 1 : feature.sentiment === "negative" ? -1 : 0;
      const current = featureStats.get(feature.feature) || { total: 0, count: 0 };
      current.total += score;
      current.count += 1;
      featureStats.set(feature.feature, current);
    }
  }

  const featureScores = {};
  for (const [featureName, stat] of featureStats.entries()) {
    if (stat.count > 0) {
      featureScores[featureName] = Number((stat.total / stat.count).toFixed(3));
    }
  }

  const productTrustScore = clamp(
    avgTrust * (1 - fakeRate * 0.4) * (1 - sarcasmRate * 0.1),
    0,
    100
  );

  Object.assign(product, {
    reviewCount,
    avgTrust,
    fakeRate,
    sarcasmRate,
    productTrustScore,
    featureScores,
    lastUpdatedAt: new Date(),
    updatedAt: new Date(),
  });
}

function refreshConsumerAggregate(consumerId) {
  const consumer = store.getConsumerById(consumerId);
  if (!consumer) {
    return;
  }

  const reviews = store
    .getAllReviews()
    .filter((item) => item.consumerId === consumerId && item.analysisStatus === "completed");

  if (reviews.length === 0) {
    Object.assign(consumer, {
      reviewCount: 0,
      avgTrust: 0,
      consumerTrustScore: 0,
      suspiciousReviewRate: 0,
      riskFlags: [],
      lastUpdatedAt: new Date(),
      updatedAt: new Date(),
    });
    return;
  }

  const reviewCount = reviews.length;
  const avgTrust =
    reviews.reduce((acc, item) => acc + (item.reviewTrustScore || 0), 0) / reviewCount;
  const fakeRate =
    reviews.reduce((acc, item) => acc + (item.isFake ? 1 : 0), 0) / reviewCount;
  const spamRate =
    reviews.reduce((acc, item) => acc + (item.flags?.isSpamSuspected ? 1 : 0), 0) / reviewCount;

  const suspiciousReviewRate = (fakeRate + spamRate) / 2;
  const consumerTrustScore = clamp(avgTrust * (1 - suspiciousReviewRate * 0.5), 0, 100);

  const riskFlags = [];
  if (fakeRate >= 0.35) {
    riskFlags.push("high_fake_review_probability");
  }
  if (spamRate >= 0.35) {
    riskFlags.push("repetitive_or_spammy_patterns");
  }
  if (reviewCount >= 10 && consumerTrustScore < 55) {
    riskFlags.push("low_historical_trust");
  }

  Object.assign(consumer, {
    reviewCount,
    avgTrust,
    consumerTrustScore,
    suspiciousReviewRate,
    riskFlags,
    lastUpdatedAt: new Date(),
    updatedAt: new Date(),
  });
}

function refreshDailyMetric() {
  return;
}

module.exports = {
  computeReviewTrust,
  refreshProductAggregate,
  refreshConsumerAggregate,
  refreshDailyMetric,
};
