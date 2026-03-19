import express from "express";
import multer from "multer";
import Provider from "../../models/Providers.js";
import { adminAuth } from "../../middleware/auth.js";
import { fileURLToPath } from "url";
import path from "path";
import mongoose from "mongoose";
import fs from "fs";
import ProviderUpdateRequest from "../../models/ProviderUpdateRequest.js";

// Import controller functions
import * as providerController from '../../controllers/providerController.js';


const router = express.Router();

// ✅ Get __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Helper function to fix URLs (CRITICAL FIX)
const fixImageUrl = (url) => {
  if (!url) return null;
  
  // If it's already a full URL, return as is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // If it's stored as relative path, prepend API_URL
  const baseUrl = process.env.API_URL || 'http://localhost:5000';
  // Remove any leading slash to avoid double slashes
  const cleanUrl = url.replace(/^\//, '');
  return `${baseUrl}/${cleanUrl}`;
};

// ✅ Multer setup - keep it simple
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadDir;
    
    // All files go to uploads/providers (based on your working website)
    uploadDir = path.join(__dirname, '..', '..', 'uploads', 'providers');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const filename = file.fieldname + '-' + uniqueSuffix + ext;
    cb(null, filename);
  },
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  }
});

/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: GET ALL PROVIDERS */
/* -------------------------------------------------------------------------- */
router.get("/", adminAuth, async (req, res) => {
  try {
    console.log("Admin accessing providers");
    
    const { 
      page = 1, 
      limit = 10, 
      search = "",
      status = "all",
      category = "all",
      sort = "newest"
    } = req.query;
    
    const skip = (page - 1) * limit;
    
    // Build query
    let query = {};
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { surname: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { region: { $regex: search, $options: "i" } },
        { district: { $regex: search, $options: "i" } },
      ];
    }
    
    if (status === "approved") {
      query.isApproved = true;
    } else if (status === "pending") {
      query.isApproved = false;
    }
    
    if (category !== "all") {
      query.category = category;
    }
    
    // Sort options
    let sortOptions = {};
    switch(sort) {
      case "newest":
        sortOptions.createdAt = -1;
        break;
      case "oldest":
        sortOptions.createdAt = 1;
        break;
      case "name":
        sortOptions.firstName = 1;
        break;
      case "rating":
        sortOptions.averageRating = -1;
        break;
      default:
        sortOptions.createdAt = -1;
    }
    
    // Execute query
    const providers = await Provider.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Provider.countDocuments(query);
    
    // ✅ FIX: Use helper function for URLs
    const fixedProviders = providers.map(provider => {
      const providerObj = provider.toObject();
      
      // Fix profile picture URL
      if (providerObj.profilePic) {
        providerObj.profilePic = fixImageUrl(providerObj.profilePic);
      }
      
      // Fix sample work URLs
      if (Array.isArray(providerObj.sampleWork)) {
        providerObj.sampleWork = providerObj.sampleWork.map(url => fixImageUrl(url));
      }
      
      console.log(`Provider ${providerObj._id}:`, {
        originalProfilePic: provider.profilePic,
        fixedProfilePic: providerObj.profilePic,
        sampleWorkCount: Array.isArray(providerObj.sampleWork) ? providerObj.sampleWork.length : 0
      });
      
      return providerObj;
    });
    
    res.json({ 
      success: true, 
      providers: fixedProviders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("❌ Admin error fetching providers:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: GET PENDING PROVIDER UPDATE REQUESTS */
/* -------------------------------------------------------------------------- */
router.get("/update-requests", adminAuth, async (req, res) => {
  try {
    console.log("Admin fetching pending provider update requests");
    
    // You'll need a ProviderUpdateRequest model
    const ProviderUpdateRequest = mongoose.model('ProviderUpdateRequest');
    
    const requests = await ProviderUpdateRequest.find({ 
      status: "pending" 
    })
    .populate("providerId")
    .populate("userId", "firstName surname email")
    .sort({ createdAt: -1 });
    
    res.json({ 
      success: true, 
      requests 
    });
  } catch (error) {
    console.error("❌ Error fetching update requests:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});


/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: GET SINGLE PROVIDER BY ID */
/* -------------------------------------------------------------------------- */
router.get("/:id", adminAuth, async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res
        .status(404)
        .json({ success: false, message: "Provider not found" });
    }
    
    // ✅ FIX: Use helper function
    const providerObj = provider.toObject();
    
    if (providerObj.profilePic) {
      providerObj.profilePic = fixImageUrl(providerObj.profilePic);
    }
    
    if (Array.isArray(providerObj.sampleWork)) {
      providerObj.sampleWork = providerObj.sampleWork.map(url => fixImageUrl(url));
    }
    
    console.log("✅ Admin fetched provider:", {
      id: providerObj._id,
      profilePic: providerObj.profilePic,
      sampleWorkCount: Array.isArray(providerObj.sampleWork) ? providerObj.sampleWork.length : 0
    });
    
    res.json({ success: true, provider: providerObj });
  } catch (error) {
    console.error("❌ Admin error fetching provider:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: UPDATE PROVIDER (CRITICAL FIX) */
/* -------------------------------------------------------------------------- */
router.put("/:id", adminAuth,
  upload.fields([
    { name: "profilePic", maxCount: 1 },
    { name: "sampleWork", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      console.log("=== UPDATE PROVIDER REQUEST ===");
      console.log("Provider ID:", req.params.id);
      
      const provider = await Provider.findById(req.params.id);
      if (!provider) {
        return res
          .status(404)
          .json({ success: false, message: "Provider not found" });
      }

      // Parse updates from FormData
      const updates = req.body;
      
      console.log("Request body fields:", Object.keys(updates));
      console.log("Files received:", req.files);
      
      // Handle isApproved
      if (updates.isApproved !== undefined) {
        provider.isApproved = updates.isApproved === 'true' || updates.isApproved === true;
        console.log("Updated isApproved to:", provider.isApproved);
      }
      
      // Update basic fields
      const textFields = [
        'firstName', 'surname', 'businessName', 'city', 'region', 'district',
        'bio', 'experience', 'hourlyRate', 'availability', 
        'phone', 'whatsapp', 'email'
      ];
      
      textFields.forEach(field => {
        if (updates[field] !== undefined && updates[field] !== null) {
          provider[field] = updates[field];
          console.log(`Updated ${field}:`, updates[field]);
        }
      });
      
      // Parse JSON arrays
      if (updates.category) {
        try {
          provider.category = JSON.parse(updates.category);
          console.log("Updated category:", provider.category);
        } catch (e) {
          provider.category = Array.isArray(updates.category) 
            ? updates.category 
            : [updates.category];
        }
      }
      
      if (updates.skills) {
        try {
          provider.skills = JSON.parse(updates.skills);
          console.log("Updated skills:", provider.skills);
        } catch (e) {
          provider.skills = Array.isArray(updates.skills) 
            ? updates.skills 
            : [updates.skills];
        }
      }
      
      // Update fullName - prioritize business name if available
provider.fullName = provider.businessName || `${provider.firstName} ${provider.surname}`.trim();
console.log("Updated fullName:", provider.fullName);
      
      // ✅ CRITICAL FIX: File updates - Store relative paths, not full URLs
      
      // 1. Profile picture
      if (req.files?.profilePic?.[0]) {
        const newProfilePic = req.files.profilePic[0];
        
        // Delete old file if exists
        if (provider.profilePic) {
          try {
            // Extract filename from stored path (could be URL or relative path)
            let oldFilename;
            if (provider.profilePic.includes('/')) {
              oldFilename = provider.profilePic.split('/').pop();
            } else {
              oldFilename = provider.profilePic;
            }
            
            const oldPath = path.join(__dirname, '..', '..', 'uploads', 'providers', oldFilename);
            
            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
              console.log("🗑️ Deleted old profile pic:", oldPath);
            }
          } catch (err) {
            console.error("Error deleting old profile pic:", err);
          }
        }
        
        // ✅ Store relative path, NOT full URL
        provider.profilePic = `uploads/providers/${newProfilePic.filename}`;
        console.log("✅ Updated profilePic (relative path):", provider.profilePic);
      }
      
      // 2. Sample work files
      // Initialize sampleWork array if it doesn't exist
      if (!provider.sampleWork) {
        provider.sampleWork = [];
      }
      
      // Handle removed samples
      if (updates.removedSamples) {
        try {
          const removed = JSON.parse(updates.removedSamples);
          console.log("Removing samples:", removed);
          
          removed.forEach(filePath => {
            // Extract filename from URL or path
            const filename = filePath.split('/').pop();
            const filePathOnDisk = path.join(__dirname, '..', '..', 'uploads', 'providers', filename);
            
            // Delete file
            if (fs.existsSync(filePathOnDisk)) {
              fs.unlinkSync(filePathOnDisk);
              console.log("🗑️ Deleted sample file:", filename);
            }
            
            // Remove from array
            provider.sampleWork = provider.sampleWork.filter(sample => {
              const sampleFilename = sample.split('/').pop();
              return sampleFilename !== filename;
            });
          });
        } catch (e) {
          console.error("Error parsing removedSamples:", e);
        }
      }
      
      // Add new sample work files
      if (req.files?.sampleWork) {
        const newSamples = req.files.sampleWork.map((f) => {
          // ✅ Store relative path, NOT full URL
          return `uploads/providers/${f.filename}`;
        });
        
        console.log("📁 Adding new samples (relative paths):", newSamples);
        
        // Add to existing samples, limit to 10
        provider.sampleWork = [...provider.sampleWork, ...newSamples].slice(0, 10);
      }
      
      console.log("Final sampleWork (relative paths):", provider.sampleWork);
      
      // Save provider
      await provider.save();
      
      // Prepare response with full URLs using helper function
      const providerObj = provider.toObject();
      
      // Fix URLs for response
      if (providerObj.profilePic) {
        providerObj.profilePic = fixImageUrl(providerObj.profilePic);
      }
      
      if (Array.isArray(providerObj.sampleWork)) {
        providerObj.sampleWork = providerObj.sampleWork.map(url => fixImageUrl(url));
      }
      
      console.log("=== UPDATE COMPLETE ===");
      
      res.json({
        success: true,
        message: "Provider updated successfully!",
        provider: providerObj,
      });
    } catch (error) {
      console.error("❌ Admin error updating provider:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({
        success: false,
        message: "Server error updating provider: " + error.message,
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: DELETE PROVIDER */
/* -------------------------------------------------------------------------- */
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res
        .status(404)
        .json({ success: false, message: "Provider not found" });
    }
    
    // Delete profile picture
    if (provider.profilePic) {
      try {
        // Extract filename (handle both URLs and relative paths)
        let filename;
        if (provider.profilePic.includes('/')) {
          filename = provider.profilePic.split('/').pop();
        } else {
          filename = provider.profilePic;
        }
        
        const filePath = path.join(__dirname, '..', '..', 'uploads', 'providers', filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log("🗑️ Deleted profile pic:", filePath);
        }
      } catch (err) {
        console.error("Error deleting profile pic:", err);
      }
    }
    
    // Delete sample work files
    if (Array.isArray(provider.sampleWork)) {
      provider.sampleWork.forEach(filePath => {
        try {
          const filename = filePath.split('/').pop();
          const fullPath = path.join(__dirname, '..', '..', 'uploads', 'providers', filename);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log("🗑️ Deleted sample file:", fullPath);
          }
        } catch (err) {
          console.error("Error deleting sample file:", err);
        }
      });
    }
    
    // Delete from database
    await Provider.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: "Provider deleted successfully",
    });
  } catch (error) {
    console.error("❌ Admin error deleting provider:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
});

/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: TOGGLE APPROVAL */
/* -------------------------------------------------------------------------- */
router.patch("/:id/approve", adminAuth, async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ success: false, message: "Provider not found" });
    }
    
    const { isApproved } = req.body;
    
    if (isApproved !== undefined) {
      provider.isApproved = isApproved;
    } else {
      provider.isApproved = !provider.isApproved;
    }
    
    await provider.save();
    
    // ✅ FIX: Use helper function
    const providerObj = provider.toObject();
    
    if (providerObj.profilePic) {
      providerObj.profilePic = fixImageUrl(providerObj.profilePic);
    }
    
    if (Array.isArray(providerObj.sampleWork)) {
      providerObj.sampleWork = providerObj.sampleWork.map(url => fixImageUrl(url));
    }
    
    res.json({ 
      success: true, 
      message: provider.isApproved ? "Provider approved" : "Provider disapproved",
      provider: providerObj
    });
  } catch (error) {
    console.error("❌ Admin error toggling approval:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error: " + error.message 
    });
  }
});

/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: BULK APPROVE */
/* -------------------------------------------------------------------------- */
router.patch("/bulk-approve", adminAuth, async (req, res) => {
  try {
    const { ids, isApproved = true } = req.body;
    
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid IDs array" 
      });
    }
    
    await Provider.updateMany(
      { _id: { $in: ids } },
      { $set: { isApproved } }
    );
    
    // Get updated providers
    const providers = await Provider.find({ _id: { $in: ids } });
    
    // ✅ FIX: Use helper function
    const fixedProviders = providers.map(provider => {
      const providerObj = provider.toObject();
      
      if (providerObj.profilePic) {
        providerObj.profilePic = fixImageUrl(providerObj.profilePic);
      }
      
      if (Array.isArray(providerObj.sampleWork)) {
        providerObj.sampleWork = providerObj.sampleWork.map(url => fixImageUrl(url));
      }
      
      return providerObj;
    });
    
    res.json({ 
      success: true, 
      message: `${ids.length} provider(s) ${isApproved ? 'approved' : 'disapproved'}`,
      providers: fixedProviders 
    });
  } catch (error) {
    console.error("❌ Admin error bulk approving:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error: " + error.message 
    });
  }
});

