import { getActiveLocale } from '../../src/i18n/translations';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, LocalizedPickerItem } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as Clipboard from 'expo-clipboard';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SHADOWS, SIZES } from '../../src/constants/theme';
import { useFinanceLiveRefresh } from '../../src/hooks/use-finance-live-refresh';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { DateTimePicker } from '../../src/components/DateTimePicker';
import { showAlert } from '../../src/utils/cross-platform-alert';

interface Student {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
}

interface Invoice {
  id: string;
  invoice_number?: string;
  student_id: string;
  service_month: string;
  status: string;
  payment_status: string;
  gross_tuition_uzs: number;
  discount_amount_uzs: number;
  amount_due_uzs: number;
  amount_paid_uzs: number;
  balance_uzs: number;
  due_date: string;
}

interface Receipt {
  id: string;
  receipt_number: string;
  student_id: string;
  amount_uzs: number;
  allocated_amount_uzs: number;
  advance_amount_uzs: number;
  received_at: string;
  status: string;
  payment_method?: string;
  payment_provider?: string;
}

interface PaymentDestination {
  id: string;
  provider: 'click' | 'payme';
  card_number: string;
  card_last4: string;
  cardholder_name: string;
  label?: string;
  status: 'active' | 'inactive';
}

interface CardPaymentReport {
  id: string;
  student_id: string;
  student_name: string;
  parent_name: string;
  amount_uzs: number;
  paid_at: string;
  reported_at: string;
  provider: 'click' | 'payme';
  destination_last4: string;
  status: 'unresolved' | 'confirmed' | 'rejected';
  resolution_reason?: string;
}

