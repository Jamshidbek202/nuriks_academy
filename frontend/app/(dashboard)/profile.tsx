import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
  Switch,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  sendTestNotification,
  NotificationPreferences as NotificationPrefsType,
} from '../../src/services/notifications';

type PreferenceKey = keyof NotificationPrefsType;

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPrefsType = {
  chat_notifications: true,
  payment_reminders: true,
  homework_notifications: true,
  test_notifications: true,
  lesson_reminders: true,
  news_announcements: true,
  admin_broadcasts: true,
};

const NOTIFICATION_OPTIONS: Record<
  PreferenceKey,
  { icon: string; title: string; description: string; roles: string[] }
> = {
  chat_notifications: {
    icon: 'chatbubble-outline',
    title: 'Chat Messages',
    description: 'New messages from your conversations',
    roles: ['student', 'parent', 'teacher', 'support', 'manager', 'super_admin'],
  },
  payment_reminders: {
    icon: 'wallet-outline',
    title: 'Payment Reminders',
    description: 'Upcoming and overdue payment notices',
    roles: ['parent', 'manager', 'super_admin'],
  },
  homework_notifications: {
    icon: 'book-outline',
    title: 'Homework',
    description: 'New assignments and homework updates',
    roles: ['student', 'parent', 'teacher', 'manager', 'super_admin'],
  },
  test_notifications: {
    icon: 'document-text-outline',
    title: 'Tests',
    description: 'Scheduled tests, exams, and grading updates',
    roles: ['student', 'parent', 'teacher', 'manager', 'super_admin'],
  },
  lesson_reminders: {
    icon: 'time-outline',
    title: 'Lesson Reminders',
    description: 'Class and booking reminders',
    roles: ['student', 'parent', 'teacher', 'support', 'manager', 'super_admin'],
  },
  news_announcements: {
    icon: 'newspaper-outline',
    title: 'Academy News',
    description: 'Published academy news and updates',
    roles: ['student', 'parent', 'teacher', 'support', 'manager', 'super_admin'],
  },
  admin_broadcasts: {
    icon: 'megaphone-outline',
    title: 'Important Announcements',
    description: 'Urgent messages from administration',
    roles: ['student', 'parent', 'teacher', 'support', 'manager', 'super_admin'],
  },
};

