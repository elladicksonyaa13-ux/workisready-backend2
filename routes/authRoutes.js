import { Resend } from 'resend';
import express from "express";
import crypto from "crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { googleAuth } from "../controllers/googleAuthController.js";
import { googleAuthCallback } from "../controllers/googleAuthController.js";
// import { sendVerificationEmail } from "../controllers/authController.js";
import { generateCustomUserId } from '../utils/idGenerator.js';



const resend = new Resend(process.env.RESEND_API_KEY);


const router = express.Router();

// Add this at the VERY TOP of your routes, right after router initialization
router.use((req, res, next) => {
  console.log(`📨 INCOMING REQUEST: ${req.method} ${req.url}`);
  next();
});

// TEMPORARY TEST ROUTE - Add this before your other routes
router.get('/test-callback', (req, res) => {
  console.log("✅ TEST ROUTE HIT");
  res.send("Test route working");
});

router.post("/google", googleAuth);
router.post('/google/callback', googleAuthCallback); // For OAuth code exchange

// ✅ Add GET route for OAuth redirect
// ✅ Add GET route for OAuth redirect
// ✅ Add GET route for OAuth redirect
router.get('/google/callback', async (req, res) => {
  console.log("🔥🔥🔥 GET /google/callback HIT 🔥🔥🔥");
  console.log("req.query:", req.query);
  
  try {
    const { code, state } = req.query;
    
    console.log("code present:", !!code);
    console.log("state:", state);

    let source = 'mobile';
    let codeVerifier = null;
    let redirectBase = 'com.astro13.WorkisReady://auth/callback';
    
    if (state) {
      try {
        const stateData = JSON.parse(decodeURIComponent(state));
        source = stateData.source || 'mobile';
        codeVerifier = stateData.codeVerifier || null;
        redirectBase = stateData.redirectBase || redirectBase;
        console.log("Parsed state data:", { source, redirectBase, hasCodeVerifier: !!codeVerifier });
      } catch (e) {
        console.log("State is not JSON:", state);
        if (state === 'web' || state === 'mobile') {
          source = state;
        }
      }
    }

    console.log("Final source:", source);
    console.log("Final redirectBase:", redirectBase);

    req.body = {
      code,
      redirectUri: `${process.env.API_URL}/api/auth/google/callback`,
      source,
      codeVerifier,
      redirectBase,  // ← pass it through to googleAuthCallback
    };

    console.log("Calling googleAuthCallback...");
    await googleAuthCallback(req, res);
    console.log("✅ googleAuthCallback completed");
    
  } catch (err) {
    console.error('❌ GET /google/callback error:', err);

    // Extract redirectBase from state if possible for the error redirect
    let redirectBase = 'com.astro13.WorkisReady://auth/callback';
    try {
      if (req.query.state) {
        const stateData = JSON.parse(decodeURIComponent(req.query.state));
        redirectBase = stateData.redirectBase || redirectBase;
      }
    } catch (_) {}

    const encodedError = encodeURIComponent(JSON.stringify({
      type: 'error',
      message: 'OAuth callback failed'
    }));

    return res.redirect(`${redirectBase}?data=${encodedError}`);
  }
});

// ✅ EMAIL VERIFICATION ENDPOINT

router.get("/verify-email/:token", async (req, res) => {
  try {
    const { token } = req.params;
    console.log("🔍 Verification token received:", token);
    console.log("📍 CLIENT_URL from env:", process.env.CLIENT_URL);

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      console.log("❌ User not found for token:", token);
      const errorUrl = `${process.env.BASE_URL}/verification-error?message=Invalid or expired verification token`;
      console.log("📍 Redirecting to error URL:", errorUrl);
      return res.redirect(errorUrl);
    }

    console.log("✅ User found:", user.email);

    // Mark as verified
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    
    if (user.isApproved || process.env.AUTO_APPROVE_ON_EMAIL_VERIFY === "true") {
      user.isApproved = true;
      user.lastApprovedAt = new Date();
    }

    await user.save();
    
    const authToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const redirectUrl = `${process.env.BASE_URL}/verification-success?token=${authToken}&userId=${user._id}`;
    console.log("📍 Redirecting to success URL:", redirectUrl);
    return res.redirect(redirectUrl);

  } catch (error) {
    console.error("❌ Email verification error:", error);
    
    const errorUrl = `${process.env.BASE_URL}/verification-error?message=Server error during verification`;
    console.log("📍 Redirecting to error URL:", errorUrl);
    return res.redirect(errorUrl);
  }
});



