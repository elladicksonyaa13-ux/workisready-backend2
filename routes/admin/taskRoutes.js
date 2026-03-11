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


export default router;