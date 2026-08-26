import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';

import { Text } from '../../src/components/LocalizedText';
import { useAuth } from '../../src/contexts/AuthContext';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';
import { api } from '../../src/services/api';
import { COLORS, SHADOWS, SIZES } from '../../src/constants/theme';
import { ConcourseAtmosphere } from '../../src/components/ConcourseAtmosphere';
import {
  AdaptiveColumns,
  AdaptiveGrid,
  AdaptivePageHeader,
  AdaptiveScrollView,
  AdaptiveSectionHeading,
} from '../../src/components/AdaptiveLayout';
import { MotionListItem, MotionReveal, MotionTouchableOpacity } from '../../src/components/Motion';

type Dashboard = {
  students?: { total?: number; active?: number; frozen?: number };
  groups?: number;
  payments?: { overdue_students?: number; paid_today_students?: number };
  today?: { lessons?: number; support_bookings?: number };
  cash_day?: { business_date?: string; status?: string };
};

type CallItem = {
  student_id: string;
  student_name: string;
  student_phone?: string;
  parent_phone?: string;
  balance_uzs: number;
  urgency?: string;
};

type Booking = {
  id: string;
  booking_id: string;
  student_name?: string;
  support_name?: string;
  booking_date: string;
  start_time: string;
  status: string;
};

const uzs = (value = 0) => `${new Intl.NumberFormat('ru-RU').format(value)} UZS`;

export default function ReceptionHomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [callList, setCallList] = useState<CallItem[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [dashboardResponse, callResponse, bookingResponse] = await Promise.all([
        api.get('/dashboard'),
        api.get('/finance/reception/call-list'),
        api.get('/support-bookings'),
      ]);
      setDashboard(dashboardResponse.data || null);
      setCallList(callResponse.data || []);
      setBookings(bookingResponse.data || []);
    } catch (error) {
      console.error('Reception dashboard failed:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useLiveRefresh(load, user?.role === 'reception', `reception-home:${user?.branch_id || ''}`, 3000);

  const upcomingBookings = useMemo(
    () => bookings
      .filter((row) => ['scheduled', 'confirmed'].includes(row.status))
      .sort((a, b) => `${a.booking_date}T${a.start_time}`.localeCompare(`${b.booking_date}T${b.start_time}`))
      .slice(0, 8),
    [bookings],
  );

  if (user?.role !== 'reception') {
    return <Redirect href="/(dashboard)" />;
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.gold} /></View>;
  }

  return (
    <View testID="reception-home" style={styles.container}>
      <ConcourseAtmosphere />
      <AdaptivePageHeader
        title={`Good day, ${user?.full_name?.split(' ')[0] || 'Reception'}`}
        description="Students, calls, payments, and today’s support bookings—without centre revenue or profit details."
      />
      <AdaptiveScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={COLORS.gold} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <MotionReveal>
        <AdaptiveSectionHeading title="Front desk" description="Start with the task in front of you" />
        <AdaptiveGrid minItemWidth={190} maxColumns={4} style={styles.actionGrid}>
          <QuickAction testID="reception-new-lead" icon="person-add" label="New lead" onPress={() => router.push('/(dashboard)/leads')} />
          <QuickAction testID="reception-students" icon="people" label="Students" onPress={() => router.push('/(dashboard)/students')} />
          <QuickAction testID="reception-groups" icon="people-circle" label="Groups" onPress={() => router.push('/(dashboard)/groups')} />
          <QuickAction testID="reception-record-payment" icon="cash" label="Record payment" onPress={() => router.push('/(dashboard)/finance')} />
        </AdaptiveGrid>
        </MotionReveal>

        <AdaptiveColumns collapseAt="compact" gap={SIZES.lg}>
          <View>
        <AdaptiveSectionHeading title="Today at a glance" description="Operational counts only" />
        <AdaptiveGrid minItemWidth={132} maxColumns={2} style={styles.metrics}>
          <Metric icon="people" label="Students" value={dashboard?.students?.total || 0} />
          <Metric icon="people-circle" label="Groups" value={dashboard?.groups || 0} />
          <Metric icon="checkmark-circle" label="Paid today" value={dashboard?.payments?.paid_today_students || 0} good />
          <Metric icon="alert-circle" label="Need payment call" value={dashboard?.payments?.overdue_students || 0} warning />
        </AdaptiveGrid>

        <MotionTouchableOpacity testID="reception-cash-day" style={styles.cashCard} onPress={() => router.push('/(dashboard)/finance')}>
          <View style={styles.cardIcon}><Ionicons name="wallet" size={22} color={COLORS.gold} /></View>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>Cashbox · {dashboard?.cash_day?.business_date || 'today'}</Text>
            <Text style={styles.meta}>Available automatically for recording student cash payments. Centre cash totals are restricted.</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={COLORS.textTertiary} />
        </MotionTouchableOpacity>

        <AdaptiveSectionHeading
          title="Payment calls"
          description="Oldest and most urgent first"
          action={<TouchableOpacity onPress={() => router.push('/(dashboard)/finance')}><Text style={styles.link}>See all</Text></TouchableOpacity>}
        />
        {callList.length === 0 ? (
          <Empty text="No students need a payment call." />
        ) : callList.slice(0, 6).map((item, index) => (
          <MotionListItem key={item.student_id} index={index} testID={`reception-call-${item.student_id}`} style={styles.rowCard}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{item.student_name}</Text>
              <Text style={styles.debt}>{uzs(item.balance_uzs)} outstanding</Text>
            </View>
            {!!item.student_phone && <CallButton label="Student" phone={item.student_phone} />}
            {!!item.parent_phone && <CallButton label="Parent" phone={item.parent_phone} />}
          </MotionListItem>
        ))}
          </View>

          <View>
        <AdaptiveSectionHeading title="Support bookings" description={`${dashboard?.today?.support_bookings || 0} scheduled today`} />
        {upcomingBookings.length === 0 ? (
          <Empty text="No upcoming support bookings." />
        ) : upcomingBookings.map((booking, index) => (
          <MotionListItem key={booking.id} index={index} testID={`reception-booking-${booking.id}`} style={styles.rowCard}>
            <View style={styles.dateBox}><Text style={styles.dateText}>{booking.booking_date.slice(5)}</Text><Text style={styles.timeText}>{booking.start_time}</Text></View>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{booking.student_name || booking.booking_id}</Text>
              <Text style={styles.meta}>{booking.support_name || 'Support teacher'} · {booking.status}</Text>
            </View>
          </MotionListItem>
        ))}
          </View>
        </AdaptiveColumns>
      </AdaptiveScrollView>
    </View>
  );
}

