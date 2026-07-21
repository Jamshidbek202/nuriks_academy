import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Switch,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Text } from '../../src/components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  sendTestNotification,
  NotificationPreferences as NotificationPrefsType,
} from '../../src/services/notifications';

export default function NotificationPreferencesScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingSending, setTestingSending] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPrefsType>({
    chat_notifications: true,
    payment_reminders: true,
    homework_notifications: true,
    test_notifications: true,
    lesson_reminders: true,
    attendance_notifications: true,
    news_announcements: true,
    admin_broadcasts: true,
  });
  const [hasChanges, setHasChanges] = useState(false);
  const { pushToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const prefs = await getNotificationPreferences();
      setPreferences(prefs);
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: keyof NotificationPrefsType) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const success = await updateNotificationPreferences(preferences);
      if (success) {
        setHasChanges(false);
        // Show success feedback
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Push notifications are not supported on web. Please test on a mobile device.');
      }
      return;
    }

    setTestingSending(true);
    try {
      const success = await sendTestNotification();
      if (success) {
        // Notification sent
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
    } finally {
      setTestingSending(false);
    }
  };

  const PreferenceItem = ({
    icon,
    title,
    description,
    value,
    onToggle,
    locked = false,
  }: {
    icon: string;
    title: string;
    description: string;
    value: boolean;
    onToggle: () => void;
    locked?: boolean;
  }) => (
    <View style={styles.preferenceItem}>
      <View style={styles.preferenceIcon}>
        <Ionicons name={icon as any} size={24} color={COLORS.gold} />
      </View>
      <View style={styles.preferenceContent}>
        <Text style={styles.preferenceTitle}>{title}</Text>
        <Text style={styles.preferenceDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={locked}
        trackColor={{ false: COLORS.marbleGray, true: COLORS.goldDark }}
        thumbColor={value ? COLORS.gold : COLORS.textTertiary}
        ios_backgroundColor={COLORS.marbleGray}
      />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.gold} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Push Token Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Ionicons
              name={pushToken ? 'checkmark-circle' : 'alert-circle'}
              size={24}
              color={pushToken ? COLORS.success : COLORS.warning}
            />
            <Text style={styles.statusText}>
              {pushToken
                ? 'Push notifications enabled'
                : Platform.OS === 'web'
                ? 'Push notifications not available on web'
                : 'Push notifications not enabled'}
            </Text>
          </View>
          {pushToken && (
            <Text style={styles.tokenPreview}>
              Token: {pushToken.substring(0, 30)}...
            </Text>
          )}
        </View>

        {/* Notification Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Types</Text>

          <PreferenceItem
            icon="chatbubble-outline"
            title="Chat Messages"
            description="Get notified when someone sends you a message"
            value={preferences.chat_notifications}
            onToggle={() => handleToggle('chat_notifications')}
          />

          <PreferenceItem
            icon="wallet-outline"
            title="Payment Reminders"
            description="Required: invoices, receipts, upcoming payments, and overdue balances"
            value={preferences.payment_reminders}
            onToggle={() => undefined}
            locked
          />

          <PreferenceItem
            icon="book-outline"
            title="Homework Notifications"
            description="Get notified when homework is assigned"
            value={preferences.homework_notifications}
            onToggle={() => handleToggle('homework_notifications')}
          />

          <PreferenceItem
            icon="document-text-outline"
            title="Test Notifications"
            description="Get notified about upcoming tests and exams"
            value={preferences.test_notifications}
            onToggle={() => handleToggle('test_notifications')}
          />

          <PreferenceItem
            icon="time-outline"
            title="Lesson Reminders"
            description="Get reminders before lessons start"
            value={preferences.lesson_reminders}
            onToggle={() => handleToggle('lesson_reminders')}
          />

          <PreferenceItem
            icon="checkbox-outline"
            title="Attendance Notifications"
            description="Get notified about attendance records"
            value={preferences.attendance_notifications}
            onToggle={() => handleToggle('attendance_notifications')}
          />

          <PreferenceItem
            icon="newspaper-outline"
            title="News Announcements"
            description="Get notified about academy news"
            value={preferences.news_announcements}
            onToggle={() => handleToggle('news_announcements')}
          />

          <PreferenceItem
            icon="megaphone-outline"
            title="Admin Broadcasts"
            description="Important announcements from administration"
            value={preferences.admin_broadcasts}
            onToggle={() => handleToggle('admin_broadcasts')}
          />
        </View>

        {/* Save Button */}
        {hasChanges && (
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <Text style={styles.saveButtonText}>Save Preferences</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Test Notification Button */}
        {Platform.OS !== 'web' && pushToken && (
          <TouchableOpacity
            style={styles.testButton}
            onPress={handleTestNotification}
            disabled={testingSending}
          >
            {testingSending ? (
              <ActivityIndicator color={COLORS.gold} />
            ) : (
              <>
                <Ionicons name="notifications-outline" size={20} color={COLORS.gold} />
                <Text style={styles.testButtonText}>Send Test Notification</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Info Text */}
        <Text style={styles.infoText}>
          Note: Push notifications require a physical device. They will not work in web browsers or simulators.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.marbleGray,
  },
  backButton: {
    padding: SIZES.xs,
  },
  headerTitle: {
    fontSize: SIZES.fontLg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
    padding: SIZES.md,
  },
  statusCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.lg,
    ...SHADOWS.small,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
  },
  statusText: {
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
    flex: 1,
  },
  tokenPreview: {
    fontSize: SIZES.fontXs,
    color: COLORS.textTertiary,
    marginTop: SIZES.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  section: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.lg,
    ...SHADOWS.small,
  },
  sectionTitle: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SIZES.md,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.backgroundLight,
  },
  preferenceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SIZES.sm,
  },
  preferenceContent: {
    flex: 1,
    marginRight: SIZES.sm,
  },
  preferenceTitle: {
    fontSize: SIZES.fontMd,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  preferenceDescription: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: COLORS.gold,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    alignItems: 'center',
    marginBottom: SIZES.md,
    ...SHADOWS.medium,
  },
  saveButtonText: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.background,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.xs,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    borderWidth: 1,
    borderColor: COLORS.gold,
    marginBottom: SIZES.md,
  },
  testButtonText: {
    fontSize: SIZES.fontMd,
    color: COLORS.gold,
    fontWeight: '500',
  },
  infoText: {
    fontSize: SIZES.fontSm,
    color: COLORS.textTertiary,
    textAlign: 'center',
    marginTop: SIZES.md,
    marginBottom: SIZES.xxl,
    paddingHorizontal: SIZES.lg,
  },
});