// ✅ RESEND VERIFICATION EMAIL
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Please provide an email address",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with this email",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified",
      });
    }

    // Generate new verification token
    const verificationToken = user.generateVerificationToken();
    await user.save();

    // Send verification email
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_SECURE === "true", 
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const verificationUrl = `${process.env.API_URL}/api/auth/verify-email/${verificationToken}`;

    await transporter.sendMail({
      from: `"WorkisReady" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify Your WorkisReady Account - New Link",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; background-color: #0099CC; color: white; padding: 20px; border-radius: 10px 10px 0 0;">
            <h1>WorkIsReady</h1>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 10px 10px;">
            <h2 style="color: #0099CC;">Email Verification</h2>
            <p>Hello <strong>${user.name}</strong>,</p>
            <p>You requested a new verification link. Click the button below to verify your email:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
                style="background-color: #0099CC; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; font-weight: bold;
                      display: inline-block;">
                Verify Email Address
              </a>
            </div>
            
            <p>Or copy and paste this link in your browser:</p>
            <div style="word-break: break-all; color: #666; background: #fff; padding: 15px; border-radius: 4px; border: 1px solid #ddd; margin: 15px 0;">
              ${verificationUrl}
            </div>
            
            <p>This verification link will expire in 24 hours.</p>
            <p>If you didn't request this, please ignore this email.</p>
            
            <p>Best regards,<br>The WorkisReady Team</p>
          </div>
        </div>
      `,
    });

    res.json({
      success: true,
      message: "Verification email sent successfully",
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resend verification email",
    });
  }
});

// ✅ UPDATE LOGIN TO SUPPORT DUAL VERIFICATION
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("🔑 Login attempt for:", email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }


    // ✅ CHECK FOR SUSPENSION
    if (user.isSuspended) {
      // Check if temporary suspension has expired
      if (user.suspensionEndsAt && user.suspensionEndsAt < new Date()) {
        // Auto-unsuspend if expired
        user.isSuspended = false;
        user.suspendedAt = null;
        user.suspendedBy = null;
        user.suspensionReason = "";
        user.suspensionEndsAt = null;
        await user.save();
      } else {
        // Account is still suspended
        const suspensionMessage = user.suspensionEndsAt
          ? `Your account has been suspended until ${new Date(user.suspensionEndsAt).toLocaleDateString()}. Reason: ${user.suspensionReason || 'Violation of termsx'}`
          : `Your account has been suspended. Reason: ${user.suspensionReason || 'Violation of terms'}. Please contact admin for assistance.`;
        
        return res.status(403).json({
          success: false,
          message: suspensionMessage,
          isSuspended: true,
          suspensionReason: user.suspensionReason,
          suspensionEndsAt: user.suspensionEndsAt
        });
      }
    }

    if (user.deletionRequested) {
      console.log("🗑️ Account deletion requested for:", email);
      const deletionDate = user.scheduledDeletionDate 
        ? new Date(user.scheduledDeletionDate).toLocaleDateString() 
        : 'soon';
      
      return res.status(403).json({
        success: false,
        message: `Your account has been scheduled for deletion and will be permanently removed on ${deletionDate}. Please contact support if you believe this is an error.`,
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // ✅ DUAL VERIFICATION CHECK
    // User can login if either email is verified OR admin has approved
    const isVerified = user.isVerified || user.isApproved;
    
    if (!isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email. Check your inbox for verification link.",
        needsVerification: true,
        isVerified: user.isVerified,
        isApproved: user.isApproved,
        email: user.email,
      });
    }

    const token = jwt.sign(
      { 
    id: user._id,
    tokenVersion: user.tokenVersion || 0// Include version in token
  },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
  success: true,
  message: "Login successful",
  user: {
    id: user._id,
    userId: user.userId, // ✅ Add custom userId
    name: user.name,
    email: user.email,
    userType: user.userType,
    isVerified: user.isVerified,
    isApproved: user.isApproved,
    // ✅ ADD THESE FOR FRONTEND COMPATIBILITY:
    emailVerified: user.isEmailVerified, // Add this
    adminVerified: user.isApproved, // Add this
    profileComplete: user.profileComplete || false, // Add this
    isSuspended: user.isSuspended, // Include this in response

  },
  token: token,
});
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during login: " + error.message,
    });
  }
});

// ✅ UPDATE REGISTRATION TO SEND RESPONSE IMMEDIATELY
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, whatsapp } = req.body;

    console.log("📝 Registration attempt for:", email);

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, and password",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    // ✅ Generate custom ID
    const customId = await generateCustomUserId();

    // Create user
    const user = new User({
      _id: customId, // Use custom ID as _id
      userId: customId, // Also store in userId field for consistency
      name,
      email,
      password,
    });

    // Only add phone if it exists and is not empty
    if (phone && phone.trim() !== '') {
      userData.phone = phone;
    }

    // Only add whatsapp if it exists and is not empty
    if (whatsapp && whatsapp.trim() !== '') {
      userData.whatsapp = whatsapp;
    }

    const verificationToken = user.generateVerificationToken();
    await user.save();
    console.log("✅ User created:", user._id);

    // ✅ SEND RESPONSE IMMEDIATELY - before sending email
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      isVerified: false,
      isApproved: false,
    };

    // Send success response right away
    res.status(201).json({
      success: true,
      message: "Registration successful! Please check your email to verify your account.",
      user: userResponse,
      token: token,
    });


