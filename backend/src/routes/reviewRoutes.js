const express = require("express");
const multer = require("multer");
const {
  importReviews,
  analyzeReview,
  createFeedReview,
  listReviews,
} = require("../controllers/reviewController");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post("/import", upload.single("file"), importReviews);
router.post("/feed", createFeedReview);
router.post("/:id/analyze", analyzeReview);
router.get("/", listReviews);

module.exports = router;
