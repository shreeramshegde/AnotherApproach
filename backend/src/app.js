const express = require("express");
const cors = require("cors");
const reviewRoutes = require("./routes/reviewRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const { corsOrigin } = require("./config/env");

const app = express();

app.use(
  cors({
    origin: corsOrigin,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/reviews", reviewRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use((error, req, res, next) => {
  console.error(error);
  const statusCode = error.statusCode || 500;
  const isClientSafe = statusCode < 500 || error.isClientSafe;
  res.status(statusCode).json({
    error: isClientSafe ? error.message : "Internal server error",
  });
});

module.exports = app;
