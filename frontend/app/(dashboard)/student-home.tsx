import { getActiveLocale } from '../../src/i18n/translations';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { Text } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { useUnreadNotifications } from '../../src/hooks/use-unread-notifications';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';
import { showAlert, showConfirm } from '../../src/utils/cross-platform-alert';

interface StudentProfile {
  id: string;
  user_id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  status: string;
  group_ids: string[];
  course_ids: string[];
}

interface Group {
  id: string;
  name: string;
  course_id: string;
  schedule: { day: string; start_time: string; end_time: string; room?: string }[];
}

interface SupportStaff {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
}

interface TimeSlot {
  start: string;
  end: string;
}

interface Booking {
  id: string;
  booking_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  support_name?: string;
  topic?: string;
}

interface AttendanceStats {
  total: number;
  present: number;
  rate: number;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export default function StudentHomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const unreadCount = useUnreadNotifications();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats | null>(null);
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [supportStaff, setSupportStaff] = useState<SupportStaff[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Booking modal state
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<SupportStaff | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [bookingTopic, setBookingTopic] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  
  // Notification modal
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);

  const loadStudentData = useCallback(async () => {
    try {
      // Get student profile (filtered by backend for student role)
      const studentsRes = await api.get('/students');
      const currentUserId = user?.id || user?._id;
      const studentProfile = studentsRes.data.find(
        (student: StudentProfile) => student.user_id === currentUserId
      ) || studentsRes.data[0];
      setProfile(studentProfile);

      if (studentProfile) {
        // Load groups
        try {
          const groupsRes = await api.get('/groups');
          setGroups(groupsRes.data);
        } catch {
          setGroups([]);
        }

        // Load attendance stats
        try {
          const attendanceRes = await api.get(`/attendance/student/${studentProfile.id}`);
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

        // Load support bookings
        try {
          const bookingsRes = await api.get('/support-bookings');
          setUpcomingBookings(bookingsRes.data.filter((b: Booking) => 
            b.status === 'scheduled' || b.status === 'confirmed'
          ).slice(0, 5));
        } catch {
          setUpcomingBookings([]);
        }
      }

      // Load support staff
      try {
        const supportRes = await api.get('/support');
        setSupportStaff(supportRes.data);
      } catch {
        setSupportStaff([]);
      }

      try {
        const notificationRes = await api.get('/notifications', { params: { limit: 20 } });
        setNotifications(notificationRes.data);
      } catch {
        setNotifications([]);
      }

    } catch (error) {
      console.error('Error loading student data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, user?._id]);

  useFocusEffect(
    useCallback(() => {
      loadStudentData();
    }, [loadStudentData])
  );

  const refreshStudentMembership = useCallback(async () => {
    try {
      const [studentsRes, groupsRes] = await Promise.all([
        api.get('/students'),
        api.get('/groups'),
      ]);
      const currentUserId = user?.id || user?._id;
      const currentProfile = studentsRes.data.find(
        (student: StudentProfile) => student.user_id === currentUserId
      ) || studentsRes.data[0] || null;
      setProfile(currentProfile);
      setGroups(groupsRes.data);
    } catch (error) {
      console.error('Error refreshing student group membership:', error);
    }
  }, [user?.id, user?._id]);

  useLiveRefresh(
    async () => {
      await Promise.all([loadStudentData(), refreshStudentMembership()]);
    },
    Boolean(user),
    `student-home:${user?.id || user?._id || ''}`,
    3000,
  );

  const loadAvailableSlots = useCallback(async () => {
    if (!selectedStaff || !selectedDate) return;
    
    setLoadingSlots(true);
    try {
      const res = await api.get('/support-bookings/available-slots', {
        params: {
          support_staff_id: selectedStaff.id,
          date: selectedDate
        }
      });
      setAvailableSlots(res.data.available_slots || []);
    } catch (error) {
      console.error('Error loading slots:', error);
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [selectedStaff, selectedDate]);

  useEffect(() => {
    if (selectedStaff && selectedDate) {
      loadAvailableSlots();
    }
  }, [selectedStaff, selectedDate, loadAvailableSlots]);

  const handleBookSession = async () => {
    if (!selectedStaff || !selectedDate || !selectedSlot) {
      Alert.alert('Error', 'Please select all booking details');
      return;
    }

    setBookingLoading(true);
    try {
      await api.post('/support-bookings', {
        support_staff_id: selectedStaff.id,
        booking_date: selectedDate,
        start_time: selectedSlot.start,
        duration_minutes: 40,
        topic: bookingTopic || 'General Support',
      });

      Alert.alert('Success', 'Support session booked successfully!');
      setBookingModalVisible(false);
      resetBookingForm();
      loadStudentData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to book session');
    } finally {
      setBookingLoading(false);
    }
  };

  const cancelOwnBooking = (booking: Booking) => {
    showConfirm(
      'Cancel support booking?',
      'Are you sure you want to cancel this booking?',
      async () => {
        setCancellingBookingId(booking.id);
        try {
          await api.put(`/support-bookings/${booking.id}/cancel`);
          setUpcomingBookings((current) => current.filter((row) => row.id !== booking.id));
        } catch (error: any) {
          showAlert('Cancellation failed', error.response?.data?.detail || 'The booking could not be cancelled.');
        } finally {
          setCancellingBookingId(null);
        }
      },
      'Cancel booking',
    );
  };

  const resetBookingForm = () => {
    setSelectedStaff(null);
    setSelectedDate('');
    setSelectedSlot(null);
    setBookingTopic('');
    setAvailableSlots([]);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(getActiveLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return COLORS.success;
      case 'scheduled': return COLORS.info;
      case 'confirmed': return COLORS.success;
      default: return COLORS.textSecondary;
    }
  };

  const getNextDates = () => {
    const dates: string[] = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      // Skip weekends
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        dates.push(date.toISOString().split('T')[0]);
      }
    }
    return dates;
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
          <Text style={styles.greeting}>Welcome, Student</Text>
          <Text style={styles.subtitle}>{profile?.first_name} {profile?.last_name}</Text>
          {profile?.student_id && (
            <Text style={styles.studentId}>{profile.student_id}</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.notificationButton}
          onPress={() => router.push('/(dashboard)/notifications')}
        >
          <Ionicons name="notifications" size={24} color={COLORS.textPrimary} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStudentData(); }} tintColor={COLORS.gold} />
        }
      >
        {/* Profile Card */}
        {profile && (
          <View style={styles.profileCard}>
            <View style={styles.profileAvatar}>
              <Text style={styles.avatarText}>
                {profile.first_name[0]}{profile.last_name[0]}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{profile.first_name} {profile.last_name}</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(profile.status) + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(profile.status) }]}>
                  {profile.status}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Quick Stats */}
        <View style={styles.statsRow}>
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
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(dashboard)/certificates')}>
            <Ionicons name="ribbon" size={28} color={COLORS.gold} />
            <Text style={styles.actionText}>Certificates</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(dashboard)/attendance')}>
            <Ionicons name="checkbox" size={28} color={COLORS.gold} />
            <Text style={styles.actionText}>Attendance</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => setBookingModalVisible(true)}>
            <Ionicons name="headset" size={28} color={COLORS.gold} />
            <Text style={styles.actionText}>Book Support</Text>
          </TouchableOpacity>
        </View>

        {/* My Groups */}
        {groups.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>My Groups</Text>
            {groups.map((group) => (
              <View key={group.id} style={styles.groupCard}>
                <View style={styles.groupIcon}>
                  <Ionicons name="people-circle" size={32} color={COLORS.gold} />
                </View>
                <View style={styles.groupInfo}>
                  <Text style={styles.groupName}>{group.name}</Text>
                  {group.schedule && group.schedule.length > 0 && (
                    <Text style={styles.groupSchedule}>
                      {group.schedule.map(s => `${s.day} ${s.start_time}`).join(', ')}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {/* Upcoming Support Sessions */}
        {upcomingBookings.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Upcoming Support Sessions</Text>
            {upcomingBookings.map((booking) => (
              <View key={booking.id} testID={`student-booking-${booking.id}`} style={styles.bookingCard}>
                <View style={styles.bookingTime}>
                  <Ionicons name="time" size={18} color={COLORS.gold} />
                  <Text style={styles.bookingTimeText}>{booking.start_time} - {booking.end_time}</Text>
                </View>
                <Text style={styles.bookingDate}>{formatDate(booking.booking_date)}</Text>
                {booking.support_name && (
                  <Text style={styles.bookingSupportName}>with {booking.support_name}</Text>
                )}
                <View style={[styles.bookingStatus, { backgroundColor: getStatusColor(booking.status) + '20' }]}>
                  <Text style={[styles.bookingStatusText, { color: getStatusColor(booking.status) }]}>
                    {booking.status}
                  </Text>
                </View>
                <TouchableOpacity
                  testID={`student-cancel-booking-${booking.id}`}
                  accessibilityRole="button"
                  disabled={cancellingBookingId === booking.id}
                  style={styles.bookingCancelButton}
                  onPress={() => cancelOwnBooking(booking)}
                >
                  {cancellingBookingId === booking.id
                    ? <ActivityIndicator size="small" color={COLORS.error} />
                    : <Text style={styles.bookingCancelText}>Cancel booking</Text>}
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Book Support Modal */}
      <Modal visible={bookingModalVisible} animationType="slide" transparent onRequestClose={() => setBookingModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Book Support Session</Text>
              <TouchableOpacity onPress={() => { setBookingModalVisible(false); resetBookingForm(); }}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Step 1: Select Support Staff */}
              <Text style={styles.stepTitle}>1. Select Support Staff</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.staffList}>
                {supportStaff.map((staff) => (
                  <TouchableOpacity
                    key={staff.id}
                    style={[styles.staffCard, selectedStaff?.id === staff.id && styles.staffCardSelected]}
                    onPress={() => setSelectedStaff(staff)}
                  >
                    <View style={styles.staffAvatar}>
                      <Text style={styles.staffAvatarText}>
                        {staff.first_name[0]}{staff.last_name[0]}
                      </Text>
                    </View>
                    <Text style={styles.staffName}>{staff.first_name} {staff.last_name}</Text>
                  </TouchableOpacity>
                ))}
                {supportStaff.length === 0 && (
                  <Text style={styles.emptyText}>No support staff available</Text>
                )}
              </ScrollView>

              {/* Step 2: Select Date */}
              {selectedStaff && (
                <>
                  <Text style={styles.stepTitle}>2. Select Date</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateList}>
                    {getNextDates().map((date) => (
                      <TouchableOpacity
                        key={date}
                        style={[styles.dateCard, selectedDate === date && styles.dateCardSelected]}
                        onPress={() => setSelectedDate(date)}
                      >
                        <Text style={[styles.dateDay, selectedDate === date && styles.dateTextSelected]}>
                          {new Date(date).toLocaleDateString(getActiveLocale(), { weekday: 'short' })}
                        </Text>
                        <Text style={[styles.dateNum, selectedDate === date && styles.dateTextSelected]}>
                          {new Date(date).getDate()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Step 3: Select Time Slot */}
              {selectedDate && (
                <>
                  <Text style={styles.stepTitle}>3. Select Time (40 min sessions)</Text>
                  {loadingSlots ? (
                    <ActivityIndicator size="small" color={COLORS.gold} style={{ marginVertical: SIZES.md }} />
                  ) : (
                    <View style={styles.slotGrid}>
                      {availableSlots.map((slot, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.slotCard, selectedSlot?.start === slot.start && styles.slotCardSelected]}
                          onPress={() => setSelectedSlot(slot)}
                        >
                          <Text style={[styles.slotText, selectedSlot?.start === slot.start && styles.slotTextSelected]}>
                            {slot.start}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      {availableSlots.length === 0 && (
                        <Text style={styles.emptyText}>No slots available for this date</Text>
                      )}
                    </View>
                  )}
                </>
              )}

              {/* Step 4: Topic (Optional) */}
              {selectedSlot && (
                <>
                  <Text style={styles.stepTitle}>4. Topic (Optional)</Text>
                  <Input
                    value={bookingTopic}
                    onChangeText={setBookingTopic}
                    placeholder="What would you like help with?"
                    multiline
                    numberOfLines={2}
                  />
                </>
              )}

              {/* Book Button */}
              {selectedStaff && selectedDate && selectedSlot && (
                <View style={styles.bookingSummary}>
                  <Text style={styles.summaryTitle}>Booking Summary</Text>
                  <Text style={styles.summaryText}>
                    {selectedStaff.first_name} {selectedStaff.last_name}
                  </Text>
                  <Text style={styles.summaryText}>
                    {formatDate(selectedDate)} at {selectedSlot.start}
                  </Text>
                  <Text style={styles.summaryText}>Duration: 40 minutes</Text>
                  
                  <Button
                    title={bookingLoading ? 'Booking...' : 'Confirm Booking'}
                    onPress={handleBookSession}
                    disabled={bookingLoading}
                    style={{ marginTop: SIZES.md }}
                  />
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Notifications Modal */}
      <Modal visible={notificationModalVisible} animationType="slide" transparent onRequestClose={() => setNotificationModalVisible(false)}>
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
                  <View key={notif.id} style={[styles.notifItem, !notif.is_read && styles.notifUnread]}>
                    <Ionicons name="notifications" size={20} color={COLORS.gold} />
                    <View style={styles.notifContent}>
                      <Text style={styles.notifTitle}>{notif.title}</Text>
                      <Text style={styles.notifMessage}>{notif.message}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyNotifs}>
                  <Ionicons name="notifications-off-outline" size={48} color={COLORS.textTertiary} />
                  <Text style={styles.emptyText}>No notifications yet</Text>
                  <Text style={styles.emptySubtext}>
                    You&apos;ll receive lesson reminders, homework updates, and more here
                  </Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: SIZES.headerTop, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark },
  greeting: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  subtitle: { fontSize: SIZES.fontMd, color: COLORS.textSecondary, marginTop: SIZES.xs },
  studentId: { fontSize: SIZES.fontSm, color: COLORS.gold, marginTop: 2, fontWeight: '600' },
  notificationButton: { position: 'relative', padding: SIZES.sm },
  badge: { position: 'absolute', top: 0, right: 0, backgroundColor: COLORS.error, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  badgeText: { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  content: { flex: 1, padding: SIZES.md },
  
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.lg, marginBottom: SIZES.md, borderLeftWidth: 4, borderLeftColor: COLORS.gold, ...SHADOWS.small },
  profileAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  avatarText: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.marbleDark },
  profileInfo: { flex: 1 },
  profileName: { fontSize: SIZES.fontLg, fontWeight: 'bold', color: COLORS.textPrimary },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: SIZES.sm, paddingVertical: 2, borderRadius: SIZES.radiusSm, marginTop: SIZES.xs },
  statusText: { fontSize: SIZES.fontXs, fontWeight: '600', textTransform: 'capitalize' },
  
  statsRow: { flexDirection: 'row', gap: SIZES.sm, marginBottom: SIZES.lg },
  statCard: { flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, alignItems: 'center', ...SHADOWS.small },
  statValue: { fontSize: SIZES.fontLg, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: SIZES.sm },
  statLabel: { fontSize: SIZES.fontXs, color: COLORS.textSecondary, marginTop: 2 },
  
  sectionTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary, marginBottom: SIZES.md, marginTop: SIZES.sm },
  
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm, marginBottom: SIZES.lg },
  actionCard: { width: '48%', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, alignItems: 'center', ...SHADOWS.small },
  actionText: { fontSize: SIZES.fontSm, color: COLORS.textPrimary, marginTop: SIZES.sm },
  
  groupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, ...SHADOWS.small },
  groupIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.gold + '20', justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  groupInfo: { flex: 1 },
  groupName: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  groupSchedule: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: 2 },
  
  bookingCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, ...SHADOWS.small },
  bookingTime: { flexDirection: 'row', alignItems: 'center', gap: SIZES.xs },
  bookingTimeText: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.gold },
  bookingDate: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: 4 },
  bookingSupportName: { fontSize: SIZES.fontSm, color: COLORS.textPrimary, marginTop: 2 },
  bookingStatus: { alignSelf: 'flex-start', paddingHorizontal: SIZES.sm, paddingVertical: 2, borderRadius: SIZES.radiusSm, marginTop: SIZES.xs },
  bookingStatusText: { fontSize: SIZES.fontXs, fontWeight: '600', textTransform: 'capitalize' },
  bookingCancelButton: { alignSelf: 'flex-start', minHeight: SIZES.touchTarget, marginTop: SIZES.sm, paddingHorizontal: SIZES.md, justifyContent: 'center', borderRadius: SIZES.radiusSm, borderWidth: 1, borderColor: COLORS.error + '66' },
  bookingCancelText: { color: COLORS.error, fontSize: SIZES.fontSm, fontWeight: '700' },
  
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, maxHeight: '90%', paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SIZES.lg, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  modalTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  modalBody: { padding: SIZES.lg },
  
  stepTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.gold, marginBottom: SIZES.sm, marginTop: SIZES.md },
  
  staffList: { flexDirection: 'row', marginBottom: SIZES.md },
  staffCard: { alignItems: 'center', padding: SIZES.md, marginRight: SIZES.sm, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundLight, minWidth: 80 },
  staffCardSelected: { backgroundColor: COLORS.gold + '30', borderWidth: 2, borderColor: COLORS.gold },
  staffAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center', marginBottom: SIZES.xs },
  staffAvatarText: { fontSize: SIZES.fontMd, fontWeight: 'bold', color: COLORS.marbleDark },
  staffName: { fontSize: SIZES.fontXs, color: COLORS.textPrimary, textAlign: 'center' },
  
  dateList: { flexDirection: 'row', marginBottom: SIZES.md },
  dateCard: { alignItems: 'center', padding: SIZES.sm, marginRight: SIZES.sm, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundLight, minWidth: 56 },
  dateCardSelected: { backgroundColor: COLORS.gold },
  dateDay: { fontSize: SIZES.fontXs, color: COLORS.textSecondary },
  dateNum: { fontSize: SIZES.fontLg, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: 2 },
  dateTextSelected: { color: COLORS.marbleDark },
  
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm },
  slotCard: { paddingVertical: SIZES.sm, paddingHorizontal: SIZES.md, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundLight },
  slotCardSelected: { backgroundColor: COLORS.gold },
  slotText: { fontSize: SIZES.fontSm, color: COLORS.textPrimary },
  slotTextSelected: { color: COLORS.marbleDark, fontWeight: '600' },
  
  bookingSummary: { marginTop: SIZES.lg, padding: SIZES.md, backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd },
  summaryTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.gold, marginBottom: SIZES.sm },
  summaryText: { fontSize: SIZES.fontSm, color: COLORS.textPrimary, marginBottom: 4 },
  
  notificationList: { padding: SIZES.md },
  notifItem: { flexDirection: 'row', backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, gap: SIZES.md },
  notifUnread: { backgroundColor: COLORS.gold + '15', borderLeftWidth: 3, borderLeftColor: COLORS.gold },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  notifMessage: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: 2 },
  emptyNotifs: { alignItems: 'center', paddingVertical: SIZES.xxl },
  emptyText: { fontSize: SIZES.fontSm, color: COLORS.textTertiary, marginTop: SIZES.md },
  emptySubtext: { fontSize: SIZES.fontXs, color: COLORS.textTertiary, marginTop: SIZES.xs, textAlign: 'center', paddingHorizontal: SIZES.lg },
});
