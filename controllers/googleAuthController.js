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
export const googleAuthCallback = async (req, res) => {
  try {
    const { code, redirectUri, codeVerifier } = req.body;

    if (!code) {
      return res.status(400).json({ message: "Authorization code is required" });
    }

    console.log("🔑 Processing Google OAuth callback:", {
      codeLength: code.length,
      redirectUri,
      hasCodeVerifier: !!codeVerifier,
    });

    // Prepare token exchange options - REMOVED ": any" TypeScript annotation
    const tokenOptions = {
      code,
      redirect_uri: redirectUri,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    };

    // Add code verifier if provided (for PKCE)
    if (codeVerifier) {
      tokenOptions.code_verifier = codeVerifier;
    }

    // Exchange authorization code for tokens
    const { tokens } = await client.getToken(tokenOptions);

    console.log("✅ Tokens received from Google");

    // Verify the ID token
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      return res.status(400).json({ message: "Google account has no email" });
    }

    // Check if user exists
    let user = await User.findOne({
      $or: [{ email }, { googleId }]
    });

    // Auto-register if not found
    if (!user) {

      const randomPassword = Math.random().toString(36).slice(-8) + 
                            Math.random().toString(36).slice(-8);

      user = await User.create({
        name,
        email,
        profileImage: picture,
        authProvider: "google",
        isVerified: true,
        password: randomPassword,
      });
      console.log("👤 New user created via Google OAuth:", email);
    } else {
       // Update existing user
      if (!user.googleId) {
        user.googleId = googleId;
      }
      if (!user.profileImage && picture) {
        user.profileImage = picture;
      }
      
      // ✅ IMPORTANT: Ensure Google users are verified
      if (!user.isVerified) {
        user.isVerified = true;
        console.log("✅ Auto-verified existing user during Google OAuth:", email);
      }
      
      user.authProvider = "google";
      await user.save();
      console.log("👤 Existing user logged in via Google OAuth:", email);
    }


    // Generate JWT token
    const jwtToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Prepare user response
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage || picture,
      authProvider: user.authProvider,
      userType: user.userType || 'client',
      region: user.region || '',
      location: user.location || '',
      city: user.city || '',
      isApproved: user.isApproved || false,
      isVerified: user.isVerified,
    };

    console.log("✅ Google OAuth successful for:", email);

    res.status(200).json({
      success: true,
      token: jwtToken,
      user: userResponse,
    });

  } catch (error) {
    console.error("❌ Google Auth Callback Error:", error);
    
    // Provide more specific error messages
    let errorMessage = "Google authentication failed";
    let statusCode = 500;

    if (error.message.includes("invalid_grant")) {
      errorMessage = "Authorization code is invalid or expired. Please try again.";
      statusCode = 400;
    } else if (error.message.includes("redirect_uri_mismatch")) {
      errorMessage = "Redirect URI mismatch. Please check your OAuth configuration.";
      statusCode = 400;
    } else if (error.message.includes("code_verifier")) {
      errorMessage = "Invalid code verifier for PKCE flow.";
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message,
    });
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
