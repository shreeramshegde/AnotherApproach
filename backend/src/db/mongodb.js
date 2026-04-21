const { MongoClient } = require("mongodb");
const readline = require("readline");
const {
  mongoUri,
  mongoDbName,
  mongoUsername,
  mongoPassword,
} = require("../config/env");

let clientInstance = null;
let dbInstance = null;

function promptPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });

    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (rl.stdoutMuted) {
        rl.output.write("*");
        return;
      }
      rl.output.write(stringToWrite);
    };
    rl.stdoutMuted = true;
  });
}

async function resolveMongoUri() {
  let parsed;
  try {
    parsed = new URL(mongoUri);
  } catch {
    return mongoUri;
  }

  const existingUsername = decodeURIComponent(parsed.username || "");
  const existingPassword = decodeURIComponent(parsed.password || "");
  const username = existingUsername || mongoUsername;
  let password = existingPassword || mongoPassword;

  if (username && !password) {
    if (!process.stdin.isTTY) {
      throw new Error(
        "MongoDB password is required. Set MONGODB_PASSWORD for non-interactive startup."
      );
    }
    password = await promptPassword(`MongoDB password for ${username}: `);
    process.stdout.write("\n");
    if (!password) {
      throw new Error("MongoDB password cannot be empty.");
    }
  }

  if (username) {
    parsed.username = encodeURIComponent(username);
  }
  if (password) {
    parsed.password = encodeURIComponent(password);
  }

  return parsed.toString();
}

async function initializeDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  const resolvedUri = await resolveMongoUri();
  const client = new MongoClient(resolvedUri);
  await client.connect();
  const db = client.db(mongoDbName);

  await Promise.all([
    db.collection("products").createIndex({ name: 1, category: 1 }, { unique: true }),
    db.collection("consumers").createIndex({ externalId: 1 }, { unique: true, sparse: true }),
    db.collection("reviews").createIndex({ productId: 1, normalizedTextHash: 1 }),
    db.collection("reviews").createIndex({ productId: 1, createdAt: -1 }),
    db.collection("reviews").createIndex({ createdAt: -1 }),
    db.collection("model_runs").createIndex({ reviewId: 1, createdAt: -1 }),
  ]);

  clientInstance = client;
  dbInstance = db;
  return dbInstance;
}

function getDatabase() {
  if (!dbInstance) {
    throw new Error("Database has not been initialized. Call initializeDatabase first.");
  }
  return dbInstance;
}

async function closeDatabase() {
  if (!clientInstance) {
    return;
  }
  await clientInstance.close();
  clientInstance = null;
  dbInstance = null;
}

module.exports = {
  initializeDatabase,
  getDatabase,
  closeDatabase,
};