/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: BULK DELETE */
/* -------------------------------------------------------------------------- */
router.delete("/bulk-delete", adminAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid IDs array" 
      });
    }
    
    // Get providers to delete their files
    const providers = await Provider.find({ _id: { $in: ids } });
    
    // Delete files
    providers.forEach(provider => {
      // Delete profile picture
      if (provider.profilePic) {
        try {
          const filename = provider.profilePic.split('/').pop();
          const filePath = path.join(__dirname, '..', '..', 'uploads', 'providers', filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          console.error("Error deleting profile pic:", err);
        }
      }
      
      // Delete sample work
      if (Array.isArray(provider.sampleWork)) {
        provider.sampleWork.forEach(filePath => {
          try {
            const filename = filePath.split('/').pop();
            const fullPath = path.join(__dirname, '..', '..', 'uploads', 'providers', filename);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
            }
          } catch (err) {
            console.error("Error deleting sample file:", err);
          }
        });
      }
    });
    
    // Delete from database
    await Provider.deleteMany({ _id: { $in: ids } });
    
    res.json({
      success: true,
      message: `${ids.length} provider(s) deleted successfully`,
    });
  } catch (error) {
    console.error("❌ Admin error bulk deleting:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
});


/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: TOGGLE FEATURE STATUS */
/* -------------------------------------------------------------------------- */
router.patch("/:id/feature", adminAuth, async (req, res) => {
  try {
    console.log("=== TOGGLE FEATURE REQUEST ===");
    console.log("Provider ID:", req.params.id);
    console.log("Request body:", req.body);
    
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ success: false, message: "Provider not found" });
    }
    
    const { isFeatured } = req.body;
    const newFeaturedStatus = isFeatured !== undefined ? isFeatured : !provider.isFeatured;
    
    console.log(`Provider: ${provider.firstName} ${provider.surname}`);
    console.log(`Current isFeatured: ${provider.isFeatured}`);
    console.log(`New isFeatured: ${newFeaturedStatus}`);
    
    // Update provider
    provider.isFeatured = newFeaturedStatus;
    await provider.save();
    
    // Also update FeaturedProvider collection (NOT FeaturedService)
    try {
      // Try to get the FeaturedProvider model
      let FeaturedProviderModel;
      try {
        FeaturedProviderModel = mongoose.model('FeaturedProvider');
      } catch (err) {
        console.log("FeaturedProvider model not found, checking FeaturedService...");
        FeaturedProviderModel = mongoose.model('FeaturedService');
      }
      
      if (newFeaturedStatus) {
        console.log("Adding to featured collection...");
        
        // Check if already featured
        const existing = await FeaturedProviderModel.findOne({ 
          providerId: provider._id,
          isActive: true 
        });
        
        if (existing) {
          console.log("Already in featured collection, updating...");
          existing.isActive = true;
          existing.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
          await existing.save();
        } else {
          // Create new featured entry
          const featuredEntry = new FeaturedProviderModel({
            name: `${provider.firstName} ${provider.surname}`,
            providerId: provider._id,
            category: provider.category && provider.category.length > 0 ? provider.category[0] : 'General',
            icon: getCategoryIcon(provider.category && provider.category.length > 0 ? provider.category[0] : 'General'),
            isActive: true,
            order: await FeaturedProviderModel.countDocuments({ isActive: true }),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            providerName: `${provider.firstName} ${provider.surname}`,
            providerLocation: `${provider.city}, ${provider.region}`,
            providerRating: provider.averageRating || 0,
            providerRate: provider.hourlyRate || 'Negotiable'
          });
          await featuredEntry.save();
          console.log("Created new featured entry:", featuredEntry._id);
        }
      } else {
        console.log("Removing from featured collection...");
        
        // Deactivate in featured collection
        const result = await FeaturedProviderModel.findOneAndUpdate(
          { providerId: provider._id },
          { 
            $set: { 
              isActive: false,
              expiresAt: new Date() // Set to past to hide immediately
            } 
          },
          { new: true }
        );
        console.log("Deactivation result:", result ? "Success" : "Not found");
      }
    } catch (featuredError) {
      console.error("Error updating featured collection:", featuredError);
      console.error("Error stack:", featuredError.stack);
      // Continue anyway - the provider's isFeatured flag is still updated
    }
    
    // Fix URLs for response
    const providerObj = provider.toObject();
    const baseUrl = process.env.API_URL || 'http://localhost:5000';
    
    if (providerObj.profilePic && !providerObj.profilePic.startsWith('http')) {
      providerObj.profilePic = `${baseUrl}/${providerObj.profilePic.replace(/^\//, '')}`;
    }
    
    console.log("=== FEATURE UPDATE COMPLETE ===");
    console.log("Final provider isFeatured:", providerObj.isFeatured);
    
    res.json({ 
      success: true, 
      message: newFeaturedStatus ? 
        "✅ Provider featured on homepage" : 
        "✅ Provider unfeatured from homepage",
      provider: providerObj,
      isFeatured: newFeaturedStatus
    });
    
  } catch (error) {
    console.error("❌ Admin error toggling feature:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ 
      success: false, 
      message: "Server error: " + error.message 
    });
  }
});

