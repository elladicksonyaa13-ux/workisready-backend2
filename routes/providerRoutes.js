import express from "express";
import multer from "multer";
import Provider from "../models/Providers.js";
import { auth } from "../middleware/auth.js";
import path from "path";
import fs from "fs";
import { adminAuth } from "../middleware/auth.js";
import { normalizeFilePath } from '../utils/pathUtils.js';
import mongoose from "mongoose";
import ProviderUpdateRequest from "../models/ProviderUpdateRequest.js"; // ✅ ADD THIS IMPORT



const router = express.Router();

// ✅ Multer setup with normalized paths
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/providers";
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

// ✅ Add file filter for security
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const allowedDocumentTypes = /pdf|doc|docx|txt/;
  
  if (file.fieldname === 'profilePic') {
    // Only images for profile pictures
    const isImage = allowedImageTypes.test(path.extname(file.originalname).toLowerCase());
    cb(null, isImage);
  } else if (file.fieldname === 'sampleWork') {
    // Allow both images and documents for sample work
    const ext = path.extname(file.originalname).toLowerCase();
    const isValid = allowedImageTypes.test(ext) || allowedDocumentTypes.test(ext);
    cb(null, isValid);
  } else {
    cb(null, false);
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 11 // 1 profile pic + max 10 sample works
  }
});


