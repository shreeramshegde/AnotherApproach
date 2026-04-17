const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: "general" },
    reviewCount: { type: Number, default: 0 },
    fakeRate: { type: Number, min: 0, max: 1, default: 0 },
    sarcasmRate: { type: Number, min: 0, max: 1, default: 0 },
    avgTrust: { type: Number, min: 0, max: 100, default: 0 },
    productTrustScore: { type: Number, min: 0, max: 100, default: 0 },
    featureScores: { type: Map, of: Number, default: {} },
    lastUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

productSchema.index({ name: 1, category: 1 }, { unique: true });

const Product = mongoose.model("Product", productSchema);

module.exports = { Product };