// Helper function for icons
const getCategoryIcon = (category) => {
  if (!category) return '👷';
  
  const iconMap = {
    'plumbing': '🔧',
    'electrical': '⚡',
    'cleaning': '🧹',
    'carpentry': '🪚',
    'painting': '🎨',
    'gardening': '🌿',
    'moving': '🚚',
    'repair': '🔨',
    'installation': '📦',
    'maintenance': '🔧',
    'handyman': '👨‍🔧',
    'delivery': '📦',
    'tutoring': '📚',
    'beauty': '💄',
    'fitness': '💪',
  };
  
  const lowerCat = category.toLowerCase();
  for (const [key, icon] of Object.entries(iconMap)) {
    if (lowerCat.includes(key)) return icon;
  }
  
  return '👷';
};

/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: BULK FEATURE */
/* -------------------------------------------------------------------------- */
router.patch("/bulk-feature", adminAuth, async (req, res) => {
  try {
    const { ids, isFeatured = true } = req.body;
    
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid IDs array" 
      });
    }
    
    await Provider.updateMany(
      { _id: { $in: ids } },
      { $set: { isFeatured } }
    );
    
    // Update FeaturedService collection for bulk operations
    try {
      const FeaturedService = mongoose.model('FeaturedService');
      
      if (isFeatured) {
        // Add to featured services
        const providers = await Provider.find({ _id: { $in: ids } });
        
        for (const provider of providers) {
          const existing = await FeaturedService.findOne({ 
            providerId: provider._id,
            isActive: true 
          });
          
          if (!existing && provider.category && provider.category.length > 0) {
            const featuredService = new FeaturedService({
              serviceId: provider.category[0],
              providerId: provider._id,
              isActive: true,
              isPaid: true,
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              order: await FeaturedService.countDocuments({ isActive: true })
            });
            await featuredService.save();
          }
        }
      } else {
        // Remove from featured services
        await FeaturedService.updateMany(
          { providerId: { $in: ids }, isActive: true },
          { $set: { isActive: false } }
        );
      }
    } catch (featuredError) {
      console.log("Bulk FeaturedService update note:", featuredError.message);
    }
    
    res.json({ 
      success: true, 
      message: `${ids.length} provider(s) ${isFeatured ? 'featured' : 'unfeatured'}`,
      count: ids.length 
    });
  } catch (error) {
    console.error("❌ Admin error bulk featuring:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error: " + error.message 
    });
  }
});


