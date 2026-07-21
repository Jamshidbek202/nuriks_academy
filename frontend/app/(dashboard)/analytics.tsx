import { getActiveLocale } from '../../src/i18n/translations';
import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Text } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';

const { width } = Dimensions.get('window');

interface Analytics {
  students: { total: number; active: number; graduated: number; frozen: number };
  revenue: { monthly: number; previous_month: number; change_percent: number };
  attendance: { rate: number; total_records: number; present: number };
  tests: { mid_test_average: number; end_test_average: number; total_mid_tests: number; total_end_tests: number };
  teachers: {
    total: number;
    performance?: {
      teacher_id: string;
      teacher_name: string;
      average_rating: number;
      progress_percent: number;
      feedback_count: number;
      lessons_logged: number;
    }[];
  };
  support: { total_bookings: number; completed: number; pending: number };
  leads: { total: number; converted: number; conversion_rate: number };
  monthly_trends: { month: string; revenue: number; new_students: number }[];
}

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAnalytics = async () => {
    try {
      const res = await api.get('/admin/analytics');
      setAnalytics(res.data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useLiveRefresh(loadAnalytics, true, 'admin-analytics', 3000);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(getActiveLocale(), { style: 'decimal' }).format(amount) + ' UZS';
  };

  if (user?.role !== 'super_admin' && user?.role !== 'manager') {
    return (
      <View style={styles.accessDenied}>
        <Ionicons name="lock-closed" size={64} color={COLORS.error} />
        <Text style={styles.accessDeniedText}>Access Denied</Text>
        <Text style={styles.accessDeniedSub}>Admin access required</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Analytics Dashboard</Text>
        <Text style={styles.subtitle}>Academy performance metrics</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAnalytics(); }} tintColor={COLORS.gold} />
        }
      >
        {/* Student Statistics */}
        <Text style={styles.sectionTitle}>Student Statistics</Text>
        <View style={styles.statsGrid}>
          <StatCard icon="people" label="Current Students" value={analytics?.students.total || 0} color={COLORS.info} />
          <StatCard icon="checkmark-circle" label="Active" value={analytics?.students.active || 0} color={COLORS.success} />
          <StatCard icon="school" label="Graduated" value={analytics?.students.graduated || 0} color={COLORS.gold} />
          <StatCard icon="pause-circle" label="Frozen" value={analytics?.students.frozen || 0} color={COLORS.warning} />
        </View>

        {/* Revenue */}
        <Text style={styles.sectionTitle}>Monthly Revenue</Text>
        <View style={styles.revenueCard}>
          <View style={styles.revenueMain}>
            <Ionicons name="cash" size={32} color={COLORS.gold} />
            <Text style={styles.revenueAmount}>{formatCurrency(analytics?.revenue.monthly || 0)}</Text>
          </View>
          <View style={styles.revenueCompare}>
            <View style={[styles.changeBadge, { backgroundColor: (analytics?.revenue.change_percent || 0) >= 0 ? COLORS.success + '20' : COLORS.error + '20' }]}>
              <Ionicons name={(analytics?.revenue.change_percent || 0) >= 0 ? 'arrow-up' : 'arrow-down'} size={16} color={(analytics?.revenue.change_percent || 0) >= 0 ? COLORS.success : COLORS.error} />
              <Text style={[styles.changeText, { color: (analytics?.revenue.change_percent || 0) >= 0 ? COLORS.success : COLORS.error }]}>
                {Math.abs(analytics?.revenue.change_percent || 0)}%
              </Text>
            </View>
            <Text style={styles.compareText}>vs previous month</Text>
          </View>
        </View>

        {/* Attendance Rate */}
        <Text style={styles.sectionTitle}>Attendance Rate</Text>
        <View style={styles.attendanceCard}>
          <View style={styles.attendanceCircle}>
            <Text style={styles.attendanceValue}>{analytics?.attendance.rate || 0}%</Text>
          </View>
          <View style={styles.attendanceDetails}>
            <View style={styles.attendanceRow}>
              <Text style={styles.attendanceLabel}>Total Records</Text>
              <Text style={styles.attendanceNumber}>{analytics?.attendance.total_records || 0}</Text>
            </View>
            <View style={styles.attendanceRow}>
              <Text style={styles.attendanceLabel}>Present</Text>
              <Text style={styles.attendanceNumber}>{analytics?.attendance.present || 0}</Text>
            </View>
          </View>
        </View>

        {/* Test Statistics */}
        <Text style={styles.sectionTitle}>Test Statistics</Text>
        <View style={styles.testsGrid}>
          <View style={styles.testCard}>
            <Text style={styles.testType}>Mid Tests</Text>
            <Text style={styles.testAvg}>{analytics?.tests.mid_test_average || 0}%</Text>
            <Text style={styles.testCount}>{analytics?.tests.total_mid_tests || 0} tests</Text>
          </View>
          <View style={styles.testCard}>
            <Text style={styles.testType}>End Tests</Text>
            <Text style={styles.testAvg}>{analytics?.tests.end_test_average || 0}%</Text>
            <Text style={styles.testCount}>{analytics?.tests.total_end_tests || 0} tests</Text>
          </View>
        </View>

        {user?.role === 'super_admin' && (
          <>
            <Text style={styles.sectionTitle}>Teacher Progress</Text>
            <View style={styles.teacherPerformanceCard}>
              {(analytics?.teachers.performance || []).length > 0 ? (
                analytics?.teachers.performance?.map((teacher) => (
                  <View key={teacher.teacher_id} style={styles.teacherPerformanceRow}>
                    <View style={styles.teacherPerformanceInfo}>
                      <Text style={styles.teacherPerformanceName}>{teacher.teacher_name || 'Teacher'}</Text>
                      <Text style={styles.teacherPerformanceMeta}>
                        {teacher.average_rating}/5 · {teacher.feedback_count} reviews · {teacher.lessons_logged} lessons
                      </Text>
                      <View style={styles.teacherProgressTrack}>
                        <View style={[styles.teacherProgressFill, { width: `${teacher.progress_percent}%` }]} />
                      </View>
                    </View>
                    <Text style={styles.teacherPerformancePercent}>{teacher.progress_percent}%</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyMetricText}>No lesson feedback yet</Text>
              )}
            </View>
          </>
        )}

        {/* Support Sessions */}
        <Text style={styles.sectionTitle}>Support Session Statistics</Text>
        <View style={styles.supportCard}>
          <View style={styles.supportStat}>
            <Ionicons name="calendar" size={24} color={COLORS.info} />
            <Text style={styles.supportValue}>{analytics?.support.total_bookings || 0}</Text>
            <Text style={styles.supportLabel}>Total</Text>
          </View>
          <View style={styles.supportStat}>
            <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
            <Text style={styles.supportValue}>{analytics?.support.completed || 0}</Text>
            <Text style={styles.supportLabel}>Completed</Text>
          </View>
          <View style={styles.supportStat}>
            <Ionicons name="time" size={24} color={COLORS.warning} />
            <Text style={styles.supportValue}>{analytics?.support.pending || 0}</Text>
            <Text style={styles.supportLabel}>Pending</Text>
          </View>
        </View>

        {/* Lead Conversion */}
        <Text style={styles.sectionTitle}>Lead Conversion Rate</Text>
        <View style={styles.leadsCard}>
          <View style={styles.leadsMain}>
            <Text style={styles.leadsRate}>{analytics?.leads.conversion_rate || 0}%</Text>
            <Text style={styles.leadsLabel}>Conversion Rate</Text>
          </View>
          <View style={styles.leadsDivider} />
          <View style={styles.leadsStats}>
            <View style={styles.leadsStat}>
              <Text style={styles.leadsStatValue}>{analytics?.leads.total || 0}</Text>
              <Text style={styles.leadsStatLabel}>Total Leads</Text>
            </View>
            <View style={styles.leadsStat}>
              <Text style={styles.leadsStatValue}>{analytics?.leads.converted || 0}</Text>
              <Text style={styles.leadsStatLabel}>Converted</Text>
            </View>
          </View>
        </View>

        {/* Monthly Trends */}
        <Text style={styles.sectionTitle}>Monthly Trends</Text>
        <View style={styles.trendsCard}>
          {analytics?.monthly_trends.map((trend, index) => (
            <View key={index} style={styles.trendRow}>
              <Text style={styles.trendMonth}>{trend.month}</Text>
              <View style={styles.trendBars}>
                <View style={[styles.trendBar, { width: Math.max(20, (trend.revenue / (Math.max(...(analytics?.monthly_trends.map(t => t.revenue) || [1])) || 1)) * 100) }]} />
              </View>
              <Text style={styles.trendValue}>{formatCurrency(trend.revenue)}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const StatCard = ({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) => (
  <View style={styles.statCard}>
    <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon as any} size={24} color={color} />
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  accessDenied: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  accessDeniedText: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: SIZES.md },
  accessDeniedSub: { fontSize: SIZES.fontMd, color: COLORS.textSecondary, marginTop: SIZES.sm },
  header: { paddingTop: 60, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark },
  title: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  subtitle: { fontSize: SIZES.fontMd, color: COLORS.textSecondary, marginTop: SIZES.xs },
  content: { flex: 1, padding: SIZES.md },
  sectionTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.gold, marginTop: SIZES.md, marginBottom: SIZES.sm },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm },
  statCard: { width: (width - SIZES.md * 3) / 2, backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, alignItems: 'center', ...SHADOWS.small },
  statIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: SIZES.sm },
  statValue: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  statLabel: { fontSize: SIZES.fontXs, color: COLORS.textSecondary, marginTop: 4 },
  revenueCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.lg, ...SHADOWS.small },
  revenueMain: { flexDirection: 'row', alignItems: 'center', gap: SIZES.md },
  revenueAmount: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.gold },
  revenueCompare: { flexDirection: 'row', alignItems: 'center', marginTop: SIZES.md, gap: SIZES.sm },
  changeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.sm, paddingVertical: 4, borderRadius: SIZES.radiusSm, gap: 4 },
  changeText: { fontSize: SIZES.fontSm, fontWeight: '600' },
  compareText: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  attendanceCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.lg, flexDirection: 'row', alignItems: 'center', ...SHADOWS.small },
  attendanceCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.gold + '20', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: COLORS.gold },
  attendanceValue: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.gold },
  attendanceDetails: { flex: 1, marginLeft: SIZES.lg },
  attendanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SIZES.sm },
  attendanceLabel: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  attendanceNumber: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textPrimary },
  testsGrid: { flexDirection: 'row', gap: SIZES.sm },
  testCard: { flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.lg, alignItems: 'center', ...SHADOWS.small },
  testType: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  testAvg: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.gold, marginVertical: SIZES.sm },
  testCount: { fontSize: SIZES.fontXs, color: COLORS.textTertiary },
  teacherPerformanceCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, paddingHorizontal: SIZES.md, ...SHADOWS.small },
  teacherPerformanceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SIZES.md, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  teacherPerformanceInfo: { flex: 1, marginRight: SIZES.md },
  teacherPerformanceName: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  teacherPerformanceMeta: { fontSize: SIZES.fontXs, color: COLORS.textSecondary, marginTop: 3 },
  teacherProgressTrack: { height: 6, backgroundColor: COLORS.marbleGray, borderRadius: 3, overflow: 'hidden', marginTop: SIZES.sm },
  teacherProgressFill: { height: '100%', backgroundColor: COLORS.gold, borderRadius: 3 },
  teacherPerformancePercent: { fontSize: SIZES.fontLg, fontWeight: 'bold', color: COLORS.gold },
  emptyMetricText: { color: COLORS.textTertiary, textAlign: 'center', paddingVertical: SIZES.lg },
  supportCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.lg, flexDirection: 'row', justifyContent: 'space-around', ...SHADOWS.small },
  supportStat: { alignItems: 'center' },
  supportValue: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary, marginVertical: SIZES.xs },
  supportLabel: { fontSize: SIZES.fontXs, color: COLORS.textSecondary },
  leadsCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.lg, flexDirection: 'row', alignItems: 'center', ...SHADOWS.small },
  leadsMain: { alignItems: 'center' },
  leadsRate: { fontSize: 36, fontWeight: 'bold', color: COLORS.gold },
  leadsLabel: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  leadsDivider: { width: 1, height: 60, backgroundColor: COLORS.marbleGray, marginHorizontal: SIZES.lg },
  leadsStats: { flex: 1 },
  leadsStat: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SIZES.sm },
  leadsStatValue: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  leadsStatLabel: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  trendsCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, ...SHADOWS.small },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SIZES.sm },
  trendMonth: { width: 60, fontSize: SIZES.fontXs, color: COLORS.textSecondary },
  trendBars: { flex: 1, height: 8, backgroundColor: COLORS.marbleGray, borderRadius: 4, marginHorizontal: SIZES.sm, overflow: 'hidden' },
  trendBar: { height: '100%', backgroundColor: COLORS.gold, borderRadius: 4 },
  trendValue: { width: 100, fontSize: SIZES.fontXs, color: COLORS.textPrimary, textAlign: 'right' },
});
