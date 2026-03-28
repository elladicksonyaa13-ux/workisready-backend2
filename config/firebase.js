import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load service account key
const serviceAccount = JSON.parse(
  readFileSync(path.join(__dirname, 'service-account-key.json'), 'utf8')
);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Send notification to single device
export const sendPushNotification = async (deviceToken, notification) => {
  try {
    if (!deviceToken) return null;

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
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log('✅ Push notification sent:', response);
    return response;
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    return null;
  }
};

// Send notification to multiple devices
export const sendMulticastPushNotification = async (deviceTokens, notification) => {
  try {
    if (!deviceTokens || deviceTokens.length === 0) return null;

    const message = {
      tokens: deviceTokens,
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
      },
    };

    const response = await admin.messaging().sendMulticast(message);
    console.log(`✅ Push notifications sent to ${response.successCount} devices`);
    return response;
  } catch (error) {
    console.error('❌ Error sending multicast push notification:', error);
    return null;
  }
};

// Send notification to Expo tokens (different format)
export const sendExpoPushNotification = async (expoTokens, notification) => {
  try {
    if (!expoTokens || expoTokens.length === 0) return null;

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
    console.log('📨 Expo push response:', data);
    return data;
  } catch (error) {
    console.error('Error sending Expo push notification:', error);
    return null;
  }
};

export default admin;