/* -------------------------------------------------------------------------- */
/* 🚀 NEW: PROMOTE ROUTES */
/* -------------------------------------------------------------------------- */
router.patch('/:id/promote', adminAuth, providerController.updatePromotion);
router.patch('/bulk-promote', adminAuth, providerController.bulkPromote);
// router.get('/featured/:screen', providerController.getFeaturedProviders); // This one is public, no auth needed




/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: APPROVE PROVIDER UPDATE REQUEST */
/* -------------------------------------------------------------------------- */
router.post("/update-requests/:requestId/approve", adminAuth, async (req, res) => {
  try {
    const { requestId } = req.params;
    
    const ProviderUpdateRequest = mongoose.model('ProviderUpdateRequest');
    
    // Find the request
    const request = await ProviderUpdateRequest.findById(requestId)
      .populate("providerId");
    
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: "Update request not found" 
      });
    }
    
    // Get the provider
    const provider = request.providerId;
    
    if (!provider) {
      return res.status(404).json({ 
        success: false, 
        message: "Provider not found" 
      });
    }
    
    // Parse the changes from the request
    const changes = request.changes;
    
    console.log("Approving changes for provider:", provider._id);
    console.log("Changes to apply:", changes);
    console.log("New sample files:", request.newSampleFiles); // ✅ Check this

    
    // Update provider with the approved changes
    if (changes.category) provider.category = changes.category;
    if (changes.bio) provider.bio = changes.bio;
    if (changes.skills) provider.skills = changes.skills;
    if (changes.experience) provider.experience = changes.experience;
    if (changes.hourlyRate) provider.hourlyRate = changes.hourlyRate;
    if (changes.availability) provider.availability = changes.availability;
    
   // ✅ FIX: Handle sample work from newSampleFiles, NOT changes.sampleWork
    if (request.newSampleFiles && request.newSampleFiles.length > 0) {
      console.log(`📸 Adding ${request.newSampleFiles.length} new sample files`);
      
      // Initialize sampleWork array if it doesn't exist
      if (!provider.sampleWork) {
        provider.sampleWork = [];
      }
      
      // Add new files to existing samples (limit to 10 total)
      provider.sampleWork = [...provider.sampleWork, ...request.newSampleFiles].slice(0, 10);
      
      console.log(`✅ Sample work now has ${provider.sampleWork.length} files`);
    }
    
    await provider.save();
    
    // Update request status
    request.status = "approved";
    request.processedAt = new Date();
    request.processedBy = req.user.id;
    await request.save();
    
    // Notify user via email or notification (optional)
    
    res.json({ 
      success: true, 
      message: "Provider update approved successfully",
      provider
    });
    
  } catch (error) {
    console.error("❌ Error approving update request:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

/* -------------------------------------------------------------------------- */
/* 🛠️ ADMIN: REJECT PROVIDER UPDATE REQUEST */
/* -------------------------------------------------------------------------- */
router.post("/update-requests/:requestId/reject", adminAuth, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    
    const ProviderUpdateRequest = mongoose.model('ProviderUpdateRequest');
    
    const request = await ProviderUpdateRequest.findById(requestId);
    
    if (!request) {
      return res.status(404).json({ 
        success: false, 
        message: "Update request not found" 
      });
    }
    
    request.status = "rejected";
    request.rejectionReason = reason || "No reason provided";
    request.processedAt = new Date();
    request.processedBy = req.user.id;
    await request.save();
    
    res.json({ 
      success: true, 
      message: "Update request rejected",
      request
    });
    
  } catch (error) {
    console.error("❌ Error rejecting update request:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});



// ==============================
// ✅ SUSPEND PROVIDER
// ==============================
router.patch("/:id/suspend", adminAuth, async (req, res) => {
  try {
    console.log("Suspending provider by admin:", req.admin.email);
    console.log("Provider ID:", req.params.id);
    console.log("Request body:", req.body);

    const { reason, duration } = req.body; // duration in days or null for permanent

    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ 
        success: false, 
        message: "Provider not found" 
      });
    }

    // Calculate suspension end date if duration provided
    let suspensionEndsAt = null;
    if (duration && duration > 0) {
      suspensionEndsAt = new Date();
      suspensionEndsAt.setDate(suspensionEndsAt.getDate() + duration);
    }

    // Update provider with suspension data
    provider.isSuspended = true;
    provider.suspendedAt = new Date();
    provider.suspendedBy = req.admin.id;
    provider.suspensionReason = reason || "Violation of terms";
    provider.suspensionEndsAt = suspensionEndsAt;

    await provider.save();

    console.log(`✅ Provider ${provider.firstName} ${provider.surname} suspended:`, {
      reason: reason || "Violation of terms",
      duration: duration ? `${duration} days` : 'permanent',
      endsAt: suspensionEndsAt
    });

    // Also suspend the associated user account if exists
    // if (provider.userId) {
    //   try {
    //     const user = await User.findById(provider.userId);
    //     if (user) {
    //       user.isSuspended = true;
    //       user.suspendedAt = new Date();
    //       user.suspendedBy = req.admin.id;
    //       user.suspensionReason = reason || "Provider account suspended";
    //       user.suspensionEndsAt = suspensionEndsAt;
    //       await user.save();
    //       console.log(`✅ Associated user ${user.email} also suspended`);
    //     }
    //   } catch (userError) {
    //     console.error("⚠️ Could not suspend associated user:", userError);
    //     // Continue - don't fail the provider suspension if user suspension fails
    //   }
    // }

    res.json({
      success: true,
      message: duration 
        ? `Provider suspended for ${duration} days` 
        : "Provider suspended permanently",
      provider: {
        _id: provider._id,
        firstName: provider.firstName,
        surname: provider.surname,
        isSuspended: provider.isSuspended,
        suspensionReason: provider.suspensionReason,
        suspensionEndsAt: provider.suspensionEndsAt,
        suspendedAt: provider.suspendedAt
      }
    });

  } catch (error) {
    console.error("❌ Error suspending provider:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while suspending provider" 
    });
  }
});

