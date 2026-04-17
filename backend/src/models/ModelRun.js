const mongoose = require("mongoose");

const modelRunSchema = new mongoose.Schema(
  {
    reviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review",
      required: true,
      index: true,
    },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    promptVersion: { type: String, required: true },
    status: { type: String, enum: ["success", "failed", "skipped"], required: true },
    latencyMs: { type: Number, default: 0 },
    requestHash: { type: String, required: true },
    responsePayload: { type: mongoose.Schema.Types.Mixed, default: null },
    errorMessage: { type: String, default: "" },
  },
  { timestamps: true }
);

const ModelRun = mongoose.model("ModelRun", modelRunSchema);

module.exports = { ModelRun };
