import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
  Switch,
  Linking,
  Alert,
} from 'react-native';
import { Text, TextInput } from '../../src/components/LocalizedText';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { api, apiErrorMessage } from '../../src/services/api';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { AppLanguage, LANGUAGE_LABELS } from '../../src/i18n/translations';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  sendTestNotification,
  NotificationPreferences as NotificationPrefsType,
} from '../../src/services/notifications';
import { ConcourseAtmosphere, ConcourseGlassLayer } from '../../src/components/ConcourseAtmosphere';
import { MotionPressableCard, MotionReveal, MotionTouchableOpacity } from '../../src/components/Motion';

type PreferenceKey = keyof NotificationPrefsType;

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPrefsType = {
  chat_notifications: true,
  payment_reminders: true,
  homework_notifications: true,
  test_notifications: true,
  lesson_reminders: true,
  attendance_notifications: true,
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
    roles: ['student', 'parent', 'manager', 'super_admin'],
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
  attendance_notifications: {
    icon: 'checkbox-outline',
    title: 'Attendance',
    description: 'Attendance records and absence notices',
    roles: ['student', 'parent', 'teacher', 'manager', 'super_admin'],
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
  const { language, setLanguage, t } = useLanguage();
  const router = useRouter();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [languageSaving, setLanguageSaving] = useState<AppLanguage | null>(null);
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

  const handleLanguageChange = async (nextLanguage: AppLanguage) => {
    if (nextLanguage === language) {
      setShowLanguageModal(false);
      return;
    }
    setLanguageSaving(nextLanguage);
    try {
      await api.put('/auth/preferences/language', { language: nextLanguage });
      setShowLanguageModal(false);
      setLanguageSaving(null);
      await setLanguage(nextLanguage);
    } catch (error) {
      console.error('Error saving language preference:', error);
      Alert.alert('Error', 'Could not save language preference');
    } finally {
      setLanguageSaving(null);
    }
  };

  const closePasswordModal = () => {
    if (passwordSaving) return;
    setShowPasswordModal(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setShowPasswordFields(false);
  };

  const changePassword = async () => {
    setPasswordError('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Enter your current password and the new password twice.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    setPasswordSaving(true);
    try {
      await api.post('/auth/password/change', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setShowPasswordModal(false);
      await logout();
      Alert.alert('Password changed', 'Your other sessions were signed out. Sign in with the new password.');
      router.replace('/login');
    } catch (error: any) {
      setPasswordError(apiErrorMessage(error, 'Could not change password'));
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <View testID="profile-screen" style={styles.container}>
      <ConcourseAtmosphere />
      <LinearGradient
        colors={['rgba(213,182,98,0.16)', 'rgba(9,10,7,0.02)']}
        style={styles.header}
      >
        <MotionReveal style={styles.profileHeader} distance={7} duration={360}>
          <ConcourseGlassLayer tone="gold" intensity={36} />
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.full_name?.split(' ').map((n: string) => n[0]).join('') || '?'}
            </Text>
          </View>
          <Text style={styles.name}>{user?.full_name || 'User'}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              {t(user?.role?.replace('_', ' ') || 'Guest').toUpperCase()}
            </Text>
          </View>
        </MotionReveal>
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Account Info */}
        <MotionReveal style={styles.section} delay={45} distance={6}>
          <Text style={styles.sectionTitle}>Account Information</Text>
          <View style={styles.infoCard}>
            <InfoRow icon="person" label="Login" value={user?.login || ''} />
            <InfoRow icon="mail" label="Email" value={user?.email || 'Not set'} />
            <InfoRow icon="call" label="Phone" value={user?.phone || 'Not set'} />
          </View>
        </MotionReveal>

        {/* Settings */}
        <MotionReveal style={styles.section} delay={85} distance={6}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.menuCard}>
            {user?.role === 'super_admin' && (
              <MotionPressableCard
                testID="profile-system-settings-button"
                accessibilityRole="button"
                accessibilityLabel="System Settings"
                style={styles.menuItem}
                onPress={() => router.push('/(dashboard)/settings')}
              >
                <Ionicons name="settings" size={24} color={COLORS.gold} />
                <Text style={styles.menuText}>System Settings</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
              </MotionPressableCard>
            )}
            <MotionPressableCard
              testID="profile-language-button"
              accessibilityRole="button"
              accessibilityLabel="App language"
              style={styles.menuItem}
              onPress={() => setShowLanguageModal(true)}
            >
              <Ionicons name="language" size={24} color={COLORS.gold} />
              <View style={styles.menuTextContent}>
                <Text style={[styles.menuText, styles.menuTextNested]}>App language</Text>
                <Text style={styles.menuSubtitle}>{LANGUAGE_LABELS[language]}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
            </MotionPressableCard>
            <MotionPressableCard
              testID="profile-change-password-button"
              accessibilityRole="button"
              accessibilityLabel="Change password"
              style={styles.menuItem}
              onPress={() => setShowPasswordModal(true)}
            >
              <Ionicons name="key-outline" size={24} color={COLORS.gold} />
              <View style={styles.menuTextContent}>
                <Text style={[styles.menuText, styles.menuTextNested]}>Change password</Text>
                <Text style={styles.menuSubtitle}>Use your current password</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
            </MotionPressableCard>
            <MotionPressableCard
              testID="profile-notifications-button"
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              style={styles.menuItem}
              onPress={() => setShowNotificationModal(true)}
            >
              <Ionicons name="notifications" size={24} color={COLORS.info} />
              <Text style={styles.menuText}>Notifications</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
            </MotionPressableCard>
            {user?.role !== 'super_admin' && (
              <MotionPressableCard
                testID="profile-help-button"
                accessibilityRole="button"
                accessibilityLabel="Help and Support"
                style={styles.menuItem}
                onPress={() => setShowHelpModal(true)}
              >
                <Ionicons name="help-circle" size={24} color={COLORS.success} />
                <Text style={styles.menuText}>Help & Support</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
              </MotionPressableCard>
            )}
          </View>
        </MotionReveal>

        {/* Logout Button */}
        <MotionTouchableOpacity
          testID="profile-logout-button"
          accessibilityRole="button"
          accessibilityLabel="Logout"
          style={styles.logoutButton}
          onPress={handleLogoutPress}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out" size={24} color={COLORS.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </MotionTouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={closePasswordModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closePasswordModal}>
          <Pressable style={styles.passwordModalContent} onPress={(event) => event.stopPropagation()}>
            <View style={styles.notificationModalHeader}>
              <View style={styles.languageTitleContent}>
                <Text style={styles.modalTitle}>Change password</Text>
                <Text style={styles.notificationModalSubtitle}>All existing sessions will be signed out</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close password form" onPress={closePasswordModal} style={styles.closeButton}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            {!!passwordError && <Text style={styles.passwordError}>{passwordError}</Text>}
            <Text style={styles.passwordLabel}>Current password</Text>
            <View style={styles.passwordInputShell}>
              <TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry={!showPasswordFields} autoCapitalize="none" autoComplete="current-password" style={styles.passwordInput} placeholder="Current password" />
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={showPasswordFields ? 'Hide passwords' : 'Show passwords'} style={styles.passwordEye} onPress={() => setShowPasswordFields((value) => !value)}>
                <Ionicons name={showPasswordFields ? 'eye-off-outline' : 'eye-outline'} size={21} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.passwordLabel}>New password</Text>
            <View style={styles.passwordInputShell}>
              <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry={!showPasswordFields} autoCapitalize="none" autoComplete="new-password" style={styles.passwordInput} placeholder="New password" />
            </View>
            <Text style={styles.passwordHint}>10+ characters with uppercase, lowercase, number, and symbol. No spaces.</Text>
            <Text style={styles.passwordLabel}>Confirm new password</Text>
            <View style={styles.passwordInputShell}>
              <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPasswordFields} autoCapitalize="none" autoComplete="new-password" style={styles.passwordInput} placeholder="Repeat new password" />
            </View>
            <TouchableOpacity testID="profile-change-password-save" accessibilityRole="button" accessibilityLabel="Save new password" style={styles.passwordSaveButton} onPress={() => void changePassword()} disabled={passwordSaving}>
              {passwordSaving ? <ActivityIndicator color={COLORS.marbleDark} /> : <Text style={styles.passwordSaveText}>Change password</Text>}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showLanguageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowLanguageModal(false)}>
          <Pressable style={styles.languageModalContent} onPress={(event) => event.stopPropagation()}>
            <View style={styles.notificationModalHeader}>
              <View style={styles.languageTitleContent}>
                <Text style={styles.modalTitle}>App language</Text>
                <Text style={styles.notificationModalSubtitle}>
                  Choose the language used throughout the app
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowLanguageModal(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            {(['en', 'ru', 'uz'] as AppLanguage[]).map((option) => {
              const selected = option === language;
              return (
                <TouchableOpacity
                  key={option}
                  testID={`profile-language-option-${option}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${LANGUAGE_LABELS[option]}`}
                  style={[styles.languageOption, selected && styles.languageOptionSelected]}
                  onPress={() => handleLanguageChange(option)}
                  disabled={languageSaving !== null}
                >
                  <View style={styles.languageCodeBadge}>
                    <Text style={styles.languageCode}>{option.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.languageOptionText}>{LANGUAGE_LABELS[option]}</Text>
                  {languageSaving === option ? (
                    <ActivityIndicator color={COLORS.gold} />
                  ) : (
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                      color={selected ? COLORS.gold : COLORS.textTertiary}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

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
                testID="profile-logout-cancel"
                accessibilityRole="button"
                accessibilityLabel="Cancel logout"
                style={[styles.modalButton, styles.cancelButton]}
                onPress={cancelLogout}
                disabled={isLoggingOut}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="profile-logout-confirm"
                accessibilityRole="button"
                accessibilityLabel="Confirm logout"
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
              <TouchableOpacity
                testID="profile-notifications-close"
                accessibilityRole="button"
                accessibilityLabel="Close notification settings"
                onPress={() => setShowNotificationModal(false)}
                style={styles.closeButton}
              >
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
                      testID={`profile-notification-${key}`}
                      accessibilityLabel={option.title}
                      value={notificationPreferences[key]}
                      onValueChange={() => {
                        if (key !== 'payment_reminders') handleNotificationToggle(key);
                      }}
                      disabled={key === 'payment_reminders'}
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
                testID="profile-notifications-save"
                accessibilityRole="button"
                accessibilityLabel="Save notification settings"
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
              testID="profile-help-chat"
              accessibilityRole="button"
              accessibilityLabel="Chat with Admin"
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
    paddingTop: SIZES.headerTop,
    paddingHorizontal: SIZES.lg,
    paddingBottom: SIZES.lg,
  },
  profileHeader: {
    position: 'relative',
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 880,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusLg,
    overflow: 'hidden',
    paddingVertical: SIZES.lg,
    paddingHorizontal: SIZES.md,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.large,
  },
  avatarText: {
    fontSize: 28,
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
  },
  contentContainer: {
    width: '100%',
    maxWidth: 880,
    alignSelf: 'center',
    padding: SIZES.lg,
    paddingTop: SIZES.md,
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
    borderWidth: 1,
    borderColor: COLORS.border,
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
    borderWidth: 1,
    borderColor: COLORS.border,
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
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
    marginLeft: SIZES.md,
  },
  menuTextNested: {
    marginLeft: 0,
  },
  menuTextContent: {
    flex: 1,
    marginLeft: SIZES.md,
  },
  menuSubtitle: {
    color: COLORS.textSecondary,
    fontSize: SIZES.fontSm,
    marginTop: 2,
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
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    ...SHADOWS.large,
  },
  languageModalContent: {
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.lg,
    width: '100%',
    maxWidth: 460,
    ...SHADOWS.large,
  },
  languageTitleContent: {
    flex: 1,
    paddingRight: SIZES.md,
  },
  languageOption: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: SIZES.md,
    marginTop: SIZES.sm,
    backgroundColor: COLORS.backgroundLight,
  },
  languageOptionSelected: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.gold + '12',
  },
  languageCodeBadge: {
    width: 42,
    height: 34,
    borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.marbleGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SIZES.md,
  },
  languageCode: {
    color: COLORS.gold,
    fontWeight: '800',
    fontSize: SIZES.fontSm,
  },
  languageOptionText: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: SIZES.fontMd,
    fontWeight: '600',
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
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.lg,
    width: '100%',
    maxWidth: 520,
    maxHeight: '82%',
    ...SHADOWS.large,
  },
  passwordModalContent: {
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: SIZES.radiusLg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SIZES.lg,
    width: '100%',
    maxWidth: 480,
    ...SHADOWS.large,
  },
  passwordError: {
    color: COLORS.error,
    backgroundColor: COLORS.error + '18',
    borderWidth: 1,
    borderColor: COLORS.error + '66',
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.sm,
  },
  passwordLabel: {
    color: COLORS.textSecondary,
    fontSize: SIZES.fontSm,
    fontWeight: '700',
    marginTop: SIZES.sm,
    marginBottom: SIZES.xs,
  },
  passwordInputShell: {
    minHeight: SIZES.inputHeight,
    backgroundColor: COLORS.backgroundLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusMd,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    minHeight: SIZES.inputHeight,
    color: COLORS.textPrimary,
    fontSize: SIZES.fontMd,
    paddingHorizontal: SIZES.md,
  },
  passwordEye: {
    width: SIZES.touchTarget,
    height: SIZES.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordHint: {
    color: COLORS.textTertiary,
    fontSize: SIZES.fontXs,
    lineHeight: 18,
    marginTop: SIZES.xs,
  },
  passwordSaveButton: {
    minHeight: SIZES.touchTarget,
    marginTop: SIZES.lg,
    backgroundColor: COLORS.gold,
    borderRadius: SIZES.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordSaveText: {
    color: COLORS.marbleDark,
    fontSize: SIZES.fontMd,
    fontWeight: '800',
  },
  helpModalContent: {
    backgroundColor: COLORS.backgroundElevated,
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