// ==============================
// ✅ UNSUSPEND PROVIDER
// ==============================
router.patch("/:id/unsuspend", adminAuth, async (req, res) => {
  try {
    console.log("Unsuspending provider by admin:", req.admin.email);
    console.log("Provider ID:", req.params.id);

    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ 
        success: false, 
        message: "Provider not found" 
      });
    }

    // Clear all suspension data
    provider.isSuspended = false;
    provider.suspendedAt = null;
    provider.suspendedBy = null;
    provider.suspensionReason = "";
    provider.suspensionEndsAt = null;

    await provider.save();

    console.log(`✅ Provider ${provider.firstName} ${provider.surname} unsuspended`);

    // Also unsuspend the associated user account if exists
    if (provider.userId) {
      try {
        const user = await User.findById(provider.userId);
        if (user) {
          user.isSuspended = false;
          user.suspendedAt = null;
          user.suspendedBy = null;
          user.suspensionReason = "";
          user.suspensionEndsAt = null;
          await user.save();
          console.log(`✅ Associated user ${user.email} also unsuspended`);
        }
      } catch (userError) {
        console.error("⚠️ Could not unsuspend associated user:", userError);
        // Continue - don't fail the provider unsuspension if user unsuspension fails
      }
    }

    res.json({
      success: true,
      message: "Provider unsuspended successfully",
      provider: {
        _id: provider._id,
        firstName: provider.firstName,
        surname: provider.surname,
        isSuspended: provider.isSuspended
      }
    });

  } catch (error) {
    console.error("❌ Error unsuspending provider:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while unsuspending provider" 
    });
  }
});

