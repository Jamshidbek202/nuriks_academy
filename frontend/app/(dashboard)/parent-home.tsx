import { getActiveLocale } from '../../src/i18n/translations';
import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { Text } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SHADOWS, SIZES } from '../../src/constants/theme';
import { useUnreadNotifications } from '../../src/hooks/use-unread-notifications';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';
import { AcademyIllustration } from '../../src/components/AcademyIllustration';

interface Child {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  status: string;
  group_ids: string[];
}

interface AttendanceStats {
  total: number;
  present: number;
  rate: number;
}

interface Payment {
  id: string;
  amount: number;
  payment_status: string;
  month: string;
  created_at: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export default function ParentHomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const unreadNotifications = useUnreadNotifications();
  const [child, setChild] = useState<Child | null>(null);
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats | null>(null);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);

  const loadParentData = async () => {
    try {
      // Get parent's children
      const studentsRes = await api.get('/students');
      // Filter to find parent's child (in real app, use parent_id relation)
      const parentChild = studentsRes.data[0]; // Get first child assigned to parent
      setChild(parentChild);

      if (parentChild) {
        // Load attendance stats
        try {
          const attendanceRes = await api.get(`/attendance/student/${parentChild.id}`);
          const records = attendanceRes.data;
          const present = records.filter((r: any) => r.status === 'present' || r.status === 'late').length;
          setAttendanceStats({
            total: records.length,
            present,
            rate: records.length > 0 ? Math.round((present / records.length) * 100) : 0,
          });
        } catch {
          setAttendanceStats({ total: 0, present: 0, rate: 0 });
        }

        // Load recent payments
        try {
          const paymentsRes = await api.get('/payments/history');
          setRecentPayments(paymentsRes.data.slice(0, 3));
        } catch {
          setRecentPayments([]);
        }
      }

      // Load notifications
      try {
        const notifRes = await api.get('/notifications');
        setNotifications(notifRes.data.slice(0, 10));
      } catch {
        setNotifications([]);
      }
    } catch (error) {
      console.error('Error loading parent data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useLiveRefresh(loadParentData, user?.role === 'parent', 'parent-dashboard', 5000);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(getActiveLocale(), { month: 'short', day: 'numeric' });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(getActiveLocale()).format(amount) + ' UZS';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return COLORS.success;
      case 'completed': return COLORS.success;
      case 'pending': return COLORS.warning;
      default: return COLORS.textSecondary;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome, Parent</Text>
          <Text style={styles.subtitle}>{user?.full_name || 'Parent Portal'}</Text>
        </View>
        <TouchableOpacity
          style={styles.notificationButton}
          onPress={() => router.push('/(dashboard)/notifications')}
        >
          <Ionicons name="notifications" size={24} color={COLORS.textPrimary} />
          {unreadNotifications > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{unreadNotifications}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadParentData(); }} tintColor={COLORS.gold} />
        }
      >
        {/* Child Profile Card */}
        {child && (
          <View style={styles.childCard}>
            <View style={styles.childHeader}>
              <View style={styles.childAvatar}>
                <Text style={styles.avatarText}>
                  {child.first_name[0]}{child.last_name[0]}
                </Text>
              </View>
              <View style={styles.childInfo}>
                <Text style={styles.childName}>{child.first_name} {child.last_name}</Text>
                <Text style={styles.childId}>{child.student_id}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(child.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(child.status) }]}>
                    {child.status}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.childArtwork}>
              <AcademyIllustration variant="parent" compact />
            </View>
          </View>
        )}

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          <TouchableOpacity style={styles.statCard} onPress={() => router.push('/(dashboard)/attendance')}>
            <Ionicons name="calendar" size={24} color={COLORS.info} />
            <Text style={[styles.statValue, { color: attendanceStats?.rate && attendanceStats.rate >= 80 ? COLORS.success : COLORS.warning }]}>
              {attendanceStats?.rate || 0}%
            </Text>
            <Text style={styles.statLabel}>Attendance</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.statCard} onPress={() => router.push('/(dashboard)/homework')}>
            <Ionicons name="book" size={24} color={COLORS.gold} />
            <Text style={styles.statValue}>View</Text>
            <Text style={styles.statLabel}>Homework</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.statCard} onPress={() => router.push('/(dashboard)/tests')}>
            <Ionicons name="clipboard" size={24} color={COLORS.success} />
            <Text style={styles.statValue}>View</Text>
            <Text style={styles.statLabel}>Tests</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(dashboard)/progress')}>
            <Ionicons name="analytics" size={28} color={COLORS.gold} />
            <Text style={styles.actionText}>Progress</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(dashboard)/payments')}>
            <Ionicons name="card" size={28} color={COLORS.gold} />
            <Text style={styles.actionText}>Payments</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(dashboard)/certificates')}>
            <Ionicons name="ribbon" size={28} color={COLORS.gold} />
            <Text style={styles.actionText}>Certificates</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(dashboard)/attendance')}>
            <Ionicons name="checkbox" size={28} color={COLORS.gold} />
            <Text style={styles.actionText}>Attendance</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Payments */}
        <Text style={styles.sectionTitle}>Recent Payments</Text>
        {recentPayments.length > 0 ? (
          recentPayments.map((payment) => (
            <View key={payment.id} style={styles.paymentItem}>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentMonth}>Month: {payment.month}</Text>
                <Text style={styles.paymentDate}>{formatDate(payment.created_at)}</Text>
              </View>
              <View style={styles.paymentRight}>
                <Text style={styles.paymentAmount}>{formatAmount(payment.amount)}</Text>
                <View style={[styles.paymentStatus, { backgroundColor: getStatusColor(payment.payment_status) + '20' }]}>
                  <Text style={[styles.paymentStatusText, { color: getStatusColor(payment.payment_status) }]}>
                    {payment.payment_status}
                  </Text>
                </View>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyItem}>
            <Text style={styles.emptyText}>No recent payments</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Notifications Modal */}
      <Modal visible={notificationModalVisible} animationType="slide" transparent={true} onRequestClose={() => setNotificationModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setNotificationModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.notificationList}>
              {notifications.length > 0 ? (
                notifications.map((notif) => (
                  <View key={notif.id} style={[styles.notificationItem, !notif.is_read && styles.notificationUnread]}>
                    <Ionicons
                      name={notif.type === 'payment_reminder' ? 'card' : 'notifications'}
                      size={24}
                      color={notif.is_read ? COLORS.textTertiary : COLORS.gold}
                    />
                    <View style={styles.notificationContent}>
                      <Text style={styles.notificationTitle}>{notif.title}</Text>
                      <Text style={styles.notificationMessage}>{notif.message}</Text>
                      <Text style={styles.notificationDate}>{formatDate(notif.created_at)}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyNotifications}>
                  <Ionicons name="notifications-off-outline" size={48} color={COLORS.textTertiary} />
                  <Text style={styles.emptyText}>No notifications</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: SIZES.headerTop, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.backgroundSubtle, borderBottomWidth: 1, borderBottomColor: COLORS.glassHighlight },
  greeting: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  subtitle: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs },
  notificationButton: { position: 'relative', padding: SIZES.sm },
  notificationBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: COLORS.error, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  notificationBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  content: { flex: 1, padding: SIZES.md },
  childCard: { minHeight: 164, justifyContent: 'center', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusLg, padding: SIZES.lg, paddingRight: 130, marginBottom: SIZES.md, borderWidth: 1, borderColor: COLORS.goldHairline, overflow: 'hidden', ...SHADOWS.small },
  childHeader: { flexDirection: 'row', alignItems: 'center' },
  childArtwork: { position: 'absolute', right: -10, top: 24, opacity: 0.92 },
  childAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  avatarText: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.marbleDark },
  childInfo: { flex: 1 },
  childName: { fontSize: SIZES.fontLg, fontWeight: 'bold', color: COLORS.textPrimary },
  childId: { fontSize: SIZES.fontSm, color: COLORS.gold, marginTop: 2 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: SIZES.sm, paddingVertical: 2, borderRadius: SIZES.radiusSm, marginTop: SIZES.xs },
  statusText: { fontSize: SIZES.fontXs, fontWeight: '600', textTransform: 'capitalize' },
  statsGrid: { flexDirection: 'row', gap: SIZES.sm, marginBottom: SIZES.lg },
  statCard: { flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.glassHighlight, padding: SIZES.md, alignItems: 'center', ...SHADOWS.small },
  statValue: { fontSize: SIZES.fontLg, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: SIZES.sm },
  statLabel: { fontSize: SIZES.fontXs, color: COLORS.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary, marginBottom: SIZES.md, marginTop: SIZES.sm },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm, marginBottom: SIZES.lg },
  actionCard: { width: '48%', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.glassHighlight, padding: SIZES.md, alignItems: 'center', ...SHADOWS.small },
  actionText: { fontSize: SIZES.fontSm, color: COLORS.textPrimary, marginTop: SIZES.sm },
  paymentItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, borderWidth: 1, borderColor: COLORS.glassHighlight, ...SHADOWS.small },
  paymentInfo: { flex: 1 },
  paymentMonth: { fontSize: SIZES.fontMd, fontWeight: '500', color: COLORS.textPrimary },
  paymentDate: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  paymentRight: { alignItems: 'flex-end' },
  paymentAmount: { fontSize: SIZES.fontMd, fontWeight: 'bold', color: COLORS.gold },
  paymentStatus: { paddingHorizontal: SIZES.sm, paddingVertical: 2, borderRadius: SIZES.radiusSm, marginTop: 4 },
  paymentStatusText: { fontSize: SIZES.fontXs, fontWeight: '600', textTransform: 'capitalize' },
  emptyItem: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.glassHighlight, padding: SIZES.lg, alignItems: 'center' },
  emptyText: { fontSize: SIZES.fontSm, color: COLORS.textTertiary },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, maxHeight: '80%', paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SIZES.lg, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  modalTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  notificationList: { padding: SIZES.md },
  notificationItem: { flexDirection: 'row', backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, gap: SIZES.md },
  notificationUnread: { backgroundColor: COLORS.gold + '15', borderLeftWidth: 3, borderLeftColor: COLORS.gold },
  notificationContent: { flex: 1 },
  notificationTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  notificationMessage: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: 2 },
  notificationDate: { fontSize: SIZES.fontXs, color: COLORS.textTertiary, marginTop: SIZES.xs },
  emptyNotifications: { alignItems: 'center', paddingVertical: SIZES.xxl },
});
