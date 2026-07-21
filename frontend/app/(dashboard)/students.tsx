import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import { Text, TextInput, LocalizedPickerItem } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from 'expo-router';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';

export default function StudentsScreen() {
  const { user } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('current');
  const [courses, setCourses] = useState([]);
  
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    address: '',
    parent_name: '',
    parent_phone: '',
  });

  useEffect(() => {
    loadCourses();
  }, []);

  const loadStudents = useCallback(async () => {
    try {
      const response = await api.get('/students', {
        params: statusFilter === 'current' ? undefined : { status: statusFilter },
      });
      setStudents(response.data);
    } catch (error) {
      console.error('Error loading students:', error);
      Alert.alert('Error', 'Failed to load students');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  // Dashboard tabs stay mounted. Refresh on every return so newly converted
  // leads and status changes are visible without restarting the app.
  useFocusEffect(
    useCallback(() => {
      loadStudents();
    }, [loadStudents])
  );

  const loadCourses = async () => {
    try {
      const response = await api.get('/courses');
      setCourses(response.data);
    } catch (error) {
      console.error('Error loading courses:', error);
    }
  };

  const handleCreateStudent = async () => {
    if (!formData.first_name || !formData.last_name || !formData.phone) {
      Alert.alert('Error', 'Please fill in required fields');
      return;
    }

    try {
      await api.post('/students', formData);
      Alert.alert('Success', 'Student created successfully');
      setModalVisible(false);
      resetForm();
      loadStudents();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create student');
    }
  };

  const handleUpdateStudent = async () => {
    if (!selectedStudent) return;
    
    try {
      await api.put(`/students/${selectedStudent.id}`, formData);
      Alert.alert('Success', 'Student updated successfully');
      setModalVisible(false);
      setSelectedStudent(null);
      resetForm();
      loadStudents();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update student');
    }
  };

  const archiveStudent = async (student: any) => {
    const previousStudents = students;
    setStudents((currentStudents) =>
      currentStudents.filter((currentStudent) => currentStudent.id !== student.id)
    );

    try {
      await api.delete(`/students/${student.id}`);
      if (selectedStudent?.id === student.id) {
        setModalVisible(false);
        resetForm();
      }
      await loadStudents();
      Alert.alert('Success', 'Student archived successfully');
    } catch (error: any) {
      setStudents(previousStudents);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to archive student');
    }
  };

  const handleArchiveStudent = (student: any) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Archive ${student.first_name} ${student.last_name}? Their login will be disabled, but academic history will be preserved.`
      );
      if (confirmed) {
        archiveStudent(student);
      }
      return;
    }

    Alert.alert(
      'Archive Student',
      `Archive ${student.first_name} ${student.last_name}? Their login will be disabled, but academic history will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => archiveStudent(student),
        },
      ]
    );
  };

  const restoreStudent = async (student: any) => {
    const previousStudents = students;
    setStudents((currentStudents) =>
      currentStudents.filter((currentStudent) => currentStudent.id !== student.id)
    );

    try {
      await api.patch(`/students/${student.id}/restore`);
      if (selectedStudent?.id === student.id) {
        setModalVisible(false);
        resetForm();
      }
      await loadStudents();
      Alert.alert('Success', 'Student and login account restored successfully');
    } catch (error: any) {
      setStudents(previousStudents);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to restore student');
    }
  };

  const handleRestoreStudent = (student: any) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Restore ${student.first_name} ${student.last_name} and reactivate their login?`
      );
      if (confirmed) {
        restoreStudent(student);
      }
      return;
    }

    Alert.alert(
      'Restore Student',
      `Restore ${student.first_name} ${student.last_name} and reactivate their login?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => restoreStudent(student) },
      ]
    );
  };

  const handlePermanentDelete = async (student: any) => {
    if (Platform.OS !== 'web' || user?.role !== 'super_admin') return;

    const confirmation = window.prompt(
      `Permanent deletion cannot be undone. Type ${student.student_id} to continue. Students with historical records cannot be permanently deleted.`
    );
    if (confirmation === null) return;

    try {
      await api.delete(`/students/${student.id}/permanent`, {
        params: { confirmation: confirmation.trim() },
      });
      setStudents((currentStudents) =>
        currentStudents.filter((currentStudent) => currentStudent.id !== student.id)
      );
      Alert.alert('Success', 'Student permanently deleted');
    } catch (error: any) {
      Alert.alert('Deletion blocked', error.response?.data?.detail || 'Failed to permanently delete student');
    }
  };

  const openEditModal = (student: any) => {
    setSelectedStudent(student);
    setFormData({
      first_name: student.first_name,
      last_name: student.last_name,
      phone: student.phone || '',
      email: student.email || '',
      address: student.address || '',
      parent_name: '',
      parent_phone: '',
    });
    setModalVisible(true);
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      address: '',
      parent_name: '',
      parent_phone: '',
    });
    setSelectedStudent(null);
  };

  const filteredStudents = students.filter((student: any) =>
    `${student.first_name} ${student.last_name} ${student.student_id}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return COLORS.success;
      case 'frozen': return COLORS.info;
      case 'graduated': return COLORS.gold;
      case 'archived': return COLORS.textTertiary;
      default: return COLORS.textSecondary;
    }
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
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Students</Text>
          <Text style={styles.headerSubtitle}>
            {students.length} {statusFilter === 'current' ? 'current' : statusFilter} students
          </Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search students..."
          placeholderTextColor={COLORS.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.filterContainer}>
        <Picker
          selectedValue={statusFilter}
          onValueChange={(value) => setStatusFilter(String(value))}
          style={styles.filterPicker}
          dropdownIconColor={COLORS.gold}
        >
          <LocalizedPickerItem label="Current students" value="current" />
          <LocalizedPickerItem label="Active" value="active" />
          <LocalizedPickerItem label="Frozen" value="frozen" />
          <LocalizedPickerItem label="Graduated" value="graduated" />
          <LocalizedPickerItem label="Archived" value="archived" />
        </Picker>
      </View>

      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStudents(); }} tintColor={COLORS.gold} />
        }
      >
        {filteredStudents.map((student: any) => (
          <TouchableOpacity
            key={student.id}
            style={styles.studentCard}
            onPress={() => openEditModal(student)}
          >
            <View style={styles.studentHeader}>
              <View style={styles.studentAvatar}>
                <Text style={styles.studentAvatarText}>
                  {student.first_name[0]}{student.last_name[0]}
                </Text>
              </View>
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>
                  {student.first_name} {student.last_name}
                </Text>
                <Text style={styles.studentId}>{student.student_id}</Text>
                <View style={styles.studentMeta}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(student.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(student.status) }]}>
                      {student.status}
                    </Text>
                  </View>
                </View>
              </View>
              {student.status !== 'archived' && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleArchiveStudent(student);
                  }}
                >
                  <Ionicons name="archive-outline" size={20} color={COLORS.error} />
                </TouchableOpacity>
              )}
              {student.status === 'archived' && (
                <View style={styles.archivedActions}>
                  <TouchableOpacity
                    style={styles.restoreButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleRestoreStudent(student);
                    }}
                  >
                    <Ionicons name="refresh-outline" size={21} color={COLORS.success} />
                  </TouchableOpacity>
                  {Platform.OS === 'web' && user?.role === 'super_admin' && (
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handlePermanentDelete(student);
                      }}
                    >
                      <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { setModalVisible(false); resetForm(); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Student</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
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
                placeholder="student@example.com"
                keyboardType="email-address"
              />

              <Input
                label="Address"
                value={formData.address}
                onChangeText={(text) => setFormData({ ...formData, address: text })}
                placeholder="Enter address"
                multiline
              />

              <Button
                title="Update Student"
                onPress={handleUpdateStudent}
                style={{ marginTop: SIZES.md }}
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
  filterContainer: {
    backgroundColor: COLORS.backgroundCard,
    marginHorizontal: SIZES.md,
    marginBottom: SIZES.md,
    borderRadius: SIZES.radiusMd,
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  filterPicker: {
    color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundCard,
  },
  list: {
    flex: 1,
    paddingHorizontal: SIZES.md,
  },
  studentCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.md,
    ...SHADOWS.small,
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SIZES.md,
  },
  studentAvatarText: {
    fontSize: SIZES.fontLg,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  studentId: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginTop: SIZES.xs,
  },
  studentMeta: {
    flexDirection: 'row',
    marginTop: SIZES.xs,
  },
  statusBadge: {
    paddingHorizontal: SIZES.sm,
    paddingVertical: 4,
    borderRadius: SIZES.radiusSm,
  },
  statusText: {
    fontSize: SIZES.fontXs,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  deleteButton: {
    padding: SIZES.sm,
  },
  restoreButton: {
    padding: SIZES.sm,
  },
  archivedActions: {
    flexDirection: 'row',
    alignItems: 'center',
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
});
