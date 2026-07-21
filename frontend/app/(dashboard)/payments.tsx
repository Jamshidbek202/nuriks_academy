import { getActiveLocale } from '../../src/i18n/translations';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SHADOWS, SIZES } from '../../src/constants/theme';

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
}

const uzs = (amount: number) => `${new Intl.NumberFormat(getActiveLocale()).format(amount || 0)} UZS`;

export default function PaymentsScreen() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const studentMap = useMemo(
    () => Object.fromEntries(students.map((student) => [student.id, student])),
    [students],
  );

  const loadData = async () => {
    try {
      const [studentResponse, invoiceResponse, receiptResponse] = await Promise.all([
        api.get('/students', { params: { limit: 1000 } }),
        api.get('/finance/invoices', { params: { limit: 2000 } }),
        api.get('/finance/receipts', { params: { limit: 500 } }),
      ]);
      setStudents(studentResponse.data || []);
      setInvoices(invoiceResponse.data || []);
      setReceipts(receiptResponse.data || []);
    } catch (error) {
      console.error('Error loading official finance ledger:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

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
          <Text style={styles.noticeText}>Payments are cash-only during the pilot. The reception records the payment and the official receipt appears here. Financial notices cannot be turned off.</Text>
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
          </View>
        ))}

        <Text style={styles.sectionTitle}>Official receipts</Text>
        {receipts.length === 0 ? <Empty text="No cash receipts have been posted yet." /> : receipts.map((receipt) => (
          <View key={receipt.id} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.receiptIcon}><Ionicons name="receipt" size={20} color={COLORS.gold} /></View>
              <View style={styles.flex}><Text style={styles.cardTitle}>{receipt.receipt_number}</Text><Text style={styles.meta}>{studentName(receipt.student_id)} · {new Date(receipt.received_at).toLocaleString(getActiveLocale())}</Text></View>
              <Text style={styles.receiptAmount}>{uzs(receipt.amount_uzs)}</Text>
            </View>
            <Text style={styles.meta}>Applied to debt: {uzs(receipt.allocated_amount_uzs)} · advance: {uzs(receipt.advance_amount_uzs)}</Text>
          </View>
        ))}
        <View style={{ height: SIZES.xl }} />
      </ScrollView>
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
  const color = value === 'paid' ? COLORS.success : value === 'partial' ? COLORS.warning : value === 'draft' ? COLORS.info : COLORS.error;
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
  empty: { alignItems: 'center', gap: SIZES.sm, paddingVertical: SIZES.xl },
  muted: { color: COLORS.textTertiary, fontSize: SIZES.fontSm, textAlign: 'center', lineHeight: 20 },
});