// ==============================
// ✅ BULK SUSPEND PROVIDERS
// ==============================
router.patch("/bulk-suspend", adminAuth, async (req, res) => {
  try {
    console.log("Bulk suspend providers by admin:", req.admin.email);
    console.log("Request body:", req.body);

    const { ids, reason, duration } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No providers selected" 
      });
    }

    // Calculate suspension end date if duration provided
    let suspensionEndsAt = null;
    if (duration && duration > 0) {
      suspensionEndsAt = new Date();
      suspensionEndsAt.setDate(suspensionEndsAt.getDate() + duration);
    }

    // Update all selected providers
    const result = await Provider.updateMany(
      { _id: { $in: ids } },
      { 
        $set: { 
          isSuspended: true,
          suspendedAt: new Date(),
          suspendedBy: req.admin.id,
          suspensionReason: reason || "Violation of terms",
          suspensionEndsAt: suspensionEndsAt
        }
      }
    );

    console.log(`✅ ${result.modifiedCount} providers suspended`);

    // Also suspend associated users
    try {
      const providers = await Provider.find({ _id: { $in: ids } }).select('userId');
      const userIds = providers
        .map(p => p.userId)
        .filter(id => id); // Remove null/undefined

      if (userIds.length > 0) {
        await User.updateMany(
          { _id: { $in: userIds } },
          { 
            $set: { 
              isSuspended: true,
              suspendedAt: new Date(),
              suspendedBy: req.admin.id,
              suspensionReason: reason || "Provider account suspended",
              suspensionEndsAt: suspensionEndsAt
            }
          }
        );
        console.log(`✅ ${userIds.length} associated users also suspended`);
      }
    } catch (userError) {
      console.error("⚠️ Could not suspend associated users:", userError);
      // Continue - don't fail the bulk operation
    }

    res.json({
      success: true,
      message: `${result.modifiedCount} provider(s) suspended successfully`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error("❌ Error bulk suspending providers:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while bulk suspending providers" 
    });
  }
});

