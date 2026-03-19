// routes/adminTaskRoutes.js
import express from "express";
import { adminAuth } from "../../middleware/auth.js"; // Use adminAuth middleware
import Task from "../../models/Task.js";

import * as taskController from '../../controllers/taskController.js';

const router = express.Router();

// ✅ GET all tasks (admin view)
router.get("/", adminAuth, async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate("clientId", "email name phone")
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      tasks,
      total: tasks.length
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching tasks"
    });
  }
});

// ✅ DELETE single task (admin)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found"
      });
    }
    
    await task.deleteOne();
    
    res.json({
      success: true,
      message: "Task deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({
      success: false,
      message: "Server error deleting task"
    });
  }
});

// ✅ BULK DELETE tasks (admin)
router.post("/bulk-delete", adminAuth, async (req, res) => {
  try {
    const { taskIds } = req.body;
    
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No task IDs provided"
      });
    }
    
    const result = await Task.deleteMany({ _id: { $in: taskIds } });
    
    res.json({
      success: true,
      message: `${result.deletedCount} tasks deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error bulk deleting tasks:", error);
    res.status(500).json({
      success: false,
      message: "Server error bulk deleting tasks"
    });
  }
});

// In your backend, create routes for tasks promotion:
router.patch('/:id/promote', adminAuth, taskController.updatePromotion);
router.patch('/bulk-promote', adminAuth, taskController.bulkPromote);



// ==============================
// ✅ SUSPEND JOB
// ==============================
router.patch("/:id/suspend", adminAuth, async (req, res) => {
  try {
    console.log("Suspending job by admin:", req.admin.email);
    console.log("Job ID:", req.params.id);
    console.log("Request body:", req.body);

    const { reason, duration } = req.body; // duration in days or null for permanent

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ 
        success: false, 
        message: "Job not found" 
      });
    }

    // Calculate suspension end date if duration provided
    let suspensionEndsAt = null;
    if (duration && duration > 0) {
      suspensionEndsAt = new Date();
      suspensionEndsAt.setDate(suspensionEndsAt.getDate() + duration);
    }

    // Update job with suspension data
    task.isSuspended = true;
    task.suspendedAt = new Date();
    task.suspendedBy = req.admin.id;
    task.suspensionReason = reason || "Violation of terms";
    task.suspensionEndsAt = suspensionEndsAt;

    await task.save();

    console.log(`✅ Job ${task.title} suspended:`, {
      reason: reason || "Violation of terms",
      duration: duration ? `${duration} days` : 'permanent',
      endsAt: suspensionEndsAt
    });

    res.json({
      success: true,
      message: duration 
        ? `Job suspended for ${duration} days` 
        : "Job suspended permanently",
      task: {
        _id: task._id,
        title: task.title,
        isSuspended: task.isSuspended,
        suspensionReason: task.suspensionReason,
        suspensionEndsAt: task.suspensionEndsAt,
        suspendedAt: task.suspendedAt
      }
    });

  } catch (error) {
    console.error("❌ Error suspending job:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while suspending job" 
    });
  }
});

// ==============================
// ✅ UNSUSPEND JOB
// ==============================
router.patch("/:id/unsuspend", adminAuth, async (req, res) => {
  try {
    console.log("Unsuspending job by admin:", req.admin.email);
    console.log("Job ID:", req.params.id);

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ 
        success: false, 
        message: "Job not found" 
      });
    }

    // Clear all suspension data
    task.isSuspended = false;
    task.suspendedAt = null;
    task.suspendedBy = null;
    task.suspensionReason = "";
    task.suspensionEndsAt = null;

    await task.save();

    console.log(`✅ Job ${task.title} unsuspended`);

    res.json({
      success: true,
      message: "Job unsuspended successfully",
      task: {
        _id: task._id,
        title: task.title,
        isSuspended: task.isSuspended
      }
    });

  } catch (error) {
    console.error("❌ Error unsuspending job:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while unsuspending job" 
    });
  }
});

// ==============================
// ✅ BULK SUSPEND JOBS
// ==============================
router.patch("/bulk-suspend", adminAuth, async (req, res) => {
  try {
    console.log("Bulk suspend jobs by admin:", req.admin.email);
    console.log("Request body:", req.body);

    const { ids, reason, duration } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No jobs selected" 
      });
    }

    // Calculate suspension end date if duration provided
    let suspensionEndsAt = null;
    if (duration && duration > 0) {
      suspensionEndsAt = new Date();
      suspensionEndsAt.setDate(suspensionEndsAt.getDate() + duration);
    }

    // Update all selected jobs
    const result = await Task.updateMany(
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

    console.log(`✅ ${result.modifiedCount} jobs suspended`);

    res.json({
      success: true,
      message: `${result.modifiedCount} job(s) suspended successfully`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error("❌ Error bulk suspending jobs:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while bulk suspending jobs" 
    });
  }
});

// ==============================
// ✅ BULK UNSUSPEND JOBS
// ==============================
router.patch("/bulk-unsuspend", adminAuth, async (req, res) => {
  try {
    console.log("Bulk unsuspend jobs by admin:", req.admin.email);
    console.log("Request body:", req.body);

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No jobs selected" 
      });
    }

    // Update all selected jobs
    const result = await Task.updateMany(
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

    console.log(`✅ ${result.modifiedCount} jobs unsuspended`);

    res.json({
      success: true,
      message: `${result.modifiedCount} job(s) unsuspended successfully`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error("❌ Error bulk unsuspending jobs:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while bulk unsuspending jobs" 
    });
  }
});

// ==============================
// ✅ GET SUSPENDED JOBS
// ==============================
router.get("/suspended", adminAuth, async (req, res) => {
  try {
    console.log("Fetching suspended jobs by admin:", req.admin.email);

    const suspendedJobs = await Task.find({ 
      isSuspended: true 
    }).sort({ suspendedAt: -1 });

    res.json({
      success: true,
      count: suspendedJobs.length,
      jobs: suspendedJobs
    });

  } catch (error) {
    console.error("❌ Error fetching suspended jobs:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while fetching suspended jobs" 
    });
  }
});

// ==============================
// ✅ AUTO-UNSUSPEND EXPIRED JOBS (CRON JOB ENDPOINT)
// ==============================
router.post("/check-expired", adminAuth, async (req, res) => {
  try {
    console.log("Checking for expired job suspensions by admin:", req.admin.email);

    const now = new Date();
    
    // Find jobs where suspension has expired
    const expiredJobs = await Task.find({
      isSuspended: true,
      suspensionEndsAt: { $lt: now }
    });

    if (expiredJobs.length === 0) {
      return res.json({
        success: true,
        message: "No expired suspensions found",
        unsuspendedCount: 0
      });
    }

    // Unsuspend all expired jobs
    const result = await Task.updateMany(
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

    console.log(`✅ Auto-unsuspended ${result.modifiedCount} expired jobs`);

    res.json({
      success: true,
      message: `${result.modifiedCount} job(s) auto-unsuspended`,
      unsuspendedCount: result.modifiedCount,
      jobs: expiredJobs.map(job => ({
        _id: job._id,
        title: job.title
      }))
    });

  } catch (error) {
    console.error("❌ Error checking expired suspensions:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while checking expired suspensions" 
    });
  }
});



export default router;