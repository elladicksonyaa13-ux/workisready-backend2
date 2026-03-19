// routes/admin/subadmins.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Admin from "../../models/Admin.js";
import { adminAuth } from "../../middleware/auth.js";

const router = express.Router();

// ========================
// MULTER CONFIGURATION
// ========================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads/admins";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `admin-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const isValid =
      allowed.test(file.mimetype) && allowed.test(path.extname(file.originalname).toLowerCase());
    if (isValid) cb(null, true);
    else cb(new Error("Only image files (jpeg, jpg, png, webp) are allowed!"));
  },
});

// ========================
// GET ALL SUBADMINS
// ========================
router.get("/", adminAuth, async (req, res) => {
  try {
    // Only superadmin and admin can view subadmins
    if (req.admin.role !== 'superadmin' && req.admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions."
      });
    }

    const admins = await Admin.find({ 
  role: 'subadmin' 
}).sort({ createdAt: -1 });

const subadmins = admins.map(admin => admin.toSafeObject());  // ← USE toSafeObject FOR EACH

    res.json({
      success: true,
      subadmins
    });
  } catch (error) {
    console.error("Error fetching subadmins:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ========================
// CREATE SUBADMIN
// ========================
router.post("/", adminAuth, upload.single("profileImage"), async (req, res) => {
  try {
    // Only superadmin and admin can create subadmins
    if (req.admin.role !== 'superadmin' && req.admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions."
      });
    }

    const { name, email, password, phone } = req.body;

    // Check if email already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Email already in use"
      });
    }

    // Create new subadmin
    const newAdmin = new Admin({
      name,
      email,
      password,
      phone,
      role: 'subadmin',
      isActive: true,
      createdBy: req.admin._id  // ← ADD THIS LINE to track who created

    });

    // Add profile image if uploaded
    if (req.file) {
      newAdmin.profileImage = `uploads/admins/${req.file.filename}`;
    }

    await newAdmin.save();

    const adminResponse = newAdmin.toSafeObject();  // ← USE THE toSafeObject METHOD

    res.status(201).json({
      success: true,
      message: "Sub-admin created successfully",
      subadmin: adminResponse
    });
  } catch (error) {
    console.error("Error creating subadmin:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ========================
// UPDATE SUBADMIN
// ========================
router.put("/:id", adminAuth, upload.single("profileImage"), async (req, res) => {
  try {
    // Only superadmin and admin can update subadmins
    if (req.admin.role !== 'superadmin' && req.admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions."
      });
    }

    const { name, email, password, phone } = req.body;
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Sub-admin not found"
      });
    }

    // Check if email is being changed and already exists
    if (email !== admin.email) {
      const existingAdmin = await Admin.findOne({ email });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: "Email already in use"
        });
      }
    }

    // Update fields
    admin.name = name || admin.name;
    admin.email = email || admin.email;
    admin.phone = phone || admin.phone;

    if (password) {
      admin.password = password;
    }

    // Handle profile image
    if (req.file) {
      // Delete old image if exists
      if (admin.profileImage) {
        const oldPath = path.join(admin.profileImage);
        if (fs.existsSync(oldPath)) {
          fs.unlink(oldPath, (err) => {
            if (err) console.warn("Could not delete old profile image:", err);
          });
        }
      }
      admin.profileImage = `uploads/admins/${req.file.filename}`;
    }

    await admin.save();

    const adminResponse = admin.toSafeObject();  // ← USE THE toSafeObject METHOD


    res.json({
      success: true,
      message: "Sub-admin updated successfully",
      subadmin: adminResponse
    });
  } catch (error) {
    console.error("Error updating subadmin:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ========================
// TOGGLE SUBADMIN STATUS
// ========================
router.patch("/:id/status", adminAuth, async (req, res) => {
  try {
    // Only superadmin and admin can toggle status
    if (req.admin.role !== 'superadmin' && req.admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions."
      });
    }

    const { isActive } = req.body;
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Sub-admin not found"
      });
    }

    admin.isActive = isActive;
    await admin.save();

    res.json({
      success: true,
      message: `Sub-admin ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error("Error toggling subadmin status:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ========================
// DELETE SUBADMIN
// ========================
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    // Only superadmin and admin can delete subadmins
    if (req.admin.role !== 'superadmin' && req.admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions."
      });
    }

    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Sub-admin not found"
      });
    }

    // Delete profile image if exists
    if (admin.profileImage) {
      const imagePath = path.join(admin.profileImage);
      if (fs.existsSync(imagePath)) {
        fs.unlink(imagePath, (err) => {
          if (err) console.warn("Could not delete profile image:", err);
        });
      }
    }

    await admin.deleteOne();

    res.json({
      success: true,
      message: "Sub-admin deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting subadmin:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ========================
// BULK DELETE SUBADMINS
// ========================
router.delete("/bulk-delete", adminAuth, async (req, res) => {
  try {
    // Only superadmin and admin can bulk delete
    if (req.admin.role !== 'superadmin' && req.admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions."
      });
    }

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No sub-admins selected"
      });
    }

    // Delete profile images
    const admins = await Admin.find({ _id: { $in: ids } });
    admins.forEach(admin => {
      if (admin.profileImage) {
        const imagePath = path.join(admin.profileImage);
        if (fs.existsSync(imagePath)) {
          fs.unlink(imagePath, (err) => {
            if (err) console.warn("Could not delete profile image:", err);
          });
        }
      }
    });

    const result = await Admin.deleteMany({ _id: { $in: ids } });

    res.json({
      success: true,
      message: `${result.deletedCount} sub-admin(s) deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error bulk deleting subadmins:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

export default router;