import express from 'express';
import LogService from '../../services/logService.js';
import { adminAuth } from '../../middleware/auth.js';
import ActivityLog from '../../models/ActivityLog.js';
import { createAdminLog } from '../../middleware/logAdminActivity.js';

const router = express.Router();

// ========================
// GET LOGS
// ========================
router.get('/', adminAuth, async (req, res) => {
  try {
    const {
      targetType,
      actionType,
      userId,
      targetId,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;
    
    // ✅ LOG: View Logs (only log significant views, not every page load)
    // Only log when filters are applied or search is used to avoid spam
    if (search || startDate || endDate || (actionType && actionType !== 'all')) {
      await createAdminLog({
        req,
        action: 'VIEW_LOGS',
        entityType: 'log',
        details: {
          filters: {
            targetType,
            actionType: actionType !== 'all' ? actionType : null,
            search: search || null,
            startDate: startDate || null,
            endDate: endDate || null
          }
        }
      });
    }
    
    const result = await LogService.getLogs({
      targetType,
      actionType,
      userId,
      targetId,
      startDate,
      endDate,
      search,
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========================
// EXPORT LOGS TO CSV
// ========================
router.get('/export', adminAuth, async (req, res) => {
  try {
    const {
      targetType,
      actionType,
      startDate,
      endDate,
      search
    } = req.query;
    
    const logs = await LogService.exportLogs({
      targetType,
      actionType,
      startDate,
      endDate,
      search
    });
    
    // Convert to CSV
    if (logs.length === 0) {
      return res.status(404).json({ success: false, message: 'No data to export' });
    }
    
    const headers = Object.keys(logs[0]);
    const csvRows = [
      headers.join(','),
      ...logs.map(row => headers.map(header => {
        const value = row[header] || '';
        // Escape quotes and wrap in quotes if contains comma
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(','))
    ];
    
    const csv = csvRows.join('\n');
    
    // ✅ LOG: Export Logs
    await createAdminLog({
      req,
      action: 'EXPORT_LOGS',
      entityType: 'log',
      details: {
        filters: {
          targetType: targetType || 'all',
          actionType: actionType || 'all',
          startDate: startDate || null,
          endDate: endDate || null,
          search: search || null
        },
        count: logs.length
      }
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=logs_${new Date().toISOString()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting logs:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========================
// GET STATS
// ========================
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const { targetType, startDate, endDate } = req.query;
    
    const query = {};
    if (targetType && targetType !== 'all') {
      query.targetType = targetType;
    }
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        query.timestamp.$lte = endDateTime;
      }
    }
    
    const stats = await LogService.calculateStats(query);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========================
// GET TARGET STATS
// ========================
router.get('/target/:targetId/:targetType/stats', adminAuth, async (req, res) => {
  try {
    const { targetId, targetType } = req.params;
    const stats = await LogService.getTargetStats(targetId, targetType);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching target stats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========================
// GET USER INTERACTION HISTORY
// ========================
router.get('/user/:userId', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { targetType, limit = 50 } = req.query;
    const history = await LogService.getUserInteractionHistory(userId, targetType, parseInt(limit));
    res.json({ success: true, history });
  } catch (error) {
    console.error('Error fetching user history:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========================
// DELETE LOGS OLDER THAN X DAYS
// ========================
router.delete("/delete-range", adminAuth, async (req, res) => {
  try {
    const { hours, days } = req.body;
    
    // Calculate cutoff time
    const cutoffDate = new Date();
    let timeUnit = '';
    let timeValue = '';
    
    if (hours) {
      cutoffDate.setHours(cutoffDate.getHours() - hours);
      timeUnit = 'hours';
      timeValue = hours;
    } else if (days) {
      cutoffDate.setDate(cutoffDate.getDate() - days);
      timeUnit = 'days';
      timeValue = days;
    } else {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide hours or days" 
      });
    }
    
    // Get count of logs to be deleted for logging
    const countToDelete = await ActivityLog.countDocuments({
      timestamp: { $lt: cutoffDate }
    });
    
    const result = await ActivityLog.deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    
    // ✅ LOG: Delete Logs
    await createAdminLog({
      req,
      action: 'DELETE_LOGS',
      entityType: 'log',
      details: {
        deletedCount: result.deletedCount,
        criteria: {
          olderThan: `${timeValue} ${timeUnit}`,
          cutoffDate: cutoffDate.toISOString()
        }
      }
    });
    
    res.json({
      success: true,
      message: `${result.deletedCount} logs deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error deleting logs:", error);
    res.status(500).json({ 
      success: false, 
      message: "Could not delete logs",
      error: error.message 
    });
  }
});

export default router;