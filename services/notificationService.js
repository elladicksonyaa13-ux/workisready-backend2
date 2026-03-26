// services/notificationService.js
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Provider from '../models/Providers.js'; // ✅ Import Provider model
import Task from '../models/Task.js';

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

      // ✅ Find featured providers (not users) that match
       const featuredProviders = await Provider.find({
      isSuspended: false,
      category: { $in: task.category },
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
        
        // Debug: Check what providers exist
        const allFeatured = await Provider.find({ 
          isFeatured: true 
        }).select('firstName surname category district isApproved isSuspended');
        
        console.log('📊 All featured providers in DB:', allFeatured.length);
        console.log('📊 Featured providers:', JSON.stringify(allFeatured, null, 2));
        return;
      }

      // Create notifications for each provider's user
      const notifications = featuredProviders.map(provider => ({
        userId: provider.userId?._id || provider.userId, // Use the user ID from the provider
        userType: 'worker',
        title: 'New Job in Your Area! 🎯',
        message: `A new ${task.category.join(', ')} job has been posted in ${task.district}. Check it out!`,
        type: 'job',
        relatedId: task._id,
        relatedModel: 'Task',
        color: 'green'
      })).filter(n => n.userId); // Remove any without userId

      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
        console.log(`✅ Notified ${notifications.length} featured workers about job ${taskId}`);
      } else {
        console.log('❌ No valid user IDs found for notifications');
      }

      // Optional: Send push notifications
      await this.sendPushNotifications(saved);

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
      region: task.region,  // ✅ Now using region
      clientId: task.clientId
    });

    // Find providers that are either featured OR promoted
    console.log('🔍 Searching for providers with:');
    console.log('- isSuspended: false');
    console.log('- category in:', task.category);
    console.log('- region:', task.region);
    console.log('- isFeatured: true OR any promoteOn field true');

    const matchingProviders = await Provider.find({
      isSuspended: false,
      category: { $in: task.category },
      region: task.region,  // ✅ Using region instead of district
      $or: [
        { isFeatured: true },  // Featured providers
        {  // Promoted providers (any promoteOn field true)
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
      // Debug: Check what providers exist in the database
      const allFeatured = await Provider.find({ 
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
      }).select('firstName surname category region isFeatured promoteOn');
      
      console.log('📋 All featured/promoted providers in DB:', allFeatured.length);
      console.log('📋 Featured/promoted providers details:', JSON.stringify(allFeatured, null, 2));
      
      // Debug: Check if any providers match the category
      const categoryMatch = await Provider.find({
        category: { $in: task.category }
      }).select('firstName surname category');
      console.log('📋 Providers matching category:', categoryMatch.length);
      
      // Debug: Check if any providers match the region
      const regionMatch = await Provider.find({
        region: task.region
      }).select('firstName surname region');
      console.log('📋 Providers matching region:', regionMatch.length);
      
      return;
    }

    // Separate counts for logging
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

    console.log(`📊 Breakdown: ${featuredCount} featured, ${promotedCount} promoted`);

    // Log the providers found
    matchingProviders.forEach((p, i) => {
      console.log(`✅ Provider ${i + 1}:`, {
        id: p._id,
        name: `${p.firstName} ${p.surname}`,
        businessName: p.businessName,
        isFeatured: p.isFeatured,
        isPromoted: !!(p.promoteOn?.homeScreen || 
                       p.promoteOn?.jobsScreen || 
                       p.promoteOn?.workersScreen || 
                       p.promoteOn?.dashboard || 
                       p.promoteOn?.profile),
        category: p.category,
        region: p.region,
        userId: p.userId?._id
      });
    });

    // Create dynamic title based on provider types
    let title = '';
    if (featuredCount > 0 && promotedCount > 0) {
      title = `✨ Featured & Promoted Providers Available! (${matchingProviders.length})`;
    } else if (featuredCount > 0) {
      title = `⭐ Featured Providers Available! (${matchingProviders.length})`;
    } else if (promotedCount > 0) {
      title = `🌟 Promoted Providers Available! (${matchingProviders.length})`;
    }

    // Store complete provider data in notification
    const notifications = [];

    for (const provider of matchingProviders) {
      // Check if we already notified about this provider for this job
      const existing = await Notification.findOne({
        userId: task.clientId,
        type: 'worker',
        relatedId: provider.userId?._id, // ✅ Use USER ID as relatedId
        relatedModel: 'User',
        createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      if (!existing && provider.userId?._id) {
        notifications.push({
          userId: task.clientId,
          userType: 'client',
          title: title.split('(')[0].trim(), // Use appropriate title without count
          message: `${provider.businessName || `${provider.firstName} ${provider.surname}`} in ${task.region} can help with ${task.category.join(', ')}.`,
          type: 'worker',
          relatedId: provider.userId._id, // ✅ Store USER ID (from User model)
          relatedModel: 'User', // ✅ Related to User, not Task
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

    // ✅ FIX: Save the notifications array, not a single notification
    if (notifications.length > 0) {
      const saved = await Notification.insertMany(notifications);
      console.log(`✅ Created ${saved.length} notifications for user: ${task.clientId}`);

      // ✅ Send push notifications
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
    // If notificationIds is empty, it will mark ALL as read
    
    await Notification.updateMany(query, { isRead: true });
    
    const unreadCount = await Notification.countDocuments({ 
      userId, 
      isRead: false 
    });

    return { success: true, unreadCount };
  } catch (error) {
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
    } catch (error) {
      console.error('Error deleting old notifications:', error);
    }
  }

  // ========================
  // PUSH NOTIFICATIONS (optional)
  // ========================
  async sendPushNotifications(notifications) {
    // Implement push notifications using Firebase Cloud Messaging
    console.log('Sending push notifications...');
  }

// ========================
// FOR JOB POSTERS: Notify them about featured providers matching their new job
// ========================
// services/notificationService.js
// async notifyJobPosterAboutMatchingProviders(taskId) {
//   try {
//     console.log('🔍 Checking for featured providers matching job:', taskId);
    
//     const task = await Task.findById(taskId);
//     if (!task) {
//       console.log('❌ Task not found');
//       return;
//     }

//     // Check if we already notified this user about this job recently
//     const existingNotification = await Notification.findOne({
//       userId: task.clientId,
//       type: 'worker',
//       relatedId: taskId,
//       createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
//     });

//     if (existingNotification) {
//       console.log('⚠️ Already notified job poster about this job recently, skipping');
//       return;
//     }

//     console.log('📋 Job details:', {
//       title: task.title,
//       category: task.category,
//       district: task.district,
//       region: task.region
//     });

//     // Find featured providers matching the job criteria
//     const matchingProviders = await Provider.find({
//       isFeatured: true,
//       isSuspended: false,
//       isApproved: true,
//       category: { $in: task.category },
//       district: task.district
//     }).populate('userId');

//     console.log(`👥 Found ${matchingProviders.length} featured providers matching this job`);

//     if (!matchingProviders.length) {
//       console.log('ℹ️ No matching featured providers found');
//       return;
//     }

//     // Create a single notification for the job poster
//     const providerNames = matchingProviders.map(p => 
//       p.businessName || `${p.firstName} ${p.surname}`
//     ).slice(0, 3).join(', ');

//     const count = matchingProviders.length;
//     const message = count === 1 
//       ? `${providerNames} in ${task.district} can help with ${task.category.join(', ')}.`
//       : `${count} featured provider(s) in ${task.district} can help with ${task.category.join(', ')}. ${count > 3 ? `Includes ${providerNames} and others.` : ''}`;

//     const notification = {
//       userId: task.clientId,
//       userType: 'client',
//       title: count === 1 ? 'Featured Provider Available! 🛠️' : 'Featured Providers Available! 🛠️',
//       message,
//       type: 'worker',
//       relatedId: task._id,
//       relatedModel: 'Task',
//       color: 'blue',
//       metadata: {
//         providerCount: count,
//         providerIds: matchingProviders.map(p => p.userId?._id).filter(id => id),
//         categories: task.category,
//         district: task.district
//       }
//     };

//     await Notification.create(notification);
//     console.log(`✅ Created notification for job poster about ${count} matching providers`);

//     // Notify providers about the job (but only if not already notified)
//     for (const provider of matchingProviders) {
//       const existingProviderNotif = await Notification.findOne({
//         userId: provider.userId?._id,
//         type: 'job',
//         relatedId: taskId,
//         createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
//       });

//       if (!existingProviderNotif && provider.userId?._id) {
//         await Notification.create({
//           userId: provider.userId._id,
//           userType: 'worker',
//           title: 'New Job Matching Your Skills! 🎯',
//           message: `A new ${task.category.join(', ')} job has been posted in ${task.district}.`,
//           type: 'job',
//           relatedId: task._id,
//           relatedModel: 'Task',
//           color: 'green'
//         });
//       }
//     }

//   } catch (error) {
//     console.error('❌ Error notifying job poster about matching providers:', error);
//   }
// }


// services/notificationService.js

async sendPushNotifications(notifications) {
  try {
    for (const notif of notifications) {
      const user = await User.findById(notif.userId);
      
      if (user?.pushToken) {
        const message = {
          token: user.pushToken,
          notification: {
            title: notif.title,
            body: notif.message,
          },
          data: {
            type: notif.type,
            relatedId: notif.relatedId?.toString() || '',
            notificationId: notif._id?.toString() || '',
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'workisready_notifications',
              sound: 'default',
              color: '#0099cc',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
        };
        
        await this.sendToFCM(message);
      }
    }
  } catch (error) {
    console.error('Error sending push notifications:', error);
  }
}

async sendToFCM(message) {
  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${process.env.FCM_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    const data = await response.json();
    console.log('📨 FCM response:', data);
  } catch (error) {
    console.error('Error sending to FCM:', error);
  }
}



}



export default new NotificationService();