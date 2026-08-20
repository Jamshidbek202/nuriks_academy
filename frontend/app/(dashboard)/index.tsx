import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
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
import { MotionTouchableOpacity } from '../../src/components/Motion';
import { MOTION, useMotionPreference } from '../../src/contexts/MotionContext';

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
  const { reduceMotion, ready: motionReady } = useMotionPreference();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState(false);
  const canAnimateFromMount = useRef(motionReady && !reduceMotion);
  const initialMotionValue = motionReady && !reduceMotion ? 0.74 : 1;
  const heroProgress = useRef(new Animated.Value(initialMotionValue)).current;
  const statusProgress = useRef(new Animated.Value(initialMotionValue)).current;
  const toolsProgress = useRef(new Animated.Value(initialMotionValue)).current;
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
    [heroProgress, statusProgress, toolsProgress].forEach((progress) => progress.stopAnimation());
    if (!motionReady || reduceMotion || !canAnimateFromMount.current) {
      heroProgress.setValue(1);
      statusProgress.setValue(1);
      toolsProgress.setValue(1);
      canAnimateFromMount.current = motionReady && !reduceMotion;
      return;
    }
    heroProgress.setValue(0.74);
    statusProgress.setValue(0.74);
    toolsProgress.setValue(0.74);
    Animated.stagger(45, [heroProgress, statusProgress, toolsProgress].map((progress) => Animated.timing(progress, {
        toValue: 1,
        duration: MOTION.navigation,
        easing: Easing.bezier(...MOTION.easing.enter),
        useNativeDriver: true,
    }))).start();
    return () => [heroProgress, statusProgress, toolsProgress].forEach((progress) => progress.stopAnimation());
  }, [heroProgress, motionReady, reduceMotion, statusProgress, toolsProgress]);

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
          <View style={[styles.todayHero, isCompact && styles.todayHeroCompact]}>
            <LinearGradient
              pointerEvents="none"
              colors={['#1B1E16', '#15180F', '#26200F']}
              locations={[0, 0.58, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.heroTopRow, isCompact && styles.heroTopRowCompact]}>
              <View style={styles.headerIdentity}>
                <Image source={require('../../assets/images/logo.png')} style={[styles.logo, isCompact && styles.logoCompact]} resizeMode="contain" accessibilityLabel="Nurik's Academy logo" />
                <View style={styles.headerCopy}>
                  <Text style={styles.welcome}>{t('Today at Nurik\'s')}</Text>
                  <Text numberOfLines={1} style={styles.title}>{user.full_name}</Text>
                  <Text style={styles.subtitle}>{todayLabel} · {t(roleTranslationKey(user.role))}</Text>
                </View>
              </View>
              <MotionTouchableOpacity accessibilityRole="button" accessibilityLabel="Notifications" style={styles.notificationButton} onPress={() => router.push('/(dashboard)/notifications')}>
                <Ionicons name="notifications-outline" size={21} color={COLORS.textPrimary} />
                {unreadNotifications > 0 && <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{Math.min(unreadNotifications, 99)}</Text></View>}
              </MotionTouchableOpacity>
            </View>
            <View style={[styles.heroMetrics, isCompact && styles.heroMetricsCompact]}>
              <View style={[styles.todayLead, isCompact && styles.todayLeadCompact]}>
                <View pointerEvents="none" style={[styles.lessonIcon, isCompact && styles.lessonIconCompact]}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={isCompact ? 22 : 28} color={COLORS.goldLight} />
                </View>
                <View style={styles.todayLeadCopy}>
                  <Text style={styles.todayLeadLabel}>{t('Lessons Today')}</Text>
                  <Text style={[styles.todayLeadValue, isCompact && styles.todayLeadValueCompact]}>{stats?.today?.lessons || 0}</Text>
                  {!isCompact && <Text style={styles.todayLeadHint}>{t('Scheduled academy sessions')}</Text>}
                </View>
              </View>
              {isCompact ? (
                <View style={styles.mobileGlanceGrid}>
                  <MobileHeroStat icon="clock-outline" label={t('Bookings')} value={stats?.today?.support_bookings || 0} tone={COLORS.info} />
                  <MobileHeroStat icon="account-multiple-outline" label={t('Students')} value={stats?.students?.total || 0} tone={COLORS.goldLight} />
                  <MobileHeroStat icon="check-decagram-outline" label={t('Active')} value={stats?.students?.active || 0} tone={COLORS.success} />
                </View>
              ) : (
                <View style={styles.todayRegister}>
                  <Text style={styles.todayRegisterTitle}>{t('At a glance')}</Text>
                  <TodayRow icon="clock-outline" label={t('Support Bookings')} value={stats?.today?.support_bookings || 0} tone={COLORS.info} />
                  <TodayRow icon="account-multiple-outline" label={t('Current Students')} value={stats?.students?.total || 0} tone={COLORS.goldLight} />
                  <TodayRow icon="check-decagram-outline" label={t('Active Students')} value={stats?.students?.active || 0} tone={COLORS.success} last />
                </View>
              )}
            </View>
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: statusProgress, transform: [{ translateY: statusProgress.interpolate({ inputRange: [0, 1], outputRange: [9, 0] }) }] }}>
          <SectionHeader title={t('Academy status')} />
          <View style={[styles.academyPulse, isCompact && styles.academyPulseCompact]}>
            <View style={styles.academyStatusLine}>
              <View style={styles.statusIdentity}>
                <View style={styles.liveStatusDot} />
                <Text style={styles.academyStatusTitle}>{t('Live academy snapshot')}</Text>
              </View>
              <Text style={styles.academyStatusMeta}>{t('The operational view refreshes automatically.')}</Text>
            </View>
            {isCompact ? (
              <View style={styles.mobileSnapshotGrid}>
                <MobileSnapshot label={t('Teachers')} value={stats?.teachers || 0} tone={COLORS.gold} />
                <MobileSnapshot label={t('Support')} value={stats?.support_staff || 0} tone={COLORS.info} />
                <MobileSnapshot label={t('Frozen')} value={stats?.students?.frozen || 0} tone={COLORS.warning} />
                <MobileSnapshot label={t('Graduated')} value={stats?.students?.graduated || 0} tone={COLORS.success} />
                <MobileSnapshot label={t('Archived')} value={stats?.students?.archived || 0} tone={COLORS.textSecondary} wide />
              </View>
            ) : (
              <View style={styles.summaryGrid}>
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
            )}
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

