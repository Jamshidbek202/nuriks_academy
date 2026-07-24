import React, { useState } from 'react';
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
import { Text, TextInput } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { TimePicker } from '../../src/components/DateTimePicker';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';

interface SystemSettings {
  academy_name: string;
  academy_email: string;
  academy_phone: string;
  academy_address: string;
  working_hours_start: string;
  working_hours_end: string;
  support_working_hours?: { start: string; end: string };
  student_id_prefix: string;
  student_id_digits: number;
  timezone: string;
  currency: string;
  click_merchant_id?: string;
  payme_merchant_id?: string;
}

interface Branch {
  id: string;
  name: string;
  address: string;
  phone?: string;
  email?: string;
  is_active: boolean;
}

export default function SettingsScreen() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [branchModalVisible, setBranchModalVisible] = useState(false);
  const [editField, setEditField] = useState<{ key: string; label: string; value: string }>({ key: '', label: '', value: '' });
  const [newBranch, setNewBranch] = useState({ name: '', address: '', phone: '', email: '' });

  const loadSettings = async () => {
    try {
      const [settingsRes, branchesRes] = await Promise.all([
        api.get('/admin/settings'),
        api.get('/admin/branches')
      ]);
      setSettings(settingsRes.data);
      setBranches(branchesRes.data);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useLiveRefresh(loadSettings, user?.role === 'super_admin', 'system-settings');

  const handleSave = async () => {
    if (!editField.key) return;
    setSaving(true);
    try {
      await api.put('/admin/settings', { [editField.key]: editField.value });
      Alert.alert('Success', 'Settings updated successfully');
      setEditModalVisible(false);
      loadSettings();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAddBranch = async () => {
    if (!newBranch.name || !newBranch.address) {
      Alert.alert('Error', 'Branch name and address are required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/admin/branches', newBranch);
      Alert.alert('Success', 'Branch added successfully');
      setBranchModalVisible(false);
      setNewBranch({ name: '', address: '', phone: '', email: '' });
      loadSettings();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add branch');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (key: string, label: string, value: string) => {
    setEditField({ key, label, value: value || '' });
    setEditModalVisible(true);
  };

  if (user?.role !== 'super_admin') {
    return (
      <View style={styles.accessDenied}>
        <Ionicons name="lock-closed" size={64} color={COLORS.error} />
        <Text style={styles.accessDeniedText}>Access Denied</Text>
        <Text style={styles.accessDeniedSub}>Super Admin access required</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>System Settings</Text>
        <Text style={styles.subtitle}>Configure academy settings</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSettings(); }} tintColor={COLORS.gold} />
        }
      >
        {/* Academy Information */}
        <Text style={styles.sectionTitle}>Academy Information</Text>
        <View style={styles.card}>
          <SettingRow icon="business" label="Academy Name" value={settings?.academy_name || ''} onPress={() => openEditModal('academy_name', 'Academy Name', settings?.academy_name || '')} />
          <SettingRow icon="mail" label="Email" value={settings?.academy_email || ''} onPress={() => openEditModal('academy_email', 'Email', settings?.academy_email || '')} />
          <SettingRow icon="call" label="Phone" value={settings?.academy_phone || ''} onPress={() => openEditModal('academy_phone', 'Phone', settings?.academy_phone || '')} />
          <SettingRow icon="location" label="Address" value={settings?.academy_address || ''} onPress={() => openEditModal('academy_address', 'Address', settings?.academy_address || '')} />
        </View>

        {/* Working Hours */}
        <Text style={styles.sectionTitle}>Working Hours</Text>
        <View style={styles.card}>
          <SettingRow icon="time" label="Start Time" value={settings?.working_hours_start || '09:00'} onPress={() => openEditModal('working_hours_start', 'Start Time', settings?.working_hours_start || '')} />
          <SettingRow icon="time-outline" label="End Time" value={settings?.working_hours_end || '18:00'} onPress={() => openEditModal('working_hours_end', 'End Time', settings?.working_hours_end || '')} />
        </View>

        {/* Student ID Format */}
        <Text style={styles.sectionTitle}>Student ID Format</Text>
        <View style={styles.card}>
          <SettingRow icon="document-text" label="Prefix" value={settings?.student_id_prefix || 'NA'} onPress={() => openEditModal('student_id_prefix', 'Prefix', settings?.student_id_prefix || '')} />
          <View style={styles.settingRow}>
            <View style={styles.settingIcon}><Ionicons name="code" size={20} color={COLORS.gold} /></View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Format Example</Text>
              <Text style={styles.settingValue}>{settings?.student_id_prefix || 'NA'}-{'0'.repeat(settings?.student_id_digits || 6).slice(0, -1)}1</Text>
            </View>
          </View>
        </View>

        {/* Payment Settings */}
        <Text style={styles.sectionTitle}>Payment Settings</Text>
        <View style={styles.card}>
          <SettingRow icon="card" label="Currency" value={settings?.currency || 'UZS'} onPress={() => openEditModal('currency', 'Currency', settings?.currency || '')} />
          <SettingRow icon="logo-paypal" label="Click Merchant ID" value={settings?.click_merchant_id || 'Not set'} onPress={() => openEditModal('click_merchant_id', 'Click Merchant ID', settings?.click_merchant_id || '')} />
          <SettingRow icon="wallet" label="Payme Merchant ID" value={settings?.payme_merchant_id || 'Not set'} onPress={() => openEditModal('payme_merchant_id', 'Payme Merchant ID', settings?.payme_merchant_id || '')} />
        </View>

        {/* Branch Management */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Branch Management</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => setBranchModalVisible(true)}>
            <Ionicons name="add" size={20} color={COLORS.gold} />
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {branches.length > 0 ? (
            branches.map((branch) => (
              <View key={branch.id} style={styles.branchItem}>
                <View style={styles.branchIcon}>
                  <Ionicons name="storefront" size={24} color={COLORS.gold} />
                </View>
                <View style={styles.branchInfo}>
                  <Text style={styles.branchName}>{branch.name}</Text>
                  <Text style={styles.branchAddress}>{branch.address}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: branch.is_active ? COLORS.success + '20' : COLORS.error + '20' }]}>
                  <Text style={[styles.statusText, { color: branch.is_active ? COLORS.success : COLORS.error }]}>
                    {branch.is_active ? 'Active' : 'Inactive'}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No branches configured</Text>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit {editField.label}</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            {['working_hours_start', 'working_hours_end'].includes(editField.key) ? (
              <TimePicker
                testID="settings-working-hours-time"
                value={editField.value}
                onChange={(value) => setEditField({ ...editField, value })}
              />
            ) : (
              <TextInput
                style={styles.modalInput}
                value={editField.value}
                onChangeText={(text) => setEditField({ ...editField, value: text })}
                placeholder={`Enter ${editField.label}`}
                placeholderTextColor={COLORS.textTertiary}
              />
            )}
            <Button title={saving ? 'Saving...' : 'Save'} onPress={handleSave} disabled={saving} />
          </View>
        </View>
      </Modal>

      {/* Add Branch Modal */}
      <Modal visible={branchModalVisible} animationType="slide" transparent onRequestClose={() => setBranchModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Branch</Text>
              <TouchableOpacity onPress={() => setBranchModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <TextInput style={styles.modalInput} value={newBranch.name} onChangeText={(text) => setNewBranch({ ...newBranch, name: text })} placeholder="Branch Name *" placeholderTextColor={COLORS.textTertiary} />
            <TextInput style={styles.modalInput} value={newBranch.address} onChangeText={(text) => setNewBranch({ ...newBranch, address: text })} placeholder="Address *" placeholderTextColor={COLORS.textTertiary} />
            <TextInput style={styles.modalInput} value={newBranch.phone} onChangeText={(text) => setNewBranch({ ...newBranch, phone: text })} placeholder="Phone" placeholderTextColor={COLORS.textTertiary} />
            <TextInput style={styles.modalInput} value={newBranch.email} onChangeText={(text) => setNewBranch({ ...newBranch, email: text })} placeholder="Email" placeholderTextColor={COLORS.textTertiary} />
            <Button title={saving ? 'Adding...' : 'Add Branch'} onPress={handleAddBranch} disabled={saving} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const SettingRow = ({ icon, label, value, onPress }: { icon: string; label: string; value: string; onPress?: () => void }) => (
  <TouchableOpacity style={styles.settingRow} onPress={onPress} disabled={!onPress}>
    <View style={styles.settingIcon}><Ionicons name={icon as any} size={20} color={COLORS.gold} /></View>
    <View style={styles.settingContent}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value || 'Not set'}</Text>
    </View>
    {onPress && <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  accessDenied: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  accessDeniedText: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: SIZES.md },
  accessDeniedSub: { fontSize: SIZES.fontMd, color: COLORS.textSecondary, marginTop: SIZES.sm },
  header: { paddingTop: 60, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark },
  title: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  subtitle: { fontSize: SIZES.fontMd, color: COLORS.textSecondary, marginTop: SIZES.xs },
  content: { flex: 1, padding: SIZES.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SIZES.md, marginBottom: SIZES.sm },
  sectionTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.gold, marginTop: SIZES.md, marginBottom: SIZES.sm },
  addButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.gold + '20', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, ...SHADOWS.small, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: SIZES.md, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  settingIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.gold + '20', justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  settingContent: { flex: 1 },
  settingLabel: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  settingValue: { fontSize: SIZES.fontMd, color: COLORS.textPrimary, fontWeight: '500', marginTop: 2 },
  branchItem: { flexDirection: 'row', alignItems: 'center', padding: SIZES.md, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  branchIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.gold + '20', justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  branchInfo: { flex: 1 },
  branchName: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  branchAddress: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: SIZES.sm, paddingVertical: 4, borderRadius: SIZES.radiusSm },
  statusText: { fontSize: SIZES.fontXs, fontWeight: '600' },
  emptyText: { padding: SIZES.lg, textAlign: 'center', color: COLORS.textTertiary },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, padding: SIZES.lg, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SIZES.lg },
  modalTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  modalInput: { backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, padding: SIZES.md, fontSize: SIZES.fontMd, color: COLORS.textPrimary, marginBottom: SIZES.md, borderWidth: 1, borderColor: COLORS.marbleGray },
});
