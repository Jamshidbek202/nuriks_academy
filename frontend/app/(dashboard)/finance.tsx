import { getActiveLocale } from '../../src/i18n/translations';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, LocalizedPickerItem } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SHADOWS, SIZES } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { useFinanceLiveRefresh } from '../../src/hooks/use-finance-live-refresh';
import { FINANCE } from '../../constants/testIds';
import { showAlert, showConfirm } from '../../src/utils/cross-platform-alert';
import { CalendarDatePicker } from '../../src/components/CalendarDatePicker';
import { DateTimePicker } from '../../src/components/DateTimePicker';

const Alert = { alert: showAlert };

type FinanceTab = 'overview' | 'receivables' | 'expenses' | 'payroll' | 'cash' | 'pricing' | 'closures';
type ProgramCode = 'general' | 'pre_ielts' | 'ielts';
type GroupFormat = 'normal' | 'mini' | 'individual';

interface Student {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  phone?: string;
}

interface Invoice {
  id: string;
  invoice_number?: string;
  student_id: string;
  service_month: string;
  status: string;
  payment_status: string;
  amount_due_uzs: number;
  amount_paid_uzs: number;
  balance_uzs: number;
  due_date: string;
  calculation_ready?: boolean;
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

interface Expense {
  id: string;
  category: string;
  recipient: string;
  accrued_amount_uzs: number;
  paid_amount_uzs: number;
  outstanding_amount_uzs: number;
  status: string;
  obligation_date: string;
  amount_status?: string;
}

interface TeacherEarning {
  id: string;
  teacher_id: string;
  earned_amount_uzs: number;
  paid_amount_uzs: number;
  outstanding_amount_uzs: number;
  status: string;
  due_date: string;
}

interface Teacher {
  id: string;
  first_name: string;
  last_name: string;
}

interface CallItem {
  invoice_id: string;
  invoice_number: string;
  student_id: string;
  student_name: string;
  student_phone?: string;
  parent_name?: string;
  parent_phone?: string;
  balance_uzs: number;
  due_date: string;
  notification_attention_count: number;
  call_reason: 'overdue' | 'upcoming';
}

interface CashShift {
  id: string;
  status: string;
  operator_id: string;
  opening_balance_uzs: number;
  receipt_total_uzs: number;
  other_income_total_uzs?: number;
  removal_total_uzs: number;
  opened_at: string;
  closed_at?: string;
  expected_closing_balance_uzs?: number;
  actual_closing_balance_uzs?: number;
  discrepancy_uzs?: number;
  discrepancy_status?: string;
}

interface CashEvent {
  id: string;
  event_type: string;
  amount_uzs: number;
  purpose?: string;
  created_at: string;
}

interface OtherIncome {
  id: string;
  source: string;
  income_date: string;
  amount_uzs: number;
}

interface OutgoingPayment {
  id: string;
  payment_kind: 'expense' | 'teacher';
  source_id: string;
  amount_uzs: number;
  paid_at: string;
  status?: string;
}

interface GroupSummary {
  id: string;
  name: string;
}

interface LessonOccurrence {
  id: string;
  occurrence_key: string;
  local_date: string;
  starts_at: string;
  ends_at: string;
  lesson_status: string;
  resolution_status: string;
  pending_resolution_event_id?: string;
  replacement_occurrence_id?: string;
  counts_as_scheduled: boolean;
  locked_at?: string;
}

interface Policy {
  id: string;
  policy_key: string;
  effective_from: string;
  value: Record<string, any>;
}

interface Position {
  operation_mode: string;
  is_provisional: boolean;
  gross_tuition_uzs: number;
  centre_funded_discounts_uzs: number;
  net_tuition_uzs: number;
  other_income_uzs: number;
  cash_received_uzs: number;
  receivables_uzs: number;
  overdue_uzs: number;
  advance_balances_uzs: number;
  teacher_salary_earned_uzs: number;
  teacher_salary_finalized_uzs?: number;
  teacher_salary_projected_uzs?: number;
  teacher_salary_paid_uzs: number;
  teacher_salary_outstanding_uzs: number;
  expenses_accrued_uzs: number;
  expenses_paid_uzs: number;
  expenses_outstanding_uzs: number;
  accrued_operating_profit_uzs: number;
  period_cash_outflow_uzs: number;
  cashbox_position_uzs: number;
}

const tabs: { key: FinanceTab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Position', icon: 'analytics' },
  { key: 'receivables', label: 'Payments', icon: 'receipt' },
  { key: 'expenses', label: 'Expenses', icon: 'arrow-up-circle' },
  { key: 'payroll', label: 'Payroll', icon: 'people-circle' },
  { key: 'cash', label: 'Cashbox', icon: 'cash' },
  { key: 'pricing', label: 'Pricing', icon: 'pricetags' },
  { key: 'closures', label: 'Closures', icon: 'calendar' },
];

const uzs = (value?: number) => `${new Intl.NumberFormat(getActiveLocale()).format(value || 0)} UZS`;

const tashkentDateParts = () => {
  const parts = new Intl.DateTimeFormat(getActiveLocale(), {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
};

const tashkentDate = () => {
  const value = tashkentDateParts();
  return `${value.year}-${value.month}-${value.day}`;
};

const currentMonth = () => {
  const value = tashkentDateParts();
  return `${value.year}-${value.month}`;
};

const idempotencyKey = (scope: string) =>
  `ui:${scope}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

const parseWholeUzs = (value: string) => {
  if (!/^\d+$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
};

const parseWholeUzsAllowZero = (value: string) => {
  if (!/^\d+$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
};

const utcDate = (value: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
const tashkentDateTime = (value: string) => utcDate(value).toLocaleString(getActiveLocale(), {
  timeZone: 'Asia/Tashkent',
  year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
const tashkentTime = (value: string) => utcDate(value).toLocaleTimeString(getActiveLocale(), {
  timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false,
});

export default function FinanceScreen() {
  const { user, token } = useAuth();
  const role = user?.role;
  const isReception = role === 'reception';
  const isSuperAdmin = role === 'super_admin';
  const [activeTab, setActiveTab] = useState<FinanceTab>(isReception ? 'receivables' : 'overview');
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [earnings, setEarnings] = useState<TeacherEarning[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [callList, setCallList] = useState<CallItem[]>([]);
  const [cashShift, setCashShift] = useState<CashShift | null>(null);
  const [cashShifts, setCashShifts] = useState<CashShift[]>([]);
  const [cashEvents, setCashEvents] = useState<CashEvent[]>([]);
  const [otherIncomeRows, setOtherIncomeRows] = useState<OtherIncome[]>([]);
  const [outgoingPayments, setOutgoingPayments] = useState<OutgoingPayment[]>([]);
  const [tariffs, setTariffs] = useState<Policy[]>([]);
  const [teacherShares, setTeacherShares] = useState<Policy[]>([]);
  const [recurringPolicies, setRecurringPolicies] = useState<Policy[]>([]);
  const [billingPolicy, setBillingPolicy] = useState<Policy | null>(null);
  const [closures, setClosures] = useState<any[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [occurrences, setOccurrences] = useState<LessonOccurrence[]>([]);
  const refreshRequestRef = useRef(0);

  const [receiptForm, setReceiptForm] = useState({ student_id: '', amount: '', notes: '' });
  const [financeSearch, setFinanceSearch] = useState('');
  const [invoiceCorrection, setInvoiceCorrection] = useState<{
    invoice: Invoice; kind: 'debit' | 'credit';
  } | null>(null);
  const [invoiceCorrectionAmount, setInvoiceCorrectionAmount] = useState('');
  const [invoiceCorrectionReason, setInvoiceCorrectionReason] = useState('');
  const [invoiceReversalTarget, setInvoiceReversalTarget] = useState<Invoice | null>(null);
  const [invoiceReversalReason, setInvoiceReversalReason] = useState('');
  const [receiptReversalTarget, setReceiptReversalTarget] = useState<Receipt | null>(null);
  const [receiptReversalReason, setReceiptReversalReason] = useState('');
  const [shiftForm, setShiftForm] = useState({ opening: '0', closing: '' });
  const [cashRemovalForm, setCashRemovalForm] = useState({ amount: '', purpose: '' });
  const [otherIncomeForm, setOtherIncomeForm] = useState({
    source: '', amount: '', income_date: tashkentDate(), notes: '',
  });
  const [discrepancyTarget, setDiscrepancyTarget] = useState<CashShift | null>(null);
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [cashReversalTarget, setCashReversalTarget] = useState<{
    kind: 'expense' | 'teacher' | 'income'; id: string; label: string;
  } | null>(null);
  const [cashReversalReason, setCashReversalReason] = useState('');
  const [otherExpense, setOtherExpense] = useState({
    category: 'Other', recipient: '', amount: '', explanation: '', expense_date: tashkentDate(),
  });
  const [outgoing, setOutgoing] = useState<{
    type: 'expense' | 'teacher'; id: string; label: string; maximum: number;
  } | null>(null);
  const [outgoingAmount, setOutgoingAmount] = useState('');
  const [manualExpenseTarget, setManualExpenseTarget] = useState<Expense | null>(null);
  const [manualExpenseAmount, setManualExpenseAmount] = useState('');
  const [expenseCorrectionTarget, setExpenseCorrectionTarget] = useState<Expense | null>(null);
  const [expenseCorrectionAmount, setExpenseCorrectionAmount] = useState('');
  const [expenseCorrectionReason, setExpenseCorrectionReason] = useState('');
  const [tariffForm, setTariffForm] = useState({
    program_code: 'general' as ProgramCode,
    group_format: 'normal' as GroupFormat,
    amount: '', effective_from: tashkentDate(), reason: '',
  });
  const [teacherShareForm, setTeacherShareForm] = useState({
    group_format: 'normal' as GroupFormat,
    percentage: '40', effective_from: tashkentDate(), reason: '',
  });
  const [billingForm, setBillingForm] = useState({ due: '10', freeze: '11', salary: '5', effective_from: tashkentDate(), reason: '' });
  const [recurringForm, setRecurringForm] = useState({
    expense_key: 'rent', name: 'Rent', amount: '', effective_from: tashkentDate(),
    classification: 'operating_expense', reason: '',
  });
  const [closureForm, setClosureForm] = useState({
    title: '', reason: '', kind: 'holiday', group_id: '', starts_at: `${tashkentDate()}T00:00`, ends_at: `${tashkentDate()}T23:59`,
  });
  const [replacementTarget, setReplacementTarget] = useState<LessonOccurrence | null>(null);
  const [replacementForm, setReplacementForm] = useState({
    starts_at: `${tashkentDate()}T09:00`, ends_at: `${tashkentDate()}T10:30`, reason: '',
  });

  const studentMap = useMemo(
    () => Object.fromEntries(students.map((student) => [student.id, student])),
    [students],
  );
  const teacherMap = useMemo(
    () => Object.fromEntries(teachers.map((teacher) => [teacher.id, teacher])),
    [teachers],
  );
  const normalizedSearch = financeSearch.trim().toLowerCase();
  const matchesStudent = (studentId: string) => {
    if (!normalizedSearch) return true;
    const student = studentMap[studentId];
    return [
      studentId,
      student?.student_id,
      student?.first_name,
      student?.last_name,
      student?.phone,
    ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
  };
  const visibleInvoices = invoices.filter((invoice) =>
    matchesStudent(invoice.student_id)
    || String(invoice.invoice_number || '').toLowerCase().includes(normalizedSearch),
  );
  const visibleReceipts = receipts.filter((receipt) =>
    matchesStudent(receipt.student_id)
    || String(receipt.receipt_number || '').toLowerCase().includes(normalizedSearch),
  );
  const visibleCallList = callList.filter((item) =>
    !normalizedSearch
    || [
      item.student_name,
      item.student_phone,
      item.parent_name,
      item.parent_phone,
      item.invoice_number,
    ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch)),
  );

  const visibleTabs = isReception
    ? tabs.filter((tab) => ['receivables', 'cash'].includes(tab.key))
    : tabs;

  const loadData = useCallback(async () => {
    const requestId = ++refreshRequestRef.current;
    if (!role || !['super_admin', 'manager', 'reception'].includes(role)) {
      if (requestId === refreshRequestRef.current) setLoading(false);
      return;
    }
    try {
      const commonPromise = Promise.all([
        api.get('/students', { params: { limit: 1000 } }),
        api.get('/finance/invoices', { params: { limit: 2000 } }),
        api.get('/finance/receipts', { params: { limit: 500 } }),
        api.get('/finance/reception/call-list'),
        api.get('/finance/cash-shifts/current').catch(() => ({ data: null })),
      ]);
      const adminPromise = isReception ? Promise.resolve(null) : Promise.all([
        api.get('/finance/position', { params: { service_month: month } }),
        api.get('/finance/expenses', { params: { service_month: month, limit: 2000 } }),
        api.get('/finance/teacher-earnings', { params: { service_month: month } }),
        api.get('/finance/pricing/current'),
        api.get('/finance/closures', { params: { limit: 500 } }),
        api.get('/groups', { params: { limit: 1000 } }),
        api.get('/teachers', { params: { limit: 1000 } }),
        api.get('/finance/cash-shifts', { params: { limit: 100 } }),
        api.get('/finance/cash-events', { params: { limit: 250 } }),
        api.get('/finance/other-income', { params: { service_month: month, limit: 500 } }),
        api.get('/finance/outgoing-payments', { params: { limit: 500 } }),
      ]);
      const [common, admin] = await Promise.all([commonPromise, adminPromise]);
      // A newer invalidation owns the screen. Never let an older, slower set of
      // financial requests overwrite its snapshot.
      if (requestId !== refreshRequestRef.current) return;
      setStudents(common[0].data || []);
      setInvoices(common[1].data || []);
      setReceipts(common[2].data || []);
      setCallList(common[3].data || []);
      setCashShift(common[4].data || null);
      if (admin) {
        setPosition(admin[0].data);
        setExpenses(admin[1].data || []);
        setEarnings(admin[2].data || []);
        setTariffs(admin[3].data.tariffs || []);
        setTeacherShares(admin[3].data.teacher_shares || []);
        setRecurringPolicies(admin[3].data.recurring_expenses || []);
        setBillingPolicy(admin[3].data.billing_rules || null);
        setClosures(admin[4].data || []);
        setGroups(admin[5].data || []);
        setTeachers(admin[6].data || []);
        setCashShifts(admin[7].data || []);
        setCashEvents(admin[8].data || []);
        setOtherIncomeRows(admin[9].data || []);
        setOutgoingPayments(admin[10].data || []);
        setSelectedGroupId((current) => current || admin[5].data?.[0]?.id || '');
        const billing = admin[3].data.billing_rules?.value;
        if (billing) {
          setBillingForm((current) => ({
            ...current,
            due: String(billing.student_due_day),
            freeze: String(billing.freeze_day),
            salary: String(billing.teacher_salary_due_day),
          }));
        }
      }
    } catch (error: any) {
      if (requestId === refreshRequestRef.current) {
        Alert.alert('Finance data unavailable', error.response?.data?.detail || 'Could not load financial records.');
      }
    } finally {
      if (requestId === refreshRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [isReception, month, role]);

  const loadOccurrences = useCallback(async (groupId: string) => {
    try {
      const response = await api.get('/finance/lesson-occurrences', {
        params: { group_id: groupId, month },
      });
      setOccurrences(response.data || []);
    } catch (error: any) {
      setOccurrences([]);
      Alert.alert('Lesson calendar unavailable', error.response?.data?.detail || 'Could not load lesson occurrences.');
    }
  }, [month]);

  const refreshLiveData = useCallback(async () => {
    await Promise.all([
      loadData(),
      !isReception && selectedGroupId ? loadOccurrences(selectedGroupId) : Promise.resolve(),
    ]);
  }, [isReception, loadData, loadOccurrences, selectedGroupId]);

  useFinanceLiveRefresh(
    refreshLiveData,
    token,
    Boolean(role && ['super_admin', 'manager', 'reception'].includes(role)),
    `${month}:${role || ''}`,
  );

  useEffect(() => {
    if (!isReception && selectedGroupId) void loadOccurrences(selectedGroupId);
  }, [isReception, loadOccurrences, selectedGroupId]);

  const runAction = async (key: string, action: () => Promise<any>, success: string) => {
    setBusy(key);
    try {
      await action();
      Alert.alert('Recorded', success);
      await loadData();
      return true;
    } catch (error: any) {
      Alert.alert('Could not complete action', error.response?.data?.detail || error.message || 'Unknown error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const recordReceipt = () => {
    const amount = parseWholeUzs(receiptForm.amount);
    if (!cashShift) return Alert.alert('Open the cashbox first', 'Cash receipts require an open shift.');
    if (!receiptForm.student_id || amount == null) return Alert.alert('Check payment', 'Select a student and enter whole UZS.');
    void runAction('receipt', () => api.post('/finance/receipts/cash', {
      student_id: receiptForm.student_id,
      amount_uzs: amount,
      cash_shift_id: cashShift.id,
      notes: receiptForm.notes || null,
      idempotency_key: idempotencyKey('receipt'),
    }), 'Cash receipt posted and allocated to the oldest debt first.').then((success) =>
      success && setReceiptForm({ student_id: '', amount: '', notes: '' }),
    );
  };

  const postInvoiceCorrection = () => {
    const amount = parseWholeUzs(invoiceCorrectionAmount);
    if (!invoiceCorrection || amount == null || invoiceCorrectionReason.trim().length < 5) {
      return Alert.alert('Check correction', 'A whole-UZS amount and audit reason are required.');
    }
    void runAction('invoice-correction', () => api.post(
      `/finance/invoices/${invoiceCorrection.invoice.id}/adjustments`,
      {
        kind: invoiceCorrection.kind,
        amount_uzs: amount,
        reason: invoiceCorrectionReason,
        idempotency_key: idempotencyKey(`invoice-${invoiceCorrection.kind}`),
      },
    ), 'Invoice correction posted without changing the teacher’s earned salary.').then((success) => {
      if (!success) return;
      setInvoiceCorrection(null);
      setInvoiceCorrectionAmount('');
      setInvoiceCorrectionReason('');
    });
  };

  const reverseInvoiceValue = () => {
    if (!invoiceReversalTarget || invoiceReversalReason.trim().length < 5) {
      return Alert.alert('Reason required', 'Enter a specific audit reason of at least five characters.');
    }
    void runAction('invoice-reversal', () => api.post(
      `/finance/invoices/${invoiceReversalTarget.id}/reverse-and-replace`,
      {
        reason: invoiceReversalReason,
        idempotency_key: idempotencyKey(`invoice-reversal-${invoiceReversalTarget.id}`),
      },
    ), 'Invoice reversed and replacement draft created.').then((success) => {
      if (!success) return;
      setInvoiceReversalTarget(null);
      setInvoiceReversalReason('');
    });
  };

  const reverseReceiptValue = () => {
    if (!receiptReversalTarget || receiptReversalReason.trim().length < 5) {
      return Alert.alert('Reason required', 'Enter an audit reason of at least five characters.');
    }
    void runAction('receipt-reversal', () => api.post(
      `/finance/receipts/${receiptReversalTarget.id}/reverse`,
      {
        reason: receiptReversalReason,
        idempotency_key: idempotencyKey(`receipt-reversal-${receiptReversalTarget.id}`),
      },
    ), 'Receipt reversed. Its exact allocations and any advance were reversed atomically.').then((success) => {
      if (!success) return;
      setReceiptReversalTarget(null);
      setReceiptReversalReason('');
    });
  };

  const openShift = () => {
    const opening = shiftForm.opening === '0' ? 0 : parseWholeUzs(shiftForm.opening);
    if (opening == null) return Alert.alert('Invalid balance', 'Enter a whole UZS opening balance, including 0.');
    void runAction('open-shift', () => api.post('/finance/cash-shifts/open', {
      opening_balance_uzs: opening,
      notes: null,
      idempotency_key: idempotencyKey('open-shift'),
    }), 'Main cashbox shift opened.');
  };

  const closeShift = () => {
    const closing = shiftForm.closing === '0' ? 0 : parseWholeUzs(shiftForm.closing);
    if (!cashShift || closing == null) return Alert.alert('Invalid balance', 'Enter the counted whole-UZS closing balance.');
    void runAction('close-shift', () => api.post(`/finance/cash-shifts/${cashShift.id}/close`, {
      actual_closing_balance_uzs: closing,
      notes: null,
      idempotency_key: idempotencyKey('close-shift'),
    }), 'Cashbox shift closed; any discrepancy is retained for review.').then((success) =>
      success && setShiftForm((current) => ({ ...current, closing: '' })),
    );
  };

  const recordCashRemoval = () => {
    const amount = parseWholeUzs(cashRemovalForm.amount);
    if (!cashShift || amount == null || cashRemovalForm.purpose.trim().length < 3) {
      return Alert.alert('Check cash removal', 'An open shift, whole-UZS amount, and purpose are required.');
    }
    void runAction('cash-removal', () => api.post(
      `/finance/cash-shifts/${cashShift.id}/removals`,
      {
        amount_uzs: amount,
        purpose: cashRemovalForm.purpose,
        idempotency_key: idempotencyKey('cash-removal'),
      },
    ), 'Authorized non-expense cash removal recorded.').then((success) =>
      success && setCashRemovalForm({ amount: '', purpose: '' }),
    );
  };

  const recordOtherIncomeValue = () => {
    const amount = parseWholeUzs(otherIncomeForm.amount);
    if (!cashShift || amount == null || otherIncomeForm.source.trim().length < 2) {
      return Alert.alert('Check other income', 'An open shift, source, and whole-UZS amount are required.');
    }
    void runAction('other-income', () => api.post('/finance/other-income', {
      source: otherIncomeForm.source,
      income_date: otherIncomeForm.income_date,
      amount_uzs: amount,
      cash_shift_id: cashShift.id,
      notes: otherIncomeForm.notes || null,
      branch_id: null,
      idempotency_key: idempotencyKey('other-income'),
    }), 'Other cash income recorded in the ledger and cashbox.').then((success) =>
      success && setOtherIncomeForm({ source: '', amount: '', income_date: tashkentDate(), notes: '' }),
    );
  };

  const reviewDiscrepancy = (accepted: boolean) => {
    if (!discrepancyTarget || discrepancyReason.trim().length < 5) {
      return Alert.alert('Reason required', 'Enter an audit reason of at least five characters.');
    }
    void runAction('discrepancy-review', () => api.post(
      `/finance/cash-shifts/${discrepancyTarget.id}/discrepancy-review`,
      {
        accepted,
        reason: discrepancyReason,
        idempotency_key: idempotencyKey(`cash-review-${discrepancyTarget.id}`),
      },
    ), accepted ? 'Cash discrepancy accepted with an audit record.' : 'Cash discrepancy marked for investigation.').then((success) => {
      if (!success) return;
      setDiscrepancyTarget(null);
      setDiscrepancyReason('');
    });
  };

  const reverseCashLedgerRecord = () => {
    if (!cashReversalTarget || cashReversalReason.trim().length < 5) {
      return Alert.alert('Reason required', 'Enter a specific audit reason of at least five characters.');
    }
    const path = cashReversalTarget.kind === 'income'
      ? `/finance/other-income/${cashReversalTarget.id}/reverse`
      : `/finance/outgoing-payments/${cashReversalTarget.kind}/${cashReversalTarget.id}/reverse`;
    void runAction('cash-ledger-reversal', () => api.post(path, {
      reason: cashReversalReason,
      idempotency_key: idempotencyKey(`cash-ledger-reversal-${cashReversalTarget.id}`),
    }), 'Cash ledger record reversed atomically; the original remains auditable.').then((success) => {
      if (!success) return;
      setCashReversalTarget(null);
      setCashReversalReason('');
    });
  };

  const createOtherExpense = () => {
    const amount = parseWholeUzs(otherExpense.amount);
    if (!otherExpense.recipient || !otherExpense.explanation || amount == null) {
      return Alert.alert('Check expense', 'Recipient, explanation, and whole-UZS amount are required.');
    }
    void runAction('other-expense', () => api.post('/finance/expenses/other', {
      category: otherExpense.category || 'Other',
      recipient: otherExpense.recipient,
      expense_date: otherExpense.expense_date,
      amount_uzs: amount,
      explanation: otherExpense.explanation,
      proof_reference: null,
      branch_id: null,
      idempotency_key: idempotencyKey('other-expense'),
    }), 'Expense obligation recorded. Cash has not been removed until it is paid.').then((success) =>
      success && setOtherExpense({ category: 'Other', recipient: '', amount: '', explanation: '', expense_date: tashkentDate() }),
    );
  };

  const payOutgoing = () => {
    const amount = parseWholeUzs(outgoingAmount);
    if (!outgoing || !cashShift || amount == null || amount > outgoing.maximum) {
      return Alert.alert('Check payout', 'An open cashbox and an amount no greater than the outstanding balance are required.');
    }
    const path = outgoing.type === 'expense'
      ? `/finance/expenses/${outgoing.id}/payments`
      : `/finance/teacher-earnings/${outgoing.id}/payouts`;
    void runAction('outgoing', () => api.post(path, {
      amount_uzs: amount,
      cash_shift_id: cashShift.id,
      notes: null,
      idempotency_key: idempotencyKey(outgoing.type),
    }), 'Cash payout posted.').then((success) => {
      if (!success) return;
      setOutgoing(null);
      setOutgoingAmount('');
    });
  };

  const setManualExpenseAmountValue = () => {
    const amount = parseWholeUzs(manualExpenseAmount);
    if (!manualExpenseTarget || amount == null) {
      return Alert.alert('Check amount', 'Enter the actual monthly amount in whole UZS.');
    }
    void runAction('manual-expense-amount', () => api.post(
      `/finance/expenses/${manualExpenseTarget.id}/set-amount`,
      {
        amount_uzs: amount,
        reason: `Actual ${manualExpenseTarget.category} amount entered for ${month}`,
        idempotency_key: idempotencyKey(`expense-amount-${manualExpenseTarget.id}`),
      },
    ), 'The actual monthly obligation amount was fixed and audited.').then((success) => {
      if (!success) return;
      setManualExpenseTarget(null);
      setManualExpenseAmount('');
    });
  };

  const correctExpenseAmount = () => {
    const amount = parseWholeUzsAllowZero(expenseCorrectionAmount);
    if (!expenseCorrectionTarget || amount == null || expenseCorrectionReason.trim().length < 5) {
      return Alert.alert('Check correction', 'Enter a whole-UZS amount (0 cancels an unpaid obligation) and an audit reason.');
    }
    void runAction('expense-correction', () => api.post(
      `/finance/expenses/${expenseCorrectionTarget.id}/adjust-amount`,
      {
        amount_uzs: amount,
        reason: expenseCorrectionReason,
        idempotency_key: idempotencyKey(`expense-correction-${expenseCorrectionTarget.id}`),
      },
    ), 'Expense amount corrected through an immutable event.').then((success) => {
      if (!success) return;
      setExpenseCorrectionTarget(null);
      setExpenseCorrectionAmount('');
      setExpenseCorrectionReason('');
    });
  };

  const saveTariff = () => {
    const amount = parseWholeUzs(tariffForm.amount);
    if (amount == null || tariffForm.reason.trim().length < 3) {
      return Alert.alert('Check tariff', 'Enter a whole-UZS price and a reason.');
    }
    void runAction('tariff', () => api.post('/finance/policies/tariffs', {
      program_code: tariffForm.program_code,
      group_format: tariffForm.group_format,
      monthly_price_uzs: amount,
      effective_from: tariffForm.effective_from,
      reason: tariffForm.reason,
    }), 'A new effective-dated tariff version was created.').then((success) =>
      success && setTariffForm((current) => ({ ...current, amount: '', reason: '' })),
    );
  };

  const saveBillingRules = () => {
    const due = Number(billingForm.due);
    const freeze = Number(billingForm.freeze);
    const salary = Number(billingForm.salary);
    if (![due, freeze, salary].every((value) => Number.isInteger(value) && value >= 1 && value <= 28) || freeze <= due) {
      return Alert.alert('Check dates', 'Days must be 1–28 and the freeze day must follow the due day.');
    }
    void runAction('billing', () => api.post('/finance/policies/billing-rules', {
      effective_from: billingForm.effective_from,
      invoice_draft_day: billingPolicy?.value.invoice_draft_day || 1,
      invoice_finalization_day: billingPolicy?.value.invoice_finalization_day || 1,
      student_due_day: due,
      freeze_day: freeze,
      teacher_salary_due_day: salary,
      operation_mode: billingPolicy?.value.operation_mode || 'shadow',
      automatic_freeze_enabled: billingPolicy?.value.automatic_freeze_enabled || false,
      reason: billingForm.reason || 'Authorized billing calendar update',
    }), 'Billing dates were versioned. Existing invoices remain unchanged.');
  };

  const saveTeacherShare = () => {
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(teacherShareForm.percentage.trim())) {
      return Alert.alert('Check percentage', 'Enter a percentage from 0 to 100 with at most two decimals.');
    }
    const percentage = Number(teacherShareForm.percentage);
    const basisPoints = Math.round(percentage * 100);
    if (percentage < 0 || percentage > 100 || teacherShareForm.reason.trim().length < 3) {
      return Alert.alert('Check percentage', 'Enter 0–100% and an audit reason.');
    }
    void runAction('teacher-share', () => api.post('/finance/policies/teacher-shares', {
      group_format: teacherShareForm.group_format,
      basis_points: basisPoints,
      effective_from: teacherShareForm.effective_from,
      reason: teacherShareForm.reason,
    }), 'A new effective-dated teacher share was created.').then((success) =>
      success && setTeacherShareForm((current) => ({ ...current, reason: '' })),
    );
  };

  const saveRecurringExpense = () => {
    const amount = parseWholeUzs(recurringForm.amount);
    if (!/^[a-z0-9_]{2,60}$/.test(recurringForm.expense_key) || !recurringForm.name || amount == null || recurringForm.reason.length < 3) {
      return Alert.alert('Check recurring expense', 'Use a simple key, name, whole-UZS amount, and reason.');
    }
    void runAction('recurring-policy', () => api.post('/finance/policies/recurring-expenses', {
      expense_key: recurringForm.expense_key,
      name: recurringForm.name,
      amount_uzs: amount,
      effective_from: recurringForm.effective_from,
      classification: recurringForm.classification,
      reason: recurringForm.reason,
    }), 'A new recurring expense version was created.').then((success) =>
      success && setRecurringForm((current) => ({ ...current, amount: '', reason: '' })),
    );
  };

  const createClosure = () => {
    if (!closureForm.title || closureForm.reason.length < 3) return Alert.alert('Check closure', 'Title and reason are required.');
    void runAction('closure', () => api.post('/finance/closures', {
      title: closureForm.title,
      reason: closureForm.reason,
      kind: closureForm.kind,
      starts_at: closureForm.starts_at,
      ends_at: closureForm.ends_at,
      branch_id: null,
      group_ids: closureForm.group_id ? [closureForm.group_id] : [],
    }), 'Closure added and matching unlocked lessons excluded from billing.').then((success) =>
      success && setClosureForm({ title: '', reason: '', kind: 'holiday', group_id: '', starts_at: `${tashkentDate()}T00:00`, ends_at: `${tashkentDate()}T23:59` }),
    );
  };

  const generateOccurrences = () => {
    if (!selectedGroupId) return;
    void runAction('occurrences', () => api.post('/finance/lesson-occurrences/generate', {
      group_id: selectedGroupId,
      month,
    }), 'The selected group calendar was generated idempotently.').then((success) =>
      success && void loadOccurrences(selectedGroupId),
    );
  };

  const resolveOccurrence = (occurrence: LessonOccurrence, resolution: 'held' | 'teacher_cancelled' | 'replacement_required') => {
    const reason = resolution === 'held'
      ? null
      : resolution === 'teacher_cancelled'
        ? 'Authorized teacher cancellation without a held replacement'
        : 'Authorized replacement lesson required';
    void runAction(`resolve-${occurrence.id}`, () => api.post(`/finance/lesson-occurrences/${occurrence.id}/resolve`, {
      resolution,
      reason,
      substitute_teacher_id: null,
      idempotency_key: idempotencyKey(`resolve-${occurrence.id}`),
    }), resolution === 'held' ? 'Lesson marked held and billable.' : 'Lesson exception recorded.').then((success) => {
      if (!success) return;
      if (resolution === 'replacement_required') setReplacementTarget(occurrence);
      void loadOccurrences(selectedGroupId);
    });
  };

  const decidePendingException = (occurrence: LessonOccurrence, approved: boolean) => {
    if (!occurrence.pending_resolution_event_id) return;
    void runAction(`decision-${occurrence.id}`, () => api.post(
      `/finance/lesson-exceptions/${occurrence.pending_resolution_event_id}/decision`,
      {
        approved,
        reason: approved ? 'Manager approved submitted lesson exception' : 'Manager rejected submitted lesson exception',
        idempotency_key: idempotencyKey(`lesson-decision-${occurrence.id}`),
      },
    ), approved ? 'Lesson exception approved.' : 'Lesson exception rejected.').then((success) =>
      success && void loadOccurrences(selectedGroupId),
    );
  };

  const scheduleReplacement = () => {
    if (!replacementTarget || replacementForm.reason.length < 3) {
      return Alert.alert('Check replacement', 'Select an original lesson and enter a reason.');
    }
    void runAction('replacement', () => api.post(
      `/finance/lesson-occurrences/${replacementTarget.id}/replacement`,
      {
        starts_at: replacementForm.starts_at,
        ends_at: replacementForm.ends_at,
        teacher_id: null,
        reason: replacementForm.reason,
        idempotency_key: idempotencyKey(`replacement-${replacementTarget.id}`),
      },
    ), 'Replacement lesson scheduled. It must be marked held before finalization.').then((success) => {
      if (!success) return;
      setReplacementTarget(null);
      setReplacementForm({ starts_at: `${tashkentDate()}T09:00`, ends_at: `${tashkentDate()}T10:30`, reason: '' });
      void loadOccurrences(selectedGroupId);
    });
  };

  const finalizeSelectedMonth = () => {
    showConfirm(
      'Finalize financial month?',
      `This locks all ready invoices for ${month}, creates teacher earnings, and queues mandatory financial notices. Later changes require auditable corrections.`,
      () => void runAction('finalize', () => api.post('/finance/invoices/finalize-month', {
        service_month: month,
        branch_id: null,
        idempotency_key: idempotencyKey(`finalize-${month}`),
      }), 'The month was finalized atomically.'),
      'Finalize',
    );
  };

  const studentName = (studentId: string) => {
    const student = studentMap[studentId];
    return student ? `${student.first_name} ${student.last_name}` : studentId;
  };

  const teacherName = (teacherId: string) => {
    const teacher = teacherMap[teacherId];
    return teacher ? `${teacher.first_name} ${teacher.last_name}` : teacherId;
  };

  const expectedCash = cashShift
    ? cashShift.opening_balance_uzs + (cashShift.receipt_total_uzs || 0)
      + (cashShift.other_income_total_uzs || 0) - (cashShift.removal_total_uzs || 0)
    : 0;

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.gold} /></View>;

  if (!user || !['super_admin', 'manager', 'reception'].includes(user.role)) {
    return <View style={styles.loading}><Text style={styles.muted}>Finance access is not available for this role.</Text></View>;
  }

  const renderOverview = () => position && (
    <>
      <View style={styles.modeBanner}>
        <Ionicons name={position.operation_mode === 'shadow' ? 'eye' : 'radio'} size={20} color={COLORS.gold} />
        <View style={styles.flex}>
          <Text style={styles.modeTitle}>{position.operation_mode === 'shadow' ? 'Parallel shadow mode' : 'Live finance mode'}</Text>
          <Text style={styles.modeText}>
            {position.is_provisional ? 'This month is provisional; drafts or the current period can still change.' : 'This period contains finalized financial records.'}
          </Text>
        </View>
      </View>
      <Section title={`Month close · ${month}`} subtitle="Draft generation is repeatable. Finalization fails closed if any source changed or any scheduled lesson is unresolved.">
        <View style={styles.actionRow}>
          <Button
            testID={FINANCE.recalculateDrafts}
            title="Recalculate drafts"
            variant="outline"
            style={styles.flexButton}
            loading={busy === 'drafts'}
            onPress={() => void runAction('drafts', () => api.post('/finance/invoices/generate-drafts', {
              service_month: month,
              branch_id: null,
            }), 'Draft invoices recalculated from current locked source data.')}
          />
          <Button
            testID={FINANCE.finalizeMonth}
            title="Finalize month"
            style={styles.flexButton}
            loading={busy === 'finalize'}
            onPress={finalizeSelectedMonth}
          />
        </View>
      </Section>
      <View style={styles.kpiGrid}>
        <Kpi testID={FINANCE.accruedRevenue} label="Accrued revenue" value={position.net_tuition_uzs + position.other_income_uzs} icon="trending-up" color={COLORS.success} />
        <Kpi testID={FINANCE.accruedProfit} label="Accrued profit" value={position.accrued_operating_profit_uzs} icon="pie-chart" color={position.accrued_operating_profit_uzs >= 0 ? COLORS.gold : COLORS.error} />
        <Kpi testID={FINANCE.cashReceived} label="Cash received" value={position.cash_received_uzs} icon="arrow-down-circle" color={COLORS.info} />
        <Kpi testID={FINANCE.cashboxPosition} label="Cashbox position" value={position.cashbox_position_uzs} icon="cash" color={COLORS.gold} />
        <Kpi testID={FINANCE.receivables} label="All receivables" value={position.receivables_uzs} icon="hourglass" color={COLORS.warning} />
        <Kpi testID={FINANCE.overdue} label="Overdue" value={position.overdue_uzs} icon="alert-circle" color={COLORS.error} />
      </View>
      <Section title="Revenue bridge" subtitle="Accrued, not simply cash collected">
        <MoneyRow testID={FINANCE.grossTuition} label="Gross lesson tuition" value={position.gross_tuition_uzs} />
        <MoneyRow label="Centre-funded discounts" value={-position.centre_funded_discounts_uzs} negative />
        <MoneyRow testID={FINANCE.netTuition} label="Net tuition" value={position.net_tuition_uzs} strong />
        <MoneyRow testID={FINANCE.otherIncomeTotal} label="Other income" value={position.other_income_uzs} />
      </Section>
      <Section title="Spending and obligations" subtitle="Earned/accrued and paid are shown separately">
        <SpendingBar testID={FINANCE.salaryEarned} label="Teacher salaries earned" value={position.teacher_salary_earned_uzs} total={position.teacher_salary_earned_uzs + position.expenses_accrued_uzs} color={COLORS.gold} />
        {(position.teacher_salary_projected_uzs || 0) > 0 && <MoneyRow label="Included projected salary from drafts" value={position.teacher_salary_projected_uzs || 0} />}
        <SpendingBar testID={FINANCE.expensesAccrued} label="Operating expenses accrued" value={position.expenses_accrued_uzs} total={position.teacher_salary_earned_uzs + position.expenses_accrued_uzs} color={COLORS.warning} />
        <MoneyRow testID={FINANCE.salaryOutstanding} label="Salary outstanding" value={position.teacher_salary_outstanding_uzs} />
        <MoneyRow testID={FINANCE.expensesOutstanding} label="Expense outstanding" value={position.expenses_outstanding_uzs} />
        <MoneyRow testID={FINANCE.cashOutflow} label="Cash outflow this period" value={position.period_cash_outflow_uzs} />
        <MoneyRow testID={FINANCE.advances} label="Student advances held" value={position.advance_balances_uzs} />
      </Section>
    </>
  );

  const renderReceivables = () => (
    <>
      <Section title="Search student finances" subtitle="Search by student, phone, invoice, or receipt number.">
        <Input value={financeSearch} onChangeText={setFinanceSearch} placeholder="Name, phone, student ID, invoice..." />
      </Section>
      <Section title="Record cash payment" subtitle="Cash only. Payment is allocated to the oldest debt; any remainder becomes an advance.">
        <Text style={styles.inputLabel}>Student *</Text>
        <View style={styles.pickerBox}>
          <Picker testID={FINANCE.receiptStudent} selectedValue={receiptForm.student_id} onValueChange={(value) => setReceiptForm({ ...receiptForm, student_id: value })} style={styles.picker} dropdownIconColor={COLORS.gold}>
            <LocalizedPickerItem label="Select student" value="" />
            {students.map((student) => <LocalizedPickerItem key={student.id} label={`${student.student_id} · ${student.first_name} ${student.last_name}`} value={student.id} />)}
          </Picker>
        </View>
        <Input testID={FINANCE.receiptAmount} label="Amount (whole UZS) *" keyboardType="number-pad" value={receiptForm.amount} onChangeText={(amount) => setReceiptForm({ ...receiptForm, amount })} placeholder="450000" />
        <Input testID={FINANCE.receiptNotes} label="Notes" value={receiptForm.notes} onChangeText={(notes) => setReceiptForm({ ...receiptForm, notes })} placeholder="Optional receipt note" />
        <Button testID={FINANCE.receiptSubmit} title={cashShift ? 'Post cash receipt' : 'Open cashbox before receiving payment'} onPress={recordReceipt} loading={busy === 'receipt'} disabled={!cashShift} />
      </Section>
      <Section title={`Payment call list (${visibleCallList.length})`} subtitle="Overdue balances and payments due within five days, with student and parent contacts">
        {visibleCallList.length === 0 ? <Empty text="No matching overdue or upcoming balances." /> : visibleCallList.map((item) => (
          <View key={item.invoice_id} testID={`finance-call-row-${item.invoice_id}`} style={styles.recordCard}>
            <View style={styles.recordTop}><Text style={styles.recordTitle}>{item.student_name}</Text><Text style={item.call_reason === 'overdue' ? styles.dangerAmount : styles.goodAmount}>{uzs(item.balance_uzs)}</Text></View>
            <Text style={styles.recordMeta}>{item.invoice_number} · due {item.due_date}</Text>
            <Status value={item.call_reason} />
            <Text style={styles.recordMeta}>Student: {item.student_phone || 'no phone'} · Parent: {item.parent_phone || 'no phone'}</Text>
            <View style={styles.lessonActions}>
              {item.student_phone && <TouchableOpacity style={styles.miniAction} onPress={() => void Linking.openURL(`tel:${item.student_phone}`)}><Text style={styles.miniActionText}>Call student</Text></TouchableOpacity>}
              {item.parent_phone && <TouchableOpacity style={styles.miniAction} onPress={() => void Linking.openURL(`tel:${item.parent_phone}`)}><Text style={styles.miniActionText}>Call parent</Text></TouchableOpacity>}
            </View>
            {item.notification_attention_count > 0 && <Text style={styles.warningText}>{item.notification_attention_count} notification job(s) need attention</Text>}
          </View>
        ))}
      </Section>
      <Section title="Invoice ledger" subtitle="Draft, finalized, partial, paid, and overdue balances">
        {visibleInvoices.length === 0 ? <Empty text="No matching invoices." /> : visibleInvoices.slice(0, 250).map((invoice) => (
          <View key={invoice.id} testID={`finance-invoice-row-${invoice.id}`} style={styles.recordCard}>
            <View style={styles.recordTop}><Text style={styles.recordTitle}>{studentName(invoice.student_id)}</Text><Status value={invoice.payment_status || invoice.status} /></View>
            <Text style={styles.recordMeta}>{invoice.invoice_number || 'DRAFT'} · service {invoice.service_month} · due {invoice.due_date}</Text>
            <MoneyRow label={`Paid ${uzs(invoice.amount_paid_uzs)}`} value={invoice.balance_uzs} valuePrefix="Balance " />
            {invoice.status === 'draft' && invoice.calculation_ready === false && <Text style={styles.warningText}>Recalculation required before finalization</Text>}
            {!isReception && invoice.status === 'finalized' && (
              <View style={styles.lessonActions}>
                <TouchableOpacity style={styles.miniAction} onPress={() => { setInvoiceCorrection({ invoice, kind: 'debit' }); setInvoiceCorrectionAmount(''); setInvoiceCorrectionReason(''); }}><Text style={styles.miniActionText}>Add debit</Text></TouchableOpacity>
                <TouchableOpacity style={styles.miniAction} onPress={() => { setInvoiceCorrection({ invoice, kind: 'credit' }); setInvoiceCorrectionAmount(''); setInvoiceCorrectionReason(''); }}><Text style={styles.miniActionText}>Add credit</Text></TouchableOpacity>
                {isSuperAdmin && <TouchableOpacity style={[styles.miniAction, styles.dangerAction]} onPress={() => { setInvoiceReversalTarget(invoice); setInvoiceReversalReason(''); }}><Text style={styles.miniActionText}>Reverse</Text></TouchableOpacity>}
              </View>
            )}
          </View>
        ))}
      </Section>
      {!isReception && invoiceCorrection && (
        <Section title={`${invoiceCorrection.kind === 'debit' ? 'Debit' : 'Credit'} correction · ${invoiceCorrection.invoice.invoice_number}`} subtitle="The original invoice remains auditable. Teacher earnings are intentionally unchanged.">
          <Input testID={FINANCE.invoiceCorrectionAmount} label="Amount (whole UZS)" keyboardType="number-pad" value={invoiceCorrectionAmount} onChangeText={setInvoiceCorrectionAmount} />
          <Input testID={FINANCE.invoiceCorrectionReason} label="Audit reason" value={invoiceCorrectionReason} onChangeText={setInvoiceCorrectionReason} multiline />
          <View style={styles.actionRow}><Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setInvoiceCorrection(null)} /><Button testID={FINANCE.invoiceCorrectionSubmit} title="Post correction" style={styles.flexButton} onPress={postInvoiceCorrection} loading={busy === 'invoice-correction'} /></View>
        </Section>
      )}
      {isSuperAdmin && invoiceReversalTarget && (
        <Section title={`Reverse ${invoiceReversalTarget.invoice_number}`} subtitle="A replacement draft will be created. The original invoice and teacher earning basis remain immutable.">
          <Input testID={FINANCE.invoiceReversalReason} label="Specific audit reason" value={invoiceReversalReason} onChangeText={setInvoiceReversalReason} multiline />
          <View style={styles.actionRow}><Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setInvoiceReversalTarget(null)} /><Button testID={FINANCE.invoiceReversalSubmit} title="Reverse and replace" style={styles.flexButton} onPress={reverseInvoiceValue} loading={busy === 'invoice-reversal'} /></View>
        </Section>
      )}
      <Section title="Recent receipts" subtitle="Posted receipts are immutable; corrections use a reversal record">
        {visibleReceipts.length === 0 ? <Empty text="No matching receipts." /> : visibleReceipts.slice(0, 50).map((receipt) => (
          <View key={receipt.id} testID={`finance-receipt-row-${receipt.id}`} style={styles.recordCard}>
            <View style={styles.recordTop}><Text style={styles.recordTitle}>{receipt.receipt_number}</Text><Text style={styles.goodAmount}>{uzs(receipt.amount_uzs)}</Text></View>
            <Text style={styles.recordMeta}>{studentName(receipt.student_id)} · {new Date(receipt.received_at).toLocaleString(getActiveLocale())}</Text>
            <Text style={styles.recordMeta}>Debt {uzs(receipt.allocated_amount_uzs)} · advance {uzs(receipt.advance_amount_uzs)}</Text>
            {isSuperAdmin && receipt.status === 'posted' && <Button title="Reverse receipt" variant="outline" onPress={() => { setReceiptReversalTarget(receipt); setReceiptReversalReason(''); }} />}
          </View>
        ))}
      </Section>
      {isSuperAdmin && receiptReversalTarget && (
        <Section title={`Reverse ${receiptReversalTarget.receipt_number}`} subtitle="The receipt and allocations are reversed atomically. A closed shift keeps its physical count and recalculates its discrepancy for review.">
          <Input testID={FINANCE.receiptReversalReason} label="Audit reason" value={receiptReversalReason} onChangeText={setReceiptReversalReason} multiline />
          <View style={styles.actionRow}><Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setReceiptReversalTarget(null)} /><Button testID={FINANCE.receiptReversalSubmit} title="Reverse receipt" style={styles.flexButton} onPress={reverseReceiptValue} loading={busy === 'receipt-reversal'} /></View>
        </Section>
      )}
    </>
  );

  const renderExpenses = () => (
    <>
      <View style={styles.actionRow}>
        <Button testID={FINANCE.generateRecurring} title="Generate recurring obligations" variant="outline" loading={busy === 'recurring'} onPress={() => void runAction('recurring', () => api.post('/finance/expenses/generate-recurring', { service_month: month, branch_id: null }), 'Recurring obligations generated idempotently.')} style={styles.flexButton} />
      </View>
      <Section title="Record non-monthly expense" subtitle="Creates an obligation first; payment is recorded separately from the cashbox.">
        <Input testID={FINANCE.otherExpenseCategory} label="Category" value={otherExpense.category} onChangeText={(category) => setOtherExpense({ ...otherExpense, category })} placeholder="Other" />
        <Input testID={FINANCE.otherExpenseRecipient} label="Recipient *" value={otherExpense.recipient} onChangeText={(recipient) => setOtherExpense({ ...otherExpense, recipient })} placeholder="Who is owed" />
        <CalendarDatePicker testID={FINANCE.otherExpenseDate} label="Expense date *" value={otherExpense.expense_date} onChange={(expense_date) => setOtherExpense({ ...otherExpense, expense_date })} />
        <Input testID={FINANCE.otherExpenseAmount} label="Amount (whole UZS) *" keyboardType="number-pad" value={otherExpense.amount} onChangeText={(amount) => setOtherExpense({ ...otherExpense, amount })} />
        <Input testID={FINANCE.otherExpenseExplanation} label="Explanation *" value={otherExpense.explanation} onChangeText={(explanation) => setOtherExpense({ ...otherExpense, explanation })} multiline />
        <Button testID={FINANCE.otherExpenseSubmit} title="Record expense obligation" onPress={createOtherExpense} loading={busy === 'other-expense'} />
      </Section>
      <Section title={`Expense obligations · ${month}`} subtitle="Accrued, paid, and outstanding">
        {expenses.length === 0 ? <Empty text="Generate recurring expenses or record an Other expense." /> : expenses.map((expense) => (
          <View key={expense.id} testID={`finance-expense-row-${expense.id}`} style={styles.recordCard}>
            <View style={styles.recordTop}><Text style={styles.recordTitle}>{expense.category}</Text><Status value={expense.status} /></View>
            <Text style={styles.recordMeta}>{expense.recipient} · {expense.obligation_date}</Text>
            <MoneyRow label={`Accrued ${uzs(expense.accrued_amount_uzs)} · paid ${uzs(expense.paid_amount_uzs)}`} value={expense.outstanding_amount_uzs} valuePrefix="Owed " />
            {expense.amount_status === 'required' && <Button title="Enter this month's actual amount" variant="outline" onPress={() => { setManualExpenseTarget(expense); setManualExpenseAmount(''); }} />}
            {isSuperAdmin && expense.amount_status !== 'required' && <Button title="Correct accrued amount" variant="outline" onPress={() => { setExpenseCorrectionTarget(expense); setExpenseCorrectionAmount(String(expense.accrued_amount_uzs)); setExpenseCorrectionReason(''); }} />}
            {expense.outstanding_amount_uzs > 0 && <Button title="Pay from cashbox" variant="outline" disabled={!cashShift} onPress={() => { setOutgoing({ type: 'expense', id: expense.id, label: expense.category, maximum: expense.outstanding_amount_uzs }); setOutgoingAmount(String(expense.outstanding_amount_uzs)); }} />}
          </View>
        ))}
      </Section>
      {manualExpenseTarget && <Section title={`Set ${manualExpenseTarget.category} amount`} subtitle="This can be entered once for the month; later corrections require an audited correction workflow."><Input testID={FINANCE.manualExpenseAmount} label="Actual amount (whole UZS)" keyboardType="number-pad" value={manualExpenseAmount} onChangeText={setManualExpenseAmount} /><View style={styles.actionRow}><Button title="Cancel" variant="outline" onPress={() => setManualExpenseTarget(null)} style={styles.flexButton} /><Button testID={FINANCE.manualExpenseSubmit} title="Set amount" onPress={setManualExpenseAmountValue} loading={busy === 'manual-expense-amount'} style={styles.flexButton} /></View></Section>}
      {isSuperAdmin && expenseCorrectionTarget && <Section title={`Correct ${expenseCorrectionTarget.category}`} subtitle="Set 0 to cancel an unpaid obligation. The previous amount remains in the audit event."><Input testID={FINANCE.expenseCorrectionAmount} label="Correct amount (whole UZS)" keyboardType="number-pad" value={expenseCorrectionAmount} onChangeText={setExpenseCorrectionAmount} /><Input testID={FINANCE.expenseCorrectionReason} label="Audit reason" value={expenseCorrectionReason} onChangeText={setExpenseCorrectionReason} multiline /><View style={styles.actionRow}><Button title="Cancel" variant="outline" onPress={() => setExpenseCorrectionTarget(null)} style={styles.flexButton} /><Button testID={FINANCE.expenseCorrectionSubmit} title="Post correction" onPress={correctExpenseAmount} loading={busy === 'expense-correction'} style={styles.flexButton} /></View></Section>}
      {outgoing?.type === 'expense' && <OutgoingPanel outgoing={outgoing} amount={outgoingAmount} setAmount={setOutgoingAmount} busy={busy === 'outgoing'} onPay={payOutgoing} onCancel={() => setOutgoing(null)} />}
    </>
  );

  const renderPayroll = () => (
    <>
      <Section title={`Teacher payroll · ${month}`} subtitle="Earnings are based on held scheduled lessons and do not depend on student collection or centre-funded discounts.">
        {earnings.length === 0 ? <Empty text="Teacher earnings appear when invoices are finalized." /> : earnings.map((earning) => (
          <View key={earning.id} testID={`finance-payroll-row-${earning.id}`} style={styles.recordCard}>
            <View style={styles.recordTop}><Text style={styles.recordTitle}>{teacherName(earning.teacher_id)}</Text><Status value={earning.status} /></View>
            <Text style={styles.recordMeta}>Salary due {earning.due_date}</Text>
            <MoneyRow label={`Earned ${uzs(earning.earned_amount_uzs)} · paid ${uzs(earning.paid_amount_uzs)}`} value={earning.outstanding_amount_uzs} valuePrefix="Owed " />
            {earning.outstanding_amount_uzs > 0 && <Button title="Pay from cashbox" variant="outline" disabled={!cashShift} onPress={() => { setOutgoing({ type: 'teacher', id: earning.id, label: teacherName(earning.teacher_id), maximum: earning.outstanding_amount_uzs }); setOutgoingAmount(String(earning.outstanding_amount_uzs)); }} />}
          </View>
        ))}
      </Section>
      {outgoing?.type === 'teacher' && <OutgoingPanel outgoing={outgoing} amount={outgoingAmount} setAmount={setOutgoingAmount} busy={busy === 'outgoing'} onPay={payOutgoing} onCancel={() => setOutgoing(null)} />}
    </>
  );

  const renderCash = () => (
    <>
      <Section title="Main cashbox" subtitle="One operator owns each open daily shift.">
        {cashShift ? (
          <>
            <View style={styles.kpiGrid}>
              <Kpi testID={FINANCE.cashOpeningKpi} label="Opening" value={cashShift.opening_balance_uzs} icon="lock-open" color={COLORS.info} />
              <Kpi testID={FINANCE.cashReceivedKpi} label="Cash received" value={cashShift.receipt_total_uzs} icon="arrow-down" color={COLORS.success} />
              <Kpi testID={FINANCE.cashRemovedKpi} label="Cash removed" value={cashShift.removal_total_uzs} icon="arrow-up" color={COLORS.warning} />
              <Kpi testID={FINANCE.cashExpectedKpi} label="Expected now" value={expectedCash} icon="cash" color={COLORS.gold} />
            </View>
            <Text style={styles.recordMeta}>Opened {new Date(cashShift.opened_at).toLocaleString(getActiveLocale())}</Text>
            <Input testID={FINANCE.cashClosingAmount} label="Counted closing balance (whole UZS)" keyboardType="number-pad" value={shiftForm.closing} onChangeText={(closing) => setShiftForm({ ...shiftForm, closing })} placeholder={String(expectedCash)} />
            <Button testID={FINANCE.cashClose} title="Close shift and record discrepancy" variant="outline" onPress={closeShift} loading={busy === 'close-shift'} />
          </>
        ) : (
          <>
            <Text style={styles.muted}>No shift is open. Record the counted opening cash before receiving or paying cash.</Text>
            <Input testID={FINANCE.cashOpeningAmount} label="Opening balance (whole UZS, 0 allowed)" keyboardType="number-pad" value={shiftForm.opening} onChangeText={(opening) => setShiftForm({ ...shiftForm, opening })} />
            <Button testID={FINANCE.cashOpen} title="Open main cashbox" onPress={openShift} loading={busy === 'open-shift'} />
          </>
        )}
      </Section>
      {!isReception && cashShift && (
        <Section title="Other cash movement" subtitle="Use expense/payroll payment buttons for obligations. This area is only for other income or a non-expense removal such as a bank deposit.">
          <Input testID={FINANCE.otherIncomeSource} label="Other income source" value={otherIncomeForm.source} onChangeText={(source) => setOtherIncomeForm({ ...otherIncomeForm, source })} placeholder="Source" />
          <CalendarDatePicker testID={FINANCE.otherIncomeDate} label="Income date" value={otherIncomeForm.income_date} onChange={(income_date) => setOtherIncomeForm({ ...otherIncomeForm, income_date })} />
          <Input testID={FINANCE.otherIncomeAmount} label="Income amount (whole UZS)" keyboardType="number-pad" value={otherIncomeForm.amount} onChangeText={(amount) => setOtherIncomeForm({ ...otherIncomeForm, amount })} />
          <Input testID={FINANCE.otherIncomeNotes} label="Income notes" value={otherIncomeForm.notes} onChangeText={(notes) => setOtherIncomeForm({ ...otherIncomeForm, notes })} />
          <Button testID={FINANCE.otherIncomeSubmit} title="Record other cash income" variant="outline" onPress={recordOtherIncomeValue} loading={busy === 'other-income'} />
          <View style={styles.formDivider} />
          <Input testID={FINANCE.cashRemovalAmount} label="Non-expense cash removal" keyboardType="number-pad" value={cashRemovalForm.amount} onChangeText={(amount) => setCashRemovalForm({ ...cashRemovalForm, amount })} />
          <Input testID={FINANCE.cashRemovalPurpose} label="Removal purpose" value={cashRemovalForm.purpose} onChangeText={(purpose) => setCashRemovalForm({ ...cashRemovalForm, purpose })} placeholder="For example: deposited to bank" />
          <Button testID={FINANCE.cashRemovalSubmit} title="Record authorized removal" variant="outline" onPress={recordCashRemoval} loading={busy === 'cash-removal'} />
        </Section>
      )}
      {!isReception && (
        <Section title={`Other income · ${month}`} subtitle="Non-tuition income recorded through the cashbox">
          {otherIncomeRows.length === 0 ? <Empty text="No other income in this month." /> : otherIncomeRows.map((row) => (
            <View key={row.id} testID={`finance-other-income-row-${row.id}`} style={styles.recordCard}>
              <View style={styles.recordTop}><Text style={styles.recordTitle}>{row.source}</Text><Text style={styles.goodAmount}>{uzs(row.amount_uzs)}</Text></View>
              <Text style={styles.recordMeta}>{row.income_date}</Text>
              {isSuperAdmin && <Button title="Reverse other income" variant="outline" onPress={() => { setCashReversalTarget({ kind: 'income', id: row.id, label: row.source }); setCashReversalReason(''); }} />}
            </View>
          ))}
        </Section>
      )}
      {!isReception && (
        <Section title="Expense and payroll cash payouts" subtitle="Payouts are separate from accrued obligations and remain visible after reversal.">
          {outgoingPayments.length === 0 ? <Empty text="No expense or payroll cash payouts yet." /> : outgoingPayments.map((payment) => (
            <View key={`${payment.payment_kind}-${payment.id}`} testID={`finance-outgoing-row-${payment.payment_kind}-${payment.id}`} style={styles.recordCard}>
              <View style={styles.recordTop}><Text style={styles.recordTitle}>{payment.payment_kind === 'teacher' ? 'Teacher payout' : 'Expense payment'}</Text><Text style={styles.dangerAmount}>{uzs(payment.amount_uzs)}</Text></View>
              <Text style={styles.recordMeta}>{tashkentDateTime(payment.paid_at)} · source {payment.source_id}</Text>
              <Status value={payment.status || 'posted'} />
              {isSuperAdmin && payment.status !== 'reversed' && <Button title="Reverse payout" variant="outline" onPress={() => { setCashReversalTarget({ kind: payment.payment_kind, id: payment.id, label: `${payment.payment_kind} payout` }); setCashReversalReason(''); }} />}
            </View>
          ))}
        </Section>
      )}
      {!isReception && (
        <Section title="Cashbox event ledger" subtitle="Recent incoming, outgoing, closing, and correction events">
          {cashEvents.length === 0 ? <Empty text="No cashbox events yet." /> : cashEvents.map((event) => (
            <View key={event.id} testID={`finance-cash-event-row-${event.id}`} style={styles.recordCard}>
              <View style={styles.recordTop}><Text style={styles.recordTitle}>{event.event_type.replaceAll('_', ' ')}</Text><Text style={styles.recordTitle}>{uzs(Math.abs(event.amount_uzs))}</Text></View>
              <Text style={styles.recordMeta}>{tashkentDateTime(event.created_at)}{event.purpose ? ` · ${event.purpose}` : ''}</Text>
            </View>
          ))}
        </Section>
      )}
      {!isReception && (
        <Section title="Cash shift history" subtitle="Physical counts are never overwritten; discrepancies require a super-admin decision.">
          {cashShifts.length === 0 ? <Empty text="No cash shifts yet." /> : cashShifts.map((shift) => (
            <View key={shift.id} testID={`finance-cash-shift-row-${shift.id}`} style={styles.recordCard}>
              <View style={styles.recordTop}><Text style={styles.recordTitle}>{tashkentDateTime(shift.opened_at)}</Text><Status value={shift.discrepancy_status || shift.status} /></View>
              <Text style={styles.recordMeta}>Opening {uzs(shift.opening_balance_uzs)} · received {uzs(shift.receipt_total_uzs)} · removed {uzs(shift.removal_total_uzs)}</Text>
              {shift.status === 'closed' && <Text style={styles.recordMeta}>Expected {uzs(shift.expected_closing_balance_uzs)} · counted {uzs(shift.actual_closing_balance_uzs)} · difference {uzs(shift.discrepancy_uzs)}</Text>}
              {isSuperAdmin && shift.discrepancy_status === 'pending_review' && <Button title="Review discrepancy" variant="outline" onPress={() => { setDiscrepancyTarget(shift); setDiscrepancyReason(''); }} />}
            </View>
          ))}
        </Section>
      )}
      {isSuperAdmin && discrepancyTarget && (
        <Section title="Review cash discrepancy" subtitle={`Difference ${uzs(discrepancyTarget.discrepancy_uzs)}. The physical count remains immutable.`}>
          <Input testID={FINANCE.discrepancyReason} label="Audit reason" value={discrepancyReason} onChangeText={setDiscrepancyReason} multiline />
          <View style={styles.actionRow}>
            <Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setDiscrepancyTarget(null)} />
            <Button testID={FINANCE.discrepancyInvestigate} title="Investigate" variant="outline" style={styles.flexButton} onPress={() => reviewDiscrepancy(false)} loading={busy === 'discrepancy-review'} />
            <Button testID={FINANCE.discrepancyAccept} title="Accept" style={styles.flexButton} onPress={() => reviewDiscrepancy(true)} loading={busy === 'discrepancy-review'} />
          </View>
        </Section>
      )}
      {isSuperAdmin && cashReversalTarget && (
        <Section title={`Reverse ${cashReversalTarget.label}`} subtitle="The original record is retained. A closed shift keeps its physical count and recalculates its discrepancy for review.">
          <Input testID={FINANCE.cashReversalReason} label="Specific audit reason" value={cashReversalReason} onChangeText={setCashReversalReason} multiline />
          <View style={styles.actionRow}><Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setCashReversalTarget(null)} /><Button testID={FINANCE.cashReversalSubmit} title="Reverse record" style={styles.flexButton} onPress={reverseCashLedgerRecord} loading={busy === 'cash-ledger-reversal'} /></View>
        </Section>
      )}
    </>
  );

  const renderPricing = () => (
    <>
      <Section title="Current tuition tariffs" subtitle="Prices are effective-dated; old lesson lines retain their original version.">
        {tariffs.map((policy) => (
          <View key={policy.id} testID={`finance-tariff-row-${policy.policy_key}`} style={styles.policyRow}>
            <View style={styles.flex}><Text style={styles.recordTitle}>{policy.policy_key.replace('tariff:', '').replaceAll(':', ' · ').replace('_', '-')}</Text><Text style={styles.recordMeta}>Effective {policy.effective_from}</Text></View>
            <Text style={styles.goodAmount}>{uzs(policy.value.monthly_price_uzs)}</Text>
          </View>
        ))}
      </Section>
      <Section title="Teacher revenue shares" subtitle="Paid by the centre in full, independent of student payment and centre-funded discounts.">
        {teacherShares.map((policy) => <MoneyRow key={policy.id} testID={`finance-teacher-share-row-${policy.policy_key}`} label={policy.policy_key.replace('teacher_share:', '')} value={policy.value.basis_points / 100} valueSuffix="%" raw />)}
      </Section>
      <Section title="Current recurring expenses" subtitle="Templates create obligations; they are not treated as paid until a cash payout is posted.">
        {recurringPolicies.map((policy) => policy.value.amount_mode === 'manual' || policy.value.amount_uzs == null
          ? <View key={policy.id} testID={`finance-recurring-row-${policy.policy_key}`} style={styles.moneyRow}><Text style={styles.moneyLabel}>{policy.value.name || policy.policy_key}</Text><Text style={styles.warningText}>Enter actual amount monthly</Text></View>
          : <MoneyRow key={policy.id} testID={`finance-recurring-row-${policy.policy_key}`} label={policy.value.name || policy.policy_key} value={policy.value.amount_uzs} />)}
      </Section>
      {isSuperAdmin && (
        <Section title="Create tariff version" subtitle="Use the exact effective date; this may split one month across two prices by scheduled lesson.">
          <Text style={styles.inputLabel}>Program</Text><View style={styles.pickerBox}><Picker selectedValue={tariffForm.program_code} onValueChange={(program_code) => setTariffForm({ ...tariffForm, program_code })} style={styles.picker} dropdownIconColor={COLORS.gold}><LocalizedPickerItem label="General" value="general" /><LocalizedPickerItem label="Pre-IELTS" value="pre_ielts" /><LocalizedPickerItem label="IELTS" value="ielts" /></Picker></View>
          <Text style={styles.inputLabel}>Format</Text><View style={styles.pickerBox}><Picker selectedValue={tariffForm.group_format} onValueChange={(group_format) => setTariffForm({ ...tariffForm, group_format })} style={styles.picker} dropdownIconColor={COLORS.gold}><LocalizedPickerItem label="Normal group" value="normal" /><LocalizedPickerItem label="Mini group" value="mini" /><LocalizedPickerItem label="Individual" value="individual" /></Picker></View>
          <Input testID={FINANCE.tariffAmount} label="New monthly price (whole UZS)" keyboardType="number-pad" value={tariffForm.amount} onChangeText={(amount) => setTariffForm({ ...tariffForm, amount })} />
          <CalendarDatePicker testID={FINANCE.tariffEffectiveFrom} label="Effective from" value={tariffForm.effective_from} onChange={(effective_from) => setTariffForm({ ...tariffForm, effective_from })} />
          <Input testID={FINANCE.tariffReason} label="Reason" value={tariffForm.reason} onChangeText={(reason) => setTariffForm({ ...tariffForm, reason })} />
          <Button testID={FINANCE.tariffSubmit} title="Create tariff version" onPress={saveTariff} loading={busy === 'tariff'} />
        </Section>
      )}
      {isSuperAdmin && (
        <Section title="Create teacher-share version" subtitle="This changes future lesson earnings only; finalized payroll remains immutable.">
          <Text style={styles.inputLabel}>Format</Text><View style={styles.pickerBox}><Picker selectedValue={teacherShareForm.group_format} onValueChange={(group_format: GroupFormat) => { const current = teacherShares.find((policy) => policy.policy_key === `teacher_share:${group_format}`); setTeacherShareForm({ ...teacherShareForm, group_format, percentage: String((current?.value.basis_points || 0) / 100) }); }} style={styles.picker} dropdownIconColor={COLORS.gold}><LocalizedPickerItem label="Normal group" value="normal" /><LocalizedPickerItem label="Mini group" value="mini" /><LocalizedPickerItem label="Individual" value="individual" /></Picker></View>
          <Input testID={FINANCE.teacherSharePercentage} label="Teacher share (%)" keyboardType="decimal-pad" value={teacherShareForm.percentage} onChangeText={(percentage) => setTeacherShareForm({ ...teacherShareForm, percentage })} />
          <CalendarDatePicker testID={FINANCE.teacherShareEffectiveFrom} label="Effective from" value={teacherShareForm.effective_from} onChange={(effective_from) => setTeacherShareForm({ ...teacherShareForm, effective_from })} />
          <Input testID={FINANCE.teacherShareReason} label="Reason" value={teacherShareForm.reason} onChangeText={(reason) => setTeacherShareForm({ ...teacherShareForm, reason })} />
          <Button testID={FINANCE.teacherShareSubmit} title="Create teacher-share version" variant="outline" onPress={saveTeacherShare} loading={busy === 'teacher-share'} />
        </Section>
      )}
      {isSuperAdmin && (
        <Section title="Create recurring expense version" subtitle="Use the same key (rent, accountant, wifi, tax) to update a template, or a new key for another recurring expense.">
          <Input testID={FINANCE.recurringKey} label="Expense key" value={recurringForm.expense_key} onChangeText={(expense_key) => setRecurringForm({ ...recurringForm, expense_key })} placeholder="rent" autoCapitalize="none" />
          <Input testID={FINANCE.recurringName} label="Display name" value={recurringForm.name} onChangeText={(name) => setRecurringForm({ ...recurringForm, name })} />
          <Input testID={FINANCE.recurringAmount} label="Monthly amount (whole UZS)" keyboardType="number-pad" value={recurringForm.amount} onChangeText={(amount) => setRecurringForm({ ...recurringForm, amount })} />
          <CalendarDatePicker testID={FINANCE.recurringEffectiveFrom} label="Effective from" value={recurringForm.effective_from} onChange={(effective_from) => setRecurringForm({ ...recurringForm, effective_from })} />
          <Input label="Classification" value={recurringForm.classification} onChangeText={(classification) => setRecurringForm({ ...recurringForm, classification })} />
          <Input testID={FINANCE.recurringReason} label="Reason" value={recurringForm.reason} onChangeText={(reason) => setRecurringForm({ ...recurringForm, reason })} />
          <Button testID={FINANCE.recurringSubmit} title="Create expense version" variant="outline" onPress={saveRecurringExpense} loading={busy === 'recurring-policy'} />
        </Section>
      )}
      <Section title="Billing calendar" subtitle={`Mode: ${billingPolicy?.value.operation_mode || 'not configured'} · automatic freeze: ${billingPolicy?.value.automatic_freeze_enabled ? 'on' : 'off'}`}>
        <View style={styles.threeColumns}><Input testID={FINANCE.billingDue} label="Student due day" keyboardType="number-pad" value={billingForm.due} onChangeText={(due) => setBillingForm({ ...billingForm, due })} style={styles.compactInput} editable={isSuperAdmin} /><Input testID={FINANCE.billingFreeze} label="Freeze day" keyboardType="number-pad" value={billingForm.freeze} onChangeText={(freeze) => setBillingForm({ ...billingForm, freeze })} style={styles.compactInput} editable={isSuperAdmin} /><Input testID={FINANCE.billingSalary} label="Salary due day" keyboardType="number-pad" value={billingForm.salary} onChangeText={(salary) => setBillingForm({ ...billingForm, salary })} style={styles.compactInput} editable={isSuperAdmin} /></View>
        {isSuperAdmin && <><CalendarDatePicker testID={FINANCE.billingEffectiveFrom} label="Effective from" value={billingForm.effective_from} onChange={(effective_from) => setBillingForm({ ...billingForm, effective_from })} /><Input testID={FINANCE.billingReason} label="Reason" value={billingForm.reason} onChangeText={(reason) => setBillingForm({ ...billingForm, reason })} /><Button testID={FINANCE.billingSubmit} title="Version billing dates" variant="outline" onPress={saveBillingRules} loading={busy === 'billing'} /></>}
      </Section>
    </>
  );

  const renderClosures = () => (
    <>
      <Section title={`Lesson controls · ${month}`} subtitle="Every originally scheduled lesson must be resolved before finalization. Student absence still counts as a held, billable lesson.">
        <Text style={styles.inputLabel}>Group</Text>
        <View style={styles.pickerBox}>
          <Picker testID={FINANCE.lessonGroup} selectedValue={selectedGroupId} onValueChange={setSelectedGroupId} style={styles.picker} dropdownIconColor={COLORS.gold}>
            <LocalizedPickerItem label="Select group" value="" />
            {groups.map((group) => <LocalizedPickerItem key={group.id} label={group.name} value={group.id} />)}
          </Picker>
        </View>
        <Button testID={FINANCE.lessonGenerate} title="Generate / refresh scheduled lessons" variant="outline" disabled={!selectedGroupId} loading={busy === 'occurrences'} onPress={generateOccurrences} />
        <View style={styles.lessonList}>
          {occurrences.length === 0 ? <Empty text="No lesson occurrences for this group and month." /> : occurrences.map((occurrence) => (
            <View key={occurrence.id} testID={`finance-lesson-row-${occurrence.id}`} style={styles.recordCard}>
              <View style={styles.recordTop}>
                <Text style={styles.recordTitle}>{occurrence.local_date} · {tashkentTime(occurrence.starts_at)}–{tashkentTime(occurrence.ends_at)}</Text>
                <Status value={occurrence.resolution_status} />
              </View>
              <Text style={styles.recordMeta}>{occurrence.lesson_status.replace('_', ' ')}{occurrence.locked_at ? ' · financially locked' : ''}</Text>
              {!occurrence.locked_at && occurrence.resolution_status === 'unresolved' && (
                <View style={styles.lessonActions}>
                  <TouchableOpacity testID={`finance-lesson-held-${occurrence.id}`} style={[styles.miniAction, styles.goodAction]} disabled={busy === `resolve-${occurrence.id}`} onPress={() => resolveOccurrence(occurrence, 'held')}><Text style={styles.miniActionText}>Held</Text></TouchableOpacity>
                  <TouchableOpacity testID={`finance-lesson-replacement-${occurrence.id}`} style={styles.miniAction} disabled={busy === `resolve-${occurrence.id}`} onPress={() => resolveOccurrence(occurrence, 'replacement_required')}><Text style={styles.miniActionText}>Replacement</Text></TouchableOpacity>
                  <TouchableOpacity testID={`finance-lesson-cancelled-${occurrence.id}`} style={[styles.miniAction, styles.dangerAction]} disabled={busy === `resolve-${occurrence.id}`} onPress={() => resolveOccurrence(occurrence, 'teacher_cancelled')}><Text style={styles.miniActionText}>Cancelled</Text></TouchableOpacity>
                </View>
              )}
              {!occurrence.locked_at && occurrence.resolution_status === 'pending_approval' && (
                <View style={styles.lessonActions}>
                  <TouchableOpacity style={[styles.miniAction, styles.goodAction]} onPress={() => decidePendingException(occurrence, true)}><Text style={styles.miniActionText}>Approve</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.miniAction, styles.dangerAction]} onPress={() => decidePendingException(occurrence, false)}><Text style={styles.miniActionText}>Reject</Text></TouchableOpacity>
                </View>
              )}
              {!occurrence.locked_at && occurrence.resolution_status === 'replacement_required' && (
                <Button title="Schedule replacement" variant="outline" onPress={() => setReplacementTarget(occurrence)} style={styles.inlineButton} />
              )}
            </View>
          ))}
        </View>
      </Section>
      {replacementTarget && (
        <Section title={`Replacement for ${replacementTarget.local_date}`} subtitle="This lesson does not add another denominator slot. It becomes billable only after it is held.">
          <DateTimePicker label="Starts (Tashkent local)" value={replacementForm.starts_at} onChange={(starts_at) => setReplacementForm({ ...replacementForm, starts_at })} />
          <DateTimePicker label="Ends (Tashkent local)" value={replacementForm.ends_at} onChange={(ends_at) => setReplacementForm({ ...replacementForm, ends_at })} />
          <Input label="Reason" value={replacementForm.reason} onChangeText={(reason) => setReplacementForm({ ...replacementForm, reason })} />
          <View style={styles.actionRow}><Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setReplacementTarget(null)} /><Button title="Schedule replacement" style={styles.flexButton} loading={busy === 'replacement'} onPress={scheduleReplacement} /></View>
        </Section>
      )}
      <Section title="Add centre closure" subtitle="Matching scheduled lessons remain in the monthly denominator but are not charged and do not create teacher earnings.">
        <Input testID={FINANCE.closureTitle} label="Title" value={closureForm.title} onChangeText={(title) => setClosureForm({ ...closureForm, title })} placeholder="Public holiday" />
        <Input testID={FINANCE.closureReason} label="Reason" value={closureForm.reason} onChangeText={(reason) => setClosureForm({ ...closureForm, reason })} />
        <Text style={styles.inputLabel}>Kind</Text><View style={styles.pickerBox}><Picker selectedValue={closureForm.kind} onValueChange={(kind) => setClosureForm({ ...closureForm, kind })} style={styles.picker} dropdownIconColor={COLORS.gold}><LocalizedPickerItem label="Official holiday" value="holiday" /><LocalizedPickerItem label="Unexpected closure" value="unexpected" /></Picker></View>
        <Text style={styles.inputLabel}>Scope</Text><View style={styles.pickerBox}><Picker selectedValue={closureForm.group_id} onValueChange={(group_id) => setClosureForm({ ...closureForm, group_id })} style={styles.picker} dropdownIconColor={COLORS.gold}><LocalizedPickerItem label="All centre / branch groups" value="" />{groups.map((group) => <LocalizedPickerItem key={group.id} label={group.name} value={group.id} />)}</Picker></View>
        <DateTimePicker testID={FINANCE.closureStarts} label="Starts (Tashkent local)" value={closureForm.starts_at} onChange={(starts_at) => setClosureForm({ ...closureForm, starts_at })} />
        <DateTimePicker testID={FINANCE.closureEnds} label="Ends (Tashkent local)" value={closureForm.ends_at} onChange={(ends_at) => setClosureForm({ ...closureForm, ends_at })} />
        <Button testID={FINANCE.closureSubmit} title="Add closure" onPress={createClosure} loading={busy === 'closure'} />
      </Section>
      <Section title="Closure register" subtitle="Historical closures cannot overwrite lessons locked by finalized invoices.">
        {closures.length === 0 ? <Empty text="No closures recorded." /> : closures.map((closure) => <View key={closure.id} testID={`finance-closure-row-${closure.id}`} style={styles.recordCard}><View style={styles.recordTop}><Text style={styles.recordTitle}>{closure.title}</Text><Status value={closure.kind} /></View><Text style={styles.recordMeta}>{tashkentDateTime(closure.starts_at)} – {tashkentDateTime(closure.ends_at)}</Text><Text style={styles.recordMeta}>{closure.reason}</Text></View>)}
      </Section>
    </>
  );

  return (
    <View testID={FINANCE.screen} style={styles.container}>
      <View style={styles.header}>
        <View><Text style={styles.title}>{isReception ? 'Reception finance' : 'Finance'}</Text><Text style={styles.subtitle}>{isReception ? 'Cash receipts, balances, and calls' : 'Accruals, cash, debt, spending, payroll, and controls'}</Text></View>
        {!isReception && <CalendarDatePicker testID={FINANCE.monthInput} value={month} onChange={setMonth} placeholder="Select month" mode="month" style={styles.monthInput} />}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabs}>
        {visibleTabs.map((tab) => <TouchableOpacity testID={`finance-tab-${tab.key}`} key={tab.key} style={[styles.tab, activeTab === tab.key && styles.activeTab]} onPress={() => setActiveTab(tab.key)}><Ionicons name={tab.icon as any} size={18} color={activeTab === tab.key ? COLORS.marbleDark : COLORS.textSecondary} /><Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>{tab.label}</Text></TouchableOpacity>)}
      </ScrollView>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInset} refreshControl={<RefreshControl refreshing={refreshing} tintColor={COLORS.gold} onRefresh={() => { setRefreshing(true); void loadData(); }} />}>
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'receivables' && renderReceivables()}
        {activeTab === 'expenses' && renderExpenses()}
        {activeTab === 'payroll' && renderPayroll()}
        {activeTab === 'cash' && renderCash()}
        {activeTab === 'pricing' && renderPricing()}
        {activeTab === 'closures' && renderClosures()}
        <View style={styles.bottomSpace} />
      </ScrollView>
    </View>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}<View style={styles.sectionBody}>{children}</View></View>;
}

function Kpi({ label, value, icon, color, testID }: { label: string; value: number; icon: string; color: string; testID?: string }) {
  return <View testID={testID} style={styles.kpi}><Ionicons name={icon as any} size={20} color={color} /><Text style={styles.kpiValue}>{uzs(value)}</Text><Text style={styles.kpiLabel}>{label}</Text></View>;
}

function MoneyRow({ label, value, strong, negative, valuePrefix = '', valueSuffix = '', raw = false, testID }: { label: string; value: number; strong?: boolean; negative?: boolean; valuePrefix?: string; valueSuffix?: string; raw?: boolean; testID?: string }) {
  return <View testID={testID} style={styles.moneyRow}><Text style={[styles.moneyLabel, strong && styles.strong]}>{label}</Text><Text style={[styles.moneyValue, strong && styles.strong, negative && styles.negative]}>{valuePrefix}{raw ? new Intl.NumberFormat(getActiveLocale()).format(value) : uzs(Math.abs(value))}{valueSuffix}</Text></View>;
}

function SpendingBar({ label, value, total, color, testID }: { label: string; value: number; total: number; color: string; testID?: string }) {
  const width = total > 0 ? `${Math.max(2, Math.round((value / total) * 100))}%` : '0%';
  return <View testID={testID} style={styles.barBlock}><View style={styles.recordTop}><Text style={styles.moneyLabel}>{label}</Text><Text style={styles.moneyValue}>{uzs(value)}</Text></View><View style={styles.barTrack}><View style={[styles.barFill, { width: width as any, backgroundColor: color }]} /></View></View>;
}

function Status({ value }: { value: string }) {
  const danger = ['overdue', 'unpaid', 'reversed'].includes(value);
  const good = ['paid', 'posted', 'finalized'].includes(value);
  const color = danger ? COLORS.error : good ? COLORS.success : COLORS.warning;
  return <View style={[styles.status, { backgroundColor: color + '22' }]}><Text style={[styles.statusText, { color }]}>{value.replace('_', ' ')}</Text></View>;
}

function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Ionicons name="file-tray-outline" size={28} color={COLORS.textTertiary} /><Text style={styles.muted}>{text}</Text></View>;
}

function OutgoingPanel({ outgoing, amount, setAmount, busy, onPay, onCancel }: { outgoing: { label: string; maximum: number }; amount: string; setAmount: (value: string) => void; busy: boolean; onPay: () => void; onCancel: () => void }) {
  return <Section title={`Pay ${outgoing.label}`} subtitle={`Maximum ${uzs(outgoing.maximum)} · cash only`}><Input testID={FINANCE.outgoingAmount} label="Amount (whole UZS)" keyboardType="number-pad" value={amount} onChangeText={setAmount} /><View style={styles.actionRow}><Button title="Cancel" variant="outline" onPress={onCancel} style={styles.flexButton} /><Button testID={FINANCE.outgoingSubmit} title="Post payout" onPress={onPay} loading={busy} style={styles.flexButton} /></View></Section>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background, padding: SIZES.lg },
  header: { paddingTop: SIZES.xl, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.md },
  title: { color: COLORS.textPrimary, fontSize: SIZES.fontXl, fontWeight: '800' },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: SIZES.xs, maxWidth: 270 },
  monthInput: { width: 180, marginBottom: 0 },
  tabScroll: { flexGrow: 0, backgroundColor: COLORS.marbleDark, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  tabs: { paddingHorizontal: SIZES.md, paddingBottom: SIZES.md, gap: SIZES.sm },
  tab: { flexDirection: 'row', alignItems: 'center', gap: SIZES.xs, paddingHorizontal: SIZES.md, height: 40, borderRadius: SIZES.radiusFull, backgroundColor: COLORS.backgroundCard },
  activeTab: { backgroundColor: COLORS.gold },
  tabText: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '600' },
  activeTabText: { color: COLORS.marbleDark },
  content: { flex: 1 },
  contentInset: { padding: SIZES.md },
  modeBanner: { flexDirection: 'row', gap: SIZES.md, backgroundColor: COLORS.gold + '15', borderWidth: 1, borderColor: COLORS.gold + '55', borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.md },
  modeTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '700' },
  modeText: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: SIZES.xs, lineHeight: 17 },
  flex: { flex: 1 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm, marginBottom: SIZES.md },
  kpi: { minWidth: '46%', flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, ...SHADOWS.small },
  kpiValue: { color: COLORS.textPrimary, fontWeight: '800', fontSize: SIZES.fontMd, marginTop: SIZES.sm },
  kpiLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: SIZES.xs },
  section: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusLg, padding: SIZES.md, marginBottom: SIZES.md, ...SHADOWS.small },
  sectionTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800' },
  sectionSubtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 17, marginTop: SIZES.xs },
  sectionBody: { marginTop: SIZES.md },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SIZES.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.marbleGray, paddingVertical: SIZES.sm },
  moneyLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, flex: 1 },
  moneyValue: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '600', textAlign: 'right' },
  strong: { color: COLORS.textPrimary, fontWeight: '800' },
  negative: { color: COLORS.error },
  barBlock: { marginBottom: SIZES.md },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: COLORS.backgroundLight, marginTop: SIZES.sm, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  recordCard: { backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.marbleGray },
  recordTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.sm },
  recordTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700', flex: 1 },
  recordMeta: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: SIZES.xs, lineHeight: 17 },
  goodAmount: { color: COLORS.success, fontSize: SIZES.fontSm, fontWeight: '800' },
  dangerAmount: { color: COLORS.error, fontSize: SIZES.fontSm, fontWeight: '800' },
  warningText: { color: COLORS.warning, fontSize: SIZES.fontXs, marginTop: SIZES.sm },
  status: { paddingHorizontal: SIZES.sm, paddingVertical: SIZES.xs, borderRadius: SIZES.radiusFull },
  statusText: { fontSize: SIZES.fontXs, fontWeight: '700', textTransform: 'capitalize' },
  inputLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '600', marginBottom: SIZES.xs },
  pickerBox: { height: 50, borderWidth: 1, borderColor: COLORS.marbleGray, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundLight, justifyContent: 'center', overflow: 'hidden', marginBottom: SIZES.md },
  picker: { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundLight, width: '100%' },
  actionRow: { flexDirection: 'row', gap: SIZES.sm, marginBottom: SIZES.md },
  formDivider: { height: 1, backgroundColor: COLORS.marbleGray, marginVertical: SIZES.lg },
  flexButton: { flex: 1 },
  policyRow: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.marbleGray, paddingVertical: SIZES.sm },
  lessonList: { marginTop: SIZES.md },
  lessonActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm, marginTop: SIZES.md },
  miniAction: { minHeight: 38, justifyContent: 'center', paddingHorizontal: SIZES.md, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.warning + '33', borderWidth: 1, borderColor: COLORS.warning },
  goodAction: { backgroundColor: COLORS.success + '22', borderColor: COLORS.success },
  dangerAction: { backgroundColor: COLORS.error + '22', borderColor: COLORS.error },
  miniActionText: { color: COLORS.textPrimary, fontSize: SIZES.fontXs, fontWeight: '700' },
  inlineButton: { marginTop: SIZES.md },
  threeColumns: { flexDirection: 'row', gap: SIZES.sm },
  compactInput: { minWidth: 0, paddingHorizontal: SIZES.sm, textAlign: 'center' },
  empty: { alignItems: 'center', gap: SIZES.sm, paddingVertical: SIZES.lg },
  muted: { color: COLORS.textTertiary, fontSize: SIZES.fontSm, lineHeight: 20, textAlign: 'center' },
  bottomSpace: { height: SIZES.xl },
});
