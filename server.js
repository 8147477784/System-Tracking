const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

const app = express();

// ============ MIDDLEWARES ============
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true
}));

// Limit request size to prevent large payloads
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============ ROUTES ============
app.get("/", (req, res) => {
  res.json({
    status: "success",
    message: "Server running",
    timestamp: new Date().toISOString()
  });
});

app.post("/location", (req, res) => {
  try {
    const { latitude, longitude, address } = req.body;

    // Validation
    if (!latitude || !longitude) {
      return res.status(400).json({
        status: "error",
        message: "latitude and longitude are required"
      });
    }

    // Validate coordinate values
    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        status: "error",
        message: "latitude and longitude must be valid numbers"
      });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        status: "error",
        message: "Invalid coordinate range"
      });
    }

    console.log("Received Location:", { latitude, longitude, address });

    res.status(200).json({
      status: "success",
      message: "Location received successfully",
      data: {
        latitude,
        longitude,
        address: address || null,
        receivedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Error processing location:", error);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

// ============ HEALTH CHECK ============
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ============ 404 HANDLER ============
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
    path: req.path
  });
});

// ============ ERROR HANDLER ============
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(err.status || 500).json({
    status: "error",
    message: err.message || "Internal server error"
  });
});

// ============ PORT SETTINGS ============
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════╗
║   King Server is LIVE! 👑     ║
╠═══════════════════════════════╣
║ Port: ${PORT}
║ Environment: ${NODE_ENV}
║ Time: ${new Date().toISOString()}
╚═══════════════════════════════╝
  `);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

module.exports = app;