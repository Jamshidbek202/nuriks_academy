import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import { Text, TextInput } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import * as Clipboard from 'expo-clipboard';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';

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

// Cross-platform confirm helper
const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    const { Alert } = require('react-native');
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: onConfirm, style: 'destructive' }
    ]);
  }
};

interface SupportStaff {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  is_active?: boolean;
  login?: string;
  last_login?: string;
}

export default function SupportStaffManagementScreen() {
  const { user } = useAuth();
  const [staffList, setStaffList] = useState<SupportStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [credentialModalVisible, setCredentialModalVisible] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<SupportStaff | null>(null);
  const [credentials, setCredentials] = useState<{ login: string; password: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
  });

  const loadStaff = async () => {
    try {
      const response = await api.get('/support-staff', {
        params: { include_inactive: showInactive }
      });
      setStaffList(response.data);
    } catch (error: any) {
      console.error('Error loading support staff:', error);
      showAlert('Error', error.response?.data?.detail || 'Failed to load support staff');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useLiveRefresh(loadStaff, user?.role === 'super_admin', String(showInactive));

  const handleCreateStaff = async () => {
    if (!formData.first_name || !formData.last_name || !formData.phone) {
      showAlert('Error', 'Please fill in required fields (Name & Phone)');
      return;
    }

    setActionLoading(true);
    try {
      const response = await api.post('/support-staff', formData);
      setModalVisible(false);
      resetForm();
      
      // Show credentials modal
      if (response.data.credentials) {
        setCredentials(response.data.credentials);
        setCredentialModalVisible(true);
      }
      
      loadStaff();
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to create support staff');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStaff = async () => {
    if (!selectedStaff) return;

    setActionLoading(true);
    try {
      await api.put(`/support-staff/${selectedStaff.id}`, formData);
      showAlert('Success', 'Support staff updated successfully');
      setModalVisible(false);
      setSelectedStaff(null);
      setIsEditing(false);
      resetForm();
      loadStaff();
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to update support staff');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeactivate = (staff: SupportStaff) => {
    showConfirm(
      'Deactivate Support Staff',
      `Are you sure you want to deactivate ${staff.first_name} ${staff.last_name}?\n\nThey will no longer be able to log in.`,
      async () => {
        setActionLoading(true);
        try {
          await api.patch(`/support-staff/${staff.id}/deactivate`);
          showAlert('Success', 'Support staff deactivated');
          setDetailModalVisible(false);
          loadStaff();
        } catch (error: any) {
          showAlert('Error', error.response?.data?.detail || 'Failed to deactivate');
        } finally {
          setActionLoading(false);
        }
      }
    );
  };

  const handleReactivate = (staff: SupportStaff) => {
    showConfirm(
      'Reactivate Support Staff',
      `Reactivate ${staff.first_name} ${staff.last_name}?`,
      async () => {
        setActionLoading(true);
        try {
          await api.patch(`/support-staff/${staff.id}/reactivate`);
          showAlert('Success', 'Support staff reactivated');
          setDetailModalVisible(false);
          loadStaff();
        } catch (error: any) {
          showAlert('Error', error.response?.data?.detail || 'Failed to reactivate');
        } finally {
          setActionLoading(false);
        }
      }
    );
  };

  const handleResetPassword = (staff: SupportStaff) => {
    showConfirm(
      'Reset Password',
      `Reset password for ${staff.first_name} ${staff.last_name}?\n\nA new password will be generated.`,
      async () => {
        setActionLoading(true);
        try {
          const response = await api.post(`/support-staff/${staff.id}/reset-password`);
          setDetailModalVisible(false);
          setCredentials({
            login: response.data.login,
            password: response.data.new_password
          });
          setCredentialModalVisible(true);
        } catch (error: any) {
          showAlert('Error', error.response?.data?.detail || 'Failed to reset password');
        } finally {
          setActionLoading(false);
        }
      }
    );
  };

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    showAlert('Copied', 'Copied to clipboard');
  };

  const openEditModal = (staff: SupportStaff) => {
    setSelectedStaff(staff);
    setIsEditing(true);
    setFormData({
      first_name: staff.first_name,
      last_name: staff.last_name,
      phone: staff.phone || '',
      email: staff.email || '',
    });
    setDetailModalVisible(false);
    setModalVisible(true);
  };

  const openDetailModal = (staff: SupportStaff) => {
    setSelectedStaff(staff);
    setDetailModalVisible(true);
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
    });
    setSelectedStaff(null);
    setIsEditing(false);
  };

  const filteredStaff = staffList.filter(staff => {
    const fullName = `${staff.first_name} ${staff.last_name}`.toLowerCase();
    const phone = staff.phone?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || phone.includes(query);
  });

  // Check permissions
  if (!user || !['super_admin', 'manager'].includes(user.role)) {
    return (
      <View style={styles.noAccessContainer}>
        <Ionicons name="lock-closed" size={60} color={COLORS.textTertiary} />
        <Text style={styles.noAccessText}>Access Denied</Text>
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Support Staff</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            resetForm();
            setModalVisible(true);
          }}
        >
          <Ionicons name="add" size={24} color={COLORS.marbleDark} />
        </TouchableOpacity>
      </View>

      {/* Search & Filter */}
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={20} color={COLORS.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or phone..."
            placeholderTextColor={COLORS.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity
          style={[styles.filterButton, showInactive && styles.filterButtonActive]}
          onPress={() => setShowInactive(!showInactive)}
        >
          <Text style={[styles.filterButtonText, showInactive && styles.filterButtonTextActive]}>
            {showInactive ? 'Showing All' : 'Active Only'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Staff List */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadStaff();
            }}
            tintColor={COLORS.gold}
          />
        }
      >
        {filteredStaff.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={60} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>No support staff found</Text>
          </View>
        ) : (
          filteredStaff.map((staff) => (
            <TouchableOpacity
              key={staff.id}
              style={[styles.staffCard, !staff.is_active && styles.staffCardInactive]}
              onPress={() => openDetailModal(staff)}
            >
              <View style={styles.avatarContainer}>
                <View style={[styles.avatar, !staff.is_active && styles.avatarInactive]}>
                  <Ionicons name="headset" size={24} color={staff.is_active ? COLORS.gold : COLORS.textTertiary} />
                </View>
                {staff.is_active !== false && (
                  <View style={styles.onlineIndicator} />
                )}
              </View>
              
              <View style={styles.staffInfo}>
                <Text style={styles.staffName}>
                  {staff.first_name} {staff.last_name}
                </Text>
                <Text style={styles.staffPhone}>{staff.phone}</Text>
                {staff.login && (
                  <Text style={styles.staffLogin}>Login: {staff.login}</Text>
                )}
              </View>
              
              <View style={styles.staffStatus}>
                <View style={[styles.statusBadge, staff.is_active !== false ? styles.activeBadge : styles.inactiveBadge]}>
                  <Text style={[styles.statusText, staff.is_active !== false ? styles.activeText : styles.inactiveText]}>
                    {staff.is_active !== false ? 'Active' : 'Inactive'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Create/Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setModalVisible(false);
          resetForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isEditing ? 'Edit Support Staff' : 'Add Support Staff'}
              </Text>
              <TouchableOpacity onPress={() => {
                setModalVisible(false);
                resetForm();
              }}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>First Name *</Text>
              <TextInput
                style={styles.input}
                value={formData.first_name}
                onChangeText={(text) => setFormData({ ...formData, first_name: text })}
                placeholder="Enter first name"
                placeholderTextColor={COLORS.textTertiary}
              />

              <Text style={styles.inputLabel}>Last Name *</Text>
              <TextInput
                style={styles.input}
                value={formData.last_name}
                onChangeText={(text) => setFormData({ ...formData, last_name: text })}
                placeholder="Enter last name"
                placeholderTextColor={COLORS.textTertiary}
              />

              <Text style={styles.inputLabel}>Phone *</Text>
              <TextInput
                style={styles.input}
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                placeholder="+998901234567"
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                placeholder="email@example.com"
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[styles.submitButton, actionLoading && styles.buttonDisabled]}
                onPress={isEditing ? handleUpdateStaff : handleCreateStaff}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={COLORS.marbleDark} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {isEditing ? 'Update' : 'Create Staff'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Detail Modal */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Support Staff Details</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedStaff && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailSection}>
                  <View style={styles.detailAvatarContainer}>
                    <View style={[styles.detailAvatar, selectedStaff.is_active === false && styles.avatarInactive]}>
                      <Ionicons name="headset" size={40} color={selectedStaff.is_active !== false ? COLORS.gold : COLORS.textTertiary} />
                    </View>
                    <View style={[styles.statusBadgeLarge, selectedStaff.is_active !== false ? styles.activeBadge : styles.inactiveBadge]}>
                      <Text style={[styles.statusTextLarge, selectedStaff.is_active !== false ? styles.activeText : styles.inactiveText]}>
                        {selectedStaff.is_active !== false ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>
                  
                  <Text style={styles.detailName}>
                    {selectedStaff.first_name} {selectedStaff.last_name}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="call" size={20} color={COLORS.gold} />
                  <Text style={styles.detailText}>{selectedStaff.phone}</Text>
                </View>

                {selectedStaff.email && (
                  <View style={styles.detailRow}>
                    <Ionicons name="mail" size={20} color={COLORS.gold} />
                    <Text style={styles.detailText}>{selectedStaff.email}</Text>
                  </View>
                )}

                {selectedStaff.login && (
                  <View style={styles.detailRow}>
                    <Ionicons name="person" size={20} color={COLORS.gold} />
                    <Text style={styles.detailText}>Login: {selectedStaff.login}</Text>
                  </View>
                )}

                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => openEditModal(selectedStaff)}
                  >
                    <Ionicons name="create" size={20} color={COLORS.info} />
                    <Text style={[styles.actionButtonText, { color: COLORS.info }]}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleResetPassword(selectedStaff)}
                    disabled={actionLoading}
                  >
                    <Ionicons name="key" size={20} color={COLORS.warning} />
                    <Text style={[styles.actionButtonText, { color: COLORS.warning }]}>Reset Password</Text>
                  </TouchableOpacity>

                  {selectedStaff.is_active !== false ? (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleDeactivate(selectedStaff)}
                      disabled={actionLoading}
                    >
                      <Ionicons name="close-circle" size={20} color={COLORS.error} />
                      <Text style={[styles.actionButtonText, { color: COLORS.error }]}>Deactivate</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleReactivate(selectedStaff)}
                      disabled={actionLoading}
                    >
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                      <Text style={[styles.actionButtonText, { color: COLORS.success }]}>Reactivate</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Credentials Modal */}
      <Modal
        visible={credentialModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setCredentialModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.credentialModal}>
            <View style={styles.credentialHeader}>
              <Ionicons name="checkmark-circle" size={50} color={COLORS.success} />
              <Text style={styles.credentialTitle}>Credentials Generated</Text>
            </View>

            {credentials && (
              <View style={styles.credentialBox}>
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Login:</Text>
                  <Text style={styles.credentialValue}>{credentials.login}</Text>
                  <TouchableOpacity onPress={() => copyToClipboard(credentials.login)}>
                    <Ionicons name="copy" size={20} color={COLORS.gold} />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Password:</Text>
                  <Text style={styles.credentialValue}>{credentials.password}</Text>
                  <TouchableOpacity onPress={() => copyToClipboard(credentials.password)}>
                    <Ionicons name="copy" size={20} color={COLORS.gold} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={styles.credentialNote}>
              Please save these credentials securely. The password cannot be recovered later.
            </Text>

            <TouchableOpacity
              style={styles.credentialButton}
              onPress={() => {
                setCredentialModalVisible(false);
                setCredentials(null);
              }}
            >
              <Text style={styles.credentialButtonText}>Done</Text>
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
  noAccessContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  noAccessText: {
    fontSize: SIZES.fontLg,
    color: COLORS.textSecondary,
    marginTop: SIZES.md,
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
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    gap: SIZES.sm,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: SIZES.md,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SIZES.sm,
    paddingHorizontal: SIZES.sm,
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
  },
  filterButton: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusMd,
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
  },
  filterButtonActive: {
    backgroundColor: COLORS.gold + '30',
    borderColor: COLORS.gold,
  },
  filterButtonText: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
  },
  filterButtonTextActive: {
    color: COLORS.gold,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: SIZES.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SIZES.xl * 2,
  },
  emptyText: {
    fontSize: SIZES.fontMd,
    color: COLORS.textSecondary,
    marginTop: SIZES.md,
  },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.sm,
    ...SHADOWS.small,
  },
  staffCardInactive: {
    opacity: 0.7,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: SIZES.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.gold + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInactive: {
    backgroundColor: COLORS.marbleGray,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.success,
    borderWidth: 2,
    borderColor: COLORS.backgroundCard,
  },
  staffInfo: {
    flex: 1,
  },
  staffName: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  staffPhone: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  staffLogin: {
    fontSize: SIZES.fontXs,
    color: COLORS.textTertiary,
    marginTop: 2,
  },
  staffStatus: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: SIZES.sm,
    paddingVertical: 2,
    borderRadius: SIZES.radiusSm,
    marginBottom: SIZES.xs,
  },
  statusBadgeLarge: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.xs,
    borderRadius: SIZES.radiusFull,
  },
  activeBadge: {
    backgroundColor: COLORS.success + '20',
  },
  inactiveBadge: {
    backgroundColor: COLORS.error + '20',
  },
  statusText: {
    fontSize: SIZES.fontXs,
    fontWeight: '600',
  },
  statusTextLarge: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
  },
  activeText: {
    color: COLORS.success,
  },
  inactiveText: {
    color: COLORS.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.backgroundCard,
    borderTopLeftRadius: SIZES.radiusLg,
    borderTopRightRadius: SIZES.radiusLg,
    maxHeight: '90%',
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
  modalBody: {
    padding: SIZES.lg,
  },
  inputLabel: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SIZES.xs,
    marginTop: SIZES.md,
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
  submitButton: {
    backgroundColor: COLORS.gold,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    alignItems: 'center',
    marginTop: SIZES.xl,
    marginBottom: SIZES.lg,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: SIZES.fontMd,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
  detailSection: {
    alignItems: 'center',
    marginBottom: SIZES.lg,
  },
  detailAvatarContainer: {
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  detailAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.gold + '30',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  detailName: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.marbleGray,
    gap: SIZES.md,
  },
  detailText: {
    fontSize: SIZES.fontMd,
    color: COLORS.textSecondary,
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginTop: SIZES.xl,
    gap: SIZES.md,
  },
  actionButton: {
    alignItems: 'center',
    padding: SIZES.md,
    minWidth: 100,
  },
  actionButtonText: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    marginTop: SIZES.xs,
  },
  credentialModal: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusLg,
    margin: SIZES.lg,
    padding: SIZES.xl,
    alignItems: 'center',
  },
  credentialHeader: {
    alignItems: 'center',
    marginBottom: SIZES.lg,
  },
  credentialTitle: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: SIZES.md,
  },
  credentialBox: {
    backgroundColor: COLORS.backgroundLight,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.lg,
    width: '100%',
    marginBottom: SIZES.md,
  },
  credentialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.sm,
    gap: SIZES.sm,
  },
  credentialLabel: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    width: 80,
  },
  credentialValue: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
  },
  credentialNote: {
    fontSize: SIZES.fontSm,
    color: COLORS.textTertiary,
    textAlign: 'center',
    marginBottom: SIZES.lg,
  },
  credentialButton: {
    backgroundColor: COLORS.gold,
    borderRadius: SIZES.radiusMd,
    paddingVertical: SIZES.md,
    paddingHorizontal: SIZES.xl * 2,
  },
  credentialButtonText: {
    fontSize: SIZES.fontMd,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
});
