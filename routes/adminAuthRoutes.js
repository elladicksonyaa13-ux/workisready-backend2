import express from "express";
import Admin from "../models/Admin.js";
import jwt from "jsonwebtoken";
import { adminAuth, superAdminOnly } from "../middleware/auth.js";
import { createAdminLog } from '../middleware/logAdminActivity.js';

const router = express.Router();

// =============================================
// POST /api/admin-auth/login
// =============================================
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      // ✅ LOG: Failed login attempt (wrong email)
      await createAdminLog({
        req: { admin: null, ip: req.ip, headers: req.headers },
        action: 'LOGIN_FAILED',
        entityType: 'admin',
        details: { email, reason: 'Invalid email' }
      });
      return res.status(400).json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      // ✅ LOG: Failed login attempt (wrong password)
      await createAdminLog({
        req: { admin: null, ip: req.ip, headers: req.headers },
        action: 'LOGIN_FAILED',
        entityType: 'admin',
        details: { email, reason: 'Invalid password' }
      });
      return res.status(400).json({ success: false, message: "Invalid email or password" });
    }

    // Block inactive admins from logging in
    if (!admin.isActive) {
      // ✅ LOG: Failed login attempt (inactive account)
      await createAdminLog({
        req: { admin: null, ip: req.ip, headers: req.headers },
        action: 'LOGIN_FAILED',
        entityType: 'admin',
        details: { email, reason: 'Account inactive' }
      });
      return res.status(403).json({ success: false, message: "Account is inactive. Contact Super Admin." });
    }

    // Update lastLogin
    admin.lastLogin = new Date();
    await admin.save();

    // ✅ Token includes role and permissions for middleware checks
    const token = jwt.sign(
      {
        id: admin._id,
        role: admin.role,
        permissions: admin.permissions || []
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // ✅ LOG: Successful login
    // Note: We need to pass req with admin info for logging
    // Create a modified req object for logging
    const loginReq = {
      ...req,
      admin: admin
    };
    await createAdminLog({
      req: loginReq,
      action: 'LOGIN',
      entityType: 'admin',
      entityId: admin._id,
      entityName: admin.name,
      details: { email: admin.email, role: admin.role }
    });

    res.json({
      success: true,
      token,
      admin: {
        _id: admin._id,
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions || [],
        phone: admin.phone || "",
        profileImage: admin.profileImage || "",
        isActive: admin.isActive,
        lastLogin: admin.lastLogin,
        createdAt: admin.createdAt
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

// =============================================
// POST /api/admin-auth/logout
// =============================================
router.post("/logout", adminAuth, async (req, res) => {
  try {
    // ✅ LOG: Logout
    await createAdminLog({
      req,
      action: 'LOGOUT',
      entityType: 'admin',
      entityId: req.admin._id,
      entityName: req.admin.name,
      details: { email: req.admin.email }
    });

    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =============================================
// GET /api/admin-auth/me
// Returns fresh admin data from DB (used by frontend on mount)
// =============================================
router.get("/me", adminAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      admin: {
        _id: req.admin._id,
        id: req.admin._id,
        name: req.admin.name,
        email: req.admin.email,
        role: req.admin.role,
        permissions: req.admin.permissions || [],
        phone: req.admin.phone || "",
        profileImage: req.admin.profileImage || "",
        isActive: req.admin.isActive,
        lastLogin: req.admin.lastLogin,
        createdAt: req.admin.createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch admin data" });
  }
});

// =============================================
// GET /api/admin-auth/
// Get all admins - superadmin only
// =============================================
router.get("/", adminAuth, superAdminOnly, async (req, res) => {
  try {
    const admins = await Admin.find().select("-password");
    
    // ✅ LOG: View admins list (only log when filters are applied or significant)
    await createAdminLog({
      req,
      action: 'VIEW_ADMINS',
      entityType: 'admin',
      details: { count: admins.length }
    });
    
    res.json({ success: true, admins });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch admins" });
  }
});

export default router;