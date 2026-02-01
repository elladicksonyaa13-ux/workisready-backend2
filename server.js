import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import { BASE_URL } from "./config/env.js";

// Import routes
import authRoutes from "./routes/authRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import savedTasks from "./routes/savedTasks.js";
import userRoutes from "./routes/userRoutes.js";
import providerRoutes from "./routes/providerRoutes.js";
import savedWorkerRoutes from "./routes/savedWorkerRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import AdminRoutes from "./routes/adminRoutes.js";
import adminAuthRoutes from "./routes/adminAuthRoutes.js";
import adminUserRoutes from "./routes/admin/users.js"; 
import adminHomeRoutes from "./routes/adminHomeRoutes.js";
import adminProviderRoutes from "./routes/admin/providerRoutes.js";
import adminTaskRoutes from "./routes/admin/taskRoutes.js";


// Load environment variables
dotenv.config();

const app = express();

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
const allowedOrigins = [
  process.env.BASE_URL,           // localhost:5173
  "httpS://africamails.com/workisready",        // Vite
  "http://localhost:5174",        // alt Vite
  "http://10.0.2.2:5173",         // Android emulator → web
  "http://10.0.2.2:5000",         // Android emulator → backend
  "http://localhost",             // RN iOS
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server & mobile apps (no origin header)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn("Blocked by CORS:", origin);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====================================================
// FIX: Serve static files properly
// ====================================================
// This is the CORRECT way to serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Remove these duplicate/conflicting static file configurations:
// app.use("/uploads/tasks", express.static(path.join(__dirname, "uploads/tasks")));
// app.use("/uploads/avatars", express.static(path.join(__dirname, "uploads/avatars")));
// app.use("/uploads", express.static("uploads"));
// ====================================================

// Admin routes
app.use("/api/admin", AdminRoutes);
app.use("/api/admin-auth", adminAuthRoutes);
app.use("/api/home", adminHomeRoutes);
app.use("/api/admin/providers", adminProviderRoutes);
app.use("/api/admin/tasks", adminTaskRoutes);

// Admin user management routes
app.use("/api/admin/users", adminUserRoutes);


// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/saved-tasks", savedTasks);
app.use("/api/users", userRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/saved-workers", savedWorkerRoutes);
app.use("/api/reviews", reviewRoutes);



// Basic route
app.get("/", (req, res) => {
  res.json({ 
    message: "WorkisReady Backend API is running 🚀",
    timestamp: new Date().toISOString()
  });
});

// Health check route
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK",
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected"
  });
});

// Test route for image serving
app.get("/api/test-images", async (req, res) => {
  try {
    const fs = await import('fs');
    const uploadsDir = path.join(__dirname, 'uploads');
    
    if (!fs.existsSync(uploadsDir)) {
      return res.json({
        success: false,
        message: "Uploads directory doesn't exist",
        path: uploadsDir
      });
    }

    // Get all files in uploads directory
    const files = [];
    
    function scanDirectory(dir, basePath = '') {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      items.forEach(item => {
        const itemPath = path.join(dir, item.name);
        const relativePath = basePath ? `${basePath}/${item.name}` : item.name;
        
        if (item.isDirectory()) {
          scanDirectory(itemPath, relativePath);
        } else {
          files.push({
            name: item.name,
            path: relativePath,
            fullPath: itemPath,
            url: `http://localhost:${PORT}/uploads/${relativePath}`
          });
        }
      });
    }
    
    scanDirectory(uploadsDir);
    
    res.json({
      success: true,
      uploadsDir,
      totalFiles: files.length,
      files: files.slice(0, 20) // Show first 20 files
    });
  } catch (error) {
    console.error("Error scanning uploads directory:", error);
    res.status(500).json({
      success: false,
      message: "Error scanning uploads directory",
      error: error.message
    });
  }
});

// Add debug route to see all registered routes
app.get("/api/debug/routes", (req, res) => {
  const routes = [];
  
  function getRoutes(layer, parentPath = "") {
    if (layer.route) {
      const path = parentPath + layer.route.path;
      const methods = Object.keys(layer.route.methods);
      routes.push({ path, methods });
    } else if (layer.name === "router" && layer.handle.stack) {
      let path = parentPath;
      if (layer.path) {
        path += layer.path;
      }
      layer.handle.stack.forEach(sublayer => {
        getRoutes(sublayer, path);
      });
    }
  }
  
  app._router.stack.forEach(layer => {
    getRoutes(layer);
  });
  
  res.json({
    totalRoutes: routes.length,
    routes: routes.sort((a, b) => a.path.localeCompare(b.path))
  });
});

// 404 handler
app.use((req, res) => {
  console.log(`❌ 404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    suggestion: "Check /api/debug/routes for available endpoints"
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// MongoDB connection
const MONGODB_URI = process.env.MONGO_URI || "mongodb://localhost:27017/workisready";

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB Connected successfully");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 API URL: http://localhost:${PORT}`);
  console.log(`📁 Uploads URL: http://localhost:${PORT}/uploads/`);
  console.log(`🔍 Debug routes: http://localhost:${PORT}/api/debug/routes`);
  console.log(`🔧 Test images: http://localhost:${PORT}/api/test-images`);
});
