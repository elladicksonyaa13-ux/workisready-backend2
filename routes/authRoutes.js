import express from "express";
import crypto from "crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";       // <-- ADD THIS
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { googleAuth } from "../controllers/googleAuthController.js";
import { googleAuthCallback } from "../controllers/googleAuthController.js";


const router = express.Router();

router.post("/google", googleAuth);
router.get('/google/callback', googleAuthCallback); // For OAuth code exchange


// Register user
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    console.log("📝 Registration attempt for:", email);

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, and password"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long"
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email"
      });
    }

    // Create new user
    const user = new User({
      name,
      email,
      password
    });

    await user.save();
    console.log("✅ User created:", user._id);

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("🔐 Generated token for registration");

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      },
      token: token
    });

  } catch (error) {
    console.error("❌ Registration error:", error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email"
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Server error during registration: " + error.message
    });
  }
});

// Login user
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("🔑 Login attempt for:", email);

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password"
      });
    }

    // Find user
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      console.log("❌ User not found:", email);
      return res.status(400).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    console.log("✅ User found, comparing password...");

    // ✅ Check if comparePassword method exists
    if (typeof user.comparePassword !== 'function') {
      console.error('❌ comparePassword method missing from User model');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log("❌ Password mismatch for:", email);
      return res.status(400).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    console.log("✅ Password correct, generating token...");

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("🔐 Generated token for login");

    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        userType: user.userType
      },
      token: token
    });

  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during login: " + error.message
    });
  }
});

// Test route to check if user model works
router.post("/test-password", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Test the comparePassword method
    const isMatch = await user.comparePassword(password);
    
    res.json({
      userExists: true,
      passwordMatch: isMatch,
      hasComparePassword: typeof user.comparePassword === 'function'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = Date.now() + 1000 * 60 * 10;

    user.resetToken = resetToken;
    user.resetTokenExpiry = resetTokenExpiry;

    await user.save({ validateBeforeSave: false });

    const resetURL = `${process.env.BASE_URL}/reset-password/${resetToken}`;

    // ✅ Make sure transporter is defined
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: "WorkisReady <yourgmail@gmail.com>",
      to: email,
      subject: "Reset Your WorkisReady Password",
      html: `
        <h2>Password Reset Request</h2>
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetURL}" target="_blank">${resetURL}</a></p>
        <p>This link expires in 10 minutes.</p>
      `,
    });

    res.json({ success: true, message: "Password reset email sent!" });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// Reset Password
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    // Validations...
    
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ success: false, message: "Invalid or expired token" });

    // Manually hash password
    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(password, salt);

    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;

    // 🚀 Prevent pre-save hook from hashing it again
    user.skipPasswordHashing = true;

    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: "Password has been reset successfully!" });

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



export default router;
