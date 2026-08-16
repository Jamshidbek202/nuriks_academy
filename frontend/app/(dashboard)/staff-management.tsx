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
import TelegramInviteModal, {
  TelegramInviteItem,
  telegramInviteFromResponse,
} from '../../src/components/TelegramInviteModal';

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
  account_status?: 'pending_invite' | 'active' | 'deactivated' | 'phone_required' | 'deleted';
  phone_verified?: boolean;
  invite_delivery_status?: string;
  telegram_connected?: boolean;
  telegram_link_status?: 'linked' | 'awaiting_connection' | 'not_connected';
  telegram_link_expires_at?: string;
  can_delete_permanently?: boolean;
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
  const [telegramInvites, setTelegramInvites] = useState<TelegramInviteItem[]>([]);
  const [roleChange, setRoleChange] = useState<AccountRole>('manager');
  const [roleChangeReason, setRoleChangeReason] = useState('');
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

  useLiveRefresh(loadStaff, Boolean(user && ['super_admin', 'manager'].includes(user.role)), `${tab}:${user?.role}`, 1000);

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

  const openDetails = (staff: StaffRecord) => {
    setSelected(staff);
    setRoleChange(staff.role || (tab === 'support' ? 'support' : 'manager'));
    setRoleChangeReason('');
  };

  const checkTelegramHealth = async () => {
    setActionLoading(true);
    try {
      const { data } = await api.get('/auth/telegram/provider-health');
      showAlert(
        data.healthy ? 'Telegram delivery is ready' : 'Telegram delivery needs attention',
        `${data.message}\n\nBot: @${data.provider_bot_username || data.bot_username}\nWebhook matches: ${data.webhook_matches ? 'yes' : 'no'}\nPending updates: ${data.pending_update_count || 0}${data.last_error_message ? `\nLast provider error: ${data.last_error_message}` : ''}`,
      );
    } catch (error) {
      showAlert('Telegram health check failed', apiErrorMessage(error, 'The backend could not reach Telegram.'));
    } finally {
      setActionLoading(false);
    }
  };

  const changeRole = async () => {
    if (!selected || roleChange === selected.role) return;
    if (roleChangeReason.trim().length < 5) {
      showAlert('Reason required', 'Enter why this role is being corrected.');
      return;
    }
    setActionLoading(true);
    try {
      await api.patch(`/staff-accounts/${selected.id}/role`, {
        role: roleChange,
        reason: roleChangeReason.trim(),
      });
      setSelected(null);
      await loadStaff();
      showAlert('Role corrected', 'The worker’s existing sessions ended and their account now uses the selected role.');
    } catch (error) {
      showAlert('Role could not be changed', apiErrorMessage(error));
    } finally {
      setActionLoading(false);
    }
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
      const invite = telegramInviteFromResponse(response.data, `${form.first_name.trim()} ${form.last_name.trim()}`);
      if (invite) setTelegramInvites([invite]);
      else showAlert(
        'Account created',
        delivery === 'sent' || delivery === 'mock'
          ? 'The invitation code was sent through Telegram. The user must create their own password.'
          : 'The account is pending activation. Create a Telegram invitation link from the account details.',
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
      const invite = telegramInviteFromResponse(response.data, displayName(staff));
      if (invite) setTelegramInvites([invite]);
      else showAlert('Telegram code sent', response.data?.message || 'The access code was sent through Telegram.');
      setSelected(null);
      await loadStaff();
    } catch (error: any) {
      showAlert('Could not prepare Telegram access', apiErrorMessage(error));
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
        : `${displayName(staff)} will immediately lose access on every signed-in device. Their Telegram account will also be released so it can be linked to another app account.`,
      async () => {
        setActionLoading(true);
        try {
          const response = await api.patch(`${accountPath(staff)}/${action}`);
          setSelected(null);
          await loadStaff();
          const invite = telegramInviteFromResponse(response.data, displayName(staff));
          if (invite) setTelegramInvites([invite]);
        } catch (error: any) {
          showAlert('Account update failed', apiErrorMessage(error));
        } finally {
          setActionLoading(false);
        }
      },
    );
  };

  const releaseTelegram = (staff: StaffRecord) => {
    showConfirm(
      'Release Telegram account',
      `Disconnect Telegram from ${displayName(staff)}? Existing sessions will end, but the staff account and all history will remain.`,
      async () => {
        setActionLoading(true);
        try {
          await api.delete(`/staff-accounts/${staff.id}/telegram`);
          setSelected(null);
          await loadStaff();
          showAlert('Telegram released', 'This Telegram account can now be connected to another Nurik\'s Academy account.');
        } catch (error: any) {
          showAlert('Could not release Telegram', apiErrorMessage(error));
        } finally {
          setActionLoading(false);
        }
      },
    );
  };

  const deleteWorker = (staff: StaffRecord) => {
    showConfirm(
      'Permanently Delete Worker',
      `Delete ${displayName(staff)} permanently?\n\nThis cannot be undone. Their login, phone number, and Telegram connection will be released, while historical records remain. Open assignments or bookings must be reassigned first. Use Deactivate if the worker may return.`,
      async () => {
        setActionLoading(true);
        try {
          await api.delete(accountPath(staff));
          setSelected(null);
          await loadStaff();
          showAlert('Worker Deleted', 'The worker was removed and their phone number can now be reused.');
        } catch (error: any) {
          showAlert('Worker Was Not Deleted', apiErrorMessage(error));
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
          <Text style={styles.subtitle}>Telegram invitations and account access</Text>
        </View>
        <View style={styles.headerActions}>
          {isSuperAdmin && (
            <TouchableOpacity testID="telegram-health-button" accessibilityLabel="Check Telegram delivery" style={styles.healthButton} disabled={actionLoading} onPress={() => void checkTelegramHealth()}>
              <Ionicons name="pulse" size={22} color={COLORS.gold} />
            </TouchableOpacity>
          )}
          <TouchableOpacity testID={tab === 'support' ? 'support-staff-add-button' : 'staff-account-add-button'} style={styles.addButton} onPress={openCreate}>
            <Ionicons name="add" size={24} color={COLORS.marbleDark} />
          </TouchableOpacity>
        </View>
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
                onPress={() => openDetails(staff)}
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
              <Text style={styles.inviteNote}>The app will create a private Telegram link. Send it directly to the user; after they press Start, the bot sends their six-digit code. No temporary password is stored or shown.</Text>
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
                <Text style={styles.detail}>Telegram: {selected.telegram_connected ? 'Connected' : selected.telegram_link_status === 'awaiting_connection' ? 'Waiting for user to open the private link' : 'Not connected'}</Text>
                {selected.telegram_link_status === 'awaiting_connection' && <Text style={styles.telegramHelp}>A code cannot arrive until this person opens their personal t.me link and presses Start. Use the button below to create a fresh link if needed.</Text>}
                {!!selected.last_login && <Text style={styles.detail}>Last sign in: {new Date(selected.last_login).toLocaleString()}</Text>}

                {isSuperAdmin && (
                  <View style={styles.roleCorrection}>
                    <Text style={styles.label}>Correct assigned role</Text>
                    <View style={styles.roleChoices}>
                      {(['manager', 'reception', 'support'] as AccountRole[]).map((role) => (
                        <TouchableOpacity key={role} testID={`change-role-${role}`} style={[styles.roleChoice, roleChange === role && styles.roleChoiceActive]} onPress={() => setRoleChange(role)}>
                          <Text style={[styles.roleChoiceText, roleChange === role && styles.roleChoiceTextActive]}>{role === 'support' ? 'Support' : role === 'manager' ? 'Manager' : 'Reception'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {roleChange !== selected.role && (
                      <>
                        <TextInput testID="staff-role-change-reason" style={[styles.input, styles.roleReason]} value={roleChangeReason} onChangeText={setRoleChangeReason} placeholder="Why is the role being corrected?" />
                        <TouchableOpacity testID="staff-role-change-submit" style={[styles.primary, styles.roleSubmit, actionLoading && styles.disabled]} disabled={actionLoading} onPress={() => void changeRole()}>
                          <Text style={styles.primaryText}>Save role correction</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}

                {selected.account_status !== 'deactivated' && (
                  <TouchableOpacity
                    testID={tab === 'support' ? 'support-staff-reset-password-button' : 'staff-account-send-code-button'}
                    style={styles.action}
                    onPress={() => sendAccessCode(selected)}
                    disabled={actionLoading}
                  >
                    <Ionicons name="chatbubble-ellipses" size={20} color={COLORS.warning} />
                    <Text style={styles.actionText}>{selected.telegram_connected ? (selected.account_status === 'pending_invite' ? 'Send invitation code' : 'Send password reset code') : 'Create and share a new Telegram link'}</Text>
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
                {tab === 'leadership' && selected.telegram_connected && (
                  <TouchableOpacity
                    testID="staff-release-telegram-button"
                    style={styles.action}
                    onPress={() => releaseTelegram(selected)}
                    disabled={actionLoading}
                  >
                    <Ionicons name="unlink" size={20} color={COLORS.warning} />
                    <Text style={styles.actionText}>Release Telegram</Text>
                  </TouchableOpacity>
                )}
                {isSuperAdmin && (
                  <TouchableOpacity
                    testID={tab === 'support' ? 'support-staff-delete-button' : 'staff-delete-button'}
                    style={[styles.action, styles.destructiveAction]}
                    onPress={() => deleteWorker(selected)}
                    disabled={actionLoading}
                  >
                    <Ionicons name="trash" size={20} color={COLORS.error} />
                    <Text style={[styles.actionText, styles.destructiveText]}>Delete Permanently</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      <TelegramInviteModal
        visible={telegramInvites.length > 0}
        invites={telegramInvites}
        onClose={() => setTelegramInvites([])}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  header: { paddingTop: SIZES.headerTop, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: COLORS.textPrimary, fontSize: SIZES.fontXxl, fontWeight: 'bold' },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginTop: 3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  healthButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.gold + '66', backgroundColor: COLORS.gold + '0D' },
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
  telegramHelp: { color: COLORS.warning, fontSize: SIZES.fontXs, lineHeight: 18, padding: SIZES.sm, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.warning + '10', marginBottom: SIZES.sm },
  roleCorrection: { paddingVertical: SIZES.sm, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: COLORS.marbleGray, marginVertical: SIZES.sm },
  roleReason: { marginTop: SIZES.sm },
  roleSubmit: { marginTop: SIZES.sm },
  action: { minHeight: 48, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, marginTop: SIZES.sm },
  actionText: { color: COLORS.textPrimary, fontWeight: '600' },
  destructiveAction: { borderColor: COLORS.error + '80', backgroundColor: COLORS.error + '0D' },
  destructiveText: { color: COLORS.error },
});