// In your providerRoutes.js file
router.get("/providers-by-region", async (req, res) => {
  try {
    console.log("🔄 Fetching providers by region...");
    
    // Get Provider model
    const Provider = mongoose.model('Provider');
    
    // Define all Ghana regions in alphabetical order
    const allGhanaRegions = [
      'Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Brong-Ahafo', 
      'Central', 'Eastern', 'Greater Accra', 'Northern', 'Oti', 
      'Savannah', 'Upper East', 'Upper West', 'Volta', 'Western', 
      'Western North'
    ];
    
    // Get approved providers with regions
    const providers = await Provider.find({ 
      isApproved: true,
      region: { $exists: true, $ne: null, $ne: "" }
    })
    .select("region skills averageRating")
    .lean();
    
    console.log(`✅ Found ${providers.length} approved providers with regions`);
    
    // Initialize region map
    const regionStats = {};
    allGhanaRegions.forEach(region => {
      regionStats[region] = {
        providerCount: 0,
        totalRating: 0,
        skills: {}
      };
    });
    
    // Count providers and aggregate data by region
    providers.forEach(provider => {
      const region = provider.region ? provider.region.trim() : '';
      
      if (!region) return;
      
      // Find matching region (case-insensitive)
      const matchedRegion = allGhanaRegions.find(r => 
        r.toLowerCase() === region.toLowerCase()
      );
      
      if (!matchedRegion) return;
      
      const stats = regionStats[matchedRegion];
      stats.providerCount++;
      
      // Add rating
      if (provider.averageRating && typeof provider.averageRating === 'number') {
        stats.totalRating += provider.averageRating;
      }
      
      // Count skills
      if (provider.skills && Array.isArray(provider.skills)) {
        provider.skills.forEach(skill => {
          if (skill && typeof skill === 'string') {
            const skillKey = skill.trim().toLowerCase();
            if (skillKey) {
              stats.skills[skillKey] = (stats.skills[skillKey] || 0) + 1;
            }
          }
        });
      }
    });
    
    // Prepare response
    const regionsArray = allGhanaRegions
      .map(regionName => {
        const stats = regionStats[regionName];
        
        // Skip regions with no providers
        if (stats.providerCount === 0) return null;
        
        // Calculate average rating
        const averageRating = stats.providerCount > 0 && stats.totalRating > 0 
          ? parseFloat((stats.totalRating / stats.providerCount).toFixed(1))
          : 0;
        
        // Get top 3 skills
        const skillsArray = Object.entries(stats.skills);
        const topSkills = {};
        skillsArray
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .forEach(([skill, count]) => {
            topSkills[skill] = count;
          });
        
        // Calculate total skills
        const totalSkills = Object.values(stats.skills).reduce((sum, count) => sum + count, 0);
        
        return {
          _id: regionName.toLowerCase().replace(/\s+/g, '-'),
          name: regionName,
          providerCount: stats.providerCount,
          skills: topSkills,
          totalSkills: totalSkills,
          averageRating: averageRating,
          hasProviders: true
        };
      })
      .filter(region => region !== null); // Remove null entries
    
    const totalProviders = regionsArray.reduce((sum, r) => sum + r.providerCount, 0);
    const totalSkills = regionsArray.reduce((sum, r) => sum + r.totalSkills, 0);
    
    console.log(`✅ Returning ${regionsArray.length} regions with ${totalProviders} providers`);
    
    res.json({
      success: true,
      regions: regionsArray,
      totalProviders: totalProviders,
      totalSkills: totalSkills,
      regionsWithProviders: regionsArray.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Error in providers-by-region:", error);
    console.error("❌ Error stack:", error.stack);
    
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});



// // ✅ GET providers by region and category (for RegionCategoryProviders)
// router.get("/region-category", async (req, res) => {
//   try {
//     const { region, category } = req.query;
    
//     let filter = { status: 'active' };
    
//     if (region) {
//       filter.operatingRegions = { 
//         $regex: new RegExp(region, 'i') 
//       };
//     }
    
//     if (category) {
//       filter.serviceCategories = { 
//         $regex: new RegExp(category, 'i') 
//       };
//     }
    
//     const providers = await User.find(filter)
//       .select('fullName businessName profileImage description serviceCategories operatingRegions rating reviewCount isVerified yearsOfExperience city district')
//       .sort({ rating: -1, reviewCount: -1 });
    
//     res.json({
//       success: true,
//       providers: providers,
//       count: providers.length,
//       filters: { region, category }
//     });
    
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// });




// ✅ GET provider counts by region and category (OPTIMIZED)
router.get("/region/:regionName/category-counts", async (req, res) => {
  try {
    const { regionName } = req.params;
    
    console.log(`📊 Getting provider counts for region: "${regionName}"`);
    
    // Use MongoDB aggregation for efficient counting
    const results = await Provider.aggregate([
      {
        $match: {
          isApproved: true,
          region: { 
            $regex: new RegExp(`^${regionName}$`, 'i') 
          },
          category: { $exists: true, $ne: [], $ne: null }
        }
      },
      {
        $unwind: "$category" // Unwind the array to count each category separately
      },
      {
        $group: {
          _id: "$category",
          providerCount: { $sum: 1 },
          // Get sample providers with basic info
          sampleProviders: { 
            $push: {
              _id: "$_id",
              fullName: "$fullName",
              profilePic: "$profilePic",
              averageRating: "$averageRating",
              experience: "$experience"
            }
          }
        }
      },
      {
        $project: {
          category: "$_id",
          providerCount: 1,
          sampleProviders: { $slice: ["$sampleProviders", 3] }, // Limit to 3 samples
          _id: 0
        }
      },
      { $sort: { providerCount: -1 } }
    ]);
    
    // Get total providers in region
    const totalProviders = await Provider.countDocuments({
      isApproved: true,
      region: { $regex: new RegExp(`^${regionName}$`, 'i') }
    });
    
    console.log(`✅ Region stats for ${regionName}: ${totalProviders} total providers, ${results.length} categories`);
    
    res.json({
      success: true,
      region: regionName,
      totalProviders: totalProviders,
      categoryStats: results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Error in region category counts:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ GET providers by region AND specific category
router.get("/region-category", async (req, res) => {
  try {
    const { region, category, page = 1, limit = 20, sort = "rating" } = req.query;
    
    const query = {
      isApproved: true
    };
    
    // Region filter
    if (region) {
      query.region = { 
        $regex: new RegExp(`^${region}$`, 'i') 
      };
    }
    
    // Category filter - providers can have multiple categories
    if (category) {
      query.category = { 
        $in: [category] // Match any provider that has this category in their array
      };
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Sorting options
    let sortOption = {};
    switch(sort) {
      case "rating":
        sortOption = { averageRating: -1 };
        break;
      case "experience":
        sortOption = { experience: -1 };
        break;
      case "newest":
        sortOption = { createdAt: -1 };
        break;
      default:
        sortOption = { averageRating: -1 };
    }
    
    const [providers, total] = await Promise.all([
      Provider.find(query)
        .select('fullName firstName surname otherName profilePic bio category skills experience hourlyRate availability averageRating reviews city region totalJobs completedJobs responseRate isVerified')
        .sort(sortOption)
        .skip(skip)
        .limit(parseInt(limit)),
      Provider.countDocuments(query)
    ]);
    
    // Process providers to add virtuals
    const processedProviders = providers.map(provider => {
      const providerObj = provider.toObject();
      
      // Add virtual fields
      providerObj.formattedHourlyRate = provider.hourlyRate 
        ? `₵${provider.hourlyRate}/hour`
        : "Negotiable";
      
      providerObj.experienceLabel = provider.experienceLabel || "Not specified";
      providerObj.availabilityLabel = provider.availabilityLabel || "Flexible";
      
      // Add review count
      providerObj.reviewCount = provider.reviews?.length || 0;
      
      return providerObj;
    });
    
    res.json({
      success: true,
      providers: processedProviders,
      total: total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      filters: { region, category, sort }
    });
    
  } catch (error) {
    console.error("❌ Error fetching region-category providers:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ GET all unique categories from providers in a region
router.get("/region/:regionName/categories", async (req, res) => {
  try {
    const { regionName } = req.params;
    
    const categories = await Provider.aggregate([
      {
        $match: {
          isApproved: true,
          region: { 
            $regex: new RegExp(`^${regionName}$`, 'i') 
          }
        }
      },
      { $unwind: "$category" },
      { 
        $group: { 
          _id: "$category",
          count: { $sum: 1 }
        } 
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);
    
    res.json({
      success: true,
      region: regionName,
      categories: categories.map(c => ({ name: c._id, count: c.count })),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


/* -------------------------------------------------------------------------- */
/* 🟢 REGISTER PROVIDER (Only Once) */
/* -------------------------------------------------------------------------- */
router.post(
  "/",
  auth,
  upload.fields([
    { name: "profilePic", maxCount: 1 },
    { name: "sampleWork", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const userId = req.user._id;

      // ✅ Check if user already registered
      const existingProvider = await Provider.findOne({ userId });
      if (existingProvider) {
        return res.status(400).json({
          success: false,
          message: "You have already registered as a provider.",
        });
      }

      // Extract form data
      const {
        fname,
        sname,
        otherName,
        city,
        region,
        district,
        category,
        bio,
        skills,
        experience,
        hourlyRate,
        availability,
        phone,
        whatsapp,
        email,
      } = req.body;

      // ✅ Validate required fields
      if (!fname || !sname) {
        return res.status(400).json({
          success: false,
          message: "First name and surname are required.",
        });
      }

      // ✅ Create full name
      const fullName = `${fname} ${sname}${otherName ? ` ${otherName}` : ""}`.trim();

      // ✅ Normalize file paths
      let profilePicPath = "";
      if (req.files?.profilePic?.[0]) {
        profilePicPath = normalizeFilePath(req.files.profilePic[0].path);
      }

      // ✅ Normalize sample work paths
      const sampleWorkPaths = req.files?.sampleWork 
        ? req.files.sampleWork.map(file => normalizeFilePath(file.path))
        : [];

      // Create provider
      const newProvider = new Provider({
        userId: req.user._id,
        firstName: fname,
        surname: sname,
        otherName: otherName || "",
        fullName,
        city,
        region,
        district,
        category: category ? JSON.parse(category) : [],
        bio,
        skills: skills ? JSON.parse(skills) : [],
        experience: experience || "",
        hourlyRate: hourlyRate || "",
        availability: availability || "flexible",
        phone: phone || "",
        whatsapp: whatsapp || "",
        email: email || "",
        profilePic: profilePicPath,
        sampleWork: sampleWorkPaths,
        isApproved: false,
      });

      // Save to DB
      await newProvider.save();

      res.status(201).json({
        success: true,
        message: "Provider registration submitted successfully!",
        provider: newProvider,
      });
    } catch (error) {
      console.error("❌ Error registering provider:", error);
      
      // ✅ Clean up uploaded files if validation fails
      if (req.files) {
        Object.values(req.files).forEach(files => {
          files.forEach(file => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        });
      }
      
      res.status(500).json({
        success: false,
        message: "Server error during provider registration: " + error.message,
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* 🟡 CHECK PROVIDER REGISTRATION */
/* -------------------------------------------------------------------------- */
router.get("/check", auth, async (req, res) => {
  try {
    const provider = await Provider.findOne({ userId: req.user._id });
    res.json({
      success: true,
      exists: !!provider,
      provider,
    });
  } catch (error) {
    console.error("❌ Error checking provider registration:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* 🟣 GET ALL PROVIDERS */
/* -------------------------------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const providers = await Provider.find().sort({ createdAt: -1 });
    res.json({ success: true, providers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* -------------------------------------------------------------------------- */
/* 🟠 FETCH CURRENT PROVIDER INFO */
/* -------------------------------------------------------------------------- */
router.get("/me", auth, async (req, res) => {
  try {
    const provider = await Provider.findOne({ userId: req.user._id });
    if (!provider) {
      return res
        .status(404)
        .json({ success: false, message: "Provider profile not found" });
    }
    res.json({ success: true, provider });
  } catch (error) {
    console.error("❌ Error fetching provider:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* 🔍 SEARCH PROVIDERS BY NAME, CATEGORY OR SKILLS */
/* -------------------------------------------------------------------------- */
router.get("/search", async (req, res) => {
  try {
    const q = req.query.q?.trim();

    if (!q) {
      return res.json({ success: true, providers: [] });
    }

    // Case-insensitive partial match for name, category, or skills
    const providers = await Provider.find({
      $or: [
        { firstName: { $regex: q, $options: "i" } },
        { surname: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
        { skills: { $elemMatch: { $regex: q, $options: "i" } } },
      ],
    }).select("firstname surname category skills profilePic _id experience rating");

    res.json({ success: true, providers });
  } catch (error) {
    console.error("❌ Error searching providers:", error);
    res.status(500).json({ success: false, message: "Server error during search" });
  }
});

/* -------------------------------------------------------------------------- */
/* 🔵 GET SINGLE PROVIDER BY ID */
/* -------------------------------------------------------------------------- */
router.get("/:id", async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res
        .status(404)
        .json({ success: false, message: "Provider not found" });
    }
    res.json({ success: true, provider });
  } catch (error) {
    console.error("❌ Error fetching provider:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* 🔴 UPDATE PROVIDER INFO */
/* -------------------------------------------------------------------------- */
router.put(
  "/update",
  auth,
  upload.fields([
    { name: "profilePic", maxCount: 1 },
    { name: "sampleWork", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const provider = await Provider.findOne({ userId: req.user._id });
      if (!provider) {
        return res.status(404).json({
          success: false,
          message: "Provider not found"
        });
      }

      const updates = req.body;
      
      // Parse JSON fields
      if (updates.skills) updates.skills = JSON.parse(updates.skills);
      if (updates.category) updates.category = JSON.parse(updates.category);
      
      // Update name fields
      if (updates.fname || updates.sname || updates.otherName) {
        provider.firstName = updates.fname || provider.firstName;
        provider.surname = updates.sname || provider.surname;
        provider.otherName = updates.otherName || provider.otherName;
        // fullName will be updated by pre-save hook
      }
      
      // Update other fields
      const fields = ['city', 'region', 'district', 'bio', 'experience', 'hourlyRate', 
                      'availability', 'phone', 'whatsapp', 'email'];
      
      fields.forEach(field => {
        if (updates[field] !== undefined) {
          provider[field] = updates[field];
        }
      });
      
      // ✅ Handle profile picture update with normalized path
      if (req.files?.profilePic?.[0]) {
        // Delete old file if exists
        if (provider.profilePic && fs.existsSync(provider.profilePic)) {
          fs.unlinkSync(provider.profilePic);
        }
        provider.profilePic = normalizeFilePath(req.files.profilePic[0].path);
      }

      // ✅ Handle sample work with normalized paths
      if (req.files?.sampleWork) {
        const newSamples = req.files.sampleWork.map(file => 
          normalizeFilePath(file.path)
        );
        const allSamples = [...provider.sampleWork, ...newSamples].slice(0, 10);
        provider.sampleWork = allSamples;
      }

      // Update category and skills if provided
      if (updates.category) provider.category = updates.category;
      if (updates.skills) provider.skills = updates.skills;

      await provider.save();

      res.json({
        success: true,
        message: "Provider updated successfully!",
        provider,
      });
    } catch (error) {
      console.error("❌ Error updating provider:", error);
      res.status(500).json({
        success: false,
        message: "Server error updating provider: " + error.message,
      });
    }
  }
);

// DELETE sample work image
router.delete("/sample/:index", auth, async (req, res) => {
  try {
    const provider = await Provider.findOne({ userId: req.user._id });
    if (!provider) {
      return res.status(404).json({ success: false, message: "Provider not found" });
    }

    const index = parseInt(req.params.index);
    if (isNaN(index) || index < 0 || index >= provider.sampleWork.length) {
      return res.status(400).json({ success: false, message: "Invalid sample index" });
    }

    // Delete file from filesystem
    const filePath = provider.sampleWork[index];
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from array
    provider.sampleWork.splice(index, 1);
    await provider.save();

    res.json({
      success: true,
      message: "Sample image removed successfully",
      provider,
    });
  } catch (error) {
    console.error("❌ Error removing sample image:", error);
    res.status(500).json({
      success: false,
      message: "Server error removing sample image: " + error.message,
    });
  }
});

// -------------------------------------------------------------------------------
// POST: Add a review
// ---------------------------------------------------------------------------------
router.post("/:id/review", auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const provider = await Provider.findById(req.params.id);

    if (!provider) {
      return res.json({ success: false, message: "Provider not found" });
    }

    // Prevent duplicate review by same user
    const alreadyReviewed = provider.reviews.find(
      (r) => r.userId.toString() === req.user._id.toString()
    );

    if (alreadyReviewed) {
      return res.json({
        success: false,
        message: "You already reviewed this provider",
      });
    }

    const review = {
      userId: req.user.id,
      name: req.user.email, // email since WorkisReady shows only email
      rating,
      comment,
    };

    provider.reviews.push(review);
    provider.calculateRating();
    await provider.save();

    res.json({ success: true, message: "Review added", provider });
  } catch (err) {
    console.log(err);
    res.json({ success: false, message: "Error adding review" });
  }
});

router.patch("/:id/approve", adminAuth, async (req, res) => {
  const provider = await Provider.findById(req.params.id);
  if (!provider) return res.status(404).json({ success: false, message: "Not found" });
  provider.isApproved = !provider.isApproved;
  await provider.save();
  res.json({ success: true, message: provider.isApproved ? "Approved" : "Disapproved" });
});

router.patch("/bulk-approve", adminAuth, async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids))
    return res.status(400).json({ success: false, message: "Invalid ids" });

  try {
    await Provider.updateMany(
      { _id: { $in: ids } },
      { $set: { isApproved: true } }
    );
    res.json({ success: true, message: "Providers approved successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to approve providers" });
  }
});



/* -------------------------------------------------------------------------- */
/* PUBLIC: SUBMIT PROVIDER UPDATE REQUEST (for approval) */
/* -------------------------------------------------------------------------- */
router.post("/update-request", auth, upload.array("sampleWork", 10), async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("📝 Processing update request for user:", userId);
    
    // Get the provider record for this user
    const provider = await Provider.findOne({ userId });
    
    if (!provider) {
      return res.status(404).json({ 
        success: false, 
        message: "Provider profile not found" 
      });
    }
    
    console.log("✅ Found provider:", provider._id);
    
    // Parse the changes from the request
    const changes = {};
    
    if (req.body.category) {
      try {
        changes.category = JSON.parse(req.body.category);
      } catch (e) {
        changes.category = Array.isArray(req.body.category) ? req.body.category : [req.body.category];
      }
    }
    
    if (req.body.bio) changes.bio = req.body.bio;
    
    if (req.body.skills) {
      try {
        changes.skills = JSON.parse(req.body.skills);
      } catch (e) {
        changes.skills = Array.isArray(req.body.skills) ? req.body.skills : [req.body.skills];
      }
    }
    
    if (req.body.experience) changes.experience = req.body.experience;
    if (req.body.hourlyRate) changes.hourlyRate = req.body.hourlyRate;
    if (req.body.availability) changes.availability = req.body.availability;
    
    console.log("📦 Changes to submit:", changes);
    
    // Handle uploaded sample work files
    const sampleWorkPaths = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        // Store relative path
        sampleWorkPaths.push(`uploads/providers/${file.filename}`);
      });
      console.log("📸 New sample files:", sampleWorkPaths);
    }
    
    // Check if there are actual changes
    if (Object.keys(changes).length === 0 && sampleWorkPaths.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No changes detected to submit"
      });
    }
    
    // Import the ProviderUpdateRequest model
    const ProviderUpdateRequest = mongoose.model('ProviderUpdateRequest');
    
    // Create update request
    const updateRequest = new ProviderUpdateRequest({
      providerId: provider._id,
      userId: userId,
      changes: changes,
      newSampleFiles: sampleWorkPaths,
      status: "pending"
    });
    
    await updateRequest.save();
    console.log("✅ Update request saved with ID:", updateRequest._id);
    
    res.json({ 
      success: true, 
      message: "Update request submitted for admin approval. You will be notified when it's reviewed.",
      requestId: updateRequest._id
    });
    
  } catch (error) {
    console.error("❌ Error submitting update request:", error);
    console.error(error.stack);
    res.status(500).json({ 
      success: false, 
      message: "Server error: " + error.message 
    });
  }
});





export default router;