try {
  const verificationUrl = `${process.env.API_URL}/api/auth/verify-email/${verificationToken}`;
  
  await resend.emails.send({
    from: process.env.FROM_EMAIL || 'WorkisReady <on@resend.dev>', // Use on@resend.dev for testing
    to: email,
    subject: 'Verify Your WorkisReady Account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; background-color: #0099CC; color: white; padding: 20px; border-radius: 10px 10px 0 0;">
          <h1>WorkIsReady</h1>
        </div>
        <div style="padding: 30px; background-color: #f9f9f9; border-radius: 0 0 10px 10px;">
          <h2 style="color: #0099CC;">Welcome to WorkisReady!</h2>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
              style="background-color: #0099CC; color: white; padding: 20px 90px; 
                    text-decoration: none; border-radius: 5px; font-weight: bold;
                    display: inline-block;">
              Verify Email Address
            </a>
          </div>
          
          <p>Or copy and paste this link in your browser:</p>
          <div style="word-break: break-all; color: #666; background: #fff; padding: 15px; border-radius: 4px; border: 1px solid #ddd; margin: 15px 0;">
            ${verificationUrl}
          </div>
          
          <p>This verification link will expire in 24 hours.</p>
          <p>If you didn't create an account with WorkisReady, please ignore this email.</p>
          
          <p>Best regards,<br>The WorkisReady Team</p>
        </div>
      </div>
    `,
  });
  
  console.log("✅ Verification email sent to:", email);
} catch (emailError) {
  console.error("❌ Failed to send verification email:", emailError);
  // Don't throw - user already got success response
}

  } catch (error) {
    console.error("❌ Registration error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    // Only send error response if we haven't already sent success
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Server error during registration: " + error.message,
      });
    }
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

    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Passwords do not match" 
      });
    }

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid or expired token" 
      });
    }

    // ✅ JUST SET THE PLAIN PASSWORD - let the pre-save hook hash it
    user.password = password;
    
    // Clear reset token fields
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;

    // ❌ REMOVE all this manual hashing:
    // const salt = await bcrypt.genSalt(12);
    // user.password = await bcrypt.hash(password, salt);
    // user.skipPasswordHashing = true;

    await user.save(); // The pre-save hook will hash it automatically

    res.json({ 
      success: true, 
      message: "Password has been reset successfully!" 
    });

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});


// ✅ VALIDATE RESET TOKEN
router.get("/validate-reset-token/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    res.json({
      success: true,
      message: "Token is valid",
    });
  } catch (error) {
    console.error("Token validation error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during token validation",
    });
  }
});



// DEBUG: Test password comparison directly
router.post("/debug-password", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.json({ 
        success: false, 
        message: "User not found",
        email 
      });
    }
    
    // Log the stored password hash
    console.log("🔍 User found:", {
      id: user._id,
      email: user.email,
      passwordHash: user.password ? user.password.substring(0, 30) + "..." : "MISSING",
      hasCompareMethod: typeof user.comparePassword === 'function'
    });
    
    // Test 1: Using the model's comparePassword method
    let methodResult = false;
    try {
      methodResult = await user.comparePassword(password);
      console.log("📊 comparePassword result:", methodResult);
    } catch (err) {
      console.error("❌ comparePassword error:", err);
    }
    
    // Test 2: Direct bcrypt comparison
    let directResult = false;
    try {
      directResult = await bcrypt.compare(password, user.password);
      console.log("📊 bcrypt.compare result:", directResult);
    } catch (err) {
      console.error("❌ bcrypt.compare error:", err);
    }
    
    // Test 3: Check if password field exists and is properly formatted
    const passwordValid = user.password && 
                         typeof user.password === 'string' && 
                         user.password.startsWith('$2b$');
    
    res.json({
      success: true,
      userExists: true,
      passwordFieldExists: !!user.password,
      passwordFormat: passwordValid ? "Valid bcrypt hash" : "Invalid format",
      comparePasswordMethod: methodResult,
      bcryptCompare: directResult,
      // Don't send the actual hash in production!
      hashPreview: user.password ? user.password.substring(0, 20) + "..." : null
    });
    
  } catch (error) {
    console.error("❌ Debug error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});


export default router;
