const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function asInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

const env = {
  port: asInt(process.env.PORT, 4000),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  sqliteDbPath: process.env.SQLITE_DB_PATH || "data/review_intelligence.sqlite",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  grokApiKey: process.env.GROK_API_KEY || "",
  grokModel: process.env.GROK_MODEL || "grok-3-mini",
  promptVersion: process.env.PROMPT_VERSION || "v1",
  analysisBatchSize: asInt(process.env.ANALYSIS_BATCH_SIZE, 4),
};

module.exports = env;
