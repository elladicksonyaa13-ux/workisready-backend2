import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import Task from "../models/Task.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Multer setup ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads/tasks/"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "task-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) cb(null, true);
  else cb(new Error("Only image files are allowed!"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ---------- ROUTES ----------

// ✅ GET user’s tasks
router.get("/user/my-tasks", auth, async (req, res) => {
  try {
    const tasks = await Task.find({ clientId: req.user.id })
      .populate("clientId", "name email")
      .sort({ createdAt: -1 });

    console.log(`✅ Retrieved user tasks for ${req.user.email}: ${tasks.length}`);
    res.json({ success: true, tasks });
  } catch (error) {
    console.error("❌ Error fetching user tasks:", error);
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  }
});


// ✅ POST new task (UPDATED VERSION)
router.post("/", auth, upload.array("images", 5), async (req, res) => {
  try {
    console.log("📦 Received task creation request:", req.body);
    console.log("📦 Files:", req.files);

    const {
      title,
      mainCategory,
      category,
      description,
      city,           // New field
      region,         // New field
      district,
      location,       // Keep for backward compatibility
      dueDate,
      minBudget,
      maxBudget,
      phone,
      whatsapp,       // New field
      additionalContact,
    } = req.body;

    // Combine city and region if provided separately
    const finalLocation = location || (city && region ? `${city}, ${region}` : "");

    // Use whatsapp if provided, otherwise additionalContact
    const finalAdditionalContact = whatsapp || additionalContact || "";

    // Validate required fields
    const requiredFields = {
      title,
      category,
      description,
      location: finalLocation,
      dueDate,
      phone
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value || value.toString().trim() === "")
      .map(([key]) => key);

    if (missingFields.length > 0) {
      console.error("❌ Missing required fields:", missingFields);
      return res.status(400).json({ 
        success: false, 
        message: `Missing required fields: ${missingFields.join(", ")}` 
      });
    }

    // Handle multiple categories (frontend sends as array)
    const categories = Array.isArray(category) 
      ? category 
      : (typeof category === 'string' ? [category] : []);

    const imagePaths = req.files ? req.files.map((file) => file.filename) : [];

    const task = new Task({
  title: title.trim(),
  mainCategory: mainCategory || category[0], // Use mainCategory or first category
  category: categories,
  description: description.trim(),
  location: finalLocation.trim(),
  district: district || '',
  city: city || '',
  region: region || '', // ✅ ADD THIS LINE
  dueDate: new Date(dueDate),
  budget: { 
    min: parseFloat(minBudget) || 0, 
    max: parseFloat(maxBudget) || 0 
  },
  status: 'open',
  completedAt: null,
  contact: { 
    phone: phone.trim(), 
    additionalContact: finalAdditionalContact.trim(),
    whatsapp: whatsapp || '' // ✅ Add whatsapp if needed
  },
  images: imagePaths,
  clientId: req.user.id,
});

    await task.save();
    
    console.log("✅ Task created successfully:", task._id);
    res.status(201).json({ 
      success: true, 
      message: "Task created successfully", 
      task 
    });
  } catch (error) {
    console.error("❌ Error creating task:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error: " + error.message 
    });
  }
});

// ✅ SEARCH route (must come before /:id)
router.get("/search", async (req, res) => {
  try {
    const query = req.query.q || "";

    const tasks = await Task.find({
      $or: [
        { title: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
        { category: { $regex: query, $options: "i" } },
        { location: { $regex: query, $options: "i" } },
      ],
    }).select("title category description _id location budget");

    res.json({ success: true, tasks });
  } catch (error) {
    console.error("❌ Service search error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// ✅ UPDATE task by ID (handle new fields)
router.put("/:id", auth, upload.array("newImages", 5), async (req, res) => {
  try {
    const taskId = req.params.id;
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ 
        success: false, 
        message: "Task not found" 
      });
    }

    // Only the owner can edit
    if (task.clientId.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: "Unauthorized to edit this task" 
      });
    }

    // ✅ Parse data from FormData
    const {
      title,
      category,
      description,
      city,
      region,
      district,
      dueDate,
      minBudget,
      maxBudget,
      phone,
      whatsapp,
      existingImages,
    } = req.body;

    // Parse JSON strings safely
    const parsedExistingImages = existingImages ? JSON.parse(existingImages) : [];

    // ✅ Handle image removal
    const fs = await import("fs/promises");
    const removedImages = task.images.filter((img) => !parsedExistingImages.includes(img));

    for (const img of removedImages) {
      const imgPath = path.join(__dirname, "../uploads/tasks", img);
      try {
        await fs.unlink(imgPath);
        console.log("🗑️ Deleted old image:", img);
      } catch (err) {
        console.warn("⚠️ Failed to delete image:", img, err.message);
      }
    }

    // ✅ Add new uploaded images
    const newUploadedImages = req.files ? req.files.map((file) => file.filename) : [];

    // ✅ Handle category (can be string or array)
    const categories = Array.isArray(category) 
      ? category 
      : typeof category === 'string' 
        ? [category] 
        : task.category;

    // ✅ Update all fields including new ones
    task.title = title || task.title;
    task.category = categories;
    task.description = description || task.description;
    task.city = city || task.city;
    task.region = region || task.region;
    task.district = district || task.district; 
    task.location = city && region ? `${city}, ${region}` : task.location;
    task.dueDate = dueDate ? new Date(dueDate) : task.dueDate;
    task.budget = {
      min: minBudget ? parseFloat(minBudget) : task.budget.min,
      max: maxBudget ? parseFloat(maxBudget) : task.budget.max,
    };
    task.contact = {
      phone: phone || task.contact.phone,
      whatsapp: whatsapp || task.contact.whatsapp,
      additionalContact: whatsapp || task.contact.additionalContact,
    };
    task.images = [...parsedExistingImages, ...newUploadedImages];

    const updatedTask = await task.save();

    console.log("✅ Task updated successfully:", updatedTask._id);
    res.json({
      success: true,
      message: "Task updated successfully",
      task: updatedTask,
    });
  } catch (error) {
    console.error("❌ Error updating task:", error);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
});



// ✅ DELETE task by ID
router.delete("/:id", auth, async (req, res) => {
  try {
    const taskId = req.params.id;
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }

    // Ensure the logged-in user owns the task
    if (task.clientId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Unauthorized to delete this task" });
    }

    await task.deleteOne();
    console.log("🗑️ Task deleted:", taskId);

    res.json({ success: true, message: "Task deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting task:", error);
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  }
});




// ✅ GET region category statistics (OPTIMIZED for RegionServices page)
router.get("/region-stats/:regionName", async (req, res) => {
  try {
    const { regionName } = req.params;
    
    console.log(`📊 Getting region stats for: "${regionName}"`);
    
    // Clean region name
    const cleanRegion = regionName.replace(/ region$/i, '').trim();
    
    // Use MongoDB aggregation for fast counting
    const stats = await Task.aggregate([
      {
        $match: {
          status: 'open',
          region: { $regex: new RegExp(`^${cleanRegion}$`, 'i') },
          mainCategory: { $exists: true, $ne: null, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$mainCategory',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          category: '$_id',
          count: 1,
          _id: 0
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Get total jobs in region
    const totalJobs = await Task.countDocuments({
      status: 'open',
      region: { $regex: new RegExp(`^${cleanRegion}$`, 'i') }
    });
    
    console.log(`✅ Region stats for ${regionName}: ${totalJobs} total jobs, ${stats.length} categories`);
    
    res.json({
      success: true,
      region: regionName,
      cleanRegion: cleanRegion,
      totalJobs: totalJobs,
      categoryStats: stats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Error fetching region stats:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ GET all open tasks (for debugging/frontend fallback)
router.get("/all-open", async (req, res) => {
  try {
    const tasks = await Task.find({ status: 'open' })
      .select('title mainCategory category region city status')
      .limit(200) // Limit for safety
      .sort({ createdAt: -1 });
    
    res.json({ 
      success: true, 
      tasks,
      count: tasks.length,
      message: tasks.length >= 200 ? "Limited to 200 most recent tasks" : ""
    });
  } catch (error) {
    console.error("❌ Error fetching open tasks:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error: " + error.message 
    });
  }
});

// ✅ DEBUG: Test region filtering
router.get("/debug/region-test", async (req, res) => {
  try {
    const { region } = req.query;
    
    if (!region) {
      return res.json({
        success: false,
        message: "Please provide ?region= parameter"
      });
    }
    
    // Test different filtering approaches
    const cleanRegion = region.replace(/ region$/i, '').trim();
    
    const results = {
      requestedRegion: region,
      cleanRegion: cleanRegion,
      tests: {}
    };
    
    // Test 1: Exact match with cleaned region
    results.tests.exactMatch = await Task.find({
      region: { $regex: new RegExp(`^${cleanRegion}$`, 'i') },
      status: 'open'
    }).select('title region').limit(5);
    
    // Test 2: Case-insensitive partial match
    results.tests.partialMatch = await Task.find({
      region: { $regex: new RegExp(region, 'i') },
      status: 'open'
    }).select('title region').limit(5);
    
    // Test 3: All regions in database
    const allRegions = await Task.distinct('region', { status: 'open' });
    results.allRegionsInDB = allRegions.filter(r => r); // Remove null/empty
    
    res.json({
      success: true,
      ...results
    });
    
  } catch (error) {
    console.error("❌ Error in region test:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});







// ✅ GET tasks with PROPER filtering
router.get("/", async (req, res) => {
  try {
    const { 
      region, 
      status, 
      mainCategory, 
      category, 
      city, 
      limit = 100, 
      page = 1 
    } = req.query;
    
    console.log("=".repeat(50));
    console.log("🔍 INCOMING QUERY:", req.query);
    
    let filter = {};
    
    // ✅ 1. STATUS FILTER (with default)
    if (status) {
      filter.status = status;
    } else {
      filter.status = 'open'; // Default to open jobs
    }
    
    // ✅ 2. REGION FILTER - Case insensitive exact match
    if (region) {
      console.log(`📍 Region filter: "${region}"`);
      
      // Clean the region name (remove "Region" suffix if present)
      const cleanRegion = region.replace(/ region$/i, '').trim();
      
      // Case-insensitive exact match
      filter.region = { 
        $regex: new RegExp(`^${cleanRegion}$`, 'i')
      };
    }
    
    // ✅ 3. MAIN CATEGORY FILTER - THIS IS THE CRITICAL FIX
    if (mainCategory) {
      console.log(`📌 MainCategory filter: "${mainCategory}"`);
      
      // 🔥 FIX: Use $eq for exact match - this is the most reliable
      filter.mainCategory = { $eq: mainCategory };
      
      // Alternative if above doesn't work: use exact string match
      // filter.mainCategory = mainCategory;
    }
    
    // ✅ 4. CATEGORY ARRAY FILTER
    if (category) {
      filter.category = { $in: [category] };
    }
    
    // ✅ 5. CITY FILTER
    if (city) {
      filter.city = { $regex: new RegExp(city, 'i') };
    }
    
    console.log("📊 FINAL FILTER:", JSON.stringify(filter, null, 2));
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Execute query
    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .populate("clientId", "name email phone whatsapp")
        .select('title mainCategory category description region city district location status budget images createdAt dueDate')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Task.countDocuments(filter)
    ]);
    
    console.log(`✅ Found ${tasks.length} tasks (${total} total)`);
    
    // Debug output
    if (tasks.length > 0) {
      console.log("✅ First task:", {
        title: tasks[0].title,
        mainCategory: tasks[0].mainCategory,
        region: tasks[0].region
      });
    } else {
      console.log("❌ No tasks found. Checking database...");
      
      // Debug: Check what's in the database
      const sampleTasks = await Task.find({}).limit(3).select('title mainCategory region');
      console.log("📊 Sample tasks in DB:", sampleTasks);
      
      // Debug: Check distinct mainCategory values
      const categories = await Task.distinct('mainCategory');
      console.log("📊 Available mainCategories:", categories);
      
      // Debug: Check if your specific task exists
      const yourTask = await Task.findOne({ title: "health" });
      if (yourTask) {
        console.log("✅ Your task exists:", {
          title: yourTask.title,
          mainCategory: yourTask.mainCategory,
          region: yourTask.region
        });
      } else {
        console.log("❌ Task 'health' not found");
      }
    }
    
    console.log("=".repeat(50));
    
    res.json({ 
      success: true, 
      tasks,
      count: tasks.length,
      total: total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      filter: filter
    });
    
  } catch (error) {
    console.error("❌ Error fetching tasks:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error: " + error.message 
    });
  }
});

// ✅ GET task by ID (return new fields)
router.get("/:id", async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("clientId", "name email phone whatsapp profileImage");
    
    if (!task) {
      return res.status(404).json({ 
        success: false, 
        message: "Task not found" 
      });
    }
    
    res.json({ 
      success: true, 
      task 
    });
  } catch (error) {
    console.error("❌ Error fetching task:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error: " + error.message 
    });
  }
});

// // ✅ GET task by ID (keep LAST)
// router.get("/:id", async (req, res) => {
//   try {
//     const task = await Task.findById(req.params.id).populate("clientId", "name email phone");
//     if (!task) return res.status(404).json({ success: false, message: "Task not found" });
//     res.json({ success: true, task });
//   } catch (error) {
//     console.error("❌ Error fetching task:", error);
//     res.status(500).json({ success: false, message: "Server error: " + error.message });
//   }
// });


// In your routes file, update the status route (lines 275-329)
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.id;

    console.log(`📝 Status update request: Task ${id}, Status: ${status}, User: ${userId}`);

    // Validate status
    const validStatuses = ['open', 'completed'];
    if (!validStatuses.includes(status)) {
      console.error(`❌ Invalid status: ${status}`);
      return res.status(400).json({ 
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    // Find task
    const task = await Task.findById(id);
    if (!task) {
      console.error(`❌ Task not found: ${id}`);
      return res.status(404).json({ 
        success: false,
        message: 'Task not found' 
      });
    }

    // Check if user owns the task
    console.log(`🔍 Task owner: ${task.clientId.toString()}, Request user: ${userId}`);
    if (task.clientId.toString() !== userId.toString()) {
      console.error('❌ Unauthorized status update attempt');
      return res.status(403).json({ 
        success: false,
        message: 'Not authorized to update this task' 
      });
    }

    // Update status
    task.status = status;
    
    // Set completion date if marking as completed
    if (status === 'completed') {
      task.completedAt = Date.now();
      console.log(`✅ Task ${id} marked as completed at ${task.completedAt}`);
    } else if (status === 'open') {
      // Clear completion date if reopening
      task.completedAt = null;
      console.log(`✅ Task ${id} reopened`);
    }

    await task.save();

    console.log(`✅ Task status updated successfully: ${id} -> ${status}`);

    res.json({ 
      success: true,
      message: 'Task status updated successfully',
      task: {
        _id: task._id,
        title: task.title,
        status: task.status,
        completedAt: task.completedAt,
        updatedAt: task.updatedAt
      }
    });
  } catch (error) {
    console.error('❌ Error updating task status:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while updating task status' 
    });
  }
});

export default router;
