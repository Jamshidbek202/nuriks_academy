import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '../../src/components/LocalizedText';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import { COLORS, LAYOUT, SIZES, TYPOGRAPHY } from '../../src/constants/theme';
import { useUnreadNotifications } from '../../src/hooks/use-unread-notifications';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';
import { useLanguage } from '../../src/contexts/LanguageContext';

import ParentHomeScreen from './parent-home';
import TeacherHomeScreen from './teacher-home';
import SupportHomeScreen from './support-home';
import StudentHomeScreen from './student-home';
import ReceptionHomeScreen from './reception-home';

type IconName = keyof typeof Ionicons.glyphMap;

type ActionItem = {
  icon: IconName;
  label: string;
  description: string;
  route: string;
  testID: string;
};

const roleTranslationKey = (role?: string) => ({
  super_admin: 'Super Admin',
  manager: 'Manager',
  reception: 'Reception',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
  support: 'Support Staff',
}[String(role || '')] || String(role || '').replaceAll('_', ' '));

export default function DashboardHome() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const unreadNotifications = useUnreadNotifications();
  const { width } = useWindowDimensions();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState(false);
  const isCompact = width < 760;

  const loadDashboardData = async () => {
    try {
      const response = await api.get('/dashboard');
      setStats(response.data);
      setDashboardError(false);
    } catch {
      setDashboardError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'super_admin' || user?.role === 'manager') void loadDashboardData();
    else setLoading(false);
  }, [user]);

  useLiveRefresh(
    loadDashboardData,
    user?.role === 'super_admin' || user?.role === 'manager',
    `dashboard:${user?.role || ''}:${user?.branch_id || ''}`,
    5000,
  );

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.gold} /></View>;
  }

  switch (user?.role) {
    case 'parent': return <ParentHomeScreen />;
    case 'teacher': return <TeacherHomeScreen />;
    case 'support': return <SupportHomeScreen />;
    case 'student': return <StudentHomeScreen />;
    case 'reception': return <ReceptionHomeScreen />;
    case 'super_admin':
    case 'manager': break;
    default:
      return (
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('Welcome')}</Text>
            <Text style={styles.subtitle}>{user?.full_name || 'Nurik\'s Academy'}</Text>
          </View>
        </View>
      );
  }

  const staffActions: ActionItem[] = [
    { icon: 'school-outline', label: 'Teachers', description: 'Teaching staff and assignments', route: '/(dashboard)/teachers', testID: 'admin-tool-teachers' },
    { icon: 'id-card-outline', label: user.role === 'super_admin' ? 'Staff Accounts' : 'Support Staff', description: 'Roles, access, and availability', route: '/(dashboard)/staff-management', testID: user.role === 'super_admin' ? 'admin-tool-staff-accounts' : 'admin-tool-support-staff' },
    { icon: 'people-circle-outline', label: 'Groups', description: 'Schedules, teachers, and students', route: '/(dashboard)/groups', testID: 'admin-tool-groups' },
    { icon: 'funnel-outline', label: 'Leads / CRM', description: 'Enquiries and student conversion', route: '/(dashboard)/leads', testID: 'admin-tool-leads-crm' },
  ];

  const adminActions: ActionItem[] = [
    { icon: 'library-outline', label: 'Courses', description: 'Programs and course catalogue', route: '/(dashboard)/courses', testID: 'admin-tool-courses' },
    { icon: 'settings-outline', label: 'Settings', description: 'Academy and finance settings', route: '/(dashboard)/settings', testID: 'admin-tool-settings' },
    { icon: 'toggle-outline', label: 'Feature Flags', description: 'Controlled feature access', route: '/(dashboard)/feature-flags', testID: 'admin-tool-feature-flags' },
    { icon: 'analytics-outline', label: 'Analytics', description: 'Operational reports', route: '/(dashboard)/analytics', testID: 'admin-tool-analytics' },
    { icon: 'newspaper-outline', label: 'News', description: 'Academy announcements', route: '/(dashboard)/news', testID: 'admin-tool-news' },
    { icon: 'ribbon-outline', label: 'Certificates', description: 'Student certificates', route: '/(dashboard)/certificates', testID: 'admin-tool-certificates' },
    { icon: 'document-text-outline', label: 'Audit Logs', description: 'Account activity history', route: '/(dashboard)/audit-logs', testID: 'admin-tool-audit-logs' },
    { icon: 'cloud-upload-outline', label: 'Backups', description: 'System backup controls', route: '/(dashboard)/backups', testID: 'admin-tool-backups' },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <View style={styles.headerIdentity}>
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Nurik's Academy logo"
          />
          <View style={styles.headerCopy}>
            <Text style={styles.welcome}>{t('Welcome Back')}</Text>
            <Text numberOfLines={1} style={styles.title}>{user.full_name}</Text>
            <Text style={styles.subtitle}>{t(roleTranslationKey(user.role))}</Text>
          </View>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={styles.notificationButton}
          onPress={() => router.push('/(dashboard)/notifications')}
        >
          <Ionicons name="notifications-outline" size={21} color={COLORS.textPrimary} />
          {unreadNotifications > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{Math.min(unreadNotifications, 99)}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {dashboardError && (
        <View accessibilityRole="alert" style={styles.notice}>
          <Ionicons name="cloud-offline-outline" size={18} color={COLORS.warning} />
          <Text style={styles.noticeText}>{t('Dashboard data is temporarily unavailable. Pull down to try again.')}</Text>
        </View>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, isCompact && styles.contentContainerCompact]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void loadDashboardData(); }}
            tintColor={COLORS.gold}
          />
        }
      >
        <SectionHeader title={t('Academy overview')} />
        <View style={styles.metricGrid}>
          <MetricCard compact={isCompact} icon="people-outline" label={t('Current Students')} value={stats?.students?.total || 0} />
          <MetricCard compact={isCompact} icon="checkmark-circle-outline" label={t('Active Students')} value={stats?.students?.active || 0} tone={COLORS.success} />
          <MetricCard compact={isCompact} icon="school-outline" label={t('Teachers')} value={stats?.teachers || 0} />
          <MetricCard compact={isCompact} icon="headset-outline" label={t('Support Staff')} value={stats?.support_staff || 0} />
        </View>

        <View style={[styles.summaryGrid, isCompact && styles.summaryGridCompact]}>
          <View style={styles.summarySection}>
            <SectionHeader title={t('Today')} />
            <View style={styles.summaryPanel}>
              <SummaryRow icon="calendar-outline" label={t('Lessons Today')} value={stats?.today?.lessons || 0} />
              <SummaryRow icon="time-outline" label={t('Support Bookings')} value={stats?.today?.support_bookings || 0} last />
            </View>
          </View>
          <View style={styles.summarySection}>
            <SectionHeader title={t('Student Status')} />
            <View style={styles.summaryPanel}>
              <SummaryRow icon="pause-circle-outline" label={t('Frozen')} value={stats?.students?.frozen || 0} tone={COLORS.warning} />
              <SummaryRow icon="ribbon-outline" label={t('Graduated')} value={stats?.students?.graduated || 0} tone={COLORS.success} />
              <SummaryRow icon="archive-outline" label={t('Archived')} value={stats?.students?.archived || 0} last />
            </View>
          </View>
        </View>

        <SectionHeader title={t('Staff Management')} />
        <View style={styles.actionGrid}>
          {staffActions.map((item) => (
            <ActionTile key={item.label} item={item} compact={isCompact} translate={t} onPress={() => router.push(item.route as any)} />
          ))}
        </View>

        {user.role === 'super_admin' && (
          <>
            <SectionHeader title={t('Admin Tools')} />
            <View style={styles.actionGrid}>
              {adminActions.map((item) => (
                <ActionTile key={item.label} item={item} compact={isCompact} translate={t} onPress={() => router.push(item.route as any)} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function MetricCard({ icon, label, value, tone = COLORS.gold, compact }: { icon: IconName; label: string; value: number; tone?: string; compact: boolean }) {
  return (
    <View style={[styles.metricCard, compact && styles.metricCardCompact]}>
      <View style={styles.metricTopRow}>
        <Ionicons name={icon} size={19} color={tone} />
        <Text style={[styles.metricValue, { color: tone }]}>{value}</Text>
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SummaryRow({ icon, label, value, tone = COLORS.gold, last = false }: { icon: IconName; label: string; value: number; tone?: string; last?: boolean }) {
  return (
    <View style={[styles.summaryRow, last && styles.summaryRowLast]}>
      <Ionicons name={icon} size={19} color={tone} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

function ActionTile({ item, onPress, compact, translate }: { item: ActionItem; onPress: () => void; compact: boolean; translate: (value: string) => string }) {
  return (
    <TouchableOpacity
      testID={item.testID}
      accessibilityRole="button"
      accessibilityLabel={translate(item.label)}
      style={[styles.actionTile, compact && styles.actionTileCompact]}
      onPress={onPress}
      activeOpacity={0.72}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={item.icon} size={20} color={COLORS.gold} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionLabel}>{translate(item.label)}</Text>
        <Text numberOfLines={2} style={styles.actionDescription}>{translate(item.description)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={COLORS.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  header: {
    minHeight: 106,
    paddingTop: SIZES.headerTop,
    paddingBottom: SIZES.md,
    paddingHorizontal: SIZES.lg,
    backgroundColor: COLORS.backgroundSubtle,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.md,
  },
  headerCompact: { paddingHorizontal: SIZES.md },
  headerIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: SIZES.md },
  logo: { width: 46, height: 46, flexShrink: 0 },
  headerCopy: { flex: 1, minWidth: 0 },
  welcome: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginBottom: 2 },
  title: { ...TYPOGRAPHY.title, color: COLORS.textPrimary },
  subtitle: { color: COLORS.gold, fontSize: SIZES.fontXs, marginTop: 3, textTransform: 'capitalize' },
  notificationButton: {
    width: SIZES.touchTarget,
    height: SIZES.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: SIZES.radiusSm,
  },
  unreadBadge: { position: 'absolute', top: 3, right: 3, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center' },
  unreadBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', fontVariant: ['tabular-nums'] },
  notice: { minHeight: 48, paddingHorizontal: SIZES.lg, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, backgroundColor: COLORS.warning + '10', borderBottomWidth: 1, borderBottomColor: COLORS.warning + '45' },
  noticeText: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.fontXs },
  content: { flex: 1 },
  contentContainer: { width: '100%', maxWidth: LAYOUT.contentMaxWidth, alignSelf: 'center', padding: SIZES.lg, paddingBottom: SIZES.xxxl },
  contentContainerCompact: { padding: SIZES.md, paddingBottom: SIZES.xxl },
  sectionTitle: { ...TYPOGRAPHY.section, color: COLORS.textPrimary, marginTop: SIZES.lg, marginBottom: SIZES.md },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm },
  metricCard: { flexGrow: 1, flexBasis: '23%', minWidth: 180, minHeight: 96, justifyContent: 'space-between', backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusSm, padding: SIZES.md },
  metricCardCompact: { flexBasis: '47%', minWidth: 135, minHeight: 88 },
  metricTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.sm },
  metricValue: { fontSize: SIZES.fontXl, lineHeight: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  metricLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontSm },
  summaryGrid: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.lg },
  summaryGridCompact: { flexDirection: 'column', gap: 0 },
  summarySection: { flex: 1, width: '100%', minWidth: 0 },
  summaryPanel: { backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusSm, overflow: 'hidden' },
  summaryRow: { minHeight: 58, paddingHorizontal: SIZES.md, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  summaryRowLast: { borderBottomWidth: 0 },
  summaryLabel: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontSm },
  summaryValue: { minWidth: 28, textAlign: 'right', fontSize: SIZES.fontLg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm },
  actionTile: { flexGrow: 1, flexBasis: '47%', minWidth: 280, minHeight: 78, paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, flexDirection: 'row', alignItems: 'center', gap: SIZES.md, backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusSm },
  actionTileCompact: { flexBasis: '100%', minWidth: 0 },
  actionIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: SIZES.radiusXs, backgroundColor: COLORS.backgroundLight },
  actionCopy: { flex: 1, minWidth: 0 },
  actionLabel: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700' },
  actionDescription: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 17, marginTop: 3 },
});