function MobileHeroStat({ icon, label, value, tone }: { icon: IconName; label: string; value: number; tone: string }) {
  return (
    <View style={styles.mobileHeroStat}>
      <MaterialCommunityIcons name={icon} size={18} color={tone} />
      <Text style={styles.mobileHeroStatLabel}>{label}</Text>
      <Text style={[styles.mobileHeroStatValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

function MobileSnapshot({ label, value, tone, wide = false }: { label: string; value: number; tone: string; wide?: boolean }) {
  return (
    <View style={[styles.mobileSnapshot, wide && styles.mobileSnapshotWide]}>
      <View style={[styles.mobileSnapshotDot, { backgroundColor: tone }]} />
      <Text style={styles.mobileSnapshotLabel}>{label}</Text>
      <Text style={[styles.mobileSnapshotValue, { color: tone }]}>{value}</Text>
    </View>
  );
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
    <MotionTouchableOpacity
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
    </MotionTouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  header: { paddingTop: SIZES.headerTop, paddingHorizontal: SIZES.lg },
  headerCompact: { paddingHorizontal: SIZES.md },
  headerIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: SIZES.md },
  logo: { width: 46, height: 46, flexShrink: 0 },
  logoCompact: { width: 38, height: 38 },
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
  todayHero: { minHeight: 330, borderRadius: SIZES.radiusXl, borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.backgroundElevated, padding: SIZES.lg, overflow: 'hidden', ...SHADOWS.medium },
  todayHeroCompact: { minHeight: 0, borderRadius: SIZES.radiusLg, padding: SIZES.md },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.md, paddingBottom: SIZES.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.glassHighlight },
  heroTopRowCompact: { paddingBottom: SIZES.md },
  heroMetrics: { flexDirection: 'row', alignItems: 'stretch', gap: SIZES.md, marginTop: SIZES.lg },
  heroMetricsCompact: { flexDirection: 'column', gap: 10, marginTop: SIZES.xs },
  todayLead: { position: 'relative', flex: 0.9, minWidth: 260, minHeight: 184, flexDirection: 'row', alignItems: 'center', gap: SIZES.lg, padding: SIZES.lg, backgroundColor: COLORS.goldGlass, borderWidth: 1, borderColor: COLORS.goldHairline, borderRadius: SIZES.radiusLg, overflow: 'hidden' },
  todayLeadCompact: { minWidth: 0, minHeight: 94, flex: 0, gap: SIZES.md, padding: SIZES.md, borderRadius: SIZES.radiusMd },
  lessonIcon: { width: 76, height: 76, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: SIZES.radiusLg, backgroundColor: COLORS.goldGlass, borderWidth: 1, borderColor: COLORS.goldHairline },
  lessonIconCompact: { width: 54, height: 54, borderRadius: SIZES.radiusMd },
  todayLeadCopy: { flex: 1, minWidth: 0 },
  todayLeadLabel: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700' },
  todayLeadValue: { color: COLORS.goldLight, fontSize: 48, lineHeight: 52, fontWeight: '850' as any, fontVariant: ['tabular-nums'] },
  todayLeadValueCompact: { fontSize: 34, lineHeight: 38 },
  todayLeadHint: { color: COLORS.textTertiary, fontSize: 11, lineHeight: 16, marginTop: SIZES.xs },
  todayRegister: { flex: 1.3, minWidth: 280, minHeight: 176, backgroundColor: 'rgba(7,8,6,0.64)', borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusLg, overflow: 'hidden' },
  todayRegisterTitle: { minHeight: 44, paddingHorizontal: SIZES.md, textAlignVertical: 'center', color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '750' as any, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  todayRow: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  todayRowLast: { borderBottomWidth: 0 },
  todayRowLabel: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.fontSm },
  todayRowValue: { minWidth: 34, textAlign: 'right', fontSize: SIZES.fontLg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  mobileGlanceGrid: { flexDirection: 'row', gap: SIZES.sm },
  mobileHeroStat: { flex: 1, minWidth: 0, minHeight: 72, justifyContent: 'space-between', padding: SIZES.sm, borderRadius: SIZES.radiusSm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: 'rgba(7,8,6,0.60)' },
  mobileHeroStatLabel: { color: COLORS.textTertiary, fontSize: 10, lineHeight: 13, fontWeight: '700' },
  mobileHeroStatValue: { fontSize: 18, lineHeight: 22, fontWeight: '850' as any, fontVariant: ['tabular-nums'] },
  sectionTitle: { ...TYPOGRAPHY.section, color: COLORS.textPrimary, marginTop: SIZES.xl, marginBottom: SIZES.md },
  academyPulse: { gap: SIZES.md, padding: SIZES.lg, backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusXl, overflow: 'hidden', ...SHADOWS.small },
  academyPulseCompact: { padding: SIZES.md },
  academyStatusLine: { minHeight: 40, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.sm, paddingBottom: SIZES.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  statusIdentity: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  liveStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  academyStatusTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700' },
  academyStatusMeta: { color: COLORS.textTertiary, fontSize: 11, lineHeight: 16 },
  summaryGrid: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.md },
  summaryGridCompact: { flexDirection: 'column', gap: SIZES.md },
  mobileSnapshotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm },
  mobileSnapshot: { width: '48%', flexGrow: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, borderRadius: SIZES.radiusSm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundLight },
  mobileSnapshotWide: { width: '100%' },
  mobileSnapshotDot: { width: 6, height: 6, borderRadius: 3 },
  mobileSnapshotLabel: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.fontXs },
  mobileSnapshotValue: { minWidth: 20, textAlign: 'right', fontSize: SIZES.fontMd, fontWeight: '800', fontVariant: ['tabular-nums'] },
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
  actionTile: { position: 'relative', flexGrow: 1, flexBasis: '47%', minWidth: 280, minHeight: 110, paddingHorizontal: SIZES.lg, paddingVertical: SIZES.md, flexDirection: 'row', alignItems: 'center', gap: SIZES.md, backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusLg, overflow: 'hidden', ...SHADOWS.small },
  actionTileCompact: { flexBasis: '100%', minWidth: 0, minHeight: 86, paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, borderRadius: SIZES.radiusMd },
  actionIcon: { width: 42, height: 42, borderRadius: SIZES.radiusSm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border },
  actionCopy: { flex: 1, minWidth: 0 },
  actionLabel: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700' },
  actionDescription: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 17, marginTop: 3 },
});
