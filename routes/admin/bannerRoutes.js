import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { adminAuth } from '../../middleware/auth.js';
import Banner from '../../models/Banner.js';
import AdminLog from '../../models/AdminLog.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/banners/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const isValid = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
    cb(null, isValid);
  }
});

// GET ALL BANNERS (admin)
router.get('/', adminAuth, async (req, res) => {
  try {
    const banners = await Banner.find().sort({ priority: -1, createdAt: -1 });
    const stats = {
      totalBanners: banners.length,
      activeBanners: banners.filter(b => b.isActive).length,
      totalClicks: banners.reduce((sum, b) => sum + (b.clicks || 0), 0),
      totalImpressions: banners.reduce((sum, b) => sum + (b.impressions || 0), 0),
      avgClickRate: banners.length
        ? (banners.reduce((sum, b) => sum + (b.clickRate || 0), 0) / banners.length).toFixed(2)
        : 0
    };
    res.json({ success: true, banners, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET ACTIVE BANNERS (public — used by app & website)
// ⚠️ Must be before /:id routes
router.get('/active', async (req, res) => {
  try {
    const { screen, region, userType, deviceType } = req.query;
    const now = new Date();

    const query = {
      isActive: true,
      $and: [
        { $or: [{ 'schedule.startDate': null }, { 'schedule.startDate': { $lte: now } }] },
        { $or: [{ 'schedule.endDate': null }, { 'schedule.endDate': { $gte: now } }] }
      ]
    };

    if (screen) query[`screens.${screen}`] = true;

    // Empty targeting array = show to everyone
    if (region) {
      query.$and.push({
        $or: [{ 'targeting.regions': { $size: 0 } }, { 'targeting.regions': region }]
      });
    }
    if (userType) {
      query.$and.push({
        $or: [{ 'targeting.userTypes': { $size: 0 } }, { 'targeting.userTypes': userType }]
      });
    }
    if (deviceType) {
      query.$and.push({
        $or: [{ 'targeting.deviceTypes': { $size: 0 } }, { 'targeting.deviceTypes': deviceType }]
      });
    }

    const banners = await Banner.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .limit(10);

    if (banners.length > 0) {
      Banner.updateMany(
        { _id: { $in: banners.map(b => b._id) } },
        { $inc: { impressions: 1 } }
      ).catch(console.error);
    }

    res.json({ success: true, banners });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE BANNER
router.post('/', adminAuth, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'mobileImage', maxCount: 1 },
  { name: 'tabletImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, description, linkUrl, screens, schedule, targeting, priority, isActive } = req.body;

    if (!req.files?.['image']) {
      return res.status(400).json({ success: false, message: 'Banner image is required' });
    }

    const parsedSchedule = JSON.parse(schedule);
    if (!parsedSchedule.startDate) parsedSchedule.startDate = null;
    if (!parsedSchedule.endDate) parsedSchedule.endDate = null;

    const bannerData = {
      title,
      description,
      linkUrl,
      screens: JSON.parse(screens),
      schedule: parsedSchedule,
      targeting: JSON.parse(targeting),
      priority: parseInt(priority) || 0,
      isActive: isActive === 'true',
      createdBy: req.admin._id,
      imageUrl: `/uploads/banners/${req.files['image'][0].filename}`
    };

    if (req.files['mobileImage'])
      bannerData.mobileImageUrl = `/uploads/banners/${req.files['mobileImage'][0].filename}`;
    if (req.files['tabletImage'])
      bannerData.tabletImageUrl = `/uploads/banners/${req.files['tabletImage'][0].filename}`;

    const banner = await Banner.create(bannerData);

    // 👇 Don't let AdminLog failure break the response
    try {
      await AdminLog.create({
        adminId: req.admin._id,
        adminName: req.admin.name,
        adminEmail: req.admin.email,
        adminRole: req.admin.role,
        action: 'CREATE_BANNER',
        entityType: 'notification', // 👈 use whatever your enum allows
        details: { bannerId: banner._id, title: banner.title }
      });
    } catch (logError) {
      console.error('AdminLog error (non-fatal):', logError.message);
    }

    res.json({ success: true, banner });
  } catch (error) {
    console.error('Error creating banner:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE BANNER
router.put('/:id', adminAuth, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'mobileImage', maxCount: 1 },
  { name: 'tabletImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });

    const { title, description, linkUrl, screens, schedule, targeting, priority, isActive } = req.body;

    const parsedSchedule = JSON.parse(schedule);
    if (!parsedSchedule.startDate) parsedSchedule.startDate = null;
    if (!parsedSchedule.endDate) parsedSchedule.endDate = null;

    banner.title = title;
    banner.description = description;
    banner.linkUrl = linkUrl;
    banner.screens = JSON.parse(screens);
    banner.schedule = parsedSchedule;
    banner.targeting = JSON.parse(targeting);
    banner.priority = parseInt(priority) || 0;
    banner.isActive = isActive === 'true';

    if (req.files?.['image']) {
      if (banner.imageUrl) {
        const oldPath = banner.imageUrl.replace('/uploads/', 'uploads/');
        try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (e) {}
      }
      banner.imageUrl = `/uploads/banners/${req.files['image'][0].filename}`;
    }
    if (req.files?.['mobileImage']) {
      if (banner.mobileImageUrl) {
        const oldPath = banner.mobileImageUrl.replace('/uploads/', 'uploads/');
        try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (e) {}
      }
      banner.mobileImageUrl = `/uploads/banners/${req.files['mobileImage'][0].filename}`;
    }
    if (req.files?.['tabletImage']) {
      if (banner.tabletImageUrl) {
        const oldPath = banner.tabletImageUrl.replace('/uploads/', 'uploads/');
        try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (e) {}
      }
      banner.tabletImageUrl = `/uploads/banners/${req.files['tabletImage'][0].filename}`;
    }

    await banner.save();

    try {
      await AdminLog.create({
        adminId: req.admin._id,
        adminName: req.admin.name,
        adminEmail: req.admin.email,
        adminRole: req.admin.role,
        action: 'UPDATE_BANNER',
        entityType: 'notification',
        details: { bannerId: banner._id, title: banner.title }
      });
    } catch (logError) {
      console.error('AdminLog error (non-fatal):', logError.message);
    }

    res.json({ success: true, banner });
  } catch (error) {
    console.error('Error updating banner:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE BANNER
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });

    // 👇 Safe file deletion — skip empty/invalid paths
    [banner.imageUrl, banner.mobileImageUrl, banner.tabletImageUrl].forEach(url => {
      if (url && url.trim() !== '') {
        try {
          const filePath = url.startsWith('/') ? url.slice(1) : url;
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          console.error('File delete error (non-fatal):', e.message);
        }
      }
    });

    try {
      await AdminLog.create({
        adminId: req.admin._id,
        adminName: req.admin.name,
        adminEmail: req.admin.email,
        adminRole: req.admin.role,
        action: 'DELETE_BANNER',
        entityType: 'notification',
        details: { bannerId: banner._id, title: banner.title }
      });
    } catch (logError) {
      console.error('AdminLog error (non-fatal):', logError.message);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// TOGGLE ACTIVE
router.patch('/:id/toggle', adminAuth, async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });
    banner.isActive = !banner.isActive;
    await banner.save();
    res.json({ success: true, banner });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// // DELETE BANNER
// router.delete('/:id', adminAuth, async (req, res) => {
//   try {
//     const banner = await Banner.findByIdAndDelete(req.params.id);
//     if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });

//     // Delete image files
//     [banner.imageUrl, banner.mobileImageUrl, banner.tabletImageUrl].forEach(url => {
//       if (url) {
//         const filePath = url.replace('/uploads/', 'uploads/');
//         if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
//       }
//     });

//     await AdminLog.create({
//       adminId: req.admin._id, adminName: req.admin.name,
//       adminEmail: req.admin.email, adminRole: req.admin.role,
//       action: 'DELETE_BANNER', entityType: 'banner',
//       details: { bannerId: banner._id, title: banner.title }
//     });

//     res.json({ success: true });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// TRACK CLICK (public)
router.post('/:id/click', async (req, res) => {
  try {
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { $inc: { clicks: 1 } },
      { new: true }
    );
    if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });

    // Recalculate click rate
    if (banner.impressions > 0) {
      banner.clickRate = parseFloat(((banner.clicks / banner.impressions) * 100).toFixed(2));
      await banner.save();
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;