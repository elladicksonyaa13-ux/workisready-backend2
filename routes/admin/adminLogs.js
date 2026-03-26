import express from 'express';
import AdminLog from '../../models/AdminLog.js';
import { adminAuth } from '../../middleware/auth.js';
import { adminOnly } from '../../middleware/adminMiddleware.js';

const router = express.Router();

// Get admin logs (superadmin only)
router.get('/', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      action = '',
      adminRole = '',
      startDate = '',
      endDate = ''
    } = req.query;
    
    const query = {};
    
    // Search by admin name or email or action
    if (search) {
      query.$or = [
        { adminName: { $regex: search, $options: 'i' } },
        { adminEmail: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } },
        { entityName: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by action
    if (action && action !== 'all') {
      query.action = action;
    }
    
    // Filter by admin role
    if (adminRole && adminRole !== 'all') {
      query.adminRole = adminRole;
    }
    
    // Filter by date range
    if (startDate) {
      query.timestamp = { $gte: new Date(startDate) };
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      query.timestamp = { ...query.timestamp, $lte: endDateTime };
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [logs, total] = await Promise.all([
      AdminLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AdminLog.countDocuments(query)
    ]);
    
    // Get stats
    const stats = {
      total: total,
      byAction: await AdminLog.aggregate([
        { $match: query },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      byAdminRole: await AdminLog.aggregate([
        { $match: query },
        { $group: { _id: '$adminRole', count: { $sum: 1 } } }
      ])
    };
    
    res.json({
      success: true,
      logs,
      stats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching admin logs:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Export admin logs (superadmin only)
router.get('/export', adminAuth, adminOnly, async (req, res) => {
  try {
    const { 
      search = '', 
      action = '',
      adminRole = '',
      startDate = '',
      endDate = ''
    } = req.query;
    
    const query = {};
    
    if (search) {
      query.$or = [
        { adminName: { $regex: search, $options: 'i' } },
        { adminEmail: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (action && action !== 'all') query.action = action;
    if (adminRole && adminRole !== 'all') query.adminRole = adminRole;
    
    if (startDate) query.timestamp = { $gte: new Date(startDate) };
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      query.timestamp = { ...query.timestamp, $lte: endDateTime };
    }
    
    const logs = await AdminLog.find(query)
      .sort({ timestamp: -1 })
      .lean();
    
    // Format for CSV
    const csvData = logs.map(log => ({
      'Admin Name': log.adminName,
      'Admin Email': log.adminEmail,
      'Admin Role': log.adminRole,
      'Action': log.action,
      'Entity Type': log.entityType,
      'Entity Name': log.entityName || '-',
      'Details': log.details?.reason || log.details?.count ? 
        (log.details.reason ? `Reason: ${log.details.reason}` : 
         log.details.count ? `Count: ${log.details.count}` : '') : '-',
      'IP Address': log.ipAddress || '-',
      'Timestamp': new Date(log.timestamp).toLocaleString()
    }));
    
    const csvHeader = Object.keys(csvData[0] || {}).join(',');
    const csvRows = csvData.map(row => Object.values(row).map(v => `"${v}"`).join(','));
    const csv = [csvHeader, ...csvRows].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=admin-logs-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting admin logs:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete old admin logs (superadmin only)
router.delete('/delete-range', adminAuth, adminOnly, async (req, res) => {
  try {
    const { hours } = req.body;
    
    if (!hours) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide hours" 
      });
    }
    
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);
    
    const result = await AdminLog.deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    
    // Log this deletion action
    const AdminLogModel = await import('../../models/AdminLog.js').then(m => m.default);
    await AdminLogModel.create({
      adminId: req.admin._id,
      adminName: req.admin.name,
      adminEmail: req.admin.email,
      adminRole: req.admin.role,
      action: 'DELETE_ADMIN_LOGS',
      entityType: 'log',
      details: {
        count: result.deletedCount,
        hours
      },
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent']
    });
    
    res.json({
      success: true,
      message: `${result.deletedCount} admin logs deleted successfully`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error deleting admin logs:", error);
    res.status(500).json({ 
      success: false, 
      message: "Could not delete admin logs",
      error: error.message 
    });
  }
});

export default router;