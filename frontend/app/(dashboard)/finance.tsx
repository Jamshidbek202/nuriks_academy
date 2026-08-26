import { getActiveLocale } from '../../src/i18n/translations';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Text, LocalizedPickerItem } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Picker } from '@react-native-picker/picker';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, LAYOUT, SHADOWS, SIZES } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { useFinanceLiveRefresh } from '../../src/hooks/use-finance-live-refresh';
import { FINANCE } from '../../constants/testIds';
import { showAlert, showConfirm } from '../../src/utils/cross-platform-alert';
import { CalendarDatePicker } from '../../src/components/CalendarDatePicker';
import { DateTimePicker } from '../../src/components/DateTimePicker';
import { MotionPressableCard, MotionReveal, MotionTouchableOpacity } from '../../src/components/Motion';
import { MOTION, useMotionPreference } from '../../src/contexts/MotionContext';
import { ConcourseAtmosphere, ConcourseGlassLayer, ConcourseTintLayer } from '../../src/components/ConcourseAtmosphere';

const Alert = { alert: showAlert };

type FinanceTab = 'overview' | 'receivables' | 'online' | 'expenses' | 'payroll' | 'cash' | 'pricing' | 'closures';
type ProgramCode = 'general' | 'pre_ielts' | 'ielts';
type GroupFormat = 'normal' | 'mini' | 'individual';

interface Student {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  phone?: string;
  parent_name?: string;
  parent_phone?: string;
  status?: string;
  finance_frozen?: boolean;
  payment_status?: 'overdue' | 'partial' | 'unpaid' | 'paid' | 'advance' | 'no_bill';
  amount_due_uzs?: number;
  amount_paid_uzs?: number;
  outstanding_uzs?: number;
  invoice_numbers?: string[];
  latest_payment_at?: string | null;
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
  branch_id?: string | null;
  status: 'active' | 'inactive';
}

