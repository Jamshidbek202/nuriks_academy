import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';

export default function StudentsScreen() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
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
    loadStudents();
    loadCourses();
  }, []);

  const loadStudents = async () => {
    try {
      const response = await api.get('/students');
      setStudents(response.data);
    } catch (error) {
      console.error('Error loading students:', error);
      Alert.alert('Error', 'Failed to load students');
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

  const handleDeleteStudent = (student: any) => {
    Alert.alert(
      'Delete Student',
      `Are you sure you want to archive ${student.first_name} ${student.last_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/students/${student.id}`);
              Alert.alert('Success', 'Student archived successfully');
              loadStudents();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete student');
            }
          },
        },
      ]
    );
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
          <Text style={styles.headerSubtitle}>{students.length} total students</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => { resetForm(); setModalVisible(true); }}
        >
          <Ionicons name="add" size={24} color={COLORS.marbleDark} />
        </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleDeleteStudent(student);
                }}
              >
                <Ionicons name="trash-outline" size={20} color={COLORS.error} />
              </TouchableOpacity>
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
              <Text style={styles.modalTitle}>{selectedStudent ? 'Edit Student' : 'Add New Student'}</Text>
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

              {!selectedStudent && (
                <>
                  <Input
                    label="Parent Name"
                    value={formData.parent_name}
                    onChangeText={(text) => setFormData({ ...formData, parent_name: text })}
                    placeholder="Enter parent name"
                  />

                  <Input
                    label="Parent Phone"
                    value={formData.parent_phone}
                    onChangeText={(text) => setFormData({ ...formData, parent_phone: text })}
                    placeholder="+998901234567"
                    keyboardType="phone-pad"
                  />
                </>
              )}

              <Button
                title={selectedStudent ? 'Update Student' : 'Create Student'}
                onPress={selectedStudent ? handleUpdateStudent : handleCreateStudent}
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