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
import { Picker } from '@react-native-picker/picker';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
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

interface Teacher {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  photo?: string;
  specialization: string[];
  courses: string[];
  group_ids: string[];
  branch_id?: string;
  is_active?: boolean;
  login?: string;
}

interface Course {
  id: string;
  name: string;
}

interface Group {
  id: string;
  name: string;
  teacher_id: string;
}

export default function TeachersScreen() {
  const { user } = useAuth();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [credentialModalVisible, setCredentialModalVisible] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [credentials, setCredentials] = useState<{ login: string; password: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    specialization: [] as string[],
    courses: [] as string[],
  });

  const loadTeachers = async () => {
    try {
      const response = await api.get('/teachers');
      // Fetch status for each teacher
      const teachersWithStatus = await Promise.all(
        response.data.map(async (teacher: Teacher) => {
          try {
            const statusRes = await api.get(`/teachers/${teacher.id}/status`);
            return { ...teacher, is_active: statusRes.data.is_active, login: statusRes.data.login };
          } catch {
            return teacher;
          }
        })
      );
      setTeachers(teachersWithStatus);
    } catch (error) {
      console.error('Error loading teachers:', error);
      showAlert('Error', 'Failed to load teachers');
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

  const loadGroups = async () => {
    try {
      const response = await api.get('/groups');
      setGroups(response.data);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  useLiveRefresh(
    () => Promise.all([loadTeachers(), loadCourses(), loadGroups()]).then(() => undefined),
    ['super_admin', 'manager'].includes(user?.role || ''),
    user?.role || '',
  );

  const handleCreateTeacher = async () => {
    if (!formData.first_name || !formData.last_name || !formData.phone) {
      showAlert('Error', 'Please fill in required fields (Name & Phone)');
      return;
    }

    setActionLoading(true);
    try {
      await api.post('/teachers', formData);
      setModalVisible(false);
      resetForm();
      
      // Show credentials
      setCredentials({
        login: `teacher_${formData.phone}`,
        password: 'Teacher@2025'
      });
      setCredentialModalVisible(true);
      
      loadTeachers();
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to create teacher');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateTeacher = async () => {
    if (!selectedTeacher) return;

    setActionLoading(true);
    try {
      await api.put(`/teachers/${selectedTeacher.id}`, formData);
      showAlert('Success', 'Teacher updated successfully');
      setModalVisible(false);
      setSelectedTeacher(null);
      setIsEditing(false);
      resetForm();
      loadTeachers();
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to update teacher');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeactivateTeacher = (teacher: Teacher) => {
    showConfirm(
      'Deactivate Teacher',
      `Are you sure you want to deactivate ${teacher.first_name} ${teacher.last_name}?\n\nThey will no longer be able to log in.`,
      async () => {
        setActionLoading(true);
        try {
          await api.patch(`/teachers/${teacher.id}/deactivate`);
          showAlert('Success', 'Teacher deactivated');
          setDetailModalVisible(false);
          loadTeachers();
        } catch (error: any) {
          showAlert('Error', error.response?.data?.detail || 'Failed to deactivate');
        } finally {
          setActionLoading(false);
        }
      }
    );
  };

  const handleReactivateTeacher = (teacher: Teacher) => {
    showConfirm(
      'Reactivate Teacher',
      `Reactivate ${teacher.first_name} ${teacher.last_name}?`,
      async () => {
        setActionLoading(true);
        try {
          await api.patch(`/teachers/${teacher.id}/reactivate`);
          showAlert('Success', 'Teacher reactivated');
          setDetailModalVisible(false);
          loadTeachers();
        } catch (error: any) {
          showAlert('Error', error.response?.data?.detail || 'Failed to reactivate');
        } finally {
          setActionLoading(false);
        }
      }
    );
  };

  const handleResetPassword = (teacher: Teacher) => {
    showConfirm(
      'Reset Password',
      `Reset password for ${teacher.first_name} ${teacher.last_name}?\n\nA new password will be generated.`,
      async () => {
        setActionLoading(true);
        try {
          const response = await api.post(`/teachers/${teacher.id}/reset-password`);
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

  const openEditModal = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setIsEditing(true);
    setFormData({
      first_name: teacher.first_name,
      last_name: teacher.last_name,
      phone: teacher.phone || '',
      email: teacher.email || '',
      specialization: teacher.specialization || [],
      courses: teacher.courses || [],
    });
    setDetailModalVisible(false);
    setModalVisible(true);
  };

  const openDetailModal = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setDetailModalVisible(true);
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      specialization: [],
      courses: [],
    });
    setSelectedTeacher(null);
    setIsEditing(false);
  };

  const toggleCourse = (courseName: string) => {
    setFormData((prev) => ({
      ...prev,
      courses: prev.courses.includes(courseName)
        ? prev.courses.filter((c) => c !== courseName)
        : [...prev.courses, courseName],
    }));
  };

  const getTeacherGroups = (teacherId: string) => {
    return groups.filter((g) => g.teacher_id === teacherId);
  };

  const filteredTeachers = teachers.filter((teacher) =>
    `${teacher.first_name} ${teacher.last_name} ${teacher.phone}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

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
          <Text style={styles.headerTitle}>Teachers</Text>
          <Text style={styles.headerSubtitle}>{teachers.length} total teachers</Text>
        </View>
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

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search teachers..."
          placeholderTextColor={COLORS.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Teachers List */}
      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadTeachers();
            }}
            tintColor={COLORS.gold}
          />
        }
      >
        {filteredTeachers.map((teacher) => {
          const teacherGroups = getTeacherGroups(teacher.id);
          return (
            <TouchableOpacity
              key={teacher.id}
              style={styles.teacherCard}
              onPress={() => openDetailModal(teacher)}
            >
              <View style={styles.teacherHeader}>
                <View style={styles.teacherAvatar}>
                  <Text style={styles.teacherAvatarText}>
                    {teacher.first_name[0]}
                    {teacher.last_name[0]}
                  </Text>
                </View>
                <View style={styles.teacherInfo}>
                  <Text style={styles.teacherName}>
                    {teacher.first_name} {teacher.last_name}
                  </Text>
                  <Text style={styles.teacherPhone}>
                    <Ionicons name="call-outline" size={12} color={COLORS.textTertiary} />{' '}
                    {teacher.phone}
                  </Text>
                  <View style={styles.teacherMeta}>
                    <View style={styles.metaBadge}>
                      <Ionicons name="people" size={12} color={COLORS.gold} />
                      <Text style={styles.metaText}>{teacherGroups.length} Groups</Text>
                    </View>
                    <View style={styles.metaBadge}>
                      <Ionicons name="book" size={12} color={COLORS.info} />
                      <Text style={styles.metaText}>{teacher.courses?.length || 0} Courses</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.statusIndicator}>
                  <View style={[styles.statusDot, { backgroundColor: COLORS.success }]} />
                  <Text style={styles.statusLabel}>Active</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {filteredTeachers.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="school-outline" size={64} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>No teachers found</Text>
          </View>
        )}
      </ScrollView>

      {/* Teacher Detail Modal */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Teacher Details</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedTeacher && (
              <ScrollView style={styles.detailContent}>
                <View style={styles.detailAvatar}>
                  <Text style={styles.detailAvatarText}>
                    {selectedTeacher.first_name[0]}
                    {selectedTeacher.last_name[0]}
                  </Text>
                </View>

                <Text style={styles.detailName}>
                  {selectedTeacher.first_name} {selectedTeacher.last_name}
                </Text>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Contact Information</Text>
                  <View style={styles.detailRow}>
                    <Ionicons name="call" size={18} color={COLORS.gold} />
                    <Text style={styles.detailValue}>{selectedTeacher.phone}</Text>
                  </View>
                  {selectedTeacher.email && (
                    <View style={styles.detailRow}>
                      <Ionicons name="mail" size={18} color={COLORS.gold} />
                      <Text style={styles.detailValue}>{selectedTeacher.email}</Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Ionicons name="log-in" size={18} color={COLORS.gold} />
                    <Text style={styles.detailValue}>Login: teacher_{selectedTeacher.phone}</Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Assigned Courses</Text>
                  <View style={styles.tagContainer}>
                    {selectedTeacher.courses?.length > 0 ? (
                      selectedTeacher.courses.map((course, idx) => (
                        <View key={idx} style={styles.tag}>
                          <Text style={styles.tagText}>{course}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.noDataText}>No courses assigned</Text>
                    )}
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Assigned Groups</Text>
                  <View style={styles.tagContainer}>
                    {getTeacherGroups(selectedTeacher.id).length > 0 ? (
                      getTeacherGroups(selectedTeacher.id).map((group) => (
                        <View key={group.id} style={[styles.tag, { backgroundColor: COLORS.info + '20' }]}>
                          <Text style={[styles.tagText, { color: COLORS.info }]}>{group.name}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.noDataText}>No groups assigned</Text>
                    )}
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={[styles.statusBadgeLarge, { backgroundColor: (selectedTeacher.is_active !== false ? COLORS.success : COLORS.error) + '20' }]}>
                    <View style={[styles.statusDotLarge, { backgroundColor: selectedTeacher.is_active !== false ? COLORS.success : COLORS.error }]} />
                    <Text style={[styles.statusTextLarge, { color: selectedTeacher.is_active !== false ? COLORS.success : COLORS.error }]}>
                      {selectedTeacher.is_active !== false ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => openEditModal(selectedTeacher)}
                  >
                    <Ionicons name="create" size={24} color={COLORS.info} />
                    <Text style={[styles.actionButtonText, { color: COLORS.info }]}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleResetPassword(selectedTeacher)}
                    disabled={actionLoading}
                  >
                    <Ionicons name="key" size={24} color={COLORS.warning} />
                    <Text style={[styles.actionButtonText, { color: COLORS.warning }]}>Reset Password</Text>
                  </TouchableOpacity>

                  {selectedTeacher.is_active !== false ? (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleDeactivateTeacher(selectedTeacher)}
                      disabled={actionLoading}
                    >
                      <Ionicons name="close-circle" size={24} color={COLORS.error} />
                      <Text style={[styles.actionButtonText, { color: COLORS.error }]}>Deactivate</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleReactivateTeacher(selectedTeacher)}
                      disabled={actionLoading}
                    >
                      <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
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
        <View style={styles.credentialModalOverlay}>
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

      {/* Create/Edit Teacher Modal */}
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
              <Text style={styles.modalTitle}>{isEditing ? 'Edit Teacher' : 'Add New Teacher'}</Text>
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  resetForm();
                }}
              >
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Input
                label="First Name *"
                value={formData.first_name}
                onChangeText={(text) => setFormData({ ...formData, first_name: text })}
                placeholder="Enter first name"
              />

              <Input
                label="Last Name *"
                value={formData.last_name}
                onChangeText={(text) => setFormData({ ...formData, last_name: text })}
                placeholder="Enter last name"
              />

              <Input
                label="Phone *"
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                placeholder="+998901234567"
                keyboardType="phone-pad"
              />

              <Input
                label="Email"
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                placeholder="teacher@nuriksacademy.uz"
                keyboardType="email-address"
              />

              <Text style={styles.sectionLabel}>Assigned Courses</Text>
              <View style={styles.courseSelection}>
                {courses.map((course) => (
                  <TouchableOpacity
                    key={course.id}
                    style={[
                      styles.courseChip,
                      formData.courses.includes(course.name) && styles.courseChipSelected,
                    ]}
                    onPress={() => toggleCourse(course.name)}
                  >
                    <Text
                      style={[
                        styles.courseChipText,
                        formData.courses.includes(course.name) && styles.courseChipTextSelected,
                      ]}
                    >
                      {course.name}
                    </Text>
                    {formData.courses.includes(course.name) && (
                      <Ionicons name="checkmark-circle" size={16} color={COLORS.marbleDark} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <Button
                title={isEditing ? 'Update Teacher' : 'Create Teacher'}
                onPress={isEditing ? handleUpdateTeacher : handleCreateTeacher}
                style={{ marginTop: SIZES.lg }}
              />
            </ScrollView>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundCard,
    margin: SIZES.md,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: SIZES.md,
    ...SHADOWS.small,
  },
  searchIcon: {
    marginRight: SIZES.sm,
  },
  searchInput: {
    flex: 1,
    padding: SIZES.md,
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
  },
  list: {
    flex: 1,
    paddingHorizontal: SIZES.md,
  },
  teacherCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.md,
    ...SHADOWS.small,
  },
  teacherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teacherAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SIZES.md,
  },
  teacherAvatarText: {
    fontSize: SIZES.fontLg,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
  teacherInfo: {
    flex: 1,
  },
  teacherName: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  teacherPhone: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginTop: SIZES.xs,
  },
  teacherMeta: {
    flexDirection: 'row',
    marginTop: SIZES.sm,
    gap: SIZES.sm,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    paddingHorizontal: SIZES.sm,
    paddingVertical: 4,
    borderRadius: SIZES.radiusSm,
    gap: 4,
  },
  metaText: {
    fontSize: SIZES.fontXs,
    color: COLORS.textSecondary,
  },
  statusIndicator: {
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 4,
  },
  statusLabel: {
    fontSize: SIZES.fontXs,
    color: COLORS.textTertiary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SIZES.xxl,
  },
  emptyText: {
    fontSize: SIZES.fontMd,
    color: COLORS.textTertiary,
    marginTop: SIZES.md,
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
  detailContent: {
    padding: SIZES.lg,
  },
  detailAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: SIZES.md,
  },
  detailAvatarText: {
    fontSize: SIZES.fontXxl,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
  detailName: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: SIZES.lg,
  },
  detailSection: {
    marginBottom: SIZES.lg,
  },
  detailLabel: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SIZES.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    padding: SIZES.md,
    borderRadius: SIZES.radiusMd,
    marginBottom: SIZES.sm,
    gap: SIZES.sm,
  },
  detailValue: {
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.sm,
  },
  tag: {
    backgroundColor: COLORS.gold + '20',
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusSm,
  },
  tagText: {
    fontSize: SIZES.fontSm,
    color: COLORS.gold,
    fontWeight: '500',
  },
  noDataText: {
    fontSize: SIZES.fontSm,
    color: COLORS.textTertiary,
    fontStyle: 'italic',
  },
  statusBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusMd,
    gap: SIZES.sm,
  },
  statusDotLarge: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusTextLarge: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SIZES.sm,
    marginTop: SIZES.sm,
  },
  courseSelection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.sm,
    marginBottom: SIZES.md,
  },
  courseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
    gap: SIZES.xs,
  },
  courseChipSelected: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  courseChipText: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
  },
  courseChipTextSelected: {
    color: COLORS.marbleDark,
    fontWeight: '600',
  },
  // Action buttons row
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SIZES.xl,
    paddingTop: SIZES.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.marbleGray,
  },
  actionButton: {
    alignItems: 'center',
    padding: SIZES.md,
  },
  actionButtonText: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    marginTop: SIZES.xs,
  },
  // Credential modal styles
  credentialModalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SIZES.lg,
  },
  credentialModal: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...SHADOWS.large,
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
