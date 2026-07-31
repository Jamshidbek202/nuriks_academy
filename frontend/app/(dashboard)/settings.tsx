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
}

export default function SettingsScreen() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editField, setEditField] = useState<{ key: string; label: string; value: string }>({ key: '', label: '', value: '' });

  const loadSettings = async () => {
    try {
      const settingsRes = await api.get('/admin/settings');
      setSettings(settingsRes.data);
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

        {/* Finance defaults. Receiving cards are managed in Finance > Online. */}
        <Text style={styles.sectionTitle}>Finance defaults</Text>
        <View style={styles.card}>
          <SettingRow icon="card" label="Currency" value={settings?.currency || 'UZS'} onPress={() => openEditModal('currency', 'Currency', settings?.currency || '')} />
          <View style={styles.financeNote}>
            <Ionicons name="information-circle" size={22} color={COLORS.gold} />
            <Text style={styles.financeNoteText}>
              Click and Payme receiving cards are managed in Finance, under Online payments.
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit {editField.label}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close setting editor" onPress={() => setEditModalVisible(false)}>
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

    </View>
  );
}

const SettingRow = ({ icon, label, value, onPress }: { icon: string; label: string; value: string; onPress?: () => void }) => (
  <TouchableOpacity
    style={styles.settingRow}
    onPress={onPress}
    disabled={!onPress}
    accessibilityRole={onPress ? 'button' : undefined}
    accessibilityLabel={onPress ? `Edit ${label}` : undefined}
  >
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
  sectionTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.gold, marginTop: SIZES.md, marginBottom: SIZES.sm },
  card: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, ...SHADOWS.small, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: SIZES.md, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  settingIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.gold + '20', justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  settingContent: { flex: 1 },
  settingLabel: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  settingValue: { fontSize: SIZES.fontMd, color: COLORS.textPrimary, fontWeight: '500', marginTop: 2 },
  financeNote: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.sm, padding: SIZES.md },
  financeNoteText: { flex: 1, fontSize: SIZES.fontSm, lineHeight: 20, color: COLORS.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, padding: SIZES.lg, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SIZES.lg },
  modalTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  modalInput: { backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, padding: SIZES.md, fontSize: SIZES.fontMd, color: COLORS.textPrimary, marginBottom: SIZES.md, borderWidth: 1, borderColor: COLORS.marbleGray },
});
