import mongoose from 'mongoose';
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import User from "../models/User.js";
import auth from "../middleware/auth.js";
import Task from "../models/Task.js";
import SavedTask from "../models/savedTask.js";
import SavedProvider from "../models/SavedProvider.js";
import ActivityLog from "../models/ActivityLog.js";  // ✅ Import ActivityLog
import Provider from '../models/Providers.js';

const router = express.Router();

// ========================
// 📸 MULTER CONFIGURATION
// ========================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads/avatars";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${req.user.id}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const isValid =
      allowed.test(file.mimetype) && allowed.test(path.extname(file.originalname).toLowerCase());
    if (isValid) cb(null, true);
    else cb(new Error("Only image files (jpeg, jpg, png, webp) are allowed!"));
  },
});

// ========================
// ✅ GET USER PROFILE
// ========================
router.get("/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error("❌ Error fetching profile:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========================
// ✅ UPDATE USER PROFILE (IMMEDIATE SAVE - NO APPROVAL)
// ========================
router.put("/profile", auth, upload.single("profileImage"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const updates = { ...req.body };
    const profileComplete = updates.profileComplete === 'true';
    
    // Handle profile image
    if (req.file) {
      updates.profileImage = req.file.filename;

      // Delete old image if exists
      if (user.profileImage) {
        const oldPath = path.join("uploads/avatars", user.profileImage);
        if (fs.existsSync(oldPath)) {
          fs.unlink(oldPath, (err) => {
            if (err) console.warn("⚠️ Could not delete old profile image:", err);
          });
        }
      }
    }

    // ✅ CHECK PHONE UNIQUENESS (if phone is being updated/changed)
    if (updates.phone && updates.phone !== user.phone) {
      const existingPhone = await User.findOne({ 
        phone: updates.phone, 
        _id: { $ne: req.user.id } // Exclude current user
      });
      
      if (existingPhone) {
        return res.status(400).json({ 
          success: false, 
          message: "Phone number already in use by another account" 
        });
      }
    }

    // ✅ CHECK WHATSAPP UNIQUENESS (if whatsapp is being updated/changed)
    if (updates.whatsapp && updates.whatsapp !== user.whatsapp) {
      const existingWhatsApp = await User.findOne({ 
        whatsapp: updates.whatsapp, 
        _id: { $ne: req.user.id } // Exclude current user
      });
      
      if (existingWhatsApp) {
        return res.status(400).json({ 
          success: false, 
          message: "WhatsApp number already in use by another account" 
        });
      }
    }
    
    // Update user fields directly - IMMEDIATE SAVE
    const fieldsToUpdate = [
      'fname', 'sname', 'businessName', 'phone', 'whatsapp', 
      'city', 'region', 'profileImage', 'district'
    ];
    
    // Check if this is the initial profile completion
    const requiredFields = ['fname', 'sname', 'phone', 'whatsapp', 'city', 'region', 'district'];
    const isInitialProfileSetup = requiredFields.every(field => 
      !user[field] || user[field].trim() === ''
    );
    
    // Update fields
    fieldsToUpdate.forEach(field => {
      if (updates[field] !== undefined) {
        user[field] = updates[field];
      }
    });
    
    // Mark profile as complete if all required fields are filled
    const allRequiredFilled = requiredFields.every(field => 
      user[field] && user[field].trim() !== ''
    );
    
    if (allRequiredFilled && isInitialProfileSetup) {
      user.profileComplete = true;
      user.profileCompletedAt = new Date();
    }
    
    // Save the user directly to database
    await user.save();
    
    // Return updated user
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.json({
      success: true,
      message: allRequiredFilled 
        ? "Profile saved successfully! Your information is now complete and locked." 
        : "Profile updated successfully!",
      user: userResponse,
      profileComplete: user.profileComplete
    });

  } catch (error) {
    console.error("❌ Error updating profile:", error);
    
    // Handle duplicate key errors (just in case)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        success: false, 
        message: `${field} already in use by another account` 
      });
    }
    
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ User statistics
router.get("/stats", auth, async (req, res) => {
  try {
    const clientId = req.user._id;
    const userId = req.user._id;

    // Count all tasks created by this user
    const totalTasks = await Task.countDocuments({ clientId });

    // Count all saved jobs
    const savedJobs = await SavedTask.countDocuments({ userId });

    //count all saved providers
    const savedProviders = await SavedProvider.countDocuments({
      userId
    });

    // Calculate account age
    const joinedDate = req.user.createdAt;
    const daysOnPlatform = Math.floor(
      (Date.now() - new Date(joinedDate)) / (1000 * 60 * 60 * 24)
    );

     // 4. Count profile views - views on THIS user's profile
    const profileViews = await ActivityLog.countDocuments({
      targetId: userId,
      targetModel: 'User',
      actionType: 'view'
    });

    // 5. Count profile saves - how many times THIS user's profile was saved
    // First, find the provider ID associated with this user
    const provider = await Provider.findOne({ userId });
    let profileSaves = 0;
    
    if (provider) {
      // Count how many times this provider was saved
      profileSaves = await SavedProvider.countDocuments({ 
        providerId: provider._id 
      });
    }

    res.json({
      success: true,
      stats: {
        totalTasks,
        savedJobs,
        savedProviders,
        myServices: req.user.services ? req.user.services.length : 0,
        joined: joinedDate,
        profileViews,
        profileSaves
      },
    });
  } catch (error) {
    console.error("❌ Error fetching user stats:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching stats: " + error.message,
    });
  }
});

