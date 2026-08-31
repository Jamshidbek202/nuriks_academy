import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
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
import { MotionPressableCard, MotionReveal, MotionTouchableOpacity } from '../../src/components/Motion';
import { useAdaptiveLayout } from '../../src/components/AdaptiveLayout';
import { ConcourseAtmosphere, ConcourseGlassLayer, ConcourseTintLayer } from '../../src/components/ConcourseAtmosphere';
import { CalendarShortcut } from '../../src/components/CalendarShortcut';

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

type DailyEvent = {
  id: string;
  kind: 'lesson' | 'support';
  time: string;
  ends_at: string;
  title: string;
  detail: string;
  owner: string;
  location: string;
  status: 'closed' | 'resolved' | 'open' | 'attention' | 'scheduled';
  status_label: string;
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

const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(value || 0))} UZS`;

export default function DashboardHome() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const unreadNotifications = useUnreadNotifications();
  const { isCompact, isExpanded, pagePadding } = useAdaptiveLayout(1440);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState(false);
  const todayLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

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

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.gold} /></View>;

  switch (user?.role) {
    case 'parent': return <ParentHomeScreen />;
    case 'teacher': return <TeacherHomeScreen />;
    case 'support': return <SupportHomeScreen />;
    case 'student': return <StudentHomeScreen />;
    case 'reception': return <ReceptionHomeScreen />;
    case 'super_admin':
    case 'manager': break;
    default: return <View style={styles.container}><Text style={styles.pageTitle}>{t('Welcome')}</Text></View>;
  }

  const staffActions: ActionItem[] = [
    { icon: 'account-school-outline', label: 'Teachers', description: 'Teaching staff and assignments', route: '/(dashboard)/teachers', testID: 'admin-tool-teachers', accent: COLORS.gold },
    { icon: 'badge-account-horizontal-outline', label: user.role === 'super_admin' ? 'Staff Accounts' : 'Support Staff', description: 'Roles, access, and availability', route: '/(dashboard)/staff-management', testID: user.role === 'super_admin' ? 'admin-tool-staff-accounts' : 'admin-tool-support-staff', accent: COLORS.goldLight },
    { icon: 'account-group-outline', label: 'Groups', description: 'Schedules, teachers, and students', route: '/(dashboard)/groups', testID: 'admin-tool-groups', accent: COLORS.success },
    { icon: 'account-convert-outline', label: 'Leads / CRM', description: 'Enquiries and student conversion', route: '/(dashboard)/leads', testID: 'admin-tool-leads-crm', accent: COLORS.warning },
  ];

  const adminActions: ActionItem[] = [
    { icon: 'book-open-variant', label: 'Courses', description: 'Programs and course catalogue', route: '/(dashboard)/courses', testID: 'admin-tool-courses', accent: COLORS.gold },
    { icon: 'tune-variant', label: 'Settings', description: 'Academy and finance settings', route: '/(dashboard)/settings', testID: 'admin-tool-settings', accent: COLORS.goldLight },
    { icon: 'flag-variant-outline', label: 'Feature Flags', description: 'Controlled feature access', route: '/(dashboard)/feature-flags', testID: 'admin-tool-feature-flags', accent: COLORS.warning },
    { icon: 'chart-box-outline', label: 'Analytics', description: 'Operational reports', route: '/(dashboard)/analytics', testID: 'admin-tool-analytics', accent: COLORS.success },
    { icon: 'newspaper-variant-outline', label: 'News', description: 'Academy announcements', route: '/(dashboard)/news', testID: 'admin-tool-news', accent: COLORS.goldLight },
    { icon: 'certificate-outline', label: 'Certificates', description: 'Student certificates', route: '/(dashboard)/certificates', testID: 'admin-tool-certificates', accent: COLORS.gold },
    { icon: 'clipboard-text-clock-outline', label: 'Audit Logs', description: 'Account activity history', route: '/(dashboard)/audit-logs', testID: 'admin-tool-audit-logs', accent: COLORS.warning },
    { icon: 'cloud-upload-outline', label: 'Backups', description: 'System backup controls', route: '/(dashboard)/backups', testID: 'admin-tool-backups', accent: COLORS.success },
  ];

  const events = (stats?.today?.events || []) as DailyEvent[];
  const exceptions = stats?.exceptions || {};
  const attention = [
    { icon: 'alert-circle-outline' as const, label: 'Lessons to resolve', value: exceptions.lesson_resolutions || 0, color: COLORS.warning, route: '/(dashboard)/finance' },
    { icon: 'card-outline' as const, label: 'Transfers to verify', value: exceptions.pending_transfers || 0, color: COLORS.goldLight, route: '/(dashboard)/finance' },
    { icon: 'people-outline' as const, label: 'Students overdue', value: exceptions.overdue_students || 0, color: COLORS.error, route: '/(dashboard)/finance' },
    { icon: 'cash-outline' as const, label: 'Cash days to confirm', value: exceptions.cash_days || 0, color: COLORS.gold, route: '/(dashboard)/finance' },
  ];

  return (
    <View style={styles.container}>
      <ConcourseAtmosphere />
      {dashboardError && (
        <View accessibilityRole="alert" style={styles.notice}>
          <Ionicons name="cloud-offline-outline" size={18} color={COLORS.warning} />
          <Text style={styles.noticeText}>{t('Dashboard data is temporarily unavailable. Pull down to try again.')}</Text>
        </View>
      )}
      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingHorizontal: pagePadding }, isCompact && styles.contentContainerCompact]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadDashboardData(); }} tintColor={COLORS.gold} />}
      >
        <MotionReveal direction="up" distance={7} duration={240}>
          <View style={[styles.pageHeader, isCompact && styles.pageHeaderCompact]}>
            <View style={styles.headerCopy}>
              <Text style={[styles.pageTitle, isCompact && styles.pageTitleCompact]}>{t('Today')}</Text>
              <Text style={styles.pageMeta}>{todayLabel} · {t(roleTranslationKey(user.role))}</Text>
            </View>
            <View style={styles.headerIdentity}>
              {!isCompact && <View style={styles.userCopy}><Text numberOfLines={1} style={styles.userName}>{user.full_name}</Text><Text style={styles.userStatus}>{t('Academy operations')}</Text></View>}
              <CalendarShortcut />
              <MotionTouchableOpacity accessibilityRole="button" accessibilityLabel="Notifications" style={styles.notificationButton} onPress={() => router.push('/(dashboard)/notifications')}>
                <Ionicons name="notifications-outline" size={21} color={COLORS.textPrimary} />
                {unreadNotifications > 0 && <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{Math.min(unreadNotifications, 99)}</Text></View>}
              </MotionTouchableOpacity>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.liveRibbon}>
            <RibbonMetric icon="calendar-outline" label={t('Lessons today')} value={stats?.today?.lessons || 0} color={COLORS.goldLight} />
            <RibbonMetric icon="headset-outline" label={t('Support bookings')} value={stats?.today?.support_bookings || 0} color={COLORS.gold} />
            <RibbonMetric icon="people-outline" label={t('Active students')} value={stats?.students?.active || 0} color={COLORS.success} />
            <RibbonMetric icon="pause-circle-outline" label={t('Frozen')} value={stats?.students?.frozen || 0} color={COLORS.warning} />
          </ScrollView>
        </MotionReveal>

        <MotionReveal direction="up" distance={9} delay={55} duration={280}>
          <View style={[styles.workspace, !isExpanded && styles.workspaceStacked]}>
            <View style={[styles.dayLane, !isExpanded && styles.workspaceSectionStacked]}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>{t('Day lane')}</Text>
                  <Text style={styles.sectionDescription}>{t('Lessons and support sessions in academy time')}</Text>
                </View>
                <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.livePillText}>{t('Live')}</Text></View>
              </View>
              <View style={[styles.scheduleSurface, events.length === 1 && !isCompact && styles.scheduleSurfaceSingle, isCompact && styles.scheduleSurfaceCompact]}>
                <ConcourseGlassLayer tone="brand" intensity={34} />
                {events.length > 0 ? events.map((event, index) => (
                  <ScheduleRow
                    key={event.id}
                    event={event}
                    last={index === events.length - 1}
                    onPress={event.kind === 'lesson' ? () => router.push('/(dashboard)/groups') : undefined}
                  />
                )) : (
                  <View style={[styles.emptySchedule, isCompact && styles.emptyScheduleCompact]}>
                    <View style={styles.emptyScheduleIcon}><Ionicons name="calendar-clear-outline" size={27} color={COLORS.goldLight} /></View>
                    <Text style={styles.emptyScheduleTitle}>{t('No scheduled sessions today')}</Text>
                    <Text style={styles.emptyScheduleText}>{t('New lessons and support bookings will appear here automatically.')}</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={[styles.inspector, !isExpanded && styles.workspaceSectionStacked]}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>{t('Needs attention')}</Text>
                  <Text style={styles.sectionDescription}>{t('Open work, ordered for action')}</Text>
                </View>
              </View>
              <View style={styles.attentionSurface}>
                <ConcourseGlassLayer intensity={30} />
                {attention.map((item, index) => (
                  <AttentionRow key={item.label} {...item} last={index === attention.length - 1} onPress={() => router.push(item.route as any)} />
                ))}
              </View>
              <View style={styles.moneyPulse}>
                <ConcourseGlassLayer tone="brand" intensity={30} />
                <View style={styles.moneyPulseTop}><Text style={styles.moneyPulseTitle}>{t('Money today')}</Text><Ionicons name="pulse-outline" size={18} color={COLORS.success} /></View>
                <PulseMoney label={t('Cash received')} value={stats?.financial_ledger?.cash_received_uzs || 0} color={COLORS.gold} />
                <PulseMoney label={t('Verified transfers')} value={stats?.financial_ledger?.verified_transfers_uzs || 0} color={COLORS.goldLight} />
              </View>
            </View>
          </View>

          <View style={styles.operationsHeader}>
            <Text style={styles.sectionTitle}>{t('Core operations')}</Text>
            <Text style={styles.sectionDescription}>{t('Move directly into the academy workflow')}</Text>
          </View>
          <View style={[styles.actionRail, isCompact && styles.actionRailCompact]}>
            {staffActions.map((item) => <OperationLink key={item.label} item={item} compact={isCompact} translate={t} onPress={() => router.push(item.route as any)} />)}
          </View>

          {user.role === 'super_admin' && (
            <View style={styles.toolCatalogue}>
              <View style={styles.catalogueHeading}>
                <View><Text style={styles.sectionTitle}>{t('Academy tools')}</Text><Text style={styles.sectionDescription}>{t('Configuration, reporting, and governance')}</Text></View>
                <MaterialCommunityIcons name="view-grid-outline" size={20} color={COLORS.textTertiary} />
              </View>
              <View style={styles.catalogueRows}>
                {adminActions.map((item, index) => (
                  <CatalogueLink key={item.label} item={item} compact={isCompact} last={index === adminActions.length - 1} translate={t} onPress={() => router.push(item.route as any)} />
                ))}
              </View>
            </View>
          )}
        </MotionReveal>
      </ScrollView>
    </View>
  );
}

function RibbonMetric({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; color: string }) {
  return <View style={styles.ribbonMetric}><ConcourseTintLayer tone={color === COLORS.success ? 'neutral' : 'gold'} /><View style={[styles.ribbonIcon, { backgroundColor: `${color}17` }]}><Ionicons name={icon} size={18} color={color} /></View><Text style={styles.ribbonValue}>{value}</Text><Text style={styles.ribbonLabel}>{label}</Text></View>;
}

function ScheduleRow({ event, last, onPress }: { event: DailyEvent; last: boolean; onPress?: () => void }) {
  const color = event.status === 'open' ? COLORS.success : event.status === 'attention' ? COLORS.warning : event.status === 'closed' ? COLORS.textTertiary : COLORS.goldLight;
  return (
    <MotionPressableCard accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} hoverLift={onPress ? 2 : 0} hoverOverlayColor={onPress ? 'rgba(241,217,139,0.035)' : 'transparent'} style={[styles.scheduleRow, last && styles.rowLast]} onPress={onPress}>
      <View style={styles.scheduleTime}><Text style={styles.scheduleTimeText}>{event.time}</Text><Text style={styles.scheduleEndText}>{event.ends_at}</Text></View>
      <View style={[styles.scheduleTrack, { backgroundColor: color }]} />
      <View style={styles.scheduleCopy}><Text numberOfLines={1} style={styles.scheduleTitle}>{event.title}</Text><Text numberOfLines={1} style={styles.scheduleMeta}>{event.owner} · {event.location}</Text></View>
      <View style={styles.scheduleSide}><Text style={[styles.scheduleStatus, { color }]}>{event.status_label}</Text><Text style={styles.scheduleDetail}>{event.detail}</Text></View>
    </MotionPressableCard>
  );
}

function AttentionRow({ icon, label, value, color, last, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; color: string; last: boolean; onPress: () => void }) {
  return (
    <MotionPressableCard accessibilityRole="button" hoverLift={2} hoverOverlayColor="rgba(241,217,139,0.035)" style={[styles.attentionRow, last && styles.rowLast]} onPress={onPress}>
      <View style={[styles.attentionIcon, { backgroundColor: `${color}15` }]}><Ionicons name={icon} size={19} color={color} /></View>
      <Text style={styles.attentionLabel}>{label}</Text>
      <Text style={[styles.attentionValue, { color: value > 0 ? color : COLORS.textTertiary }]}>{value}</Text>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} />
    </MotionPressableCard>
  );
}

function PulseMoney({ label, value, color }: { label: string; value: number; color: string }) {
  return <View style={styles.pulseMoneyRow}><View style={[styles.pulseMoneyDot, { backgroundColor: color }]} /><Text style={styles.pulseMoneyLabel}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={styles.pulseMoneyValue}>{money(value)}</Text></View>;
}

function OperationLink({ item, onPress, compact, translate }: { item: ActionItem; onPress: () => void; compact: boolean; translate: (value: string) => string }) {
  return (
    <MotionPressableCard testID={item.testID} accessibilityRole="button" accessibilityLabel={translate(item.label)} hoverLift={3} hoverOverlayColor="rgba(241,217,139,0.045)" style={[styles.operationLink, compact && styles.operationLinkCompact]} onPress={onPress}>
      <LinearGradient pointerEvents="none" colors={[`${item.accent}16`, 'rgba(17,23,29,0.02)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.operationIcon, { backgroundColor: `${item.accent}16` }]}><MaterialCommunityIcons name={item.icon} size={22} color={item.accent} /></View>
      <View style={styles.operationCopy}><Text style={styles.operationLabel}>{translate(item.label)}</Text><Text numberOfLines={1} style={styles.operationDescription}>{translate(item.description)}</Text></View>
      <Ionicons name="arrow-forward" size={18} color={COLORS.textTertiary} />
    </MotionPressableCard>
  );
}

function CatalogueLink({ item, onPress, translate, last, compact }: { item: ActionItem; onPress: () => void; translate: (value: string) => string; last: boolean; compact: boolean }) {
  return (
    <MotionPressableCard testID={item.testID} accessibilityRole="button" accessibilityLabel={translate(item.label)} hoverLift={2} hoverOverlayColor="rgba(241,217,139,0.035)" style={[styles.catalogueLink, compact && styles.catalogueLinkCompact, last && styles.rowLast]} onPress={onPress}>
      <MaterialCommunityIcons name={item.icon} size={19} color={item.accent} />
      <Text style={styles.catalogueLabel}>{translate(item.label)}</Text>
      <Text numberOfLines={1} style={styles.catalogueDescription}>{translate(item.description)}</Text>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} />
    </MotionPressableCard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  notice: { minHeight: 48, paddingHorizontal: SIZES.lg, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, backgroundColor: `${COLORS.warning}12`, borderBottomWidth: 1, borderBottomColor: `${COLORS.warning}45` },
  noticeText: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.fontXs },
  content: { flex: 1 },
  contentContainer: { width: '100%', maxWidth: 1440, alignSelf: 'center', paddingTop: SIZES.headerTop, paddingBottom: 116 },
  contentContainerCompact: { paddingTop: Math.max(SIZES.headerTop, 28) },
  pageHeader: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.lg, marginBottom: SIZES.md },
  pageHeaderCompact: { minHeight: 58, marginBottom: SIZES.sm },
  headerCopy: { flex: 1, minWidth: 0 },
  pageTitle: { ...TYPOGRAPHY.display, color: COLORS.textPrimary, fontSize: 38, lineHeight: 44, letterSpacing: -1.15 },
  pageTitleCompact: { fontSize: 30, lineHeight: 36 },
  pageMeta: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, lineHeight: 20, marginTop: 3, textTransform: 'capitalize' },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  userCopy: { alignItems: 'flex-end' },
  userName: { maxWidth: 220, color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '750' as any },
  userStatus: { color: COLORS.textTertiary, fontSize: 11, marginTop: 2 },
  notificationButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassHighlight, ...SHADOWS.small },
  unreadBadge: { position: 'absolute', top: 4, right: 4, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center' },
  unreadBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', fontVariant: ['tabular-nums'] },
  liveRibbon: { minHeight: 76, flexDirection: 'row', alignItems: 'stretch', gap: SIZES.sm, paddingVertical: SIZES.sm },
  ribbonMetric: { minWidth: 190, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: SIZES.md, borderRadius: 20, backgroundColor: 'rgba(15,22,29,0.46)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', ...SHADOWS.small },
  ribbonIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  ribbonValue: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '850' as any, fontVariant: ['tabular-nums'] },
  ribbonLabel: { flex: 1, color: COLORS.textSecondary, fontSize: 12, lineHeight: 16 },
  workspace: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.lg, marginTop: SIZES.lg },
  workspaceStacked: { flexDirection: 'column' },
  workspaceSectionStacked: { flex: 0, flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  dayLane: { flex: 1.75, width: '100%', minWidth: 0 },
  inspector: { flex: 0.9, width: '100%', minWidth: 0 },
  sectionHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.md, marginBottom: SIZES.sm },
  sectionTitle: { ...TYPOGRAPHY.section, color: COLORS.textPrimary, fontSize: 18, lineHeight: 24 },
  sectionDescription: { color: COLORS.textTertiary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  livePill: { height: 34, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 17, backgroundColor: `${COLORS.success}12`, borderWidth: 1, borderColor: `${COLORS.success}38` },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  livePillText: { color: COLORS.success, fontSize: 11, fontWeight: '750' as any },
  scheduleSurface: { minHeight: 330, borderRadius: 26, backgroundColor: 'rgba(13,19,26,0.36)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', overflow: 'hidden', ...SHADOWS.medium },
  scheduleSurfaceSingle: { minHeight: 84 },
  scheduleSurfaceCompact: { minHeight: 0, borderRadius: 22 },
  scheduleRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: SIZES.md, paddingHorizontal: SIZES.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  rowLast: { borderBottomWidth: 0 },
  scheduleTime: { width: 52 },
  scheduleTimeText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  scheduleEndText: { color: COLORS.textTertiary, fontSize: 10, marginTop: 2, fontVariant: ['tabular-nums'] },
  scheduleTrack: { width: 3, height: 42, borderRadius: 3 },
  scheduleCopy: { flex: 1, minWidth: 0 },
  scheduleTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '750' as any },
  scheduleMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4 },
  scheduleSide: { maxWidth: 145, alignItems: 'flex-end' },
  scheduleStatus: { fontSize: 11, fontWeight: '750' as any },
  scheduleDetail: { color: COLORS.textTertiary, fontSize: 10, marginTop: 4 },
  emptySchedule: { minHeight: 328, alignItems: 'center', justifyContent: 'center', padding: SIZES.xl },
  emptyScheduleCompact: { minHeight: 220, padding: SIZES.lg },
  emptyScheduleIcon: { width: 58, height: 58, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.gold}14`, marginBottom: SIZES.md },
  emptyScheduleTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '750' as any, textAlign: 'center' },
  emptyScheduleText: { maxWidth: 340, color: COLORS.textTertiary, fontSize: SIZES.fontXs, lineHeight: 18, textAlign: 'center', marginTop: SIZES.xs },
  attentionSurface: { borderRadius: 24, backgroundColor: 'rgba(13,19,25,0.38)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', overflow: 'hidden', ...SHADOWS.small },
  attentionRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  attentionIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  attentionLabel: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 17 },
  attentionValue: { minWidth: 28, textAlign: 'right', fontSize: SIZES.fontLg, fontWeight: '850' as any, fontVariant: ['tabular-nums'] },
  moneyPulse: { marginTop: SIZES.md, padding: SIZES.md, borderRadius: 24, backgroundColor: 'rgba(24,21,14,0.38)', borderWidth: 1, borderColor: 'rgba(241,217,139,0.22)', overflow: 'hidden', ...SHADOWS.small },
  moneyPulseTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SIZES.sm },
  moneyPulseTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '750' as any },
  pulseMoneyRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  pulseMoneyDot: { width: 7, height: 7, borderRadius: 4 },
  pulseMoneyLabel: { flex: 1, color: COLORS.textSecondary, fontSize: 11 },
  pulseMoneyValue: { maxWidth: '52%', color: COLORS.textPrimary, fontSize: SIZES.fontXs, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] },
  operationsHeader: { marginTop: SIZES.xl, marginBottom: SIZES.sm },
  actionRail: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm },
  actionRailCompact: { flexDirection: 'column' },
  operationLink: { flexGrow: 1, flexBasis: 260, minWidth: 230, minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: SIZES.md, paddingHorizontal: SIZES.md, borderRadius: 22, backgroundColor: 'rgba(14,20,27,0.50)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', ...SHADOWS.small },
  operationLinkCompact: { width: '100%', minWidth: 0, minHeight: 78, flexBasis: 'auto', flexGrow: 0 },
  operationIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  operationCopy: { flex: 1, minWidth: 0 },
  operationLabel: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '750' as any },
  operationDescription: { color: COLORS.textTertiary, fontSize: 11, marginTop: 3 },
  toolCatalogue: { marginTop: SIZES.xl, borderRadius: 26, backgroundColor: COLORS.backgroundSubtle, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  catalogueHeading: { minHeight: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.md, paddingHorizontal: SIZES.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  catalogueRows: { flexDirection: 'row', flexWrap: 'wrap' },
  catalogueLink: { width: '50%', minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  catalogueLinkCompact: { width: '100%', paddingHorizontal: SIZES.md, borderRightWidth: 0 },
  catalogueLabel: { minWidth: 94, color: COLORS.textPrimary, fontSize: SIZES.fontXs, fontWeight: '700' },
  catalogueDescription: { flex: 1, color: COLORS.textTertiary, fontSize: 11 },
});
