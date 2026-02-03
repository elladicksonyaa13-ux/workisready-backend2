import express from "express";
import User from "../../models/User.js";
import { adminAuth } from "../../middleware/auth.js"; // Import named export

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
    res.json({ success: true, users });
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

    const { name, email, password, phone, whatsapp, userType } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    // Create new user (automatically approved AND email verified if created by admin)
    const newUser = new User({
      name,
      email,
      password,
      phone,
      whatsapp,
      userType: userType || "client",
      isApproved: true, // Admin-created users are automatically approved
      isEmailVerified: true, // Add this line
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
    user.isEmailVerified = true; // Add this line
    user.lastApprovedAt = new Date();
    user.hasPendingChanges = false;
    user.pendingProfileData = null;
    user.emailVerificationToken = undefined; // Clear verification token
    user.emailVerificationExpires = undefined; // Clear expiry
    
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
    if (pendingData.oname !== undefined) user.oname = pendingData.oname;
    if (pendingData.email !== undefined) user.email = pendingData.email;
    if (pendingData.phone !== undefined) user.phone = pendingData.phone;
    if (pendingData.whatsapp !== undefined) user.whatsapp = pendingData.whatsapp;
    if (pendingData.location !== undefined) user.location = pendingData.location;
    if (pendingData.region !== undefined) user.region = pendingData.region;
    if (pendingData.profileImage !== undefined) user.profileImage = pendingData.profileImage;

    // Update original profile data to current state
    user.originalProfileData = {
      fname: user.fname,
      sname: user.sname,
      oname: user.oname,
      email: user.email,
      phone: user.phone,
      whatsapp: user.whatsapp,
      location: user.location,
      region: user.region,
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
          isEmailVerified: true, // Add this line
          lastApprovedAt: new Date(),
          hasPendingChanges: false,
          pendingProfileData: null,
          pendingChangesSubmittedAt: null,
          emailVerificationToken: undefined, // Clear verification token
          emailVerificationExpires: undefined // Clear expiry
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
// ✅ UPDATE USER (ADMIN)
// ==============================
router.put("/:id", adminAuth, async (req, res) => {
  try {
    // NO NEED TO CHECK - adminAuth already verified admin access
    console.log("Updating user by admin:", req.admin.email);

    const { name, email, phone, whatsapp, userType } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Update user fields
    if (name !== undefined) user.name = name;
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

export default router;
