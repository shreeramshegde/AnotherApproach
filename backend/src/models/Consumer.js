const mongoose = require("mongoose");

const consumerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    externalId: { type: String, trim: true, default: "" },
    verified: { type: Boolean, default: false },
    reviewCount: { type: Number, default: 0 },
    avgTrust: { type: Number, min: 0, max: 100, default: 0 },
    consumerTrustScore: { type: Number, min: 0, max: 100, default: 0 },
    suspiciousReviewRate: { type: Number, min: 0, max: 1, default: 0 },
    riskFlags: { type: [String], default: [] },
    lastUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

consumerSchema.index(
  { externalId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalId: { $type: "string", $ne: "" },
    },
  }
);
consumerSchema.index({ name: 1 });

const Consumer = mongoose.model("Consumer", consumerSchema);

module.exports = { Consumer };
