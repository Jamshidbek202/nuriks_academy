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
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { CalendarDatePicker } from '../../src/components/CalendarDatePicker';
import { dateStringWithOffset } from '../../src/utils/dates';

interface Payment {
  id: string;
  payment_id: string;
  student_id: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  payment_type: string;
  month?: string;
  transaction_id?: string;
  transaction_date?: string;
  notes?: string;
  created_at: string;
}

interface Student {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  status: string;
}

type PaymentMethod = 'cash' | 'click' | 'payme';

export default function PaymentsScreen() {
  const { user } = useAuth();
  const canManagePayments = ['super_admin', 'manager'].includes(user?.role || '');
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [unpaidStudents, setUnpaidStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<'unpaid' | 'history'>('unpaid');

  const [formData, setFormData] = useState({
    student_id: '',
    amount: '',
    payment_method: 'cash' as PaymentMethod,
    month: new Date().toISOString().slice(0, 7),
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      if (canManagePayments) {
        const [studentsRes, paymentsRes, unpaidRes] = await Promise.all([
          api.get('/students'),
          api.get('/payments/history'),
          api.get('/payments/unpaid'),
        ]);
        setStudents(studentsRes.data);
        setPayments(paymentsRes.data);
        setUnpaidStudents(unpaidRes.data);
      } else {
        const [studentsRes, paymentsRes] = await Promise.all([
          api.get('/students'),
          api.get('/payments/history'),
        ]);
        setStudents(studentsRes.data);
        setPayments(paymentsRes.data);
        setUnpaidStudents([]);
        setActiveTab('history');
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCashPayment = async () => {
    if (!formData.student_id || !formData.amount) {
      Alert.alert('Error', 'Please select a student and enter amount');
      return;
    }

    try {
      await api.post('/payments/cash', {
        student_id: formData.student_id,
        amount: parseFloat(formData.amount),
        payment_type: 'monthly_fee',
        month: formData.month,
        notes: formData.notes || null,
      });
      Alert.alert('Success', 'Cash payment recorded successfully');
      setModalVisible(false);
      resetForm();
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to record payment');
    }
  };

  const handleClickPayment = async () => {
    if (!formData.student_id || !formData.amount) {
      Alert.alert('Error', 'Please select a student and enter amount');
      return;
    }

    try {
      const response = await api.post('/payments/click/init', {
        student_id: formData.student_id,
        amount: parseFloat(formData.amount),
        payment_type: 'monthly_fee',
        month: formData.month,
        return_url: 'nuriksacademy://payment-complete',
      });
      
      Alert.alert(
        'Click Payment',
        `Payment ID: ${response.data.payment_id}\n\nClick payment URL generated. In production, this would redirect to Click payment page.`,
        [
          { text: 'OK', onPress: () => { setModalVisible(false); loadData(); } }
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to initiate Click payment');
    }
  };

  const handlePaymePayment = async () => {
    if (!formData.student_id || !formData.amount) {
      Alert.alert('Error', 'Please select a student and enter amount');
      return;
    }

    try {
      const response = await api.post('/payments/payme/init', {
        student_id: formData.student_id,
        amount: parseFloat(formData.amount),
        payment_type: 'monthly_fee',
        month: formData.month,
        return_url: 'nuriksacademy://payment-complete',
      });
      
      Alert.alert(
        'Payme Payment',
        `Payment ID: ${response.data.payment_id}\n\nPayme payment URL generated. In production, this would redirect to Payme payment page.`,
        [
          { text: 'OK', onPress: () => { setModalVisible(false); loadData(); } }
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to initiate Payme payment');
    }
  };

  const handlePayment = () => {
    const amount = Number(formData.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero and no more than 1 trillion UZS.');
      return;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(formData.month)) {
      Alert.alert('Invalid month', 'Month must be a real value in YYYY-MM format.');
      return;
    }
    const [year, month] = formData.month.split('-').map(Number);
    const selectedMonth = year * 12 + month;
    const now = new Date();
    const currentMonth = now.getFullYear() * 12 + now.getMonth() + 1;
    if (selectedMonth < currentMonth - 24 || selectedMonth > currentMonth + 12) {
      Alert.alert('Invalid month', 'Choose a payment month within the past two years or next year.');
      return;
    }

    switch (formData.payment_method) {
      case 'cash':
        handleCashPayment();
        break;
      case 'click':
        handleClickPayment();
        break;
      case 'payme':
        handlePaymePayment();
        break;
    }
  };

  const resetForm = () => {
    setFormData({
      student_id: '',
      amount: '',
      payment_method: 'cash',
      month: new Date().toISOString().slice(0, 7),
      notes: '',
    });
  };

  const openPaymentForStudent = (student: Student) => {
    setFormData({
      ...formData,
      student_id: student.id,
    });
    setModalVisible(true);
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student ? `${student.first_name} ${student.last_name}` : 'Unknown';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('uz-UZ').format(amount) + ' UZS';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return COLORS.success;
      case 'pending': return COLORS.warning;
      case 'failed': return COLORS.error;
      case 'cancelled': return COLORS.textTertiary;
      default: return COLORS.textSecondary;
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'cash': return 'cash-outline';
      case 'click': return 'card-outline';
      case 'payme': return 'phone-portrait-outline';
      default: return 'wallet-outline';
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
          <Text style={styles.headerTitle}>Payments</Text>
          <Text style={styles.headerSubtitle}>Manage student payments</Text>
        </View>
        {canManagePayments && (
          <TouchableOpacity style={styles.addButton} onPress={() => { resetForm(); setModalVisible(true); }}>
            <Ionicons name="add" size={24} color={COLORS.marbleDark} />
          </TouchableOpacity>
        )}
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Ionicons name="alert-circle" size={24} color={COLORS.error} />
          <Text style={styles.statValue}>{unpaidStudents.length}</Text>
          <Text style={styles.statLabel}>Unpaid</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
          <Text style={styles.statValue}>{payments.filter(p => p.payment_status === 'completed').length}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="time" size={24} color={COLORS.warning} />
          <Text style={styles.statValue}>{payments.filter(p => p.payment_status === 'pending').length}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      {/* Tab Buttons */}
      <View style={styles.tabContainer}>
        {canManagePayments && (
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'unpaid' && styles.tabButtonActive]}
            onPress={() => setActiveTab('unpaid')}
          >
            <Ionicons name="warning" size={18} color={activeTab === 'unpaid' ? COLORS.marbleDark : COLORS.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'unpaid' && styles.tabTextActive]}>Unpaid ({unpaidStudents.length})</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'history' && styles.tabButtonActive]}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons name="receipt" size={18} color={activeTab === 'history' ? COLORS.marbleDark : COLORS.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>History</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={COLORS.gold} />
        }
      >
        {activeTab === 'unpaid' ? (
          unpaidStudents.length > 0 ? (
            unpaidStudents.map((student) => (
              <TouchableOpacity
                key={student.id}
                style={styles.unpaidCard}
                onPress={() => openPaymentForStudent(student)}
              >
                <View style={styles.unpaidInfo}>
                  <View style={styles.unpaidAvatar}>
                    <Text style={styles.avatarText}>
                      {student.first_name[0]}{student.last_name[0]}
                    </Text>
                  </View>
                  <View style={styles.unpaidDetails}>
                    <Text style={styles.unpaidName}>{student.first_name} {student.last_name}</Text>
                    <Text style={styles.unpaidId}>{student.student_id}</Text>
                  </View>
                </View>
                <View style={styles.payNowButton}>
                  <Text style={styles.payNowText}>Pay Now</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.gold} />
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
              <Text style={styles.emptyText}>All payments are up to date!</Text>
            </View>
          )
        ) : (
          payments.length > 0 ? (
            payments.slice(0, 50).map((payment) => (
              <View key={payment.id} style={styles.paymentCard}>
                <View style={styles.paymentHeader}>
                  <View style={[styles.methodBadge, { backgroundColor: COLORS.backgroundLight }]}>
                    <Ionicons name={getMethodIcon(payment.payment_method) as any} size={18} color={COLORS.gold} />
                  </View>
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentStudent}>{getStudentName(payment.student_id)}</Text>
                    <Text style={styles.paymentDate}>{formatDate(payment.created_at)}</Text>
                  </View>
                  <View style={styles.paymentAmountContainer}>
                    <Text style={styles.paymentAmount}>{formatAmount(payment.amount)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(payment.payment_status) + '20' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(payment.payment_status) }]}>
                        {payment.payment_status}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.paymentMeta}>
                  <Text style={styles.paymentId}>ID: {payment.payment_id}</Text>
                  {payment.month && <Text style={styles.paymentMonth}>Month: {payment.month}</Text>}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={64} color={COLORS.textTertiary} />
              <Text style={styles.emptyText}>No payment history</Text>
            </View>
          )
        )}
      </ScrollView>

      {/* Payment Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Payment</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.formLabel}>Student</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={formData.student_id}
                  onValueChange={(value) => setFormData({ ...formData, student_id: value })}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                  dropdownIconColor={COLORS.gold}
                >
                  <Picker.Item label="Select student" value="" />
                  {students.map((student) => (
                    <Picker.Item
                      key={student.id}
                      label={`${student.first_name} ${student.last_name} (${student.student_id})`}
                      value={student.id}
                    />
                  ))}
                </Picker>
              </View>

              <Input
                label="Amount (UZS)"
                value={formData.amount}
                onChangeText={(text) => setFormData({ ...formData, amount: text })}
                keyboardType="numeric"
                placeholder="500000"
              />

              <CalendarDatePicker
                label="Payment Month"
                value={formData.month}
                onChange={(month) => setFormData({ ...formData, month })}
                minimumDate={dateStringWithOffset(-730)}
                maximumDate={dateStringWithOffset(365)}
                mode="month"
              />

              <Text style={styles.formLabel}>Payment Method</Text>
              <View style={styles.methodSelector}>
                {(['cash', 'click', 'payme'] as PaymentMethod[]).map((method) => (
                  <TouchableOpacity
                    key={method}
                    style={[styles.methodButton, formData.payment_method === method && styles.methodButtonActive]}
                    onPress={() => setFormData({ ...formData, payment_method: method })}
                  >
                    <Ionicons
                      name={getMethodIcon(method) as any}
                      size={24}
                      color={formData.payment_method === method ? COLORS.marbleDark : COLORS.textSecondary}
                    />
                    <Text style={[styles.methodText, formData.payment_method === method && styles.methodTextActive]}>
                      {method.charAt(0).toUpperCase() + method.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {formData.payment_method === 'cash' && (
                <Input
                  label="Notes"
                  value={formData.notes}
                  onChangeText={(text) => setFormData({ ...formData, notes: text })}
                  placeholder="Optional notes"
                />
              )}

              <Button
                title={formData.payment_method === 'cash' ? 'Record Payment' : `Pay with ${formData.payment_method.charAt(0).toUpperCase() + formData.payment_method.slice(1)}`}
                onPress={handlePayment}
                style={{ marginTop: SIZES.lg }}
              />
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark },
  headerTitle: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  headerSubtitle: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs },
  addButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },
  statsContainer: { flexDirection: 'row', padding: SIZES.md, gap: SIZES.sm },
  statCard: { flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, alignItems: 'center', ...SHADOWS.small },
  statValue: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: SIZES.xs },
  statLabel: { fontSize: SIZES.fontXs, color: COLORS.textSecondary, marginTop: 2 },
  tabContainer: { flexDirection: 'row', paddingHorizontal: SIZES.md, gap: SIZES.sm, marginBottom: SIZES.sm },
  tabButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.backgroundCard, paddingVertical: SIZES.md, borderRadius: SIZES.radiusMd, gap: SIZES.xs },
  tabButtonActive: { backgroundColor: COLORS.gold },
  tabText: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, fontWeight: '600' },
  tabTextActive: { color: COLORS.marbleDark },
  content: { flex: 1, paddingHorizontal: SIZES.md },
  unpaidCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderLeftWidth: 4, borderLeftColor: COLORS.error, ...SHADOWS.small },
  unpaidInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  unpaidAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.error + '20', justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  avatarText: { fontSize: SIZES.fontSm, fontWeight: 'bold', color: COLORS.error },
  unpaidDetails: { flex: 1 },
  unpaidName: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  unpaidId: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  payNowButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.gold + '20', paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, borderRadius: SIZES.radiusMd, gap: 4 },
  payNowText: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.gold },
  paymentCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, ...SHADOWS.small },
  paymentHeader: { flexDirection: 'row', alignItems: 'center' },
  methodBadge: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  paymentInfo: { flex: 1 },
  paymentStudent: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  paymentDate: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  paymentAmountContainer: { alignItems: 'flex-end' },
  paymentAmount: { fontSize: SIZES.fontMd, fontWeight: 'bold', color: COLORS.gold },
  statusBadge: { paddingHorizontal: SIZES.sm, paddingVertical: 2, borderRadius: SIZES.radiusSm, marginTop: 4 },
  statusText: { fontSize: SIZES.fontXs, fontWeight: '600', textTransform: 'capitalize' },
  paymentMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SIZES.sm, paddingTop: SIZES.sm, borderTopWidth: 1, borderTopColor: COLORS.marbleGray },
  paymentId: { fontSize: SIZES.fontXs, color: COLORS.textTertiary },
  paymentMonth: { fontSize: SIZES.fontXs, color: COLORS.textTertiary },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: SIZES.xxl },
  emptyText: { fontSize: SIZES.fontMd, color: COLORS.textTertiary, marginTop: SIZES.md },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, maxHeight: '90%', paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SIZES.lg, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  modalTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  modalForm: { padding: SIZES.lg },
  formLabel: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SIZES.xs, marginTop: SIZES.sm },
  pickerContainer: { backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, overflow: 'hidden', marginBottom: SIZES.md, height: 48, justifyContent: 'center' },
  picker: { width: '100%', height: 48, color: COLORS.textPrimary, backgroundColor: COLORS.backgroundLight },
  pickerItem: { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundLight },
  methodSelector: { flexDirection: 'row', gap: SIZES.sm, marginBottom: SIZES.md },
  methodButton: { flex: 1, alignItems: 'center', paddingVertical: SIZES.md, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundLight, borderWidth: 1, borderColor: COLORS.marbleGray },
  methodButtonActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  methodText: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs },
  methodTextActive: { color: COLORS.marbleDark, fontWeight: '600' },
});