const uzs = (amount: number) => `${new Intl.NumberFormat(getActiveLocale()).format(amount || 0)} UZS`;
const idempotencyKey = (scope: string) => `ui:${scope}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
const formatCard = (number: string) => number.replace(/(\d{4})(?=\d)/g, '$1 ');
const parseWholeUzs = (value: string) => {
  if (!/^\d+$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
};
const tashkentNowInput = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const tashkentDateTime = (value: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`).toLocaleString(getActiveLocale(), {
  timeZone: 'Asia/Tashkent', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

export default function PaymentsScreen() {
  const { user, token } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [destinations, setDestinations] = useState<PaymentDestination[]>([]);
  const [paymentReports, setPaymentReports] = useState<CardPaymentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const reportingPaymentRef = useRef(false);
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);
  const [reportForm, setReportForm] = useState({ destination_id: '', amount: '', paid_at: tashkentNowInput() });

  const studentMap = useMemo(
    () => Object.fromEntries(students.map((student) => [student.id, student])),
    [students],
  );

  const loadData = async () => {
    try {
      const [studentResponse, invoiceResponse, receiptResponse, destinationResponse, reportResponse] = await Promise.all([
        api.get('/students', { params: { limit: 1000 } }),
        api.get('/finance/invoices', { params: { limit: 2000 } }),
        api.get('/finance/receipts', { params: { limit: 500 } }),
        api.get('/finance/payment-destinations'),
        user?.role === 'parent'
          ? api.get('/finance/card-payment-reports', { params: { limit: 500 } })
          : Promise.resolve({ data: [] }),
      ]);
      setStudents(studentResponse.data || []);
      setInvoices(invoiceResponse.data || []);
      setReceipts(receiptResponse.data || []);
      setDestinations(destinationResponse.data || []);
      setPaymentReports(reportResponse.data || []);
    } catch (error) {
      console.error('Error loading official finance ledger:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFinanceLiveRefresh(
    loadData,
    token,
    ['student', 'parent'].includes(user?.role || ''),
    user?.role || '',
  );

  const selectedDestination = destinations.find((row) => row.id === reportForm.destination_id);

  const openPaymentReport = (invoice: Invoice) => {
    const destination = destinations.find((row) => row.status === 'active');
    if (!destination) {
      showAlert('Online payment unavailable', 'The centre has not configured an active Click or Payme receiving card yet.');
      return;
    }
    setPaymentTarget(invoice);
    setReportForm({
      destination_id: destination.id,
      amount: String(invoice.balance_uzs),
      paid_at: tashkentNowInput(),
    });
  };

  const reportPayment = async () => {
    if (reportingPaymentRef.current) return;
    const amount = parseWholeUzs(reportForm.amount);
    if (!paymentTarget || !selectedDestination || amount == null) {
      showAlert('Check payment report', 'Choose the receiving card and enter a whole-UZS payment amount.');
      return;
    }
    reportingPaymentRef.current = true;
    setBusy(true);
    try {
      await api.post('/finance/card-payment-reports', {
        student_id: paymentTarget.student_id,
        destination_id: selectedDestination.id,
        amount_uzs: amount,
        paid_at: reportForm.paid_at,
        idempotency_key: idempotencyKey('card-payment-report'),
      });
      setPaymentTarget(null);
      showAlert('Payment reported', 'The Manager and Super Admin were notified. Your payment remains unresolved until they verify it in the receiving card app.');
      await loadData();
    } catch (error: any) {
      showAlert('Could not report payment', error.response?.data?.detail || error.message || 'Unknown error');
    } finally {
      reportingPaymentRef.current = false;
      setBusy(false);
    }
  };

  const studentName = (studentId: string) => {
    const student = studentMap[studentId];
    return student ? `${student.first_name} ${student.last_name}` : studentId;
  };

  const finalized = invoices.filter((invoice) => invoice.status === 'finalized');
  const totalBalance = finalized.reduce((sum, invoice) => sum + invoice.balance_uzs, 0);
  const totalAdvance = receipts.reduce((sum, receipt) => sum + receipt.advance_amount_uzs, 0);

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.gold} /></View>;
  }

  if (!['student', 'parent'].includes(user?.role || '')) {
    return <View style={styles.loading}><Text style={styles.muted}>Use the Finance page for staff payment operations.</Text></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Payments</Text>
        <Text style={styles.subtitle}>Official invoices, balances, due dates, and cash receipts</Text>
      </View>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInset}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={COLORS.gold} onRefresh={() => { setRefreshing(true); void loadData(); }} />}
      >
        <View style={styles.notice}>
          <Ionicons name="information-circle" size={22} color={COLORS.gold} />
          <Text style={styles.noticeText}>Cash receipts and verified personal-card transfers appear in the official ledger. Reporting a transfer does not reduce the balance until the Manager or Super Admin confirms it in Click or Payme.</Text>
        </View>
        <View style={styles.stats}>
          <Stat label="Outstanding" value={totalBalance} color={totalBalance > 0 ? COLORS.error : COLORS.success} icon="hourglass" />
          <Stat label="Receipt advances" value={totalAdvance} color={COLORS.info} icon="wallet" />
        </View>

        <Text style={styles.sectionTitle}>Invoices</Text>
        {invoices.length === 0 ? <Empty text="No invoices have been issued yet." /> : invoices.map((invoice) => (
          <View key={invoice.id} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{studentName(invoice.student_id)}</Text>
                <Text style={styles.meta}>{invoice.invoice_number || 'Draft invoice'} · lessons from {invoice.service_month}</Text>
              </View>
              <Status value={invoice.status === 'draft' ? 'draft' : invoice.payment_status} />
            </View>
            <View style={styles.divider} />
            <MoneyRow label="Gross lessons" value={invoice.gross_tuition_uzs} />
            {invoice.discount_amount_uzs > 0 && <MoneyRow label="Centre-funded discount" value={-invoice.discount_amount_uzs} />}
            <MoneyRow label="Invoice total" value={invoice.amount_due_uzs} strong />
            <MoneyRow label="Paid" value={invoice.amount_paid_uzs} />
            <MoneyRow label="Balance" value={invoice.balance_uzs} strong danger={invoice.balance_uzs > 0 && invoice.status === 'finalized'} />
            <Text style={styles.dueText}>Due {invoice.due_date}</Text>
            {user?.role === 'parent' && invoice.status === 'finalized' && invoice.balance_uzs > 0 && (
              <Button
                testID={`parent-report-payment-${invoice.id}`}
                title="Pay by Click or Payme"
                onPress={() => openPaymentReport(invoice)}
                style={styles.payButton}
              />
            )}
          </View>
        ))}

        {user?.role === 'parent' && (
          <>
            <Text style={styles.sectionTitle}>Reported card payments</Text>
            {paymentReports.length === 0 ? <Empty text="No card payments have been reported." /> : paymentReports.map((report) => (
              <View key={report.id} testID={`parent-payment-report-${report.id}`} style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={styles.cardTitle}>{report.student_name}</Text>
                    <Text style={styles.meta}>{report.provider.toUpperCase()} •••• {report.destination_last4} · paid {tashkentDateTime(report.paid_at)}</Text>
                  </View>
                  <Status value={report.status} />
                </View>
                <MoneyRow label="Reported amount" value={report.amount_uzs} strong />
                {report.status === 'unresolved' && <Text style={styles.pendingText}>Awaiting staff verification. This amount has not reduced the balance yet.</Text>}
                {report.status === 'rejected' && <Text style={styles.rejectedText}>Reason: {report.resolution_reason || 'Transfer could not be verified.'}</Text>}
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionTitle}>Official receipts</Text>
        {receipts.length === 0 ? <Empty text="No cash receipts have been posted yet." /> : receipts.map((receipt) => (
          <View key={receipt.id} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.receiptIcon}><Ionicons name="receipt" size={20} color={COLORS.gold} /></View>
              <View style={styles.flex}><Text style={styles.cardTitle}>{receipt.receipt_number}</Text><Text style={styles.meta}>{studentName(receipt.student_id)} · {tashkentDateTime(receipt.received_at)}</Text><Text style={styles.meta}>{receipt.payment_method === 'personal_card_transfer' ? `${receipt.payment_provider?.toUpperCase() || 'CARD'} transfer` : 'Cash'}</Text></View>
              <Text style={styles.receiptAmount}>{uzs(receipt.amount_uzs)}</Text>
            </View>
            <Text style={styles.meta}>Applied to debt: {uzs(receipt.allocated_amount_uzs)} · advance: {uzs(receipt.advance_amount_uzs)}</Text>
          </View>
        ))}
        <View style={{ height: SIZES.xl }} />
      </ScrollView>

      <Modal visible={Boolean(paymentTarget)} transparent animationType="fade" onRequestClose={() => !busy && setPaymentTarget(null)}>
        <View style={styles.modalOverlay}>
          <View testID="parent-card-payment-modal" style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.flex}>
                <Text style={styles.modalTitle}>Pay by personal card transfer</Text>
                <Text style={styles.meta}>{paymentTarget ? studentName(paymentTarget.student_id) : ''}</Text>
              </View>
              <TouchableOpacity disabled={busy} accessibilityRole="button" accessibilityLabel="Close card payment" style={styles.closeButton} onPress={() => setPaymentTarget(null)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Receiving card</Text>
              <View style={styles.pickerBox}>
                <Picker testID="parent-payment-destination" selectedValue={reportForm.destination_id} onValueChange={(destination_id) => setReportForm({ ...reportForm, destination_id })} style={styles.picker} dropdownIconColor={COLORS.gold}>
                  {destinations.filter((row) => row.status === 'active').map((row) => <LocalizedPickerItem key={row.id} label={`${row.provider.toUpperCase()} · •••• ${row.card_last4} · ${row.cardholder_name}`} value={row.id} />)}
                </Picker>
              </View>
              {selectedDestination && (
                <View style={styles.destinationCard}>
                  <View style={styles.row}><Text style={styles.providerName}>{selectedDestination.provider.toUpperCase()}</Text><Text style={styles.cardNumber}>{formatCard(selectedDestination.card_number)}</Text></View>
                  <Text style={styles.cardholder}>{selectedDestination.cardholder_name}</Text>
                  <Button title="Copy card number" variant="outline" onPress={() => void Clipboard.setStringAsync(selectedDestination.card_number).then(() => showAlert('Copied', 'Card number copied.'))} />
                </View>
              )}
              <Input testID="parent-payment-amount" label="Amount transferred (whole UZS)" keyboardType="number-pad" value={reportForm.amount} onChangeText={(amount) => setReportForm({ ...reportForm, amount })} />
              <DateTimePicker testID="parent-payment-paid-at" label="When did you make the transfer? (Tashkent time)" value={reportForm.paid_at} onChange={(paid_at) => setReportForm({ ...reportForm, paid_at })} />
              <View style={styles.confirmNotice}><Ionicons name="alert-circle" size={20} color={COLORS.warning} /><Text style={styles.noticeText}>Reported by {user?.full_name}. Pressing the button only notifies staff; it does not mark the invoice paid.</Text></View>
              <View style={styles.modalActions}>
                <Button title="Cancel" variant="outline" onPress={() => setPaymentTarget(null)} disabled={busy} style={styles.flexButton} />
                <Button testID="parent-payment-submit" title="I have paid — notify staff" onPress={reportPayment} loading={busy} style={styles.flexButton} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Stat({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return <View style={styles.stat}><Ionicons name={icon as any} size={22} color={color} /><Text style={styles.statValue}>{uzs(value)}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function MoneyRow({ label, value, strong, danger }: { label: string; value: number; strong?: boolean; danger?: boolean }) {
  return <View style={styles.moneyRow}><Text style={[styles.moneyLabel, strong && styles.strong]}>{label}</Text><Text style={[styles.moneyValue, strong && styles.strong, danger && styles.danger]}>{value < 0 ? '−' : ''}{uzs(Math.abs(value))}</Text></View>;
}

function Status({ value }: { value: string }) {
  const color = ['paid', 'confirmed'].includes(value) ? COLORS.success : ['partial', 'draft', 'unresolved'].includes(value) ? COLORS.warning : COLORS.error;
  return <View style={[styles.badge, { backgroundColor: color + '22' }]}><Text style={[styles.badgeText, { color }]}>{value}</Text></View>;
}

function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Ionicons name="file-tray-outline" size={42} color={COLORS.textTertiary} /><Text style={styles.muted}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background, padding: SIZES.lg },
  header: { paddingTop: SIZES.xxl, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.lg, backgroundColor: COLORS.marbleDark },
  title: { color: COLORS.textPrimary, fontSize: SIZES.fontXxl, fontWeight: '800' },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginTop: SIZES.xs },
  content: { flex: 1 },
  contentInset: { padding: SIZES.md },
  notice: { flexDirection: 'row', gap: SIZES.sm, backgroundColor: COLORS.gold + '15', borderWidth: 1, borderColor: COLORS.gold + '55', padding: SIZES.md, borderRadius: SIZES.radiusMd, marginBottom: SIZES.md },
  noticeText: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 18 },
  stats: { flexDirection: 'row', gap: SIZES.sm, marginBottom: SIZES.lg },
  stat: { flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, ...SHADOWS.small },
  statValue: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '800', marginTop: SIZES.sm },
  statLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: SIZES.xs },
  sectionTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800', marginTop: SIZES.sm, marginBottom: SIZES.sm },
  card: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, ...SHADOWS.small },
  row: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  flex: { flex: 1 },
  cardTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '700' },
  meta: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 17, marginTop: SIZES.xs },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.marbleGray, marginVertical: SIZES.sm },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: SIZES.sm, paddingVertical: SIZES.xs },
  moneyLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontSm },
  moneyValue: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '600' },
  strong: { color: COLORS.textPrimary, fontWeight: '800' },
  danger: { color: COLORS.error },
  dueText: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: SIZES.sm, textAlign: 'right' },
  badge: { paddingHorizontal: SIZES.sm, paddingVertical: SIZES.xs, borderRadius: SIZES.radiusFull },
  badgeText: { fontSize: SIZES.fontXs, fontWeight: '700', textTransform: 'capitalize' },
  receiptIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.gold + '22', alignItems: 'center', justifyContent: 'center' },
  receiptAmount: { color: COLORS.success, fontSize: SIZES.fontSm, fontWeight: '800' },
  payButton: { marginTop: SIZES.md },
  pendingText: { color: COLORS.warning, fontSize: SIZES.fontXs, lineHeight: 18, marginTop: SIZES.sm },
  rejectedText: { color: COLORS.error, fontSize: SIZES.fontXs, lineHeight: 18, marginTop: SIZES.sm },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SIZES.md, backgroundColor: COLORS.overlay },
  modalCard: { width: '100%', maxWidth: 560, maxHeight: '92%', borderRadius: SIZES.radiusLg, backgroundColor: COLORS.backgroundCard, overflow: 'hidden', ...SHADOWS.large },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: SIZES.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.marbleGray },
  modalTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800' },
  modalBody: { padding: SIZES.md, paddingBottom: SIZES.xl },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: SIZES.radiusFull, backgroundColor: COLORS.backgroundLight },
  inputLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '600', marginBottom: SIZES.xs },
  pickerBox: { minHeight: 50, borderWidth: 1, borderColor: COLORS.marbleGray, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundLight, justifyContent: 'center', overflow: 'hidden', marginBottom: SIZES.md },
  picker: { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundLight, width: '100%' },
  destinationCard: { borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.gold + '77', backgroundColor: COLORS.gold + '12', padding: SIZES.md, marginBottom: SIZES.md, gap: SIZES.sm },
  providerName: { color: COLORS.gold, fontSize: SIZES.fontSm, fontWeight: '800' },
  cardNumber: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cardholder: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, textTransform: 'uppercase' },
  confirmNotice: { flexDirection: 'row', gap: SIZES.sm, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.warning + '15', padding: SIZES.md, marginBottom: SIZES.md },
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm },
  flexButton: { flex: 1, minWidth: 150 },
  empty: { alignItems: 'center', gap: SIZES.sm, paddingVertical: SIZES.xl },
  muted: { color: COLORS.textTertiary, fontSize: SIZES.fontSm, textAlign: 'center', lineHeight: 20 },
});
