import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Text } from '../../src/components/LocalizedText';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import { COLORS, SHADOWS, SIZES, TYPOGRAPHY } from '../../src/constants/theme';
import { useUnreadNotifications } from '../../src/hooks/use-unread-notifications';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';
import { useLanguage } from '../../src/contexts/LanguageContext';

import ParentHomeScreen from './parent-home';
import TeacherHomeScreen from './teacher-home';
import SupportHomeScreen from './support-home';
import StudentHomeScreen from './student-home';
import ReceptionHomeScreen from './reception-home';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

type ActionItem = {
  icon: IconName;
  label: string;
  description: string;
  route: string;
  testID: string;
  accent: string;
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
  const heroProgress = useRef(new Animated.Value(0)).current;
  const statusProgress = useRef(new Animated.Value(0)).current;
  const toolsProgress = useRef(new Animated.Value(0)).current;
  const isCompact = width < 760;
  const todayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

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

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!mounted) return;
      if (reduceMotion) {
        heroProgress.setValue(1);
        statusProgress.setValue(1);
        toolsProgress.setValue(1);
        return;
      }
      Animated.stagger(55, [heroProgress, statusProgress, toolsProgress].map((progress) => Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }))).start();
    });
    return () => { mounted = false; };
  }, [heroProgress, statusProgress, toolsProgress]);

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
    { icon: 'account-school-outline', label: 'Teachers', description: 'Teaching staff and assignments', route: '/(dashboard)/teachers', testID: 'admin-tool-teachers', accent: COLORS.gold },
    { icon: 'badge-account-horizontal-outline', label: user.role === 'super_admin' ? 'Staff Accounts' : 'Support Staff', description: 'Roles, access, and availability', route: '/(dashboard)/staff-management', testID: user.role === 'super_admin' ? 'admin-tool-staff-accounts' : 'admin-tool-support-staff', accent: COLORS.info },
    { icon: 'account-group-outline', label: 'Groups', description: 'Schedules, teachers, and students', route: '/(dashboard)/groups', testID: 'admin-tool-groups', accent: COLORS.success },
    { icon: 'account-convert-outline', label: 'Leads / CRM', description: 'Enquiries and student conversion', route: '/(dashboard)/leads', testID: 'admin-tool-leads-crm', accent: COLORS.warning },
  ];

  const adminActions: ActionItem[] = [
    { icon: 'book-open-variant', label: 'Courses', description: 'Programs and course catalogue', route: '/(dashboard)/courses', testID: 'admin-tool-courses', accent: COLORS.gold },
    { icon: 'tune-variant', label: 'Settings', description: 'Academy and finance settings', route: '/(dashboard)/settings', testID: 'admin-tool-settings', accent: COLORS.info },
    { icon: 'flag-variant-outline', label: 'Feature Flags', description: 'Controlled feature access', route: '/(dashboard)/feature-flags', testID: 'admin-tool-feature-flags', accent: COLORS.warning },
    { icon: 'chart-box-outline', label: 'Analytics', description: 'Operational reports', route: '/(dashboard)/analytics', testID: 'admin-tool-analytics', accent: COLORS.success },
    { icon: 'newspaper-variant-outline', label: 'News', description: 'Academy announcements', route: '/(dashboard)/news', testID: 'admin-tool-news', accent: COLORS.info },
    { icon: 'certificate-outline', label: 'Certificates', description: 'Student certificates', route: '/(dashboard)/certificates', testID: 'admin-tool-certificates', accent: COLORS.gold },
    { icon: 'clipboard-text-clock-outline', label: 'Audit Logs', description: 'Account activity history', route: '/(dashboard)/audit-logs', testID: 'admin-tool-audit-logs', accent: COLORS.warning },
    { icon: 'cloud-upload-outline', label: 'Backups', description: 'System backup controls', route: '/(dashboard)/backups', testID: 'admin-tool-backups', accent: COLORS.success },
  ];

  return (
    <View style={styles.container}>
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
        <Animated.View style={{ opacity: heroProgress, transform: [{ translateY: heroProgress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
          <View style={styles.todayHero}>
            <LinearGradient
              pointerEvents="none"
              colors={['#1B1E16', '#15180F', '#26200F']}
              locations={[0, 0.58, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroTopRow}>
              <View style={styles.headerIdentity}>
                <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Nurik's Academy logo" />
                <View style={styles.headerCopy}>
                  <Text style={styles.welcome}>{t('Today at Nurik\'s')}</Text>
                  <Text numberOfLines={1} style={styles.title}>{user.full_name}</Text>
                  <Text style={styles.subtitle}>{todayLabel} · {t(roleTranslationKey(user.role))}</Text>
                </View>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Notifications" style={styles.notificationButton} onPress={() => router.push('/(dashboard)/notifications')}>
                <Ionicons name="notifications-outline" size={21} color={COLORS.textPrimary} />
                {unreadNotifications > 0 && <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{Math.min(unreadNotifications, 99)}</Text></View>}
              </TouchableOpacity>
            </View>
            <View style={[styles.heroMetrics, isCompact && styles.heroMetricsCompact]}>
              <View style={styles.todayLead}>
                <MetricOrbit />
                <MaterialCommunityIcons name="calendar-month-outline" size={24} color={COLORS.goldLight} />
                <Text style={styles.todayLeadLabel}>{t('Lessons Today')}</Text>
                <Text style={styles.todayLeadValue}>{stats?.today?.lessons || 0}</Text>
                <Text style={styles.todayLeadHint}>{t('Scheduled academy sessions')}</Text>
              </View>
              <View style={styles.todayRegister}>
                <Text style={styles.todayRegisterTitle}>{t('At a glance')}</Text>
                <TodayRow icon="clock-outline" label={t('Support Bookings')} value={stats?.today?.support_bookings || 0} tone={COLORS.info} />
                <TodayRow icon="account-multiple-outline" label={t('Current Students')} value={stats?.students?.total || 0} tone={COLORS.goldLight} />
                <TodayRow icon="check-decagram-outline" label={t('Active Students')} value={stats?.students?.active || 0} tone={COLORS.success} last />
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: statusProgress, transform: [{ translateY: statusProgress.interpolate({ inputRange: [0, 1], outputRange: [9, 0] }) }] }}>
          <SectionHeader title={t('Academy status')} />
          <View style={[styles.academyPulse, isCompact && styles.academyPulseCompact]}>
            <View style={styles.academyStatusLine}>
              <View style={styles.statusIdentity}>
                <View style={styles.liveDot} />
                <Text style={styles.academyStatusTitle}>{t('Live academy snapshot')}</Text>
              </View>
              <Text style={styles.academyStatusMeta}>{t('The operational view refreshes automatically.')}</Text>
            </View>
            <View style={[styles.summaryGrid, isCompact && styles.summaryGridCompact]}>
              <View style={styles.summarySection}>
                <View style={styles.panelHeader}><Text style={styles.panelTitle}>{t('Team')}</Text><MaterialCommunityIcons name="account-group-outline" size={20} color={COLORS.gold} /></View>
                <View style={styles.summaryPanel}>
                  <SummaryRow icon="account-school-outline" label={t('Teachers')} value={stats?.teachers || 0} />
                  <SummaryRow icon="headset" label={t('Support Staff')} value={stats?.support_staff || 0} tone={COLORS.info} last />
                </View>
              </View>
              <View style={styles.summarySection}>
                <View style={styles.panelHeader}><Text style={styles.panelTitle}>{t('Student journey')}</Text><MaterialCommunityIcons name="chart-timeline-variant" size={20} color={COLORS.gold} /></View>
                <View style={styles.summaryPanel}>
                  <SummaryRow icon="pause-circle-outline" label={t('Frozen')} value={stats?.students?.frozen || 0} tone={COLORS.warning} />
                  <SummaryRow icon="certificate-outline" label={t('Graduated')} value={stats?.students?.graduated || 0} tone={COLORS.success} />
                  <SummaryRow icon="archive-outline" label={t('Archived')} value={stats?.students?.archived || 0} last />
                </View>
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: toolsProgress, transform: [{ translateY: toolsProgress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
          <SectionHeader title={t('People and schedules')} />
          <View style={styles.actionGrid}>
            {staffActions.map((item) => <ActionTile key={item.label} item={item} compact={isCompact} translate={t} onPress={() => router.push(item.route as any)} />)}
          </View>

          {user.role === 'super_admin' && (
            <>
              <SectionHeader title={t('Academy tools')} />
              <View style={styles.adminActionGrid}>
                {adminActions.map((item) => <ActionTile key={item.label} item={item} compact={isCompact} translate={t} onPress={() => router.push(item.route as any)} />)}
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function TodayRow({ icon, label, value, tone, last = false }: { icon: IconName; label: string; value: number; tone: string; last?: boolean }) {
  return (
    <View style={[styles.todayRow, last && styles.todayRowLast]}>
      <MaterialCommunityIcons name={icon} size={20} color={tone} />
      <Text style={styles.todayRowLabel}>{label}</Text>
      <Text style={[styles.todayRowValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

function MetricOrbit() {
  return <View pointerEvents="none" style={styles.metricOrbit}><View style={styles.metricOrbitOuter} /><View style={styles.metricOrbitInner} /><View style={styles.metricOrbitDot} /></View>;
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function SummaryRow({ icon, label, value, tone = COLORS.gold, last = false }: { icon: IconName; label: string; value: number; tone?: string; last?: boolean }) {
  return (
    <View style={[styles.summaryRow, last && styles.summaryRowLast]}>
      <MaterialCommunityIcons name={icon} size={19} color={tone} />
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
        <MaterialCommunityIcons name={item.icon} size={22} color={item.accent} />
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
  header: { paddingTop: SIZES.headerTop, paddingHorizontal: SIZES.lg },
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: COLORS.glassHighlight,
    borderRadius: SIZES.radiusMd,
  },
  unreadBadge: { position: 'absolute', top: 3, right: 3, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center' },
  unreadBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', fontVariant: ['tabular-nums'] },
  notice: { minHeight: 48, paddingHorizontal: SIZES.lg, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, backgroundColor: COLORS.warning + '10', borderBottomWidth: 1, borderBottomColor: COLORS.warning + '45' },
  noticeText: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.fontXs },
  content: { flex: 1 },
  contentContainer: { width: '100%', maxWidth: 1160, alignSelf: 'center', padding: SIZES.lg, paddingTop: SIZES.headerTop, paddingBottom: SIZES.xxxl },
  contentContainerCompact: { padding: SIZES.md, paddingTop: SIZES.headerTop, paddingBottom: SIZES.xxl },
  todayHero: { minHeight: 334, borderRadius: SIZES.radiusXl, borderWidth: 1, borderColor: COLORS.goldHairline, padding: SIZES.lg, overflow: 'hidden', ...SHADOWS.medium },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.md, paddingBottom: SIZES.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.glassHighlight },
  heroMetrics: { flexDirection: 'row', alignItems: 'stretch', gap: SIZES.md, marginTop: SIZES.lg },
  heroMetricsCompact: { flexDirection: 'column' },
  todayLead: { position: 'relative', flex: 0.9, minWidth: 260, minHeight: 176, justifyContent: 'flex-end', padding: SIZES.lg, backgroundColor: COLORS.goldGlass, borderWidth: 1, borderColor: COLORS.goldHairline, borderRadius: SIZES.radiusLg, overflow: 'hidden' },
  todayLeadLabel: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700', marginTop: SIZES.md },
  todayLeadValue: { color: COLORS.goldLight, fontSize: 48, lineHeight: 52, fontWeight: '850' as any, fontVariant: ['tabular-nums'] },
  todayLeadHint: { color: COLORS.textTertiary, fontSize: 11, lineHeight: 16, marginTop: SIZES.xs },
  todayRegister: { flex: 1.3, minWidth: 280, minHeight: 176, backgroundColor: 'rgba(7,8,6,0.64)', borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusLg, overflow: 'hidden' },
  todayRegisterTitle: { minHeight: 44, paddingHorizontal: SIZES.md, textAlignVertical: 'center', color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '750' as any, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  todayRow: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  todayRowLast: { borderBottomWidth: 0 },
  todayRowLabel: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.fontSm },
  todayRowValue: { minWidth: 34, textAlign: 'right', fontSize: SIZES.fontLg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  metricOrbit: { position: 'absolute', width: 150, height: 150, right: -30, bottom: -44, opacity: 0.72 },
  metricOrbitOuter: { ...StyleSheet.absoluteFillObject, borderRadius: 75, borderWidth: 1, borderColor: COLORS.goldHairline },
  metricOrbitInner: { position: 'absolute', width: 96, height: 96, left: 27, top: 27, borderRadius: 48, borderWidth: 1, borderColor: COLORS.goldHairline, backgroundColor: COLORS.goldGlass },
  metricOrbitDot: { position: 'absolute', width: 9, height: 9, borderRadius: 5, right: 18, top: 32, backgroundColor: COLORS.goldLight },
  sectionTitle: { ...TYPOGRAPHY.section, color: COLORS.textPrimary, marginTop: SIZES.xl, marginBottom: SIZES.md },
  academyPulse: { gap: SIZES.md, padding: SIZES.lg, backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusXl, overflow: 'hidden', ...SHADOWS.small },
  academyPulseCompact: { padding: SIZES.md },
  academyStatusLine: { minHeight: 40, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.sm, paddingBottom: SIZES.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  statusIdentity: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  academyStatusTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700' },
  academyStatusMeta: { color: COLORS.textTertiary, fontSize: 11, lineHeight: 16 },
  summaryGrid: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.md },
  summaryGridCompact: { flexDirection: 'column', gap: SIZES.md },
  summarySection: { flex: 1, width: '100%', minWidth: 0 },
  panelHeader: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SIZES.md, backgroundColor: COLORS.backgroundElevated, borderTopLeftRadius: SIZES.radiusLg, borderTopRightRadius: SIZES.radiusLg, borderWidth: 1, borderBottomWidth: 0, borderColor: COLORS.border },
  panelTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '750' as any },
  summaryPanel: { backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: SIZES.radiusLg, borderBottomRightRadius: SIZES.radiusLg, overflow: 'hidden', ...SHADOWS.small },
  summaryRow: { minHeight: 58, paddingHorizontal: SIZES.md, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  summaryRowLast: { borderBottomWidth: 0 },
  summaryLabel: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontSm },
  summaryValue: { minWidth: 28, textAlign: 'right', fontSize: SIZES.fontLg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.md },
  adminActionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm },
  actionTile: { flexGrow: 1, flexBasis: '47%', minWidth: 280, minHeight: 102, paddingHorizontal: SIZES.lg, paddingVertical: SIZES.md, flexDirection: 'row', alignItems: 'center', gap: SIZES.md, backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusLg, overflow: 'hidden', ...SHADOWS.small },
  actionTileCompact: { flexBasis: '100%', minWidth: 0 },
  actionIcon: { width: 30, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  actionCopy: { flex: 1, minWidth: 0 },
  actionLabel: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700' },
  actionDescription: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 17, marginTop: 3 },
});
