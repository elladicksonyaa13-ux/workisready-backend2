import express from "express";
import { adminAuth } from "../middleware/auth.js";
import mongoose from 'mongoose';
// import {
//   FeaturedService,
//   UrgentWork,
//   PopularJob,
//   PopularCity,
//   JobsByRegion
// } from "../models/HomeSection.js";
import Task from "../models/Task.js";

const router = express.Router();

// ============ FRONTEND ENDPOINTS (Public) ============

// Get featured services with populated data
router.get("/featured-services", async (req, res) => {
  try {
    const services = await FeaturedService.find({ 
      isActive: true,
      expiresAt: { $gt: new Date() }
    })
      .populate({
        path: 'serviceId',
        select: 'name icon category description'
      })
      .populate({
        path: 'providerId',
        select: 'fullName businessName rating location'
      })
      .sort({ order: 1, createdAt: -1 })
      .limit(8);

    // Format response
    const formattedServices = services.map(item => ({
      _id: item._id,
      name: item.serviceId?.name || 'Service',
      icon: item.serviceId?.icon || '🔧',
      providerName: item.providerId?.fullName || item.providerId?.businessName || 'Provider',
      providerLocation: item.providerId?.location,
      rating: item.providerId?.rating,
      isPaid: item.isPaid,
      expiresAt: item.expiresAt
    }));

    res.json({ success: true, services: formattedServices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get urgent work with populated data
router.get("/urgent-work", async (req, res) => {
  try {
    const tasks = await UrgentWork.find({ 
      isActive: true,
      expiresAt: { $gt: new Date() }
    })
      .populate({
        path: 'taskId',
        select: 'title category location budget urgent applications clientId',
        populate: {
          path: 'clientId',
          select: 'fullName'
        }
      })
      .sort({ order: 1, createdAt: -1 })
      .limit(8);

    // Filter out tasks where the task itself might be deleted
    const validTasks = tasks.filter(item => item.taskId);
    
    const formattedTasks = validTasks.map(item => ({
      _id: item._id,
      taskId: item.taskId._id,
      title: item.taskId.title,
      category: item.taskId.category,
      location: item.taskId.location,
      budget: item.taskId.budget,
      urgent: item.taskId.urgent,
      applications: item.taskId.applications?.length || 0,
      clientName: item.taskId.clientId?.fullName,
      expiresAt: item.expiresAt
    }));

    res.json({ success: true, tasks: formattedTasks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get popular jobs with populated data
router.get("/popular-jobs", async (req, res) => {
  try {
    const jobs = await PopularJob.find({ isActive: true })
      .populate({
        path: 'taskId',
        select: 'title category location budget applications clientId createdAt',
        populate: {
          path: 'clientId',
          select: 'fullName'
        }
      })
      .sort({ order: 1, createdAt: -1 })
      .limit(8);

    const validJobs = jobs.filter(item => item.taskId);
    
    const formattedJobs = validJobs.map(item => ({
      _id: item._id,
      taskId: item.taskId._id,
      title: item.taskId.title,
      category: item.taskId.category,
      location: item.taskId.location,
      budget: item.taskId.budget,
      applications: item.taskId.applications?.length || 0,
      clientName: item.taskId.clientId?.fullName,
      createdAt: item.taskId.createdAt,
      reason: item.reason
    }));

    res.json({ success: true, jobs: formattedJobs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get popular cities (auto-calculated or manual)
router.get("/popular-cities", async (req, res) => {
  try {
    const cities = await PopularCity.find({ isActive: true })
      .sort({ order: 1 })
      .limit(8);

    // For auto-calculated cities, get real-time stats
    const formattedCities = await Promise.all(cities.map(async (city) => {
      if (city.isAutoCalculated) {
        const Task = mongoose.model('Task');
        const tasks = await Task.find({ 
          location: { $regex: city.name, $options: 'i' },
          status: 'open'
        });
        
        // Count by category
        const categories = {};
        tasks.forEach(task => {
          categories[task.category] = (categories[task.category] || 0) + 1;
        });

        return {
          _id: city._id,
          name: city.name,
          totalJobs: tasks.length,
          categories,
          isAutoCalculated: true
        };
      } else {
        return {
          _id: city._id,
          name: city.name,
          totalJobs: city.manualJobCount || 0,
          categories: city.manualCategories || {},
          isAutoCalculated: false
        };
      }
    }));

    res.json({ success: true, cities: formattedCities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// Helper function to get detailed category counts
async function getCategoryCountsForRegion(regionName) {
  try {
    const categoryStats = await Task.aggregate([
      { $match: { 
        region: regionName,
        status: "open" 
      }},
      { $group: {
          _id: "$category",
          count: { $sum: 1 }
      }},
      { $sort: { count: -1 } }
    ]);

    // Convert to object format
    const categories = {};
    categoryStats.forEach(stat => {
      categories[stat._id] = stat.count;
    });

    return categories;
  } catch (error) {
    console.error(`Error getting categories for ${regionName}:`, error);
    return {};
  }
}

// Get home page stats
router.get("/stats", async (req, res) => {
  try {
    const Task = mongoose.model('Task');
    const Provider = mongoose.model('Provider');
    const User = mongoose.model('User');
    
    const totalTasks = await Task.countDocuments({ status: 'open' });
    const totalProviders = await Provider.countDocuments({ isApproved: true });
    const totalClients = await User.countDocuments({ role: 'client' });
    const completedJobs = await Task.countDocuments({ status: 'completed' });
    
    res.json({
      success: true,
      totalTasks,
      totalProviders,
      totalClients,
      completedJobs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ ADMIN ENDPOINTS ============

// Search for tasks to feature
router.get("/admin/search/tasks", adminAuth, async (req, res) => {
  try {
    const { q, type = 'all' } = req.query;
    const Task = mongoose.model('Task');
    
    let query = {
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } },
        { location: { $regex: q, $options: 'i' } }
      ],
      status: 'open'
    };

    // Filter by type if specified
    if (type === 'urgent') {
      query.urgent = true;
    }

    const tasks = await Task.find(query)
      .populate('clientId', 'fullName')
      .select('title category location budget urgent applications createdAt')
      .limit(20)
      .sort({ createdAt: -1 });

    res.json({ 
      success: true, 
      results: tasks.map(task => ({
        _id: task._id,
        title: task.title,
        category: task.category,
        location: task.location,
        budget: task.budget,
        urgent: task.urgent,
        applications: task.applications?.length || 0,
        clientName: task.clientId?.fullName,
        createdAt: task.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Search for services to feature
router.get("/admin/search/services", adminAuth, async (req, res) => {
  try {
    const { q } = req.query;
    const Service = mongoose.model('Service');
    const Provider = mongoose.model('Provider');
    
    const services = await Service.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } }
      ]
    })
    .select('name icon category description')
    .limit(20);

    // Get provider count for each service
    const servicesWithCounts = await Promise.all(services.map(async (service) => {
      const providerCount = await Provider.countDocuments({
        services: service._id,
        // isApproved: true
      });
      
      return {
        _id: service._id,
        name: service.name,
        icon: service.icon,
        category: service.category,
        description: service.description,
        providerCount
      };
    }));

    res.json({ success: true, results: servicesWithCounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Search for providers for featured services
router.get("/admin/search/providers", adminAuth, async (req, res) => {
  try {
    const { q, serviceId } = req.query;
    const Provider = mongoose.model('Provider');
    
    let query = {
      $or: [
        { fullName: { $regex: q, $options: 'i' } },
        { businessName: { $regex: q, $options: 'i' } },
        { category: { $regex: q, $options: 'i' } }
      ],
      // isApproved: true
    };

    if (serviceId) {
      query.services = serviceId;
    }

    const providers = await Provider.find(query)
      .select('fullName businessName category location rating services')
      .limit(20)
      .populate('services', 'name')
      .sort({ rating: -1 });

    res.json({ 
      success: true, 
      results: providers.map(provider => ({
        _id: provider._id,
        name: provider.businessName || provider.fullName,
        category: provider.category,
        location: provider.location,
        rating: provider.rating,
        services: provider.services.map(s => s.name)
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* -------------------------------------------------------------------------- */
/* FEATURED PROVIDERS ENDPOINT (For Homepage) */
/* -------------------------------------------------------------------------- */
router.get("/featured-providers", async (req, res) => {
  try {
    console.log("Fetching featured providers for homepage...");
    
    // Try to get the FeaturedProvider model
    let FeaturedProviderModel;
    try {
      FeaturedProviderModel = mongoose.model('FeaturedProvider');
    } catch (err) {
      console.log("FeaturedProvider model not found, falling back to Provider model...");
      FeaturedProviderModel = null;
    }
    
    let featuredProviders = [];
    
    // Method 1: Get from FeaturedProvider collection if it exists
    if (FeaturedProviderModel) {
      const featuredFromCollection = await FeaturedProviderModel.find({ 
        isActive: true,
        expiresAt: { $gt: new Date() }
      })
      .populate({
        path: 'providerId',
        select: 'firstName surname otherName profilePic city region category skills averageRating reviews hourlyRate bio experience availability phone email createdAt isApproved',
        // match: { isApproved: true }
      })
      .sort({ order: 1, createdAt: -1 })
      .limit(8);
      
      // Filter out null providers and map to consistent format
      featuredProviders = featuredFromCollection
        .filter(item => item.providerId)
        .map(item => {
          const provider = item.providerId.toObject ? item.providerId.toObject() : item.providerId;
          
          // Add any additional data from featured entry
          return {
            ...provider,
            _id: provider._id,
            featuredOrder: item.order,
            // Ensure arrays
            category: Array.isArray(provider.category) ? provider.category : [],
            skills: Array.isArray(provider.skills) ? provider.skills : []
          };
        });
      
      console.log(`Found ${featuredProviders.length} providers from FeaturedProvider collection`);
    }
    
    // Method 2: Fallback to Provider model with isFeatured flag
    if (featuredProviders.length < 4) {
      console.log(`Need more providers, fetching from Provider model...`);
      
      const Provider = mongoose.model('Provider');
      const providersFromFlag = await Provider.find({ 
        isFeatured: true,
        // isApproved: true
      })
      .select('firstName surname otherName profilePic city region category skills averageRating reviews hourlyRate bio experience availability phone email createdAt')
      .sort({ createdAt: -1 })
      .limit(8 - featuredProviders.length);
      
      // Format providers
      const formattedProviders = providersFromFlag.map(provider => {
        const providerObj = provider.toObject ? provider.toObject() : provider;
        
        // Ensure arrays
        providerObj.category = Array.isArray(providerObj.category) ? providerObj.category : [];
        providerObj.skills = Array.isArray(providerObj.skills) ? providerObj.skills : [];
        
        return providerObj;
      });
      
      // Combine, avoiding duplicates
      const existingIds = new Set(featuredProviders.map(p => p._id.toString()));
      const newProviders = formattedProviders.filter(p => !existingIds.has(p._id.toString()));
      
      featuredProviders = [...featuredProviders, ...newProviders];
      
      console.log(`Added ${newProviders.length} providers from isFeatured flag`);
    }
    
    // Fix profile picture URLs
    const baseUrl = process.env.API_URL || 'http://localhost:5000';
    const finalProviders = featuredProviders.map(provider => {
      if (provider.profilePic && !provider.profilePic.startsWith('http')) {
        provider.profilePic = `${baseUrl}/${provider.profilePic.replace(/^\//, '')}`;
      }
      return provider;
    });
    
    console.log(`Total featured providers for homepage: ${finalProviders.length}`);
    
    // If we still have no providers, create some dummy data for testing
    if (finalProviders.length === 0) {
      console.log("No featured providers found, returning test data...");
      finalProviders.push({
        _id: "test1",
        firstName: "Test",
        surname: "Provider",
        profilePic: "https://via.placeholder.com/150",
        city: "Accra",
        region: "Greater Accra",
        category: ["Plumbing"],
        skills: ["Pipe Repair", "Installation"],
        averageRating: 4.5,
        hourlyRate: "50",
        isApproved: true,
        isFeatured: true
      });
    }
    
    res.json({ 
      success: true, 
      providers: finalProviders,
      count: finalProviders.length,
      message: `Found ${finalProviders.length} featured providers`,
      source: finalProviders.length > 0 ? "database" : "test"
    });
    
  } catch (error) {
    console.error("❌ Error fetching featured providers:", error);
    
    // Return test data on error for development
    res.json({ 
      success: true, 
      providers: [
        {
          _id: "test-error1",
          firstName: "Development",
          surname: "Mode",
          profilePic: "https://via.placeholder.com/150",
          city: "Accra",
          region: "Greater Accra",
          category: ["Development"],
          skills: ["Coding", "Debugging"],
          averageRating: 5.0,
          hourlyRate: "100",
          isApproved: true,
          isFeatured: true
        }
      ],
      count: 1,
      message: "Using test data due to error: " + error.message,
      source: "test-error"
    });
  }
});

// Urgent Work Admin CRUD
router.get("/admin/urgent-work", adminAuth, async (req, res) => {
  try {
    const tasks = await UrgentWork.find()
      .populate({
        path: 'taskId',
        select: 'title category location budget',
        populate: {
          path: 'clientId',
          select: 'fullName'
        }
      })
      .sort({ order: 1 });

    res.json({ success: true, tasks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/admin/urgent-work", adminAuth, async (req, res) => {
  try {
    const { taskId } = req.body;
    
    // Check if already urgent featured
    const existing = await UrgentWork.findOne({ taskId });
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: "This task is already in urgent work section" 
      });
    }

    // Check count limit (4-32)
    const count = await UrgentWork.countDocuments({ isActive: true });
    if (count >= 32) {
      return res.status(400).json({ 
        success: false, 
        message: "Maximum 32 urgent work items allowed" 
      });
    }

    // Set default expiry (7 days)
    const expiresAt = req.body.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const task = new UrgentWork({
      ...req.body,
      expiresAt,
      order: count
    });
    
    await task.save();
    
    // Populate response
    const populated = await UrgentWork.findById(task._id)
      .populate({
        path: 'taskId',
        select: 'title category location budget',
        populate: {
          path: 'clientId',
          select: 'fullName'
        }
      });

    res.json({ success: true, task: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Popular Jobs Admin CRUD
router.get("/admin/popular-jobs", adminAuth, async (req, res) => {
  try {
    const jobs = await PopularJob.find()
      .populate({
        path: 'taskId',
        select: 'title category location budget applications',
        populate: {
          path: 'clientId',
          select: 'fullName'
        }
      })
      .sort({ order: 1 });

    res.json({ success: true, jobs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/admin/popular-jobs", adminAuth, async (req, res) => {
  try {
    const { taskId } = req.body;
    
    // Check if already in popular jobs
    const existing = await PopularJob.findOne({ taskId });
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: "This task is already in popular jobs" 
      });
    }

    // Check count limit (4-32)
    const count = await PopularJob.countDocuments({ isActive: true });
    if (count >= 32) {
      return res.status(400).json({ 
        success: false, 
        message: "Maximum 32 popular jobs allowed" 
      });
    }

    const job = new PopularJob({
      ...req.body,
      order: count
    });
    
    await job.save();
    
    const populated = await PopularJob.findById(job._id)
      .populate({
        path: 'taskId',
        select: 'title category location budget applications',
        populate: {
          path: 'clientId',
          select: 'fullName'
        }
      });

    res.json({ success: true, job: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Popular Cities Admin CRUD
router.get("/admin/popular-cities", adminAuth, async (req, res) => {
  try {
    const cities = await PopularCity.find().sort({ order: 1 });
    res.json({ success: true, cities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/admin/popular-cities", adminAuth, async (req, res) => {
  try {
    const { name } = req.body;
    
    // Check if already exists
    const existing = await PopularCity.findOne({ name });
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: "This city is already in popular cities" 
      });
    }

    // Check count limit (4-32)
    const count = await PopularCity.countDocuments({ isActive: true });
    if (count >= 32) {
      return res.status(400).json({ 
        success: false, 
        message: "Maximum 32 cities allowed" 
      });
    }

    const city = new PopularCity({
      ...req.body,
      order: count
    });
    
    await city.save();
    res.json({ success: true, city });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Jobs by Region Admin CRUD
// router.get("/admin/jobs-by-region", adminAuth, async (req, res) => {
//   try {
//     const regions = await JobsByRegion.find().sort({ order: 1 });
    
//     // Ensure all 16 regions exist
//     const allRegions = [
//       'Ashanti', 'Brong-Ahafo', 'Central', 'Eastern', 'Greater Accra',
//       'NorthernX', 'Upper East', 'Upper West', 'Volta', 'Western',
//       'Western North', 'Oti', 'Ahafo', 'Bono', 'Bono East', 'Savannah'
//     ];
    
//     // Check and create missing regions
//     for (const regionName of allRegions) {
//       const exists = regions.find(r => r.region === regionName);
//       if (!exists) {
//         const newRegion = new JobsByRegion({
//           region: regionName,
//           order: regions.length,
//           isAutoCalculated: true
//         });
//         await newRegion.save();
//         regions.push(newRegion);
//       }
//     }
    
//     // Re-fetch sorted
//     const sortedRegions = await JobsByRegion.find().sort({ order: 1 });
//     res.json({ success: true, regions: sortedRegions });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// });

router.put("/admin/jobs-by-region/:id", adminAuth, async (req, res) => {
  try {
    const region = await JobsByRegion.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json({ success: true, region });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update order for any section
router.post("/admin/update-order", adminAuth, async (req, res) => {
  try {
    const { section, items } = req.body;
    
    let Model;
    switch(section) {
      case 'featured-services': Model = FeaturedService; break;
      case 'urgent-work': Model = UrgentWork; break;
      case 'popular-jobs': Model = PopularJob; break;
      case 'popular-cities': Model = PopularCity; break;
      case 'jobs-by-region': Model = JobsByRegion; break;
      default:
        return res.status(400).json({ success: false, message: "Invalid section" });
    }

    // Update all items
    const updatePromises = items.map((item, index) => 
      Model.findByIdAndUpdate(item._id, { order: index }, { new: true })
    );
    
    await Promise.all(updatePromises);
    res.json({ success: true, message: "Order updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;