// ==============================
// ✅ BULK UNSUSPEND PROVIDERS
// ==============================
router.patch("/bulk-unsuspend", adminAuth, async (req, res) => {
  try {
    console.log("Bulk unsuspend providers by admin:", req.admin.email);
    console.log("Request body:", req.body);

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No providers selected" 
      });
    }

    // Update all selected providers
    const result = await Provider.updateMany(
      { _id: { $in: ids } },
      { 
        $set: { 
          isSuspended: false,
          suspendedAt: null,
          suspendedBy: null,
          suspensionReason: "",
          suspensionEndsAt: null
        }
      }
    );

    console.log(`✅ ${result.modifiedCount} providers unsuspended`);

    // Also unsuspend associated users
    try {
      const providers = await Provider.find({ _id: { $in: ids } }).select('userId');
      const userIds = providers
        .map(p => p.userId)
        .filter(id => id); // Remove null/undefined

      if (userIds.length > 0) {
        await User.updateMany(
          { _id: { $in: userIds } },
          { 
            $set: { 
              isSuspended: false,
              suspendedAt: null,
              suspendedBy: null,
              suspensionReason: "",
              suspensionEndsAt: null
            }
          }
        );
        console.log(`✅ ${userIds.length} associated users also unsuspended`);
      }
    } catch (userError) {
      console.error("⚠️ Could not unsuspend associated users:", userError);
      // Continue - don't fail the bulk operation
    }

    res.json({
      success: true,
      message: `${result.modifiedCount} provider(s) unsuspended successfully`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error("❌ Error bulk unsuspending providers:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while bulk unsuspending providers" 
    });
  }
});

