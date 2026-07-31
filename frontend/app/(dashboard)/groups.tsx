import { getActiveLocale } from '../../src/i18n/translations';
import React, { useState, useEffect, useRef } from 'react';
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
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';
import { CalendarDatePicker } from '../../src/components/CalendarDatePicker';

interface Schedule {
  day: string;
  start_time: string;
  end_time: string;
  room?: string;
}

interface Group {
  id: string;
  name: string;
  course_id: string;
  teacher_id: string;
  teacher_name?: string;
  student_ids: string[];
  schedule: Schedule[];
  start_date?: string;
  end_date?: string;
  status: string;
  branch_id?: string;
  level?: string;
  program_code?: ProgramCode;
  group_format?: GroupFormat;
  finance_setup_status?: string;
  finance_occurrence_refresh_status?: string;
  finance_occurrence_refresh_error?: string;
}

type ProgramCode = 'general' | 'pre_ielts' | 'ielts';
type GroupFormat = 'normal' | 'mini' | 'individual';

interface PricingPolicy {
  policy_key: string;
  effective_from: string;
  value: {
    monthly_price_uzs?: number;
    basis_points?: number;
  };
}

interface Teacher {
  id: string;
  first_name: string;
  last_name: string;
}

interface Course {
  id: string;
  name: string;
  levels: string[];
  program_code?: ProgramCode | null;
}

