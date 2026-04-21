const express = require("express");
const {
  getOverview,
  getTrends,
  getProductTrust,
  getConsumerTrust,
  getModelHealth,
  downloadReport,
} = require("../controllers/dashboardController");

const router = express.Router();

router.get("/overview", getOverview);
router.get("/trends", getTrends);
router.get("/products", getProductTrust);
router.get("/consumers", getConsumerTrust);
router.get("/health/models", getModelHealth);
router.get("/report", downloadReport);

module.exports = router;
