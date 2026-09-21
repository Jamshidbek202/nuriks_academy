import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { Text, TextInput, LocalizedPickerItem } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { api } from '../../src/services/api';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { ConcourseAtmosphere } from '../../src/components/ConcourseAtmosphere';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';
import { useAuth } from '../../src/contexts/AuthContext';
import TelegramInviteModal, { TelegramInviteItem } from '../../src/components/TelegramInviteModal';
import { CalendarDatePicker } from '../../src/components/CalendarDatePicker';
import { ageFromDateOfBirth, todayDateString } from '../../src/utils/dates';

// Cross-platform alert helper
const showAlert = (title: string, message: string, onOk?: () => void) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    if (onOk) onOk();
  } else {
    Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
  }
};

const LEAD_SOURCES = [
  'instagram', 'telegram', 'facebook', 'tiktok',
  'referral', 'banner', 'walk_in', 'website', 'other'
];

const LEAD_STATUSES = [
  { value: 'new_lead', label: 'New Lead', color: COLORS.info },
  { value: 'contacted', label: 'Contacted', color: COLORS.warning },
  { value: 'trial_scheduled', label: 'Trial Scheduled', color: COLORS.gold },
  { value: 'trial_completed', label: 'Trial Completed', color: COLORS.success },
  { value: 'negotiation', label: 'Negotiation', color: COLORS.warning },
  { value: 'enrolled', label: 'Enrolled', color: COLORS.success },
  { value: 'lost', label: 'Lost', color: COLORS.error },
];

type AccountAccessMode = 'student_only' | 'parent_only' | 'separate';

const ACCOUNT_ACCESS_OPTIONS: { value: AccountAccessMode; label: string; detail: string }[] = [
  {
    value: 'student_only',
    label: 'Student only',
    detail: 'The student receives one invitation and uses their own phone.',
  },
  {
    value: 'parent_only',
    label: 'Parent manages access',
    detail: 'The parent receives the invitation and sees this child. The student has no login yet.',
  },
  {
    value: 'separate',
    label: 'Student + parent',
    detail: 'Two different phone numbers create two separate accounts and invitations.',
  },
];

