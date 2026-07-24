import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Text } from '../../src/components/LocalizedText';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { useUnreadNotifications } from '../../src/hooks/use-unread-notifications';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';

// Import role-specific screens
import ParentHomeScreen from './parent-home';
import TeacherHomeScreen from './teacher-home';
import SupportHomeScreen from './support-home';
import StudentHomeScreen from './student-home';

export default function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  const unreadNotifications = useUnreadNotifications();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboardData = async () => {
    try {
      const response = await api.get('/dashboard');
      setStats(response.data);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'super_admin' || user?.role === 'manager') {
      loadDashboardData();
    } else {
      setLoading(false);
    }
  }, [user]);

  useLiveRefresh(
    loadDashboardData,
    user?.role === 'super_admin' || user?.role === 'manager',
    `dashboard:${user?.role || ''}:${user?.branch_id || ''}`,
    5000,
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  // Role-based home screen rendering
  switch (user?.role) {
    case 'parent':
      return <ParentHomeScreen />;
    case 'teacher':
      return <TeacherHomeScreen />;
    case 'support':
      return <SupportHomeScreen />;
    case 'student':
      return <StudentHomeScreen />;
    case 'super_admin':
    case 'manager':
      // Continue to admin dashboard below
      break;
    default:
      // Default view for unknown roles
      return (
        <View style={styles.container}>
          <View style={styles.studentHeader}>
            <Text style={styles.welcomeText}>Welcome</Text>
            <Text style={styles.subtitle}>{user?.full_name || 'Portal'}</Text>
          </View>
        </View>
      );
  }

  // Admin/Manager Dashboard
  if (user?.role === 'super_admin' || user?.role === 'manager') {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[COLORS.marbleDark, COLORS.background]}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.greeting}>Welcome back,</Text>
              <Text style={styles.userName}>{user.full_name}</Text>
              <Text style={styles.userRole}>{user.role.replace('_', ' ').toUpperCase()}</Text>
            </View>
            <TouchableOpacity style={styles.logoSmall} onPress={() => router.push('/(dashboard)/notifications')}>
              <Ionicons name="notifications" size={23} color={COLORS.gold} />
              {unreadNotifications > 0 && <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{Math.min(unreadNotifications, 99)}</Text></View>}
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />
          }
        >
          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <StatCard
              icon="people"
              title="Current Students"
              value={stats?.students?.total || 0}
              color={COLORS.gold}
            />
            <StatCard
              icon="checkmark-circle"
              title="Active Students"
              value={stats?.students?.active || 0}
              color={COLORS.success}
            />
            <StatCard
              icon="school"
              title="Teachers"
              value={stats?.teachers || 0}
              color={COLORS.info}
            />
            <StatCard
              icon="headset"
              title="Support Staff"
              value={stats?.support_staff || 0}
              color={COLORS.warning}
            />
          </View>

          {/* Today's Summary */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today&apos;s Schedule</Text>
            <View style={styles.todayCard}>
              <View style={styles.todayRow}>
                <Ionicons name="calendar" size={24} color={COLORS.gold} />
                <Text style={styles.todayLabel}>Lessons Today</Text>
                <Text style={styles.todayValue}>{stats?.today?.lessons || 0}</Text>
              </View>
              <View style={[styles.todayRow, { marginTop: SIZES.md }]}>
                <Ionicons name="time" size={24} color={COLORS.gold} />
                <Text style={styles.todayLabel}>Support Bookings</Text>
                <Text style={styles.todayValue}>{stats?.today?.support_bookings || 0}</Text>
              </View>
            </View>
          </View>

          {/* Student Status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Student Status</Text>
            <View style={styles.statusCard}>
              <StatusRow label="Frozen" value={stats?.students?.frozen || 0} color={COLORS.info} />
              <StatusRow label="Graduated" value={stats?.students?.graduated || 0} color={COLORS.success} />
              <StatusRow label="Archived" value={stats?.students?.archived || 0} color={COLORS.textTertiary} />
            </View>
          </View>

          {/* Staff operations available within each role's backend permissions. */}
          {['super_admin', 'manager'].includes(user?.role || '') && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Staff Management</Text>
              <View style={styles.adminGrid}>
                <AdminCard icon="school" label="Teachers" onPress={() => router.push('/(dashboard)/teachers')} />
                <AdminCard icon="headset" label={user?.role === 'super_admin' ? 'Staff Accounts' : 'Support Staff'} onPress={() => router.push('/(dashboard)/staff-management')} />
                <AdminCard icon="people" label="Groups" onPress={() => router.push('/(dashboard)/groups')} />
                <AdminCard icon="people-circle" label="Leads / CRM" onPress={() => router.push('/(dashboard)/leads')} />
              </View>
            </View>
          )}

          {/* Admin Tools (Super Admin Only) */}
          {user?.role === 'super_admin' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Admin Tools</Text>
              <View style={styles.adminGrid}>
                <AdminCard icon="settings" label="Settings" onPress={() => router.push('/(dashboard)/settings')} />
                <AdminCard icon="toggle" label="Feature Flags" onPress={() => router.push('/(dashboard)/feature-flags')} />
                <AdminCard icon="analytics" label="Analytics" onPress={() => router.push('/(dashboard)/analytics')} />
                <AdminCard icon="newspaper" label="News" onPress={() => router.push('/(dashboard)/news')} />
                <AdminCard icon="ribbon" label="Certificates" onPress={() => router.push('/(dashboard)/certificates')} />
                <AdminCard icon="document-text" label="Audit Logs" onPress={() => router.push('/(dashboard)/audit-logs')} />
                <AdminCard icon="cloud-upload" label="Backups" onPress={() => router.push('/(dashboard)/backups')} />
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // Other roles - simple dashboard
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.marbleDark, COLORS.background]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>Welcome,</Text>
            <Text style={styles.userName}>{user?.full_name}</Text>
            <Text style={styles.userRole}>{String(user?.role || '').toUpperCase()}</Text>
          </View>
          <View style={styles.logoSmall}>
            <Text style={styles.logoSmallText}>NA</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content}>
        <View style={styles.welcomeCard}>
          <Ionicons name="school" size={48} color={COLORS.gold} />
          <Text style={styles.welcomeText}>Welcome to Nurik&apos;s Academy</Text>
          <Text style={styles.welcomeSubtext}>
            Your portal for academic excellence
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const StatCard = ({ icon, title, value, color }: any) => (
  <View style={styles.statCard}>
    <View style={[styles.statIconContainer, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statTitle}>{title}</Text>
  </View>
);

const StatusRow = ({ label, value, color }: any) => (
  <View style={styles.statusRow}>
    <View style={[styles.statusDot, { backgroundColor: color }]} />
    <Text style={styles.statusLabel}>{label}</Text>
    <Text style={styles.statusValue}>{value}</Text>
  </View>
);

const AdminCard = ({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.adminCard} onPress={onPress}>
    <View style={styles.adminIconContainer}>
      <Ionicons name={icon as any} size={24} color={COLORS.gold} />
    </View>
    <Text style={styles.adminLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  header: {
    paddingTop: 60,
    paddingBottom: SIZES.lg,
    paddingHorizontal: SIZES.lg,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
  },
  userName: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: SIZES.xs,
  },
  userRole: {
    fontSize: SIZES.fontXs,
    color: COLORS.gold,
    marginTop: SIZES.xs,
    fontWeight: '600',
    letterSpacing: 1,
  },
  logoSmall: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center' },
  unreadBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  logoSmallText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
  content: {
    flex: 1,
    padding: SIZES.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -SIZES.xs,
    marginBottom: SIZES.lg,
  },
  statCard: {
    width: '48%',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    margin: SIZES.xs,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  statValue: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  statTitle: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SIZES.xs,
  },
  section: {
    marginBottom: SIZES.lg,
  },
  sectionTitle: {
    fontSize: SIZES.fontLg,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.md,
  },
  todayCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.lg,
    ...SHADOWS.small,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayLabel: {
    flex: 1,
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
    marginLeft: SIZES.md,
  },
  todayValue: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.gold,
  },
  statusCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.lg,
    ...SHADOWS.small,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: SIZES.md,
  },
  statusLabel: {
    flex: 1,
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
  },
  statusValue: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  welcomeCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.xxl,
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  welcomeText: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: SIZES.lg,
    textAlign: 'center',
  },
  welcomeSubtext: {
    fontSize: SIZES.fontMd,
    color: COLORS.textSecondary,
    marginTop: SIZES.sm,
    textAlign: 'center',
  },
  studentHeader: {
    paddingTop: 60,
    paddingHorizontal: SIZES.lg,
    paddingBottom: SIZES.xl,
    backgroundColor: COLORS.marbleDark,
  },
  subtitle: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginTop: SIZES.xs,
  },
  adminGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -SIZES.xs,
  },
  adminCard: {
    width: '31%',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    margin: SIZES.xs,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  adminIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gold + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  adminLabel: {
    fontSize: SIZES.fontXs,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
});
