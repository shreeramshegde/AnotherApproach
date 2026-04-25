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

async function getCompletedReviews() {
  const reviews = await store.getAllReviews();
  return reviews.filter((item) => item.analysisStatus === "completed");
}

async function getOverview(req, res, next) {
  try {
    const [allReviews, completed] = await Promise.all([store.getAllReviews(), getCompletedReviews()]);
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

function classifyFeatureSignal({ recentPct, delta, recentCount }) {
  if (recentPct >= 15 && delta >= 8 && recentCount >= 5) {
    return "systemic";
  }
  if (recentCount <= 2) {
    return "isolated";
  }
  return "watch";
}

function buildTrendInsights(completedReviews, windowSize = 50) {
  const reviews = [...completedReviews].sort((a, b) => b.createdAt - a.createdAt);
  const recent = reviews.slice(0, windowSize);
  const previous = reviews.slice(windowSize, windowSize * 2);
  if (recent.length === 0 || previous.length === 0) {
    return { emergingIssues: [], isolatedComplaints: [], anomalies: [] };
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
  const emergingIssues = [];
  const isolatedComplaints = [];
  const anomalies = [];

  for (const feature of featureKeys) {
    const recentCount = recentMap.get(feature) || 0;
    const previousCount = previousMap.get(feature) || 0;
    const recentPct = (recentCount / recent.length) * 100;
    const previousPct = (previousCount / previous.length) * 100;
    const delta = recentPct - previousPct;
    const signal = classifyFeatureSignal({ recentPct, delta, recentCount });
    const row = {
      feature,
      recentCount,
      previousCount,
      recentPct: Number(recentPct.toFixed(2)),
      previousPct: Number(previousPct.toFixed(2)),
      deltaPct: Number(delta.toFixed(2)),
      signal,
    };

    if (signal === "systemic") {
      emergingIssues.push(row);
    } else if (signal === "isolated") {
      isolatedComplaints.push(row);
    }
    if (delta >= 12) {
      anomalies.push({
        feature,
        type: "sentiment_drop",
        deltaPct: Number(delta.toFixed(2)),
        message: `${feature} negative mentions rose by ${delta.toFixed(2)} percentage points.`,
      });
    }
  }

  return {
    emergingIssues: emergingIssues.sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 8),
    isolatedComplaints: isolatedComplaints
      .sort((a, b) => b.recentCount - a.recentCount)
      .slice(0, 8),
    anomalies: anomalies.sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 8),
  };
}

function buildActionRecommendations({ emergingIssues, anomalies, isolatedComplaints }) {
  const recommendations = [];

  for (const issue of emergingIssues.slice(0, 5)) {
    recommendations.push({
      priority: issue.deltaPct >= 20 ? "high" : "medium",
      feature: issue.feature,
      category: "systemic_issue",
      recommendation: `Investigate root cause for ${issue.feature}; negative mentions rose to ${issue.recentPct}% (${issue.deltaPct} pt change).`,
      evidence: {
        recentPct: issue.recentPct,
        previousPct: issue.previousPct,
        recentCount: issue.recentCount,
      },
    });
  }

  for (const anomaly of anomalies.slice(0, 3)) {
    recommendations.push({
      priority: anomaly.deltaPct >= 20 ? "high" : "medium",
      feature: anomaly.feature,
      category: "anomaly",
      recommendation: `Run targeted QA and marketing copy review for ${anomaly.feature}.`,
      evidence: { deltaPct: anomaly.deltaPct, message: anomaly.message },
    });
  }

  if (isolatedComplaints.length > 0) {
    recommendations.push({
      priority: "low",
      feature: "multiple",
      category: "isolated_feedback",
      recommendation: "Track isolated complaints for recurrence before broad corrective action.",
      evidence: { sample: isolatedComplaints.slice(0, 3).map((item) => item.feature) },
    });
  }

  return recommendations.slice(0, 8);
}

async function getTrends(req, res, next) {
  try {
    const to = req.query.to
      ? toDayString(`${req.query.to}T00:00:00.000Z`)
      : toDayString(new Date());
    const from = req.query.from
      ? toDayString(`${req.query.from}T00:00:00.000Z`)
      : toDayString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const completed = await getCompletedReviews();
    const map = new Map();
    for (const review of completed) {
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

    const insights = buildTrendInsights(completed, 50);
    res.json({
      from,
      to,
      points,
      recommendations: buildActionRecommendations(insights),
      emergingIssues: insights.emergingIssues,
      isolatedComplaints: insights.isolatedComplaints,
      anomalies: insights.anomalies,
    });
  } catch (error) {
    next(error);
  }
}

async function getProductTrust(req, res, next) {
  try {
    const products = await store.getAllProducts();
    await Promise.all(products.map((product) => refreshProductAggregate(product._id)));

    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const items = [...(await store.getAllProducts())]
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
    const consumers = await store.getAllConsumers();
    await Promise.all(consumers.map((consumer) => refreshConsumerAggregate(consumer._id)));

    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const items = [...(await store.getAllConsumers())]
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

async function downloadReport(req, res, next) {
  try {
    const [overview, trends, recommendations, products, consumers] = await Promise.all([
      (async () => {
        const reviews = await store.getAllReviews();
        const completed = reviews.filter((item) => item.analysisStatus === "completed");
        const analyzedReviews = completed.length;
        const denominator = analyzedReviews || 1;
        const fakeCount = completed.filter((item) => item.isFake).length;
        const sarcasmCount = completed.filter((item) => (item.sarcasmScore || 0) >= 0.55).length;
        const avgTrust =
          analyzedReviews === 0
            ? 0
            : completed.reduce((acc, item) => acc + (item.reviewTrustScore || 0), 0) /
              analyzedReviews;
        return {
          totalReviews: reviews.length,
          analyzedReviews,
          fakeRate: Number((fakeCount / denominator).toFixed(4)),
          sarcasmRate: Number((sarcasmCount / denominator).toFixed(4)),
          avgTrust: Number(avgTrust.toFixed(2)),
        };
      })(),
      (async () => {
        const completed = await getCompletedReviews();
        return buildTrendInsights(completed, 50);
      })(),
      (async () => {
        const completed = await getCompletedReviews();
        const insights = buildTrendInsights(completed, 50);
        return buildActionRecommendations(insights);
      })(),
      store.getAllProducts(),
      store.getAllConsumers(),
    ]);

    const reportPayload = {
      generatedAt: new Date().toISOString(),
      model: { provider: "gemini", configured: Boolean(env.geminiApiKey), model: env.geminiModel },
      overview,
      trends,
      recommendations,
      topProducts: [...products]
        .sort((a, b) => b.productTrustScore - a.productTrustScore)
        .slice(0, 10),
      riskyConsumers: [...consumers]
        .sort((a, b) => a.consumerTrustScore - b.consumerTrustScore)
        .slice(0, 10),
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=review-intelligence-report.json");
    res.status(200).send(JSON.stringify(reportPayload, null, 2));
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
  });
}

module.exports = {
  getOverview,
  getTrends,
  getProductTrust,
  getConsumerTrust,
  getModelHealth,
  downloadReport,
};
