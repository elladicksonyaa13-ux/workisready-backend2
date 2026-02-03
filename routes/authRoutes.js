import express from "express";
import crypto from "crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";       // <-- ADD THIS
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { googleAuth } from "../controllers/googleAuthController.js";
import { googleAuthCallback } from "../controllers/googleAuthController.js";
// import { sendVerificationEmail } from "../controllers/authController.js";



const router = express.Router();

router.post("/google", googleAuth);
router.post('/google/callback', googleAuthCallback); // For OAuth code exchange

// ✅ Add GET route for OAuth redirect
router.get('/google/callback', async (req, res) => {
  try {
    // Extract the query parameters Google sends
    const { code, state } = req.query;

    // Forward to your existing controller logic
    // Simulate POST body
    req.body = {
      code,
      redirectUri: 'https://workisready-backend-production-5f8d.up.railway.app/api/auth/google/callback',
    };

    // Call existing controller
    await googleAuthCallback(req, res);
  } catch (err) {
    console.error('GET /google/callback error:', err);
    res.status(500).json({ success: false, message: 'OAuth GET callback failed' });
  }
});

// ✅ EMAIL VERIFICATION ENDPOINT
// In authRoutes.js
router.get("/verify-email/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { redirect } = req.query; // Optional: redirect to frontend after verification

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      // If frontend is specified, redirect there with error
      if (redirect === "frontend" && process.env.FRONTEND_URL) {
        return res.redirect(`${process.env.FRONTEND_URL}/verify-email/error?message=Invalid+token`);
      }
      return sendVerificationHtml(res, false, "Invalid or expired verification token");
    }

    // Mark as verified
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    
    if (user.isApproved || process.env.AUTO_APPROVE_ON_EMAIL_VERIFY === "true") {
      user.isApproved = true;
      user.lastApprovedAt = new Date();
    }

    await user.save();

    // If frontend is specified AND frontend URL is configured, redirect there
    if (redirect === "frontend" && process.env.FRONTEND_URL && process.env.FRONTEND_URL !== "http://localhost:5173") {
      return res.redirect(`${process.env.FRONTEND_URL}/verify-email/success`);
    }

    // Otherwise show HTML success page (for now)
    return sendVerificationHtml(res, true, user);

  } catch (error) {
    console.error("Email verification error:", error);
    
    if (redirect === "frontend" && process.env.FRONTEND_URL) {
      return res.redirect(`${process.env.FRONTEND_URL}/verify-email/error?message=Server+error`);
    }
    
    return sendVerificationHtml(res, false, "Server error during verification");
  }
});

// Helper function for HTML responses
const sendVerificationHtml = (res, success, data) => {
  if (success) {
    const user = data;
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Email Verified - WorkisReady</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script>
          // If frontend is live, try to redirect after 3 seconds
          setTimeout(() => {
            const frontendUrl = "${process.env.FRONTEND_URL}";
            if (frontendUrl && !frontendUrl.includes('localhost')) {
              window.location.href = frontendUrl + '/verify-email/success';
            }
          }, 3000);
        </script>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .success { color: green; }
          .button { 
            background: #0099CC; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 8px;
            display: inline-block;
            margin: 10px;
          }
        </style>
      </head>
      <body>
        <h1 class="success">✅ Email Verified Successfully!</h1>
        <p>Your email: ${user.email}</p>
        <p>You can now log in to your account.</p>
        
        ${process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost') ? 
          `<p>Redirecting to main site in 3 seconds...</p>` : 
          `<a href="/" class="button">Return to WorkisReady</a>`
        }
      </body>
      </html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: red;">❌ Verification Failed</h1>
        <p>${data}</p>
        ${process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost') ? 
          `<a href="${process.env.FRONTEND_URL}" class="button">Go to Main Site</a>` : 
          `<a href="/" class="button">Return to WorkisReady</a>`
        }
      </body>
      </html>
    `);
  }
};

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

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified",
      });
    }

    // Generate new verification token
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");
    const emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    user.emailVerificationToken = emailVerificationToken;
    user.emailVerificationExpires = emailVerificationExpires;
    await user.save();

    // Send verification email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const verificationUrl = `${process.env.API_URL}/api/auth/verify-email/${emailVerificationToken}`;

    await transporter.sendMail({
      from: `"WorkisReady" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify Your WorkisReady Account - New Link",
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2 style="color: #0099CC;">Email Verification</h2>
          <p>You requested a new verification link. Click below to verify your email:</p>
          <a href="${verificationUrl}" 
             style="background-color: #0099CC; color: white; padding: 10px 20px; 
                    text-decoration: none; border-radius: 5px;">
            Verify Email
          </a>
          <p>This link expires in 24 hours.</p>
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

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // ✅ DUAL VERIFICATION CHECK
    // User can login if either email is verified OR admin has approved
    const isVerified = user.isEmailVerified || user.isApproved;
    
    if (!isVerified) {
      return res.status(403).json({
        success: false,
        message: "Account not verified. Please verify your email or wait for admin approval.",
        needsVerification: true,
        isEmailVerified: user.isEmailVerified,
        isApproved: user.isApproved,
      });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
  success: true,
  message: "Login successful",
  user: {
    id: user._id,
    name: user.name,
    email: user.email,
    userType: user.userType,
    isEmailVerified: user.isEmailVerified,
    isApproved: user.isApproved,
    // ✅ ADD THESE FOR FRONTEND COMPATIBILITY:
    emailVerified: user.isEmailVerified, // Add this
    adminVerified: user.isApproved, // Add this
    profileComplete: user.profileComplete || false, // Add this
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

// ✅ UPDATE REGISTRATION TO SEND VERIFICATION EMAIL
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

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

    // Generate verification token
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");
    const emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;

    // Create user
    const user = new User({
      name,
      email,
      password,
      emailVerificationToken,
      emailVerificationExpires,
      isEmailVerified: false,
      isApproved: false,
    });

    await user.save();
    console.log("✅ User created:", user._id);

    // ✅ FIXED: Use API_URL instead of FRONTEND_URL
    const verificationUrl = `${process.env.API_URL}/api/auth/verify-email/${emailVerificationToken}`;
    console.log("🔗 Verification URL:", verificationUrl);

    // Send email asynchronously
    setTimeout(async () => {
      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        await transporter.sendMail({
          from: `"WorkisReady" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: "Verify Your WorkisReady Account",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #0099CC;">Welcome to WorkisReady!</h2>
              <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" 
                   style="background-color: #0099CC; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 5px; font-weight: bold;">
                  Verify Email Address
                </a>
              </div>
              <p>Or copy and paste this link in your browser:</p>
              <p style="word-break: break-all; color: #666; background: #f5f5f5; padding: 10px; border-radius: 4px;">
                ${verificationUrl}
              </p>
              <p>This verification link will expire in 24 hours.</p>
              <p>If you didn't create an account with WorkisReady, please ignore this email.</p>
            </div>
          `,
        });
        
        console.log("✅ Verification email sent to:", email);
      } catch (emailError) {
        console.error("❌ Failed to send verification email:", emailError);
      }
    }, 100);

    // Generate JWT
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      isEmailVerified: false,
      isApproved: false,
      emailVerified: false,
      adminVerified: false,
      profileComplete: false,
    };

    res.status(201).json({
      success: true,
      message: "Registration successful! Please check your email to verify your account.",
      user: userResponse,
      token: token,
      // Include direct link in response for debugging
      verificationLink: verificationUrl,
    });

  } catch (error) {
    console.error("❌ Registration error:", error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Server error during registration: " + error.message,
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
