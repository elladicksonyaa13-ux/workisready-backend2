import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Admin from "../models/Admin.js";

const ADMIN_ROLES = ["superadmin", "subadmin", "supersubadmin"];

// =============================================
// USER AUTH MIDDLEWARE
// =============================================
export const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    console.log("Auth middleware - Token received:", token ? "Yes" : "No");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded token:", decoded);

    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token is not valid - user not found'
      });
    }

    // Check if user is suspended
    if (user.isSuspended) {
      if (user.suspensionEndsAt && new Date(user.suspensionEndsAt) < new Date()) {
        // Auto-unsuspend if suspension has expired
        user.isSuspended = false;
        user.suspendedAt = null;
        user.suspendedBy = null;
        user.suspensionReason = "";
        user.suspensionEndsAt = null;
        await user.save();
        console.log("✅ Suspension expired - auto unsuspended");
      } else {
        console.log("🚫 Suspended user blocked:", user.email);
        return res.status(403).json({
          success: false,
          message: "Account suspended",
          isSuspended: true,
          suspensionReason: user.suspensionReason,
          suspensionEndsAt: user.suspensionEndsAt
        });
      }
    }

    // Check token version (invalidates old tokens after password change etc.)
    if (user.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please login again.',
        sessionExpired: true
      });
    }

    req.user = user;
    console.log("User authenticated:", user.email);
    next();

  } catch (error) {
    console.error('Auth middleware error:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }

    res.status(500).json({ success: false, message: 'Server error in authentication' });
  }
};


// =============================================
// ADMIN AUTH MIDDLEWARE
// =============================================
export const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    console.log("Admin auth - Token received");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Admin auth - Decoded token:", decoded);

    // ✅ Fixed: check against actual admin roles, not the invalid "admin" string
    if (!ADMIN_ROLES.includes(decoded.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required'
      });
    }

    const admin = await Admin.findById(decoded.id).select('-password');

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Block inactive admins
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Admin account is inactive'
      });
    }

    req.admin = admin;
    req.user = admin; // For compatibility with routes that use req.user
    console.log("Admin authenticated:", admin.email, "| Role:", admin.role);
    next();

  } catch (err) {
    console.error('Admin auth error:', err);

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }

    res.status(500).json({ success: false, message: 'Server error' });
  }
};


// =============================================
// ROLE-BASED MIDDLEWARE FACTORIES
// =============================================

// Only allow superadmin
export const superAdminOnly = (req, res, next) => {
  if (req.admin?.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Super Admin only.'
    });
  }
  next();
};

// Allow superadmin and supersubadmin
export const superAdminOrSuperSubAdmin = (req, res, next) => {
  const allowed = ['superadmin', 'supersubadmin'];
  if (!allowed.includes(req.admin?.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Insufficient role.'
    });
  }
  next();
};

// Check if admin has a specific permission (for supersubadmin granular access)
export const requirePermission = (permission) => {
  return (req, res, next) => {
    const admin = req.admin;

    // Superadmin has all permissions
    if (admin?.role === 'superadmin') return next();

    // Others must have the specific permission
    if (!admin?.permissions?.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required permission: ${permission}`
      });
    }

    next();
  };
};

export default auth;