import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { COLORS, SIZES, TYPOGRAPHY } from '../../src/constants/theme';
import { getActiveLocale } from '../../src/i18n/translations';
import { useUnreadNotifications } from '../../src/hooks/use-unread-notifications';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';
import { useLanguage } from '../../src/contexts/LanguageContext';

import ParentHomeScreen from './parent-home';
import TeacherHomeScreen from './teacher-home';
import SupportHomeScreen from './support-home';
import StudentHomeScreen from './student-home';
import ReceptionHomeScreen from './reception-home';

type Tone = 'gold' | 'success' | 'warning' | 'error' | 'info' | 'muted';

type DailyEvent = {
  id: string;
  kind: 'lesson' | 'support';
  time: string;
  ends_at: string;
  title: string;
  detail: string;
  owner: string;
  location: string;
  status: 'open' | 'scheduled' | 'attention' | 'resolved' | 'closed';
  status_label: string;
  student_count?: number;
};

const toneColor: Record<Tone, string> = {
  gold: COLORS.gold,
  success: COLORS.success,
  warning: COLORS.warning,
  error: COLORS.error,
  info: COLORS.info,
  muted: COLORS.textTertiary,
};

const eventTone: Record<DailyEvent['status'], Tone> = {
  open: 'success',
  scheduled: 'gold',
  attention: 'error',
  resolved: 'muted',
  closed: 'warning',
};

const academyDate = () => new Intl.DateTimeFormat(getActiveLocale(), {
  timeZone: 'Asia/Tashkent',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}).format(new Date());

const roleName = (role?: string) => String(role || '').replaceAll('_', ' ');
const uzs = (value = 0) => `${new Intl.NumberFormat('ru-RU').format(value)} UZS`;

