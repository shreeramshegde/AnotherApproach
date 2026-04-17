const { parse: parseCsv } = require("csv-parse/sync");
const mongoose = require("mongoose");
const { Review } = require("../models/Review");
const { Product } = require("../models/Product");
const { Consumer } = require("../models/Consumer");
const { analyzeReviewById, analyzeInBackground } = require("../services/analysisPipeline");
const { parseBoolean, parseNumber } = require("../utils/parsers");
const { normalizeText, jaccardSimilarity, detectLikelySpam } = require("../utils/text");
const { sha256 } = require("../utils/hash");

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.isClientSafe = true;
  return error;
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toReviewInput(rawItem, source) {
  const text = String(
    pickFirst(rawItem.text, rawItem.reviewText, rawItem.review, rawItem.content, rawItem.comment)
  ).trim();

  if (!text) {
    throw badRequest("Review text is required in every item.");
  }

  return {
    source,
    externalId: String(pickFirst(rawItem.externalId, rawItem.id, "")).trim(),
    title: String(pickFirst(rawItem.title, rawItem.headline, "")).trim(),
    text,
    language: String(pickFirst(rawItem.language, rawItem.lang, "unknown")).trim(),
    rating: parseNumber(pickFirst(rawItem.rating, rawItem.stars, ""), null),
    verifiedPurchase: parseBoolean(
      pickFirst(rawItem.verifiedPurchase, rawItem.verified, false),
      false
    ),
    productName: String(
      pickFirst(rawItem.productName, rawItem.product, rawItem.productTitle, "Unknown Product")
    ).trim(),
    productCategory: String(
      pickFirst(rawItem.productCategory, rawItem.category, "general")
    ).trim(),
    consumerName: String(
      pickFirst(rawItem.consumerName, rawItem.reviewerName, rawItem.user, "Anonymous")
    ).trim(),
    consumerExternalId: String(pickFirst(rawItem.consumerId, rawItem.userId, "")).trim(),
  };
}

