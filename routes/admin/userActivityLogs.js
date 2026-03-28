import express from 'express';
import UserActivityLog from '../../models/UserActivityLog.js';
import { adminAuth } from '../../middleware/auth.js';

const router = express.Router();

// ==============================
// ✅ GET USER ACTIVITY LOGS
// ==============================
router.get('/', adminAuth, async (req, res) => {
  try {
    // Only superadmin can view user activity logs
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super admin privileges required.'
      });
    }

    const {
      page = 1,
      limit = 20,
      search = '',
      action = '',
      userType = '',
      startDate = '',
      endDate = ''
    } = req.query;

    const query = {};

    // Search by user name or email
    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by action
    if (action && action !== 'all') {
      query.action = action;
    }

    // Filter by user type
    if (userType && userType !== 'all') {
      query.userType = userType;
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
      UserActivityLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      UserActivityLog.countDocuments(query)
    ]);

    // Get stats
    const stats = {
      total: total,
      byAction: await UserActivityLog.aggregate([
        { $match: query },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      byUserType: await UserActivityLog.aggregate([
        { $match: query },
        { $group: { _id: '$userType', count: { $sum: 1 } } }
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
    console.error('Error fetching user activity logs:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==============================
// ✅ EXPORT USER ACTIVITY LOGS
// ==============================
router.get('/export', adminAuth, async (req, res) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super admin privileges required.'
      });
    }

    const {
      search = '',
      action = '',
      userType = '',
      startDate = '',
      endDate = ''
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } }
      ];
    }

    if (action && action !== 'all') query.action = action;
    if (userType && userType !== 'all') query.userType = userType;

    if (startDate) query.timestamp = { $gte: new Date(startDate) };
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      query.timestamp = { ...query.timestamp, $lte: endDateTime };
    }

    const logs = await UserActivityLog.find(query)
      .sort({ timestamp: -1 })
      .lean();

    if (logs.length === 0) {
      return res.status(404).json({ success: false, message: 'No data to export' });
    }

    // Format for CSV
    const csvData = logs.map(log => ({
      'User Name': log.userName,
      'User Email': log.userEmail,
      'User Type': log.userType === 'client' ? 'Client' : 'Worker',
      'Action': log.action === 'DELETE_ACCOUNT' ? 'Delete Account' :
                log.action === 'REQUEST_DELETION' ? 'Request Deletion' :
                log.action === 'SUSPEND_ACCOUNT' ? 'Suspend Account' :
                log.action === 'UNSUSPEND_ACCOUNT' ? 'Unsuspend Account' :
                log.action === 'REPORT_ABUSE' ? 'Report Abuse' :
                log.action === 'CONTACT_SUPPORT' ? 'Contact Support' : log.action,
      'Reason': log.details?.reason || '-',
      'Jobs Suspended': log.details?.jobsSuspended || 0,
      'Worker Profiles Suspended': log.details?.workerProfilesSuspended || 0,
      'IP Address': log.details?.ipAddress || '-',
      'Timestamp': new Date(log.timestamp).toLocaleString()
    }));

    const csvHeader = Object.keys(csvData[0]).join(',');
    const csvRows = csvData.map(row => Object.values(row).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
    const csv = [csvHeader, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=user-activity-logs-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting user activity logs:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;