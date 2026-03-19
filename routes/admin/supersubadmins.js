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
    const uniqueName = `supersubadmin-${Date.now()}${path.extname(file.originalname)}`;
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
// GET ALL SUPER SUBADMINS
// ========================
router.get("/", adminAuth, async (req, res) => {
  try {
    // Only superadmin can view supersubadmins
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const supersubadmins = await Admin.find({ 
      role: 'supersubadmin' 
    })
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

    const adminResponses = supersubadmins.map(admin => admin.toSafeObject());

    res.json({
      success: true,
      supersubadmins: adminResponses
    });
  } catch (error) {
    console.error("Error fetching super sub-admins:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ========================
// CREATE SUPER SUBADMIN
// ========================
router.post("/", adminAuth, upload.single("profileImage"), async (req, res) => {
  try {
    // Only superadmin can create supersubadmins
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const { name, email, password, phone, permissions } = req.body;

    // Check if email already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Email already in use"
      });
    }

    // Parse permissions if they came as string
    let permissionsArray = [];
    if (permissions) {
      try {
        permissionsArray = JSON.parse(permissions);
      } catch (e) {
        permissionsArray = [];
      }
    }

    // Create new supersubadmin
    const newAdmin = new Admin({
      name,
      email,
      password,
      phone,
      role: 'supersubadmin',
      permissions: permissionsArray,
      isActive: true,
      createdBy: req.admin._id
    });

    // Add profile image if uploaded
    if (req.file) {
      newAdmin.profileImage = `uploads/admins/${req.file.filename}`;
    }

    await newAdmin.save();

    res.status(201).json({
      success: true,
      message: "Super sub-admin created successfully",
      supersubadmin: newAdmin.toSafeObject()
    });
  } catch (error) {
    console.error("Error creating super sub-admin:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ========================
// UPDATE SUPER SUBADMIN
// ========================
router.put("/:id", adminAuth, upload.single("profileImage"), async (req, res) => {
  try {
    // Only superadmin can update supersubadmins
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const { name, email, password, phone } = req.body;
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Super sub-admin not found"
      });
    }

    // Check if email is being changed and already exists
    if (email && email !== admin.email) {
      const existingAdmin = await Admin.findOne({ email });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: "Email already in use"
        });
      }
    }

    // Update fields
    if (name) admin.name = name;
    if (email) admin.email = email;
    if (phone !== undefined) admin.phone = phone;

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

    res.json({
      success: true,
      message: "Super sub-admin updated successfully",
      supersubadmin: admin.toSafeObject()
    });
  } catch (error) {
    console.error("Error updating super sub-admin:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ========================
// UPDATE PERMISSIONS
// ========================
router.patch("/:id/permissions", adminAuth, async (req, res) => {
  try {
    // Only superadmin can update permissions
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const { permissions } = req.body;
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Super sub-admin not found"
      });
    }

    admin.permissions = permissions || [];
    await admin.save();

    res.json({
      success: true,
      message: "Permissions updated successfully",
      supersubadmin: admin.toSafeObject()
    });
  } catch (error) {
    console.error("Error updating permissions:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ========================
// TOGGLE STATUS
// ========================
router.patch("/:id/status", adminAuth, async (req, res) => {
  try {
    // Only superadmin can toggle status
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const { isActive } = req.body;
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Super sub-admin not found"
      });
    }

    admin.isActive = isActive;
    await admin.save();

    res.json({
      success: true,
      message: `Super sub-admin ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error("Error toggling super sub-admin status:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ========================
// DELETE SUPER SUBADMIN
// ========================
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    // Only superadmin can delete
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Super sub-admin not found"
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
      message: "Super sub-admin deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting super sub-admin:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ========================
// BULK DELETE SUPER SUBADMINS
// ========================
router.delete("/bulk-delete", adminAuth, async (req, res) => {
  try {
    // Only superadmin can bulk delete
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No super sub-admins selected"
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
      message: `${result.deletedCount} super sub-admin(s) deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error bulk deleting super sub-admins:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

export default router;