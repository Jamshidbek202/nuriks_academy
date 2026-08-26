import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '../../src/components/LocalizedText';
import { useAuth } from '../../src/contexts/AuthContext';
import { useFinanceLiveRefresh } from '../../src/hooks/use-finance-live-refresh';
import { api } from '../../src/services/api';
import { COLORS, SHADOWS, SIZES } from '../../src/constants/theme';
import { ConcourseAtmosphere } from '../../src/components/ConcourseAtmosphere';
import {
  AdaptiveGrid,
  AdaptivePageHeader,
  AdaptiveScrollView,
  AdaptiveSectionHeading,
} from '../../src/components/AdaptiveLayout';
import { MotionListItem, MotionReveal, MotionTouchableOpacity } from '../../src/components/Motion';

type LessonEarning = {
  occurrence_id: string;
  group_name: string;
  lesson_date: string;
  actual_lesson_date: string;
  program_code: string;
  group_format: string;
  student_count: number;
  tuition_basis_uzs: number;
  teacher_share_basis_points: number;
  earning_uzs: number;
};

type EarningsSummary = {
  service_month: string;
  status: 'accruing' | 'finalized';
  earned_to_date_uzs: number;
  projected_month_total_uzs: number;
  projected_remaining_uzs: number;
  paid_amount_uzs: number;
  outstanding_amount_uzs: number;
  completed_lesson_count: number;
  lessons: LessonEarning[];
};

const tashkentMonth = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit',
}).format(new Date()).slice(0, 7);

const shiftMonth = (month: string, offset: number) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const value = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
};

const uzs = (amount = 0) => `${new Intl.NumberFormat('ru-RU').format(amount)} UZS`;

