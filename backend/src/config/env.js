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
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
  mongoDbName: process.env.MONGODB_DB_NAME || "review_intelligence",
  mongoUsername: process.env.MONGODB_USERNAME || "",
  mongoPassword: process.env.MONGODB_PASSWORD || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  promptVersion: process.env.PROMPT_VERSION || "v1",
  analysisBatchSize: asInt(process.env.ANALYSIS_BATCH_SIZE, 4),
};

module.exports = env;
