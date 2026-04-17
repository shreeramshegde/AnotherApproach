const mongoose = require("mongoose");

const dailyMetricSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true },
    totalReviews: { type: Number, default: 0 },
    fakeRate: { type: Number, min: 0, max: 1, default: 0 },
    sarcasmRate: { type: Number, min: 0, max: 1, default: 0 },
    ambiguousRate: { type: Number, min: 0, max: 1, default: 0 },
    avgTrust: { type: Number, min: 0, max: 100, default: 0 },
    featureNegativeMentions: { type: Map, of: Number, default: {} },
  },
  { timestamps: true }
);

const DailyMetric = mongoose.model("DailyMetric", dailyMetricSchema);

module.exports = { DailyMetric };