// ========================
// ✅ SUBMIT PROFILE CHANGES FOR APPROVAL
// ========================
router.post("/profile/pending", auth, upload.single("profileImage"), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check if already has pending changes
    if (user.hasPendingChanges) {
      return res.status(400).json({ 
        success: false, 
        message: "You already have pending changes waiting for approval" 
      });
    }

    const updates = { ...req.body };
    
    // Handle profile image
    if (req.file) {
      updates.profileImage = req.file.filename;
    }

    // ✅ CHECK PHONE UNIQUENESS
    if (updates.phone && updates.phone !== user.phone) {
      const existingPhone = await User.findOne({ 
        phone: updates.phone, 
        _id: { $ne: req.user.id }
      });
      
      if (existingPhone) {
        return res.status(400).json({ 
          success: false, 
          message: "Phone number already in use by another account" 
        });
      }
    }

    // ✅ CHECK WHATSAPP UNIQUENESS
    if (updates.whatsapp && updates.whatsapp !== user.whatsapp) {
      const existingWhatsApp = await User.findOne({ 
        whatsapp: updates.whatsapp, 
        _id: { $ne: req.user.id }
      });
      
      if (existingWhatsApp) {
        return res.status(400).json({ 
          success: false, 
          message: "WhatsApp number already in use by another account" 
        });
      }
    }

    // Save original data if not already saved
    if (!user.originalProfileData) {
      user.originalProfileData = {
        fname: user.fname,
        sname: user.sname,
        businessName: user.businessName,
        email: user.email,
        phone: user.phone,
        whatsapp: user.whatsapp,
        city: user.city,
        region: user.region,
        district: user.district,
        profileImage: user.profileImage
      };
    }

    // Prepare pending data
    const pendingData = {};
    const fieldsToUpdate = [
      'fname', 'sname', 'businessName', 'phone', 'whatsapp', 
      'city', 'region', 'district', 'profileImage'
    ];
    
    fieldsToUpdate.forEach(field => {
      if (updates[field] !== undefined) {
        pendingData[field] = updates[field];
      }
    });

    // Store pending changes
    user.pendingProfileData = pendingData;
    user.hasPendingChanges = true;
    user.pendingChangesSubmittedAt = new Date();
    
    await user.save();

    // Return response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      success: true,
      message: "Profile changes submitted for admin approval",
      submittedAt: user.pendingChangesSubmittedAt,
      user: userResponse
    });

  } catch (error) {
    console.error("❌ Error submitting pending changes:", error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        success: false, 
        message: `${field} already in use by another account` 
      });
    }
    
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ========================
// ✅ GET PENDING CHANGES STATUS
// ========================
router.get("/profile/pending-status", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('hasPendingChanges pendingChangesSubmittedAt pendingProfileData');
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      hasPendingChanges: user.hasPendingChanges,
      submittedAt: user.pendingChangesSubmittedAt,
      pendingData: user.pendingProfileData
    });

  } catch (error) {
    console.error("❌ Error fetching pending status:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========================
// ✅ REQUEST ACCOUNT DELETION
// ========================
router.post("/request-deletion", auth, async (req, res) => {
  try {
    const { userId, email, reason } = req.body;
    
    // Find the authenticated user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }
    
    // Security check - ensure the user is only deleting their own account
    if (user._id.toString() !== userId && user.email !== email) {
      return res.status(403).json({ 
        success: false, 
        message: "Unauthorized: You can only request deletion for your own account" 
      });
    }
    
    // Mark account for deletion
    user.accountSuspended = true;
    user.deletionRequested = true;
    user.deletionReason = reason || "No reason provided";
    user.deletionRequestedAt = new Date();
    user.scheduledDeletionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    await user.save();
    
    // You could also send an email to the user and admin here
    
    res.json({
      success: true,
      message: "Deletion request submitted successfully. Your account will be permanently deleted after 30 days.",
      scheduledDeletion: user.scheduledDeletionDate
    });
    
  } catch (error) {
    console.error("❌ Error requesting deletion:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error processing deletion request" 
    });
  }
});

export default router;
