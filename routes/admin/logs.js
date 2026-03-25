import express from 'express';
import LogService from '../../services/logService.js';
import { adminAuth } from '../../middleware/auth.js';

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

export default router;