export default function ProfileScreen() {
  const { user, logout, pushToken } = useAuth();
  const router = useRouter();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [helpChatLoading, setHelpChatLoading] = useState(false);
  const [receptionPhone, setReceptionPhone] = useState('+998901234567');
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPrefsType>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [hasNotificationChanges, setHasNotificationChanges] = useState(false);

  const visibleNotificationOptions = Object.entries(NOTIFICATION_OPTIONS).filter(([, option]) =>
    option.roles.includes(user?.role || '')
  ) as [PreferenceKey, (typeof NOTIFICATION_OPTIONS)[PreferenceKey]][];

  useEffect(() => {
    if (!showNotificationModal) return;

    const loadPreferences = async () => {
      setNotificationLoading(true);
      try {
        const prefs = await getNotificationPreferences();
        setNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...prefs });
        setHasNotificationChanges(false);
      } catch (error) {
        console.error('Error loading notification preferences:', error);
      } finally {
        setNotificationLoading(false);
      }
    };

    loadPreferences();
  }, [showNotificationModal]);

  useEffect(() => {
    if (!showHelpModal) return;

    const loadReceptionPhone = async () => {
      try {
        const response = await api.get('/settings');
        const phone = response.data?.academy_phone || response.data?.phone;
        if (phone) setReceptionPhone(phone);
      } catch (error) {
        console.error('Error loading reception phone:', error);
      }
    };

    loadReceptionPhone();
  }, [showHelpModal]);

  const handleLogoutPress = () => {
    // For web, use custom modal. For native, also use custom modal for consistency
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setShowLogoutModal(false);
      // Use replace to prevent going back to protected pages
      // Go directly to login page
      router.replace('/login');
    } catch (error) {
      console.error('Logout error:', error);
      setIsLoggingOut(false);
    }
  };

  const cancelLogout = () => {
    setShowLogoutModal(false);
  };

  const handleNotificationToggle = (key: PreferenceKey) => {
    setNotificationPreferences((current) => ({
      ...current,
      [key]: !current[key],
    }));
    setHasNotificationChanges(true);
  };

  const handleSaveNotifications = async () => {
    setNotificationSaving(true);
    try {
      const success = await updateNotificationPreferences(notificationPreferences);
      if (success) {
        setHasNotificationChanges(false);
      }
    } catch (error) {
      console.error('Error saving notification preferences:', error);
    } finally {
      setNotificationSaving(false);
    }
  };

  const handleSendTestNotification = async () => {
    if (Platform.OS === 'web') return;

    setTestSending(true);
    try {
      await sendTestNotification();
    } catch (error) {
      console.error('Error sending test notification:', error);
    } finally {
      setTestSending(false);
    }
  };

  const handleCallReception = () => {
    Linking.openURL(`tel:${receptionPhone}`);
  };

  const handleChatWithAdmin = async () => {
    setHelpChatLoading(true);
    try {
      const response = await api.post('/chat/conversations/admin');
      setShowHelpModal(false);
      router.push(`/chat/${response.data.id}`);
    } catch (error) {
      console.error('Error opening admin chat:', error);
    } finally {
      setHelpChatLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.marbleDark, COLORS.background]}
        style={styles.header}
      >
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.full_name?.split(' ').map((n: string) => n[0]).join('') || '?'}
            </Text>
          </View>
          <Text style={styles.name}>{user?.full_name || 'User'}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              {user?.role?.replace('_', ' ').toUpperCase() || 'GUEST'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* Account Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Information</Text>
          <View style={styles.infoCard}>
            <InfoRow icon="person" label="Login" value={user?.login || ''} />
            <InfoRow icon="mail" label="Email" value={user?.email || 'Not set'} />
            <InfoRow icon="call" label="Phone" value={user?.phone || 'Not set'} />
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.menuCard}>
            {user?.role === 'super_admin' && (
              <TouchableOpacity style={styles.menuItem}>
                <Ionicons name="settings" size={24} color={COLORS.gold} />
                <Text style={styles.menuText}>System Settings</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={() => setShowNotificationModal(true)}>
              <Ionicons name="notifications" size={24} color={COLORS.info} />
              <Text style={styles.menuText}>Notifications</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
            </TouchableOpacity>
            {user?.role !== 'super_admin' && (
              <TouchableOpacity style={styles.menuItem} onPress={() => setShowHelpModal(true)}>
                <Ionicons name="help-circle" size={24} color={COLORS.success} />
                <Text style={styles.menuText}>Help & Support</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogoutPress}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out" size={24} color={COLORS.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={cancelLogout}
      >
        <Pressable style={styles.modalOverlay} onPress={cancelLogout}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalIconContainer}>
              <Ionicons name="log-out-outline" size={48} color={COLORS.error} />
            </View>
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to logout?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={cancelLogout}
                disabled={isLoggingOut}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={confirmLogout}
                disabled={isLoggingOut}
              >
                <Text style={styles.confirmButtonText}>
                  {isLoggingOut ? 'Logging out...' : 'Logout'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showNotificationModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotificationModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowNotificationModal(false)}>
          <Pressable style={styles.notificationModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.notificationModalHeader}>
              <View>
                <Text style={styles.modalTitle}>Notifications</Text>
                <Text style={styles.notificationModalSubtitle}>
                  {user?.role?.replace('_', ' ') || 'Account'} settings
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowNotificationModal(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.notificationStatusCard}>
              <Ionicons
                name={pushToken ? 'checkmark-circle' : 'alert-circle'}
                size={22}
                color={pushToken ? COLORS.success : COLORS.warning}
              />
              <Text style={styles.notificationStatusText}>
                {pushToken
                  ? 'Push notifications enabled'
                  : Platform.OS === 'web'
                  ? 'Push notifications are not available on web'
                  : 'Push notifications are not enabled'}
              </Text>
            </View>

            {notificationLoading ? (
              <View style={styles.notificationLoading}>
                <ActivityIndicator size="large" color={COLORS.gold} />
              </View>
            ) : (
              <ScrollView style={styles.notificationSettingsList} showsVerticalScrollIndicator={false}>
                {visibleNotificationOptions.map(([key, option]) => (
                  <View key={key} style={styles.notificationPreferenceItem}>
                    <View style={styles.notificationPreferenceIcon}>
                      <Ionicons name={option.icon as any} size={22} color={COLORS.gold} />
                    </View>
                    <View style={styles.notificationPreferenceContent}>
                      <Text style={styles.notificationPreferenceTitle}>{option.title}</Text>
                      <Text style={styles.notificationPreferenceDescription}>{option.description}</Text>
                    </View>
                    <Switch
                      value={notificationPreferences[key]}
                      onValueChange={() => handleNotificationToggle(key)}
                      trackColor={{ false: COLORS.marbleGray, true: COLORS.goldDark }}
                      thumbColor={notificationPreferences[key] ? COLORS.gold : COLORS.textTertiary}
                      ios_backgroundColor={COLORS.marbleGray}
                    />
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.notificationActions}>
              {Platform.OS !== 'web' && pushToken && (
                <TouchableOpacity
                  style={styles.testNotificationButton}
                  onPress={handleSendTestNotification}
                  disabled={testSending}
                >
                  {testSending ? (
                    <ActivityIndicator color={COLORS.gold} />
                  ) : (
                    <>
                      <Ionicons name="notifications-outline" size={18} color={COLORS.gold} />
                      <Text style={styles.testNotificationText}>Test</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.saveNotificationButton,
                  (!hasNotificationChanges || notificationSaving) && styles.saveNotificationButtonDisabled,
                ]}
                onPress={handleSaveNotifications}
                disabled={!hasNotificationChanges || notificationSaving}
              >
                {notificationSaving ? (
                  <ActivityIndicator color={COLORS.marbleDark} />
                ) : (
                  <Text style={styles.saveNotificationText}>
                    {hasNotificationChanges ? 'Save Changes' : 'Saved'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showHelpModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHelpModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowHelpModal(false)}>
          <Pressable style={styles.helpModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.notificationModalHeader}>
              <View>
                <Text style={styles.modalTitle}>Help & Support</Text>
                <Text style={styles.notificationModalSubtitle}>
                  Reception or admin chat
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowHelpModal(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.helpActionCard} onPress={handleCallReception}>
              <View style={[styles.helpActionIcon, { backgroundColor: COLORS.success + '20' }]}>
                <Ionicons name="call" size={24} color={COLORS.success} />
              </View>
              <View style={styles.helpActionContent}>
                <Text style={styles.helpActionTitle}>Call Central Reception</Text>
                <Text style={styles.helpActionSubtitle}>{receptionPhone}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.helpActionCard}
              onPress={handleChatWithAdmin}
              disabled={helpChatLoading}
            >
              <View style={[styles.helpActionIcon, { backgroundColor: COLORS.gold + '20' }]}>
                <Ionicons name="chatbubbles" size={24} color={COLORS.gold} />
              </View>
              <View style={styles.helpActionContent}>
                <Text style={styles.helpActionTitle}>Chat with Admin</Text>
                <Text style={styles.helpActionSubtitle}>Open a direct support conversation</Text>
              </View>
              {helpChatLoading ? (
                <ActivityIndicator color={COLORS.gold} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const InfoRow = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
  <View style={styles.infoRow}>
    <View style={styles.infoIcon}>
      <Ionicons name={icon as any} size={20} color={COLORS.gold} />
    </View>
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingTop: 60,
    paddingBottom: SIZES.xxl,
  },
  profileHeader: {
    alignItems: 'center',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.large,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
  name: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: SIZES.md,
  },
  roleBadge: {
    backgroundColor: COLORS.gold + '20',
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.xs,
    borderRadius: SIZES.radiusFull,
    marginTop: SIZES.sm,
  },
  roleText: {
    fontSize: SIZES.fontXs,
    fontWeight: '600',
    color: COLORS.gold,
    letterSpacing: 1,
  },
  content: {
    flex: 1,
    padding: SIZES.lg,
  },
  section: {
    marginBottom: SIZES.lg,
  },
  sectionTitle: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SIZES.md,
  },
  infoCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    ...SHADOWS.small,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.md,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.gold + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SIZES.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
    fontWeight: '500',
    marginTop: 2,
  },
  menuCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SIZES.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.marbleGray,
  },
  menuText: {
    flex: 1,
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
    marginLeft: SIZES.md,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.lg,
    marginTop: SIZES.lg,
    borderWidth: 2,
    borderColor: COLORS.error,
  },
  logoutText: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.error,
    marginLeft: SIZES.sm,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SIZES.lg,
  },
  modalContent: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    ...SHADOWS.large,
  },
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.error + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  modalTitle: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.sm,
  },
  modalMessage: {
    fontSize: SIZES.fontMd,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SIZES.xl,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SIZES.md,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: SIZES.md,
    borderRadius: SIZES.radiusMd,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.marbleGray,
  },
  cancelButtonText: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  confirmButton: {
    backgroundColor: COLORS.error,
  },
  confirmButtonText: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  notificationModalContent: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.lg,
    width: '100%',
    maxWidth: 520,
    maxHeight: '82%',
    ...SHADOWS.large,
  },
  helpModalContent: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.lg,
    width: '100%',
    maxWidth: 480,
    ...SHADOWS.large,
  },
  notificationModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SIZES.md,
  },
  notificationModalSubtitle: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.md,
    gap: SIZES.sm,
  },
  notificationStatusText: {
    flex: 1,
    fontSize: SIZES.fontSm,
    color: COLORS.textPrimary,
  },
  notificationLoading: {
    minHeight: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationSettingsList: {
    maxHeight: 360,
  },
  notificationPreferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.marbleGray,
  },
  notificationPreferenceIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SIZES.md,
  },
  notificationPreferenceContent: {
    flex: 1,
    marginRight: SIZES.sm,
  },
  notificationPreferenceTitle: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  notificationPreferenceDescription: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  notificationActions: {
    flexDirection: 'row',
    gap: SIZES.sm,
    marginTop: SIZES.lg,
  },
  testNotificationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.xs,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingHorizontal: SIZES.md,
    minHeight: 46,
  },
  testNotificationText: {
    color: COLORS.gold,
    fontSize: SIZES.fontMd,
    fontWeight: '600',
  },
  saveNotificationButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: SIZES.radiusMd,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveNotificationButtonDisabled: {
    opacity: 0.55,
  },
  saveNotificationText: {
    color: COLORS.marbleDark,
    fontSize: SIZES.fontMd,
    fontWeight: '700',
  },
  helpActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginTop: SIZES.md,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
  },
  helpActionIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SIZES.md,
  },
  helpActionContent: {
    flex: 1,
  },
  helpActionTitle: {
    fontSize: SIZES.fontMd,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  helpActionSubtitle: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
