// controllers/authController.js - Fixed JavaScript version
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import bcrypt from "bcryptjs";

// Initialize Google OAuth client
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

// ✅ Existing function for direct token (id_token) login
export const googleAuth = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Google token is required" });
    }

    // ✅ Verify token with Google
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      return res.status(400).json({ message: "Google account has no email" });
    }

    // ✅ Check if user exists
    let user = await User.findOne({ 
      $or: [{ email }, { googleId }] 
    });

    // ✅ Auto-register if not found
    if (!user) {
      const randomPassword = Math.random().toString(36).slice(-8) + 
                             Math.random().toString(36).slice(-8);

      user = await User.create({
        name,
        email,
        profileImage: picture,
        isVerified: true,
        authProvider: "google",
        password: randomPassword,
      });

      console.log("New Google user created and auto-verified:", email);
    } else {
      // Update existing user
      if (!user.googleId) {
        user.googleId = googleId;
      }
      if (!user.profileImage && picture) {
        user.profileImage = picture;
      }
      if (!user.isVerified) {
        user.isVerified = true;
        console.log("Auto-verified existing Google user:", email);
      }

      user.authProvider = "google";
      await user.save();
      console.log("Existing Google user updated:", email);
    }

    // ✅ Generate JWT (same as your normal login)
    const jwtToken = jwt.sign(
      { 
        id: user._id,
        tokenVersion: user.tokenVersion || 0
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Check if we're already in the middle of sending a response
    if (res.headersSent) {
      console.log("⚠️ Headers already sent, cannot send response");
      return;
    }

    res.status(200).json({
      success: true,
      token: jwtToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        authProvider: user.authProvider,
        userType: user.userType,
        region: user.region,
        location: user.location,
        city: user.city,
        isApproved: user.isApproved,
        isVerified: user.isVerified,
      },
    });

  } catch (error) {
    console.error("❌ Google Auth Error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        message: "Google authentication failed",
        error: error.message,
      });
    }
  }
};

