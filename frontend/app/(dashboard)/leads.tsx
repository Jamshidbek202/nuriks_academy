import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';

// Cross-platform alert helper
const showAlert = (title: string, message: string, onOk?: () => void) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    if (onOk) onOk();
  } else {
    const { Alert } = require('react-native');
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

export default function LeadsScreen() {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [courses, setCourses] = useState([]);
  
  // Convert confirmation modal state
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [leadToConvert, setLeadToConvert] = useState<any>(null);
  const [converting, setConverting] = useState(false);
  
  // Success modal state
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [conversionResult, setConversionResult] = useState<any>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    age: '',
    parent_name: '',
    interested_course: '',
    source: 'instagram',
    notes: '',
  });

  useEffect(() => {
    loadLeads();
    loadCourses();
  }, []);

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

  const handleCreateLead = async () => {
    if (!formData.first_name || !formData.last_name || !formData.phone) {
      showAlert('Error', 'Please fill in required fields');
      return;
    }

    try {
      await api.post('/leads', {
        ...formData,
        age: formData.age ? parseInt(formData.age) : null,
      });
      showAlert('Success', 'Lead created successfully');
      setModalVisible(false);
      resetForm();
      loadLeads();
    } catch (error) {
      showAlert('Error', 'Failed to create lead');
    }
  };

  // Show confirmation modal for conversion
  const handleConvertToStudent = (lead: any) => {
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
      loadLeads();
    } catch (error) {
      showAlert('Error', 'Failed to update status');
    }
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      phone: '',
      age: '',
      parent_name: '',
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
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>CRM / Leads</Text>
          <Text style={styles.headerSubtitle}>{leads.length} total leads</Text>
        </View>
        <TouchableOpacity
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
            </View>
            
            {lead.status !== 'enrolled' && lead.status !== 'lost' && (
              <TouchableOpacity
                style={styles.convertButton}
                onPress={() => handleConvertToStudent(lead)}
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
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
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
                <Text style={styles.label}>Phone *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.phone}
                  onChangeText={(text) => setFormData({ ...formData, phone: text })}
                  placeholder="+998901234567"
                  placeholderTextColor={COLORS.textTertiary}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Age</Text>
                <TextInput
                  style={styles.input}
                  value={formData.age}
                  onChangeText={(text) => setFormData({ ...formData, age: text })}
                  placeholder="Enter age"
                  placeholderTextColor={COLORS.textTertiary}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Parent Name</Text>
                <TextInput
                  style={styles.input}
                  value={formData.parent_name}
                  onChangeText={(text) => setFormData({ ...formData, parent_name: text })}
                  placeholder="Enter parent name"
                  placeholderTextColor={COLORS.textTertiary}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Interested Course</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={formData.interested_course}
                    onValueChange={(value) => setFormData({ ...formData, interested_course: value })}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                    dropdownIconColor={COLORS.gold}
                  >
                    <Picker.Item label="Select course" value="" />
                    {courses.map((course: any) => (
                      <Picker.Item key={course.id} label={course.name} value={course.name} />
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
                      <Picker.Item key={source} label={source.replace('_', ' ')} value={source} />
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
              • Student account with auto-generated ID{'\n'}
              • Parent account (if parent name provided)
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
                <Text style={styles.credentialsLabel}>Student Credentials</Text>
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialKey}>Student ID:</Text>
                  <Text style={styles.credentialValue}>{conversionResult.student_id}</Text>
                </View>
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialKey}>Login:</Text>
                  <Text style={styles.credentialValue}>{conversionResult.student_login}</Text>
                </View>
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialKey}>Password:</Text>
                  <Text style={styles.credentialValue}>{conversionResult.student_password}</Text>
                </View>
                
                {conversionResult.parent_login && (
                  <>
                    <Text style={[styles.credentialsLabel, { marginTop: SIZES.md }]}>Parent Credentials</Text>
                    <View style={styles.credentialRow}>
                      <Text style={styles.credentialKey}>Login:</Text>
                      <Text style={styles.credentialValue}>{conversionResult.parent_login}</Text>
                    </View>
                    <View style={styles.credentialRow}>
                      <Text style={styles.credentialKey}>Password:</Text>
                      <Text style={styles.credentialValue}>{conversionResult.parent_password}</Text>
                    </View>
                  </>
                )}
              </View>
            )}
            
            <TouchableOpacity
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
    paddingTop: 60,
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
  modalForm: {
    padding: SIZES.lg,
  },
  formGroup: {
    marginBottom: SIZES.md,
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
    color: COLORS.white,
  },
});
