// backend/routes/admin/notificationRoutes.js
import express from 'express';
import Notification from '../../models/Notification.js';
import User from '../../models/User.js';
import Provider from '../../models/Providers.js';
import { sendExpoPushNotification } from '../../config/firebase.js';
import { adminAuth } from '../../middleware/auth.js';
import AdminLog from '../../models/AdminLog.js';

const router = express.Router();

// ========================
// GET RECIPIENT COUNT
// ========================
router.get('/count', adminAuth, async (req, res) => {
  try {
    const { type, region, district, categories } = req.query;
    let query = { isSuspended: { $ne: true } };
    
    switch (type) {
      case 'clients':
        // Clients = users WITHOUT a provider profile
        const clientProviderIds = await Provider.find({}).distinct('userId');
        query._id = { $nin: clientProviderIds };
        break;
        
      case 'workers':
        // Workers = users WITH a provider profile
        const workerUserIds = await Provider.find({ isSuspended: { $ne: true } }).distinct('userId');
        query._id = { $in: workerUserIds };
        break;
        
      case 'by_region':
        const regionQuery = { isSuspended: { $ne: true } };
        if (region) regionQuery.region = region;
        if (district) regionQuery.district = district;
        
        const regionProviders = await Provider.find(regionQuery).distinct('userId');
        query._id = { $in: regionProviders };
        break;
        
      case 'by_category':
        if (categories) {
          const categoryList = categories.split(',');
          const providers = await Provider.find({ 
            category: { $in: categoryList },
            isSuspended: { $ne: true }
          }).distinct('userId');
          query._id = { $in: providers };
        }
        break;
        
      default:
        // all users
        break;
    }
    
    const count = await User.countDocuments(query);
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error counting recipients:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================
// SEND NOTIFICATION
// ========================
router.post('/send', adminAuth, async (req, res) => {
  try {
    const { type, title, message, region, district, categories } = req.body;
    
    console.log('📨 Sending admin notification:', { type, title, region, district, categoriesCount: categories?.length });
    
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }
    
    let query = { isSuspended: { $ne: true } };
    let userTypeLabel = '';
    
    switch (type) {
      case 'clients':
        const clientProviderIds = await Provider.find({}).distinct('userId');
        query._id = { $nin: clientProviderIds };
        userTypeLabel = 'clients';
        break;
        
      case 'workers':
        const workerUserIds = await Provider.find({ isSuspended: { $ne: true } }).distinct('userId');
        query._id = { $in: workerUserIds };
        userTypeLabel = 'workers';
        break;
        
      case 'by_region':
        const regionQuery = { isSuspended: { $ne: true } };
        if (region) regionQuery.region = region;
        if (district) regionQuery.district = district;
        
        const regionProviders = await Provider.find(regionQuery).distinct('userId');
        query._id = { $in: regionProviders };
        userTypeLabel = `users in ${region}${district ? `, ${district}` : ''}`;
        break;
        
      case 'by_category':
        if (categories && categories.length > 0) {
          const providers = await Provider.find({ 
            category: { $in: categories },
            isSuspended: { $ne: true }
          }).distinct('userId');
          query._id = { $in: providers };
          userTypeLabel = `workers in categories: ${categories.slice(0, 3).join(', ')}${categories.length > 3 ? ` +${categories.length - 3}` : ''}`;
        } else {
          const allWorkers = await Provider.find({ isSuspended: { $ne: true } }).distinct('userId');
          query._id = { $in: allWorkers };
          userTypeLabel = 'all workers';
        }
        break;
        
      default:
        userTypeLabel = 'all users';
        break;
    }
    
    console.log('🔍 Query:', JSON.stringify(query));
    
    const users = await User.find(query).select('_id name email deviceTokens region district');
    
    console.log(`👥 Found ${users.length} ${userTypeLabel}`);
    
    if (users.length === 0) {
      return res.status(400).json({ success: false, message: 'No recipients found' });
    }
    
    // Collect Expo tokens
    const expoTokens = [];
    for (const user of users) {
      if (user.deviceTokens?.length > 0) {
        const tokens = user.deviceTokens
          .filter(t => t.type === 'expo' && t.token)
          .map(t => t.token);
        expoTokens.push(...tokens);
      }
    }
    
    console.log(`📱 Found ${expoTokens.length} Expo tokens`);
    
    let sentCount = 0;
    
    if (expoTokens.length > 0) {
      try {
        const chunkSize = 100;
        for (let i = 0; i < expoTokens.length; i += chunkSize) {
          const chunk = expoTokens.slice(i, i + chunkSize);
          const result = await sendExpoPushNotification(chunk, {
            title,
            message,
            type: 'admin',
          });
          
          if (result?.data?.status === 'ok') {
            sentCount += chunk.length;
          }
        }
        console.log(`✅ Sent to ${sentCount} devices`);
      } catch (error) {
        console.error('Error sending push notifications:', error);
      }
    }
    
    // Save notifications to database
    const notifications = users.map(user => ({
      userId: user._id,
      title,
      message,
      type: 'job',         // ← use a valid enum value, or add 'admin' to your schema
      userType: 'client',  // ← derive this properly, or add 'admin' to schema
      type: 'admin',
      color: 'blue',
      isRead: false,
      metadata: {
        sentBy: req.admin?._id || req.admin?.id,
        sentByAdmin: req.admin?.name || req.adminName,
        notificationType: type,
        region: region || null,
        district: district || null,
        categories: categories || null,
      },
    }));
    
    await Notification.insertMany(notifications);
    console.log(`✅ Saved ${notifications.length} notifications to database`);
    
    // ✅ Save Admin Log with correct structure
    try {
      await AdminLog.create({
        adminId: req.admin?._id || req.admin?.id,
        adminName: req.admin?.name || req.adminName,
        adminEmail: req.admin?.email || req.adminEmail,
        adminRole: req.admin?.role || req.adminRole,
        action: 'SEND_NOTIFICATION',
        entityType: 'notification',
        details: {
          type,
          title,
          message,
          recipientCount: users.length,
          pushSentCount: sentCount,
          region: region || null,
          district: district || null,
          categories: categories || null,
        },
        // Optional: add IP and user agent if available
        ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
        userAgent: req.headers['user-agent'] || null,
      });
      console.log('✅ Admin log saved');
    } catch (logError) {
      console.error('Error saving admin log:', logError.message);
      // Don't fail the request if logging fails
    }
    
    res.json({
      success: true,
      sentCount: users.length,
      pushSentCount: sentCount,
      message: `Notification sent to ${users.length} users`,
    });
    
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ========================
// GET NOTIFICATION HISTORY
// ========================
router.get('/history', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    // Get from AdminLog table
    const adminLogs = await AdminLog.find({ action: 'SEND_NOTIFICATION' })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const notifications = adminLogs.map(log => ({
      _id: log._id,
      title: log.details?.title || 'Admin Notification',
      message: log.details?.message || '',
      recipients: {
        count: log.details?.recipientCount || 0,
        userTypes: log.details?.type === 'clients' ? ['clients'] : 
                   log.details?.type === 'workers' ? ['workers'] : 
                   log.details?.type === 'by_region' ? ['by region'] :
                   log.details?.type === 'by_category' ? ['by category'] : ['all users'],
        regions: log.details?.region ? [log.details.region] : [],
        categories: log.details?.categories || [],
      },
      sentBy: {
        _id: log.adminId,
        name: log.adminName,
        email: log.adminEmail,
      },
      sentAt: log.timestamp || log.createdAt,
      status: log.details?.pushSentCount > 0 ? 'sent' : 'sent', // Default to sent
      successCount: log.details?.pushSentCount || log.details?.recipientCount || 0,
      failureCount: 0,
    }));
    
    const total = await AdminLog.countDocuments({ action: 'SEND_NOTIFICATION' });
    
    res.json({
      success: true,
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;