interface Student {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  group_ids: string[];
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const tashkentDate = () => {
  const parts = new Intl.DateTimeFormat(getActiveLocale(), {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const formatUzs = (amount?: number) =>
  amount == null ? 'Not configured' : `${new Intl.NumberFormat(getActiveLocale()).format(amount)} UZS`;

const PROGRAM_LABELS: Record<ProgramCode, string> = {
  general: 'General English',
  pre_ielts: 'Pre-IELTS',
  ielts: 'IELTS',
};

const programLabel = (program?: ProgramCode | null) =>
  program ? PROGRAM_LABELS[program] : 'Not configured';

export default function GroupsScreen() {
  const { user } = useAuth();
  const canCreateGroup = ['super_admin', 'manager'].includes(user?.role || '');
  const canEditGroup = ['super_admin', 'manager'].includes(user?.role || '');
  const canManageGroupStudents = ['super_admin', 'manager'].includes(user?.role || '');
  const canDeleteGroup = user?.role === 'super_admin';
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [studentModalVisible, setStudentModalVisible] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [pricingPolicies, setPricingPolicies] = useState<PricingPolicy[]>([]);
  const [teacherSharePolicies, setTeacherSharePolicies] = useState<PricingPolicy[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [removingStudentId, setRemovingStudentId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const pendingRemoval = useRef<{ groupId: string; studentId: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    course_id: '',
    teacher_id: '',
    level: '',
    schedule: [] as Schedule[],
    program_code: 'general' as ProgramCode,
    group_format: 'normal' as GroupFormat,
    finance_effective_from: tashkentDate(),
    finance_change_reason: 'Authorized group configuration update',
  });

  const [scheduleForm, setScheduleForm] = useState({
    day: 'Monday',
    start_time: '09:00',
    end_time: '10:30',
    room: '',
  });

  useEffect(() => {
    loadTeachers();
    loadCourses();
    if (canCreateGroup) loadPricing(tashkentDate());
    // These loaders are deliberately run once when the tab mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (canCreateGroup && /^\d{4}-\d{2}-\d{2}$/.test(formData.finance_effective_from)) {
      void loadPricing(formData.finance_effective_from);
    }
  }, [canCreateGroup, formData.finance_effective_from]);

  const loadPricing = async (onDate: string) => {
    try {
      const response = await api.get('/finance/pricing/current', { params: { on_date: onDate } });
      setPricingPolicies(response.data.tariffs || []);
      setTeacherSharePolicies(response.data.teacher_shares || []);
    } catch (error) {
      console.error('Error loading finance pricing:', error);
    }
  };

  // Keep membership and course choices current while the tab is open.
  useLiveRefresh(
    () => {
      loadGroups();
      loadStudents();
      loadCourses();
    },
    true,
    'group-memberships',
    3000,
  );

  const loadGroups = async () => {
    try {
      const response = await api.get('/groups');
      const pending = pendingRemoval.current;
      const refreshedGroups = pending
        ? response.data.map((group: Group) => group.id === pending.groupId
            ? { ...group, student_ids: group.student_ids.filter((id) => id !== pending.studentId) }
            : group
          )
        : response.data;
      setGroups(refreshedGroups);
      setSelectedGroup((current) => {
        if (!current) return current;
        return refreshedGroups.find((group: Group) => group.id === current.id) || null;
      });
    } catch (error) {
      console.error('Error loading groups:', error);
      Alert.alert('Error', 'Failed to load groups');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadTeachers = async () => {
    try {
      if (user?.role === 'teacher') {
        const response = await api.get('/teachers/me');
        setTeachers([response.data]);
        setFormData((current) => ({ ...current, teacher_id: response.data.id }));
      } else {
        const response = await api.get('/teachers');
        setTeachers(response.data);
      }
    } catch (error) {
      console.error('Error loading teachers:', error);
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

  const loadStudents = async () => {
    try {
      const response = await api.get('/students');
      const pending = pendingRemoval.current;
      setStudents(pending
        ? response.data.map((student: Student) => student.id === pending.studentId
            ? { ...student, group_ids: student.group_ids.filter((id) => id !== pending.groupId) }
            : student
          )
        : response.data
      );
    } catch (error) {
      console.error('Error loading students:', error);
    }
  };

  const handleCreateGroup = async () => {
    if (
      !formData.name || !formData.course_id || !formData.teacher_id
      || !selectedCourse?.program_code || !formData.group_format
      || formData.schedule.length === 0
    ) {
      Alert.alert(
        'Missing billing information',
        'Name, course, teacher, class format, and at least one exact schedule slot are required.',
      );
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.finance_effective_from)) {
      Alert.alert('Invalid effective date', 'Use YYYY-MM-DD.');
      return;
    }
    if (!selectedTariff || !selectedTeacherShare) {
      Alert.alert('Pricing is not configured', 'A super admin must configure this tariff and teacher share first.');
      return;
    }

    try {
      await api.post('/groups', formData);
      Alert.alert('Success', 'Group created successfully');
      setModalVisible(false);
      resetForm();
      loadGroups();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create group');
    }
  };

  const handleUpdateGroup = async () => {
    if (
      !selectedGroup || !formData.name || !formData.course_id || !formData.teacher_id
      || !selectedCourse?.program_code || !formData.group_format
      || formData.schedule.length === 0
    ) {
      Alert.alert(
        'Missing billing information',
        'Name, course, teacher, class format, and at least one exact schedule slot are required.',
      );
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.finance_effective_from)) {
      Alert.alert('Invalid effective date', 'Use YYYY-MM-DD.');
      return;
    }
    if (!selectedTariff || !selectedTeacherShare) {
      Alert.alert('Pricing is not configured', 'A super admin must configure this tariff and teacher share first.');
      return;
    }

    try {
      await api.put(`/groups/${selectedGroup.id}`, formData);
      Alert.alert('Success', 'Group updated successfully');
      setModalVisible(false);
      setDetailModalVisible(false);
      resetForm();
      await loadGroups();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update group');
    }
  };

  const handleAddStudentToGroup = async (studentId: string) => {
    if (!selectedGroup) return;

    try {
      await api.post(`/groups/${selectedGroup.id}/students/${studentId}`);
      Alert.alert('Success', 'Student added to group');
      loadGroups();
      loadStudents();
      // Update selected group
      const updatedGroup = await api.get(`/groups`);
      const found = updatedGroup.data.find((g: Group) => g.id === selectedGroup.id);
      if (found) setSelectedGroup(found);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add student');
    }
  };

  const removeStudentFromGroup = async (student: Student) => {
    if (!selectedGroup || removingStudentId) return;

    const groupBeforeRemoval = selectedGroup;
    const groupsBeforeRemoval = groups;
    const studentsBeforeRemoval = students;
    const groupId = selectedGroup.id;
    pendingRemoval.current = { groupId, studentId: student.id };
    setRemovingStudentId(student.id);

    const removeMembership = (group: Group): Group => group.id === groupId
      ? { ...group, student_ids: group.student_ids.filter((id) => id !== student.id) }
      : group;
    setGroups((current) => current.map(removeMembership));
    setSelectedGroup((current) => current ? removeMembership(current) : current);
    setStudents((current) => current.map((item) => item.id === student.id
      ? { ...item, group_ids: item.group_ids.filter((id) => id !== groupId) }
      : item
    ));

    try {
      const response = await api.delete(`/groups/${groupId}/students/${student.id}`);
      const updatedGroup = response.data.group as Group | undefined;
      const updatedStudent = response.data.student as Student | undefined;
      if (updatedGroup) {
        setGroups((current) => current.map((group) => group.id === updatedGroup.id
          ? { ...group, ...updatedGroup }
          : group
        ));
        setSelectedGroup((current) => current?.id === updatedGroup.id
          ? { ...current, ...updatedGroup }
          : current
        );
      }
      if (updatedStudent) {
        setStudents((current) => current.map((item) => item.id === updatedStudent.id
          ? { ...item, ...updatedStudent }
          : item
        ));
      }
      void loadGroups();
      void loadStudents();
    } catch (error: any) {
      pendingRemoval.current = null;
      setGroups(groupsBeforeRemoval);
      setSelectedGroup(groupBeforeRemoval);
      setStudents(studentsBeforeRemoval);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to remove student');
    } finally {
      pendingRemoval.current = null;
      setRemovingStudentId(null);
    }
  };

  const handleRemoveStudentFromGroup = (student: Student) => {
    if (!selectedGroup || removingStudentId) return;
    const message = `Remove ${student.first_name} ${student.last_name} from ${selectedGroup.name}?`;

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        void removeStudentFromGroup(student);
      }
      return;
    }

    Alert.alert('Remove Student', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void removeStudentFromGroup(student),
      },
    ]);
  };

  const deleteGroup = async (group: Group) => {
    if (deletingGroupId) return;
    setDeletingGroupId(group.id);
    const previousGroups = groups;
    setGroups((current) => current.filter((item) => item.id !== group.id));
    setSelectedGroup(null);
    setDetailModalVisible(false);

    try {
      await api.delete(`/groups/${group.id}`);
      await Promise.all([loadGroups(), loadStudents()]);
      Alert.alert('Success', 'Group deleted successfully');
    } catch (error: any) {
      setGroups(previousGroups);
      setSelectedGroup(group);
      setDetailModalVisible(true);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to delete group');
    } finally {
      setDeletingGroupId(null);
    }
  };

  const handleDeleteGroup = (group: Group) => {
    const message = `Delete ${group.name}? All lessons, attendance, homework and tests for this group will also be deleted.`;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) void deleteGroup(group);
      return;
    }
    Alert.alert('Delete Group', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteGroup(group) },
    ]);
  };

  const addScheduleItem = () => {
    if (!scheduleForm.start_time || !scheduleForm.end_time) {
      Alert.alert('Error', 'Please fill in time fields');
      return;
    }
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(scheduleForm.start_time) || !timePattern.test(scheduleForm.end_time)) {
      Alert.alert('Invalid time', 'Use a valid 24-hour time in HH:MM format.');
      return;
    }
    if (scheduleForm.end_time <= scheduleForm.start_time) {
      Alert.alert('Invalid time range', 'Class end time must be after its start time.');
      return;
    }
    setFormData({
      ...formData,
      schedule: [...formData.schedule, { ...scheduleForm }],
    });
    setScheduleForm({
      day: 'Monday',
      start_time: '09:00',
      end_time: '10:30',
      room: '',
    });
  };

  const removeScheduleItem = (index: number) => {
    setFormData({
      ...formData,
      schedule: formData.schedule.filter((_, i) => i !== index),
    });
  };

  const openDetailModal = (group: Group) => {
    setSelectedGroup(group);
    setDetailModalVisible(true);
  };

  const openEditModal = (group: Group) => {
    setSelectedGroup(group);
    setIsEditing(true);
    setFormData({
      name: group.name,
      course_id: group.course_id,
      teacher_id: group.teacher_id,
      level: group.level || '',
      schedule: group.schedule || [],
      program_code: group.program_code || 'general',
      group_format: group.group_format || 'normal',
      finance_effective_from: tashkentDate(),
      finance_change_reason: 'Authorized group configuration update',
    });
    setDetailModalVisible(false);
    setModalVisible(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      course_id: '',
      teacher_id: '',
      level: '',
      schedule: [],
      program_code: 'general',
      group_format: 'normal',
      finance_effective_from: tashkentDate(),
      finance_change_reason: 'Authorized group configuration update',
    });
    setSelectedGroup(null);
    setIsEditing(false);
  };

  const getTeacherName = (teacherId: string, teacherName?: string) => {
    const teacher = teachers.find((t) => t.id === teacherId);
    return teacher ? `${teacher.first_name} ${teacher.last_name}` : teacherName || 'Unknown';
  };

  const getCourseName = (courseId: string) => {
    const course = courses.find((c) => c.id === courseId);
    return course ? course.name : 'Unknown';
  };

  const getGroupStudents = (studentIds: string[]) => {
    return students.filter((s) => studentIds.includes(s.id));
  };

  const getAvailableStudents = () => {
    if (!selectedGroup) return [];
    return students.filter((s) => !selectedGroup.student_ids.includes(s.id));
  };

  const getFilteredAvailableStudents = () => {
    const query = studentSearchQuery.trim().toLowerCase();
    const availableStudents = getAvailableStudents();
    if (!query) return availableStudents;

    return availableStudents.filter((student) =>
      `${student.first_name} ${student.last_name} ${student.student_id}`
        .toLowerCase()
        .includes(query)
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return COLORS.success;
      case 'completed':
        return COLORS.info;
      case 'cancelled':
        return COLORS.error;
      default:
        return COLORS.textSecondary;
    }
  };

  const filteredGroups = groups.filter(
    (group) =>
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getTeacherName(group.teacher_id, group.teacher_name).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCourse = courses.find((c) => c.id === formData.course_id);
  const selectedTariff = selectedCourse?.program_code
    ? pricingPolicies.find(
        (row) => row.policy_key === `tariff:${selectedCourse.program_code}:${formData.group_format}`,
      )
    : undefined;
  const selectedTeacherShare = teacherSharePolicies.find(
    (row) => row.policy_key === `teacher_share:${formData.group_format}`,
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
          <Text style={styles.headerTitle}>Groups</Text>
          <Text style={styles.headerSubtitle}>{groups.length} total groups</Text>
        </View>
        {canCreateGroup && (
          <TouchableOpacity
            testID="groups-add-button"
            accessibilityRole="button"
            accessibilityLabel="Add group"
            style={styles.addButton}
            onPress={() => {
              resetForm();
              if (user?.role === 'teacher' && teachers[0]) {
                setFormData((current) => ({ ...current, teacher_id: teachers[0].id }));
              }
              setModalVisible(true);
            }}
          >
            <Ionicons name="add" size={24} color={COLORS.marbleDark} />
          </TouchableOpacity>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search groups..."
          placeholderTextColor={COLORS.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Groups List */}
      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadGroups();
            }}
            tintColor={COLORS.gold}
          />
        }
      >
        {filteredGroups.map((group) => (
          <View key={group.id} style={styles.groupCard}>
            <TouchableOpacity
              testID={`group-card-${group.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Open group ${group.name}`}
              onPress={() => openDetailModal(group)}
            >
            <View style={[styles.groupHeader, canDeleteGroup && styles.groupHeaderWithDelete]}>
              <View style={styles.groupIcon}>
                <Ionicons name="people-circle" size={32} color={COLORS.gold} />
              </View>
              <View style={styles.groupInfo}>
                <View style={styles.groupNameRow}>
                  <Text style={styles.groupName}>{group.name}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(group.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(group.status) }]}>
                      {group.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.groupCourse}>{getCourseName(group.course_id)}</Text>
                <Text style={styles.groupTeacher}>
                  <Ionicons name="person" size={12} color={COLORS.textTertiary} /> {getTeacherName(group.teacher_id, group.teacher_name)}
                </Text>
              </View>
            </View>

            <View style={styles.groupStats}>
              <View style={styles.statItem}>
                <Ionicons name="people" size={16} color={COLORS.gold} />
                <Text style={styles.statValue}>{getGroupStudents(group.student_ids || []).length}</Text>
                <Text style={styles.statLabel}>Students</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="calendar" size={16} color={COLORS.info} />
                <Text style={styles.statValue}>{group.schedule?.length || 0}</Text>
                <Text style={styles.statLabel}>Sessions/Week</Text>
              </View>
              {group.level && (
                <>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Ionicons name="trending-up" size={16} color={COLORS.success} />
                    <Text style={styles.statValue}>{group.level}</Text>
                    <Text style={styles.statLabel}>Level</Text>
                  </View>
                </>
              )}
            </View>

            {group.schedule && group.schedule.length > 0 && (
              <View style={styles.schedulePreview}>
                {group.schedule.slice(0, 2).map((s, idx) => (
                  <View key={idx} style={styles.scheduleItem}>
                    <Text style={styles.scheduleDay}>{s.day.substring(0, 3)}</Text>
                    <Text style={styles.scheduleTime}>
                      {s.start_time}-{s.end_time}
                    </Text>
                    {s.room && <Text style={styles.scheduleRoom}>Room {s.room}</Text>}
                  </View>
                ))}
                {group.schedule.length > 2 && (
                  <Text style={styles.moreSchedule}>+{group.schedule.length - 2} more</Text>
                )}
              </View>
            )}
            </TouchableOpacity>
            {canDeleteGroup && (
              <TouchableOpacity
                style={styles.cardDeleteButton}
                accessibilityRole="button"
                accessibilityLabel={`Delete group ${group.name}`}
                disabled={deletingGroupId === group.id}
                onPress={() => handleDeleteGroup(group)}
              >
                {deletingGroupId === group.id ? (
                  <ActivityIndicator size="small" color={COLORS.error} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                    <Text style={styles.cardDeleteText}>Delete</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        ))}

        {filteredGroups.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="people-circle-outline" size={64} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>No groups found</Text>
          </View>
        )}
      </ScrollView>

      {/* Group Detail Modal */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Group Details</Text>
              <View style={styles.modalHeaderActions}>
                {selectedGroup && canDeleteGroup && (
                  <TouchableOpacity
                    disabled={deletingGroupId === selectedGroup.id}
                    onPress={() => handleDeleteGroup(selectedGroup)}
                  >
                    {deletingGroupId === selectedGroup.id ? (
                      <ActivityIndicator size="small" color={COLORS.error} />
                    ) : (
                      <Ionicons name="trash-outline" size={24} color={COLORS.error} />
                    )}
                  </TouchableOpacity>
                )}
                {selectedGroup && canEditGroup && (
                  <TouchableOpacity testID="group-edit-button" accessibilityRole="button" accessibilityLabel="Edit group" onPress={() => openEditModal(selectedGroup)}>
                    <Ionicons name="create-outline" size={24} color={COLORS.gold} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                  <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            {selectedGroup && (
              <ScrollView style={styles.detailContent}>
                <View style={styles.detailHeaderSection}>
                  <Text style={styles.detailGroupName}>{selectedGroup.name}</Text>
                  <View style={[styles.statusBadgeLarge, { backgroundColor: getStatusColor(selectedGroup.status) + '20' }]}>
                    <Text style={[styles.statusTextLarge, { color: getStatusColor(selectedGroup.status) }]}>
                      {selectedGroup.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                {selectedGroup.finance_occurrence_refresh_status === 'required' && (
                  <View style={styles.financeWarning}>
                    <Ionicons name="warning" size={20} color={COLORS.warning} />
                    <Text style={styles.financeWarningText}>
                      Lesson calendar refresh is required before invoicing. {selectedGroup.finance_occurrence_refresh_error || ''}
                    </Text>
                  </View>
                )}

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Group Information</Text>
                  <View style={styles.infoGrid}>
                    <View style={styles.infoItem}>
                      <Ionicons name="book" size={20} color={COLORS.gold} />
                      <Text style={styles.infoTitle}>Course</Text>
                      <Text style={styles.infoValue}>{getCourseName(selectedGroup.course_id)}</Text>
                    </View>
                    <View style={styles.infoItem}>
                      <Ionicons name="person" size={20} color={COLORS.gold} />
                      <Text style={styles.infoTitle}>Teacher</Text>
                      <Text style={styles.infoValue}>{getTeacherName(selectedGroup.teacher_id, selectedGroup.teacher_name)}</Text>
                    </View>
                    <View style={styles.infoItem}>
                      <Ionicons name="people" size={20} color={COLORS.gold} />
                      <Text style={styles.infoTitle}>Students</Text>
                      <Text style={styles.infoValue}>{getGroupStudents(selectedGroup.student_ids || []).length}</Text>
                    </View>
                    <View style={styles.infoItem}>
                      <Ionicons name="cash" size={20} color={COLORS.gold} />
                      <Text style={styles.infoTitle}>Billing</Text>
                      <Text style={styles.infoValue}>
                        {selectedGroup.program_code?.replace('_', '-') || 'Not configured'} · {selectedGroup.group_format || '—'}
                      </Text>
                    </View>
                    {selectedGroup.level && (
                      <View style={styles.infoItem}>
                        <Ionicons name="trending-up" size={20} color={COLORS.gold} />
                        <Text style={styles.infoTitle}>Level</Text>
                        <Text style={styles.infoValue}>{selectedGroup.level}</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Schedule</Text>
                  {selectedGroup.schedule && selectedGroup.schedule.length > 0 ? (
                    selectedGroup.schedule.map((s, idx) => (
                      <View key={idx} style={styles.scheduleDetailItem}>
                        <View style={styles.scheduleDetailDay}>
                          <Text style={styles.scheduleDayText}>{s.day}</Text>
                        </View>
                        <View style={styles.scheduleDetailInfo}>
                          <Text style={styles.scheduleDetailTime}>
                            {s.start_time} - {s.end_time}
                          </Text>
                          {s.room && <Text style={styles.scheduleDetailRoom}>Classroom: {s.room}</Text>}
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noDataText}>No schedule set</Text>
                  )}
                </View>

                <View style={styles.detailSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.detailLabel}>
                      Students ({getGroupStudents(selectedGroup.student_ids || []).length})
                    </Text>
                    {canManageGroupStudents && (
                      <TouchableOpacity testID="group-add-student-button" style={styles.addStudentBtn} onPress={() => { setStudentSearchQuery(''); setStudentModalVisible(true); }}>
                        <Ionicons name="person-add" size={18} color={COLORS.gold} />
                        <Text style={styles.addStudentText}>Add</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {getGroupStudents(selectedGroup.student_ids || []).length > 0 ? (
                    getGroupStudents(selectedGroup.student_ids || []).map((student) => (
                      <View key={student.id} style={styles.studentItem}>
                        <View style={styles.studentAvatar}>
                          <Text style={styles.studentAvatarText}>
                            {student.first_name[0]}
                            {student.last_name[0]}
                          </Text>
                        </View>
                        <View style={styles.studentInfo}>
                          <Text style={styles.studentName}>
                            {student.first_name} {student.last_name}
                          </Text>
                          <Text style={styles.studentId}>{student.student_id}</Text>
                        </View>
                        {canManageGroupStudents && (
                          <TouchableOpacity
                            testID={`group-remove-student-${student.id}`}
                            style={styles.removeStudentBtn}
                            disabled={removingStudentId === student.id}
                            onPress={() => handleRemoveStudentFromGroup(student)}
                          >
                            {removingStudentId === student.id ? (
                              <ActivityIndicator size="small" color={COLORS.error} />
                            ) : (
                              <Ionicons name="close-circle" size={24} color={COLORS.error} />
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noDataText}>No students in this group</Text>
                  )}
                </View>

                {canDeleteGroup && (
                  <TouchableOpacity
                    style={styles.deleteGroupButton}
                    disabled={deletingGroupId === selectedGroup.id}
                    onPress={() => handleDeleteGroup(selectedGroup)}
                  >
                    {deletingGroupId === selectedGroup.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                        <Text style={styles.deleteGroupButtonText}>Delete Group</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Student to Group Modal */}
      <Modal
        visible={studentModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { setStudentModalVisible(false); setStudentSearchQuery(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Student</Text>
              <TouchableOpacity
                testID="group-add-student-close"
                accessibilityRole="button"
                accessibilityLabel="Close add student"
                onPress={() => { setStudentModalVisible(false); setStudentSearchQuery(''); }}
              >
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.studentSearchContainer}>
              <Ionicons name="search" size={20} color={COLORS.textTertiary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name or student ID..."
                placeholderTextColor={COLORS.textTertiary}
                value={studentSearchQuery}
                onChangeText={setStudentSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {studentSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setStudentSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color={COLORS.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.studentList}>
              {getFilteredAvailableStudents().length > 0 ? (
                getFilteredAvailableStudents().map((student) => (
                  <TouchableOpacity
                    key={student.id}
                    testID={`group-select-student-${student.id}`}
                    style={styles.studentSelectItem}
                    onPress={() => handleAddStudentToGroup(student.id)}
                  >
                    <View style={styles.studentAvatar}>
                      <Text style={styles.studentAvatarText}>
                        {student.first_name[0]}
                        {student.last_name[0]}
                      </Text>
                    </View>
                    <View style={styles.studentInfo}>
                      <Text style={styles.studentName}>
                        {student.first_name} {student.last_name}
                      </Text>
                      <Text style={styles.studentId}>{student.student_id}</Text>
                    </View>
                    <Ionicons name="add-circle" size={24} color={COLORS.success} />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color={COLORS.textTertiary} />
                  <Text style={styles.emptyText}>
                    {getAvailableStudents().length === 0
                      ? 'All students are already in this group'
                      : 'No students match your search'}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Create Group Modal */}
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
              <Text style={styles.modalTitle}>{isEditing ? 'Edit Group' : 'Create New Group'}</Text>
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
                label="Group Name *"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="e.g., IELTS Morning A"
              />

              <Text style={styles.formLabel}>Course *</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  testID="group-course-picker"
                  selectedValue={formData.course_id}
                  onValueChange={(value) => {
                    const course = courses.find((item) => item.id === value);
                    setFormData({
                      ...formData,
                      course_id: value,
                      level: '',
                      program_code: course?.program_code || 'general',
                    });
                  }}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                  dropdownIconColor={COLORS.gold}
                >
                  <LocalizedPickerItem label="Select course" value="" />
                  {courses.map((course) => (
                    <LocalizedPickerItem key={course.id} label={course.name} value={course.id} />
                  ))}
                </Picker>
              </View>

              {selectedCourse && selectedCourse.levels && selectedCourse.levels.length > 0 && (
                <>
                  <Text style={styles.formLabel}>Level</Text>
                  <View style={styles.pickerContainer}>
                    <Picker
                      testID="group-level-picker"
                      selectedValue={formData.level}
                      onValueChange={(value) => setFormData({ ...formData, level: value })}
                      style={styles.picker}
                      itemStyle={styles.pickerItem}
                      dropdownIconColor={COLORS.gold}
                    >
                      <LocalizedPickerItem label="Select level" value="" />
                      {selectedCourse.levels.map((level) => (
                        <LocalizedPickerItem key={level} label={level} value={level} />
                      ))}
                    </Picker>
                  </View>
                </>
              )}

              {user?.role === 'teacher' ? (
                <Input
                  label="Teacher"
                  value={teachers[0] ? `${teachers[0].first_name} ${teachers[0].last_name}` : 'Current teacher'}
                  editable={false}
                />
              ) : (
                <>
                  <Text style={styles.formLabel}>Teacher *</Text>
                  <View style={styles.pickerContainer}>
                    <Picker
                      testID="group-teacher-picker"
                      selectedValue={formData.teacher_id}
                      onValueChange={(value) => setFormData({ ...formData, teacher_id: value })}
                      style={styles.picker}
                      itemStyle={styles.pickerItem}
                      dropdownIconColor={COLORS.gold}
                    >
                      <LocalizedPickerItem label="Select teacher" value="" />
                      {teachers.map((teacher) => (
                        <LocalizedPickerItem
                          key={teacher.id}
                          label={`${teacher.first_name} ${teacher.last_name}`}
                          value={teacher.id}
                        />
                      ))}
                    </Picker>
                  </View>
                </>
              )}

              <Text style={styles.formSectionTitle}>Billing setup</Text>
              <Text style={styles.formHint}>
                The selected course determines its billing category. Format, price date, and schedule are versioned; finalized bills never change.
              </Text>

              <Text style={styles.formLabel}>Class format *</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  testID="group-format-picker"
                  selectedValue={formData.group_format}
                  onValueChange={(value: GroupFormat) => setFormData({ ...formData, group_format: value })}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                  dropdownIconColor={COLORS.gold}
                >
                  <LocalizedPickerItem label="Normal group" value="normal" />
                  <LocalizedPickerItem
                    label={isEditing && selectedGroup?.group_format === 'normal'
                      ? 'Mini group (normal groups cannot downgrade)'
                      : 'Mini group'}
                    value="mini"
                    enabled={!(isEditing && selectedGroup?.group_format === 'normal')}
                  />
                  <LocalizedPickerItem label="Individual" value="individual" />
                </Picker>
              </View>

              <View style={styles.financePreview}>
                <View style={styles.financePreviewRow}>
                  <Text style={styles.financePreviewLabel}>Course billing category</Text>
                  <Text testID="group-derived-program" style={styles.financePreviewValue}>
                    {programLabel(selectedCourse?.program_code)}
                  </Text>
                </View>
                <View style={styles.financePreviewRow}>
                  <Text style={styles.financePreviewLabel}>Effective monthly price</Text>
                  <Text style={styles.financePreviewValue}>
                    {formatUzs(selectedTariff?.value.monthly_price_uzs)}
                  </Text>
                </View>
                <View style={styles.financePreviewRow}>
                  <Text style={styles.financePreviewLabel}>Teacher share</Text>
                  <Text style={styles.financePreviewValue}>
                    {selectedTeacherShare?.value.basis_points == null
                      ? 'Not configured'
                      : `${selectedTeacherShare.value.basis_points / 100}%`}
                  </Text>
                </View>
                <Text style={styles.financePreviewFootnote}>
                  Final monthly amount is calculated per scheduled lesson using the price effective on that lesson.
                </Text>
              </View>

              <CalendarDatePicker
                testID="group-finance-effective-date"
                label="Finance effective date *"
                value={formData.finance_effective_from}
                onChange={(finance_effective_from) => setFormData({ ...formData, finance_effective_from })}
              />

              <Input
                label="Reason for configuration *"
                value={formData.finance_change_reason}
                onChangeText={(text) => setFormData({ ...formData, finance_change_reason: text })}
                placeholder="Why this setup or change is effective"
              />

              <Text style={styles.formLabel}>Exact weekly schedule *</Text>
              <View style={styles.scheduleFormContainer}>
                <View style={styles.scheduleFormRow}>
                  <View style={[styles.pickerContainer, { flex: 1 }]}>
                    <Picker
                      testID="group-schedule-day-picker"
                      selectedValue={scheduleForm.day}
                      onValueChange={(value) => setScheduleForm({ ...scheduleForm, day: value })}
                      style={styles.pickerSmall}
                      itemStyle={styles.pickerItem}
                      dropdownIconColor={COLORS.gold}
                    >
                      {DAYS.map((day) => (
                        <LocalizedPickerItem key={day} label={day} value={day} />
                      ))}
                    </Picker>
                  </View>
                </View>

                <View style={styles.scheduleFormRow}>
                  <Input
                    label="Start"
                    value={scheduleForm.start_time}
                    onChangeText={(text) => setScheduleForm({ ...scheduleForm, start_time: text })}
                    placeholder="09:00"
                    style={{ flex: 1 }}
                  />
                  <Input
                    label="End"
                    value={scheduleForm.end_time}
                    onChangeText={(text) => setScheduleForm({ ...scheduleForm, end_time: text })}
                    placeholder="10:30"
                    style={{ flex: 1, marginLeft: SIZES.sm }}
                  />
                </View>

                <View style={styles.scheduleFormRow}>
                  <Input
                    label="Classroom"
                    value={scheduleForm.room}
                    onChangeText={(text) => setScheduleForm({ ...scheduleForm, room: text })}
                    placeholder="Room 101"
                    style={{ flex: 1 }}
                  />
                  <TouchableOpacity testID="group-add-schedule-button" style={styles.addScheduleBtn} onPress={addScheduleItem}>
                    <Ionicons name="add" size={24} color={COLORS.marbleDark} />
                  </TouchableOpacity>
                </View>
              </View>

              {formData.schedule.length > 0 && (
                <View style={styles.scheduleList}>
                  {formData.schedule.map((s, idx) => (
                    <View key={idx} style={styles.scheduleListItem}>
                      <View style={styles.scheduleListInfo}>
                        <Text style={styles.scheduleListDay}>{s.day}</Text>
                        <Text style={styles.scheduleListTime}>
                          {s.start_time} - {s.end_time}
                        </Text>
                        {s.room && <Text style={styles.scheduleListRoom}>Room: {s.room}</Text>}
                      </View>
                      <TouchableOpacity onPress={() => removeScheduleItem(idx)}>
                        <Ionicons name="trash" size={20} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <Button
                testID="group-save-button"
                title={isEditing ? 'Update Group' : 'Create Group'}
                onPress={isEditing ? handleUpdateGroup : handleCreateGroup}
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
  studentSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    marginHorizontal: SIZES.lg,
    marginTop: SIZES.md,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: SIZES.md,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
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
  groupCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.md,
    ...SHADOWS.small,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SIZES.md,
  },
  groupHeaderWithDelete: {
    paddingRight: 78,
  },
  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gold + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SIZES.md,
  },
  groupInfo: {
    flex: 1,
  },
  cardDeleteButton: {
    position: 'absolute',
    top: SIZES.md,
    right: SIZES.md,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SIZES.sm,
    paddingVertical: SIZES.xs,
    borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.error + '18',
  },
  cardDeleteText: {
    fontSize: SIZES.fontXs,
    fontWeight: '700',
    color: COLORS.error,
  },
  groupNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupName: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
  },
  groupCourse: {
    fontSize: SIZES.fontSm,
    color: COLORS.gold,
    marginTop: SIZES.xs,
  },
  groupTeacher: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
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
  groupStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: SIZES.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.marbleGray,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: SIZES.fontLg,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: SIZES.xs,
  },
  statLabel: {
    fontSize: SIZES.fontXs,
    color: COLORS.textTertiary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.marbleGray,
    marginHorizontal: SIZES.sm,
  },
  schedulePreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SIZES.md,
    paddingTop: SIZES.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.marbleGray,
    gap: SIZES.sm,
  },
  scheduleItem: {
    backgroundColor: COLORS.backgroundLight,
    paddingHorizontal: SIZES.sm,
    paddingVertical: SIZES.xs,
    borderRadius: SIZES.radiusSm,
  },
  scheduleDay: {
    fontSize: SIZES.fontXs,
    fontWeight: '600',
    color: COLORS.gold,
  },
  scheduleTime: {
    fontSize: SIZES.fontXs,
    color: COLORS.textSecondary,
  },
  scheduleRoom: {
    fontSize: SIZES.fontXs,
    color: COLORS.textTertiary,
  },
  moreSchedule: {
    fontSize: SIZES.fontXs,
    color: COLORS.textTertiary,
    alignSelf: 'center',
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
    textAlign: 'center',
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
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.md,
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
  detailHeaderSection: {
    alignItems: 'center',
    marginBottom: SIZES.lg,
  },
  detailGroupName: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.sm,
  },
  statusBadgeLarge: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusMd,
  },
  statusTextLarge: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
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
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.sm,
  },
  infoItem: {
    backgroundColor: COLORS.backgroundLight,
    padding: SIZES.md,
    borderRadius: SIZES.radiusMd,
    alignItems: 'center',
    minWidth: '45%',
    flex: 1,
  },
  infoTitle: {
    fontSize: SIZES.fontXs,
    color: COLORS.textTertiary,
    marginTop: SIZES.xs,
  },
  infoValue: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SIZES.xs,
    textAlign: 'center',
  },
  scheduleDetailItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.backgroundLight,
    borderRadius: SIZES.radiusMd,
    marginBottom: SIZES.sm,
    overflow: 'hidden',
  },
  scheduleDetailDay: {
    backgroundColor: COLORS.gold,
    padding: SIZES.md,
    justifyContent: 'center',
    minWidth: 80,
  },
  scheduleDayText: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    color: COLORS.marbleDark,
  },
  scheduleDetailInfo: {
    flex: 1,
    padding: SIZES.md,
    justifyContent: 'center',
  },
  scheduleDetailTime: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  scheduleDetailRoom: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginTop: SIZES.xs,
  },
  noDataText: {
    fontSize: SIZES.fontSm,
    color: COLORS.textTertiary,
    fontStyle: 'italic',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  addStudentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gold + '20',
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusMd,
    gap: SIZES.xs,
  },
  addStudentText: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    color: COLORS.gold,
  },
  studentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    padding: SIZES.md,
    borderRadius: SIZES.radiusMd,
    marginBottom: SIZES.sm,
  },
  studentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SIZES.md,
  },
  studentAvatarText: {
    fontSize: SIZES.fontSm,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: SIZES.fontMd,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  studentId: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
  },
  removeStudentBtn: {
    padding: SIZES.xs,
  },
  deleteGroupButton: {
    minHeight: 48,
    marginHorizontal: SIZES.lg,
    marginTop: SIZES.sm,
    marginBottom: SIZES.xl,
    borderRadius: SIZES.radiusMd,
    backgroundColor: COLORS.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.sm,
  },
  deleteGroupButtonText: {
    color: '#FFFFFF',
    fontSize: SIZES.fontMd,
    fontWeight: '700',
  },
  studentList: {
    padding: SIZES.lg,
    maxHeight: 400,
  },
  studentSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    padding: SIZES.md,
    borderRadius: SIZES.radiusMd,
    marginBottom: SIZES.sm,
  },
  formLabel: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SIZES.xs,
    marginTop: SIZES.sm,
  },
  formSectionTitle: {
    fontSize: SIZES.fontLg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SIZES.lg,
    marginBottom: SIZES.xs,
  },
  formHint: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SIZES.sm,
  },
  financePreview: {
    backgroundColor: COLORS.gold + '12',
    borderWidth: 1,
    borderColor: COLORS.gold + '55',
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.md,
  },
  financeWarning: {
    flexDirection: 'row',
    gap: SIZES.sm,
    backgroundColor: COLORS.warning + '18',
    borderWidth: 1,
    borderColor: COLORS.warning + '66',
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.md,
  },
  financeWarningText: {
    flex: 1,
    color: COLORS.warning,
    fontSize: SIZES.fontSm,
    lineHeight: 20,
  },
  financePreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SIZES.sm,
    marginBottom: SIZES.sm,
  },
  financePreviewLabel: {
    flex: 1,
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
  },
  financePreviewValue: {
    fontSize: SIZES.fontSm,
    fontWeight: '700',
    color: COLORS.gold,
    textAlign: 'right',
  },
  financePreviewFootnote: {
    fontSize: SIZES.fontXs,
    color: COLORS.textTertiary,
    lineHeight: 17,
  },
  pickerContainer: {
    backgroundColor: COLORS.backgroundLight,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
    overflow: 'hidden',
    marginBottom: SIZES.md,
    height: 48,
    justifyContent: 'center',
  },
  picker: {
    width: '100%',
    height: 48,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundLight,
  },
  pickerSmall: {
    width: '100%',
    height: 48,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundLight,
  },
  pickerItem: {
    color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundLight,
  },
  scheduleFormContainer: {
    backgroundColor: COLORS.backgroundLight,
    padding: SIZES.md,
    borderRadius: SIZES.radiusMd,
    marginBottom: SIZES.md,
  },
  scheduleFormRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SIZES.sm,
  },
  addScheduleBtn: {
    width: 48,
    height: 48,
    borderRadius: SIZES.radiusMd,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  scheduleList: {
    marginTop: SIZES.sm,
  },
  scheduleListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    padding: SIZES.md,
    borderRadius: SIZES.radiusMd,
    marginBottom: SIZES.sm,
  },
  scheduleListInfo: {
    flex: 1,
  },
  scheduleListDay: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.gold,
  },
  scheduleListTime: {
    fontSize: SIZES.fontSm,
    color: COLORS.textPrimary,
  },
  scheduleListRoom: {
    fontSize: SIZES.fontXs,
    color: COLORS.textSecondary,
  },
});