function parseUploadedRows(req) {
  if (!req.file) {
    if (Array.isArray(req.body.reviews)) {
      return { rows: req.body.reviews, source: "json" };
    }

    if (req.body.reviewText || req.body.text) {
      return {
        rows: [req.body],
        source: "manual",
      };
    }

    throw badRequest("Provide a file, reviews[] payload, or manual reviewText.");
  }

  const fileName = req.file.originalname.toLowerCase();
  const fileText = req.file.buffer.toString("utf-8");

  if (fileName.endsWith(".json")) {
    let parsed;
    try {
      parsed = JSON.parse(fileText);
    } catch {
      throw badRequest("Invalid JSON file.");
    }
    if (!Array.isArray(parsed)) {
      throw badRequest("JSON upload must contain an array of reviews.");
    }
    return { rows: parsed, source: "json" };
  }

  let rows;
  try {
    rows = parseCsv(fileText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    throw badRequest("Invalid CSV file.");
  }

  return { rows, source: "csv" };
}

async function getOrCreateProduct({ name, category }) {
  return Product.findOneAndUpdate(
    { name, category },
    {
      $setOnInsert: {
        name,
        category,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
}

async function getOrCreateConsumer({ name, externalId, verified }) {
  if (!externalId) {
    const existing = await Consumer.findOne({
      externalId: "",
      name: new RegExp(`^${escapeRegex(name)}$`, "i"),
    });
    if (existing) {
      existing.verified = verified;
      await existing.save();
      return existing;
    }

    return Consumer.create({
      name,
      externalId: "",
      verified,
    });
  }

  try {
    return await Consumer.findOneAndUpdate(
      { externalId },
      {
        $setOnInsert: {
          name,
          externalId,
          verified,
        },
        $set: {
          verified,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    const existing = await Consumer.findOne({ externalId });
    if (!existing) {
      throw error;
    }
    existing.verified = verified;
    await existing.save();
    return existing;
  }
}

async function checkNearDuplicate(productId, text) {
  const recent = await Review.find({ productId })
    .sort({ createdAt: -1 })
    .limit(40)
    .select("text")
    .lean();

  let highestScore = 0;
  for (const row of recent) {
    const score = jaccardSimilarity(text, row.text);
    if (score > highestScore) {
      highestScore = score;
    }
  }

  return highestScore;
}

async function importReviews(req, res, next) {
  try {
    const { rows, source } = parseUploadedRows(req);
    if (!rows.length) {
      throw badRequest("No reviews found to import.");
    }

    const createdReviews = [];
    const failedRows = [];
    let duplicateCount = 0;
    let nearDuplicateCount = 0;
    let spamFlaggedCount = 0;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const rawItem = rows[rowIndex];
      try {
        const input = toReviewInput(rawItem, source);
        const product = await getOrCreateProduct({
          name: input.productName,
          category: input.productCategory,
        });
        const consumer = await getOrCreateConsumer({
          name: input.consumerName,
          externalId: input.consumerExternalId,
          verified: input.verifiedPurchase,
        });

        const normalized = normalizeText(input.text);
        const normalizedTextHash = sha256(normalized);
        const duplicate = await Review.exists({
          productId: product._id,
          normalizedTextHash,
        });
        const nearDuplicateScore = await checkNearDuplicate(product._id, input.text);
        const isNearDuplicate = nearDuplicateScore >= 0.88;
        const spamHeuristic = detectLikelySpam(input.text);
        const isSpamSuspected =
          spamHeuristic.isLikelySpam || Boolean(duplicate) || isNearDuplicate;

        const review = await Review.create({
          source: input.source,
          externalId: input.externalId,
          title: input.title,
          text: input.text,
          normalizedTextHash,
          language: input.language,
          rating: input.rating,
          verifiedPurchase: input.verifiedPurchase,
          productId: product._id,
          consumerId: consumer._id,
          nearDuplicateScore,
          nearDuplicateCluster: isNearDuplicate ? normalizedTextHash.slice(0, 16) : "",
          flags: {
            isDuplicate: Boolean(duplicate),
            isNearDuplicate,
            isSpamSuspected,
            hasSarcasm: false,
            isAmbiguous: false,
          },
        });

        if (duplicate) duplicateCount += 1;
        if (isNearDuplicate) nearDuplicateCount += 1;
        if (isSpamSuspected) spamFlaggedCount += 1;
        createdReviews.push(review);
      } catch (rowError) {
        failedRows.push({
          rowIndex,
          error: rowError.message,
        });
      }
    }

    if (createdReviews.length === 0) {
      const error = badRequest("Import failed for all rows.");
      error.details = failedRows.slice(0, 25);
      throw error;
    }

    const autoAnalyze = parseBoolean(req.body.autoAnalyze, true);
    const reviewIds = createdReviews.map((review) => review._id);
    if (autoAnalyze && reviewIds.length > 0) {
      setImmediate(() => {
        analyzeInBackground(reviewIds).catch((error) => {
          console.error("Background analysis failed:", error.message);
        });
      });
    }

    res.status(failedRows.length ? 207 : 201).json({
      importedCount: createdReviews.length,
      failedCount: failedRows.length,
      failedRows: failedRows.slice(0, 25),
      duplicateCount,
      nearDuplicateCount,
      spamFlaggedCount,
      analysis: autoAnalyze ? "queued" : "skipped",
      reviewIds,
    });
  } catch (error) {
    next(error);
  }
}

async function getReviewWithRefs(reviewId) {
  return Review.findById(reviewId)
    .populate("productId", "name category")
    .populate("consumerId", "name externalId")
    .lean();
}

async function analyzeReview(req, res, next) {
  try {
    const review = await analyzeReviewById(req.params.id);
    const hydrated = await getReviewWithRefs(review._id);
    res.json(hydrated || review);
  } catch (error) {
    next(error);
  }
}

async function createFeedReview(req, res, next) {
  try {
    const input = toReviewInput(req.body, "api-feed");
    const product = await getOrCreateProduct({
      name: input.productName,
      category: input.productCategory,
    });
    const consumer = await getOrCreateConsumer({
      name: input.consumerName,
      externalId: input.consumerExternalId,
      verified: input.verifiedPurchase,
    });

    const normalized = normalizeText(input.text);
    const normalizedTextHash = sha256(normalized);
    const duplicate = await Review.exists({
      productId: product._id,
      normalizedTextHash,
    });
    const nearDuplicateScore = await checkNearDuplicate(product._id, input.text);
    const spamHeuristic = detectLikelySpam(input.text);
    const isNearDuplicate = nearDuplicateScore >= 0.88;
    const isSpamSuspected =
      spamHeuristic.isLikelySpam || Boolean(duplicate) || isNearDuplicate;

    const review = await Review.create({
      source: input.source,
      externalId: input.externalId,
      title: input.title,
      text: input.text,
      normalizedTextHash,
      language: input.language,
      rating: input.rating,
      verifiedPurchase: input.verifiedPurchase,
      productId: product._id,
      consumerId: consumer._id,
      nearDuplicateScore,
      flags: {
        isDuplicate: Boolean(duplicate),
        isNearDuplicate,
        isSpamSuspected,
        hasSarcasm: false,
        isAmbiguous: false,
      },
    });

    const immediate = parseBoolean(req.body.immediateAnalyze, true);
    if (immediate) {
      const analyzed = await analyzeReviewById(review._id);
      const hydrated = await getReviewWithRefs(analyzed._id);
      res.status(201).json(hydrated || analyzed);
      return;
    }

    const hydrated = await getReviewWithRefs(review._id);
    res.status(201).json(hydrated || review);
  } catch (error) {
    next(error);
  }
}

async function listReviews(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
    const skip = (page - 1) * limit;

    const filters = {};
    if (req.query.productId) {
      if (!mongoose.isValidObjectId(req.query.productId)) {
        throw badRequest("productId must be a valid id.");
      }
      filters.productId = req.query.productId;
    }
    if (req.query.consumerId) {
      if (!mongoose.isValidObjectId(req.query.consumerId)) {
        throw badRequest("consumerId must be a valid id.");
      }
      filters.consumerId = req.query.consumerId;
    }
    if (req.query.analysisStatus) filters.analysisStatus = req.query.analysisStatus;
    if (req.query.isFake === "true") filters.isFake = true;
    if (req.query.isFake === "false") filters.isFake = false;

    if (req.query.minTrust) {
      const minTrust = Number(req.query.minTrust);
      if (!Number.isFinite(minTrust)) {
        throw badRequest("minTrust must be a valid number.");
      }
      filters.reviewTrustScore = { $gte: minTrust };
    }
    if (req.query.maxTrust) {
      const maxTrust = Number(req.query.maxTrust);
      if (!Number.isFinite(maxTrust)) {
        throw badRequest("maxTrust must be a valid number.");
      }
      filters.reviewTrustScore = {
        ...(filters.reviewTrustScore || {}),
        $lte: maxTrust,
      };
    }

    const [items, total] = await Promise.all([
      Review.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("productId", "name category")
        .populate("consumerId", "name externalId")
        .lean(),
      Review.countDocuments(filters),
    ]);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      items,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  importReviews,
  analyzeReview,
  createFeedReview,
  listReviews,
};
