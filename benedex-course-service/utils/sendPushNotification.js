import webpush from 'web-push';
import mongoose from 'mongoose';
import NotificationSubscription from '../models/NotificationSubscription.js';

// Ensure VAPID keys are configured if available
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:support@benedex.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/**
 * Sends a native browser push notification to all active devices of a user
 * @param {String} userId - The target user database ID string
 * @param {Object} payload - Notification payload options containing title, body, icon, and action url
 */
const sendPushNotification = async (userId, payload) => {
  try {
    if (!userId) return;

    // Guard: Prevent query buffering timeout if DB connection is inactive
    if (mongoose.connection.readyState !== 1) {
      console.warn('[Push Notification] Skipping dispatch: MongoDB connection is not active.');
      return;
    }

    // Find all browser endpoints registered to this user
    const subscriptions = await NotificationSubscription.find({ user: userId });

    if (!subscriptions || subscriptions.length === 0) return;

    const stringifiedPayload = JSON.stringify({
      title: payload?.title || 'Benedex Digital Hub Alert',
      body: payload?.body || 'You have a new update waiting in your portal.',
      icon: payload?.icon || '/logo192.png',
      data: {
        url: payload?.url || '/student/dashboard',
      },
    });

    const sendPromises = subscriptions.map((sub) => {
      return webpush.sendNotification(sub, stringifiedPayload).catch(async (err) => {
        // Clean up expired or revoked endpoints (410 Gone / 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`Cleaning up expired subscription endpoint: ${sub._id}`);
          await NotificationSubscription.deleteOne({ _id: sub._id });
        } else {
          console.error(`Error delivering push payload to endpoint ${sub._id}:`, err.message);
        }
      });
    });

    await Promise.all(sendPromises);
  } catch (error) {
    console.error('Global notification dispatch system failure:', error.message);
  }
};

export default sendPushNotification;