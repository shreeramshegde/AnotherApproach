const { DailyMetric } = require("../models/DailyMetric");
const { Product } = require("../models/Product");
const { Consumer } = require("../models/Consumer");
const { Review } = require("../models/Review");
const env = require("../config/env");

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

async function getOverview(req, res, next) {
  try {
    const [summary] = await Review.aggregate([
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          analyzedReviews: {
            $sum: { $cond: [{ $eq: ["$analysisStatus", "completed"] }, 1, 0] },
          },
          failedReviews: {
            $sum: { $cond: [{ $eq: ["$analysisStatus", "failed"] }, 1, 0] },
          },
          fakeCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$analysisStatus", "completed"] },
                    { $eq: ["$isFake", true] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          sarcasticCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$analysisStatus", "completed"] },
                    { $gte: ["$sarcasmScore", 0.55] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          ambiguousCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$analysisStatus", "completed"] },
                    { $eq: ["$flags.isAmbiguous", true] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          avgTrust: {
            $avg: {
              $cond: [{ $eq: ["$analysisStatus", "completed"] }, "$reviewTrustScore", null],
            },
          },
        },
      },
    ]);

    const analyzedReviews = summary?.analyzedReviews || 0;
    const denominator = analyzedReviews || 1;

    res.json({
      totalReviews: summary?.totalReviews || 0,
      analyzedReviews,
      failedReviews: summary?.failedReviews || 0,
      fakeRate: (summary?.fakeCount || 0) / denominator,
      sarcasmRate: (summary?.sarcasticCount || 0) / denominator,
      ambiguousRate: (summary?.ambiguousCount || 0) / denominator,
      avgTrust: summary?.avgTrust || 0,
    });
  } catch (error) {
    next(error);
  }
}

async function getEmergingFeatureTrends(windowSize = 50) {
  const reviews = await Review.find({ analysisStatus: "completed" })
    .sort({ createdAt: -1 })
    .limit(windowSize * 2)
    .select("featureSentiments")
    .lean();

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

    const metrics = await DailyMetric.find({
      date: { $gte: from, $lte: to },
    })
      .sort({ date: 1 })
      .lean();

    res.json({
      from,
      to,
      points: metrics,
      emergingIssues: await getEmergingFeatureTrends(50),
    });
  } catch (error) {
    next(error);
  }
}

async function getProductTrust(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const items = await Product.find({})
      .sort({ productTrustScore: -1, reviewCount: -1 })
      .limit(limit)
      .lean();
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

async function getConsumerTrust(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const items = await Consumer.find({})
      .sort({ consumerTrustScore: -1, reviewCount: -1 })
      .limit(limit)
      .lean();
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
