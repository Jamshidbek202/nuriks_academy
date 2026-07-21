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
import { Text, LocalizedPickerItem } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';
import { CalendarDatePicker } from '../../src/components/CalendarDatePicker';
import { dateStringWithOffset, todayDateString } from '../../src/utils/dates';

interface Submission {
  student_id: string;
  submitted_at?: string;
  content?: string;
  grade?: number;
  feedback?: string;
  graded_at?: string;
}

interface Homework {
  id: string;
  group_id: string;
  teacher_id: string;
  title: string;
  description: string;
  due_date: string;
  attachments: string[];
  assigned_date: string;
  submissions: Submission[];
}

interface Group {
  id: string;
  name: string;
  student_ids: string[];
}

interface Student {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
}

export default function HomeworkScreen() {
  const { user } = useAuth();
  const canManageHomework = ['teacher', 'manager', 'super_admin'].includes(user?.role || '');
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [homeworkList, setHomeworkList] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [gradeModalVisible, setGradeModalVisible] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [gradeData, setGradeData] = useState({ grade: '', feedback: '' });
  const [deletingHomeworkId, setDeletingHomeworkId] = useState<string | null>(null);
  const homeworkRequestId = useRef(0);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    due_date: '',
    attachments: [] as string[],
  });

  useEffect(() => {
    loadGroups();
    loadStudents();
  }, []);

  useEffect(() => {
    if (!selectedGroup) setHomeworkList([]);
  }, [selectedGroup]);

  const loadGroups = async () => {
    try {
      const response = await api.get('/groups');
      setGroups(response.data);
      if (response.data.length > 0) {
        setSelectedGroup(response.data[0]);
      }
    } catch (error) {
      console.error('Error loading groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async () => {
    try {
      const response = await api.get('/students');
      setStudents(response.data);
    } catch (error) {
      console.error('Error loading students:', error);
    }
  };

  const loadHomework = async (groupId?: string) => {
    const targetGroupId = groupId || selectedGroup?.id;
    if (!targetGroupId) return;
    const requestId = ++homeworkRequestId.current;
    try {
      const response = await api.get(`/homework/group/${targetGroupId}`, {
        params: { _: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (requestId === homeworkRequestId.current) {
        setHomeworkList(response.data);
      }
    } catch (error) {
      console.error('Error loading homework:', error);
    } finally {
      setRefreshing(false);
    }
  };

  useLiveRefresh(
    () => loadHomework(selectedGroup?.id),
    Boolean(selectedGroup),
    selectedGroup?.id,
  );

  const deleteHomework = async (homework: Homework) => {
    if (deletingHomeworkId) return;
    try {
      setDeletingHomeworkId(homework.id);
      await api.delete(`/homework/${homework.id}`);
      homeworkRequestId.current += 1;
      setHomeworkList((current) => current.filter((item) => item.id !== homework.id));
      setDetailModalVisible(false);
      setSelectedHomework(null);
      if (selectedGroup) {
        await loadHomework(selectedGroup.id);
      }
      Alert.alert('Success', 'Homework deleted successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to delete homework');
    } finally {
      setDeletingHomeworkId(null);
    }
  };

  const handleDeleteHomework = (homework: Homework) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete “${homework.title}”? This cannot be undone.`)) {
        void deleteHomework(homework);
      }
      return;
    }

    Alert.alert('Delete Homework', `Delete “${homework.title}”? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteHomework(homework) },
    ]);
  };

  const handleCreateHomework = async () => {
    if (!selectedGroup || !formData.title || !formData.description || !formData.due_date) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (formData.due_date < todayDateString() || formData.due_date > dateStringWithOffset(730)) {
      Alert.alert('Invalid due date', 'Choose a due date from today through the next two years.');
      return;
    }

    try {
      const response = await api.post('/homework', {
        group_id: selectedGroup.id,
        title: formData.title,
        description: formData.description,
        due_date: formData.due_date + 'T23:59:59',
        attachments: formData.attachments,
      });
      homeworkRequestId.current += 1;
      setHomeworkList((current) => [response.data, ...current]);
      Alert.alert('Success', 'Homework created successfully');
      setModalVisible(false);
      resetForm();
      await loadHomework();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create homework');
    }
  };

  const handleGradeHomework = async () => {
    if (!selectedHomework || !selectedStudent || !gradeData.grade) {
      Alert.alert('Error', 'Please enter a grade');
      return;
    }

    const grade = parseFloat(gradeData.grade);
    if (Number.isNaN(grade) || grade < 0 || grade > 100) {
      Alert.alert('Error', 'Grade must be between 0 and 100');
      return;
    }

    try {
      await api.post('/homework/grade', {
        homework_id: selectedHomework.id,
        student_id: selectedStudent,
        grade,
        feedback: gradeData.feedback || null,
      });
      const submissionData = {
        student_id: selectedStudent,
        grade,
        feedback: gradeData.feedback || undefined,
        graded_at: new Date().toISOString(),
      };
      const applyGrade = (homework: Homework): Homework => {
        const hasExistingSubmission = homework.submissions.some((submission) => submission.student_id === selectedStudent);
        return {
          ...homework,
          submissions: hasExistingSubmission
            ? homework.submissions.map((submission) =>
                submission.student_id === selectedStudent ? { ...submission, ...submissionData } : submission
              )
            : [...homework.submissions, submissionData],
        };
      };

      setHomeworkList((current) => current.map((homework) => homework.id === selectedHomework.id ? applyGrade(homework) : homework));
      setSelectedHomework((current) => current && current.id === selectedHomework.id ? applyGrade(current) : current);
      Alert.alert('Success', 'Homework graded successfully');
      setGradeModalVisible(false);
      setGradeData({ grade: '', feedback: '' });
      await loadHomework();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to grade homework');
    }
  };

  const resetForm = () => {
    setFormData({ title: '', description: '', due_date: '', attachments: [] });
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student ? `${student.first_name} ${student.last_name}` : 'Unknown';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(getActiveLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getSubmissionStatus = (homework: Homework) => {
    if (!selectedGroup) return { submitted: 0, total: 0, graded: 0 };
    const activeStudentIds = new Set(getSelectedGroupStudents().map((student) => student.id));
    const activeSubmissions = homework.submissions.filter((submission) => activeStudentIds.has(submission.student_id));
    const total = activeStudentIds.size;
    const submitted = activeSubmissions.length;
    const graded = activeSubmissions.filter(s => s.grade !== null && s.grade !== undefined).length;
    return { submitted, total, graded };
  };

  const isDueSoon = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 3 && diffDays >= 0;
  };

  const isOverdue = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    return due < now;
  };

  const openGradeModal = (homework: Homework, studentId: string) => {
    setSelectedHomework(homework);
    setSelectedStudent(studentId);
    const submission = homework.submissions.find(s => s.student_id === studentId);
    setGradeData({
      grade: submission?.grade?.toString() || '',
      feedback: submission?.feedback || '',
    });
    setGradeModalVisible(true);
  };

  const getSelectedGroupStudents = () => {
    if (!selectedGroup) return [];
    return students.filter((student) => selectedGroup.student_ids.includes(student.id));
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
          <Text style={styles.headerTitle}>Homework</Text>
          <Text style={styles.headerSubtitle}>Assign and track homework</Text>
        </View>
        {canManageHomework && (
          <TouchableOpacity style={styles.addButton} onPress={() => { resetForm(); setModalVisible(true); }}>
            <Ionicons name="add" size={24} color={COLORS.marbleDark} />
          </TouchableOpacity>
        )}
      </View>

      {/* Group Selector */}
      <View style={styles.groupSelector}>
        <Text style={styles.selectorLabel}>Select Group</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedGroup?.id || ''}
            onValueChange={(value) => {
              const group = groups.find(g => g.id === value);
              setSelectedGroup(group || null);
            }}
            style={styles.picker}
            itemStyle={styles.pickerItem}
            dropdownIconColor={COLORS.gold}
          >
            <LocalizedPickerItem label="Select a group" value="" />
            {groups.map((group) => (
              <LocalizedPickerItem key={group.id} label={group.name} value={group.id} />
            ))}
          </Picker>
        </View>
      </View>

      {/* Homework List */}
      <ScrollView
        style={styles.homeworkList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadHomework(); }} tintColor={COLORS.gold} />
        }
      >
        {homeworkList.length > 0 ? (
          homeworkList.map((hw) => {
            const status = getSubmissionStatus(hw);
            const overdue = isOverdue(hw.due_date);
            const dueSoon = isDueSoon(hw.due_date);
            
            return (
              <TouchableOpacity
                key={hw.id}
                style={styles.homeworkCard}
                onPress={() => { setSelectedHomework(hw); setDetailModalVisible(true); }}
              >
                <View style={styles.homeworkHeader}>
                  <View style={[styles.statusIndicator, { backgroundColor: overdue ? COLORS.error : dueSoon ? COLORS.warning : COLORS.success }]} />
                  <View style={styles.homeworkInfo}>
                    <Text style={styles.homeworkTitle}>{hw.title}</Text>
                    <Text style={styles.homeworkDesc} numberOfLines={2}>{hw.description}</Text>
                  </View>
                </View>

                <View style={styles.homeworkMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar" size={14} color={overdue ? COLORS.error : COLORS.textTertiary} />
                    <Text style={[styles.metaText, overdue && { color: COLORS.error }]}>
                      Due: {formatDate(hw.due_date)}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="people" size={14} color={COLORS.textTertiary} />
                    <Text style={styles.metaText}>
                      {status.submitted}/{status.total} submitted
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="checkmark-done" size={14} color={COLORS.success} />
                    <Text style={styles.metaText}>
                      {status.graded} graded
                    </Text>
                  </View>
                </View>

                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${(status.submitted / Math.max(status.total, 1)) * 100}%` }]} />
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={64} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>No homework assigned</Text>
            <Text style={styles.emptySubtext}>
              {canManageHomework ? 'Create homework for this group' : 'No homework for this group yet'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={detailModalVisible} animationType="slide" transparent={true} onRequestClose={() => setDetailModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Homework Details</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedHomework && (
              <ScrollView style={styles.detailContent}>
                <View style={styles.detailSection}>
                  <Text style={styles.detailTitle}>{selectedHomework.title}</Text>
                  <Text style={styles.detailDue}>Due: {formatDate(selectedHomework.due_date)}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Description</Text>
                  <Text style={styles.detailValue}>{selectedHomework.description}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Student Submissions & Grades</Text>
                  {getSelectedGroupStudents().map((student) => {
                    const studentId = student.id;
                    const submission = selectedHomework.submissions.find(s => s.student_id === studentId);
                    return (
                      <View key={studentId} style={styles.studentSubmission}>
                        <View style={styles.studentSubmissionInfo}>
                          <Text style={styles.studentName}>{getStudentName(studentId)}</Text>
                          {submission ? (
                            <View style={styles.submissionStatus}>
                              <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                              <Text style={styles.submittedText}>Submitted</Text>
                              {submission.grade !== null && submission.grade !== undefined && (
                                <View style={styles.gradeBadge}>
                                  <Text style={styles.gradeText}>{submission.grade}</Text>
                                </View>
                              )}
                            </View>
                          ) : (
                            <View style={styles.submissionStatus}>
                              <Ionicons name="close-circle" size={16} color={COLORS.error} />
                              <Text style={styles.notSubmittedText}>Not submitted</Text>
                            </View>
                          )}
                        </View>
                        {canManageHomework && (
                          <TouchableOpacity
                            style={styles.gradeButton}
                            onPress={() => openGradeModal(selectedHomework, studentId)}
                          >
                            <Text style={styles.gradeButtonText}>
                              {submission?.grade !== null && submission?.grade !== undefined ? 'Edit' : 'Grade'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
                {canManageHomework && (
                  <Button
                    title="Delete Homework"
                    variant="outline"
                    loading={deletingHomeworkId === selectedHomework.id}
                    disabled={Boolean(deletingHomeworkId)}
                    onPress={() => handleDeleteHomework(selectedHomework)}
                    style={{ marginTop: SIZES.lg }}
                  />
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Grade Modal */}
      <Modal visible={gradeModalVisible} animationType="slide" transparent={true} onRequestClose={() => setGradeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.gradeModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Grade Homework</Text>
              <TouchableOpacity onPress={() => setGradeModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.gradeForm}>
              <Text style={styles.gradeStudentName}>{getStudentName(selectedStudent)}</Text>
              
              <Input
                label="Grade (0-100)"
                value={gradeData.grade}
                onChangeText={(text) => setGradeData({ ...gradeData, grade: text })}
                keyboardType="numeric"
                placeholder="Enter grade"
              />

              <Input
                label="Feedback"
                value={gradeData.feedback}
                onChangeText={(text) => setGradeData({ ...gradeData, feedback: text })}
                placeholder="Enter feedback for student"
                multiline
                numberOfLines={4}
              />

              <Button title="Submit Grade" onPress={handleGradeHomework} style={{ marginTop: SIZES.lg }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => { setModalVisible(false); resetForm(); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Homework</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Input
                label="Title *"
                value={formData.title}
                onChangeText={(text) => setFormData({ ...formData, title: text })}
                placeholder="Homework title"
              />

              <Input
                label="Description *"
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="Homework instructions"
                multiline
                numberOfLines={4}
              />

              <CalendarDatePicker
                label="Due Date *"
                value={formData.due_date}
                onChange={(date) => setFormData({ ...formData, due_date: date })}
                minimumDate={todayDateString()}
                maximumDate={dateStringWithOffset(730)}
                placeholder="Choose a due date"
              />

              <Button title="Create Homework" onPress={handleCreateHomework} style={{ marginTop: SIZES.lg }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark },
  headerTitle: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  headerSubtitle: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs },
  addButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },
  groupSelector: { padding: SIZES.md, maxWidth: 720, width: '100%' },
  selectorLabel: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SIZES.xs },
  pickerContainer: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, overflow: 'hidden', height: 48, justifyContent: 'center' },
  picker: { width: '100%', height: 48, color: COLORS.textPrimary, backgroundColor: COLORS.backgroundCard },
  pickerItem: { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundCard },
  homeworkList: { flex: 1, paddingHorizontal: SIZES.md },
  homeworkCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.md, ...SHADOWS.small },
  homeworkHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  statusIndicator: { width: 4, height: '100%', minHeight: 50, borderRadius: 2, marginRight: SIZES.md },
  homeworkInfo: { flex: 1 },
  homeworkTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  homeworkDesc: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs },
  homeworkMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: SIZES.md, gap: SIZES.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: SIZES.fontXs, color: COLORS.textTertiary },
  progressBar: { height: 4, backgroundColor: COLORS.backgroundLight, borderRadius: 2, marginTop: SIZES.md, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.gold, borderRadius: 2 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: SIZES.xxl },
  emptyText: { fontSize: SIZES.fontMd, color: COLORS.textTertiary, marginTop: SIZES.md },
  emptySubtext: { fontSize: SIZES.fontSm, color: COLORS.textTertiary, marginTop: SIZES.xs },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, maxHeight: '90%', paddingBottom: 40 },
  gradeModalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SIZES.lg, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  modalTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  modalForm: { padding: SIZES.lg },
  detailContent: { padding: SIZES.lg },
  detailSection: { marginBottom: SIZES.lg },
  detailTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  detailDue: { fontSize: SIZES.fontMd, color: COLORS.gold, marginTop: SIZES.xs },
  detailLabel: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SIZES.sm, textTransform: 'uppercase', letterSpacing: 1 },
  detailValue: { fontSize: SIZES.fontMd, color: COLORS.textPrimary, backgroundColor: COLORS.backgroundLight, padding: SIZES.md, borderRadius: SIZES.radiusMd },
  studentSubmission: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.backgroundLight, padding: SIZES.md, borderRadius: SIZES.radiusMd, marginBottom: SIZES.sm },
  studentSubmissionInfo: { flex: 1 },
  studentName: { fontSize: SIZES.fontMd, fontWeight: '500', color: COLORS.textPrimary },
  submissionStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SIZES.xs },
  submittedText: { fontSize: SIZES.fontSm, color: COLORS.success },
  notSubmittedText: { fontSize: SIZES.fontSm, color: COLORS.error },
  gradeBadge: { backgroundColor: COLORS.gold, paddingHorizontal: SIZES.sm, paddingVertical: 2, borderRadius: SIZES.radiusSm, marginLeft: SIZES.sm },
  gradeText: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.marbleDark },
  gradeButton: { backgroundColor: COLORS.gold + '20', paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, borderRadius: SIZES.radiusMd },
  gradeButtonText: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.gold },
  gradeForm: { padding: SIZES.lg },
  gradeStudentName: { fontSize: SIZES.fontLg, fontWeight: '600', color: COLORS.textPrimary, marginBottom: SIZES.lg, textAlign: 'center' },
});
