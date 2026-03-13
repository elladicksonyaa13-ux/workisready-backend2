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
    const { email, name, picture, sub:googleId } = payload;

    if (!email) {
      return res.status(400).json({ message: "Google account has no email" });
    }

    // ✅ Check if user exists
    let user = await User.findOne({ 
      $or: [{email }, { googleId }] });

      //generate random password for google users.

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
      //Update existing user
      if (!user.googleId) {
        user.googleId = googleId;
      }
      if (!user.profileImage && picture) {
        user.profileImage = picture;
      }

      if (!user.isVerified){
        user.isVerified = true;
        console.log("Auto-verified existing Google user:", email);
      }

      user.authProvider = "google";
      await user.save();
      console.log("Existing Google user updated:", email);
    }

    // ✅ Generate JWT (same as your normal login)
    const jwtToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

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
    res.status(500).json({
      message: "Google authentication failed",
      error: error.message,
    });
  }
};

// ✅ NEW FUNCTION: Handle OAuth code exchange (for mobile/web OAuth flow)
// controllers/googleAuthController.js



export const googleAuthCallback = async (req, res) => {
  // 🔴🔴🔴 CRITICAL DEBUG - REMOVE AFTER TESTING 🔴🔴🔴
  console.log("🔥🔥🔥 GOOGLE CALLBACK HIT 🔥🔥🔥");
  console.log("req.method:", req.method);
  console.log("req.body:", JSON.stringify(req.body, null, 2));
  console.log("req.query:", JSON.stringify(req.query, null, 2));
  console.log("source value:", req.body?.source);
  // 🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴



  try {
    const { code, redirectUri, codeVerifier, source } = req.body;

    if (!code) {
      // Return HTML that closes the browser
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Error</title></head>
          <body>
            <script>
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: 'Authorization code is required'
              }));
              setTimeout(() => window.close(), 100);
            </script>
            <p>Error. You can close this window.</p>
          </body>
        </html>
      `);
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
    } else {
      if (!user.googleId) user.googleId = googleId;
      if (!user.profileImage && picture) user.profileImage = picture;
      if (!user.isVerified) user.isVerified = true;
      user.authProvider = "google";
      await user.save();
    }

    // Generate JWT
    const jwtToken = jwt.sign(
      { id: user._id },
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
    console.log("📱 Source received:", source);

    // ✅ CHECK SOURCE BEFORE RETURNING
    if (source === 'mobile') {
      console.log("📱 Returning HTML for mobile app");
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Authentication Successful</title>
          </head>
          <body>
            <script>
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'success',
                token: '${jwtToken}',
                user: ${JSON.stringify(userData)}
              }));
              setTimeout(() => window.close(), 500);
            </script>
            <p>Authentication successful! You can close this window.</p>
          </body>
        </html>
      `);
    } else {
      console.log("🌐 Returning redirect for web");
      return res.redirect(`${process.env.CLIENT_URL}?token=${jwtToken}`);
    }
    
  } catch (error) {  // ← This was missing!
    console.error("❌ Google Auth Callback Error:", error);
    
    // Return error HTML
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Error</title></head>
        <body>
          <script>
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              message: '${error.message || 'Authentication failed'}'
            }));
            setTimeout(() => window.close(), 100);
          </script>
          <p>Authentication failed. You can close this window.</p>
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

// If you're using default export (check your existing code)
