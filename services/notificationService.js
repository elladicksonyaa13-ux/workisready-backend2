// services/notificationService.js
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Provider from '../models/Providers.js';
import Task from '../models/Task.js';
import { sendRealTimeNotification } from '../socket.js';
import { sendMulticastPushNotification } from '../config/firebase.js';
import admin from '../config/firebase.js';
import { expandJobCategories } from '../data/categoryMapping.js';

class NotificationService {
  
  // ========================
  // FOR WORKERS: New job matching their criteria
  // ========================
  async notifyFeaturedWorkersAboutJob(taskId) {
    try {
      const task = await Task.findById(taskId)
        .populate('clientId', 'name email');
      
      if (!task) {
        console.log('❌ Task not found:', taskId);
        return;
      }

      // Check if we already notified workers about this job
      const existingNotifications = await Notification.countDocuments({
        type: 'job',
        relatedId: taskId,
        createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      if (existingNotifications > 0) {
        console.log('⚠️ Workers already notified about this job, skipping');
        return;
      }

      console.log('🔍 Job details:', {
        id: task._id,
        title: task.title,
        category: task.category,
        district: task.district,
        region: task.region
      });

      // Find featured providers that match
      const expandedCategories = expandJobCategories(task.category);

const featuredProviders = await Provider.find({
  isSuspended: false,
  category: { $in: expandedCategories },  // ← use expanded
        region: task.region,
        $or: [
          { isFeatured: true },
          {
            $or: [
              { "promoteOn.homeScreen": true },
              { "promoteOn.jobsScreen": true },
              { "promoteOn.workersScreen": true },
              { "promoteOn.dashboard": true },
              { "promoteOn.profile": true }
            ]
          }
        ]
      }).populate('userId');

      console.log(`👥 Found ${featuredProviders.length} featured providers matching criteria`);

      if (!featuredProviders.length) {
        console.log(`❌ No featured providers found for job ${taskId}`);
        
        const allFeatured = await Provider.find({ 
          isFeatured: true 
        }).select('firstName surname category district isApproved isSuspended');
        
        console.log('📊 All featured providers in DB:', allFeatured.length);
        return;
      }

      // Create notifications for each provider's user
      const notifications = featuredProviders.map(provider => ({
        userId: provider.userId?._id || provider.userId,
        userType: 'worker',
        title: 'New Job in Your Area! 🎯',
        message: `A new ${task.category.join(', ')} job has been posted in ${task.district}. Check it out!`,
        type: 'job',
        relatedId: task._id,
        relatedModel: 'Task',
        color: 'green',
        metadata: {
          jobId: task._id,
          jobTitle: task.title,
          jobCategory: task.category,
          jobDistrict: task.district,
          jobRegion: task.region,
          clientName: task.clientId?.name
        }
      })).filter(n => n.userId);

      if (notifications.length > 0) {
        const saved = await Notification.insertMany(notifications);
        console.log(`✅ Notified ${notifications.length} featured workers about job ${taskId}`);
        
        // Send push notifications
        await this.sendPushNotifications(saved);
      } else {
        console.log('❌ No valid user IDs found for notifications');
      }

    } catch (error) {
      console.error('❌ Error notifying workers:', error);
    }
  }

  // ========================
  // FOR JOB POSTERS: featured workers matching their categories
  // ========================
  async notifyJobPosterAboutMatchingProviders(taskId) {
    try {
      console.log('🔍 ===== STARTING NOTIFICATION CHECK =====');
      console.log('📌 Task ID:', taskId);
      
      const task = await Task.findById(taskId);
      if (!task) {
        console.log('❌ Task not found with ID:', taskId);
        return;
      }

      console.log('✅ Task found:', {
        id: task._id,
        title: task.title,
        category: task.category,
        region: task.region,
        clientId: task.clientId
      });

      // Find providers that are either featured OR promoted
      const expandedCategories = expandJobCategories(task.category);

const matchingProviders = await Provider.find({
  isSuspended: false,
  category: { $in: expandedCategories },  // ← use expanded
        region: task.region,
        $or: [
          { isFeatured: true },
          {
            $or: [
              { "promoteOn.homeScreen": true },
              { "promoteOn.jobsScreen": true },
              { "promoteOn.workersScreen": true },
              { "promoteOn.dashboard": true },
              { "promoteOn.profile": true }
            ]
          }
        ]
      }).populate('userId');

      console.log(`📊 Found ${matchingProviders.length} matching providers`);

      if (!matchingProviders.length) {
        console.log('No matching providers found');
        return;
      }

      // Create dynamic title based on provider types
      const featuredCount = matchingProviders.filter(p => p.isFeatured).length;
      const promotedCount = matchingProviders.filter(p => 
        !p.isFeatured && (
          p.promoteOn?.homeScreen ||
          p.promoteOn?.jobsScreen ||
          p.promoteOn?.workersScreen ||
          p.promoteOn?.dashboard ||
          p.promoteOn?.profile
        )
      ).length;

      let title = '';
      if (featuredCount > 0 && promotedCount > 0) {
        title = `✨ Featured & Promoted Providers Available!`;
      } else if (featuredCount > 0) {
        title = `⭐ Featured Providers Available!`;
      } else if (promotedCount > 0) {
        title = `🌟 Promoted Providers Available!`;
      }

      // Store complete provider data in notification
      const notifications = [];

      for (const provider of matchingProviders) {
        // Check if we already notified about this provider for this job
        const existing = await Notification.findOne({
          userId: task.clientId,
          type: 'worker',
          relatedId: provider.userId?._id,
          relatedModel: 'User',
          createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });

        if (!existing && provider.userId?._id) {
          notifications.push({
            userId: task.clientId,
            userType: 'client',
            title: title,
            message: `${provider.businessName || `${provider.firstName} ${provider.surname}`} in ${task.region} can help with ${task.category.join(', ')}.`,
            type: 'worker',
            relatedId: provider.userId._id,
            relatedModel: 'User',
            color: 'blue',
            metadata: {
              providerId: provider._id,
              userId: provider.userId._id,
              providerName: provider.businessName || `${provider.firstName} ${provider.surname}`,
              providerCategory: provider.category,
              providerRegion: provider.region,
              providerRating: provider.averageRating,
              providerHourlyRate: provider.hourlyRate,
              providerProfilePic: provider.profilePic,
              isFeatured: provider.isFeatured,
              isPromoted: !!(provider.promoteOn?.homeScreen || 
                             provider.promoteOn?.jobsScreen || 
                             provider.promoteOn?.workersScreen || 
                             provider.promoteOn?.dashboard || 
                             provider.promoteOn?.profile),
              jobId: task._id,
              jobTitle: task.title,
              jobCategory: task.category
            }
          });
        }
      }

      if (notifications.length > 0) {
        const saved = await Notification.insertMany(notifications);
        console.log(`✅ Created ${saved.length} notifications for user: ${task.clientId}`);

        // Send push notifications
        await this.sendPushNotifications(saved);
        
        saved.forEach(n => {
          console.log(`   - Notification ID: ${n._id}, Related ID: ${n.relatedId}`);
        });
      } else {
        console.log('⚠️ No new notifications to create');
      }
      
      console.log('🔍 ===== NOTIFICATION CHECK COMPLETE =====');
      
    } catch (error) {
      console.error('❌ Error in notifyJobPosterAboutMatchingProviders:', error);
      console.error('❌ Error stack:', error.stack);
    }
  }

  // ========================
  // GENERAL NOTIFICATION SENDER
  // ========================
  async sendNotification(userId, notificationData) {
    try {
      // 1. Save to database
      const notification = new Notification({
        userId,
        ...notificationData,
        isRead: false,
      });
      await notification.save();

      console.log(`✅ Notification saved for user ${userId}`);

      // 2. Send real-time notification if user is online
      const realtimeSent = sendRealTimeNotification(userId, {
        _id: notification._id,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type,
        color: notificationData.color,
        metadata: notificationData.metadata,
        createdAt: new Date(),
      });

      // 3. Send push notification
      const user = await User.findById(userId);
      if (user?.deviceTokens?.length > 0) {
        const activeTokens = user.deviceTokens
          .filter(t => t.token)
          .map(t => t.token);
        
        if (activeTokens.length > 0) {
          await this.sendPushNotificationToTokens(activeTokens, {
            title: notificationData.title,
            message: notificationData.message,
            type: notificationData.type,
            relatedId: notificationData.relatedId,
            notificationId: notification._id,
          });
        }
      }

      return notification;
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  // ========================
  // SEND PUSH NOTIFICATIONS (IMPROVED)
  // ========================
  async sendPushNotifications(notifications) {
    if (!notifications || notifications.length === 0) return;

    try {
      // Group notifications by user to avoid duplicate pushes
      const userNotifications = new Map();
      
      for (const notif of notifications) {
        if (!userNotifications.has(notif.userId)) {
          userNotifications.set(notif.userId, []);
        }
        userNotifications.get(notif.userId).push(notif);
      }

      // Send push notifications to each user
      for (const [userId, userNotifs] of userNotifications) {
        const user = await User.findById(userId);
        
        if (user?.deviceTokens?.length > 0) {
          // Get latest notification for this user
          const latestNotif = userNotifs[userNotifs.length - 1];
          
          const activeTokens = user.deviceTokens
            .filter(t => t.token && t.token !== '')
            .map(t => t.token);
          
          if (activeTokens.length > 0) {
            await this.sendPushNotificationToTokens(activeTokens, {
              title: latestNotif.title,
              message: latestNotif.message,
              type: latestNotif.type,
              relatedId: latestNotif.relatedId?.toString(),
              notificationId: latestNotif._id?.toString(),
              metadata: latestNotif.metadata,
            });
          }
        }
      }
    } catch (error) {
      console.error('Error sending push notifications:', error);
    }
  }

  // ========================
  // SEND TO SPECIFIC TOKENS
  // ========================
  // Update the sendPushNotifications method
async sendPushNotifications(notifications) {
  if (!notifications || notifications.length === 0) return;

  try {
    const userNotifications = new Map();
    
    for (const notif of notifications) {
      if (!userNotifications.has(notif.userId)) {
        userNotifications.set(notif.userId, []);
      }
      userNotifications.get(notif.userId).push(notif);
    }

    for (const [userId, userNotifs] of userNotifications) {
      const user = await User.findById(userId);
      
      if (user?.deviceTokens?.length > 0) {
        const latestNotif = userNotifs[userNotifs.length - 1];
        
        // Separate Expo tokens from FCM tokens
        const expoTokens = user.deviceTokens
          .filter(t => t.type === 'expo' && t.token)
          .map(t => t.token);
        
        const fcmTokens = user.deviceTokens
          .filter(t => (!t.type || t.type === 'fcm') && t.token)
          .map(t => t.token);
        
        // Send to Expo tokens
        if (expoTokens.length > 0) {
          await sendExpoPushNotification(expoTokens, {
            title: latestNotif.title,
            message: latestNotif.message,
            type: latestNotif.type,
            relatedId: latestNotif.relatedId?.toString(),
            notificationId: latestNotif._id?.toString(),
          });
        }
        
        // Send to FCM tokens (for production builds)
        if (fcmTokens.length > 0) {
          await this.sendPushNotificationToTokens(fcmTokens, {
            title: latestNotif.title,
            message: latestNotif.message,
            type: latestNotif.type,
            relatedId: latestNotif.relatedId?.toString(),
            notificationId: latestNotif._id?.toString(),
          });
        }
      }
    }
  } catch (error) {
    console.error('Error sending push notifications:', error);
  }
}

  // ========================
  // CLEANUP INVALID TOKENS
  // ========================
  async cleanupInvalidTokens(invalidTokens) {
    try {
      await User.updateMany(
        { 'deviceTokens.token': { $in: invalidTokens } },
        { $pull: { deviceTokens: { token: { $in: invalidTokens } } } }
      );
      console.log(`🧹 Cleaned up ${invalidTokens.length} invalid tokens`);
    } catch (error) {
      console.error('Error cleaning up invalid tokens:', error);
    }
  }

  // ========================
  // GET USER NOTIFICATIONS
  // ========================
  async getUserNotifications(userId, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      
      const [notifications, total] = await Promise.all([
        Notification.find({ userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Notification.countDocuments({ userId })
      ]);

      const unreadCount = await Notification.countDocuments({ 
        userId, 
        isRead: false 
      });

      return {
        success: true,
        notifications,
        unreadCount,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return { success: false, error: error.message };
    }
  }

  // ========================
  // MARK NOTIFICATIONS AS READ
  // ========================
  async markAsRead(userId, notificationIds = []) {
    try {
      const query = { userId };
      if (notificationIds.length > 0) {
        query._id = { $in: notificationIds };
      }
      
      await Notification.updateMany(query, { isRead: true });
      
      const unreadCount = await Notification.countDocuments({ 
        userId, 
        isRead: false 
      });

      return { success: true, unreadCount };
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      return { success: false, error: error.message };
    }
  }

  // ========================
  // DELETE OLD NOTIFICATIONS
  // ========================
  async deleteOldNotifications() {
    try {
      const result = await Notification.deleteMany({
        createdAt: { $lt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) }
      });
      console.log(`✅ Deleted ${result.deletedCount} old notifications`);
      return result;
    } catch (error) {
      console.error('Error deleting old notifications:', error);
      throw error;
    }
  }

  // ========================
  // BULK SEND NOTIFICATIONS
  // ========================
  async sendBulkNotifications(userIds, notificationData) {
    try {
      const notifications = userIds.map(userId => ({
        userId,
        ...notificationData,
        isRead: false,
        createdAt: new Date()
      }));

      const saved = await Notification.insertMany(notifications);
      console.log(`✅ Created ${saved.length} bulk notifications`);
      
      // Send push notifications
      await this.sendPushNotifications(saved);
      
      return saved;
    } catch (error) {
      console.error('Error sending bulk notifications:', error);
      throw error;
    }
  }

  // ========================
  // UPDATE DEVICE TOKEN
  // ========================
  async updateDeviceToken(userId, token, platform = 'android') {
    try {
      const user = await User.findById(userId);
      if (!user) return null;

      if (!user.deviceTokens) user.deviceTokens = [];

      // Check if token already exists
      const existingToken = user.deviceTokens.find(t => t.token === token);
      if (existingToken) {
        existingToken.lastUsed = new Date();
        existingToken.platform = platform;
      } else {
        user.deviceTokens.push({
          token,
          platform,
          lastUsed: new Date()
        });
      }

      // Keep only last 5 tokens per user to avoid clutter
      if (user.deviceTokens.length > 5) {
        user.deviceTokens = user.deviceTokens
          .sort((a, b) => b.lastUsed - a.lastUsed)
          .slice(0, 5);
      }

      await user.save();
      console.log(`✅ Device token updated for user ${userId}`);
      return user;
    } catch (error) {
      console.error('Error updating device token:', error);
      throw error;
    }
  }

  // ========================
  // REMOVE DEVICE TOKEN
  // ========================
  async removeDeviceToken(userId, token) {
    try {
      await User.updateOne(
        { _id: userId },
        { $pull: { deviceTokens: { token } } }
      );
      console.log(`✅ Device token removed for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error removing device token:', error);
      return false;
    }
  }
}

export default new NotificationService();