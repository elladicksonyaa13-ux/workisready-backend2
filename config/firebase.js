// config/firebase.js
import admin from 'firebase-admin';

let messaging = null;
let isInitialized = false;

// Initialize Firebase Admin SDK using environment variables
try {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (projectId && privateKey && clientEmail) {
    // Format private key (replace escaped newlines with actual newlines)
    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
    
    const serviceAccount = {
      projectId: projectId,
      privateKey: formattedPrivateKey,
      clientEmail: clientEmail,
    };
    
    // Initialize Firebase Admin SDK
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin SDK initialized from environment variables');
    }
    
    messaging = admin.messaging();
    isInitialized = true;
  } else {
    console.log('⚠️ Firebase credentials not found in environment variables');
    console.log('   Required: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
  }
} catch (error) {
  console.error('❌ Error initializing Firebase:', error.message);
  console.error('   Check your FIREBASE_PRIVATE_KEY format (should contain \\n for newlines)');
}

/**
 * Send notification to a single device (Firebase FCM)
 * @param {string} deviceToken - Firebase device token
 * @param {object} notification - Notification object with title, message, type, relatedId
 * @returns {Promise<object|null>} - Response from FCM or null if failed
 */
export const sendPushNotification = async (deviceToken, notification) => {
  if (!messaging) {
    console.log('⚠️ Push notification skipped: Firebase not configured');
    return null;
  }
  
  if (!deviceToken) {
    console.log('⚠️ Push notification skipped: No device token');
    return null;
  }

  try {
    const message = {
      token: deviceToken,
      notification: {
        title: notification.title,
        body: notification.message,
      },
      data: {
        type: notification.type || 'general',
        relatedId: notification.relatedId || '',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'workisready_notifications',
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

    const response = await messaging.send(message);
    console.log(`✅ Push notification sent to ${deviceToken.substring(0, 20)}...`);
    return response;
  } catch (error) {
    console.error('❌ Error sending push notification:', error.message);
    
    // Check if token is invalid (device no longer registered)
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      console.log('⚠️ Invalid push token - should be removed from database');
      return { invalidToken: true, token: deviceToken };
    }
    
    return null;
  }
};

/**
 * Send notification to multiple devices (Firebase FCM)
 * @param {string[]} deviceTokens - Array of Firebase device tokens
 * @param {object} notification - Notification object with title, message, type, relatedId
 * @returns {Promise<object|null>} - Response from FCM or null if failed
 */
export const sendMulticastPushNotification = async (deviceTokens, notification) => {
  if (!messaging) {
    console.log('⚠️ Multicast push skipped: Firebase not configured');
    return null;
  }
  
  if (!deviceTokens || deviceTokens.length === 0) {
    console.log('⚠️ Multicast push skipped: No device tokens');
    return null;
  }

  try {
    // FCM limit is 500 tokens per request
    const tokens = deviceTokens.slice(0, 500);
    
    const message = {
      tokens: tokens,
      notification: {
        title: notification.title,
        body: notification.message,
      },
      data: {
        type: notification.type || 'general',
        relatedId: notification.relatedId || '',
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'workisready_notifications',
        },
      },
    };

    const response = await messaging.sendEachForMulticast(message);
    console.log(`✅ Push notifications sent to ${response.successCount}/${tokens.length} devices`);
    
    // Return failed tokens to remove them from database
    const failedTokens = [];
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
    }
    
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      failedTokens,
    };
  } catch (error) {
    console.error('❌ Error sending multicast push notification:', error.message);
    return null;
  }
};

/**
 * Send notification to Expo tokens (Expo Push Notifications)
 * @param {string[]} expoTokens - Array of Expo push tokens
 * @param {object} notification - Notification object with title, message, type, relatedId
 * @returns {Promise<object|null>} - Response from Expo push service
 */
export const sendExpoPushNotification = async (expoTokens, notification) => {
  if (!expoTokens || expoTokens.length === 0) {
    console.log('⚠️ Expo push skipped: No Expo tokens');
    return null;
  }

  try {
    const messages = expoTokens.map(token => ({
      to: token,
      sound: 'default',
      title: notification.title,
      body: notification.message,
      data: {
        type: notification.type || 'general',
        relatedId: notification.relatedId || '',
        notificationId: notification.notificationId || '',
      },
      channelId: 'workisready',
      priority: 'high',
    }));

    // Expo uses their own push service
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const data = await response.json();
    console.log(`📨 Expo push sent to ${expoTokens.length} devices`);
    return data;
  } catch (error) {
    console.error('❌ Error sending Expo push notification:', error.message);
    return null;
  }
};

/**
 * Check if Firebase is configured and ready
 * @returns {boolean}
 */
export const isFirebaseConfigured = () => isInitialized;

/**
 * Get the messaging instance (for advanced use)
 * @returns {admin.messaging.Messaging|null}
 */
export const getMessaging = () => messaging;

export default {
  sendPushNotification,
  sendMulticastPushNotification,
  sendExpoPushNotification,
  isFirebaseConfigured,
  getMessaging,
};