export default function LeadsScreen() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [courses, setCourses] = useState([]);
  
  // Convert confirmation modal state
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [leadToConvert, setLeadToConvert] = useState<any>(null);
  const [converting, setConverting] = useState(false);
  
  // Success modal state
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [conversionResult, setConversionResult] = useState<any>(null);
  const [telegramInvites, setTelegramInvites] = useState<TelegramInviteItem[]>([]);
  const [telegramInviteOpen, setTelegramInviteOpen] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    date_of_birth: '',
    parent_name: '',
    parent_phone: '',
    account_access_mode: 'student_only' as AccountAccessMode,
    interested_course: '',
    source: 'instagram',
    notes: '',
  });

  const loadLeads = async () => {
    try {
      const response = await api.get('/leads');
      setLeads(response.data);
    } catch (error) {
      console.error('Error loading leads:', error);
      showAlert('Error', 'Failed to load leads');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadCourses = async () => {
    try {
      const response = await api.get('/courses');
      setCourses(response.data);
    } catch (error) {
      console.error('Error loading courses:', error);
    }
  };

  useLiveRefresh(
    () => Promise.all([loadLeads(), loadCourses()]).then(() => undefined),
    true,
    'leads-and-courses',
    3000,
  );

  const handleCreateLead = async () => {
    if (!formData.first_name || !formData.last_name || !formData.phone || !formData.date_of_birth) {
      showAlert('Error', 'Please fill in required fields');
      return;
    }

    if (formData.account_access_mode !== 'student_only' && !formData.parent_name.trim()) {
      showAlert('Parent details required', 'Enter the parent name for parent account access.');
      return;
    }
    if (formData.account_access_mode === 'separate' && !formData.parent_phone.trim()) {
      showAlert('Parent phone required', 'Separate student and parent accounts need two phone numbers.');
      return;
    }
    if (
      formData.account_access_mode === 'separate'
      && formData.phone.replace(/\D/g, '') === formData.parent_phone.replace(/\D/g, '')
    ) {
      showAlert('Different phones required', 'One phone cannot be used for both the student and parent login.');
      return;
    }

    try {
      await api.post('/leads', {
        ...formData,
        parent_name: formData.account_access_mode === 'student_only' ? null : formData.parent_name.trim(),
        parent_phone: formData.account_access_mode === 'separate' ? formData.parent_phone.trim() : null,
      });
      showAlert('Success', 'Lead created successfully');
      setModalVisible(false);
      resetForm();
      loadLeads();
    } catch {
      showAlert('Error', 'Failed to create lead');
    }
  };

  // Show confirmation modal for conversion
  const handleConvertToStudent = (lead: any) => {
    if (!lead.date_of_birth) {
      showAlert('Date of birth required', 'Add the student’s full date of birth before conversion.');
      setSelectedLead(lead);
      return;
    }
    setLeadToConvert(lead);
    setConfirmModalVisible(true);
  };

  // Perform actual conversion
  const performConversion = async () => {
    if (!leadToConvert) return;
    
    setConverting(true);
    try {
      const response = await api.post(`/leads/${leadToConvert.id}/convert`);
      setConfirmModalVisible(false);
      setConversionResult(response.data);
      const preparedInvites = Object.entries(response.data?.credentials || {}).flatMap(
        ([role, value]: [string, any]) => value?.login && value?.temporary_password ? [{
          label: role === 'parent' ? `${leadToConvert.parent_name || 'Parent'}` : `${leadToConvert.first_name} ${leadToConvert.last_name}`,
          login: value.login,
          temporaryPassword: value.temporary_password,
        }] : [],
      );
      setTelegramInvites(preparedInvites);
      setSuccessModalVisible(true);
      loadLeads();
    } catch (error: any) {
      setConfirmModalVisible(false);
      showAlert('Error', error.response?.data?.detail || 'Failed to convert lead');
    } finally {
      setConverting(false);
    }
  };

  const handleUpdateStatus = async (leadId: string, newStatus: string) => {
    try {
      await api.put(`/leads/${leadId}`, { status: newStatus });
      setSelectedLead((current: any) => current?.id === leadId ? { ...current, status: newStatus } : current);
      loadLeads();
    } catch {
      showAlert('Error', 'Failed to update status');
    }
  };

  const handleUpdateBirthDate = async (leadId: string, dateOfBirth: string) => {
    try {
      const response = await api.put(`/leads/${leadId}`, { date_of_birth: dateOfBirth });
      setSelectedLead(response.data);
      setLeads((current) => current.map((lead) => lead.id === leadId ? response.data : lead));
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to update date of birth');
    }
  };

  const deleteLead = async (lead: any) => {
    try {
      await api.delete(`/leads/${lead.id}`);
      setLeads((currentLeads: any[]) =>
        currentLeads.filter((currentLead) => currentLead.id !== lead.id)
      );
      showAlert('Success', 'Lead deleted successfully');
    } catch (error: any) {
      showAlert('Deletion blocked', error.response?.data?.detail || 'Failed to delete lead');
    }
  };

  const handleDeleteLead = (lead: any) => {
    const message = `Delete ${lead.first_name} ${lead.last_name} from CRM? This cannot be undone.`;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        deleteLead(lead);
      }
      return;
    }

    Alert.alert('Delete Lead', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteLead(lead) },
    ]);
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      phone: '',
      date_of_birth: '',
      parent_name: '',
      parent_phone: '',
      account_access_mode: 'student_only',
      interested_course: '',
      source: 'instagram',
      notes: '',
    });
  };

  const getStatusColor = (status: string) => {
    const statusObj = LEAD_STATUSES.find(s => s.value === status);
    return statusObj?.color || COLORS.textSecondary;
  };

  const getStatusLabel = (status: string) => {
    const statusObj = LEAD_STATUSES.find(s => s.value === status);
    return statusObj?.label || status;
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
      <ConcourseAtmosphere />
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>CRM / Leads</Text>
          <Text style={styles.headerSubtitle}>{leads.length} total leads</Text>
        </View>
        <TouchableOpacity
          testID="leads-add-button"
          accessibilityRole="button"
          accessibilityLabel="Add Lead"
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add" size={24} color={COLORS.marbleDark} />
        </TouchableOpacity>
      </View>

      {/* Leads List */}
      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadLeads(); }} tintColor={COLORS.gold} />
        }
      >
        {leads.map((lead: any) => (
          <TouchableOpacity
            key={lead.id}
            testID={`lead-card-${lead.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Open lead ${lead.first_name} ${lead.last_name}`}
            style={styles.leadCard}
            onPress={() => setSelectedLead(lead)}
          >
            <View style={styles.leadHeader}>
              <View style={styles.leadAvatar}>
                <Text style={styles.leadAvatarText}>
                  {lead.first_name[0]}{lead.last_name[0]}
                </Text>
              </View>
              <View style={styles.leadInfo}>
                <Text style={styles.leadName}>
                  {lead.first_name} {lead.last_name}
                </Text>
                <Text style={styles.leadPhone}>{lead.phone}</Text>
                <View style={styles.leadMeta}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(lead.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(lead.status) }]}>
                      {getStatusLabel(lead.status)}
                    </Text>
                  </View>
                  <Text style={styles.leadSource}>{lead.source}</Text>
                </View>
              </View>
              {['super_admin', 'manager'].includes(user?.role || '') && !lead.converted_to_student_id && lead.status !== 'enrolled' && (
                <TouchableOpacity
                  style={styles.deleteLeadButton}
                  accessibilityLabel={`Delete ${lead.first_name} ${lead.last_name}`}
                  onPress={(event) => {
                    event.stopPropagation();
                    handleDeleteLead(lead);
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                </TouchableOpacity>
              )}
            </View>
            
            {lead.status !== 'enrolled' && lead.status !== 'lost' && (
              <TouchableOpacity
                testID={`lead-convert-${lead.id}`}
                style={styles.convertButton}
                onPress={(event) => {
                  event.stopPropagation();
                  handleConvertToStudent(lead);
                }}
              >
                <Text style={styles.convertButtonText}>Convert to Student</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Create Lead Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Lead</Text>
              <TouchableOpacity testID="lead-create-close" accessibilityLabel="Close lead form" onPress={() => { setModalVisible(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>First Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.first_name}
                  onChangeText={(text) => setFormData({ ...formData, first_name: text })}
                  placeholder="Enter first name"
                  placeholderTextColor={COLORS.textTertiary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Last Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.last_name}
                  onChangeText={(text) => setFormData({ ...formData, last_name: text })}
                  placeholder="Enter last name"
                  placeholderTextColor={COLORS.textTertiary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Who gets app access? *</Text>
                <View style={styles.accessOptions}>
                  {ACCOUNT_ACCESS_OPTIONS.map((option) => {
                    const selected = formData.account_access_mode === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        testID={`lead-access-${option.value}`}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        style={[styles.accessOption, selected && styles.accessOptionSelected]}
                        onPress={() => setFormData({
                          ...formData,
                          account_access_mode: option.value,
                          parent_name: option.value === 'student_only' ? '' : formData.parent_name,
                          parent_phone: option.value === 'separate' ? formData.parent_phone : '',
                        })}
                      >
                        <Ionicons
                          name={selected ? 'radio-button-on' : 'radio-button-off'}
                          size={21}
                          color={selected ? COLORS.gold : COLORS.textTertiary}
                        />
                        <View style={styles.accessOptionCopy}>
                          <Text style={styles.accessOptionTitle}>{option.label}</Text>
                          <Text style={styles.accessOptionDetail}>{option.detail}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {formData.account_access_mode === 'parent_only' ? 'Parent phone *' : 'Student phone *'}
                </Text>
                <TextInput
                  testID="lead-primary-phone"
                  style={styles.input}
                  value={formData.phone}
                  onChangeText={(text) => setFormData({ ...formData, phone: text })}
                  placeholder="+998901234567"
                  placeholderTextColor={COLORS.textTertiary}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formGroup}>
                <CalendarDatePicker
                  testID="lead-date-of-birth"
                  label="Date of birth *"
                  value={formData.date_of_birth}
                  onChange={(date_of_birth) => setFormData({ ...formData, date_of_birth })}
                  maximumDate={todayDateString()}
                  placeholder="Select full date of birth"
                />
                <Text style={styles.fieldHint}>Age is calculated automatically.</Text>
              </View>

              {formData.account_access_mode !== 'student_only' && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Parent name *</Text>
                  <TextInput
                    testID="lead-parent-name"
                    style={styles.input}
                    value={formData.parent_name}
                    onChangeText={(text) => setFormData({ ...formData, parent_name: text })}
                    placeholder="Enter parent name"
                    placeholderTextColor={COLORS.textTertiary}
                  />
                </View>
              )}

              {formData.account_access_mode === 'separate' && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Parent phone *</Text>
                  <TextInput
                    testID="lead-parent-phone"
                    style={styles.input}
                    value={formData.parent_phone}
                    onChangeText={(text) => setFormData({ ...formData, parent_phone: text })}
                    placeholder="+998901234568"
                    placeholderTextColor={COLORS.textTertiary}
                    keyboardType="phone-pad"
                  />
                  <Text style={styles.fieldHint}>Must differ from the student phone.</Text>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.label}>Interested Course</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    testID="lead-course-picker"
                    selectedValue={formData.interested_course}
                    onValueChange={(value) => setFormData({ ...formData, interested_course: value })}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                    dropdownIconColor={COLORS.gold}
                  >
                    <LocalizedPickerItem label="Select course" value="" />
                    {courses.map((course: any) => (
                      <LocalizedPickerItem key={course.id} label={course.name} value={course.name} />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Source *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={formData.source}
                    onValueChange={(value) => setFormData({ ...formData, source: value })}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                    dropdownIconColor={COLORS.gold}
                  >
                    {LEAD_SOURCES.map((source) => (
                      <LocalizedPickerItem key={source} label={source.replace('_', ' ')} value={source} />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Notes</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={formData.notes}
                  onChangeText={(text) => setFormData({ ...formData, notes: text })}
                  placeholder="Enter notes"
                  placeholderTextColor={COLORS.textTertiary}
                  multiline
                  numberOfLines={4}
                />
              </View>

              <TouchableOpacity style={styles.submitButton} onPress={handleCreateLead}>
                <Text style={styles.submitButtonText}>Create Lead</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Lead Detail Modal */}
      <Modal
        visible={Boolean(selectedLead)}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedLead(null)}
      >
        <View style={styles.confirmModalOverlay}>
          <View testID="lead-detail-modal" style={styles.leadDetailContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Lead Details</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close lead details"
                onPress={() => setSelectedLead(null)}
              >
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            {selectedLead ? (
              <View style={styles.leadDetailBody}>
                <Text style={styles.leadDetailName}>{selectedLead.first_name} {selectedLead.last_name}</Text>
                <Text style={styles.leadDetailValue}>{selectedLead.phone}</Text>
                <Text style={styles.leadDetailValue}>
                  Access: {ACCOUNT_ACCESS_OPTIONS.find((option) => option.value === (
                    selectedLead.account_access_mode || (selectedLead.parent_name ? 'parent_only' : 'student_only')
                  ))?.label}
                </Text>
                {selectedLead.parent_name ? <Text style={styles.leadDetailValue}>Parent: {selectedLead.parent_name}</Text> : null}
                {selectedLead.parent_phone ? <Text style={styles.leadDetailValue}>Parent phone: {selectedLead.parent_phone}</Text> : null}
                {selectedLead.date_of_birth ? (
                  <Text style={styles.leadDetailValue}>
                    Date of birth: {String(selectedLead.date_of_birth).slice(0, 10)} · Age: {ageFromDateOfBirth(selectedLead.date_of_birth)}
                  </Text>
                ) : (
                  <View style={styles.formGroup}>
                    <CalendarDatePicker
                      testID="lead-detail-date-of-birth"
                      label="Date of birth *"
                      value=""
                      onChange={(value) => void handleUpdateBirthDate(selectedLead.id, value)}
                      maximumDate={todayDateString()}
                      placeholder="Add date before conversion"
                    />
                  </View>
                )}
                <Text style={styles.leadDetailValue}>Source: {selectedLead.source?.replace('_', ' ')}</Text>
                {selectedLead.notes ? <Text style={styles.leadDetailNotes}>{selectedLead.notes}</Text> : null}

                <Text style={styles.label}>Status</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    testID="lead-status-picker"
                    selectedValue={selectedLead.status}
                    enabled={!selectedLead.converted_to_student_id && selectedLead.status !== 'enrolled'}
                    onValueChange={(value) => {
                      if (value !== selectedLead.status) void handleUpdateStatus(selectedLead.id, value);
                    }}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                    dropdownIconColor={COLORS.gold}
                  >
                    {LEAD_STATUSES.filter((status) => (
                      status.value !== 'enrolled' || selectedLead.status === 'enrolled'
                    )).map((status) => (
                      <LocalizedPickerItem key={status.value} label={status.label} value={status.value} />
                    ))}
                  </Picker>
                </View>

                {!selectedLead.converted_to_student_id && selectedLead.status !== 'enrolled' && selectedLead.status !== 'lost' ? (
                  <TouchableOpacity
                    testID={`lead-detail-convert-${selectedLead.id}`}
                    style={styles.convertButton}
                    onPress={() => {
                      const lead = selectedLead;
                      setSelectedLead(null);
                      handleConvertToStudent(lead);
                    }}
                  >
                    <Text style={styles.convertButtonText}>Convert to Student</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Convert Confirmation Modal */}
      <Modal
        visible={confirmModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setConfirmModalVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={styles.confirmIconContainer}>
              <Ionicons name="swap-horizontal-outline" size={40} color={COLORS.gold} />
            </View>
            <Text style={styles.confirmTitle}>Convert Lead to Student</Text>
            <Text style={styles.confirmMessage}>
              Convert <Text style={styles.confirmHighlight}>{leadToConvert?.first_name} {leadToConvert?.last_name}</Text> to a student?
            </Text>
            <Text style={styles.confirmDetails}>
              This will create:{'\n'}
              {leadToConvert?.account_access_mode === 'separate'
                ? '• A student account and invitation\n• A separate parent account and invitation'
                : (leadToConvert?.account_access_mode || (leadToConvert?.parent_name ? 'parent_only' : 'student_only')) === 'parent_only'
                  ? '• A student profile with an auto-generated ID\n• One parent account that can view the child'
                  : '• One student account and invitation'}
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setConfirmModalVisible(false)}
                disabled={converting}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="lead-convert-confirm"
                style={[styles.confirmButton, converting && styles.buttonDisabled]}
                onPress={performConversion}
                disabled={converting}
              >
                {converting ? (
                  <ActivityIndicator size="small" color={COLORS.marbleDark} />
                ) : (
                  <Text style={styles.confirmButtonText}>Convert</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Conversion Success Modal */}
      <Modal
        visible={successModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSuccessModalVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={60} color={COLORS.success} />
            </View>
            <Text style={styles.successTitle}>Lead Converted Successfully!</Text>
            
            {conversionResult && (
              <View style={styles.credentialsContainer}>
                <Text style={styles.credentialsLabel}>Account access</Text>
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialKey}>Student ID:</Text>
                  <Text style={styles.credentialValue}>{conversionResult.student_id}</Text>
                </View>
                <Text style={styles.credentialValue}>
                  {telegramInvites.length > 0
                    ? 'Temporary login details are ready. Share them privately with the account owner.'
                    : 'The student record was created. Add a unique phone number before enabling login.'}
                </Text>
                <Text style={[styles.credentialValue, { marginTop: SIZES.sm }]}>
                  The account owner must replace the temporary password after the first sign in.
                </Text>
              </View>
            )}

            {telegramInvites.length > 0 && (
              <TouchableOpacity
                testID="lead-account-credentials-button"
                style={[styles.successButton, { backgroundColor: COLORS.gold, marginBottom: SIZES.sm }]}
                onPress={() => {
                  setSuccessModalVisible(false);
                  setTelegramInviteOpen(true);
                }}
              >
                <Text style={[styles.successButtonText, { color: COLORS.marbleDark }]}>View login details</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              testID="lead-conversion-done"
              style={styles.successButton}
              onPress={() => {
                setSuccessModalVisible(false);
                setConversionResult(null);
                setLeadToConvert(null);
              }}
            >
              <Text style={styles.successButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <TelegramInviteModal
        visible={telegramInviteOpen}
        invites={telegramInvites}
        onClose={() => {
          setTelegramInviteOpen(false);
          setTelegramInvites([]);
          setConversionResult(null);
          setLeadToConvert(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SIZES.headerTop,
    paddingHorizontal: SIZES.lg,
    paddingBottom: SIZES.md,
    backgroundColor: COLORS.marbleDark,
  },
  headerTitle: {
    fontSize: SIZES.fontXxl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginTop: SIZES.xs,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  list: {
    flex: 1,
    padding: SIZES.md,
  },
  leadCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.md,
    ...SHADOWS.small,
  },
  leadHeader: {
    flexDirection: 'row',
    marginBottom: SIZES.md,
  },
  leadAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SIZES.md,
  },
  leadAvatarText: {
    fontSize: SIZES.fontLg,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
  leadInfo: {
    flex: 1,
  },
  deleteLeadButton: {
    padding: SIZES.sm,
    marginLeft: SIZES.sm,
  },
  leadName: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  leadPhone: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginTop: SIZES.xs,
  },
  leadMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SIZES.sm,
  },
  statusBadge: {
    paddingHorizontal: SIZES.sm,
    paddingVertical: 4,
    borderRadius: SIZES.radiusSm,
    marginRight: SIZES.sm,
  },
  statusText: {
    fontSize: SIZES.fontXs,
    fontWeight: '600',
  },
  leadSource: {
    fontSize: SIZES.fontXs,
    color: COLORS.textTertiary,
    textTransform: 'capitalize',
  },
  convertButton: {
    backgroundColor: COLORS.gold,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.sm,
    alignItems: 'center',
  },
  convertButtonText: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    color: COLORS.marbleDark,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.backgroundCard,
    borderTopLeftRadius: SIZES.radiusXl,
    borderTopRightRadius: SIZES.radiusXl,
    maxHeight: '90%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SIZES.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.marbleGray,
  },
  modalTitle: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  leadDetailContent: {
    width: '92%',
    maxWidth: 520,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusLg,
    overflow: 'hidden',
    ...SHADOWS.large,
  },
  leadDetailBody: {
    padding: SIZES.lg,
    gap: SIZES.sm,
  },
  leadDetailName: {
    fontSize: SIZES.fontXl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  leadDetailValue: {
    fontSize: SIZES.fontMd,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
  leadDetailNotes: {
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundLight,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
  },
  modalForm: {
    padding: SIZES.lg,
  },
  formGroup: {
    marginBottom: SIZES.md,
  },
  accessOptions: {
    gap: SIZES.sm,
  },
  accessOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.sm,
    padding: SIZES.md,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
    backgroundColor: COLORS.backgroundLight,
  },
  accessOptionSelected: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.gold + '14',
  },
  accessOptionCopy: {
    flex: 1,
  },
  accessOptionTitle: {
    color: COLORS.textPrimary,
    fontSize: SIZES.fontSm,
    fontWeight: '700',
  },
  accessOptionDetail: {
    color: COLORS.textSecondary,
    fontSize: SIZES.fontXs,
    lineHeight: 17,
    marginTop: 3,
  },
  label: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SIZES.xs,
  },
  input: {
    backgroundColor: COLORS.backgroundLight,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
  },
  fieldHint: {
    color: COLORS.textTertiary,
    fontSize: SIZES.fontXs,
    marginTop: SIZES.xs,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    backgroundColor: COLORS.backgroundLight,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
    overflow: 'hidden',
    height: 48,
    justifyContent: 'center',
  },
  picker: {
    width: '100%',
    height: 48,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundLight,
  },
  pickerItem: {
    color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundLight,
  },
  submitButton: {
    backgroundColor: COLORS.gold,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    alignItems: 'center',
    marginTop: SIZES.md,
    ...SHADOWS.medium,
  },
  submitButtonText: {
    fontSize: SIZES.fontLg,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
  // Confirmation Modal styles
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SIZES.lg,
  },
  confirmModalContent: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...SHADOWS.large,
  },
  confirmIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.gold + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  confirmTitle: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: SIZES.sm,
  },
  confirmMessage: {
    fontSize: SIZES.fontMd,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SIZES.md,
  },
  confirmHighlight: {
    fontWeight: 'bold',
    color: COLORS.gold,
  },
  confirmDetails: {
    fontSize: SIZES.fontSm,
    color: COLORS.textTertiary,
    textAlign: 'left',
    alignSelf: 'stretch',
    backgroundColor: COLORS.backgroundLight,
    padding: SIZES.md,
    borderRadius: SIZES.radiusMd,
    marginBottom: SIZES.lg,
    lineHeight: 22,
  },
  confirmButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: SIZES.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.backgroundLight,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
  },
  cancelButtonText: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: COLORS.gold,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: SIZES.fontMd,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  // Success Modal styles
  successModalContent: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...SHADOWS.large,
  },
  successIconContainer: {
    marginBottom: SIZES.md,
  },
  successTitle: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.success,
    textAlign: 'center',
    marginBottom: SIZES.lg,
  },
  credentialsContainer: {
    backgroundColor: COLORS.backgroundLight,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.lg,
    width: '100%',
    marginBottom: SIZES.lg,
  },
  credentialsLabel: {
    fontSize: SIZES.fontSm,
    fontWeight: 'bold',
    color: COLORS.gold,
    marginBottom: SIZES.sm,
    textTransform: 'uppercase',
  },
  credentialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SIZES.xs,
  },
  credentialKey: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
  },
  credentialValue: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  successButton: {
    backgroundColor: COLORS.success,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    alignItems: 'center',
    width: '100%',
  },
  successButtonText: {
    fontSize: SIZES.fontMd,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
