import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';

interface Booking {
  id: string;
  student_id: string;
  support_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  notes?: string;
  session_notes?: string;
}

interface Student {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
}

export default function SupportHomeScreen() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'today' | 'all'>('today');
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [sessionNotes, setSessionNotes] = useState('');

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    loadSupportData();
  }, []);

  const loadSupportData = async () => {
    try {
      const [studentsRes] = await Promise.all([
        api.get('/students'),
      ]);
      setStudents(studentsRes.data);

      // Load support bookings from backend
      try {
        const bookingsRes = await api.get('/support-bookings');
        setBookings(bookingsRes.data);
      } catch (e) {
        console.log('No bookings found or API not available');
        setBookings([]);
      }
    } catch (error) {
      console.error('Error loading support data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAcceptBooking = async (bookingId: string) => {
    try {
      await api.put(`/support-bookings/${bookingId}/confirm`);
      Alert.alert('Success', 'Booking confirmed');
      loadSupportData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to confirm booking');
    }
  };

  const handleRejectBooking = async (bookingId: string) => {
    Alert.alert('Reject Booking', 'Are you sure you want to cancel this booking?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.put(`/support-bookings/${bookingId}/cancel`);
            Alert.alert('Success', 'Booking cancelled');
            loadSupportData();
          } catch (error: any) {
            Alert.alert('Error', error.response?.data?.detail || 'Failed to cancel booking');
          }
        },
      },
    ]);
  };

  const handleSaveNotes = async () => {
    if (!selectedBooking) return;
    try {
      await api.put(`/support-bookings/${selectedBooking.id}/complete`, { session_notes: sessionNotes });
      Alert.alert('Success', 'Session completed with notes');
      setNotesModalVisible(false);
      setSessionNotes('');
      loadSupportData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save notes');
    }
  };

  const openNotesModal = (booking: Booking) => {
    setSelectedBooking(booking);
    setSessionNotes(booking.session_notes || '');
    setNotesModalVisible(true);
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student ? `${student.first_name} ${student.last_name}` : 'Unknown';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return COLORS.success;
      case 'pending': return COLORS.warning;
      case 'completed': return COLORS.info;
      case 'cancelled': return COLORS.error;
      default: return COLORS.textSecondary;
    }
  };

  const getFilteredBookings = () => {
    switch (activeTab) {
      case 'pending':
        return bookings.filter(b => b.status === 'pending');
      case 'today':
        return bookings.filter(b => b.booking_date === today);
      default:
        return bookings;
    }
  };

  const pendingCount = bookings.filter(b => b.status === 'pending').length;
  const todayCount = bookings.filter(b => b.booking_date === today).length;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  const filteredBookings = getFilteredBookings();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome, Support</Text>
          <Text style={styles.subtitle}>{user?.full_name || 'Support Portal'}</Text>
        </View>
        <View style={styles.headerBadge}>
          <Ionicons name="headset" size={24} color={COLORS.gold} />
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="time" size={24} color={COLORS.warning} />
          <Text style={styles.statValue}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="today" size={24} color={COLORS.success} />
          <Text style={styles.statValue}>{todayCount}</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="calendar" size={24} color={COLORS.info} />
          <Text style={styles.statValue}>{bookings.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'pending' && styles.tabButtonActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'today' && styles.tabButtonActive]}
          onPress={() => setActiveTab('today')}
        >
          <Text style={[styles.tabText, activeTab === 'today' && styles.tabTextActive]}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'all' && styles.tabButtonActive]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>All</Text>
        </TouchableOpacity>
      </View>

      {/* Bookings List */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSupportData(); }} tintColor={COLORS.gold} />
        }
      >
        {filteredBookings.length > 0 ? (
          filteredBookings.map((booking) => (
            <View key={booking.id} style={styles.bookingCard}>
              <View style={styles.bookingHeader}>
                <View style={styles.bookingTime}>
                  <Ionicons name="time" size={18} color={COLORS.gold} />
                  <Text style={styles.timeText}>{booking.start_time} - {booking.end_time}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(booking.status) }]}>
                    {booking.status}
                  </Text>
                </View>
              </View>

              <View style={styles.bookingInfo}>
                <Text style={styles.studentName}>{getStudentName(booking.student_id)}</Text>
                <Text style={styles.bookingDate}>{formatDate(booking.booking_date)}</Text>
                {booking.notes && (
                  <Text style={styles.bookingNotes}>{booking.notes}</Text>
                )}
              </View>

              {booking.status === 'pending' && (
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.acceptBtn]}
                    onPress={() => handleAcceptBooking(booking.id)}
                  >
                    <Ionicons name="checkmark" size={18} color={COLORS.success} />
                    <Text style={[styles.actionBtnText, { color: COLORS.success }]}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={() => handleRejectBooking(booking.id)}
                  >
                    <Ionicons name="close" size={18} color={COLORS.error} />
                    <Text style={[styles.actionBtnText, { color: COLORS.error }]}>Reject</Text>
                  </TouchableOpacity>
                </View>
              )}

              {booking.status === 'confirmed' && (
                <TouchableOpacity
                  style={styles.notesButton}
                  onPress={() => openNotesModal(booking)}
                >
                  <Ionicons name="create" size={18} color={COLORS.gold} />
                  <Text style={styles.notesButtonText}>Add Session Notes</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>
              {activeTab === 'pending' ? 'No pending bookings' :
               activeTab === 'today' ? 'No bookings for today' :
               'No bookings yet'}
            </Text>
            <Text style={styles.emptySubtext}>Bookings will appear here when students request support sessions</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Notes Modal */}
      <Modal visible={notesModalVisible} animationType="slide" transparent={true} onRequestClose={() => setNotesModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Session Notes</Text>
              <TouchableOpacity onPress={() => setNotesModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalForm}>
              {selectedBooking && (
                <Text style={styles.modalStudentName}>{getStudentName(selectedBooking.student_id)}</Text>
              )}

              <Input
                label="Session Notes"
                value={sessionNotes}
                onChangeText={setSessionNotes}
                placeholder="Enter notes about this session..."
                multiline
                numberOfLines={6}
              />

              <Button title="Save Notes" onPress={handleSaveNotes} style={{ marginTop: SIZES.lg }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark },
  greeting: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  subtitle: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs },
  headerBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.gold + '20', justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', padding: SIZES.md, gap: SIZES.sm },
  statCard: { flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, alignItems: 'center', ...SHADOWS.small },
  statValue: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: SIZES.xs },
  statLabel: { fontSize: SIZES.fontXs, color: COLORS.textSecondary, marginTop: 2 },
  tabContainer: { flexDirection: 'row', paddingHorizontal: SIZES.md, gap: SIZES.sm, marginBottom: SIZES.sm },
  tabButton: { flex: 1, paddingVertical: SIZES.sm, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundCard, alignItems: 'center' },
  tabButtonActive: { backgroundColor: COLORS.gold },
  tabText: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.marbleDark },
  content: { flex: 1, paddingHorizontal: SIZES.md },
  bookingCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, ...SHADOWS.small },
  bookingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SIZES.sm },
  bookingTime: { flexDirection: 'row', alignItems: 'center', gap: SIZES.xs },
  timeText: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.gold },
  statusBadge: { paddingHorizontal: SIZES.sm, paddingVertical: 4, borderRadius: SIZES.radiusSm },
  statusText: { fontSize: SIZES.fontXs, fontWeight: '600', textTransform: 'capitalize' },
  bookingInfo: { marginBottom: SIZES.sm },
  studentName: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  bookingDate: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: 2 },
  bookingNotes: { fontSize: SIZES.fontSm, color: COLORS.textTertiary, marginTop: SIZES.xs, fontStyle: 'italic' },
  actionButtons: { flexDirection: 'row', gap: SIZES.sm, marginTop: SIZES.sm, paddingTop: SIZES.sm, borderTopWidth: 1, borderTopColor: COLORS.marbleGray },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SIZES.sm, borderRadius: SIZES.radiusMd, gap: SIZES.xs },
  acceptBtn: { backgroundColor: COLORS.success + '20' },
  rejectBtn: { backgroundColor: COLORS.error + '20' },
  actionBtnText: { fontSize: SIZES.fontSm, fontWeight: '600' },
  notesButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold + '20', paddingVertical: SIZES.sm, borderRadius: SIZES.radiusMd, marginTop: SIZES.sm, gap: SIZES.xs },
  notesButtonText: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.gold },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: SIZES.xxl },
  emptyText: { fontSize: SIZES.fontMd, color: COLORS.textTertiary, marginTop: SIZES.md },
  emptySubtext: { fontSize: SIZES.fontSm, color: COLORS.textTertiary, marginTop: SIZES.xs, textAlign: 'center', paddingHorizontal: SIZES.lg },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SIZES.lg, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  modalTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  modalForm: { padding: SIZES.lg },
  modalStudentName: { fontSize: SIZES.fontLg, fontWeight: '600', color: COLORS.textPrimary, marginBottom: SIZES.lg, textAlign: 'center' },
});
