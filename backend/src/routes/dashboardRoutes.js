const express = require("express");
const {
  getOverview,
  getTrends,
  getProductTrust,
  getConsumerTrust,
  getModelHealth,
} = require("../controllers/dashboardController");

const router = express.Router();

router.get("/overview", getOverview);
router.get("/trends", getTrends);
router.get("/products", getProductTrust);
router.get("/consumers", getConsumerTrust);
router.get("/health/models", getModelHealth);

module.exports = router;