// ==============================
// ✅ GET SUSPENDED PROVIDERS
// ==============================
router.get("/suspended", adminAuth, async (req, res) => {
  try {
    console.log("Fetching suspended providers by admin:", req.admin.email);

    const suspendedProviders = await Provider.find({ 
      isSuspended: true 
    })
    .populate('userId', 'email phone')
    .sort({ suspendedAt: -1 });

    res.json({
      success: true,
      count: suspendedProviders.length,
      providers: suspendedProviders
    });

  } catch (error) {
    console.error("❌ Error fetching suspended providers:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while fetching suspended providers" 
    });
  }
});

// ==============================
// ✅ AUTO-UNSUSPEND EXPIRED PROVIDERS (CRON JOB ENDPOINT)
// ==============================
router.post("/check-expired", adminAuth, async (req, res) => {
  try {
    console.log("Checking for expired provider suspensions by admin:", req.admin.email);

    const now = new Date();
    
    // Find providers where suspension has expired
    const expiredProviders = await Provider.find({
      isSuspended: true,
      suspensionEndsAt: { $lt: now }
    });

    if (expiredProviders.length === 0) {
      return res.json({
        success: true,
        message: "No expired suspensions found",
        unsuspendedCount: 0
      });
    }

    // Unsuspend all expired providers
    const result = await Provider.updateMany(
      {
        isSuspended: true,
        suspensionEndsAt: { $lt: now }
      },
      {
        $set: {
          isSuspended: false,
          suspendedAt: null,
          suspendedBy: null,
          suspensionReason: "",
          suspensionEndsAt: null
        }
      }
    );

    console.log(`✅ Auto-unsuspended ${result.modifiedCount} expired providers`);

    // Also unsuspend associated users
    try {
      const userIds = expiredProviders
        .map(p => p.userId)
        .filter(id => id);

      if (userIds.length > 0) {
        await User.updateMany(
          { _id: { $in: userIds } },
          {
            $set: {
              isSuspended: false,
              suspendedAt: null,
              suspendedBy: null,
              suspensionReason: "",
              suspensionEndsAt: null
            }
          }
        );
        console.log(`✅ Auto-unsuspended ${userIds.length} associated users`);
      }
    } catch (userError) {
      console.error("⚠️ Could not auto-unsuspend associated users:", userError);
    }

    res.json({
      success: true,
      message: `${result.modifiedCount} provider(s) auto-unsuspended`,
      unsuspendedCount: result.modifiedCount,
      providers: expiredProviders.map(p => ({
        _id: p._id,
        firstName: p.firstName,
        surname: p.surname
      }))
    });

  } catch (error) {
    console.error("❌ Error checking expired provider suspensions:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while checking expired suspensions" 
    });
  }
});


export default router;