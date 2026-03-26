// routes/admin/supersubadmins.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Admin from "../../models/Admin.js";
import { adminAuth } from "../../middleware/auth.js";
import { createAdminLog } from '../../middleware/logAdminActivity.js';

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
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const supersubadmins = await Admin.find({ role: 'supersubadmin' })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    const adminResponses = supersubadmins.map(admin => admin.toSafeObject());

    res.json({ success: true, supersubadmins: adminResponses });
  } catch (error) {
    console.error("Error fetching super sub-admins:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========================
// CREATE SUPER SUBADMIN
// ========================
router.post("/", adminAuth, upload.single("profileImage"), async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const { name, email, password, phone, permissions } = req.body;

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: "Email already in use" });
    }

    let permissionsArray = [];
    if (permissions) {
      try {
        permissionsArray = JSON.parse(permissions);
      } catch (e) {
        permissionsArray = [];
      }
    }

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

    if (req.file) {
      newAdmin.profileImage = `uploads/admins/${req.file.filename}`;
    }

    await newAdmin.save();

    // ✅ LOG: Create Super Sub-Admin
    await createAdminLog({
      req,
      action: 'CREATE_ADMIN',
      entityType: 'admin',
      entityId: newAdmin._id,
      entityName: newAdmin.name,
      details: { 
        role: 'supersubadmin', 
        email: newAdmin.email,
        permissions: permissionsArray,
        createdBy: req.admin.email
      }
    });

    res.status(201).json({
      success: true,
      message: "Super sub-admin created successfully",
      supersubadmin: newAdmin.toSafeObject()
    });
  } catch (error) {
    console.error("Error creating super sub-admin:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========================
// UPDATE SUPER SUBADMIN
// ========================
router.put("/:id", adminAuth, upload.single("profileImage"), async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const { name, email, password, phone } = req.body;
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({ success: false, message: "Super sub-admin not found" });
    }

    // Store old data for logging
    const oldData = {
      name: admin.name,
      email: admin.email,
      phone: admin.phone,
      isActive: admin.isActive
    };

    if (email && email !== admin.email) {
      const existingAdmin = await Admin.findOne({ email });
      if (existingAdmin) {
        return res.status(400).json({ success: false, message: "Email already in use" });
      }
    }

    if (name) admin.name = name;
    if (email) admin.email = email;
    if (phone !== undefined) admin.phone = phone;

    if (password) {
      admin.password = password;
    }

    if (req.file) {
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

    // Prepare after data
    const afterData = {
      name: admin.name,
      email: admin.email,
      phone: admin.phone,
      isActive: admin.isActive
    };

    // ✅ LOG: Edit Super Sub-Admin
    await createAdminLog({
      req,
      action: 'EDIT_ADMIN',
      entityType: 'admin',
      entityId: req.params.id,
      entityName: admin.name,
      details: { 
        before: oldData, 
        after: afterData,
        role: 'supersubadmin'
      }
    });

    res.json({
      success: true,
      message: "Super sub-admin updated successfully",
      supersubadmin: admin.toSafeObject()
    });
  } catch (error) {
    console.error("Error updating super sub-admin:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========================
// UPDATE PERMISSIONS
// ========================
router.patch("/:id/permissions", adminAuth, async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const { permissions } = req.body;
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({ success: false, message: "Super sub-admin not found" });
    }

    const oldPermissions = [...(admin.permissions || [])];
    admin.permissions = permissions || [];
    await admin.save();

    // ✅ LOG: Update Admin Permissions
    await createAdminLog({
      req,
      action: 'UPDATE_ADMIN_PERMISSIONS',
      entityType: 'admin',
      entityId: req.params.id,
      entityName: admin.name,
      details: { 
        before: oldPermissions, 
        after: admin.permissions,
        role: 'supersubadmin'
      }
    });

    res.json({
      success: true,
      message: "Permissions updated successfully",
      supersubadmin: admin.toSafeObject()
    });
  } catch (error) {
    console.error("Error updating permissions:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========================
// TOGGLE STATUS
// ========================
router.patch("/:id/status", adminAuth, async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const { isActive } = req.body;
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({ success: false, message: "Super sub-admin not found" });
    }

    const oldStatus = admin.isActive;
    admin.isActive = isActive;
    await admin.save();

    // ✅ LOG: Toggle Admin Status
    await createAdminLog({
      req,
      action: 'TOGGLE_ADMIN_STATUS',
      entityType: 'admin',
      entityId: req.params.id,
      entityName: admin.name,
      details: { 
        before: oldStatus, 
        after: isActive,
        role: 'supersubadmin'
      }
    });

    res.json({
      success: true,
      message: `Super sub-admin ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error("Error toggling super sub-admin status:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========================
// DELETE SUPER SUBADMIN
// ========================
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({ success: false, message: "Super sub-admin not found" });
    }

    const adminName = admin.name;
    const adminEmail = admin.email;

    if (admin.profileImage) {
      const imagePath = path.join(admin.profileImage);
      if (fs.existsSync(imagePath)) {
        fs.unlink(imagePath, (err) => {
          if (err) console.warn("Could not delete profile image:", err);
        });
      }
    }

    await admin.deleteOne();

    // ✅ LOG: Delete Super Sub-Admin
    await createAdminLog({
      req,
      action: 'DELETE_ADMIN',
      entityType: 'admin',
      entityId: req.params.id,
      entityName: adminName,
      details: { 
        role: 'supersubadmin',
        email: adminEmail,
        deletedBy: req.admin.email
      }
    });

    res.json({
      success: true,
      message: "Super sub-admin deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting super sub-admin:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ========================
// BULK DELETE SUPER SUBADMINS
// ========================
router.delete("/bulk-delete", adminAuth, async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: "Access denied. Super admin privileges required."
      });
    }

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "No super sub-admins selected" });
    }

    // Get admin names for logging
    const admins = await Admin.find({ _id: { $in: ids } });
    const adminNames = admins.map(a => a.name);

    // Delete profile images
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

    // ✅ LOG: Bulk Delete Super Sub-Admins
    await createAdminLog({
      req,
      action: 'BULK_DELETE_ADMINS',
      entityType: 'admin',
      details: { 
        count: result.deletedCount, 
        adminIds: ids,
        adminNames,
        role: 'supersubadmin'
      }
    });

    res.json({
      success: true,
      message: `${result.deletedCount} super sub-admin(s) deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error bulk deleting super sub-admins:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;