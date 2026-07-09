import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';

interface Student {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  group_ids: string[];
}

interface Progress {
  student_id: string;
  attendance: {
    total_lessons: number;
    present: number;
    attendance_rate: number;
  };
  tests: {
    mid_test_average: number;
    end_test_average: number;
    mid_tests_taken: number;
    end_tests_taken: number;
  };
  homework: {
    total_assigned: number;
    submitted: number;
    completion_rate: number;
  };
}

interface Group {
  id: string;
  name: string;
  student_ids: string[];
}

export default function ProgressScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentProgress, setStudentProgress] = useState<Progress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);

  useEffect(() => {
    loadGroups();
    loadStudents();
  }, []);

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
    } finally {
      setRefreshing(false);
    }
  };

  const loadStudentProgress = async (studentId: string) => {
    setProgressLoading(true);
    try {
      const response = await api.get(`/tests/progress/${studentId}`);
      setStudentProgress(response.data);
    } catch (error) {
      console.error('Error loading progress:', error);
      setStudentProgress(null);
    } finally {
      setProgressLoading(false);
    }
  };

  const openProgressModal = (student: Student) => {
    setSelectedStudent(student);
    setDetailModalVisible(true);
    loadStudentProgress(student.id);
  };

  const getGroupStudents = () => {
    if (!selectedGroup) return [];
    return students.filter(s => selectedGroup.student_ids.includes(s.id));
  };

  const getProgressColor = (rate: number) => {
    if (rate >= 80) return COLORS.success;
    if (rate >= 60) return COLORS.warning;
    return COLORS.error;
  };

  const getOverallProgress = (progress: Progress) => {
    const attendance = progress.attendance.attendance_rate;
    const midTest = progress.tests.mid_test_average;
    const endTest = progress.tests.end_test_average;
    const homework = progress.homework.completion_rate;
    
    // Weighted average: Attendance 20%, Mid Test 25%, End Test 35%, Homework 20%
    const testAvg = progress.tests.mid_tests_taken > 0 || progress.tests.end_tests_taken > 0
      ? (midTest * progress.tests.mid_tests_taken + endTest * progress.tests.end_tests_taken) / 
        Math.max(progress.tests.mid_tests_taken + progress.tests.end_tests_taken, 1)
      : 0;
    
    return Math.round((attendance * 0.2) + (midTest * 0.25) + (endTest * 0.35) + (homework * 0.2));
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  const groupStudents = getGroupStudents();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Student Progress</Text>
        <Text style={styles.headerSubtitle}>Track academic performance</Text>
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
            <Picker.Item label="Select a group" value="" />
            {groups.map((group) => (
              <Picker.Item key={group.id} label={group.name} value={group.id} />
            ))}
          </Picker>
        </View>
      </View>

      {/* Students List */}
      <ScrollView
        style={styles.studentsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStudents(); }} tintColor={COLORS.gold} />
        }
      >
        {groupStudents.length > 0 ? (
          groupStudents.map((student) => (
            <TouchableOpacity
              key={student.id}
              style={styles.studentCard}
              onPress={() => openProgressModal(student)}
            >
              <View style={styles.studentHeader}>
                <View style={styles.studentAvatar}>
                  <Text style={styles.avatarText}>
                    {student.first_name[0]}{student.last_name[0]}
                  </Text>
                </View>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>
                    {student.first_name} {student.last_name}
                  </Text>
                  <Text style={styles.studentId}>{student.student_id}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="analytics-outline" size={64} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>No students in this group</Text>
          </View>
        )}
      </ScrollView>

      {/* Progress Detail Modal */}
      <Modal visible={detailModalVisible} animationType="slide" transparent={true} onRequestClose={() => setDetailModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Student Progress</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedStudent && (
              <ScrollView style={styles.progressContent}>
                <View style={styles.progressHeader}>
                  <View style={styles.largeAvatar}>
                    <Text style={styles.largeAvatarText}>
                      {selectedStudent.first_name[0]}{selectedStudent.last_name[0]}
                    </Text>
                  </View>
                  <Text style={styles.progressStudentName}>
                    {selectedStudent.first_name} {selectedStudent.last_name}
                  </Text>
                  <Text style={styles.progressStudentId}>{selectedStudent.student_id}</Text>
                </View>

                {progressLoading ? (
                  <View style={styles.progressLoading}>
                    <ActivityIndicator size="large" color={COLORS.gold} />
                    <Text style={styles.loadingText}>Loading progress...</Text>
                  </View>
                ) : studentProgress ? (
                  <>
                    {/* Overall Progress */}
                    <View style={styles.overallCard}>
                      <Text style={styles.overallLabel}>Overall Progress</Text>
                      <View style={styles.overallCircle}>
                        <Text style={[styles.overallValue, { color: getProgressColor(getOverallProgress(studentProgress)) }]}>
                          {getOverallProgress(studentProgress)}%
                        </Text>
                      </View>
                      <View style={styles.overallBar}>
                        <View 
                          style={[
                            styles.overallBarFill, 
                            { 
                              width: `${getOverallProgress(studentProgress)}%`,
                              backgroundColor: getProgressColor(getOverallProgress(studentProgress))
                            }
                          ]} 
                        />
                      </View>
                    </View>

                    {/* Detailed Stats */}
                    <View style={styles.statsContainer}>
                      {/* Attendance */}
                      <View style={styles.statCard}>
                        <View style={styles.statIconContainer}>
                          <Ionicons name="calendar-outline" size={24} color={COLORS.info} />
                        </View>
                        <Text style={styles.statTitle}>Attendance</Text>
                        <Text style={[styles.statValue, { color: getProgressColor(studentProgress.attendance.attendance_rate) }]}>
                          {studentProgress.attendance.attendance_rate}%
                        </Text>
                        <Text style={styles.statDetail}>
                          {studentProgress.attendance.present}/{studentProgress.attendance.total_lessons} lessons
                        </Text>
                        <View style={styles.statBar}>
                          <View 
                            style={[
                              styles.statBarFill, 
                              { 
                                width: `${studentProgress.attendance.attendance_rate}%`,
                                backgroundColor: getProgressColor(studentProgress.attendance.attendance_rate)
                              }
                            ]} 
                          />
                        </View>
                      </View>

                      {/* Mid Test */}
                      <View style={styles.statCard}>
                        <View style={styles.statIconContainer}>
                          <Ionicons name="document-text-outline" size={24} color={COLORS.warning} />
                        </View>
                        <Text style={styles.statTitle}>Mid Test Avg</Text>
                        <Text style={[styles.statValue, { color: getProgressColor(studentProgress.tests.mid_test_average) }]}>
                          {studentProgress.tests.mid_test_average}%
                        </Text>
                        <Text style={styles.statDetail}>
                          {studentProgress.tests.mid_tests_taken} tests taken
                        </Text>
                        <View style={styles.statBar}>
                          <View 
                            style={[
                              styles.statBarFill, 
                              { 
                                width: `${studentProgress.tests.mid_test_average}%`,
                                backgroundColor: getProgressColor(studentProgress.tests.mid_test_average)
                              }
                            ]} 
                          />
                        </View>
                      </View>

                      {/* End Test */}
                      <View style={styles.statCard}>
                        <View style={styles.statIconContainer}>
                          <Ionicons name="trophy-outline" size={24} color={COLORS.gold} />
                        </View>
                        <Text style={styles.statTitle}>End Test Avg</Text>
                        <Text style={[styles.statValue, { color: getProgressColor(studentProgress.tests.end_test_average) }]}>
                          {studentProgress.tests.end_test_average}%
                        </Text>
                        <Text style={styles.statDetail}>
                          {studentProgress.tests.end_tests_taken} tests taken
                        </Text>
                        <View style={styles.statBar}>
                          <View 
                            style={[
                              styles.statBarFill, 
                              { 
                                width: `${studentProgress.tests.end_test_average}%`,
                                backgroundColor: getProgressColor(studentProgress.tests.end_test_average)
                              }
                            ]} 
                          />
                        </View>
                      </View>

                      {/* Homework */}
                      <View style={styles.statCard}>
                        <View style={styles.statIconContainer}>
                          <Ionicons name="book-outline" size={24} color={COLORS.success} />
                        </View>
                        <Text style={styles.statTitle}>Homework</Text>
                        <Text style={[styles.statValue, { color: getProgressColor(studentProgress.homework.completion_rate) }]}>
                          {studentProgress.homework.completion_rate}%
                        </Text>
                        <Text style={styles.statDetail}>
                          {studentProgress.homework.submitted}/{studentProgress.homework.total_assigned} completed
                        </Text>
                        <View style={styles.statBar}>
                          <View 
                            style={[
                              styles.statBarFill, 
                              { 
                                width: `${studentProgress.homework.completion_rate}%`,
                                backgroundColor: getProgressColor(studentProgress.homework.completion_rate)
                              }
                            ]} 
                          />
                        </View>
                      </View>
                    </View>

                    {/* Summary */}
                    <View style={styles.summaryCard}>
                      <Text style={styles.summaryTitle}>Progress Summary</Text>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Attendance Rate</Text>
                        <Text style={[styles.summaryValue, { color: getProgressColor(studentProgress.attendance.attendance_rate) }]}>
                          {studentProgress.attendance.attendance_rate >= 80 ? 'Excellent' : 
                           studentProgress.attendance.attendance_rate >= 60 ? 'Good' : 'Needs Improvement'}
                        </Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Academic Performance</Text>
                        <Text style={[styles.summaryValue, { color: getProgressColor((studentProgress.tests.mid_test_average + studentProgress.tests.end_test_average) / 2) }]}>
                          {((studentProgress.tests.mid_test_average + studentProgress.tests.end_test_average) / 2) >= 80 ? 'Excellent' : 
                           ((studentProgress.tests.mid_test_average + studentProgress.tests.end_test_average) / 2) >= 60 ? 'Good' : 'Needs Improvement'}
                        </Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Homework Completion</Text>
                        <Text style={[styles.summaryValue, { color: getProgressColor(studentProgress.homework.completion_rate) }]}>
                          {studentProgress.homework.completion_rate >= 80 ? 'Excellent' : 
                           studentProgress.homework.completion_rate >= 60 ? 'Good' : 'Needs Improvement'}
                        </Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.noProgress}>
                    <Ionicons name="analytics-outline" size={48} color={COLORS.textTertiary} />
                    <Text style={styles.noProgressText}>No progress data available</Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { paddingTop: 60, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark },
  headerTitle: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  headerSubtitle: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs },
  groupSelector: { padding: SIZES.md, maxWidth: 720, width: '100%' },
  selectorLabel: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SIZES.xs },
  pickerContainer: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, overflow: 'hidden', height: 48, justifyContent: 'center' },
  picker: { width: '100%', height: 48, color: COLORS.textPrimary, backgroundColor: COLORS.backgroundCard },
  pickerItem: { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundCard },
  studentsList: { flex: 1, paddingHorizontal: SIZES.md },
  studentCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, ...SHADOWS.small },
  studentHeader: { flexDirection: 'row', alignItems: 'center' },
  studentAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  avatarText: { fontSize: SIZES.fontMd, fontWeight: 'bold', color: COLORS.marbleDark },
  studentInfo: { flex: 1 },
  studentName: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  studentId: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: 2 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: SIZES.xxl },
  emptyText: { fontSize: SIZES.fontMd, color: COLORS.textTertiary, marginTop: SIZES.md },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, maxHeight: '90%', paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SIZES.lg, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  modalTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  progressContent: { padding: SIZES.lg },
  progressHeader: { alignItems: 'center', marginBottom: SIZES.lg },
  largeAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center', marginBottom: SIZES.md },
  largeAvatarText: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.marbleDark },
  progressStudentName: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  progressStudentId: { fontSize: SIZES.fontMd, color: COLORS.textSecondary, marginTop: SIZES.xs },
  progressLoading: { alignItems: 'center', paddingVertical: SIZES.xxl },
  loadingText: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.md },
  overallCard: { backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, padding: SIZES.lg, alignItems: 'center', marginBottom: SIZES.lg },
  overallLabel: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: SIZES.md },
  overallCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.backgroundCard, justifyContent: 'center', alignItems: 'center', marginBottom: SIZES.md, borderWidth: 4, borderColor: COLORS.gold },
  overallValue: { fontSize: 32, fontWeight: 'bold' },
  overallBar: { width: '100%', height: 8, backgroundColor: COLORS.backgroundCard, borderRadius: 4, overflow: 'hidden' },
  overallBarFill: { height: '100%', borderRadius: 4 },
  statsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm, marginBottom: SIZES.lg },
  statCard: { width: '48%', backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, padding: SIZES.md, alignItems: 'center' },
  statIconContainer: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.backgroundCard, justifyContent: 'center', alignItems: 'center', marginBottom: SIZES.sm },
  statTitle: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginBottom: SIZES.xs },
  statValue: { fontSize: SIZES.fontXl, fontWeight: 'bold' },
  statDetail: { fontSize: SIZES.fontXs, color: COLORS.textTertiary, marginTop: 2, marginBottom: SIZES.sm },
  statBar: { width: '100%', height: 4, backgroundColor: COLORS.backgroundCard, borderRadius: 2, overflow: 'hidden' },
  statBarFill: { height: '100%', borderRadius: 2 },
  summaryCard: { backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, padding: SIZES.md },
  summaryTitle: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: SIZES.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SIZES.sm, borderBottomWidth: 1, borderBottomColor: COLORS.backgroundCard },
  summaryLabel: { fontSize: SIZES.fontMd, color: COLORS.textPrimary },
  summaryValue: { fontSize: SIZES.fontSm, fontWeight: '600' },
  noProgress: { alignItems: 'center', paddingVertical: SIZES.xxl },
  noProgressText: { fontSize: SIZES.fontMd, color: COLORS.textTertiary, marginTop: SIZES.md },
});
