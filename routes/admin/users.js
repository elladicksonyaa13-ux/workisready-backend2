import express from "express";
import User from "../../models/User.js";
import { adminAuth } from "../../middleware/auth.js"; // Import named export
import jwt from "jsonwebtoken";


const router = express.Router();

// ==============================
// ✅ GET ALL USERS (ADMIN)
// ==============================
router.get("/", adminAuth, async (req, res) => {
  try {
    // NO NEED TO CHECK ADMIN ROLE - adminAuth already verified it
    // The admin is available at req.admin (not req.user)
    console.log("Admin accessing users:", req.admin.email);
    
    const users = await User.find().select("-password");
     // Add hasPendingChanges flag to each user
    const usersWithPendingFlag = users.map(user => {
      const userObj = user.toObject();
      userObj.hasPendingChanges = user.hasPendingChanges || false;
      return userObj;
    });
    res.json({ success: true, users: usersWithPendingFlag });
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==============================
// ✅ CREATE USER (ADMIN) - UPDATED
// ==============================
router.post("/", adminAuth, async (req, res) => {
  try {
    console.log("Creating user by admin:", req.admin.email);

    const { fname, sname, email, password, phone, whatsapp, userType } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    // Create new user (automatically approved AND email verified if created by admin)
    const newUser = new User({
      fname,
      sname,
      email,
      password,
      phone,
      whatsapp,
      userType: userType || "client",
      isApproved: true, // Admin-created users are automatically approved
      isVerified: true, // Add this line
      lastApprovedAt: new Date()
    });

    await newUser.save();

    const userResponse = newUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: userResponse
    });
  } catch (error) {
    console.error("❌ Error creating user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ==============================
// ✅ APPROVE USER ACCOUNT - UPDATED
// ==============================
router.patch("/:id/approve", adminAuth, async (req, res) => {
  try {
    console.log("Approving user by admin:", req.admin.email);

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // ✅ UPDATE BOTH FIELDS
    user.isApproved = true;
    user.isVerified = true; // Add this line
    user.lastApprovedAt = new Date();
    user.hasPendingChanges = false;
    user.pendingProfileData = null;
    user.verificationToken = undefined; // Clear verification token
    user.verificationTokenExpires = undefined; // Clear expiry
    
    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      success: true,
      message: "User approved successfully",
      user: userResponse
    });
  } catch (error) {
    console.error("❌ Error approving user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// ==============================
// ✅ DISAPPROVE USER ACCOUNT
// ==============================
router.patch("/:id/disapprove", adminAuth, async (req, res) => {
  try {
    // NO NEED TO CHECK - adminAuth already verified admin access
    console.log("Disapproving user by admin:", req.admin.email);

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Update approval status
    user.isApproved = false;
    user.hasPendingChanges = false; // Clear any pending changes when disapproving
    user.pendingProfileData = null;
    
    await user.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      success: true,
      message: "User disapproved successfully",
      user: userResponse
    });
  } catch (error) {
    console.error("❌ Error disapproving user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==============================
// ✅ APPROVE PENDING CHANGES
// ==============================
router.patch("/:id/approve-changes", adminAuth, async (req, res) => {
  try {
    // NO NEED TO CHECK - adminAuth already verified admin access
    console.log("Approving changes by admin:", req.admin.email);

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.hasPendingChanges || !user.pendingProfileData) {
      return res.status(400).json({ success: false, message: "No pending changes to approve" });
    }

    // Apply pending changes to user profile
    const pendingData = user.pendingProfileData;
    
    // Update user fields from pending data
    if (pendingData.fname !== undefined) user.fname = pendingData.fname;
    if (pendingData.sname !== undefined) user.sname = pendingData.sname;
    if (pendingData.businessName !== undefined) user.businessName = pendingData.businessName;
    if (pendingData.email !== undefined) user.email = pendingData.email;
    if (pendingData.phone !== undefined) user.phone = pendingData.phone;
    if (pendingData.whatsapp !== undefined) user.whatsapp = pendingData.whatsapp;
    if (pendingData.district !== undefined) user.district = pendingData.district;
    if (pendingData.region !== undefined) user.region = pendingData.region;
    if (pendingData.city !== undefined) user.city = pendingData.city;
    if (pendingData.profileImage !== undefined) user.profileImage = pendingData.profileImage;

    // Update original profile data to current state
    user.originalProfileData = {
      fname: user.fname,
      sname: user.sname,
      businessName: user.businessName,
      email: user.email,
      phone: user.phone,
      whatsapp: user.whatsapp,
      district: user.district,
      region: user.region,
      city: user.city,
      profileImage: user.profileImage,
      updatedAt: new Date()
    };

    // Clear pending changes
    user.pendingProfileData = null;
    user.hasPendingChanges = false;
    user.pendingChangesSubmittedAt = null;
    user.lastApprovedAt = new Date();

    await user.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      success: true,
      message: "User changes approved successfully",
      user: userResponse
    });
  } catch (error) {
    console.error("❌ Error approving user changes:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==============================
// ✅ REJECT PENDING CHANGES
// ==============================
router.patch("/:id/reject-changes", adminAuth, async (req, res) => {
  try {
    // NO NEED TO CHECK - adminAuth already verified admin access
    console.log("Rejecting changes by admin:", req.admin.email);

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.hasPendingChanges) {
      return res.status(400).json({ success: false, message: "No pending changes to reject" });
    }

    // Clear pending changes
    user.pendingProfileData = null;
    user.hasPendingChanges = false;
    user.pendingChangesSubmittedAt = null;

    await user.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      success: true,
      message: "User changes rejected successfully",
      user: userResponse
    });
  } catch (error) {
    console.error("❌ Error rejecting user changes:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==============================
// ✅ BULK APPROVE USERS - UPDATED
// ==============================
router.patch("/bulk-approve", adminAuth, async (req, res) => {
  try {
    console.log("Bulk approve by admin:", req.admin.email);

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "No users selected" });
    }

    // Update all selected users
    const result = await User.updateMany(
      { _id: { $in: ids } },
      { 
        $set: { 
          isApproved: true,
          isVerified: true, // Add this line
          lastApprovedAt: new Date(),
          hasPendingChanges: false,
          pendingProfileData: null,
          pendingChangesSubmittedAt: null,
          verificationToken: undefined, // Clear verification token
          verificationTokenExpires: undefined // Clear expiry
        }
      }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} user(s) approved successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("❌ Error bulk approving users:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==============================
// ✅ BULK DISAPPROVE USERS
// ==============================
router.patch("/bulk-disapprove", adminAuth, async (req, res) => {
  try {
    // NO NEED TO CHECK - adminAuth already verified admin access
    console.log("Bulk disapprove by admin:", req.admin.email);

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "No users selected" });
    }

    // Update all selected users
    const result = await User.updateMany(
      { _id: { $in: ids } },
      { 
        $set: { 
          isApproved: false,
          hasPendingChanges: false,
          pendingProfileData: null,
          pendingChangesSubmittedAt: null
        }
      }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} user(s) disapproved successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("❌ Error bulk disapproving users:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==============================
// ✅ UPDATE USER (ADMIN) - IMPROVED
// ==============================
router.put("/:id", adminAuth, async (req, res) => {
  try {
    console.log("Updating user by admin:", req.admin.email);
    console.log("Request body:", req.body);

    const { fname, sname, email, phone, whatsapp, userType } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Track if name needs updating
    let nameUpdated = false;

    // Update user fields
    if (fname !== undefined) {
      user.fname = fname;
      nameUpdated = true;
    }
    
    if (sname !== undefined) {
      user.sname = sname;
      nameUpdated = true;
    }
    
    // Update name field if either fname or sname changed
    if (nameUpdated) {
      user.name = `${user.fname || ''} ${user.sname || ''}`.trim();
      // If both are empty, set to email username as fallback
      if (!user.name && user.email) {
        user.name = user.email.split('@')[0];
      }
    }
    
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (whatsapp !== undefined) user.whatsapp = whatsapp;
    if (userType !== undefined) user.userType = userType;

    await user.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      success: true,
      message: "User updated successfully",
      user: userResponse
    });
  } catch (error) {
    console.error("❌ Error updating user:", error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        success: false, 
        message: `${field} already exists` 
      });
    }
    
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// ==============================
// ✅ DELETE USER (ADMIN)
// ==============================
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    // NO NEED TO CHECK - adminAuth already verified admin access
    console.log("Deleting user by admin:", req.admin.email);

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await user.deleteOne();

    res.json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==============================
// ✅ BULK DELETE USERS
// ==============================
router.delete("/bulk-delete", adminAuth, async (req, res) => {
  try {
    // NO NEED TO CHECK - adminAuth already verified admin access
    console.log("Bulk delete by admin:", req.admin.email);

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "No users selected" });
    }

    // Delete all selected users
    const result = await User.deleteMany({ _id: { $in: ids } });

    res.json({
      success: true,
      message: `${result.deletedCount} user(s) deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("❌ Error bulk deleting users:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==============================
// ✅ GET USERS WITH PENDING CHANGES
// ==============================
router.get("/pending-changes", adminAuth, async (req, res) => {
  try {
    console.log("Fetching users with pending changes by admin:", req.admin.email);
    
    const users = await User.find({ 
      hasPendingChanges: true,
      pendingProfileData: { $ne: null }
    }).select("-password");
    
    res.json({ 
      success: true, 
      users 
    });
  } catch (error) {
    console.error("❌ Error fetching pending users:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// ==============================
// ✅ LOGIN AS USER (ADMIN)
// ==============================
router.post("/:id/login-as-user", adminAuth, async (req, res) => {
  try {
    console.log("Admin logging in as user:", req.admin.email);
    
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // 🔴 ADD THIS DEBUG LOG - See what's actually in the user object
    console.log("🔥 RAW USER DATA FROM DATABASE:", {
      _id: user._id,
      fname: user.fname,
      sname: user.sname,
      phone: user.phone,
      whatsapp: user.whatsapp,
      city: user.city,
      region: user.region,
      district: user.district,
      businessName: user.businessName,
      profileImage: user.profileImage
    });

    // Generate token
    const token = jwt.sign(
       { 
    id: user._id,
    tokenVersion: user.tokenVersion || 0  // ← ADD THIS
  },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Return user data
    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name || `${user.fname || ''} ${user.sname || ''}`.trim(),
        email: user.email,
        userType: user.userType,
        isVerified: user.isVerified,
        isApproved: user.isApproved,
        emailVerified: user.isVerified,
        adminVerified: user.isApproved,
        
        // 🔴 THESE SHOULD HAVE VALUES
        fname: user.fname,
        sname: user.sname,
        phone: user.phone,
        whatsapp: user.whatsapp,
        city: user.city,
        region: user.region,
        district: user.district,
        businessName: user.businessName,
        profileImage: user.profileImage,
        
        profileComplete: !!(user.fname && user.sname && user.phone && user.whatsapp && user.city && user.region && user.district)
      },
      token: token,
    });
    
    // 🔴 ADD THIS AFTER SENDING
    console.log("✅ Response sent for user:", user.email);
    
  } catch (error) {
    console.error("❌ Error logging in as user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ==============================
// ✅ SUSPEND USER
// ==============================
router.patch("/:id/suspend", adminAuth, async (req, res) => {
  try {
    const { reason, duration } = req.body;
    
    console.log("Suspending user:", req.params.id);
    console.log("Request body:", { reason, duration });

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    console.log("Before suspension:", {
      isSuspended: user.isSuspended,
      suspensionReason: user.suspensionReason,
      suspensionEndsAt: user.suspensionEndsAt
    });

    // Calculate suspension end date if duration provided
    let suspensionEndsAt = null;
    if (duration && duration > 0) {
      suspensionEndsAt = new Date();
      suspensionEndsAt.setDate(suspensionEndsAt.getDate() + duration);
    }

    user.isSuspended = true;
    user.suspendedAt = new Date();
    user.suspendedBy = req.admin.id;
    user.suspensionReason = reason || "Violation of terms";
    user.suspensionEndsAt = suspensionEndsAt;

    // ✅ Increment token version to invalidate all existing sessions
    user.tokenVersion = (user.tokenVersion || 0) + 1;

    await user.save();

    console.log("After suspension:", {
      isSuspended: user.isSuspended,
      suspensionReason: user.suspensionReason,
      suspensionEndsAt: user.suspensionEndsAt
    });

    res.json({
      success: true,
      message: duration 
        ? `User suspended for ${duration} days` 
        : "User suspended permanently",
      user: user.toSafeObject()
    });
  } catch (error) {
    console.error("❌ Error suspending user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==============================
// ✅ UNSUSPEND USER
// ==============================
router.patch("/:id/unsuspend", adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.isSuspended = false;
    user.suspendedAt = null;
    user.suspendedBy = null;
    user.suspensionReason = "";
    user.suspensionEndsAt = null;

    await user.save();

    res.json({
      success: true,
      message: "User unsuspended successfully",
      user: user.toSafeObject()
    });
  } catch (error) {
    console.error("❌ Error unsuspending user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


export default router;
