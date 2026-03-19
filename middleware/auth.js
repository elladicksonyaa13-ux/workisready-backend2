import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Admin from "../models/Admin.js"; // your admin model


export const auth = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    console.log("Auth middleware - Token received:", token ? "Yes" : "No");
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }

    // ✅ VERIFY JWT TOKEN
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded token:", decoded);
    
    // Find user by ID from token
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token is not valid - user not found'
      });
    }

    // ✅ CHECK IF USER IS SUSPENDED
    if (user.isSuspended) {
  // Check if temporary suspension has expired
  if (user.suspensionEndsAt && new Date(user.suspensionEndsAt) < new Date()) {
    // Auto-unsuspend
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

    // ✅ CHECK TOKEN VERSION (if you implement it)
    if (user.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please login again.',
        sessionExpired: true
      });
    }

    // Attach user to request object
    req.user = user;
    console.log("User authenticated:", user.email);
    next();
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};


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

    // Check if this is an admin token (has role: "admin" or from Admin model)
    if (decoded.role === "admin") {
      // This token was created from Admin login
      const admin = await Admin.findById(decoded.id).select('-password');
      if (!admin) {
        return res.status(401).json({ 
          success: false, 
          message: 'Admin not found' 
        });
      }
      
      req.admin = admin;
      req.user = admin; // For compatibility
      console.log("Admin authenticated via Admin model:", admin.email);
    } else {
      // This token was created from User login
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          message: 'User not found' 
        });
      }
      
      // Check if user has admin privileges
      if (user.userType !== "admin" && user.role !== "admin") {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied. Admin privileges required' 
        });
      }
      
      req.admin = user;
      req.user = user;
      console.log("Admin authenticated via User model:", user.email);
    }
    
    next();
  } catch (err) {
    console.error('Admin auth error:', err);
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

export default auth;