import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text, TextInput } from '../../src/components/LocalizedText';
import { api, apiErrorMessage } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';
import { COLORS, SHADOWS, SIZES } from '../../src/constants/theme';

type StaffTab = 'leadership' | 'support';
type AccountRole = 'manager' | 'reception' | 'support';

interface StaffRecord {
  id: string;
  user_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone: string;
  email?: string;
  role?: AccountRole;
  is_active?: boolean;
  account_status?: 'pending_invite' | 'active' | 'deactivated' | 'phone_required';
  phone_verified?: boolean;
  invite_delivery_status?: string;
  last_login?: string;
}

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', style: 'destructive', onPress: onConfirm },
  ]);
};

const displayName = (staff: StaffRecord) =>
  staff.full_name || `${staff.first_name || ''} ${staff.last_name || ''}`.trim();

const statusLabel = (staff: StaffRecord) => {
  if (staff.account_status === 'pending_invite') return 'Invitation pending';
  if (staff.account_status === 'phone_required') return 'Phone required';
  if (staff.account_status === 'deactivated' || staff.is_active === false) return 'Deactivated';
  return 'Active';
};

export default function StaffManagementScreen() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [tab, setTab] = useState<StaffTab>(isSuperAdmin ? 'leadership' : 'support');
  const [records, setRecords] = useState<StaffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<StaffRecord | null>(null);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '+998',
    email: '',
    role: 'manager' as AccountRole,
    language_preference: 'ru',
  });

  const loadStaff = async () => {
    if (!user || !['super_admin', 'manager'].includes(user.role)) return;
    try {
      const response = tab === 'leadership'
        ? await api.get('/staff-accounts', { params: { include_inactive: true } })
        : await api.get('/support-staff', { params: { include_inactive: true } });
      setRecords(response.data);
    } catch (error: any) {
      showAlert('Error', apiErrorMessage(error, 'Failed to load staff accounts'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useLiveRefresh(loadStaff, Boolean(user && ['super_admin', 'manager'].includes(user.role)), `${tab}:${user?.role}`);

  const resetForm = () => setForm({
    first_name: '',
    last_name: '',
    phone: '+998',
    email: '',
    role: tab === 'support' ? 'support' : 'manager',
    language_preference: 'ru',
  });

  const openCreate = () => {
    resetForm();
    setCreateOpen(true);
  };

  const createStaff = async () => {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.phone.trim()) {
      showAlert('Required fields', 'Enter first name, last name, and phone number.');
      return;
    }
    setActionLoading(true);
    try {
      const response = tab === 'leadership'
        ? await api.post('/staff-accounts', {
            full_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
            phone: form.phone.trim(),
            email: form.email.trim() || null,
            role: form.role,
            language_preference: form.language_preference,
          })
        : await api.post('/support-staff', {
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim() || null,
          });
      setCreateOpen(false);
      await loadStaff();
      const delivery = response.data?.invite_delivery_status;
      showAlert(
        'Account created',
        delivery === 'sent' || delivery === 'mock'
          ? 'The invitation code was sent by SMS. The user must create their own password.'
          : 'The account is pending activation, but the SMS was not sent. Check SMS settings, then use Send invitation code.',
      );
    } catch (error: any) {
      showAlert('Could not create account', apiErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const accountPath = (staff: StaffRecord) =>
    tab === 'leadership' ? `/staff-accounts/${staff.id}` : `/support-staff/${staff.id}`;

  const sendAccessCode = async (staff: StaffRecord) => {
    setActionLoading(true);
    try {
      const endpoint = tab === 'leadership'
        ? `${accountPath(staff)}/send-access-code`
        : `${accountPath(staff)}/reset-password`;
      const response = await api.post(endpoint);
      showAlert('SMS sent', response.data?.message || 'The access code was sent.');
      setSelected(null);
      await loadStaff();
    } catch (error: any) {
      showAlert('Could not send SMS', apiErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const changeActiveState = (staff: StaffRecord) => {
    const deactivated = staff.account_status === 'deactivated' || (!staff.account_status && staff.is_active === false);
    const action = deactivated ? 'reactivate' : 'deactivate';
    showConfirm(
      deactivated ? 'Reactivate account' : 'Deactivate account',
      deactivated
        ? `Reactivate ${displayName(staff)}? If activation was never completed, a new invitation will be sent.`
        : `${displayName(staff)} will immediately lose access on every signed-in device.`,
      async () => {
        setActionLoading(true);
        try {
          await api.patch(`${accountPath(staff)}/${action}`);
          setSelected(null);
          await loadStaff();
        } catch (error: any) {
          showAlert('Account update failed', apiErrorMessage(error));
        } finally {
          setActionLoading(false);
        }
      },
    );
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) =>
      displayName(record).toLowerCase().includes(query) || record.phone?.toLowerCase().includes(query),
    );
  }, [records, search]);

  if (!user || !['super_admin', 'manager'].includes(user.role)) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed" size={58} color={COLORS.textTertiary} />
        <Text style={styles.emptyText}>Access denied</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Staff Management</Text>
          <Text style={styles.subtitle}>Phone invitations and account access</Text>
        </View>
        <TouchableOpacity
          testID={tab === 'support' ? 'support-staff-add-button' : 'staff-account-add-button'}
          style={styles.addButton}
          onPress={openCreate}
        >
          <Ionicons name="add" size={24} color={COLORS.marbleDark} />
        </TouchableOpacity>
      </View>

      {isSuperAdmin && (
        <View style={styles.tabs}>
          <TouchableOpacity
            testID="staff-leadership-tab"
            style={[styles.tab, tab === 'leadership' && styles.tabActive]}
            onPress={() => { setLoading(true); setTab('leadership'); }}
          >
            <Text style={[styles.tabText, tab === 'leadership' && styles.tabTextActive]}>Managers & Reception</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="staff-support-tab"
            style={[styles.tab, tab === 'support' && styles.tabActive]}
            onPress={() => { setLoading(true); setTab('support'); }}
          >
            <Text style={[styles.tabText, tab === 'support' && styles.tabTextActive]}>Support Teachers</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.searchBox}>
        <Ionicons name="search" size={19} color={COLORS.textTertiary} />
        <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search name or phone" />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.gold} /></View>
      ) : (
        <ScrollView
          style={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStaff(); }} tintColor={COLORS.gold} />}
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={54} color={COLORS.textTertiary} />
              <Text style={styles.emptyText}>No staff accounts yet</Text>
            </View>
          ) : filtered.map((staff) => {
            const state = statusLabel(staff);
            const active = state === 'Active';
            const pending = state === 'Invitation pending';
            return (
              <TouchableOpacity
                key={staff.id}
                testID={tab === 'support' ? `support-staff-card-${staff.id}` : `staff-account-card-${staff.id}`}
                style={styles.card}
                onPress={() => setSelected(staff)}
              >
                <View style={styles.avatar}>
                  <Ionicons name={staff.role === 'reception' ? 'call' : staff.role === 'manager' ? 'briefcase' : 'headset'} size={23} color={COLORS.gold} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.name}>{displayName(staff)}</Text>
                  <Text style={styles.phone}>{staff.phone}</Text>
                  <Text style={styles.role}>{staff.role === 'reception' ? 'Reception' : staff.role === 'manager' ? 'Manager' : 'Support teacher'}</Text>
                </View>
                <View style={[styles.badge, active ? styles.badgeActive : pending ? styles.badgePending : styles.badgeInactive]}>
                  <Text style={styles.badgeText}>{state}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{tab === 'leadership' ? 'Create staff account' : 'Add support teacher'}</Text>
              <TouchableOpacity onPress={() => setCreateOpen(false)}><Ionicons name="close" size={25} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {tab === 'leadership' && (
                <>
                  <Text style={styles.label}>Position *</Text>
                  <View style={styles.roleChoices}>
                    {(['manager', 'reception'] as AccountRole[]).map((role) => (
                      <TouchableOpacity
                        key={role}
                        testID={`staff-role-${role}`}
                        style={[styles.roleChoice, form.role === role && styles.roleChoiceActive]}
                        onPress={() => setForm({ ...form, role })}
                      >
                        <Text style={[styles.roleChoiceText, form.role === role && styles.roleChoiceTextActive]}>{role === 'manager' ? 'Manager' : 'Reception'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              <Text style={styles.label}>First name *</Text>
              <TextInput testID="staff-first-name-input" style={styles.input} value={form.first_name} onChangeText={(first_name) => setForm({ ...form, first_name })} />
              <Text style={styles.label}>Last name *</Text>
              <TextInput testID="staff-last-name-input" style={styles.input} value={form.last_name} onChangeText={(last_name) => setForm({ ...form, last_name })} />
              <Text style={styles.label}>Phone *</Text>
              <TextInput testID="staff-phone-input" style={styles.input} value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} keyboardType="phone-pad" placeholder="+998 90 123 45 67" />
              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} value={form.email} onChangeText={(email) => setForm({ ...form, email })} keyboardType="email-address" autoCapitalize="none" />
              {tab === 'leadership' && (
                <>
                  <Text style={styles.label}>Invitation language</Text>
                  <View style={styles.roleChoices}>
                    {['ru', 'uz', 'en'].map((language) => (
                      <TouchableOpacity key={language} style={[styles.languageChoice, form.language_preference === language && styles.roleChoiceActive]} onPress={() => setForm({ ...form, language_preference: language })}>
                        <Text style={[styles.roleChoiceText, form.language_preference === language && styles.roleChoiceTextActive]}>{language.toUpperCase()}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              <Text style={styles.inviteNote}>The user will receive a six-digit SMS code and create their own password. No temporary password is stored or shown.</Text>
              <TouchableOpacity
                testID={tab === 'support' ? 'support-staff-save-button' : 'staff-account-save-button'}
                style={[styles.primary, actionLoading && styles.disabled]}
                onPress={createStaff}
                disabled={actionLoading}
              >
                {actionLoading ? <ActivityIndicator color={COLORS.marbleDark} /> : <Text style={styles.primaryText}>Create and send invitation</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Account details</Text>
              <TouchableOpacity onPress={() => setSelected(null)}><Ionicons name="close" size={25} color={COLORS.textPrimary} /></TouchableOpacity>
            </View>
            {selected && (
              <>
                <Text style={styles.detailName}>{displayName(selected)}</Text>
                <Text style={styles.detail}>{selected.phone}</Text>
                {!!selected.email && <Text style={styles.detail}>{selected.email}</Text>}
                <Text style={styles.detail}>Status: {statusLabel(selected)}</Text>
                {!!selected.last_login && <Text style={styles.detail}>Last sign in: {new Date(selected.last_login).toLocaleString()}</Text>}

                {selected.account_status !== 'deactivated' && (
                  <TouchableOpacity
                    testID={tab === 'support' ? 'support-staff-reset-password-button' : 'staff-account-send-code-button'}
                    style={styles.action}
                    onPress={() => sendAccessCode(selected)}
                    disabled={actionLoading}
                  >
                    <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.warning} />
                    <Text style={styles.actionText}>{selected.account_status === 'pending_invite' ? 'Send invitation code' : 'Send password reset code'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  testID={tab === 'support'
                    ? (selected.account_status === 'deactivated' ? 'support-staff-reactivate-button' : 'support-staff-deactivate-button')
                    : (selected.account_status === 'deactivated' ? 'staff-reactivate-button' : 'staff-deactivate-button')}
                  style={styles.action}
                  onPress={() => changeActiveState(selected)}
                  disabled={actionLoading}
                >
                  <Ionicons name={selected.account_status === 'deactivated' ? 'checkmark-circle' : 'close-circle'} size={20} color={selected.account_status === 'deactivated' ? COLORS.success : COLORS.error} />
                  <Text style={styles.actionText}>{selected.account_status === 'deactivated' ? 'Reactivate' : 'Deactivate'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  header: { paddingTop: 58, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: COLORS.textPrimary, fontSize: SIZES.fontXxl, fontWeight: 'bold' },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginTop: 3 },
  addButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold },
  tabs: { flexDirection: 'row', padding: SIZES.sm, gap: SIZES.sm },
  tab: { flex: 1, minHeight: 44, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SIZES.sm },
  tabActive: { backgroundColor: COLORS.gold + '25', borderWidth: 1, borderColor: COLORS.gold },
  tabText: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, textAlign: 'center' },
  tabTextActive: { color: COLORS.gold, fontWeight: '700' },
  searchBox: { marginHorizontal: SIZES.md, marginBottom: SIZES.sm, backgroundColor: COLORS.backgroundCard, borderColor: COLORS.marbleGray, borderWidth: 1, borderRadius: SIZES.radiusMd, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.md },
  searchInput: { flex: 1, color: COLORS.textPrimary, padding: SIZES.sm, minHeight: 44 },
  list: { flex: 1, paddingHorizontal: SIZES.md },
  card: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, flexDirection: 'row', alignItems: 'center', ...SHADOWS.small },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.gold + '20', alignItems: 'center', justifyContent: 'center', marginRight: SIZES.md },
  cardBody: { flex: 1 },
  name: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '700' },
  phone: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginTop: 2 },
  role: { color: COLORS.textTertiary, fontSize: SIZES.fontXs, marginTop: 2 },
  badge: { maxWidth: 105, borderRadius: SIZES.radiusSm, paddingHorizontal: SIZES.sm, paddingVertical: 5 },
  badgeActive: { backgroundColor: COLORS.success + '25' },
  badgePending: { backgroundColor: COLORS.warning + '25' },
  badgeInactive: { backgroundColor: COLORS.error + '20' },
  badgeText: { color: COLORS.textPrimary, fontSize: 11, textAlign: 'center', fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 70 },
  emptyText: { color: COLORS.textSecondary, fontSize: SIZES.fontMd, marginTop: SIZES.md },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: SIZES.md },
  modal: { width: '100%', maxWidth: 520, maxHeight: '90%', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusLg, padding: SIZES.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SIZES.md },
  modalTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontXl, fontWeight: 'bold' },
  label: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '600', marginTop: SIZES.sm, marginBottom: SIZES.xs },
  input: { backgroundColor: COLORS.backgroundLight, color: COLORS.textPrimary, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, padding: SIZES.md },
  roleChoices: { flexDirection: 'row', gap: SIZES.sm },
  roleChoice: { flex: 1, padding: SIZES.sm, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, alignItems: 'center' },
  languageChoice: { paddingHorizontal: SIZES.lg, paddingVertical: SIZES.sm, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, alignItems: 'center' },
  roleChoiceActive: { borderColor: COLORS.gold, backgroundColor: COLORS.gold + '20' },
  roleChoiceText: { color: COLORS.textSecondary },
  roleChoiceTextActive: { color: COLORS.gold, fontWeight: '700' },
  inviteNote: { color: COLORS.textTertiary, fontSize: SIZES.fontSm, lineHeight: 19, marginTop: SIZES.md },
  primary: { minHeight: SIZES.touchTarget, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center', marginTop: SIZES.lg },
  primaryText: { color: COLORS.marbleDark, fontWeight: 'bold' },
  disabled: { opacity: 0.6 },
  detailName: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: 'bold', marginBottom: SIZES.sm },
  detail: { color: COLORS.textSecondary, fontSize: SIZES.fontMd, marginBottom: SIZES.sm },
  action: { minHeight: 48, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, marginTop: SIZES.sm },
  actionText: { color: COLORS.textPrimary, fontWeight: '600' },
});