export default function TeacherEarningsScreen() {
  const { user, token } = useAuth();
  const [month, setMonth] = useState(tashkentMonth());
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (user?.role !== 'teacher') return;
    try {
      const response = await api.get('/finance/teacher-earnings/summary', {
        params: { service_month: month },
      });
      setSummary(response.data);
      setError('');
    } catch (loadError: any) {
      setError(loadError.response?.data?.detail || 'Earnings could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month, user?.role]);

  useFinanceLiveRefresh(load, token, user?.role === 'teacher', `teacher-earnings:${month}`);

  if (user?.role !== 'teacher') {
    return <View style={styles.loading}><Text style={styles.muted}>Teacher access required.</Text></View>;
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.gold} /></View>;
  }

  return (
    <View testID="teacher-earnings-page" style={styles.container}>
      <ConcourseAtmosphere />
      <AdaptivePageHeader
        title="Earnings"
        description="Salary accrues after each completed lesson. Student absence or non-payment does not reduce your earnings."
      />
      <AdaptiveScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={COLORS.gold} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <View style={styles.monthBar}>
          <MotionTouchableOpacity accessibilityLabel="Previous month" testID="earnings-previous-month" style={styles.monthButton} onPress={() => { setLoading(true); setMonth(shiftMonth(month, -1)); }}>
            <Ionicons name="chevron-back" size={21} color={COLORS.textPrimary} />
          </MotionTouchableOpacity>
          <View style={styles.monthCopy}><Text style={styles.month}>{month}</Text><Text style={styles.monthHint}>{summary?.status === 'finalized' ? 'Finalized payroll' : 'Live provisional earnings'}</Text></View>
          <MotionTouchableOpacity accessibilityLabel="Next month" testID="earnings-next-month" style={styles.monthButton} onPress={() => { setLoading(true); setMonth(shiftMonth(month, 1)); }}>
            <Ionicons name="chevron-forward" size={21} color={COLORS.textPrimary} />
          </MotionTouchableOpacity>
        </View>

        {!!error && <View style={styles.error}><Ionicons name="alert-circle" size={20} color={COLORS.error} /><Text style={styles.errorText}>{error}</Text></View>}

        <MotionReveal>
        <AdaptiveGrid minItemWidth={190} maxColumns={4} style={styles.stats}>
          <Metric testID="teacher-earned-to-date" label="Earned so far" value={summary?.earned_to_date_uzs || 0} icon="trending-up" color={COLORS.success} />
          <Metric testID="teacher-projected-total" label="Projected month" value={summary?.projected_month_total_uzs || 0} icon="analytics" color={COLORS.gold} />
          <Metric testID="teacher-salary-paid" label="Paid" value={summary?.paid_amount_uzs || 0} icon="checkmark-circle" color={COLORS.info} />
          <Metric testID="teacher-salary-outstanding" label="Earned, unpaid" value={summary?.outstanding_amount_uzs || 0} icon="wallet" color={COLORS.warning} />
        </AdaptiveGrid>
        </MotionReveal>

        <View style={styles.notice}>
          <Ionicons name="shield-checkmark" size={22} color={COLORS.gold} />
          <Text style={styles.noticeText}>Projected pay assumes remaining scheduled lessons are held with currently active students. Only completed lessons are included in “Earned so far.” Official payroll is locked when the month is finalized.</Text>
        </View>

        <AdaptiveSectionHeading
          title="Completed lessons"
          description={`${summary?.completed_lesson_count || 0} lesson(s) included`}
          action={<Text style={styles.remaining}>Remaining projection {uzs(summary?.projected_remaining_uzs || 0)}</Text>}
        />

        {!summary?.lessons?.length ? (
          <View style={styles.empty}><Ionicons name="school-outline" size={42} color={COLORS.textTertiary} /><Text style={styles.muted}>No completed billable lessons in this month yet.</Text></View>
        ) : summary.lessons.map((lesson, index) => (
          <MotionListItem key={lesson.occurrence_id} index={index} testID={`teacher-earning-lesson-${lesson.occurrence_id}`} style={styles.lessonCard}>
            <View style={styles.lessonTop}>
              <View style={styles.flex}><Text style={styles.lessonTitle}>{lesson.group_name}</Text><Text style={styles.meta}>{lesson.lesson_date} · {lesson.group_format} · {lesson.student_count} billable student(s)</Text></View>
              <Text style={styles.earning}>{uzs(lesson.earning_uzs)}</Text>
            </View>
            <View style={styles.rule} />
            <View style={styles.calculation}><Text style={styles.meta}>Tuition basis {uzs(lesson.tuition_basis_uzs)}</Text><Text style={styles.share}>{lesson.teacher_share_basis_points / 100}% share</Text></View>
          </MotionListItem>
        ))}
      </AdaptiveScrollView>
    </View>
  );
}

function Metric({ testID, label, value, icon, color }: { testID: string; label: string; value: number; icon: string; color: string }) {
  return <View testID={testID} style={styles.metric}><Ionicons name={icon as any} size={22} color={color} /><Text style={styles.metricValue}>{uzs(value)}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  monthBar: { flexDirection: 'row', alignItems: 'center', maxWidth: 520, alignSelf: 'center', width: '100%', marginBottom: SIZES.md },
  monthButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.backgroundCard },
  monthCopy: { flex: 1, alignItems: 'center' },
  month: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800' },
  monthHint: { color: COLORS.textTertiary, fontSize: SIZES.fontXs, marginTop: 2 },
  stats: { marginBottom: SIZES.md },
  metric: { minHeight: 118, padding: SIZES.md, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundCard, ...SHADOWS.small },
  metricValue: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800', marginTop: SIZES.sm },
  metricLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: 3 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.sm, padding: SIZES.md, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.gold + '12', borderWidth: 1, borderColor: COLORS.gold + '44', marginBottom: SIZES.lg },
  noticeText: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.fontSm, lineHeight: 20 },
  remaining: { color: COLORS.gold, fontSize: SIZES.fontXs, fontWeight: '700' },
  lessonCard: { padding: SIZES.md, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundCard, marginBottom: SIZES.sm, ...SHADOWS.small },
  lessonTop: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  lessonTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '700' },
  meta: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: 3 },
  earning: { color: COLORS.success, fontSize: SIZES.fontMd, fontWeight: '800' },
  rule: { height: 1, backgroundColor: COLORS.marbleGray, marginVertical: SIZES.sm },
  calculation: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: SIZES.xs },
  share: { color: COLORS.gold, fontSize: SIZES.fontXs, fontWeight: '700' },
  flex: { flex: 1 },
  empty: { alignItems: 'center', gap: SIZES.sm, padding: SIZES.xl, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundCard },
  muted: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, textAlign: 'center' },
  error: { flexDirection: 'row', gap: SIZES.sm, padding: SIZES.md, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.error + '18', marginBottom: SIZES.md },
  errorText: { flex: 1, color: COLORS.error, fontSize: SIZES.fontSm },
});
