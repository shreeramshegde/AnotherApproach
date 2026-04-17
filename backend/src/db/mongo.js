const mongoose = require("mongoose");
const { mongoUri } = require("../config/env");

async function connectMongo() {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required to start backend.");
  }

  await mongoose.connect(mongoUri);
}

module.exports = { connectMongo };
