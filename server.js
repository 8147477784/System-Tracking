const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcryptjs = require("bcryptjs");
const helmet = require("helmet");
const { body, validationResult } = require("express-validator");

// Load environment variables
dotenv.config();

const app = express();

// ============ DATABASE CONNECTION ============
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/tracking-system";
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    process.exit(1);
  }
};

// ============ SCHEMAS & MODELS ============
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const locationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  address: { type: String },
  accuracy: { type: Number },
  timestamp: { type: Date, default: Date.now },
  speed: { type: Number },
});

const User = mongoose.model("User", userSchema);
const Location = mongoose.model("Location", locationSchema);

// ============ MIDDLEWARE SETUP ============
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============ AUTHENTICATION MIDDLEWARE ============
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      status: "error",
      message: "Access token required",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || "your-secret-key", (err, user) => {
    if (err) {
      return res.status(403).json({
        status: "error",
        message: "Invalid or expired token",
      });
    }
    req.user = user;
    next();
  });
};

// ============ VALIDATION MIDDLEWARE ============
const validateCoordinates = [
  body("latitude").isFloat({ min: -90, max: 90 }).withMessage("Invalid latitude"),
  body("longitude").isFloat({ min: -180, max: 180 }).withMessage("Invalid longitude"),
];

// ============ ROUTES - AUTHENTICATION ============
app.post("/auth/register",
  body("username").notEmpty().withMessage("Username required"),
  body("email").isEmail().withMessage("Valid email required"),
  body("password").isLength({ min: 6 }).withMessage("Password must be 6+ characters"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: "error", errors: errors.array() });
      }

      const { username, email, password } = req.body;

      // Check if user exists
      const existingUser = await User.findOne({ $or: [{ email }, { username }] });
      if (existingUser) {
        return res.status(400).json({
          status: "error",
          message: "User already exists",
        });
      }

      // Hash password
      const hashedPassword = await bcryptjs.hash(password, 10);

      // Create user
      const user = new User({
        username,
        email,
        password: hashedPassword,
      });

      await user.save();

      res.status(201).json({
        status: "success",
        message: "User registered successfully",
        data: { userId: user._id, username: user.username, email: user.email },
      });
    } catch (error) {
      console.error("Registration Error:", error);
      res.status(500).json({
        status: "error",
        message: "Registration failed",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

app.post("/auth/login",
  body("email").isEmail().withMessage("Valid email required"),
  body("password").notEmpty().withMessage("Password required"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: "error", errors: errors.array() });
      }

      const { email, password } = req.body;

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({
          status: "error",
          message: "Invalid email or password",
        });
      }

      // Verify password
      const isPasswordValid = await bcryptjs.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({
          status: "error",
          message: "Invalid email or password",
        });
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user._id, username: user.username, email: user.email },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "24h" }
      );

      res.json({
        status: "success",
        message: "Login successful",
        data: { token, user: { userId: user._id, username: user.username, email: user.email } },
      });
    } catch (error) {
      console.error("Login Error:", error);
      res.status(500).json({
        status: "error",
        message: "Login failed",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

// ============ ROUTES - LOCATION TRACKING ============
app.post("/location", authenticateToken, validateCoordinates, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: "error", errors: errors.array() });
    }

    const { latitude, longitude, address, accuracy, speed } = req.body;

    // Create location record
    const location = new Location({
      userId: req.user.userId,
      latitude,
      longitude,
      address: address || null,
      accuracy: accuracy || null,
      speed: speed || null,
    });

    await location.save();

    console.log("📍 Location Saved:", {
      userId: req.user.userId,
      coordinates: { latitude, longitude },
      timestamp: location.timestamp,
    });

    res.status(201).json({
      status: "success",
      message: "Location received and saved successfully",
      data: {
        locationId: location._id,
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
        accuracy: location.accuracy,
        speed: location.speed,
        timestamp: location.timestamp,
      },
    });
  } catch (error) {
    console.error("Location Error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to save location",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ============ ROUTES - LOCATION HISTORY ============
app.get("/location/history", authenticateToken, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;

    const locations = await Location.find({ userId: req.user.userId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Location.countDocuments({ userId: req.user.userId });

    res.json({
      status: "success",
      message: "Location history retrieved successfully",
      data: {
        total,
        count: locations.length,
        locations,
      },
    });
  } catch (error) {
    console.error("History Error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve location history",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ============ ROUTES - GET LATEST LOCATION ============
app.get("/location/latest", authenticateToken, async (req, res) => {
  try {
    const latestLocation = await Location.findOne({ userId: req.user.userId })
      .sort({ timestamp: -1 });

    if (!latestLocation) {
      return res.status(404).json({
        status: "error",
        message: "No location data found",
      });
    }

    res.json({
      status: "success",
      message: "Latest location retrieved successfully",
      data: latestLocation,
    });
  } catch (error) {
    console.error("Latest Location Error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve latest location",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ============ ROUTES - PUBLIC ============
ap.get("/", (req, res) => {
  res.json({
    status: "success",
    message: "Advanced Tracking System API",
    version: "2.0.0",
    endpoints: {
      auth: {
        register: "POST /auth/register",
        login: "POST /auth/login",
      },
      tracking: {
        submitLocation: "POST /location (requires auth)",
        getHistory: "GET /location/history (requires auth)",
        getLatest: "GET /location/latest (requires auth)",
      },
      health: "GET /health",
    },
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// ============ ERROR HANDLING ============
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
    path: req.path,
    timestamp: new Date().toISOString(),
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(err.status || 500).json({
    status: "error",
    message: err.message || "Internal server error",
    error: process.env.NODE_ENV === "development" ? err : undefined,
  });
});

// ============ SERVER INITIALIZATION ============
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

const startServer = async () => {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════╗
║  🚀 Advanced Tracking System       ║
║  Version: 2.0.0                    ║
╠════════════════════════════════════╣
║ Port:       ${PORT}
║ Environment: ${NODE_ENV}
║ Database:   Connected
║ Time:       ${new Date().toISOString()}
╚════════════════════════════════════╝
      `);
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      console.log("⏹️  SIGTERM received. Shutting down gracefully...");
      server.close(() => {
        mongoose.connection.close();
        console.log("✅ Server closed");
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;