// ✅ FIXED: Handle OAuth code exchange with better redirect handling
export const googleAuthCallback = async (req, res) => {
  console.log("🔥🔥🔥 GOOGLE CALLBACK HIT 🔥🔥🔥");
  console.log("req.method:", req.method);
  console.log("req.body:", JSON.stringify(req.body, null, 2));
  console.log("req.query:", JSON.stringify(req.query, null, 2));

  // ✅ Read redirectBase from BOTH body and query as fallback
  const redirectBase = 
    req.body?.redirectBase || 
    req.query?.redirectBase || 
    'com.astro13.WorkisReady://auth/callback';  // ← hardcoded fallback

  console.log("📦 redirectBase resolved to:", redirectBase);

  try {
    const { code, redirectUri, codeVerifier, source } = req.body;


    if (!code) {
      const callbackUrl = redirectBase || 'com.astro13.WorkisReady://auth/callback';
      const encodedError = encodeURIComponent(JSON.stringify({
        type: 'error',
        message: 'Authorization code is required'
      }));
      
      console.log("❌ No code provided, redirecting to:", `${callbackUrl}?data=${encodedError}`);
      return res.redirect(`${callbackUrl}?data=${encodedError}`);
    }

    console.log("🔑 Processing Google OAuth callback");

    // Exchange code for tokens
    const { tokens } = await client.getToken({
      code,
      redirect_uri: redirectUri,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code_verifier: codeVerifier,
    });

    // Verify ID token
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // Find or create user
    let user = await User.findOne({ $or: [{ email }, { googleId }] });

    if (!user) {
      const randomPassword = Math.random().toString(36).slice(-8);
      user = await User.create({
        name,
        email,
        profileImage: picture,
        authProvider: "google",
        isVerified: true,
        password: randomPassword,
      });
      console.log("✅ Created new Google user:", email);
    } else {
      let needsUpdate = false;
      if (!user.googleId) {
        user.googleId = googleId;
        needsUpdate = true;
      }
      if (!user.profileImage && picture) {
        user.profileImage = picture;
        needsUpdate = true;
      }
      if (!user.isVerified) {
        user.isVerified = true;
        needsUpdate = true;
      }
      if (user.authProvider !== "google") {
        user.authProvider = "google";
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await user.save();
        console.log("✅ Updated existing Google user:", email);
      } else {
        console.log("✅ Found existing Google user:", email);
      }
    }

    // Generate JWT
    const jwtToken = jwt.sign(
      {
        id: user._id,
        tokenVersion: user.tokenVersion || 0
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Prepare user data
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage || picture,
      authProvider: user.authProvider,
      userType: user.userType || 'client',
      isApproved: user.isApproved || false,
      isVerified: user.isVerified,
    };

    console.log("✅ Google OAuth successful for:", email);
    console.log("📱 Source:", source, "| redirectBase:", redirectBase);

    // IMPORTANT: Check if headers are already sent before redirecting
    if (res.headersSent) {
      console.log("⚠️ Headers already sent, cannot redirect");
      return;
    }

    // Perform the redirect
    if (source === 'mobile') {
      const callbackUrl = redirectBase || 'com.astro13.WorkisReady://auth/callback';
      const encodedData = encodeURIComponent(JSON.stringify({
        type: 'success',
        token: jwtToken,
        user: userData
      }));

      const fullRedirectUrl = `${callbackUrl}?data=${encodedData}`;
console.log("📱 Sending HTML redirect for mobile app:", fullRedirectUrl);

return res.send(`
  <!DOCTYPE html>
  <html>
    <head>
      <title>Authentication Successful</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f8f9fa;">
      <div style="max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 15px;">
        <div style="font-size: 50px; margin-bottom: 20px;">✅</div>
        <h2 style="color: #0099cc;">Authentication Successful!</h2>
        <p style="color: #666;">Redirecting you back to the app...</p>
        <a id="redirectLink" href="${fullRedirectUrl}" 
           style="display:inline-block; margin-top:20px; padding: 12px 24px; 
                  background:#0099cc; color:white; border-radius:8px; 
                  text-decoration:none; font-weight:bold;">
          Tap here if not redirected
        </a>
      </div>
      <script>
        const deepLink = "${fullRedirectUrl}";
        window.location.replace(deepLink);
        setTimeout(function() {
          window.location.href = deepLink;
        }, 500);
      </script>
    </body>
  </html>
`);

      
    } else {
      const webRedirectUrl = `${process.env.CLIENT_URL}?token=${jwtToken}`;
      console.log("🌐 Redirecting to web client:", webRedirectUrl);
      
      
        return res.redirect(webRedirectUrl);
      
    }

  } catch (error) {
    console.error("❌ Google Auth Callback Error:", error);
    
    const { redirectBase } = req.body || {};
    const callbackUrl = redirectBase || 'com.astro13.WorkisReady://auth/callback';
    const encodedError = encodeURIComponent(JSON.stringify({
      type: 'error',
      message: error.message || 'Authentication failed'
    }));

    const fullErrorUrl = `${callbackUrl}?data=${encodedError}`;
    console.log("❌ Redirecting with error to:", fullErrorUrl);
    
    // Check if headers are already sent
    if (res.headersSent) {
      console.log("⚠️ Headers already sent, cannot redirect error");
      return;
    }
    
    
      // ✅ Replace with
return res.send(`
  <!DOCTYPE html>
  <html>
    <head><title>Authentication Failed</title></head>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
      <h2 style="color: #dc2626;">Authentication Failed</h2>
      <p>Redirecting back to app...</p>
      <script>
        window.location.replace("${fullErrorUrl}");
        setTimeout(function() {
          window.location.href = "${fullErrorUrl}";
        }, 500);
      </script>
    </body>
  </html>
`);
    
  }
};

// If you have registerUser and loginUser in this same file, export them too
export const registerUser = async (req, res) => {
  // Your existing registerUser code here
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    res.status(201).json({ message: "User registered successfully", user: newUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const loginUser = async (req, res) => {
  // Your existing loginUser code here
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Add this new endpoint for manual verification if needed
export const verifyGoogleUser = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: "Email is required" 
      });
    }
    
    const user = await User.findOne({ email, authProvider: "google" });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "Google user not found" 
      });
    }
    
    // Force verify Google user
    if (!user.isVerified) {
      user.isVerified = true;
      await user.save();
      
      return res.json({
        success: true,
        message: "Google user verified successfully",
        user: {
          id: user._id,
          email: user.email,
          isVerified: user.isVerified,
        },
      });
    }
    
    res.json({
      success: true,
      message: "User is already verified",
      user: {
        id: user._id,
        email: user.email,
        isVerified: user.isVerified,
      },
    });
    
  } catch (error) {
    console.error("Verify Google user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};