interface CardPaymentReport {
  id: string;
  student_id: string;
  student_number?: string;
  student_name: string;
  parent_name?: string;
  reporter_name?: string;
  reporter_role?: 'parent' | 'student';
  amount_uzs: number;
  paid_at: string;
  reported_at: string;
  provider: 'click' | 'payme';
  destination_last4: string;
  destination_cardholder_name: string;
  status: 'unresolved' | 'confirmed' | 'rejected';
  resolution_reason?: string;
  resolved_by_name?: string;
  receipt_id?: string;
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
  business_date?: string;
  confirmation_status?: string;
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

interface FinanceCourse {
  id: string;
  name: string;
  program_code?: ProgramCode | null;
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
  branch_id?: string | null;
  operation_mode: string;
  is_provisional: boolean;
  gross_tuition_uzs: number;
  centre_funded_discounts_uzs: number;
  net_tuition_uzs: number;
  other_income_uzs: number;
  cash_received_uzs: number;
  card_transfer_received_uzs: number;
  total_collections_uzs: number;
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
  { key: 'overview', label: 'Overview', icon: 'analytics' },
  { key: 'receivables', label: 'Money in', icon: 'receipt' },
  { key: 'online', label: 'Transfers to verify', icon: 'card' },
  { key: 'expenses', label: 'Expenses', icon: 'arrow-up-circle' },
  { key: 'payroll', label: 'Payroll', icon: 'people-circle' },
  { key: 'cash', label: 'Cash day', icon: 'cash' },
  { key: 'pricing', label: 'Prices & rules', icon: 'pricetags' },
  { key: 'closures', label: 'Lesson calendar', icon: 'calendar' },
];

const PROGRAM_LABELS: Record<ProgramCode, string> = {
  general: 'General English',
  pre_ielts: 'Pre-IELTS',
  ielts: 'IELTS',
};

const FORMAT_LABELS: Record<GroupFormat, string> = {
  normal: 'Normal group',
  mini: 'Mini group',
  individual: 'Individual',
};

const GROUP_FORMATS: GroupFormat[] = ['normal', 'mini', 'individual'];

const uzs = (value?: number) => `${new Intl.NumberFormat(getActiveLocale()).format(value || 0)} UZS`;
const formatCard = (number: string) => number.replace(/(\d{4})(?=\d)/g, '$1 ');

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
  const { width } = useWindowDimensions();
  const isPhone = width < LAYOUT.mobileBreakpoint;
  const { user, token } = useAuth();
  const { reduceMotion, ready: motionReady } = useMotionPreference();
  const role = user?.role;
  const isReception = role === 'reception';
  const isSuperAdmin = role === 'super_admin';
  const [activeTab, setActiveTab] = useState<FinanceTab>(isReception ? 'receivables' : 'overview');
  const tabProgress = useRef(new Animated.Value(1)).current;
  const tabShift = useRef(new Animated.Value(0)).current;
  const previousTabIndexRef = useRef(tabs.findIndex((tab) => tab.key === (isReception ? 'receivables' : 'overview')));
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [paymentDestinations, setPaymentDestinations] = useState<PaymentDestination[]>([]);
  const [cardPaymentReports, setCardPaymentReports] = useState<CardPaymentReport[]>([]);
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
  const [financeCourses, setFinanceCourses] = useState<FinanceCourse[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [occurrences, setOccurrences] = useState<LessonOccurrence[]>([]);
  const refreshRequestRef = useRef(0);
  const actionLocksRef = useRef(new Set<string>());
  const pendingReceiptRef = useRef<{ key: string; fingerprint: string } | null>(null);

  const [receiptForm, setReceiptForm] = useState({ student_id: '', amount: '', notes: '' });
  const [financeSearch, setFinanceSearch] = useState('');
  const [receptionPaymentFilter, setReceptionPaymentFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [receiptNotice, setReceiptNotice] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [invoiceCorrection, setInvoiceCorrection] = useState<{
    invoice: Invoice; kind: 'debit' | 'credit';
  } | null>(null);
  const [invoiceCorrectionAmount, setInvoiceCorrectionAmount] = useState('');
  const [invoiceCorrectionReason, setInvoiceCorrectionReason] = useState('');
  const [invoiceReversalTarget, setInvoiceReversalTarget] = useState<Invoice | null>(null);
  const [invoiceReversalReason, setInvoiceReversalReason] = useState('');
  const [receiptReversalTarget, setReceiptReversalTarget] = useState<Receipt | null>(null);
  const [receiptReversalReason, setReceiptReversalReason] = useState('');
  const [unfreezeTarget, setUnfreezeTarget] = useState<Student | null>(null);
  const [unfreezeDate, setUnfreezeDate] = useState(tashkentDate());
  const [unfreezeReason, setUnfreezeReason] = useState('');
  const [destinationModalOpen, setDestinationModalOpen] = useState(false);
  const [destinationTarget, setDestinationTarget] = useState<PaymentDestination | null>(null);
  const [destinationForm, setDestinationForm] = useState({
    provider: 'click' as 'click' | 'payme',
    card_number: '',
    cardholder_name: '',
    label: '',
    reason: '',
  });
  const [cardReportTarget, setCardReportTarget] = useState<CardPaymentReport | null>(null);
  const [cardReportDecision, setCardReportDecision] = useState<'confirm' | 'reject'>('confirm');
  const [cardReportReason, setCardReportReason] = useState('');
  const [shiftForm, setShiftForm] = useState({ opening: '0', closing: '' });
  const [cashConfirmationTarget, setCashConfirmationTarget] = useState<CashShift | null>(null);
  const [cashConfirmationNotes, setCashConfirmationNotes] = useState('');
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
  const [tariffEditor, setTariffEditor] = useState<{
    program_code: ProgramCode;
    group_format: GroupFormat;
    courseNames: string;
  } | null>(null);
  const [teacherShareEditor, setTeacherShareEditor] = useState<GroupFormat | null>(null);
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

  useEffect(() => {
    const nextIndex = tabs.findIndex((tab) => tab.key === activeTab);
    const direction = nextIndex >= previousTabIndexRef.current ? 1 : -1;
    previousTabIndexRef.current = nextIndex;
    tabProgress.stopAnimation();
    tabShift.stopAnimation();
    if (!motionReady || reduceMotion) {
      tabProgress.setValue(1);
      tabShift.setValue(0);
      return;
    }
    tabProgress.setValue(0.74);
    tabShift.setValue(direction * 12);
    Animated.parallel([
      Animated.timing(tabProgress, {
        toValue: 1,
        duration: MOTION.state,
        easing: Easing.bezier(...MOTION.easing.enter),
        useNativeDriver: true,
      }),
      Animated.timing(tabShift, {
        toValue: 0,
        duration: MOTION.navigation,
        easing: Easing.bezier(...MOTION.easing.enter),
        useNativeDriver: true,
      }),
    ]).start();
    return () => {
      tabProgress.stopAnimation();
      tabShift.stopAnimation();
    };
  }, [activeTab, motionReady, reduceMotion, tabProgress, tabShift]);

  const studentMap = useMemo(
    () => Object.fromEntries(students.map((student) => [student.id, student])),
    [students],
  );
  const frozenStudents = useMemo(
    () => students
      .filter((student) => student.finance_frozen || student.status === 'frozen')
      .sort((left, right) => `${left.first_name} ${left.last_name}`.localeCompare(`${right.first_name} ${right.last_name}`)),
    [students],
  );
  const teacherMap = useMemo(
    () => Object.fromEntries(teachers.map((teacher) => [teacher.id, teacher])),
    [teachers],
  );
  const coursePricingGroups = useMemo(() => {
    const grouped = new Map<ProgramCode, FinanceCourse[]>();
    financeCourses.forEach((course) => {
      if (!course.program_code) return;
      grouped.set(course.program_code, [...(grouped.get(course.program_code) || []), course]);
    });
    return Array.from(grouped.entries()).map(([program_code, courses]) => ({
      program_code,
      courses: courses.sort((left, right) => left.name.localeCompare(right.name)),
    }));
  }, [financeCourses]);
  const normalizedSearch = financeSearch.trim().toLowerCase();
  const matchesStudent = (studentId: string) => {
    if (!normalizedSearch) return true;
    const student = studentMap[studentId];
    return [
      studentId,
      student?.student_id,
      student?.first_name,
      student?.last_name,
      `${student?.first_name || ''} ${student?.last_name || ''}`.trim(),
      student?.phone,
      student?.parent_name,
      student?.parent_phone,
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
  const matchingStudents = (() => {
    if (!normalizedSearch) return [];
    const linkedStudentIds = new Set<string>();
    invoices.forEach((invoice) => {
      if (String(invoice.invoice_number || '').toLowerCase().includes(normalizedSearch)) {
        linkedStudentIds.add(invoice.student_id);
      }
    });
    receipts.forEach((receipt) => {
      if (String(receipt.receipt_number || '').toLowerCase().includes(normalizedSearch)) {
        linkedStudentIds.add(receipt.student_id);
      }
    });
    return students
      .filter((student) => matchesStudent(student.id) || linkedStudentIds.has(student.id))
      .sort((left, right) => `${left.first_name} ${left.last_name}`.localeCompare(`${right.first_name} ${right.last_name}`))
      .slice(0, 12);
  })();
  const receptionVisibleStudents = students
    .filter((student) => {
      const matchesSearch = !normalizedSearch || [
        student.student_id,
        student.first_name,
        student.last_name,
        `${student.first_name} ${student.last_name}`,
        student.phone,
        student.parent_name,
        student.parent_phone,
        ...(student.invoice_numbers || []),
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      if (!matchesSearch) return false;
      if (receptionPaymentFilter === 'unpaid') {
        return ['overdue', 'partial', 'unpaid'].includes(student.payment_status || '');
      }
      if (receptionPaymentFilter === 'paid') {
        return ['paid', 'advance'].includes(student.payment_status || '');
      }
      return true;
    })
    .sort((left, right) => `${left.first_name} ${left.last_name}`.localeCompare(`${right.first_name} ${right.last_name}`));
  const selectedReceiptStudent = receiptForm.student_id ? studentMap[receiptForm.student_id] : null;
  const unresolvedCardReports = cardPaymentReports.filter((report) => report.status === 'unresolved');
  const resolvedCardReports = cardPaymentReports.filter((report) => report.status !== 'unresolved');
  const pendingCashDays = cashShifts.filter((shift) => shift.status === 'awaiting_confirmation');

  const changeMonth = (nextMonth: string) => {
    if (nextMonth === month) return;
    // Never relabel the previous month's money while the next snapshot loads.
    setLoading(true);
    setPosition(null);
    setExpenses([]);
    setEarnings([]);
    setOtherIncomeRows([]);
    setMonth(nextMonth);
  };

  const visibleTabs = isReception
    ? tabs.filter((tab) => tab.key === 'receivables').map((tab) => ({ ...tab, label: 'Student payments' }))
    : tabs;

  const loadData = useCallback(async (options?: { silent?: boolean }): Promise<boolean> => {
    const requestId = ++refreshRequestRef.current;
    if (!role || !['super_admin', 'manager', 'reception'].includes(role)) {
      if (requestId === refreshRequestRef.current) setLoading(false);
      return false;
    }
    try {
      if (isReception) {
        const reception = await Promise.all([
          api.get('/finance/reception/students'),
          api.get('/finance/reception/call-list'),
          api.get('/finance/cash-shifts/current').catch(() => ({ data: null })),
        ]);
        if (requestId !== refreshRequestRef.current) return false;
        setStudents(reception[0].data || []);
        setCallList(reception[1].data || []);
        setCashShift(reception[2].data || null);
        setInvoices([]);
        setReceipts([]);
        return true;
      }
      const commonPromise = Promise.all([
        api.get('/students', { params: { limit: 1000 } }),
        api.get('/finance/invoices', { params: { limit: 2000 } }),
        api.get('/finance/receipts', { params: { limit: 500 } }),
        api.get('/finance/reception/call-list'),
        api.get('/finance/cash-shifts/current').catch(() => ({ data: null })),
      ]);
      const soleActiveBranchPromise = isSuperAdmin
        ? api.get('/admin/branches')
          .then((response) => {
            const activeBranches = (response.data || []).filter((branch: { is_active?: boolean }) => branch.is_active !== false);
            return activeBranches.length === 1 ? activeBranches[0].id as string : null;
          })
          .catch(() => null)
        : Promise.resolve(null);
      const adminPromise = Promise.all([
        soleActiveBranchPromise.then((soleActiveBranchId) => api.get('/finance/position', {
          params: { service_month: month, ...(soleActiveBranchId ? { branch_id: soleActiveBranchId } : {}) },
        })),
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
        api.get('/courses'),
        api.get('/finance/payment-destinations', { params: { include_inactive: true } }),
        api.get('/finance/card-payment-reports', { params: { limit: 1000 } }),
      ]);
      const [common, admin] = await Promise.all([commonPromise, adminPromise]);
      // A newer invalidation owns the screen. Never let an older, slower set of
      // financial requests overwrite its snapshot.
      if (requestId !== refreshRequestRef.current) return false;
      setStudents(common[0].data || []);
      setInvoices(common[1].data || []);
      setReceipts(common[2].data || []);
      setCallList(common[3].data || []);
      setCashShift(common[4].data || null);
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
      setFinanceCourses(admin[11].data || []);
      setPaymentDestinations(admin[12].data || []);
      setCardPaymentReports(admin[13].data || []);
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
      return true;
    } catch (error: any) {
      if (requestId === refreshRequestRef.current) {
        if (!options?.silent) {
          Alert.alert('Finance data unavailable', error.response?.data?.detail || 'Could not load financial records.');
        }
      }
      return false;
    } finally {
      if (requestId === refreshRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [isReception, isSuperAdmin, month, role]);

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
    if (actionLocksRef.current.has(key)) return false;
    actionLocksRef.current.add(key);
    setBusy(key);
    try {
      await action();
      await loadData();
      Alert.alert('Recorded', success);
      return true;
    } catch (error: any) {
      Alert.alert('Could not complete action', error.response?.data?.detail || error.message || 'Unknown error');
      return false;
    } finally {
      actionLocksRef.current.delete(key);
      setBusy(null);
    }
  };

  const recordReceipt = async () => {
    const amount = parseWholeUzs(receiptForm.amount);
    if (!cashShift) {
      setReceiptNotice({ tone: 'error', text: 'The automatic cash day is unavailable. Refresh before accepting cash.' });
      return;
    }
    if (!receiptForm.student_id || amount == null) {
      setReceiptNotice({ tone: 'error', text: 'Select a student and enter a positive whole-UZS amount.' });
      return;
    }
    if (actionLocksRef.current.has('receipt')) return;
    const fingerprint = JSON.stringify({
      student_id: receiptForm.student_id,
      amount_uzs: amount,
      cash_shift_id: cashShift.id,
      notes: receiptForm.notes || null,
    });
    if (pendingReceiptRef.current?.fingerprint !== fingerprint) {
      pendingReceiptRef.current = { key: idempotencyKey('receipt'), fingerprint };
    }
    const receiptKey = pendingReceiptRef.current.key;
    actionLocksRef.current.add('receipt');
    setBusy('receipt');
    setReceiptNotice({ tone: 'warning', text: 'Recording and verifying this payment…' });
    try {
      try {
        await api.post('/finance/receipts/cash', {
          student_id: receiptForm.student_id,
          amount_uzs: amount,
          cash_shift_id: cashShift.id,
          notes: receiptForm.notes || null,
          idempotency_key: receiptKey,
        }, { timeout: 60_000, suppressNetworkErrorLog: true } as any);
      } catch (error: any) {
        if (error?.response) throw error;
        try {
          await api.get('/finance/receipts/idempotency-status', {
            params: { idempotency_key: receiptKey },
            timeout: 15_000,
          });
        } catch {
          const uncertainError = new Error('The connection ended before the payment could be verified. Press “Post cash receipt” again to retry the same payment safely; do not create a second entry.');
          (uncertainError as any).paymentUncertain = true;
          throw uncertainError;
        }
      }
      const refreshed = await loadData({ silent: true });
      pendingReceiptRef.current = null;
      setReceiptForm({ student_id: '', amount: '', notes: '' });
      setReceiptNotice({
        tone: refreshed ? 'success' : 'warning',
        text: refreshed
          ? 'Payment recorded once and allocated to the oldest debt.'
          : 'Payment recorded once. The student list is reconnecting and will update automatically.',
      });
    } catch (error: any) {
      setReceiptNotice({
        tone: error?.paymentUncertain ? 'warning' : 'error',
        text: error?.response?.data?.detail || error?.message || 'The payment could not be recorded.',
      });
    } finally {
      actionLocksRef.current.delete('receipt');
      setBusy(null);
    }
  };

  const openUnfreezeStudent = (student: Student) => {
    setUnfreezeTarget(student);
    setUnfreezeDate(tashkentDate());
    setUnfreezeReason('');
  };

  const unfreezeStudentAfterPayment = async () => {
    if (!unfreezeTarget) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(unfreezeDate)) {
      Alert.alert('Check unfreeze date', 'Choose a valid calendar date.');
      return;
    }
    if (unfreezeReason.trim().length < 5) {
      Alert.alert('Reason required', 'Enter at least five characters explaining how the payment was verified.');
      return;
    }
    const studentId = unfreezeTarget.id;
    const success = await runAction(
      `unfreeze-${studentId}`,
      () => api.post(`/finance/students/${studentId}/freeze-override`, {
        action: 'unfreeze',
        effective_on: unfreezeDate,
        reason: unfreezeReason.trim(),
        idempotency_key: idempotencyKey(`unfreeze-${studentId}`),
      }),
      `${unfreezeTarget.first_name} ${unfreezeTarget.last_name} can access classes again. The release was added to the finance audit trail.`,
    );
    if (!success) return;
    setStudents((current) => current.map((student) => student.id === studentId
      ? { ...student, status: 'active', finance_frozen: false }
      : student));
    setUnfreezeTarget(null);
    setUnfreezeReason('');
  };

  const openNewDestination = () => {
    setDestinationTarget(null);
    setDestinationForm({ provider: 'click', card_number: '', cardholder_name: '', label: '', reason: '' });
    setDestinationModalOpen(true);
  };

  const openDestinationEditor = (destination: PaymentDestination) => {
    setDestinationTarget(destination);
    setDestinationForm({
      provider: destination.provider,
      card_number: destination.card_number,
      cardholder_name: destination.cardholder_name,
      label: destination.label || '',
      reason: '',
    });
    setDestinationModalOpen(true);
  };

  const savePaymentDestination = () => {
    const cardNumber = destinationForm.card_number.replace(/\D/g, '');
    if (cardNumber.length !== 16 || destinationForm.cardholder_name.trim().length < 2) {
      return Alert.alert('Check receiving card', 'Enter exactly 16 card digits and the cardholder name.');
    }
    if (destinationTarget && destinationForm.reason.trim().length < 5) {
      return Alert.alert('Audit reason required', 'Explain the receiving-card change in at least five characters.');
    }
    const action = destinationTarget
      ? () => api.put(`/finance/payment-destinations/${destinationTarget.id}`, {
        provider: destinationForm.provider,
        card_number: cardNumber,
        cardholder_name: destinationForm.cardholder_name.trim(),
        label: destinationForm.label.trim(),
        reason: destinationForm.reason.trim(),
        idempotency_key: idempotencyKey(`destination-${destinationTarget.id}`),
      })
      : () => api.post('/finance/payment-destinations', {
        provider: destinationForm.provider,
        card_number: cardNumber,
        cardholder_name: destinationForm.cardholder_name.trim(),
        label: destinationForm.label.trim() || null,
        idempotency_key: idempotencyKey('destination-create'),
      });
    void runAction(
      'payment-destination',
      action,
      destinationTarget ? 'Receiving card updated.' : 'Receiving card added.',
    ).then((success) => {
      if (success) setDestinationModalOpen(false);
    });
  };

  const changeDestinationStatus = (destination: PaymentDestination, activate: boolean) => {
    showConfirm(
      activate ? 'Reactivate receiving card?' : 'Deactivate receiving card?',
      activate
        ? `Parents will be able to report transfers to •••• ${destination.card_last4}.`
        : 'Parents cannot start new payment reports to this card. Existing reports and history remain unchanged.',
      () => void runAction(
        `destination-status-${destination.id}`,
        () => api.put(`/finance/payment-destinations/${destination.id}`, {
          is_active: activate,
          reason: activate ? 'Receiving card reactivated by authorized staff' : 'Receiving card deactivated by authorized staff',
          idempotency_key: idempotencyKey(`destination-status-${destination.id}`),
        }),
        activate ? 'Receiving card reactivated.' : 'Receiving card deactivated without deleting its history.',
      ),
      activate ? 'Reactivate' : 'Deactivate',
    );
  };

  const openCardReportResolution = (report: CardPaymentReport, decision: 'confirm' | 'reject') => {
    setCardReportTarget(report);
    setCardReportDecision(decision);
    setCardReportReason(decision === 'confirm' ? 'Verified in receiving card transaction history' : '');
  };

  const resolveCardReport = () => {
    if (!cardReportTarget) return;
    if (cardReportDecision === 'reject' && cardReportReason.trim().length < 5) {
      return Alert.alert('Rejection reason required', 'Explain why this transfer could not be verified.');
    }
    const reportId = cardReportTarget.id;
    void runAction(
      `card-report-${cardReportDecision}-${reportId}`,
      () => api.post(`/finance/card-payment-reports/${reportId}/resolve`, {
        decision: cardReportDecision,
        reason: cardReportReason.trim() || null,
        idempotency_key: idempotencyKey(`card-report-${cardReportDecision}-${reportId}`),
      }),
      cardReportDecision === 'confirm'
        ? 'Transfer confirmed and posted as an official non-cash receipt.'
        : 'Payment report rejected without changing the student balance.',
    ).then((success) => {
      if (success) setCardReportTarget(null);
    });
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

  const confirmCashDay = () => {
    const closing = shiftForm.closing === '0' ? 0 : parseWholeUzs(shiftForm.closing);
    if (!cashConfirmationTarget || closing == null) return Alert.alert('Invalid balance', 'Enter the counted whole-UZS closing balance.');
    void runAction('confirm-cash-day', () => api.post(`/finance/cash-shifts/${cashConfirmationTarget.id}/confirm`, {
      actual_closing_balance_uzs: closing,
      notes: cashConfirmationNotes.trim() || null,
      idempotency_key: idempotencyKey(`confirm-cash-day-${cashConfirmationTarget.id}`),
    }), 'Cash day confirmed; any physical difference is retained for review.').then((success) => {
      if (!success) return;
      setShiftForm((current) => ({ ...current, closing: '' }));
      setCashConfirmationNotes('');
      setCashConfirmationTarget(null);
    });
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

  const openTariffEditor = (
    program_code: ProgramCode,
    group_format: GroupFormat,
    courseNames: string,
  ) => {
    const current = tariffs.find(
      (policy) => policy.policy_key === `tariff:${program_code}:${group_format}`,
    );
    setTariffForm({
      program_code,
      group_format,
      amount: current?.value.monthly_price_uzs == null
        ? ''
        : String(current.value.monthly_price_uzs),
      effective_from: tashkentDate(),
      reason: '',
    });
    setTariffEditor({ program_code, group_format, courseNames });
  };

  const openTeacherShareEditor = (group_format: GroupFormat) => {
    const current = teacherShares.find(
      (policy) => policy.policy_key === `teacher_share:${group_format}`,
    );
    setTeacherShareForm({
      group_format,
      percentage: String((current?.value.basis_points || 0) / 100),
      effective_from: tashkentDate(),
      reason: '',
    });
    setTeacherShareEditor(group_format);
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
    }), 'The course price was updated from its effective date.').then((success) => {
      if (!success) return;
      setTariffEditor(null);
      setTariffForm((current) => ({ ...current, amount: '', reason: '' }));
    });
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
    }), 'The teacher share was updated from its effective date.').then((success) => {
      if (!success) return;
      setTeacherShareEditor(null);
      setTeacherShareForm((current) => ({ ...current, reason: '' }));
    });
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

  const renderOverview = () => {
    if (!position) return null;

    const queueItems = [
      { icon: 'card', label: 'Transfers to verify', value: unresolvedCardReports.length, tone: 'warning' as const, onPress: () => setActiveTab('online') },
      { icon: 'call', label: 'Payment calls', value: callList.length, tone: 'warning' as const, onPress: () => setActiveTab('receivables') },
      { icon: 'calculator', label: 'Cash days to confirm', value: pendingCashDays.length, tone: 'warning' as const, onPress: () => setActiveTab('cash') },
      { icon: 'arrow-up-circle', label: 'Unpaid expenses', value: expenses.filter((row) => row.outstanding_amount_uzs > 0).length, onPress: () => setActiveTab('expenses') },
      { icon: 'people-circle', label: 'Unpaid payroll', value: earnings.filter((row) => row.outstanding_amount_uzs > 0).length, onPress: () => setActiveTab('payroll') },
    ];

    const attentionPanel = isPhone ? (
      <View style={styles.mobileAttentionPanel}>
        <ConcourseGlassLayer intensity={26} />
        <Text style={styles.sectionTitle}>Needs attention</Text>
        <Text style={styles.sectionSubtitle}>Swipe through open finance work.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileWorkQueue}>
          {queueItems.map((item) => <WorkQueueItem key={item.label} {...item} compact />)}
        </ScrollView>
      </View>
    ) : (
      <View style={styles.attentionPanel}>
        <ConcourseGlassLayer intensity={32} />
        <View style={styles.attentionHeader}>
          <View style={styles.flex}><Text style={styles.sectionTitle}>Needs attention</Text><Text style={styles.sectionSubtitle}>Open finance work, ordered for action.</Text></View>
          <View style={styles.attentionCount}><Text style={styles.attentionCountText}>{queueItems.reduce((sum, item) => sum + item.value, 0)}</Text></View>
        </View>
        <View style={styles.workQueueGrid}>
          {queueItems.map((item) => <WorkQueueItem key={item.label} {...item} />)}
        </View>
      </View>
    );

    const positionPanel = <FinancialPositionCard position={position} month={month} compact={isPhone} />;

    return (
      <>
        {width >= LAYOUT.desktopBreakpoint ? (
          <View style={styles.overviewOpeningGrid}>
            <View style={styles.overviewPosition}>{positionPanel}</View>
            <View style={styles.overviewAttention}>{attentionPanel}</View>
          </View>
        ) : (
          <>
            {attentionPanel}
            {positionPanel}
          </>
        )}
        <Section title="Cash and debt" subtitle="Collections and outstanding balances are kept separate from accrued revenue." tone="brand">
          <View style={styles.financeDetailGrid}>
            <FinanceDetailMetric testID={FINANCE.cashReceived} label="Cash received" value={position.cash_received_uzs} icon="arrow-down-circle-outline" color={COLORS.goldLight} />
            <FinanceDetailMetric testID={FINANCE.cardReceived} label="Verified card transfers" value={position.card_transfer_received_uzs} icon="card-outline" color={COLORS.success} />
            <FinanceDetailMetric testID={FINANCE.cashboxPosition} label="Cashbox position" value={position.cashbox_position_uzs} icon="cash-outline" color={COLORS.gold} />
            <FinanceDetailMetric testID={FINANCE.receivables} label="All receivables" value={position.receivables_uzs} icon="hourglass-outline" color={COLORS.warning} />
            <FinanceDetailMetric testID={FINANCE.overdue} label="Overdue" value={position.overdue_uzs} icon="alert-circle-outline" color={COLORS.error} />
          </View>
        </Section>
        <View style={styles.overviewColumns}>
            <View style={styles.overviewColumn}><Section title="Revenue bridge" subtitle="Accrued, not simply cash collected" tone="gold">
              <MoneyRow testID={FINANCE.grossTuition} label="Gross lesson tuition" value={position.gross_tuition_uzs} />
              <MoneyRow label="Centre-funded discounts" value={-position.centre_funded_discounts_uzs} negative />
              <MoneyRow testID={FINANCE.netTuition} label="Net tuition" value={position.net_tuition_uzs} strong />
              <MoneyRow testID={FINANCE.otherIncomeTotal} label="Other income" value={position.other_income_uzs} />
            </Section></View>
            <View style={styles.overviewColumn}><Section title="Spending and obligations" subtitle="Earned/accrued and paid are shown separately" tone="brand">
              <SpendingBar testID={FINANCE.salaryEarned} label="Teacher salaries earned" value={position.teacher_salary_earned_uzs} total={position.teacher_salary_earned_uzs + position.expenses_accrued_uzs} color={COLORS.gold} />
              {(position.teacher_salary_projected_uzs || 0) > 0 && <MoneyRow label="Included projected salary from drafts" value={position.teacher_salary_projected_uzs || 0} />}
              <SpendingBar testID={FINANCE.expensesAccrued} label="Operating expenses accrued" value={position.expenses_accrued_uzs} total={position.teacher_salary_earned_uzs + position.expenses_accrued_uzs} color={COLORS.warning} />
              <MoneyRow testID={FINANCE.salaryOutstanding} label="Salary outstanding" value={position.teacher_salary_outstanding_uzs} />
              <MoneyRow testID={FINANCE.expensesOutstanding} label="Expense outstanding" value={position.expenses_outstanding_uzs} />
              <MoneyRow testID={FINANCE.cashOutflow} label="Cash outflow this period" value={position.period_cash_outflow_uzs} />
              <MoneyRow testID={FINANCE.advances} label="Student advances held" value={position.advance_balances_uzs} />
            </Section></View>
        </View>
        <View style={styles.monthCloseCard}>
        <View style={styles.monthCloseCopy}><View style={styles.monthCloseIcon}><Ionicons name="lock-closed-outline" size={22} color={COLORS.gold} /></View><View style={styles.flex}><Text style={styles.monthCloseTitle}>Month close · {month}</Text><Text style={styles.monthCloseText}>Recalculate safely, then finalize only when all scheduled lessons and source records are resolved.</Text></View></View>
        <View style={styles.monthCloseActions}>
          <Button testID={FINANCE.recalculateDrafts} title="Recalculate drafts" variant="outline" style={styles.flexButton} loading={busy === 'drafts'} onPress={() => void runAction('drafts', () => api.post('/finance/invoices/generate-drafts', { service_month: month, branch_id: null }), 'Draft invoices recalculated from current locked source data.')} />
          <Button testID={FINANCE.finalizeMonth} title="Finalize month" style={styles.flexButton} loading={busy === 'finalize'} onPress={finalizeSelectedMonth} />
        </View>
        </View>
      </>
    );
  };

  const renderReceivables = () => (
    <>
      {isReception ? (
        <Section title="Student payment status" subtitle="Find any current student and see only the payment information needed for reception work. Centre revenue, profit, payroll, expenses, and cash totals are not available here.">
          <View style={styles.searchRow}>
            <View style={styles.flex}>
              <Input testID={FINANCE.studentSearch} value={financeSearch} onChangeText={setFinanceSearch} placeholder="Student, phone, parent, ID, or invoice..." autoCapitalize="none" />
            </View>
            {financeSearch.length > 0 && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear student search" style={styles.searchClear} onPress={() => setFinanceSearch('')}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.filterChips}>
            {(['all', 'unpaid', 'paid'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                testID={`finance-reception-filter-${filter}`}
                accessibilityRole="button"
                style={[styles.filterChip, receptionPaymentFilter === filter && styles.filterChipActive]}
                onPress={() => setReceptionPaymentFilter(filter)}
              >
                <Text style={[styles.filterChipText, receptionPaymentFilter === filter && styles.filterChipTextActive]}>
                  {filter === 'all' ? 'All students' : filter === 'unpaid' ? 'Unpaid / partial' : 'Paid'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View testID={FINANCE.studentSearchResults} style={styles.searchResults}>
            {receptionVisibleStudents.length === 0 ? <Empty text="No students match this search and payment filter." /> : receptionVisibleStudents.map((student) => {
              const selected = receiptForm.student_id === student.id;
              const outstanding = student.outstanding_uzs || 0;
              return (
                <TouchableOpacity
                  key={student.id}
                  testID={`finance-student-result-${student.id}`}
                  accessibilityRole="button"
                  style={[styles.studentResult, selected && styles.studentResultSelected]}
                  onPress={() => {
                    setReceiptForm((current) => ({ ...current, student_id: student.id }));
                    setFinanceSearch(student.student_id);
                  }}
                >
                  <View style={styles.studentResultIcon}><Ionicons name={selected ? 'checkmark' : 'person'} size={18} color={selected ? COLORS.marbleDark : COLORS.gold} /></View>
                  <View style={styles.flex}>
                    <Text style={styles.recordTitle}>{student.first_name} {student.last_name}</Text>
                    <Text style={styles.recordMeta}>{student.student_id} · {student.phone || 'no student phone'}{student.parent_phone ? ` · parent ${student.parent_phone}` : ''}</Text>
                    <Text style={styles.recordMeta}>{student.payment_status === 'no_bill' ? 'No finalized bill yet' : `Status: ${String(student.payment_status || 'unknown').replace('_', ' ')}`}</Text>
                  </View>
                  <Text style={outstanding > 0 ? styles.dangerAmount : styles.goodAmount}>{outstanding > 0 ? uzs(outstanding) : 'No debt'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>
      ) : (
      <Section title="Search student finances" subtitle="Search by student, phone, parent, invoice, or receipt number, then choose the student for a payment.">
        <View style={styles.searchRow}>
          <View style={styles.flex}>
            <Input testID={FINANCE.studentSearch} value={financeSearch} onChangeText={setFinanceSearch} placeholder="Name, phone, parent, student ID, invoice..." autoCapitalize="none" />
          </View>
          {financeSearch.length > 0 && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear student search" style={styles.searchClear} onPress={() => setFinanceSearch('')}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        {normalizedSearch ? (
          <View testID={FINANCE.studentSearchResults} style={styles.searchResults}>
            {matchingStudents.length === 0 ? <Empty text="No student, phone, invoice, or receipt matches this search." /> : matchingStudents.map((student) => {
              const outstanding = invoices
                .filter((invoice) => invoice.student_id === student.id && invoice.status === 'finalized')
                .reduce((sum, invoice) => sum + invoice.balance_uzs, 0);
              const selected = receiptForm.student_id === student.id;
              return (
                <TouchableOpacity
                  key={student.id}
                  testID={`finance-student-result-${student.id}`}
                  accessibilityRole="button"
                  style={[styles.studentResult, selected && styles.studentResultSelected]}
                  onPress={() => {
                    setReceiptForm((current) => ({ ...current, student_id: student.id }));
                    setFinanceSearch(student.student_id);
                  }}
                >
                  <View style={styles.studentResultIcon}><Ionicons name={selected ? 'checkmark' : 'person'} size={18} color={selected ? COLORS.marbleDark : COLORS.gold} /></View>
                  <View style={styles.flex}>
                    <Text style={styles.recordTitle}>{student.first_name} {student.last_name}</Text>
                    <Text style={styles.recordMeta}>{student.student_id} · {student.phone || 'no phone'}{student.parent_phone ? ` · parent ${student.parent_phone}` : ''}</Text>
                  </View>
                  <Text style={outstanding > 0 ? styles.dangerAmount : styles.goodAmount}>{uzs(outstanding)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : <Text style={styles.searchHint}>Start typing to find and select a student.</Text>}
      </Section>
      )}
      <Section title="Record cash payment" subtitle="Cash only. Payment is allocated to the oldest debt; any remainder becomes an advance.">
        {receiptNotice && (
          <View
            testID="finance-receipt-notice"
            style={[
              styles.receiptNotice,
              receiptNotice.tone === 'success' ? styles.receiptNoticeSuccess : receiptNotice.tone === 'error' ? styles.receiptNoticeError : styles.receiptNoticeWarning,
            ]}
          >
            <Ionicons name={receiptNotice.tone === 'success' ? 'checkmark-circle' : receiptNotice.tone === 'error' ? 'alert-circle' : 'time'} size={20} color={receiptNotice.tone === 'success' ? COLORS.success : receiptNotice.tone === 'error' ? COLORS.error : COLORS.warning} />
            <Text style={styles.receiptNoticeText}>{receiptNotice.text}</Text>
          </View>
        )}
        <Text style={styles.inputLabel}>Selected student *</Text>
        {selectedReceiptStudent ? (
          <View testID={FINANCE.receiptStudent} style={styles.selectedStudentCard}>
            <View style={styles.flex}>
              <Text style={styles.recordTitle}>{selectedReceiptStudent.first_name} {selectedReceiptStudent.last_name}</Text>
              <Text style={styles.recordMeta}>{selectedReceiptStudent.student_id} · {selectedReceiptStudent.phone || 'no phone'}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" onPress={() => setReceiptForm((current) => ({ ...current, student_id: '' }))} style={styles.changeStudentButton}>
              <Text style={styles.miniActionText}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View testID={FINANCE.receiptStudent} style={styles.unselectedStudentCard}>
            <Ionicons name="search" size={20} color={COLORS.gold} />
            <Text style={styles.muted}>Search above and choose the student who is paying.</Text>
          </View>
        )}
        <Input testID={FINANCE.receiptAmount} label="Amount (whole UZS) *" keyboardType="number-pad" value={receiptForm.amount} onChangeText={(amount) => setReceiptForm({ ...receiptForm, amount })} placeholder="450000" />
        <Input testID={FINANCE.receiptNotes} label="Notes" value={receiptForm.notes} onChangeText={(notes) => setReceiptForm({ ...receiptForm, notes })} placeholder="Optional receipt note" />
        <Button testID={FINANCE.receiptSubmit} title={cashShift ? 'Post cash receipt' : 'Automatic cashbox unavailable — refresh'} onPress={() => void recordReceipt()} loading={busy === 'receipt'} disabled={!cashShift} />
      </Section>
      {!isReception && <Section
        title={`Financially frozen students (${frozenStudents.length})`}
        subtitle="Record the payment first. Automatic debt freezes clear when all overdue debt is paid; if a student remains frozen after review, only the super admin can release access here."
      >
        {frozenStudents.length === 0 ? <Empty text="No students are financially frozen." /> : frozenStudents.map((student) => {
          const outstanding = invoices
            .filter((invoice) => invoice.student_id === student.id && invoice.status === 'finalized')
            .reduce((sum, invoice) => sum + invoice.balance_uzs, 0);
          return (
            <View key={student.id} testID={`finance-frozen-student-${student.id}`} style={styles.recordCard}>
              <View style={styles.recordTop}>
                <View style={styles.flex}>
                  <Text style={styles.recordTitle}>{student.first_name} {student.last_name}</Text>
                  <Text style={styles.recordMeta}>{student.student_id} · {student.phone || 'no phone'}</Text>
                </View>
                <Status value="frozen" />
              </View>
              <MoneyRow label="Outstanding finalized debt" value={outstanding} />
              {isSuperAdmin ? (
                <Button
                  testID={`finance-unfreeze-student-${student.id}`}
                  title="Unfreeze after payment review"
                  variant="outline"
                  onPress={() => openUnfreezeStudent(student)}
                />
              ) : (
                <Text style={styles.warningText}>Only the super admin can unfreeze this student after the payment is verified.</Text>
              )}
            </View>
          );
        })}
      </Section>}
      {isSuperAdmin && unfreezeTarget && (
        <FinanceActionModal
          title={`Unfreeze ${unfreezeTarget.first_name} ${unfreezeTarget.last_name}`}
          subtitle="Confirm the payment in the receipt/card records first. This release is permanent, dated, and audited."
          onClose={() => setUnfreezeTarget(null)}
        >
          <CalendarDatePicker
            testID={FINANCE.unfreezeDate}
            label="Unfreeze effective date"
            value={unfreezeDate}
            onChange={setUnfreezeDate}
          />
          <Input
            testID={FINANCE.unfreezeReason}
            label="Payment review / audit reason"
            value={unfreezeReason}
            onChangeText={setUnfreezeReason}
            placeholder="Example: Receipt NA-R-000123 verified and overdue balance cleared"
            multiline
          />
          <View style={styles.actionRow}>
            <Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setUnfreezeTarget(null)} />
            <Button
              testID={FINANCE.unfreezeSubmit}
              title="Confirm unfreeze"
              style={styles.flexButton}
              onPress={() => void unfreezeStudentAfterPayment()}
              loading={busy === `unfreeze-${unfreezeTarget.id}`}
            />
          </View>
        </FinanceActionModal>
      )}
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
      {!isReception && <Section title="Invoice ledger" subtitle="Draft, finalized, partial, paid, and overdue balances">
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
      </Section>}
      {!isReception && invoiceCorrection && (
        <FinanceActionModal title={`${invoiceCorrection.kind === 'debit' ? 'Debit' : 'Credit'} correction · ${invoiceCorrection.invoice.invoice_number}`} subtitle="The original invoice remains auditable. Teacher earnings are intentionally unchanged." onClose={() => setInvoiceCorrection(null)}>
          <Input testID={FINANCE.invoiceCorrectionAmount} label="Amount (whole UZS)" keyboardType="number-pad" value={invoiceCorrectionAmount} onChangeText={setInvoiceCorrectionAmount} />
          <Input testID={FINANCE.invoiceCorrectionReason} label="Audit reason" value={invoiceCorrectionReason} onChangeText={setInvoiceCorrectionReason} multiline />
          <View style={styles.actionRow}><Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setInvoiceCorrection(null)} /><Button testID={FINANCE.invoiceCorrectionSubmit} title="Post correction" style={styles.flexButton} onPress={postInvoiceCorrection} loading={busy === 'invoice-correction'} /></View>
        </FinanceActionModal>
      )}
      {isSuperAdmin && invoiceReversalTarget && (
        <FinanceActionModal title={`Reverse ${invoiceReversalTarget.invoice_number}`} subtitle="A replacement draft will be created. The original invoice and teacher earning basis remain immutable." onClose={() => setInvoiceReversalTarget(null)}>
          <Input testID={FINANCE.invoiceReversalReason} label="Specific audit reason" value={invoiceReversalReason} onChangeText={setInvoiceReversalReason} multiline />
          <View style={styles.actionRow}><Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setInvoiceReversalTarget(null)} /><Button testID={FINANCE.invoiceReversalSubmit} title="Reverse and replace" style={styles.flexButton} onPress={reverseInvoiceValue} loading={busy === 'invoice-reversal'} /></View>
        </FinanceActionModal>
      )}
      {!isReception && <Section title="Recent receipts" subtitle="Posted receipts are immutable; corrections use a reversal record">
        {visibleReceipts.length === 0 ? <Empty text="No matching receipts." /> : visibleReceipts.slice(0, 50).map((receipt) => (
          <View key={receipt.id} testID={`finance-receipt-row-${receipt.id}`} style={styles.recordCard}>
            <View style={styles.recordTop}><Text style={styles.recordTitle}>{receipt.receipt_number}</Text><Text style={styles.goodAmount}>{uzs(receipt.amount_uzs)}</Text></View>
            <Text style={styles.recordMeta}>{studentName(receipt.student_id)} · {tashkentDateTime(receipt.received_at)}</Text>
            <Text style={styles.recordMeta}>{receipt.payment_method === 'personal_card_transfer' ? `${receipt.payment_provider?.toUpperCase() || 'CARD'} transfer` : 'Cash'}</Text>
            <Text style={styles.recordMeta}>Debt {uzs(receipt.allocated_amount_uzs)} · advance {uzs(receipt.advance_amount_uzs)}</Text>
            {isSuperAdmin && receipt.status === 'posted' && <Button title="Reverse receipt" variant="outline" onPress={() => { setReceiptReversalTarget(receipt); setReceiptReversalReason(''); }} />}
          </View>
        ))}
      </Section>}
      {isSuperAdmin && receiptReversalTarget && (
        <FinanceActionModal title={`Reverse ${receiptReversalTarget.receipt_number}`} subtitle={receiptReversalTarget.payment_method === 'personal_card_transfer' ? 'The receipt and allocations are reversed atomically. The personal-card transfer remains in the provider history and must be handled separately if a refund is needed.' : 'The receipt and allocations are reversed atomically. A closed shift keeps its physical count and recalculates its discrepancy for review.'} onClose={() => setReceiptReversalTarget(null)}>
          <Input testID={FINANCE.receiptReversalReason} label="Audit reason" value={receiptReversalReason} onChangeText={setReceiptReversalReason} multiline />
          <View style={styles.actionRow}><Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setReceiptReversalTarget(null)} /><Button testID={FINANCE.receiptReversalSubmit} title="Reverse receipt" style={styles.flexButton} onPress={reverseReceiptValue} loading={busy === 'receipt-reversal'} /></View>
        </FinanceActionModal>
      )}
    </>
  );

  const renderOnlinePayments = () => (
    <>
      <View style={styles.modeBanner}>
        <Ionicons name="shield-checkmark" size={22} color={COLORS.gold} />
        <View style={styles.flex}>
          <Text style={styles.modeTitle}>Human-verified personal-card transfers</Text>
          <Text style={styles.modeText}>A parent report is only a notification. Confirm it only after the exact amount and time appear in the receiving Click or Payme card history.</Text>
        </View>
      </View>
      <Section
        title={`Unresolved payment reports (${unresolvedCardReports.length})`}
        subtitle="These reports do not affect debt, collections, revenue, advances, or the cashbox until confirmed."
      >
        {unresolvedCardReports.length === 0 ? <Empty text="No card payments are waiting for verification." /> : unresolvedCardReports.map((report) => (
          <View key={report.id} testID={`finance-card-report-${report.id}`} style={[styles.recordCard, styles.pendingReportCard]}>
            <View style={styles.recordTop}>
              <View style={styles.flex}>
                <Text style={styles.recordTitle}>{report.student_name} · {report.student_number || studentMap[report.student_id]?.student_id}</Text>
                <Text style={styles.recordMeta}>Reported by {report.reporter_name || report.parent_name || report.student_name} ({report.reporter_role || 'parent'})</Text>
              </View>
              <Text style={styles.warningAmount}>{uzs(report.amount_uzs)}</Text>
            </View>
            <Text style={styles.recordMeta}>Parent says paid {tashkentDateTime(report.paid_at)} · reported {tashkentDateTime(report.reported_at)}</Text>
            <Text style={styles.recordMeta}>{report.provider.toUpperCase()} · destination •••• {report.destination_last4} · {report.destination_cardholder_name}</Text>
            <Status value="unresolved" />
            <View style={styles.lessonActions}>
              <TouchableOpacity testID={`finance-card-report-confirm-${report.id}`} style={[styles.miniAction, styles.goodAction]} onPress={() => openCardReportResolution(report, 'confirm')}><Text style={styles.miniActionText}>Confirm transfer</Text></TouchableOpacity>
              <TouchableOpacity testID={`finance-card-report-reject-${report.id}`} style={[styles.miniAction, styles.dangerAction]} onPress={() => openCardReportResolution(report, 'reject')}><Text style={styles.miniActionText}>Reject</Text></TouchableOpacity>
            </View>
          </View>
        ))}
      </Section>

      <Section title="Receiving cards" subtitle="Only the card number and cardholder name are stored. Never enter a PIN, CVV, SMS code, or expiry date.">
        <View style={styles.actionRow}>
          <Button testID={FINANCE.destinationAdd} title="Add receiving card" onPress={openNewDestination} style={styles.flexButton} />
        </View>
        {paymentDestinations.length === 0 ? <Empty text="No Click or Payme receiving card has been configured." /> : paymentDestinations.map((destination) => (
          <View key={destination.id} testID={`finance-payment-destination-${destination.id}`} style={styles.destinationRow}>
            <View style={styles.destinationIcon}><Ionicons name={destination.provider === 'click' ? 'flash' : 'wallet'} size={22} color={COLORS.gold} /></View>
            <View style={styles.flex}>
              <View style={styles.recordTop}><Text style={styles.recordTitle}>{destination.label || destination.provider.toUpperCase()}</Text><Status value={destination.status} /></View>
              <Text style={styles.receivingCardNumber}>{formatCard(destination.card_number)}</Text>
              <Text style={styles.recordMeta}>{destination.cardholder_name} · {destination.provider.toUpperCase()}</Text>
            </View>
            <View style={styles.destinationActions}>
              <TouchableOpacity testID={`finance-payment-destination-edit-${destination.id}`} accessibilityRole="button" style={styles.iconAction} onPress={() => openDestinationEditor(destination)}><Ionicons name="create-outline" size={20} color={COLORS.gold} /></TouchableOpacity>
              <TouchableOpacity testID={`finance-payment-destination-status-${destination.id}`} accessibilityRole="button" style={styles.iconAction} onPress={() => changeDestinationStatus(destination, destination.status !== 'active')}><Ionicons name={destination.status === 'active' ? 'pause' : 'play'} size={20} color={destination.status === 'active' ? COLORS.error : COLORS.success} /></TouchableOpacity>
            </View>
          </View>
        ))}
      </Section>

      <Section title="Resolved card-payment history" subtitle="Confirmation creates an official receipt. Rejection leaves all financial balances unchanged.">
        {resolvedCardReports.length === 0 ? <Empty text="No card-payment reports have been resolved." /> : resolvedCardReports.slice(0, 250).map((report) => (
          <View key={report.id} testID={`finance-card-report-history-${report.id}`} style={styles.recordCard}>
            <View style={styles.recordTop}><Text style={styles.recordTitle}>{report.student_name} · {report.reporter_name || report.parent_name || report.student_name}</Text><Status value={report.status} /></View>
            <Text style={report.status === 'confirmed' ? styles.goodAmount : styles.dangerAmount}>{uzs(report.amount_uzs)}</Text>
            <Text style={styles.recordMeta}>{report.provider.toUpperCase()} •••• {report.destination_last4} · paid {tashkentDateTime(report.paid_at)}</Text>
            <Text style={styles.recordMeta}>Resolved by {report.resolved_by_name || 'authorized staff'}{report.resolution_reason ? ` · ${report.resolution_reason}` : ''}</Text>
          </View>
        ))}
      </Section>

      {destinationModalOpen && (
        <FinanceActionModal title={destinationTarget ? 'Edit receiving card' : 'Add receiving card'} subtitle="This is a transfer destination, not a merchant integration. Card credentials are never requested." onClose={() => setDestinationModalOpen(false)}>
          <Text style={styles.inputLabel}>Provider</Text>
          <View style={styles.pickerBox}><Picker testID={FINANCE.destinationProvider} selectedValue={destinationForm.provider} onValueChange={(provider) => setDestinationForm({ ...destinationForm, provider })} style={styles.picker} dropdownIconColor={COLORS.gold}><LocalizedPickerItem label="Click" value="click" /><LocalizedPickerItem label="Payme" value="payme" /></Picker></View>
          <Input testID={FINANCE.destinationCardNumber} label="Receiving card number *" keyboardType="number-pad" value={destinationForm.card_number} onChangeText={(card_number) => setDestinationForm({ ...destinationForm, card_number })} placeholder="8600 0000 0000 0000" />
          <Input testID={FINANCE.destinationCardholder} label="Cardholder name *" value={destinationForm.cardholder_name} onChangeText={(cardholder_name) => setDestinationForm({ ...destinationForm, cardholder_name })} placeholder="Name shown for the recipient" />
          <Input testID={FINANCE.destinationLabel} label="Internal label" value={destinationForm.label} onChangeText={(label) => setDestinationForm({ ...destinationForm, label })} placeholder="Main tuition card" />
          {destinationTarget && <Input testID={FINANCE.destinationReason} label="Audit reason *" value={destinationForm.reason} onChangeText={(reason) => setDestinationForm({ ...destinationForm, reason })} multiline />}
          <View style={styles.actionRow}><Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setDestinationModalOpen(false)} /><Button testID={FINANCE.destinationSubmit} title={destinationTarget ? 'Save changes' : 'Add card'} style={styles.flexButton} onPress={savePaymentDestination} loading={busy === 'payment-destination'} /></View>
        </FinanceActionModal>
      )}

      {cardReportTarget && (
        <FinanceActionModal
          title={cardReportDecision === 'confirm' ? 'Confirm this card transfer?' : 'Reject this payment report?'}
          subtitle={cardReportDecision === 'confirm' ? 'Confirm only after matching the amount, time, and destination in the receiving card app. This immediately reduces debt.' : 'Rejection changes no money and the parent receives the reason.'}
          onClose={() => setCardReportTarget(null)}
        >
          <View style={styles.verificationSummary}>
            <MoneyRow label="Amount" value={cardReportTarget.amount_uzs} strong />
            <Text style={styles.recordMeta}>Reported by: {cardReportTarget.reporter_name || cardReportTarget.parent_name || cardReportTarget.student_name} ({cardReportTarget.reporter_role || 'parent'})</Text>
            <Text style={styles.recordMeta}>Student: {cardReportTarget.student_name}</Text>
            <Text style={styles.recordMeta}>Paid: {tashkentDateTime(cardReportTarget.paid_at)}</Text>
            <Text style={styles.recordMeta}>Destination: {cardReportTarget.provider.toUpperCase()} •••• {cardReportTarget.destination_last4}</Text>
          </View>
          <Input testID={FINANCE.cardReportReason} label={cardReportDecision === 'confirm' ? 'Verification note' : 'Rejection reason *'} value={cardReportReason} onChangeText={setCardReportReason} multiline />
          <View style={styles.actionRow}><Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setCardReportTarget(null)} /><Button testID={FINANCE.cardReportResolve} title={cardReportDecision === 'confirm' ? 'Yes, confirm payment' : 'Reject report'} style={styles.flexButton} onPress={resolveCardReport} loading={busy === `card-report-${cardReportDecision}-${cardReportTarget.id}`} /></View>
        </FinanceActionModal>
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
      {manualExpenseTarget && <FinanceActionModal title={`Set ${manualExpenseTarget.category} amount`} subtitle="This can be entered once for the month; later corrections require an audited correction workflow." onClose={() => setManualExpenseTarget(null)}><Input testID={FINANCE.manualExpenseAmount} label="Actual amount (whole UZS)" keyboardType="number-pad" value={manualExpenseAmount} onChangeText={setManualExpenseAmount} /><View style={styles.actionRow}><Button title="Cancel" variant="outline" onPress={() => setManualExpenseTarget(null)} style={styles.flexButton} /><Button testID={FINANCE.manualExpenseSubmit} title="Set amount" onPress={setManualExpenseAmountValue} loading={busy === 'manual-expense-amount'} style={styles.flexButton} /></View></FinanceActionModal>}
      {isSuperAdmin && expenseCorrectionTarget && <FinanceActionModal title={`Correct ${expenseCorrectionTarget.category}`} subtitle="Set 0 to cancel an unpaid obligation. The previous amount remains in the audit event." onClose={() => setExpenseCorrectionTarget(null)}><Input testID={FINANCE.expenseCorrectionAmount} label="Correct amount (whole UZS)" keyboardType="number-pad" value={expenseCorrectionAmount} onChangeText={setExpenseCorrectionAmount} /><Input testID={FINANCE.expenseCorrectionReason} label="Audit reason" value={expenseCorrectionReason} onChangeText={setExpenseCorrectionReason} multiline /><View style={styles.actionRow}><Button title="Cancel" variant="outline" onPress={() => setExpenseCorrectionTarget(null)} style={styles.flexButton} /><Button testID={FINANCE.expenseCorrectionSubmit} title="Post correction" onPress={correctExpenseAmount} loading={busy === 'expense-correction'} style={styles.flexButton} /></View></FinanceActionModal>}
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
      <Section title="Today’s automatic cashbox" subtitle="The Tashkent business day opens and closes automatically. Reception records cash; managers confirm the physical count after the day closes.">
        {cashShift ? (
          <>
            <View style={styles.kpiGrid}>
              <Kpi testID={FINANCE.cashOpeningKpi} label="Opening" value={cashShift.opening_balance_uzs} icon="lock-open" color={COLORS.goldLight} />
              <Kpi testID={FINANCE.cashReceivedKpi} label="Cash received" value={cashShift.receipt_total_uzs} icon="arrow-down" color={COLORS.success} />
              <Kpi testID={FINANCE.cashRemovedKpi} label="Cash removed" value={cashShift.removal_total_uzs} icon="arrow-up" color={COLORS.warning} />
              <Kpi testID={FINANCE.cashExpectedKpi} label="Expected now" value={expectedCash} icon="cash" color={COLORS.gold} />
            </View>
            <Text style={styles.recordMeta}>Business date {cashShift.business_date || 'today'} · opened automatically {tashkentDateTime(cashShift.opened_at)}</Text>
            <Text style={styles.goodText}>Ready for cash receipts. No opening or closing action is required from reception.</Text>
          </>
        ) : (
          <Text style={styles.warningText}>The automatic cash day is temporarily unavailable. Refresh before accepting cash.</Text>
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
              {shift.status === 'awaiting_confirmation' && <Text style={styles.warningText}>Expected {uzs(shift.expected_closing_balance_uzs)} · waiting for a manager or super admin to enter the physical count.</Text>}
              {shift.status === 'awaiting_confirmation' && <Button testID={`finance-confirm-cash-day-${shift.id}`} title="Confirm end-of-day count" variant="outline" onPress={() => { setCashConfirmationTarget(shift); setShiftForm((current) => ({ ...current, closing: String(shift.expected_closing_balance_uzs || 0) })); setCashConfirmationNotes(''); }} />}
              {shift.status === 'closed' && <Text style={styles.recordMeta}>Expected {uzs(shift.expected_closing_balance_uzs)} · counted {uzs(shift.actual_closing_balance_uzs)} · difference {uzs(shift.discrepancy_uzs)}</Text>}
              {isSuperAdmin && shift.discrepancy_status === 'pending_review' && <Button title="Review discrepancy" variant="outline" onPress={() => { setDiscrepancyTarget(shift); setDiscrepancyReason(''); }} />}
            </View>
          ))}
        </Section>
      )}
      {isSuperAdmin && discrepancyTarget && (
        <FinanceActionModal title="Review cash discrepancy" subtitle={`Difference ${uzs(discrepancyTarget.discrepancy_uzs)}. The physical count remains immutable.`} onClose={() => setDiscrepancyTarget(null)}>
          <Input testID={FINANCE.discrepancyReason} label="Audit reason" value={discrepancyReason} onChangeText={setDiscrepancyReason} multiline />
          <View style={styles.actionRow}>
            <Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setDiscrepancyTarget(null)} />
            <Button testID={FINANCE.discrepancyInvestigate} title="Investigate" variant="outline" style={styles.flexButton} onPress={() => reviewDiscrepancy(false)} loading={busy === 'discrepancy-review'} />
            <Button testID={FINANCE.discrepancyAccept} title="Accept" style={styles.flexButton} onPress={() => reviewDiscrepancy(true)} loading={busy === 'discrepancy-review'} />
          </View>
        </FinanceActionModal>
      )}
      {!isReception && cashConfirmationTarget && (
        <FinanceActionModal title={`Confirm cashbox · ${cashConfirmationTarget.business_date || tashkentDateTime(cashConfirmationTarget.opened_at)}`} subtitle={`Expected ${uzs(cashConfirmationTarget.expected_closing_balance_uzs)}. Enter the amount physically counted; differences stay visible and auditable.`} onClose={() => setCashConfirmationTarget(null)}>
          <Input testID={FINANCE.cashClosingAmount} label="Physical count (whole UZS)" keyboardType="number-pad" value={shiftForm.closing} onChangeText={(closing) => setShiftForm({ ...shiftForm, closing })} />
          <Input label="Confirmation note" value={cashConfirmationNotes} onChangeText={setCashConfirmationNotes} placeholder="Optional handover note" multiline />
          <View style={styles.actionRow}><Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setCashConfirmationTarget(null)} /><Button testID={FINANCE.cashClose} title="Confirm count" style={styles.flexButton} onPress={confirmCashDay} loading={busy === 'confirm-cash-day'} /></View>
        </FinanceActionModal>
      )}
      {isSuperAdmin && cashReversalTarget && (
        <FinanceActionModal title={`Reverse ${cashReversalTarget.label}`} subtitle="The original record is retained. A closed shift keeps its physical count and recalculates its discrepancy for review." onClose={() => setCashReversalTarget(null)}>
          <Input testID={FINANCE.cashReversalReason} label="Specific audit reason" value={cashReversalReason} onChangeText={setCashReversalReason} multiline />
          <View style={styles.actionRow}><Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setCashReversalTarget(null)} /><Button testID={FINANCE.cashReversalSubmit} title="Reverse record" style={styles.flexButton} onPress={reverseCashLedgerRecord} loading={busy === 'cash-ledger-reversal'} /></View>
        </FinanceActionModal>
      )}
    </>
  );

  const renderPricing = () => (
    <>
      <Section
        title="Course prices"
        subtitle={isSuperAdmin
          ? 'These are the courses students can join. Edit a price beside its format; the effective date protects earlier lesson charges.'
          : 'Current prices for every active course. Only the Super Admin can change financial policy.'}
      >
        {coursePricingGroups.length === 0 ? (
          <Empty text="No active courses with billing categories are configured." />
        ) : coursePricingGroups.map(({ program_code, courses }) => (
          <View key={program_code} testID={`finance-course-pricing-${program_code}`} style={styles.pricingCard}>
            <View style={styles.pricingCardHeader}>
              <View style={styles.flex}>
                <Text style={styles.pricingCardTitle}>{courses.map((course) => course.name).join(', ')}</Text>
                <Text style={styles.recordMeta}>Billing category: {PROGRAM_LABELS[program_code]}</Text>
              </View>
            </View>
            {GROUP_FORMATS.map((group_format) => {
              const policy = tariffs.find(
                (row) => row.policy_key === `tariff:${program_code}:${group_format}`,
              );
              return (
                <View
                  key={group_format}
                  testID={`finance-tariff-row-tariff:${program_code}:${group_format}`}
                  style={styles.pricingRow}
                >
                  <View style={styles.flex}>
                    <Text style={styles.moneyLabel}>{FORMAT_LABELS[group_format]}</Text>
                    <Text style={styles.recordMeta}>
                      {policy ? `Effective ${policy.effective_from}` : 'Price not configured'}
                    </Text>
                  </View>
                  <Text style={policy ? styles.goodAmount : styles.warningText}>
                    {policy ? uzs(policy.value.monthly_price_uzs) : 'Not configured'}
                  </Text>
                  {isSuperAdmin && (
                    <TouchableOpacity
                      testID={`finance-edit-tariff-${program_code}-${group_format}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${courses.map((course) => course.name).join(', ')} ${FORMAT_LABELS[group_format]} price`}
                      style={styles.editPolicyButton}
                      onPress={() => openTariffEditor(
                        program_code,
                        group_format,
                        courses.map((course) => course.name).join(', '),
                      )}
                    >
                      <Ionicons name="pencil" size={16} color={COLORS.gold} />
                      <Text style={styles.editPolicyText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </Section>
      <Section
        title="Teacher pay"
        subtitle="Teachers earn this share of each billable lesson. The centre pays the full earned amount even when a student has not paid yet."
      >
        {GROUP_FORMATS.map((group_format) => {
          const policy = teacherShares.find(
            (row) => row.policy_key === `teacher_share:${group_format}`,
          );
          return (
            <View
              key={group_format}
              testID={`finance-teacher-share-row-teacher_share:${group_format}`}
              style={styles.pricingRow}
            >
              <View style={styles.flex}>
                <Text style={styles.moneyLabel}>{FORMAT_LABELS[group_format]}</Text>
                <Text style={styles.recordMeta}>
                  {policy ? `Effective ${policy.effective_from}` : 'Share not configured'}
                </Text>
              </View>
              <Text style={policy ? styles.goodAmount : styles.warningText}>
                {policy?.value.basis_points == null ? 'Not configured' : `${policy.value.basis_points / 100}%`}
              </Text>
              {isSuperAdmin && (
                <TouchableOpacity
                  testID={`finance-edit-teacher-share-${group_format}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${FORMAT_LABELS[group_format]} teacher share`}
                  style={styles.editPolicyButton}
                  onPress={() => openTeacherShareEditor(group_format)}
                >
                  <Ionicons name="pencil" size={16} color={COLORS.gold} />
                  <Text style={styles.editPolicyText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </Section>
      {isSuperAdmin && tariffEditor && (
        <FinanceActionModal
          title={`Edit ${FORMAT_LABELS[tariffEditor.group_format]} price`}
          subtitle={`${tariffEditor.courseNames} · ${PROGRAM_LABELS[tariffEditor.program_code]}. A new effective-dated version preserves finalized and earlier lesson amounts.`}
          onClose={() => setTariffEditor(null)}
        >
          <Input testID={FINANCE.tariffAmount} label="Monthly price (whole UZS)" keyboardType="number-pad" value={tariffForm.amount} onChangeText={(amount) => setTariffForm({ ...tariffForm, amount })} />
          <CalendarDatePicker testID={FINANCE.tariffEffectiveFrom} label="Effective from" value={tariffForm.effective_from} onChange={(effective_from) => setTariffForm({ ...tariffForm, effective_from })} />
          <Input testID={FINANCE.tariffReason} label="Reason for price change" value={tariffForm.reason} onChangeText={(reason) => setTariffForm({ ...tariffForm, reason })} />
          <View style={styles.actionRow}>
            <Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setTariffEditor(null)} />
            <Button testID={FINANCE.tariffSubmit} title="Save price" style={styles.flexButton} onPress={saveTariff} loading={busy === 'tariff'} />
          </View>
        </FinanceActionModal>
      )}
      {isSuperAdmin && teacherShareEditor && (
        <FinanceActionModal
          title={`Edit ${FORMAT_LABELS[teacherShareEditor]} teacher pay`}
          subtitle="This affects future lesson earnings only. Finalized payroll remains unchanged."
          onClose={() => setTeacherShareEditor(null)}
        >
          <Input testID={FINANCE.teacherSharePercentage} label="Teacher share (%)" keyboardType="decimal-pad" value={teacherShareForm.percentage} onChangeText={(percentage) => setTeacherShareForm({ ...teacherShareForm, percentage })} />
          <CalendarDatePicker testID={FINANCE.teacherShareEffectiveFrom} label="Effective from" value={teacherShareForm.effective_from} onChange={(effective_from) => setTeacherShareForm({ ...teacherShareForm, effective_from })} />
          <Input testID={FINANCE.teacherShareReason} label="Reason for share change" value={teacherShareForm.reason} onChangeText={(reason) => setTeacherShareForm({ ...teacherShareForm, reason })} />
          <View style={styles.actionRow}>
            <Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setTeacherShareEditor(null)} />
            <Button testID={FINANCE.teacherShareSubmit} title="Save teacher share" style={styles.flexButton} onPress={saveTeacherShare} loading={busy === 'teacher-share'} />
          </View>
        </FinanceActionModal>
      )}
      <Section title="Current recurring expenses" subtitle="Templates create obligations; they are not treated as paid until a cash payout is posted.">
        {recurringPolicies.map((policy) => policy.value.amount_mode === 'manual' || policy.value.amount_uzs == null
          ? <View key={policy.id} testID={`finance-recurring-row-${policy.policy_key}`} style={styles.moneyRow}><Text style={styles.moneyLabel}>{policy.value.name || policy.policy_key}</Text><Text style={styles.warningText}>Enter actual amount monthly</Text></View>
          : <MoneyRow key={policy.id} testID={`finance-recurring-row-${policy.policy_key}`} label={policy.value.name || policy.policy_key} value={policy.value.amount_uzs} />)}
      </Section>
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
        <FinanceActionModal title={`Replacement for ${replacementTarget.local_date}`} subtitle="This lesson does not add another denominator slot. It becomes billable only after it is held." onClose={() => setReplacementTarget(null)}>
          <DateTimePicker label="Starts (Tashkent local)" value={replacementForm.starts_at} onChange={(starts_at) => setReplacementForm({ ...replacementForm, starts_at })} />
          <DateTimePicker label="Ends (Tashkent local)" value={replacementForm.ends_at} onChange={(ends_at) => setReplacementForm({ ...replacementForm, ends_at })} />
          <Input label="Reason" value={replacementForm.reason} onChangeText={(reason) => setReplacementForm({ ...replacementForm, reason })} />
          <View style={styles.actionRow}><Button title="Cancel" variant="outline" style={styles.flexButton} onPress={() => setReplacementTarget(null)} /><Button title="Schedule replacement" style={styles.flexButton} loading={busy === 'replacement'} onPress={scheduleReplacement} /></View>
        </FinanceActionModal>
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
      <ConcourseAtmosphere />
      <ScrollView style={styles.content} contentContainerStyle={styles.pageContent} refreshControl={<RefreshControl refreshing={refreshing} tintColor={COLORS.gold} onRefresh={() => { setRefreshing(true); void loadData(); }} />}>
        <View style={[styles.header, isPhone && styles.headerCompact]}>
          <View style={styles.headerCopy}>
            <View style={styles.headerTitleRow}>
              <View style={styles.flex}><Text style={styles.title}>{isReception ? 'Student payments' : 'Finance'}</Text><Text style={styles.subtitle}>{isReception ? 'Find students, check paid/unpaid status, contact families, and record cash—without centre financial totals.' : 'Accruals, cash, debt, spending, payroll, and controls'}</Text></View>
            </View>
          </View>
          {!isReception && <CalendarDatePicker testID={FINANCE.monthInput} value={month} onChange={changeMonth} placeholder="Select month" mode="month" style={[styles.monthInput, isPhone && styles.monthInputCompact]} />}
        </View>
        <View style={[styles.tabScroll, width < LAYOUT.desktopBreakpoint && styles.tabScrollCompact]}>
          <ConcourseGlassLayer intensity={44} />
          <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={false} style={styles.tabViewport} contentContainerStyle={styles.tabs}>
            {visibleTabs.map((tab) => <MotionTouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: activeTab === tab.key }} pressScale={0.975} testID={`finance-tab-${tab.key}`} key={tab.key} style={[styles.tab, activeTab === tab.key && styles.activeTab]} onPress={() => setActiveTab(tab.key)}><Ionicons name={tab.icon as any} size={18} color={activeTab === tab.key ? COLORS.goldLight : COLORS.textSecondary} /><Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>{tab.label}{tab.key === 'online' && unresolvedCardReports.length > 0 ? ` (${unresolvedCardReports.length})` : ''}</Text></MotionTouchableOpacity>)}
          </ScrollView>
        </View>
        <Animated.View style={[styles.contentInset, isPhone && styles.contentInsetCompact, { opacity: tabProgress, transform: [{ translateX: tabShift }] }]}>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'receivables' && renderReceivables()}
          {activeTab === 'online' && renderOnlinePayments()}
          {activeTab === 'expenses' && renderExpenses()}
          {activeTab === 'payroll' && renderPayroll()}
          {!isReception && activeTab === 'cash' && renderCash()}
          {activeTab === 'pricing' && renderPricing()}
          {activeTab === 'closures' && renderClosures()}
          <View style={styles.bottomSpace} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function Section({ title, subtitle, children, tone }: { title: string; subtitle?: string; children: React.ReactNode; tone?: 'brand' | 'gold' }) {
  return <View style={styles.section}>{tone && <ConcourseTintLayer tone={tone} />}<Text style={styles.sectionTitle}>{title}</Text>{subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}<View style={styles.sectionBody}>{children}</View></View>;
}

function WorkQueueItem({ icon, label, value, tone, onPress, compact = false }: { icon: string; label: string; value: number; tone?: 'warning'; onPress: () => void; compact?: boolean }) {
  const color = value > 0 ? (tone === 'warning' ? COLORS.warning : COLORS.gold) : COLORS.textTertiary;
  return (
    <MotionPressableCard accessibilityRole="button" hoverLift={2} hoverOverlayColor="rgba(241,217,139,0.035)" style={[styles.workQueueItem, compact && styles.workQueueItemCompact]} onPress={onPress}>
      <View style={[styles.workQueueIcon, { backgroundColor: `${color}14`, borderColor: `${color}50` }]}><Ionicons name={icon as any} size={20} color={color} /></View>
      <View style={styles.flex}><Text style={styles.workQueueLabel}>{label}</Text><Text style={styles.workQueueHint}>{value > 0 ? 'Open queue' : 'Nothing waiting'}</Text></View>
      <Text style={[styles.workQueueValue, { color }]}>{value}</Text>
    </MotionPressableCard>
  );
}

function FinancialPositionCard({ position, month, compact = false }: { position: Position; month: string; compact?: boolean }) {
  const profitColor = position.accrued_operating_profit_uzs >= 0 ? COLORS.goldLight : COLORS.error;
  const accruedRevenue = position.net_tuition_uzs + position.other_income_uzs;
  const obligations = position.teacher_salary_earned_uzs + position.expenses_accrued_uzs;
  return (
    <View style={[styles.financialPositionCard, compact && styles.financialPositionCardCompact]}>
      <ConcourseGlassLayer tone="brand" intensity={36} />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(213,182,98,0.17)', 'rgba(25,23,18,0.42)', 'rgba(8,10,9,0.60)']}
        locations={[0, 0.46, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.positionHeader, compact && styles.positionHeaderCompact]}>
        <View>
          <Text style={styles.positionTitle}>Financial position</Text>
          <Text style={styles.positionPeriod}>{month} · earned, collected, and accrued</Text>
        </View>
        <View style={[styles.positionStatus, compact && styles.positionStatusCompact]}>
          <Ionicons name={position.operation_mode === 'shadow' ? 'eye-outline' : 'radio-outline'} size={16} color={COLORS.gold} />
          <Text style={styles.positionStatusText}>{position.operation_mode === 'shadow' ? 'Shadow mode' : 'Live mode'} · {position.is_provisional ? 'Provisional' : 'Finalized'}</Text>
        </View>
      </View>
      <View style={[styles.positionBody, compact && styles.positionBodyCompact]}>
        <View testID={FINANCE.accruedProfit} style={[styles.positionLead, compact && styles.positionLeadCompact]}>
          <Text style={styles.positionLabel}>Accrued operating profit</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.64} style={[styles.positionLeadValue, compact && styles.positionLeadValueCompact, { color: profitColor }]}>{uzs(position.accrued_operating_profit_uzs)}</Text>
          {!compact && <Text style={styles.positionHint}>Revenue earned minus salaries and operating expenses accrued.</Text>}
        </View>
        <View style={[styles.positionLedger, compact && styles.positionLedgerCompact]}>
          <PositionLedgerRow testID={FINANCE.accruedRevenue} label="Accrued revenue" value={accruedRevenue} color={COLORS.success} compact={compact} />
          <PositionLedgerRow testID={FINANCE.totalCollections} label="Total collections" value={position.total_collections_uzs} color={COLORS.goldLight} last compact={compact} />
        </View>
      </View>
      <View style={[styles.financeBreakdown, compact && styles.financeBreakdownCompact]}>
        <FinanceBreakdownItem icon="trending-up-outline" label="Earned" value={accruedRevenue} color={COLORS.success} />
        <FinanceBreakdownItem icon="receipt-outline" label="Obligations" value={obligations} color={COLORS.warning} />
        <FinanceBreakdownItem icon="wallet-outline" label="Position" value={position.accrued_operating_profit_uzs} color={profitColor} />
      </View>
    </View>
  );
}

function FinanceBreakdownItem({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <View style={styles.financeBreakdownItem}>
      <Ionicons name={icon as any} size={18} color={color} />
      <View style={styles.flex}>
        <Text style={styles.financeBreakdownLabel}>{label}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.financeBreakdownValue}>{uzs(value)}</Text>
      </View>
    </View>
  );
}

function PositionLedgerRow({ label, value, color, testID, last = false, compact = false }: { label: string; value: number; color: string; testID?: string; last?: boolean; compact?: boolean }) {
  return (
    <View testID={testID} style={[styles.positionLedgerRow, compact && styles.positionLedgerRowCompact, last && styles.positionLedgerRowLast]}>
      <View style={[styles.positionDot, { backgroundColor: color }]} />
      <Text style={styles.positionLedgerLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.positionLedgerValue}>{uzs(value)}</Text>
    </View>
  );
}

function FinanceDetailMetric({ label, value, icon, color, testID }: { label: string; value: number; icon: string; color: string; testID?: string }) {
  return (
    <View testID={testID} style={styles.financeDetailMetric}>
      <View style={[styles.financeDetailIcon, { backgroundColor: `${color}13` }]}><Ionicons name={icon as any} size={19} color={color} /></View>
      <View style={styles.flex}><Text style={styles.financeDetailLabel}>{label}</Text></View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.financeDetailValue, { color: value < 0 ? COLORS.error : COLORS.textPrimary }]}>{uzs(value)}</Text>
      <View pointerEvents="none" style={[styles.financeDetailSignal, { backgroundColor: color }]} />
    </View>
  );
}

function FinanceActionModal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const { reduceMotion, ready } = useMotionPreference();
  return (
    <Modal transparent visible animationType="none" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <MotionReveal duration={!ready || reduceMotion ? 0 : MOTION.overlay} direction="none" scaleFrom={0.972} style={styles.modalMotion}>
          <View testID={FINANCE.actionModal} accessibilityViewIsModal style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.flex}>
                <Text style={styles.modalTitle}>{title}</Text>
                {subtitle && <Text style={styles.modalSubtitle}>{subtitle}</Text>}
              </View>
              <MotionTouchableOpacity
                testID={FINANCE.actionModalClose}
                accessibilityRole="button"
                accessibilityLabel="Close finance action"
                style={styles.modalClose}
                onPress={onClose}
              >
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </MotionTouchableOpacity>
            </View>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </View>
        </MotionReveal>
      </View>
    </Modal>
  );
}

function Kpi({ label, value, icon, color, testID, featured = false }: { label: string; value: number; icon: string; color: string; testID?: string; featured?: boolean }) {
  return <View testID={testID} style={[styles.kpi, featured && styles.kpiFeatured, { borderTopColor: color }]}><View style={[styles.kpiIcon, { backgroundColor: color + '18', borderColor: color + '45' }]}><Ionicons name={icon as any} size={20} color={color} /></View><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.kpiValue, featured && styles.kpiValueFeatured]}>{uzs(value)}</Text><Text style={styles.kpiLabel}>{label}</Text></View>;
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
  const good = ['paid', 'posted', 'finalized', 'confirmed', 'active'].includes(value);
  const color = danger ? COLORS.error : good ? COLORS.success : COLORS.warning;
  return <View style={[styles.status, { backgroundColor: color + '22' }]}><Text style={[styles.statusText, { color }]}>{value.replace('_', ' ')}</Text></View>;
}

function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Ionicons name="file-tray-outline" size={28} color={COLORS.textTertiary} /><Text style={styles.muted}>{text}</Text></View>;
}

function OutgoingPanel({ outgoing, amount, setAmount, busy, onPay, onCancel }: { outgoing: { label: string; maximum: number }; amount: string; setAmount: (value: string) => void; busy: boolean; onPay: () => void; onCancel: () => void }) {
  return <FinanceActionModal title={`Pay ${outgoing.label}`} subtitle={`Maximum ${uzs(outgoing.maximum)} · cash only`} onClose={onCancel}><Input testID={FINANCE.outgoingAmount} label="Amount (whole UZS)" keyboardType="number-pad" value={amount} onChangeText={setAmount} /><View style={styles.actionRow}><Button title="Cancel" variant="outline" onPress={onCancel} style={styles.flexButton} /><Button testID={FINANCE.outgoingSubmit} title="Post payout" onPress={onPay} loading={busy} style={styles.flexButton} /></View></FinanceActionModal>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background, padding: SIZES.lg },
  header: { width: '100%', maxWidth: 1440, alignSelf: 'center', paddingTop: SIZES.headerTop, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.md },
  headerCompact: { paddingTop: Math.max(SIZES.headerTop, 28), paddingHorizontal: SIZES.md, paddingBottom: SIZES.sm, gap: SIZES.sm, alignItems: 'stretch' },
  headerCopy: { flex: 1, minWidth: 280, maxWidth: 720 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SIZES.md },
  headerMark: { width: 48, height: 48, borderRadius: SIZES.radiusMd, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.goldGlass, borderWidth: 1, borderColor: COLORS.goldHairline },
  headerMarkCompact: { width: 42, height: 42, borderRadius: SIZES.radiusSm },
  title: { color: COLORS.textPrimary, fontSize: 38, lineHeight: 44, fontWeight: '850' as any, letterSpacing: -1.15 },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginTop: SIZES.xs, maxWidth: 520, lineHeight: 20 },
  monthInput: { width: 180, marginBottom: 0 },
  monthInputCompact: { width: 164, alignSelf: 'flex-start' },
  tabScroll: { flexGrow: 0, width: '100%', maxWidth: 1440, alignSelf: 'center', backgroundColor: 'rgba(13,19,26,0.42)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', borderRadius: SIZES.radiusXl, overflow: 'hidden', ...SHADOWS.medium },
  tabScrollCompact: { width: 'auto', maxWidth: undefined, alignSelf: 'stretch', marginHorizontal: SIZES.md, borderRadius: SIZES.radiusLg },
  tabViewport: { flexGrow: 0 },
  tabs: { flexDirection: 'row', padding: 7, gap: 5, alignItems: 'center' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: SIZES.xs, paddingHorizontal: SIZES.md, minHeight: 48, borderRadius: SIZES.radiusLg, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'transparent' },
  activeTab: { borderColor: COLORS.goldHairline, backgroundColor: 'rgba(213,182,98,0.15)', ...SHADOWS.small },
  tabText: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '600' },
  activeTabText: { color: COLORS.textPrimary },
  content: { flex: 1 },
  pageContent: { paddingBottom: 0 },
  contentInset: { width: '100%', maxWidth: 1440, alignSelf: 'center', padding: SIZES.lg, paddingBottom: 116 },
  contentInsetCompact: { padding: SIZES.md, paddingBottom: 112 },
  modeBanner: { flexDirection: 'row', gap: SIZES.md, backgroundColor: COLORS.goldGlass, borderWidth: 1, borderColor: COLORS.goldHairline, borderRadius: SIZES.radiusLg, padding: SIZES.md, marginBottom: SIZES.md },
  modeTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '700' },
  modeText: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: SIZES.xs, lineHeight: 17 },
  financeHeroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.md, marginBottom: SIZES.lg },
  overviewOpeningGrid: { flexDirection: 'row', alignItems: 'stretch', gap: SIZES.lg },
  overviewPosition: { flex: 1.7, minWidth: 0 },
  overviewAttention: { flex: 0.85, minWidth: 320 },
  attentionPanel: { padding: SIZES.lg, marginBottom: SIZES.lg, borderRadius: SIZES.radiusXl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', backgroundColor: 'rgba(13,19,25,0.42)', overflow: 'hidden', ...SHADOWS.medium },
  attentionHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.md, marginBottom: SIZES.md },
  attentionCount: { minWidth: 38, height: 38, paddingHorizontal: 10, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: `${COLORS.warning}13`, borderWidth: 1, borderColor: `${COLORS.warning}36` },
  attentionCountText: { color: COLORS.warning, fontSize: SIZES.fontSm, fontWeight: '850' as any, fontVariant: ['tabular-nums'] },
  workQueueGrid: { overflow: 'hidden', borderRadius: SIZES.radiusLg, borderWidth: 1, borderColor: COLORS.border },
  mobileAttentionPanel: { position: 'relative', marginBottom: SIZES.md, padding: SIZES.md, paddingRight: 0, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', backgroundColor: 'rgba(13,19,25,0.44)', overflow: 'hidden' },
  mobileWorkQueue: { gap: SIZES.sm, paddingTop: SIZES.md, paddingRight: SIZES.xl },
  mobileAttentionCue: { position: 'absolute', right: 6, bottom: 35, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.goldHairline },
  workQueueItem: { position: 'relative', width: '100%', minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: SIZES.md, padding: SIZES.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, backgroundColor: 'rgba(8,13,18,0.36)', overflow: 'hidden' },
  workQueueItemCompact: { width: 224, flexGrow: 0, flexBasis: 224, minHeight: 74, gap: SIZES.sm, padding: SIZES.sm, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.border },
  workQueueIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  workQueueLabel: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700' },
  workQueueHint: { color: COLORS.textTertiary, fontSize: 11, marginTop: 2 },
  workQueueValue: { minWidth: 28, textAlign: 'right', fontSize: SIZES.fontXl, fontWeight: '800' },
  financialPositionCard: { position: 'relative', minHeight: 422, padding: SIZES.xl, marginBottom: SIZES.lg, borderRadius: 30, borderWidth: 1, borderColor: COLORS.goldHairline, backgroundColor: 'rgba(24,22,16,0.42)', overflow: 'hidden', ...SHADOWS.large },
  financialPositionCardCompact: { padding: SIZES.md, marginBottom: SIZES.md, borderRadius: SIZES.radiusLg },
  positionHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.md, paddingBottom: SIZES.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.glassHighlight },
  positionHeaderCompact: { gap: SIZES.sm, paddingBottom: SIZES.md },
  positionTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800' },
  positionPeriod: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 17, marginTop: SIZES.xs },
  positionStatus: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, borderWidth: 1, borderColor: COLORS.goldHairline, borderRadius: SIZES.radiusFull, backgroundColor: COLORS.goldGlass },
  positionStatusCompact: { minHeight: 32, paddingHorizontal: SIZES.sm },
  positionStatusText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  positionBody: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: SIZES.lg, paddingTop: SIZES.lg },
  positionBodyCompact: { flexDirection: 'column', flexWrap: 'nowrap', gap: SIZES.md, paddingTop: SIZES.md },
  positionLead: { flex: 1.2, minWidth: 260, justifyContent: 'center' },
  positionLeadCompact: { width: '100%', minWidth: '100%', flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  positionLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '700' },
  positionLeadValue: { color: COLORS.goldLight, fontSize: 38, lineHeight: 45, fontWeight: '850' as any, letterSpacing: -1, marginTop: SIZES.sm, fontVariant: ['tabular-nums'] },
  positionLeadValueCompact: { fontSize: 29, lineHeight: 34, marginTop: SIZES.xs },
  positionHint: { maxWidth: 420, color: COLORS.textTertiary, fontSize: 11, lineHeight: 17, marginTop: SIZES.sm },
  positionLedger: { flex: 1, minWidth: 260, borderRadius: SIZES.radiusLg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', backgroundColor: 'rgba(8,9,8,0.48)', overflow: 'hidden' },
  positionLedgerCompact: { width: '100%', minWidth: '100%', flexGrow: 0, flexShrink: 0, flexBasis: 'auto', borderRadius: SIZES.radiusMd },
  positionLedgerRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  positionLedgerRowCompact: { minHeight: 56, paddingHorizontal: SIZES.sm },
  positionLedgerRowLast: { borderBottomWidth: 0 },
  positionDot: { width: 7, height: 7, borderRadius: 4 },
  positionLedgerLabel: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.fontSm },
  positionLedgerValue: { maxWidth: '52%', color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] },
  financeBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm, marginTop: SIZES.lg },
  financeBreakdownCompact: { flexDirection: 'column', marginTop: SIZES.md },
  financeBreakdownItem: { flex: 1, minWidth: 170, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, borderRadius: SIZES.radiusLg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(8,9,8,0.40)' },
  financeBreakdownLabel: { color: COLORS.textTertiary, fontSize: 11, fontWeight: '700' },
  financeBreakdownValue: { maxWidth: '100%', color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },
  financeDetailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm },
  financeDetailMetric: { position: 'relative', flexGrow: 1, flexBasis: 280, minWidth: 240, minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.border, backgroundColor: 'rgba(8,13,18,0.42)', overflow: 'hidden' },
  financeDetailIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  financeDetailSignal: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, opacity: 0.55 },
  financeDetailLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontSm },
  financeDetailValue: { maxWidth: '46%', color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm, marginBottom: SIZES.lg },
  kpi: { minWidth: 180, flexGrow: 1, flexBasis: 200, minHeight: 128, justifyContent: 'flex-end', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusLg, borderWidth: 1, borderTopWidth: 3, borderColor: COLORS.border, padding: SIZES.md, ...SHADOWS.small },
  kpiFeatured: { flexBasis: 300, minHeight: 172, backgroundColor: COLORS.backgroundElevated, padding: SIZES.lg },
  kpiIcon: { position: 'absolute', top: SIZES.md, right: SIZES.md, width: 38, height: 38, borderRadius: SIZES.radiusSm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { color: COLORS.textPrimary, fontWeight: '800', fontSize: SIZES.fontMd, marginTop: SIZES.sm, fontVariant: ['tabular-nums'] },
  kpiValueFeatured: { fontSize: 28, lineHeight: 34, color: COLORS.textPrimary },
  kpiLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: SIZES.xs },
  overviewColumns: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: SIZES.md },
  overviewColumn: { flex: 1, minWidth: 300 },
  section: { position: 'relative', backgroundColor: 'rgba(15,21,28,0.58)', borderRadius: SIZES.radiusLg, borderWidth: 1, borderColor: COLORS.border, padding: SIZES.lg, marginBottom: SIZES.lg, overflow: 'hidden', ...SHADOWS.small },
  sectionTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800' },
  sectionSubtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 17, marginTop: SIZES.xs },
  sectionBody: { marginTop: SIZES.md },
  monthCloseCard: { position: 'relative', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SIZES.lg, padding: SIZES.lg, marginBottom: SIZES.lg, borderRadius: SIZES.radiusLg, borderWidth: 1, borderColor: COLORS.goldHairline, backgroundColor: '#191A12', overflow: 'hidden', ...SHADOWS.medium },
  monthCloseCopy: { flex: 2, minWidth: 260, flexDirection: 'row', alignItems: 'center', gap: SIZES.md },
  monthCloseIcon: { width: 48, height: 48, borderRadius: SIZES.radiusMd, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.goldGlass, borderWidth: 1, borderColor: COLORS.goldHairline },
  monthCloseTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800' },
  monthCloseText: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 18, marginTop: SIZES.xs },
  monthCloseActions: { flex: 1, minWidth: 280, flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SIZES.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.marbleGray, paddingVertical: SIZES.sm },
  moneyLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, flex: 1 },
  moneyValue: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '600', textAlign: 'right', fontVariant: ['tabular-nums'] },
  strong: { color: COLORS.textPrimary, fontWeight: '800' },
  negative: { color: COLORS.error },
  barBlock: { marginBottom: SIZES.md },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: COLORS.backgroundLight, marginTop: SIZES.sm, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  recordCard: { backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, borderWidth: 1, borderColor: COLORS.border },
  recordTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.sm },
  recordTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '700', flex: 1 },
  recordMeta: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: SIZES.xs, lineHeight: 17 },
  goodAmount: { color: COLORS.success, fontSize: SIZES.fontSm, fontWeight: '800' },
  dangerAmount: { color: COLORS.error, fontSize: SIZES.fontSm, fontWeight: '800' },
  warningText: { color: COLORS.warning, fontSize: SIZES.fontXs, marginTop: SIZES.sm },
  goodText: { color: COLORS.success, fontSize: SIZES.fontXs, marginTop: SIZES.sm },
  warningAmount: { color: COLORS.warning, fontSize: SIZES.fontSm, fontWeight: '800' },
  status: { paddingHorizontal: SIZES.sm, paddingVertical: 3, borderRadius: SIZES.radiusXs, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.borderStrong },
  statusText: { fontSize: SIZES.fontXs, fontWeight: '700', textTransform: 'capitalize' },
  inputLabel: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '600', marginBottom: SIZES.xs },
  pickerBox: { height: 50, borderWidth: 1, borderColor: COLORS.marbleGray, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.backgroundLight, justifyContent: 'center', overflow: 'hidden', marginBottom: SIZES.md },
  picker: { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundLight, width: '100%' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm, marginBottom: SIZES.md },
  formDivider: { height: 1, backgroundColor: COLORS.marbleGray, marginVertical: SIZES.lg },
  flexButton: { flex: 1, minWidth: 120 },
  searchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.sm },
  searchClear: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: SIZES.radiusSm, borderWidth: 1, borderColor: COLORS.marbleGray, backgroundColor: COLORS.backgroundLight },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.xs, marginBottom: SIZES.md },
  filterChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SIZES.md, borderRadius: SIZES.radiusSm, borderWidth: 1, borderColor: COLORS.marbleGray, backgroundColor: COLORS.backgroundLight },
  filterChipActive: { borderColor: COLORS.gold, backgroundColor: COLORS.gold },
  filterChipText: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, fontWeight: '700' },
  filterChipTextActive: { color: COLORS.marbleDark },
  searchResults: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.marbleGray, overflow: 'hidden' },
  searchHint: { color: COLORS.textTertiary, fontSize: SIZES.fontXs, marginTop: -SIZES.xs },
  studentResult: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, padding: SIZES.sm, backgroundColor: COLORS.backgroundLight, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.marbleGray },
  studentResultSelected: { backgroundColor: COLORS.gold + '22' },
  studentResultIcon: { width: 34, height: 34, borderRadius: SIZES.radiusSm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold + '22' },
  selectedStudentCard: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, padding: SIZES.md, marginBottom: SIZES.md, borderRadius: SIZES.radiusSm, borderWidth: 1, borderColor: COLORS.gold, backgroundColor: COLORS.gold + '15' },
  unselectedStudentCard: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SIZES.sm, padding: SIZES.md, marginBottom: SIZES.md, borderRadius: SIZES.radiusSm, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.gold + '88', backgroundColor: COLORS.backgroundLight },
  changeStudentButton: { minHeight: SIZES.touchTarget, justifyContent: 'center', paddingHorizontal: SIZES.md, borderRadius: SIZES.radiusSm, borderWidth: 1, borderColor: COLORS.gold },
  receiptNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.sm, padding: SIZES.md, marginBottom: SIZES.md, borderRadius: SIZES.radiusSm, borderWidth: 1 },
  receiptNoticeSuccess: { backgroundColor: COLORS.success + '15', borderColor: COLORS.success + '77' },
  receiptNoticeError: { backgroundColor: COLORS.error + '15', borderColor: COLORS.error + '77' },
  receiptNoticeWarning: { backgroundColor: COLORS.warning + '15', borderColor: COLORS.warning + '77' },
  receiptNoticeText: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontXs, lineHeight: 18 },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SIZES.md, backgroundColor: '#000000B8' },
  modalMotion: { width: '100%', maxWidth: 540, maxHeight: '90%' },
  modalCard: { width: '100%', maxWidth: 540, maxHeight: '90%', backgroundColor: COLORS.backgroundElevated, borderRadius: SIZES.radiusLg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', ...SHADOWS.large },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.sm, padding: SIZES.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.marbleGray },
  modalTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800' },
  modalSubtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 17, marginTop: SIZES.xs },
  modalClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: SIZES.radiusSm, backgroundColor: COLORS.backgroundLight },
  modalScroll: { flexGrow: 0 },
  modalBody: { padding: SIZES.md, paddingBottom: SIZES.lg },
  policyRow: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.marbleGray, paddingVertical: SIZES.sm },
  pricingCard: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.marbleGray, borderRadius: 0, backgroundColor: COLORS.backgroundLight, marginBottom: SIZES.md, overflow: 'hidden' },
  pricingCardHeader: { flexDirection: 'row', alignItems: 'center', padding: SIZES.md, backgroundColor: COLORS.gold + '10', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.marbleGray },
  pricingCardTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '800' },
  pricingRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.marbleGray },
  editPolicyButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: SIZES.sm, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.gold },
  editPolicyText: { color: COLORS.gold, fontSize: SIZES.fontXs, fontWeight: '700' },
  pendingReportCard: { borderColor: COLORS.warning + '88', borderWidth: 1 },
  destinationRow: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, padding: SIZES.md, borderRadius: 0, backgroundColor: COLORS.backgroundLight, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: COLORS.marbleGray },
  destinationIcon: { width: 44, height: 44, borderRadius: 0, alignItems: 'flex-start', justifyContent: 'center', backgroundColor: 'transparent' },
  destinationActions: { flexDirection: 'row', alignItems: 'center', gap: SIZES.xs },
  iconAction: { width: 44, height: 44, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.backgroundCard },
  receivingCardNumber: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '800', marginTop: SIZES.xs, fontVariant: ['tabular-nums'] },
  verificationSummary: { borderRadius: 0, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.gold + '66', backgroundColor: COLORS.gold + '10', padding: SIZES.md, marginBottom: SIZES.md },
  lessonList: { marginTop: SIZES.md },
  lessonActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm, marginTop: SIZES.md },
  miniAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SIZES.md, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.warning + '24', borderWidth: 1, borderColor: COLORS.warning },
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
