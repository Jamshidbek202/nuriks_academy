/**
 * Push Notification Service for Nurik's Academy
 * Handles registration, permissions, and notification handling
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface NotificationPreferences {
  payment_reminders: boolean;
  homework_notifications: boolean;
  test_notifications: boolean;
  lesson_reminders: boolean;
  news_announcements: boolean;
  admin_broadcasts: boolean;
}

/**
 * Register for push notifications and return the Expo push token
 */
export async function registerForPushNotifications(): Promise<string | null> {
  let token = null;

  if (Platform.OS === 'web') {
    console.log('Push notifications not supported on web');
    return null;
  }

  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Check/request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permissions not granted');
    return null;
  }

  // Get Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId || 'nuriksacademy',
    });
    token = tokenData.data;
    console.log('Expo Push Token:', token);
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }

  // Android-specific channel setup
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D49A2F',
    });

    await Notifications.setNotificationChannelAsync('payments', {
      name: 'Payment Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });

    await Notifications.setNotificationChannelAsync('homework', {
      name: 'Homework Notifications',
      importance: Notifications.AndroidImportance.DEFAULT,
    });

    await Notifications.setNotificationChannelAsync('lessons', {
      name: 'Lesson Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  return token;
}

/**
 * Register push token with backend
 */
export async function registerPushToken(token: string, deviceType?: string): Promise<boolean> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        device_type: deviceType || Platform.OS,
      },
      { onConflict: 'token' }
    );

    if (error) {
      throw error;
    }
    console.log('Push token registered with backend');
    return true;
  } catch (error) {
    console.error('Error registering push token:', error);
    return false;
  }
}

/**
 * Unregister push token from backend
 */
export async function unregisterPushToken(token: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('push_tokens').delete().eq('token', token);
    if (error) {
      throw error;
    }
    return true;
  } catch (error) {
    console.error('Error unregistering push token:', error);
    return false;
  }
}

/**
 * Get notification preferences
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
      .from('notification_preferences')
      .select('payment_reminders, homework_notifications, test_notifications, lesson_reminders, news_announcements, admin_broadcasts')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data as NotificationPreferences;
    }

    return {
      payment_reminders: true,
      homework_notifications: true,
      test_notifications: true,
      lesson_reminders: true,
      news_announcements: true,
      admin_broadcasts: true,
    };
  } catch (error) {
    console.error('Error getting notification preferences:', error);
    return {
      payment_reminders: true,
      homework_notifications: true,
      test_notifications: true,
      lesson_reminders: true,
      news_announcements: true,
      admin_broadcasts: true,
    };
  }
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(
  prefs: NotificationPreferences
): Promise<boolean> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      throw new Error('Not authenticated');
    }

    const { error } = await supabase.from('notification_preferences').upsert({
      user_id: userId,
      ...prefs,
    });

    if (error) {
      throw error;
    }
    return true;
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return false;
  }
}

/**
 * Send test notification to self
 */
export async function sendTestNotification(): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('send_test_notification');
    if (error) {
      throw error;
    }
    return true;
  } catch (error) {
    console.error('Error sending test notification:', error);
    return false;
  }
}

/**
 * Add notification received listener
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add notification response listener (when user taps notification)
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Get badge count
 */
export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

/**
 * Set badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
  await setBadgeCount(0);
}

export default {
  registerForPushNotifications,
  registerPushToken,
  unregisterPushToken,
  getNotificationPreferences,
  updateNotificationPreferences,
  sendTestNotification,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  getBadgeCount,
  setBadgeCount,
  clearAllNotifications,
};
