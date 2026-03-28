// routes/notifications.js
import express from 'express';
import NotificationService from '../services/notificationService.js';
import Notification from '../models/Notification.js';
import { auth } from '../middleware/auth.js';
import { sendPushNotification } from '../config/firebase.js';
import User from '../models/User.js'


const router = express.Router();

// ========================
// GET USER NOTIFICATIONS
// ========================
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await NotificationService.getUserNotifications(
      req.user._id,
      parseInt(page),
      parseInt(limit)
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================
// MARK ALL NOTIFICATIONS AS READ
// ========================
router.patch('/read', auth, async (req, res) => {
  try {
    // ✅ Mark ALL unread notifications as read for this user
    const result = await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true }
    );
    
    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false
    });
    
    res.json({ 
      success: true, 
      unreadCount,
      message: 'All notifications marked as read',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================
// MARK SINGLE NOTIFICATION AS READ
// ========================
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const result = await NotificationService.markAsRead(
      req.user._id,
      [req.params.id]
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================
// GET UNREAD COUNT
// ========================
router.get('/unread-count', auth, async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false
    });
    res.json({ success: true, count: unreadCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// Delete single notification
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!result) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    
    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false
    });
    
    res.json({ success: true, unreadCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete all notifications for user
router.delete('/', auth, async (req, res) => {
  try {
    const result = await Notification.deleteMany({ userId: req.user._id });
    
    res.json({ 
      success: true, 
      deletedCount: result.deletedCount,
      message: 'All notifications deleted' 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Register device token
router.post('/register-token', auth, async (req, res) => {
  try {
    const { token, platform } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.deviceTokens) user.deviceTokens = [];
    
    // Update existing token or add new
    const existingToken = user.deviceTokens.find(t => t.token === token);
    if (existingToken) {
      existingToken.lastUsed = new Date();
      existingToken.platform = platform;
    } else {
      user.deviceTokens.push({ token, platform, lastUsed: new Date() });
    }
    
    await user.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Register token error:', error);
    res.status(500).json({ error: 'Failed to register token' });
  }
});

// Remove device token
router.delete('/remove-token', auth, async (req, res) => {
  try {
    const { token } = req.body;
    
    await User.findByIdAndUpdate(req.userId, {
      $pull: { deviceTokens: { token } }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Remove token error:', error);
    res.status(500).json({ error: 'Failed to remove token' });
  }
});

// Register Expo token
router.post('/register-expo-token', auth, async (req, res) => {
  try {
    const { token, platform } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.deviceTokens) user.deviceTokens = [];
    
    const existingToken = user.deviceTokens.find(t => t.token === token);
    if (existingToken) {
      existingToken.lastUsed = new Date();
      existingToken.platform = platform;
      existingToken.type = 'expo';
    } else {
      user.deviceTokens.push({ 
        token, 
        platform, 
        type: 'expo',
        lastUsed: new Date() 
      });
    }
    
    await user.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Register token error:', error);
    res.status(500).json({ error: 'Failed to register token' });
  }
});

export default router;