function QuickAction({ testID, icon, label, onPress }: { testID: string; icon: string; label: string; onPress: () => void }) {
  return <MotionTouchableOpacity testID={testID} style={styles.quickAction} onPress={onPress}><View style={styles.quickIcon}><Ionicons name={icon as any} size={23} color={COLORS.gold} /></View><Text style={styles.quickLabel}>{label}</Text><Ionicons name="arrow-forward" size={17} color={COLORS.textTertiary} /></MotionTouchableOpacity>;
}

function Metric({ icon, label, value, good, warning }: { icon: string; label: string; value: number; good?: boolean; warning?: boolean }) {
  const color = good ? COLORS.success : warning ? COLORS.warning : COLORS.gold;
  return <View style={styles.metric}><Ionicons name={icon as any} size={21} color={color} /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function CallButton({ label, phone }: { label: string; phone: string }) {
  return <TouchableOpacity accessibilityRole="button" style={styles.callButton} onPress={() => void Linking.openURL(`tel:${phone}`)}><Ionicons name="call" size={15} color={COLORS.success} /><Text style={styles.callText}>{label}</Text></TouchableOpacity>;
}

function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Ionicons name="checkmark-done-circle-outline" size={35} color={COLORS.textTertiary} /><Text style={styles.meta}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  actionGrid: { marginBottom: SIZES.sm },
  quickAction: { minHeight: 72, padding: SIZES.sm, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.glassHighlight, backgroundColor: COLORS.backgroundCard, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, ...SHADOWS.small },
  quickIcon: { width: 42, height: 42, borderRadius: SIZES.radiusSm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.goldGlass },
  quickLabel: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700' },
  metrics: { marginBottom: SIZES.md },
  metric: { minHeight: 105, padding: SIZES.md, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.glassHighlight, backgroundColor: COLORS.backgroundCard, ...SHADOWS.small },
  metricValue: { color: COLORS.textPrimary, fontSize: 27, fontWeight: '800', marginTop: SIZES.xs },
  metricLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: 2 },
  cashCard: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, padding: SIZES.md, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.goldHairline, backgroundColor: COLORS.goldGlass, marginBottom: SIZES.lg, ...SHADOWS.small },
  cardIcon: { width: 44, height: 44, borderRadius: SIZES.radiusSm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.goldGlass },
  link: { color: COLORS.gold, fontSize: SIZES.fontSm, fontWeight: '700' },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, padding: SIZES.md, marginBottom: SIZES.sm, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.glassHighlight, backgroundColor: COLORS.backgroundCard, ...SHADOWS.small },
  flex: { flex: 1 },
  cardTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700' },
  meta: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 17, marginTop: 2 },
  debt: { color: COLORS.warning, fontSize: SIZES.fontXs, fontWeight: '700', marginTop: 3 },
  callButton: { minHeight: SIZES.touchTarget, paddingHorizontal: SIZES.sm, borderRadius: SIZES.radiusSm, borderWidth: 1, borderColor: COLORS.success + '66', flexDirection: 'row', alignItems: 'center', gap: 5 },
  callText: { color: COLORS.success, fontSize: 11, fontWeight: '700' },
  dateBox: { width: 55, paddingVertical: SIZES.xs, borderRadius: SIZES.radiusSm, alignItems: 'center', backgroundColor: COLORS.gold + '18' },
  dateText: { color: COLORS.gold, fontSize: 11, fontWeight: '800' },
  timeText: { color: COLORS.textPrimary, fontSize: SIZES.fontXs, marginTop: 2 },
  empty: { alignItems: 'center', gap: SIZES.xs, paddingVertical: SIZES.lg, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.glassHighlight, backgroundColor: COLORS.backgroundCard, marginBottom: SIZES.sm },
});
