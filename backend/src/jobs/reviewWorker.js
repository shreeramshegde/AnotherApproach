const { analyzeInBackground } = require("../services/analysisPipeline");

async function runReviewWorker(reviewIds) {
  return analyzeInBackground(reviewIds);
}

module.exports = { runReviewWorker };
