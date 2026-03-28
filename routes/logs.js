// routes/logs.js
import express from 'express';
import LogService from '../services/logService.js';
import { auth } from '../middleware/auth.js';
import ActivityLog from '../models/ActivityLog.js';

const router = express.Router();

// Test endpoint
router.get('/test', (req, res) => {
  console.log('✅ Test endpoint hit!');
  res.json({ success: true, message: 'Logs route is working!', timestamp: new Date().toISOString() });
});

// Contact logging endpoint
router.post('/contact', auth, async (req, res) => {
  const { targetId, targetType, actionType, metadata } = req.body;

  const VALID_TARGET_TYPES = new Set(['worker', 'job']);
  const VALID_ACTION_TYPES = new Set(['call', 'whatsapp', 'email', 'share']);

  if (!targetId || !VALID_TARGET_TYPES.has(targetType) || !VALID_ACTION_TYPES.has(actionType)) {
    return res.status(400).json({ success: false, message: 'Invalid or missing fields' });
  }

  if (!req.user?._id) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const log = await LogService.logContactInteraction(
      req.user._id,
      targetId,
      targetType,
      actionType,
      { ...metadata, ipAddress: req.ip, userAgent: req.headers['user-agent'] }
    );

    if (!log?._id) {
      console.error('LogService returned no log ID');
      return res.status(500).json({ success: false, message: 'Logging failed' });
    }

    res.json({ success: true, message: 'Interaction logged', logId: log._id });
  } catch (error) {
    console.error('Contact log error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


// Log profile view
router.post('/profile-view', auth, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    
    // Don't log if user is viewing their own profile
    if (targetUserId === req.user._id.toString()) {
      return res.json({ success: true });
    }
    
    await ActivityLog.create({
      userId: req.user._id,
      targetId: targetUserId,
      targetModel: 'User',
      actionType: 'view',
      targetType: 'profile',
      metadata: {
        viewerName: req.user.name,
        viewerEmail: req.user.email
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error logging profile view:', error);
    res.json({ success: true }); // Still return success
  }
});

export default router;