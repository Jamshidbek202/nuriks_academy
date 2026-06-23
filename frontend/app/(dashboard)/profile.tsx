import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="notifications" size={24} color={COLORS.info} />
              <Text style={styles.menuText}>Notifications</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="help-circle" size={24} color={COLORS.success} />
              <Text style={styles.menuText}>Help & Support</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
            </TouchableOpacity>
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
});
