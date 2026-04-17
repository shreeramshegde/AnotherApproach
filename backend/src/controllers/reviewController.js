const { parse: parseCsv } = require("csv-parse/sync");
const { analyzeReviewById, analyzeInBackground } = require("../services/analysisPipeline");
const { parseBoolean, parseNumber } = require("../utils/parsers");
const { normalizeText, jaccardSimilarity, detectLikelySpam } = require("../utils/text");
const { sha256 } = require("../utils/hash");
const store = require("../store/memoryStore");

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
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

function checkNearDuplicate(productId, text) {
  const recent = store.getRecentReviewsByProduct(productId, 40);
  let highestScore = 0;
  for (const row of recent) {
    const score = jaccardSimilarity(text, row.text);
    if (score > highestScore) {
      highestScore = score;
    }
  }
  return highestScore;
}

function hydrateReview(review) {
  const product = store.getProductById(review.productId);
  const consumer = store.getConsumerById(review.consumerId);
  return {
    ...review,
    productId: product
      ? {
          _id: product._id,
          name: product.name,
          category: product.category,
        }
      : null,
    consumerId: consumer
      ? {
          _id: consumer._id,
          name: consumer.name,
          externalId: consumer.externalId,
        }
      : null,
  };
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
        const product = store.getOrCreateProduct({
          name: input.productName,
          category: input.productCategory,
        });
        const consumer = store.getOrCreateConsumer({
          name: input.consumerName,
          externalId: input.consumerExternalId,
          verified: input.verifiedPurchase,
        });

        const normalized = normalizeText(input.text);
        const normalizedTextHash = sha256(normalized);
        const duplicate = store.existsDuplicateReview(product._id, normalizedTextHash);
        const nearDuplicateScore = checkNearDuplicate(product._id, input.text);
        const isNearDuplicate = nearDuplicateScore >= 0.88;
        const spamHeuristic = detectLikelySpam(input.text);
        const isSpamSuspected =
          spamHeuristic.isLikelySpam || Boolean(duplicate) || isNearDuplicate;

        const review = store.addReview({
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

async function analyzeReview(req, res, next) {
  try {
    const review = await analyzeReviewById(req.params.id);
    res.json(hydrateReview(review));
  } catch (error) {
    next(error);
  }
}

async function createFeedReview(req, res, next) {
  try {
    const input = toReviewInput(req.body, "api-feed");
    const product = store.getOrCreateProduct({
      name: input.productName,
      category: input.productCategory,
    });
    const consumer = store.getOrCreateConsumer({
      name: input.consumerName,
      externalId: input.consumerExternalId,
      verified: input.verifiedPurchase,
    });

    const normalized = normalizeText(input.text);
    const normalizedTextHash = sha256(normalized);
    const duplicate = store.existsDuplicateReview(product._id, normalizedTextHash);
    const nearDuplicateScore = checkNearDuplicate(product._id, input.text);
    const spamHeuristic = detectLikelySpam(input.text);
    const isNearDuplicate = nearDuplicateScore >= 0.88;
    const isSpamSuspected =
      spamHeuristic.isLikelySpam || Boolean(duplicate) || isNearDuplicate;

    const review = store.addReview({
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
      res.status(201).json(hydrateReview(analyzed));
      return;
    }

    res.status(201).json(hydrateReview(review));
  } catch (error) {
    next(error);
  }
}

async function listReviews(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
    const skip = (page - 1) * limit;

    let items = store.getAllReviews();

    if (req.query.productId) {
      items = items.filter((item) => item.productId === req.query.productId);
    }
    if (req.query.consumerId) {
      items = items.filter((item) => item.consumerId === req.query.consumerId);
    }
    if (req.query.analysisStatus) {
      items = items.filter((item) => item.analysisStatus === req.query.analysisStatus);
    }
    if (req.query.isFake === "true") {
      items = items.filter((item) => item.isFake === true);
    }
    if (req.query.isFake === "false") {
      items = items.filter((item) => item.isFake === false);
    }

    if (req.query.minTrust) {
      const minTrust = Number(req.query.minTrust);
      if (!Number.isFinite(minTrust)) {
        throw badRequest("minTrust must be a valid number.");
      }
      items = items.filter((item) => Number(item.reviewTrustScore || 0) >= minTrust);
    }

    if (req.query.maxTrust) {
      const maxTrust = Number(req.query.maxTrust);
      if (!Number.isFinite(maxTrust)) {
        throw badRequest("maxTrust must be a valid number.");
      }
      items = items.filter((item) => Number(item.reviewTrustScore || 0) <= maxTrust);
    }

    items = [...items].sort((a, b) => b.createdAt - a.createdAt);

    const total = items.length;
    const paged = items.slice(skip, skip + limit).map(hydrateReview);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      items: paged,
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
