import express from "express";
import { adminAuth } from "../../middleware/auth.js";
import Task from "../../models/Task.js";
import * as taskController from '../../controllers/taskController.js';
import { createAdminLog } from '../../middleware/logAdminActivity.js';

const router = express.Router();

// ==============================
// ✅ GET ALL TASKS (ADMIN)
// ==============================
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

// ==============================
// ✅ GET SINGLE TASK
// ==============================
router.get("/:id", adminAuth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('clientId', 'name email phone whatsapp userType');
    
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    
    res.json({ success: true, task });
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==============================
// ✅ DELETE SINGLE TASK
// ==============================
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found"
      });
    }
    
    const taskTitle = task.title;
    await task.deleteOne();
    
    // ✅ LOG: Delete Job
    await createAdminLog({
      req,
      action: 'DELETE_JOB',
      entityType: 'job',
      entityId: req.params.id,
      entityName: taskTitle,
      details: { jobTitle: taskTitle, clientId: task.clientId }
    });
    
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

// ==============================
// ✅ BULK DELETE TASKS
// ==============================
router.post("/bulk-delete", adminAuth, async (req, res) => {
  try {
    const { taskIds } = req.body;
    
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No task IDs provided"
      });
    }
    
    // Get task titles for logging
    const tasks = await Task.find({ _id: { $in: taskIds } }).select('title');
    const taskTitles = tasks.map(t => t.title);
    
    const result = await Task.deleteMany({ _id: { $in: taskIds } });
    
    // ✅ LOG: Bulk Delete Jobs
    await createAdminLog({
      req,
      action: 'BULK_DELETE_JOBS',
      entityType: 'job',
      details: { 
        count: result.deletedCount, 
        jobIds: taskIds,
        jobTitles: taskTitles
      }
    });
    
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

// ==============================
// ✅ PROMOTE JOB
// ==============================
router.patch('/:id/promote', adminAuth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    
    const oldPromoteOn = { ...task.promoteOn };
    const { promoteOn } = req.body;
    task.promoteOn = promoteOn;
    await task.save();
    
    // ✅ LOG: Promote Job
    await createAdminLog({
      req,
      action: 'PROMOTE_JOB',
      entityType: 'job',
      entityId: req.params.id,
      entityName: task.title,
      details: { 
        before: oldPromoteOn,
        after: promoteOn
      }
    });
    
    res.json({ success: true, task });
  } catch (error) {
    console.error("Error promoting job:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==============================
// ✅ BULK PROMOTE
// ==============================
router.patch('/bulk-promote', adminAuth, async (req, res) => {
  try {
    const { taskIds, promoteOn } = req.body;
    
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ success: false, message: "No tasks selected" });
    }
    
    const result = await Task.updateMany(
      { _id: { $in: taskIds } },
      { $set: { promoteOn } }
    );
    
    // ✅ LOG: Bulk Promote Jobs
    await createAdminLog({
      req,
      action: 'BULK_PROMOTE_JOBS',
      entityType: 'job',
      details: { 
        count: result.modifiedCount, 
        jobIds: taskIds,
        promoteSettings: promoteOn
      }
    });
    
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error("Error bulk promoting jobs:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==============================
// ✅ SUSPEND JOB
// ==============================
router.patch("/:id/suspend", adminAuth, async (req, res) => {
  try {
    console.log("Suspending job by admin:", req.admin.email);
    console.log("Job ID:", req.params.id);
    console.log("Request body:", req.body);

    const { reason, duration } = req.body;

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ 
        success: false, 
        message: "Job not found" 
      });
    }

    let suspensionEndsAt = null;
    if (duration && duration > 0) {
      suspensionEndsAt = new Date();
      suspensionEndsAt.setDate(suspensionEndsAt.getDate() + duration);
    }

    task.isSuspended = true;
    task.suspendedAt = new Date();
    task.suspendedBy = req.admin.id;
    task.suspensionReason = reason || "Violation of terms";
    task.suspensionEndsAt = suspensionEndsAt;

    await task.save();

    // ✅ LOG: Suspend Job
    await createAdminLog({
      req,
      action: 'SUSPEND_JOB',
      entityType: 'job',
      entityId: req.params.id,
      entityName: task.title,
      details: { 
        reason: reason || "Violation of terms", 
        duration: duration ? `${duration} days` : "permanent"
      }
    });

    console.log(`✅ Job ${task.title} suspended`);

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

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ 
        success: false, 
        message: "Job not found" 
      });
    }

    task.isSuspended = false;
    task.suspendedAt = null;
    task.suspendedBy = null;
    task.suspensionReason = "";
    task.suspensionEndsAt = null;

    await task.save();

    // ✅ LOG: Unsuspend Job
    await createAdminLog({
      req,
      action: 'UNSUSPEND_JOB',
      entityType: 'job',
      entityId: req.params.id,
      entityName: task.title,
      details: { jobTitle: task.title }
    });

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

    const { ids, reason, duration } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No jobs selected" 
      });
    }

    let suspensionEndsAt = null;
    if (duration && duration > 0) {
      suspensionEndsAt = new Date();
      suspensionEndsAt.setDate(suspensionEndsAt.getDate() + duration);
    }

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

    // ✅ LOG: Bulk Suspend Jobs
    await createAdminLog({
      req,
      action: 'BULK_SUSPEND_JOBS',
      entityType: 'job',
      details: { 
        count: result.modifiedCount, 
        jobIds: ids,
        reason: reason || "Violation of terms",
        duration: duration ? `${duration} days` : "permanent"
      }
    });

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

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No jobs selected" 
      });
    }

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

    // ✅ LOG: Bulk Unsuspend Jobs
    await createAdminLog({
      req,
      action: 'BULK_UNSUSPEND_JOBS',
      entityType: 'job',
      details: { count: result.modifiedCount, jobIds: ids }
    });

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

    // ✅ LOG: Auto Unsuspend Jobs
    await createAdminLog({
      req,
      action: 'AUTO_UNSUSPEND_JOBS',
      entityType: 'job',
      details: { 
        count: result.modifiedCount,
        jobIds: expiredJobs.map(j => j._id),
        jobTitles: expiredJobs.map(j => j.title)
      }
    });

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