import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
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

interface TestResult {
  student_id: string;
  score: number;
  percentage: number;
  notes?: string;
  graded_at?: string;
}

interface Test {
  id: string;
  test_type: string;
  group_id: string;
  course_id: string;
  teacher_id: string;
  title: string;
  test_date: string;
  max_score: number;
  results: TestResult[];
  is_pending?: boolean;
}

interface Group {
  id: string;
  name: string;
  course_id: string;
  student_ids: string[];
}

interface Student {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
}

interface Course {
  id: string;
  name: string;
}

export default function TestsScreen() {
  const { user } = useAuth();
  const canManageTests = ['teacher', 'manager', 'super_admin'].includes(user?.role || '');
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedTestType, setSelectedTestType] = useState<string>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [gradeModalVisible, setGradeModalVisible] = useState(false);
  const [selectedTest, setSelectedTest] = useState<Test | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [gradeData, setGradeData] = useState({ score: '', notes: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [deletingTestId, setDeletingTestId] = useState<string | null>(null);
  const creationKey = useRef('');
  const testsRequestId = useRef(0);

  const [formData, setFormData] = useState({
    test_type: 'mid_test',
    title: '',
    test_date: todayDateString(),
    max_score: '100',
  });

  useEffect(() => {
    loadGroups();
    loadStudents();
    loadCourses();
  }, []);

  useEffect(() => {
    if (!selectedGroup) setTests([]);
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

  const loadCourses = async () => {
    try {
      const response = await api.get('/courses');
      setCourses(response.data);
    } catch (error) {
      console.error('Error loading courses:', error);
    }
  };

  const loadTests = async (groupId?: string, testType: string = selectedTestType) => {
    const targetGroupId = groupId || selectedGroup?.id;
    if (!targetGroupId) return;
    const requestId = ++testsRequestId.current;
    try {
      const response = await api.get(`/tests/group/${targetGroupId}`, {
        params: {
          ...(testType !== 'all' ? { test_type: testType } : {}),
          _: Date.now(),
        },
        headers: { 'Cache-Control': 'no-cache' },
      });
      // A slower, older request must not overwrite a mutation or a newer
      // group/filter selection.
      if (requestId === testsRequestId.current) {
        setTests(response.data);
      }
    } catch (error) {
      console.error('Error loading tests:', error);
    } finally {
      setRefreshing(false);
    }
  };

  useLiveRefresh(
    () => loadTests(selectedGroup?.id, selectedTestType),
    Boolean(selectedGroup),
    `${selectedGroup?.id ?? ''}:${selectedTestType}`,
  );

  const handleCreateTest = async () => {
    if (isCreating) return;
    if (!selectedGroup || !formData.title || !formData.test_date) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (formData.test_date < todayDateString() || formData.test_date > dateStringWithOffset(730)) {
      Alert.alert('Invalid test date', 'Choose a test date from today through the next two years.');
      return;
    }

    const maxScore = Number(formData.max_score);
    if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 10000) {
      Alert.alert('Invalid max score', 'Max score must be between 1 and 10,000.');
      return;
    }

    const submittedForm = { ...formData };
    const submittedGroup = selectedGroup;
    const activeFilter = selectedTestType;
    const shouldShowInCurrentFilter = activeFilter === 'all' || submittedForm.test_type === activeFilter;
    const optimisticId = `pending-${creationKey.current || Date.now()}`;
    const optimisticTest: Test = {
      id: optimisticId,
      test_type: submittedForm.test_type,
      group_id: submittedGroup.id,
      course_id: submittedGroup.course_id,
      teacher_id: '',
      title: submittedForm.title,
      test_date: submittedForm.test_date + 'T00:00:00',
      max_score: maxScore,
      results: [],
      is_pending: true,
    };

    setIsCreating(true);
    testsRequestId.current += 1;
    if (shouldShowInCurrentFilter) {
      setTests((current) => [optimisticTest, ...current]);
    }
    setModalVisible(false);
    resetForm();

    try {
      const response = await api.post('/tests', {
        test_type: submittedForm.test_type,
        group_id: submittedGroup.id,
        course_id: submittedGroup.course_id,
        title: submittedForm.title,
        test_date: submittedForm.test_date + 'T00:00:00',
        max_score: maxScore,
      }, { headers: { 'Idempotency-Key': creationKey.current } });
      testsRequestId.current += 1;
      if (shouldShowInCurrentFilter) {
        setTests((current) => current.map((test) =>
          test.id === optimisticId ? response.data : test
        ));
      }
      Alert.alert('Success', 'Test created successfully');
    } catch (error: any) {
      setTests((current) => current.filter((test) => test.id !== optimisticId));
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create test');
      // The server may have saved the test before a later response step failed.
      // Keep the completed form closed and reconcile from the server so the
      // teacher is not prompted to submit the same test a second time.
      void loadTests(submittedGroup.id, activeFilter);
    } finally {
      setIsCreating(false);
    }
  };

  const deleteTest = async (test: Test) => {
    if (deletingTestId) return;
    try {
      setDeletingTestId(test.id);
      await api.delete(`/tests/${test.id}`);
      testsRequestId.current += 1;
      setTests((current) => current.filter((item) => item.id !== test.id));
      setDetailModalVisible(false);
      setSelectedTest(null);
      if (selectedGroup) {
        await loadTests(selectedGroup.id, selectedTestType);
      }
      Alert.alert('Success', 'Test deleted successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to delete test');
    } finally {
      setDeletingTestId(null);
    }
  };

  const handleDeleteTest = (test: Test) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete “${test.title}”? This cannot be undone.`)) {
        void deleteTest(test);
      }
      return;
    }

    Alert.alert('Delete Test', `Delete “${test.title}”? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTest(test) },
    ]);
  };

  const handleGradeTest = async () => {
    if (!selectedTest || !selectedStudent || !gradeData.score) {
      Alert.alert('Error', 'Please enter a score');
      return;
    }

    const score = parseFloat(gradeData.score);
    if (Number.isNaN(score) || score < 0 || score > selectedTest.max_score) {
      Alert.alert('Error', `Score must be between 0 and ${selectedTest.max_score}`);
      return;
    }

    try {
      await api.post('/tests/grade', {
        test_id: selectedTest.id,
        student_id: selectedStudent,
        score: score,
        notes: gradeData.notes || null,
      });
      const percentage = (score / selectedTest.max_score) * 100;
      const resultData = {
        student_id: selectedStudent,
        score,
        percentage,
        notes: gradeData.notes || undefined,
        graded_at: new Date().toISOString(),
      };
      const applyGrade = (test: Test): Test => {
        const hasExistingResult = test.results.some((result) => result.student_id === selectedStudent);
        return {
          ...test,
          results: hasExistingResult
            ? test.results.map((result) => result.student_id === selectedStudent ? resultData : result)
            : [...test.results, resultData],
        };
      };

      setTests((current) => current.map((test) => test.id === selectedTest.id ? applyGrade(test) : test));
      setSelectedTest((current) => current && current.id === selectedTest.id ? applyGrade(current) : current);
      Alert.alert('Success', 'Test graded successfully');
      setGradeModalVisible(false);
      setGradeData({ score: '', notes: '' });
      await loadTests();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to grade test');
    }
  };

  const resetForm = () => {
    setFormData({ test_type: 'mid_test', title: '', test_date: todayDateString(), max_score: '100' });
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student ? `${student.first_name} ${student.last_name}` : 'Unknown';
  };

  const getCourseName = (courseId: string) => {
    const course = courses.find(c => c.id === courseId);
    return course ? course.name : 'Unknown';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getGroupStats = (test: Test) => {
    const activeStudentIds = new Set(getSelectedGroupStudents().map((student) => student.id));
    const activeResults = test.results.filter((result) => activeStudentIds.has(result.student_id));

    if (!selectedGroup || activeResults.length === 0) {
      return { avg: 0, min: 0, max: 0, graded: 0, total: activeStudentIds.size };
    }
    const percentages = activeResults.map(r => r.percentage);
    return {
      avg: Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length),
      min: Math.round(Math.min(...percentages)),
      max: Math.round(Math.max(...percentages)),
      graded: activeResults.length,
      total: activeStudentIds.size,
    };
  };

  const getGradeColor = (percentage: number) => {
    if (percentage >= 80) return COLORS.success;
    if (percentage >= 60) return COLORS.warning;
    return COLORS.error;
  };

  const openGradeModal = (test: Test, studentId: string) => {
    setSelectedTest(test);
    setSelectedStudent(studentId);
    const result = test.results.find(r => r.student_id === studentId);
    setGradeData({
      score: result?.score?.toString() || '',
      notes: result?.notes || '',
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
          <Text style={styles.headerTitle}>Tests</Text>
          <Text style={styles.headerSubtitle}>Mid & End of Course Tests</Text>
        </View>
        {canManageTests && (
          <TouchableOpacity style={styles.addButton} onPress={() => { resetForm(); creationKey.current = `${Date.now()}-${Math.random()}`; setModalVisible(true); }}>
            <Ionicons name="add" size={24} color={COLORS.marbleDark} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        <View style={styles.filterItem}>
          <Text style={styles.filterLabel}>Group</Text>
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
              <Picker.Item label="Select group" value="" />
              {groups.map((group) => (
                <Picker.Item key={group.id} label={group.name} value={group.id} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.testTypeButtons}>
          {['all', 'mid_test', 'end_of_course'].map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.typeButton, selectedTestType === type && styles.typeButtonActive]}
              onPress={() => setSelectedTestType(type)}
            >
              <Text style={[styles.typeButtonText, selectedTestType === type && styles.typeButtonTextActive]}>
                {type === 'all' ? 'All' : type === 'mid_test' ? 'Mid Test' : 'End Test'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tests List */}
      <ScrollView
        style={styles.testsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTests(); }} tintColor={COLORS.gold} />
        }
      >
        {tests.length > 0 ? (
          tests.map((test) => {
            const stats = getGroupStats(test);
            return (
              <TouchableOpacity
                key={test.id}
                style={[styles.testCard, test.is_pending && styles.pendingTestCard]}
                disabled={test.is_pending}
                onPress={() => { setSelectedTest(test); setDetailModalVisible(true); }}
              >
                <View style={styles.testHeader}>
                  <View style={[styles.testTypeBadge, { backgroundColor: test.test_type === 'mid_test' ? COLORS.info + '20' : COLORS.gold + '20' }]}>
                    <Ionicons name={test.test_type === 'mid_test' ? 'document-text' : 'trophy'} size={16} color={test.test_type === 'mid_test' ? COLORS.info : COLORS.gold} />
                    <Text style={[styles.testTypeText, { color: test.test_type === 'mid_test' ? COLORS.info : COLORS.gold }]}>
                      {test.test_type === 'mid_test' ? 'Mid Test' : 'End of Course'}
                    </Text>
                  </View>
                  <Text style={styles.testDate}>
                    {test.is_pending ? 'Creating…' : formatDate(test.test_date)}
                  </Text>
                </View>

                <Text style={styles.testTitle}>{test.title}</Text>
                <Text style={styles.testCourse}>{getCourseName(test.course_id)}</Text>

                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: getGradeColor(stats.avg) }]}>{stats.avg}%</Text>
                    <Text style={styles.statLabel}>Average</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{stats.min}%-{stats.max}%</Text>
                    <Text style={styles.statLabel}>Range</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{stats.graded}/{stats.total}</Text>
                    <Text style={styles.statLabel}>Graded</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="clipboard-outline" size={64} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>No tests yet</Text>
            <Text style={styles.emptySubtext}>
              {canManageTests ? 'Create a test for this group' : 'No tests for this group yet'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={detailModalVisible} animationType="slide" transparent={true} onRequestClose={() => setDetailModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Test Results</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedTest && (
              <ScrollView style={styles.detailContent}>
                <View style={styles.detailHeader}>
                  <View style={[styles.testTypeBadgeLarge, { backgroundColor: selectedTest.test_type === 'mid_test' ? COLORS.info + '20' : COLORS.gold + '20' }]}>
                    <Text style={[styles.testTypeLargeText, { color: selectedTest.test_type === 'mid_test' ? COLORS.info : COLORS.gold }]}>
                      {selectedTest.test_type === 'mid_test' ? 'Mid Test' : 'End of Course Test'}
                    </Text>
                  </View>
                  <Text style={styles.detailTitle}>{selectedTest.title}</Text>
                  <Text style={styles.detailMeta}>Max Score: {selectedTest.max_score} • {formatDate(selectedTest.test_date)}</Text>
                </View>

                {/* Group Statistics */}
                {(() => {
                  const stats = getGroupStats(selectedTest);
                  return (
                    <View style={styles.groupStatsCard}>
                      <Text style={styles.statsTitle}>Group Statistics</Text>
                      <View style={styles.statsGrid}>
                        <View style={styles.statsGridItem}>
                          <Text style={[styles.statsGridValue, { color: getGradeColor(stats.avg) }]}>{stats.avg}%</Text>
                          <Text style={styles.statsGridLabel}>Average</Text>
                        </View>
                        <View style={styles.statsGridItem}>
                          <Text style={styles.statsGridValue}>{stats.max}%</Text>
                          <Text style={styles.statsGridLabel}>Highest</Text>
                        </View>
                        <View style={styles.statsGridItem}>
                          <Text style={styles.statsGridValue}>{stats.min}%</Text>
                          <Text style={styles.statsGridLabel}>Lowest</Text>
                        </View>
                        <View style={styles.statsGridItem}>
                          <Text style={styles.statsGridValue}>{stats.graded}/{stats.total}</Text>
                          <Text style={styles.statsGridLabel}>Graded</Text>
                        </View>
                      </View>
                    </View>
                  );
                })()}

                <Text style={styles.sectionTitle}>Student Results</Text>
                {getSelectedGroupStudents().map((student) => {
                  const studentId = student.id;
                  const result = selectedTest.results.find(r => r.student_id === studentId);
                  return (
                    <View key={studentId} style={styles.studentResult}>
                      <View style={styles.studentResultInfo}>
                        <Text style={styles.studentName}>{getStudentName(studentId)}</Text>
                        {result ? (
                          <View style={styles.resultDisplay}>
                            <Text style={[styles.resultScore, { color: getGradeColor(result.percentage) }]}>
                              {result.score}/{selectedTest.max_score}
                            </Text>
                            <View style={[styles.percentageBadge, { backgroundColor: getGradeColor(result.percentage) + '20' }]}>
                              <Text style={[styles.percentageText, { color: getGradeColor(result.percentage) }]}>
                                {Math.round(result.percentage)}%
                              </Text>
                            </View>
                          </View>
                        ) : (
                          <Text style={styles.notGradedText}>Not graded</Text>
                        )}
                      </View>
                      {canManageTests && (
                        <TouchableOpacity
                          style={styles.gradeBtn}
                          onPress={() => openGradeModal(selectedTest, studentId)}
                        >
                          <Text style={styles.gradeBtnText}>{result ? 'Edit' : 'Grade'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
                {canManageTests && (
                  <Button
                    title="Delete Test"
                    variant="outline"
                    loading={deletingTestId === selectedTest.id}
                    onPress={() => handleDeleteTest(selectedTest)}
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
              <Text style={styles.modalTitle}>Enter Score</Text>
              <TouchableOpacity onPress={() => setGradeModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.gradeForm}>
              <Text style={styles.gradeStudentName}>{getStudentName(selectedStudent)}</Text>
              {selectedTest && (
                <Text style={styles.maxScoreNote}>Max Score: {selectedTest.max_score}</Text>
              )}

              <Input
                label={`Score (0-${selectedTest?.max_score || 100})`}
                value={gradeData.score}
                onChangeText={(text) => setGradeData({ ...gradeData, score: text })}
                keyboardType="numeric"
                placeholder="Enter score"
              />

              <Input
                label="Notes (optional)"
                value={gradeData.notes}
                onChangeText={(text) => setGradeData({ ...gradeData, notes: text })}
                placeholder="Add notes"
                multiline
              />

              <Button title="Save Score" onPress={handleGradeTest} style={{ marginTop: SIZES.lg }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => { setModalVisible(false); resetForm(); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Test</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.formLabel}>Test Type</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={formData.test_type}
                  onValueChange={(value) => setFormData({ ...formData, test_type: value })}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                  dropdownIconColor={COLORS.gold}
                >
                  <Picker.Item label="Mid Test" value="mid_test" />
                  <Picker.Item label="End of Course Test" value="end_of_course" />
                </Picker>
              </View>

              <Input
                label="Title *"
                value={formData.title}
                onChangeText={(text) => setFormData({ ...formData, title: text })}
                placeholder="e.g., Unit 5 Test"
              />

              <CalendarDatePicker
                label="Test Date *"
                value={formData.test_date}
                onChange={(date) => setFormData({ ...formData, test_date: date })}
                minimumDate={todayDateString()}
                maximumDate={dateStringWithOffset(730)}
              />

              <Input
                label="Max Score"
                value={formData.max_score}
                onChangeText={(text) => setFormData({ ...formData, max_score: text })}
                keyboardType="numeric"
                placeholder="100"
              />

              <Button title="Create Test" onPress={handleCreateTest} loading={isCreating} disabled={isCreating} style={{ marginTop: SIZES.lg }} />
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
  pendingTestCard: { opacity: 0.7 },
  filters: { padding: SIZES.md, maxWidth: 720, width: '100%' },
  filterItem: { marginBottom: SIZES.sm },
  filterLabel: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SIZES.xs },
  pickerContainer: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, overflow: 'hidden', height: 48, justifyContent: 'center' },
  picker: { width: '100%', height: 48, color: COLORS.textPrimary, backgroundColor: COLORS.backgroundCard },
  pickerItem: { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundCard },
  testTypeButtons: { flexDirection: 'row', gap: SIZES.sm },
  typeButton: { flex: 1, paddingVertical: SIZES.sm, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundCard, alignItems: 'center', borderWidth: 1, borderColor: COLORS.marbleGray },
  typeButtonActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  typeButtonText: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  typeButtonTextActive: { color: COLORS.marbleDark, fontWeight: '600' },
  testsList: { flex: 1, paddingHorizontal: SIZES.md },
  testCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.md, ...SHADOWS.small },
  testHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SIZES.sm },
  testTypeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.sm, paddingVertical: 4, borderRadius: SIZES.radiusSm, gap: 4 },
  testTypeText: { fontSize: SIZES.fontXs, fontWeight: '600' },
  testDate: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  testTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  testCourse: { fontSize: SIZES.fontSm, color: COLORS.gold, marginTop: SIZES.xs },
  statsRow: { flexDirection: 'row', marginTop: SIZES.md, paddingTop: SIZES.md, borderTopWidth: 1, borderTopColor: COLORS.marbleGray },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: SIZES.fontLg, fontWeight: 'bold', color: COLORS.textPrimary },
  statLabel: { fontSize: SIZES.fontXs, color: COLORS.textTertiary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: COLORS.marbleGray },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: SIZES.xxl },
  emptyText: { fontSize: SIZES.fontMd, color: COLORS.textTertiary, marginTop: SIZES.md },
  emptySubtext: { fontSize: SIZES.fontSm, color: COLORS.textTertiary, marginTop: SIZES.xs },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, maxHeight: '90%', paddingBottom: 40 },
  gradeModalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SIZES.lg, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  modalTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  modalForm: { padding: SIZES.lg },
  formLabel: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SIZES.xs },
  detailContent: { padding: SIZES.lg },
  detailHeader: { alignItems: 'center', marginBottom: SIZES.lg },
  testTypeBadgeLarge: { paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, borderRadius: SIZES.radiusMd, marginBottom: SIZES.sm },
  testTypeLargeText: { fontSize: SIZES.fontSm, fontWeight: '600' },
  detailTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary, textAlign: 'center' },
  detailMeta: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs },
  groupStatsCard: { backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.lg },
  statsTitle: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SIZES.md, textTransform: 'uppercase' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statsGridItem: { width: '50%', alignItems: 'center', paddingVertical: SIZES.sm },
  statsGridValue: { fontSize: SIZES.fontLg, fontWeight: 'bold', color: COLORS.textPrimary },
  statsGridLabel: { fontSize: SIZES.fontXs, color: COLORS.textTertiary, marginTop: 2 },
  sectionTitle: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SIZES.md, textTransform: 'uppercase' },
  studentResult: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.backgroundLight, padding: SIZES.md, borderRadius: SIZES.radiusMd, marginBottom: SIZES.sm },
  studentResultInfo: { flex: 1 },
  studentName: { fontSize: SIZES.fontMd, fontWeight: '500', color: COLORS.textPrimary },
  resultDisplay: { flexDirection: 'row', alignItems: 'center', marginTop: SIZES.xs, gap: SIZES.sm },
  resultScore: { fontSize: SIZES.fontSm, fontWeight: '600' },
  percentageBadge: { paddingHorizontal: SIZES.sm, paddingVertical: 2, borderRadius: SIZES.radiusSm },
  percentageText: { fontSize: SIZES.fontSm, fontWeight: '600' },
  notGradedText: { fontSize: SIZES.fontSm, color: COLORS.textTertiary, marginTop: SIZES.xs },
  gradeBtn: { backgroundColor: COLORS.gold + '20', paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, borderRadius: SIZES.radiusMd },
  gradeBtnText: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.gold },
  gradeForm: { padding: SIZES.lg },
  gradeStudentName: { fontSize: SIZES.fontLg, fontWeight: '600', color: COLORS.textPrimary, marginBottom: SIZES.xs, textAlign: 'center' },
  maxScoreNote: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginBottom: SIZES.lg, textAlign: 'center' },
});
