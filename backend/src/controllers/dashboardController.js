const env = require("../config/env");
const store = require("../store/memoryStore");
const { refreshProductAggregate, refreshConsumerAggregate } = require("../services/trustService");

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.isClientSafe = true;
  return error;
}

function toDayString(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    throw badRequest("Date must be in YYYY-MM-DD format.");
  }
  return date.toISOString().slice(0, 10);
}

function getCompletedReviews() {
  return store
    .getAllReviews()
    .filter((item) => item.analysisStatus === "completed");
}

async function getOverview(req, res, next) {
  try {
    const allReviews = store.getAllReviews();
    const completed = getCompletedReviews();
    const analyzedReviews = completed.length;
    const denominator = analyzedReviews || 1;

    const fakeCount = completed.filter((item) => item.isFake).length;
    const sarcasticCount = completed.filter((item) => (item.sarcasmScore || 0) >= 0.55).length;
    const ambiguousCount = completed.filter((item) => item.flags?.isAmbiguous).length;
    const avgTrust =
      analyzedReviews === 0
        ? 0
        : completed.reduce((acc, item) => acc + (item.reviewTrustScore || 0), 0) /
          analyzedReviews;

    res.json({
      totalReviews: allReviews.length,
      analyzedReviews,
      failedReviews: allReviews.filter((item) => item.analysisStatus === "failed").length,
      fakeRate: fakeCount / denominator,
      sarcasmRate: sarcasticCount / denominator,
      ambiguousRate: ambiguousCount / denominator,
      avgTrust,
    });
  } catch (error) {
    next(error);
  }
}

function getEmergingFeatureTrends(windowSize = 50) {
  const reviews = [...getCompletedReviews()].sort((a, b) => b.createdAt - a.createdAt);
  const recent = reviews.slice(0, windowSize);
  const previous = reviews.slice(windowSize, windowSize * 2);
  if (recent.length === 0 || previous.length === 0) {
    return [];
  }

  function buildNegativeCountMap(rows) {
    const map = new Map();
    for (const row of rows) {
      for (const feature of row.featureSentiments || []) {
        if (feature.sentiment !== "negative") {
          continue;
        }
        const current = map.get(feature.feature) || 0;
        map.set(feature.feature, current + 1);
      }
    }
    return map;
  }

  const recentMap = buildNegativeCountMap(recent);
  const previousMap = buildNegativeCountMap(previous);
  const featureKeys = new Set([...recentMap.keys(), ...previousMap.keys()]);

  const trends = [];
  for (const feature of featureKeys) {
    const recentCount = recentMap.get(feature) || 0;
    const previousCount = previousMap.get(feature) || 0;
    const recentPct = (recentCount / recent.length) * 100;
    const previousPct = (previousCount / previous.length) * 100;
    const delta = recentPct - previousPct;

    if (recentPct >= 15 && delta >= 8) {
      trends.push({
        feature,
        recentPct: Number(recentPct.toFixed(2)),
        previousPct: Number(previousPct.toFixed(2)),
        deltaPct: Number(delta.toFixed(2)),
      });
    }
  }

  return trends.sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 8);
}

async function getTrends(req, res, next) {
  try {
    const to = req.query.to
      ? toDayString(`${req.query.to}T00:00:00.000Z`)
      : toDayString(new Date());
    const from = req.query.from
      ? toDayString(`${req.query.from}T00:00:00.000Z`)
      : toDayString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const map = new Map();
    for (const review of getCompletedReviews()) {
      const day = toDayString(review.createdAt);
      if (day < from || day > to) {
        continue;
      }

      const current = map.get(day) || {
        date: day,
        totalReviews: 0,
        fakeCount: 0,
        sarcasmCount: 0,
        ambiguousCount: 0,
        trustTotal: 0,
        featureNegativeMentions: {},
      };

      current.totalReviews += 1;
      current.fakeCount += review.isFake ? 1 : 0;
      current.sarcasmCount += (review.sarcasmScore || 0) >= 0.55 ? 1 : 0;
      current.ambiguousCount += review.flags?.isAmbiguous ? 1 : 0;
      current.trustTotal += review.reviewTrustScore || 0;

      for (const feature of review.featureSentiments || []) {
        if (feature.sentiment !== "negative") {
          continue;
        }
        current.featureNegativeMentions[feature.feature] =
          (current.featureNegativeMentions[feature.feature] || 0) + 1;
      }

      map.set(day, current);
    }

    const points = [...map.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        date: item.date,
        totalReviews: item.totalReviews,
        fakeRate: item.totalReviews ? item.fakeCount / item.totalReviews : 0,
        sarcasmRate: item.totalReviews ? item.sarcasmCount / item.totalReviews : 0,
        ambiguousRate: item.totalReviews ? item.ambiguousCount / item.totalReviews : 0,
        avgTrust: item.totalReviews ? item.trustTotal / item.totalReviews : 0,
        featureNegativeMentions: item.featureNegativeMentions,
      }));

    res.json({
      from,
      to,
      points,
      emergingIssues: getEmergingFeatureTrends(50),
    });
  } catch (error) {
    next(error);
  }
}

async function getProductTrust(req, res, next) {
  try {
    for (const product of store.getAllProducts()) {
      refreshProductAggregate(product._id);
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const items = [...store.getAllProducts()]
      .sort((a, b) => {
        if (b.productTrustScore !== a.productTrustScore) {
          return b.productTrustScore - a.productTrustScore;
        }
        return b.reviewCount - a.reviewCount;
      })
      .slice(0, limit);
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

async function getConsumerTrust(req, res, next) {
  try {
    for (const consumer of store.getAllConsumers()) {
      refreshConsumerAggregate(consumer._id);
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const items = [...store.getAllConsumers()]
      .sort((a, b) => {
        if (b.consumerTrustScore !== a.consumerTrustScore) {
          return b.consumerTrustScore - a.consumerTrustScore;
        }
        return b.reviewCount - a.reviewCount;
      })
      .slice(0, limit);
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

async function getModelHealth(req, res) {
  res.json({
    gemini: {
      configured: Boolean(env.geminiApiKey),
      model: env.geminiModel,
    },
    grok: {
      configured: Boolean(env.grokApiKey),
      model: env.grokModel,
    },
  });
}

module.exports = {
  getOverview,
  getTrends,
  getProductTrust,
  getConsumerTrust,
  getModelHealth,
};
