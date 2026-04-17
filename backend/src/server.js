const app = require("./app");
const { connectMongo } = require("./db/mongo");
const { port } = require("./config/env");

async function startServer() {
  await connectMongo();
  app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