export default function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  const unreadNotifications = useUnreadNotifications();
  const { width } = useWindowDimensions();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState(false);
  const isWide = width >= 1080;
  const isPhone = width < 620;
  const dateLabel = useMemo(academyDate, []);

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
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Welcome</Text>
            <Text style={styles.pageSubtitle}>{user?.full_name || 'Nurik\'s Academy'}</Text>
          </View>
        </View>
      );
  }

  const operations = [
    { icon: 'school-outline', label: 'Teachers', detail: 'Teaching staff and assignments', route: '/(dashboard)/teachers' },
    { icon: 'people-outline', label: user.role === 'super_admin' ? 'Staff Accounts' : 'Support staff', detail: 'Roles, access, and availability', route: '/(dashboard)/staff-management' },
    { icon: 'people-circle-outline', label: 'Groups', detail: 'Schedules, teachers, and students', route: '/(dashboard)/groups' },
    { icon: 'funnel-outline', label: 'Leads / CRM', detail: 'New enquiries and conversion', route: '/(dashboard)/leads' },
  ];

  const systemTools = [
    { icon: 'library-outline', label: 'Courses', route: '/(dashboard)/courses' },
    { icon: 'settings-outline', label: 'Settings', route: '/(dashboard)/settings' },
    { icon: 'toggle-outline', label: 'Feature Flags', route: '/(dashboard)/feature-flags' },
    { icon: 'analytics-outline', label: 'Analytics', route: '/(dashboard)/analytics' },
    { icon: 'newspaper-outline', label: 'News', route: '/(dashboard)/news' },
    { icon: 'ribbon-outline', label: 'Certificates', route: '/(dashboard)/certificates' },
    { icon: 'document-text-outline', label: 'Audit Logs', route: '/(dashboard)/audit-logs' },
    { icon: 'cloud-upload-outline', label: 'Backups', route: '/(dashboard)/backups' },
  ];

  const events: DailyEvent[] = stats?.today?.events || [];
  const exceptions: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    detail: string;
    value: number;
    tone: Tone;
    route: string;
  }[] = [
    {
      icon: 'alert-circle-outline',
      label: 'Lesson records to resolve',
      detail: 'Attendance or lesson outcome is incomplete',
      value: stats?.exceptions?.lesson_resolutions || 0,
      tone: 'warning' as Tone,
      route: '/(dashboard)/finance',
    },
    {
      icon: 'swap-horizontal-outline',
      label: 'Transfers awaiting review',
      detail: uzs(stats?.exceptions?.pending_transfer_uzs || 0),
      value: stats?.exceptions?.pending_transfers || 0,
      tone: 'info' as Tone,
      route: '/(dashboard)/finance',
    },
    {
      icon: 'person-remove-outline',
      label: 'Overdue students',
      detail: uzs(stats?.exceptions?.overdue_uzs || 0),
      value: stats?.exceptions?.overdue_students || 0,
      tone: 'error' as Tone,
      route: '/(dashboard)/finance',
    },
    {
      icon: 'cash-outline',
      label: 'Cash days to confirm',
      detail: 'Physical count and manager confirmation',
      value: stats?.exceptions?.cash_days || 0,
      tone: 'gold' as Tone,
      route: '/(dashboard)/finance',
    },
  ];
  const exceptionTotal = exceptions.reduce((total, item) => total + item.value, 0);

  return (
    <View style={styles.container}>
      <View style={[styles.pageHeader, isPhone && styles.pageHeaderPhone]}>
        <View style={isPhone ? styles.pageHeaderCopyPhone : styles.pageHeaderCopy}>
          <Text maxFontSizeMultiplier={1.2} style={styles.pageTitle}>{dateLabel}</Text>
          <Text maxFontSizeMultiplier={1.25} style={styles.pageSubtitle}>Academy open 08:30–20:00 · Asia/Tashkent</Text>
        </View>
        <View style={[styles.headerActions, isPhone && styles.headerActionsPhone]}>
          {!isPhone && (
            <View style={styles.identityCopy}>
              <Text style={styles.identityName}>{user.full_name}</Text>
              <Text style={styles.identityRole}>{roleName(user.role)}</Text>
            </View>
          )}
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
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Record payment"
            style={[styles.primaryAction, isPhone && styles.primaryActionPhone]}
            onPress={() => router.push('/(dashboard)/finance')}
          >
            <Ionicons name="add" size={21} color={COLORS.textOnGold} />
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} maxFontSizeMultiplier={1.3} style={styles.primaryActionText}>Record payment</Text>
          </TouchableOpacity>
        </View>
      </View>

      {dashboardError && (
        <View accessibilityRole="alert" style={styles.dashboardNotice}>
          <Ionicons name="cloud-offline-outline" size={18} color={COLORS.warning} />
          <Text style={styles.dashboardNoticeText}>Dashboard data is temporarily unavailable. Pull down to try again.</Text>
        </View>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, !isWide && styles.contentContainerCompact]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadDashboardData(); }} tintColor={COLORS.gold} />}
      >
        <View style={[styles.workspace, !isWide && styles.workspaceCompact]}>
          <View style={isWide ? styles.scheduleColumn : styles.scheduleColumnCompact}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Scheduled work</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" style={styles.textAction} onPress={() => router.push('/(dashboard)/groups')}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} maxFontSizeMultiplier={1.3} style={styles.textActionLabel}>Open groups</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.gold} />
              </TouchableOpacity>
            </View>
            <View style={styles.scheduleRegister}>
              {isWide && (
                <View style={styles.registerHeader}>
                  <Text style={[styles.columnLabel, styles.timeColumn]}>TIME</Text>
                  <Text style={[styles.columnLabel, styles.eventColumn]}>EVENT</Text>
                  <Text style={[styles.columnLabel, styles.ownerColumn]}>OWNER</Text>
                  <Text style={[styles.columnLabel, styles.locationColumn]}>LOCATION</Text>
                  <Text style={[styles.columnLabel, styles.statusColumn]}>STATUS</Text>
                </View>
              )}
              {events.length === 0 ? (
                <View style={styles.emptyRegister}>
                  <Ionicons name="calendar-clear-outline" size={27} color={COLORS.textTertiary} />
                  <View style={styles.flex}>
                    <Text style={styles.emptyTitle}>No work scheduled for today</Text>
                    <Text style={styles.emptyDetail}>New group lessons and support bookings will appear here automatically.</Text>
                  </View>
                </View>
              ) : events.map((event, index) => (
                <ScheduleRow key={`${event.kind}-${event.id}`} event={event} wide={isWide} first={index === 0} last={index === events.length - 1} />
              ))}
            </View>
            <View style={styles.scheduleCloseRow}>
              <Text style={styles.closeTime}>20:00</Text>
              <View style={styles.closeMarker} />
              <Text style={styles.closeLabel}>Academy closes</Text>
              <Text style={styles.closeDetail}>End of working day</Text>
            </View>
          </View>

          <View style={styles.exceptionColumn}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Exceptions</Text>
              </View>
              <View style={[styles.queueCount, { backgroundColor: (exceptionTotal > 0 ? COLORS.error : COLORS.success) + '24' }]}>
                <Text maxFontSizeMultiplier={1.2} style={[styles.queueCountText, { color: exceptionTotal > 0 ? COLORS.error : COLORS.success }]}>{exceptionTotal}</Text>
              </View>
            </View>
            <View style={styles.exceptionList}>
              {exceptions.map((item) => (
                <ExceptionRow key={item.label} {...item} onPress={() => router.push(item.route as any)} />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.financialLedger}>
          <View style={styles.financialHeader}>
            <View>
              <Text style={styles.financialTitle}>Today&apos;s financial ledger</Text>
              <Text style={styles.financialHint}>Posted records only · updates live</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" style={styles.textAction} onPress={() => router.push('/(dashboard)/finance')}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} maxFontSizeMultiplier={1.3} style={styles.textActionLabel}>Reconcile cash</Text>
              <Ionicons name="arrow-forward" size={16} color={COLORS.gold} />
            </TouchableOpacity>
          </View>
          <View style={styles.financeValues}>
            <FinanceValue label="Cash received" value={stats?.financial_ledger?.cash_received_uzs || 0} />
            <FinanceValue label="Verified transfers" value={stats?.financial_ledger?.verified_transfers_uzs || 0} />
            <FinanceValue label="Expected cashbox" value={stats?.financial_ledger?.expected_cashbox_uzs || 0} />
            <View style={styles.cashStatus}>
              <Ionicons name="radio-button-on" size={16} color={COLORS.success} />
              <View style={styles.flex}>
                <Text style={styles.cashStatusLabel}>Cash day</Text>
                <Text style={styles.cashStatusValue}>{String(stats?.financial_ledger?.cash_day_status || 'open').replaceAll('_', ' ')}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.contextStrip}>
          <ContextMetric label="Current students" value={stats?.students?.total || 0} />
          <ContextMetric label="Active" value={stats?.students?.active || 0} tone="success" />
          <ContextMetric label="Teachers" value={stats?.teachers || 0} />
          <ContextMetric label="Support staff" value={stats?.support_staff || 0} />
        </View>

        <View style={[styles.lowerWorkspace, !isWide && styles.workspaceCompact]}>
          <LedgerSection title="Operations">
            {operations.map((item) => (
              <LedgerRow
                key={item.label}
                testID={`admin-tool-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`}
                icon={item.icon as keyof typeof Ionicons.glyphMap}
                title={item.label}
                detail={item.detail}
                onPress={() => router.push(item.route as any)}
              />
            ))}
          </LedgerSection>

          <View style={styles.secondaryLowerColumn}>
            <LedgerSection title="Student record">
              <LedgerRow icon="pause-circle-outline" title="Frozen" detail="Financial or administrative hold" value={String(stats?.students?.frozen || 0)} tone="warning" onPress={() => router.push('/(dashboard)/students')} />
              <LedgerRow icon="ribbon-outline" title="Graduated" detail="Completed student records" value={String(stats?.students?.graduated || 0)} tone="success" onPress={() => router.push('/(dashboard)/students')} />
              <LedgerRow icon="archive-outline" title="Archived" detail="Retained historical records" value={String(stats?.students?.archived || 0)} tone="muted" onPress={() => router.push('/(dashboard)/students')} />
            </LedgerSection>

            {user.role === 'super_admin' && (
              <LedgerSection title="System controls">
                <View style={styles.toolGrid}>
                  {systemTools.map((item) => (
                    <TouchableOpacity
                      key={item.label}
                      testID={`admin-tool-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                      style={styles.toolCell}
                      onPress={() => router.push(item.route as any)}
                    >
                      <Ionicons name={item.icon as any} size={19} color={COLORS.gold} />
                      <Text style={styles.toolLabel}>{item.label}</Text>
                      <Ionicons name="chevron-forward" size={15} color={COLORS.textTertiary} />
                    </TouchableOpacity>
                  ))}
                </View>
              </LedgerSection>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ScheduleRow({ event, wide, first, last }: { event: DailyEvent; wide: boolean; first: boolean; last: boolean }) {
  const { t } = useLanguage();
  const tone = eventTone[event.status];
  const detail = event.kind === 'lesson' && typeof event.student_count === 'number'
    ? `${event.student_count} ${t(event.student_count === 1 ? 'student' : 'students')}`
    : event.detail;
  return (
    <View style={[styles.scheduleRow, !wide && styles.scheduleRowCompact]}>
      <View style={[styles.timeColumn, styles.timeCell]}>
        <Text style={styles.eventTime}>{event.time}</Text>
        <Text style={styles.eventEnd}>{event.ends_at}</Text>
      </View>
      <View style={styles.timelineCell}>
        {!first && <View style={styles.timelineBefore} />}
        <View style={[styles.timelineMarker, { borderColor: toneColor[tone] }]}>
          <View style={[styles.timelineDot, { backgroundColor: toneColor[tone] }]} />
        </View>
        {!last && <View style={styles.timelineAfter} />}
      </View>
      <View style={styles.eventColumn}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text style={styles.eventDetail}>{detail}</Text>
        {!wide && <Text style={styles.eventMeta}>{event.owner} · {event.location}</Text>}
      </View>
      {wide && <Text numberOfLines={2} style={[styles.registerValue, styles.ownerColumn]}>{event.owner}</Text>}
      {wide && <Text numberOfLines={2} style={[styles.registerValue, styles.locationColumn]}>{event.location}</Text>}
      <View style={[styles.statusColumn, !wide && styles.statusColumnCompact]}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} maxFontSizeMultiplier={1.25} style={[styles.eventStatus, { color: toneColor[tone] }]}>{event.status_label}</Text>
      </View>
    </View>
  );
}

function ExceptionRow({ icon, label, detail, value, tone, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; detail: string; value: number; tone: Tone; onPress: () => void }) {
  const color = value > 0 ? toneColor[tone] : COLORS.textTertiary;
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} style={styles.exceptionRow} onPress={onPress}>
      <View style={[styles.exceptionIcon, { borderColor: color + '55' }]}><Ionicons name={icon} size={21} color={color} /></View>
      <View style={styles.flex}>
        <Text style={styles.exceptionTitle}>{label}</Text>
        <Text style={styles.exceptionDetail}>{value > 0 ? detail : 'Nothing waiting'}</Text>
      </View>
      <Text maxFontSizeMultiplier={1.2} style={[styles.exceptionValue, { color }]}>{value}</Text>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} />
    </TouchableOpacity>
  );
}

function FinanceValue({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.financeValue}>
      <Text style={styles.financeLabel}>{label}</Text>
      <Text style={styles.financeNumber}>{uzs(value)}</Text>
    </View>
  );
}

function ContextMetric({ label, value, tone = 'gold' }: { label: string; value: number; tone?: Tone }) {
  return (
    <View style={styles.contextMetric}>
      <Text style={[styles.contextValue, { color: toneColor[tone] }]}>{value}</Text>
      <Text style={styles.contextLabel}>{label}</Text>
    </View>
  );
}

function LedgerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.simpleSectionHeader}><Text style={styles.sectionTitle}>{title}</Text></View>
      {children}
    </View>
  );
}

function LedgerRow({
  icon,
  title,
  detail,
  value,
  tone = 'muted',
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  value?: string;
  tone?: Tone;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? title : undefined}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
      onPress={onPress}
      style={styles.ledgerRow}
    >
      <View style={styles.rowIcon}><Ionicons name={icon} size={20} color={toneColor[tone]} /></View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      {value !== undefined && <Text style={[styles.rowValue, { color: toneColor[tone] }]}>{value}</Text>}
      {onPress && <Ionicons name="chevron-forward" size={17} color={COLORS.textTertiary} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  pageHeader: {
    minHeight: 112,
    paddingTop: SIZES.headerTop,
    paddingBottom: SIZES.md,
    paddingHorizontal: SIZES.lg,
    backgroundColor: COLORS.backgroundSubtle,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.lg,
  },
  pageHeaderPhone: { alignItems: 'flex-start', flexDirection: 'column', paddingHorizontal: SIZES.md, gap: SIZES.md },
  pageHeaderCopy: { flex: 1, minWidth: 0 },
  pageHeaderCopyPhone: { width: '100%' },
  pageTitle: { ...TYPOGRAPHY.title, color: COLORS.textPrimary, textTransform: 'capitalize', marginTop: 5 },
  pageSubtitle: { marginTop: 4, color: COLORS.textSecondary, fontSize: SIZES.fontSm },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  headerActionsPhone: { width: '100%', justifyContent: 'space-between' },
  identityCopy: { alignItems: 'flex-end', marginRight: SIZES.xs },
  identityName: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700' },
  identityRole: { marginTop: 2, color: COLORS.textSecondary, fontSize: SIZES.fontXs, textTransform: 'capitalize' },
  notificationButton: { width: SIZES.touchTarget, height: SIZES.touchTarget, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.backgroundLight },
  unreadBadge: { position: 'absolute', top: 4, right: 4, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center' },
  unreadBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', fontVariant: ['tabular-nums'] },
  primaryAction: { minHeight: SIZES.touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: SIZES.md, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.gold },
  primaryActionPhone: { flex: 1, minWidth: 0 },
  primaryActionText: { color: COLORS.textOnGold, fontSize: SIZES.fontSm, fontWeight: '800' },
  dashboardNotice: { minHeight: 48, paddingHorizontal: SIZES.lg, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, backgroundColor: COLORS.warning + '10', borderBottomWidth: 1, borderBottomColor: COLORS.warning + '45' },
  dashboardNoticeText: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.fontXs },
  content: { flex: 1 },
  contentContainer: { width: '100%', maxWidth: 1540, alignSelf: 'center', padding: SIZES.lg, paddingBottom: SIZES.xxxl },
  contentContainerCompact: { padding: SIZES.md, paddingBottom: SIZES.xxl },
  workspace: { flexDirection: 'row', alignItems: 'stretch', borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border },
  workspaceCompact: { flexDirection: 'column' },
  scheduleColumn: { flex: 1.75, minWidth: 0, backgroundColor: COLORS.backgroundCard },
  scheduleColumnCompact: { minWidth: 0, backgroundColor: COLORS.backgroundCard },
  exceptionColumn: { flex: 0.9, minWidth: 290, backgroundColor: COLORS.backgroundSubtle, borderLeftWidth: 1, borderLeftColor: COLORS.border },
  sectionHeader: { minHeight: 70, paddingHorizontal: SIZES.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  sectionEyebrow: { color: COLORS.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  sectionTitle: { ...TYPOGRAPHY.section, color: COLORS.textPrimary, marginTop: 3 },
  textAction: { maxWidth: '48%', minHeight: SIZES.touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingHorizontal: SIZES.xs },
  textActionLabel: { flexShrink: 1, color: COLORS.gold, fontSize: SIZES.fontSm, fontWeight: '700' },
  scheduleRegister: { width: '100%' },
  registerHeader: { height: 34, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  columnLabel: { color: COLORS.textTertiary, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  timeColumn: { width: 74 },
  eventColumn: { flex: 1.35, minWidth: 0 },
  ownerColumn: { flex: 0.82, minWidth: 0 },
  locationColumn: { flex: 0.62, minWidth: 0 },
  statusColumn: { width: 112, alignItems: 'flex-start' },
  scheduleRow: { minHeight: 88, paddingHorizontal: SIZES.md, flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  scheduleRowCompact: { minHeight: 96 },
  timeCell: { justifyContent: 'center' },
  eventTime: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '800', fontVariant: ['tabular-nums'] },
  eventEnd: { color: COLORS.textTertiary, fontSize: 10, marginTop: 3, fontVariant: ['tabular-nums'] },
  timelineCell: { width: 32, alignItems: 'center', justifyContent: 'center' },
  timelineBefore: { position: 'absolute', top: 0, bottom: '50%', width: 1, backgroundColor: COLORS.borderStrong },
  timelineAfter: { position: 'absolute', top: '50%', bottom: 0, width: 1, backgroundColor: COLORS.borderStrong },
  timelineMarker: { width: 19, height: 19, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.backgroundCard, zIndex: 1 },
  timelineDot: { width: 7, height: 7, borderRadius: 4 },
  eventTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '750' as any, marginTop: 22 },
  eventDetail: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginTop: 4 },
  eventMeta: { color: COLORS.textTertiary, fontSize: 11, marginTop: 4 },
  registerValue: { alignSelf: 'center', color: COLORS.textSecondary, fontSize: SIZES.fontSm, lineHeight: 18, paddingRight: SIZES.sm },
  statusColumnCompact: { width: 86, justifyContent: 'center', alignItems: 'flex-end' },
  eventStatus: { alignSelf: 'center', fontSize: 10, fontWeight: '800', letterSpacing: 0.35, textTransform: 'uppercase' },
  emptyRegister: { minHeight: 150, flexDirection: 'row', alignItems: 'center', gap: SIZES.md, padding: SIZES.lg },
  emptyTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '700' },
  emptyDetail: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, lineHeight: 19, marginTop: 4 },
  scheduleCloseRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.md, gap: SIZES.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  closeTime: { width: 65, color: COLORS.textTertiary, fontSize: SIZES.fontSm, fontVariant: ['tabular-nums'] },
  closeMarker: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.textTertiary, marginHorizontal: 4 },
  closeLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '650' as any },
  closeDetail: { flex: 1, color: COLORS.textTertiary, fontSize: SIZES.fontXs, textAlign: 'right' },
  queueCount: { minWidth: 25, height: 25, borderRadius: 13, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  queueCountText: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  exceptionList: { width: '100%' },
  exceptionRow: { minHeight: 88, paddingHorizontal: SIZES.md, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  exceptionIcon: { width: 40, height: 40, borderWidth: 1, borderRadius: SIZES.radiusSm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.backgroundCard },
  exceptionTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700' },
  exceptionDetail: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 4 },
  exceptionValue: { minWidth: 20, textAlign: 'right', fontSize: SIZES.fontLg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  financialLedger: { marginTop: SIZES.lg, backgroundColor: COLORS.backgroundCard, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border },
  financialHeader: { minHeight: 64, paddingHorizontal: SIZES.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  financialHint: { color: COLORS.textTertiary, fontSize: 11, marginTop: 3 },
  financialTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '800' },
  financeValues: { flexDirection: 'row', flexWrap: 'wrap' },
  financeValue: { flex: 1, minWidth: 190, minHeight: 86, justifyContent: 'center', paddingHorizontal: SIZES.md, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  financeLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontXs },
  financeNumber: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 7 },
  cashStatus: { flex: 1, minWidth: 190, minHeight: 86, paddingHorizontal: SIZES.md, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  cashStatusLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontXs },
  cashStatusValue: { color: COLORS.success, fontSize: SIZES.fontMd, fontWeight: '800', marginTop: 5, textTransform: 'capitalize' },
  contextStrip: { marginTop: SIZES.lg, flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundSubtle },
  contextMetric: { flex: 1, minWidth: 135, minHeight: 58, flexDirection: 'row', alignItems: 'baseline', gap: SIZES.sm, paddingHorizontal: SIZES.md, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: COLORS.border },
  contextValue: { fontSize: SIZES.fontLg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  contextLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontXs },
  lowerWorkspace: { marginTop: SIZES.lg, flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.lg },
  secondaryLowerColumn: { flex: 1, minWidth: 0, gap: SIZES.lg },
  section: { flex: 1, minWidth: 0, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundCard },
  simpleSectionHeader: { minHeight: 54, paddingHorizontal: SIZES.md, justifyContent: 'center' },
  ledgerRow: { minHeight: 66, paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  rowIcon: { width: 28, alignItems: 'flex-start', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700' },
  rowDetail: { marginTop: 3, color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 17 },
  rowValue: { minWidth: 28, textAlign: 'right', fontSize: SIZES.fontLg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  toolCell: { width: '50%', minHeight: 56, paddingHorizontal: SIZES.md, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  toolLabel: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontXs, fontWeight: '650' as any },
});
