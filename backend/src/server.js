const app = require("./app");
const { port } = require("./config/env");
const { initializeDatabase } = require("./db/mongodb");

async function startServer() {
  initializeDatabase();
  app.listen(port, () => {
    console.log(`Backend listening on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
