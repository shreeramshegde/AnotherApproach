const { Product } = require("../models/Product");
const { Consumer } = require("../models/Consumer");
const { Review } = require("../models/Review");
const { DailyMetric } = require("../models/DailyMetric");
const { clamp } = require("../utils/parsers");

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

function toDayKey(dateLike) {
  const date = new Date(dateLike);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function refreshProductAggregate(productId) {
  const [summary] = await Review.aggregate([
    { $match: { productId, analysisStatus: "completed" } },
    {
      $group: {
        _id: "$productId",
        reviewCount: { $sum: 1 },
        avgTrust: { $avg: "$reviewTrustScore" },
        fakeRate: {
          $avg: {
            $cond: [{ $eq: ["$isFake", true] }, 1, 0],
          },
        },
        sarcasmRate: {
          $avg: {
            $cond: [{ $gte: ["$sarcasmScore", 0.55] }, 1, 0],
          },
        },
      },
    },
  ]);

  if (!summary) {
    await Product.findByIdAndUpdate(productId, {
      reviewCount: 0,
      avgTrust: 0,
      fakeRate: 0,
      sarcasmRate: 0,
      productTrustScore: 0,
      featureScores: {},
      lastUpdatedAt: new Date(),
    });
    return;
  }

  const featureRows = await Review.aggregate([
    { $match: { productId, analysisStatus: "completed" } },
    { $unwind: "$featureSentiments" },
    {
      $group: {
        _id: "$featureSentiments.feature",
        avgSentiment: {
          $avg: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$featureSentiments.sentiment", "positive"] },
                  then: 1,
                },
                {
                  case: { $eq: ["$featureSentiments.sentiment", "negative"] },
                  then: -1,
                },
              ],
              default: 0,
            },
          },
        },
      },
    },
  ]);

  const featureScores = {};
  for (const row of featureRows) {
    featureScores[row._id] = Number(row.avgSentiment.toFixed(3));
  }

  const productTrustScore = clamp(
    summary.avgTrust * (1 - summary.fakeRate * 0.4) * (1 - summary.sarcasmRate * 0.1),
    0,
    100
  );

  await Product.findByIdAndUpdate(productId, {
    reviewCount: summary.reviewCount,
    avgTrust: summary.avgTrust,
    fakeRate: summary.fakeRate,
    sarcasmRate: summary.sarcasmRate,
    productTrustScore,
    featureScores,
    lastUpdatedAt: new Date(),
  });
}

async function refreshConsumerAggregate(consumerId) {
  const [summary] = await Review.aggregate([
    { $match: { consumerId, analysisStatus: "completed" } },
    {
      $group: {
        _id: "$consumerId",
        reviewCount: { $sum: 1 },
        avgTrust: { $avg: "$reviewTrustScore" },
        fakeRate: {
          $avg: {
            $cond: [{ $eq: ["$isFake", true] }, 1, 0],
          },
        },
        spamRate: {
          $avg: {
            $cond: [{ $eq: ["$flags.isSpamSuspected", true] }, 1, 0],
          },
        },
      },
    },
  ]);

  if (!summary) {
    await Consumer.findByIdAndUpdate(consumerId, {
      reviewCount: 0,
      avgTrust: 0,
      consumerTrustScore: 0,
      suspiciousReviewRate: 0,
      riskFlags: [],
      lastUpdatedAt: new Date(),
    });
    return;
  }

  const suspiciousReviewRate = (summary.fakeRate + summary.spamRate) / 2;
  const consumerTrustScore = clamp(summary.avgTrust * (1 - suspiciousReviewRate * 0.5), 0, 100);

  const riskFlags = [];
  if (summary.fakeRate >= 0.35) {
    riskFlags.push("high_fake_review_probability");
  }
  if (summary.spamRate >= 0.35) {
    riskFlags.push("repetitive_or_spammy_patterns");
  }
  if (summary.reviewCount >= 10 && consumerTrustScore < 55) {
    riskFlags.push("low_historical_trust");
  }

  await Consumer.findByIdAndUpdate(consumerId, {
    reviewCount: summary.reviewCount,
    avgTrust: summary.avgTrust,
    consumerTrustScore,
    suspiciousReviewRate,
    riskFlags,
    lastUpdatedAt: new Date(),
  });
}

async function refreshDailyMetric(dateLike) {
  const dayKey = toDayKey(dateLike);
  const start = new Date(`${dayKey}T00:00:00.000Z`);
  const end = new Date(`${dayKey}T23:59:59.999Z`);

  const [summary] = await Review.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        analysisStatus: "completed",
      },
    },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        fakeRate: {
          $avg: {
            $cond: [{ $eq: ["$isFake", true] }, 1, 0],
          },
        },
        sarcasmRate: {
          $avg: {
            $cond: [{ $gte: ["$sarcasmScore", 0.55] }, 1, 0],
          },
        },
        ambiguousRate: {
          $avg: {
            $cond: [{ $eq: ["$flags.isAmbiguous", true] }, 1, 0],
          },
        },
        avgTrust: { $avg: "$reviewTrustScore" },
      },
    },
  ]);

  const featureRows = await Review.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        analysisStatus: "completed",
      },
    },
    { $unwind: "$featureSentiments" },
    { $match: { "featureSentiments.sentiment": "negative" } },
    {
      $group: {
        _id: "$featureSentiments.feature",
        count: { $sum: 1 },
      },
    },
  ]);

  const featureNegativeMentions = {};
  for (const row of featureRows) {
    featureNegativeMentions[row._id] = row.count;
  }

  await DailyMetric.findOneAndUpdate(
    { date: dayKey },
    {
      date: dayKey,
      totalReviews: summary?.totalReviews || 0,
      fakeRate: summary?.fakeRate || 0,
      sarcasmRate: summary?.sarcasmRate || 0,
      ambiguousRate: summary?.ambiguousRate || 0,
      avgTrust: summary?.avgTrust || 0,
      featureNegativeMentions,
    },
    { upsert: true, new: true }
  );
}

module.exports = {
  computeReviewTrust,
  refreshProductAggregate,
  refreshConsumerAggregate,
  refreshDailyMetric,
};
