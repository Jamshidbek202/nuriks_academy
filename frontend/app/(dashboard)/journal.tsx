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
} from 'react-native';
import { Text, TextInput, LocalizedPickerItem } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { CalendarDatePicker } from '../../src/components/CalendarDatePicker';
import { dateStringWithOffset, todayDateString } from '../../src/utils/dates';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';

interface StudentPerformance {
  student_id: string;
  participation: number;
  notes?: string;
  student_name?: string;
}

interface JournalEntry {
  id: string;
  group_id: string;
  teacher_id: string;
  lesson_date: string;
  lesson_number: number;
  topic: string;
  materials_covered: string;
  homework_assigned?: string;
  student_performance: StudentPerformance[];
  created_at: string;
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
  group_ids?: string[];
}

export default function JournalScreen() {
  const { user } = useAuth();
  const canManageJournal = ['teacher', 'manager', 'super_admin'].includes(user?.role || '');
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const creationKey = useRef('');
  const submissionInFlight = useRef(false);
  const journalRequestId = useRef(0);

  const [formData, setFormData] = useState({
    lesson_date: todayDateString(),
    lesson_number: 1,
    topic: '',
    materials_covered: '',
    homework_assigned: '',
    student_performance: [] as StudentPerformance[],
  });

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    setEntries([]);
    setLoadError('');
  }, [selectedGroup?.id]);

  const loadInitialData = async () => {
    try {
      const [groupsResponse, studentsResponse] = await Promise.all([
        api.get('/groups'),
        api.get('/students'),
      ]);
      const loadedGroups: Group[] = groupsResponse.data;
      setGroups(loadedGroups);
      setStudents(studentsResponse.data);
      setSelectedGroup((current) => (
        loadedGroups.find((group) => group.id === current?.id) || loadedGroups[0] || null
      ));
      setLoadError('');
    } catch (error) {
      console.error('Error loading journal data:', error);
      setLoadError('Unable to load journal data. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadJournalEntries = async (groupId?: string) => {
    const targetGroupId = groupId || selectedGroup?.id;
    if (!targetGroupId) {
      setRefreshing(false);
      return;
    }
    const requestId = ++journalRequestId.current;
    try {
      const response = await api.get(`/journal/group/${targetGroupId}`, {
        params: { _: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (requestId === journalRequestId.current) {
        setEntries(response.data);
        setLoadError('');
      }
    } catch (error) {
      console.error('Error loading journal entries:', error);
      if (requestId === journalRequestId.current) {
        setLoadError('Unable to load journal entries. Check your connection and try again.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  useLiveRefresh(
    () => loadJournalEntries(selectedGroup?.id),
    Boolean(selectedGroup),
    selectedGroup?.id || '',
  );

  const studentsForGroup = (group: Group) => students.filter((student) => (
    group.student_ids.includes(student.id) || student.group_ids?.includes(group.id)
  ));

  const initialPerformance = (group: Group) => studentsForGroup(group).map((student) => ({
      student_id: student.id,
      participation: 3,
      notes: '',
  }));

  const openCreateModal = () => {
    if (!selectedGroup || submissionInFlight.current) {
      if (!selectedGroup) Alert.alert('No group selected', 'Select a group before creating a journal entry.');
      return;
    }
    creationKey.current = `${Date.now()}-${Math.random()}`;
    setIsEditing(false);
    setSelectedEntry(null);
    setFormData({
      lesson_date: todayDateString(),
      lesson_number: 1,
      topic: '',
      materials_covered: '',
      homework_assigned: '',
      student_performance: initialPerformance(selectedGroup),
    });
    setModalVisible(true);
  };

  const mergeEntryPerformanceWithActiveStudents = (entry: JournalEntry) => {
    if (!selectedGroup) return entry.student_performance;
    const existingStudentIds = new Set(
      entry.student_performance.map((performance) => performance.student_id),
    );
    return [
      ...entry.student_performance,
      ...studentsForGroup(selectedGroup)
        .filter((student) => !existingStudentIds.has(student.id))
        .map((student) => ({
          student_id: student.id,
          participation: 3,
          notes: '',
        })),
    ];
  };

  const handleCreateEntry = async () => {
    if (isSaving || submissionInFlight.current) return;
    const topic = formData.topic.trim();
    const materialsCovered = formData.materials_covered.trim();
    if (!selectedGroup || !topic || !materialsCovered) {
      Alert.alert('Error', 'Please fill in Topic and Materials Covered');
      return;
    }

    if (formData.lesson_date < dateStringWithOffset(-366) || formData.lesson_date > todayDateString()) {
      Alert.alert('Invalid lesson date', 'Lesson dates must be within the past year and cannot be in the future.');
      return;
    }

    if (!Number.isInteger(formData.lesson_number) || formData.lesson_number < 1 || formData.lesson_number > 10000) {
      Alert.alert('Invalid lesson number', 'Lesson number must be between 1 and 10,000.');
      return;
    }

    const submittedGroup = selectedGroup;
    const editingEntry = isEditing ? selectedEntry : null;
    const payload = {
      group_id: submittedGroup.id,
      lesson_date: formData.lesson_date + 'T00:00:00',
      lesson_number: formData.lesson_number,
      topic,
      materials_covered: materialsCovered,
      homework_assigned: formData.homework_assigned.trim() || null,
      student_performance: formData.student_performance,
    };

    submissionInFlight.current = true;
    setIsSaving(true);
    try {
      const response = editingEntry
        ? await api.put(`/journal/${editingEntry.id}`, payload)
        : await api.post('/journal', payload, {
            headers: { 'Idempotency-Key': creationKey.current },
          });
      const savedEntry: JournalEntry = response.data;

      // Invalidate any older request, update immediately from the saved
      // response, then quietly reconcile with the server.
      journalRequestId.current += 1;
      setEntries((current) => {
        if (editingEntry) {
          return current.map((entry) => entry.id === savedEntry.id ? savedEntry : entry);
        }
        return [savedEntry, ...current.filter((entry) => entry.id !== savedEntry.id)]
          .sort((a, b) => new Date(b.lesson_date).getTime() - new Date(a.lesson_date).getTime());
      });
      setModalVisible(false);
      resetForm();
      Alert.alert('Success', editingEntry ? 'Journal entry updated' : 'Journal entry created');
      void loadJournalEntries(submittedGroup.id);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save entry');
    } finally {
      submissionInFlight.current = false;
      setIsSaving(false);
    }
  };

  const openEditModal = (entry: JournalEntry) => {
    setSelectedEntry(entry);
    setIsEditing(true);
    setFormData({
      lesson_date: entry.lesson_date.split('T')[0],
      lesson_number: entry.lesson_number,
      topic: entry.topic,
      materials_covered: entry.materials_covered,
      homework_assigned: entry.homework_assigned || '',
      student_performance: mergeEntryPerformanceWithActiveStudents(entry),
    });
    setDetailModalVisible(false);
    setModalVisible(true);
  };

  const resetForm = () => {
    setFormData({
      lesson_date: todayDateString(),
      lesson_number: 1,
      topic: '',
      materials_covered: '',
      homework_assigned: '',
      student_performance: [],
    });
    setIsEditing(false);
    setSelectedEntry(null);
  };

  const updateParticipation = (studentId: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      student_performance: prev.student_performance.map(sp =>
        sp.student_id === studentId ? { ...sp, participation: value } : sp
      ),
    }));
  };

  const updateNotes = (studentId: string, notes: string) => {
    setFormData(prev => ({
      ...prev,
      student_performance: prev.student_performance.map(sp =>
        sp.student_id === studentId ? { ...sp, notes } : sp
      ),
    }));
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (student) return `${student.first_name} ${student.last_name}`;
    const performance = selectedEntry?.student_performance.find(
      (item) => item.student_id === studentId,
    );
    return performance?.student_name || 'Former student';
  };

  const getVisiblePerformance = (performance: StudentPerformance[]) => performance;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(getActiveLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getParticipationColor = (score: number) => {
    if (score >= 4) return COLORS.success;
    if (score >= 3) return COLORS.warning;
    return COLORS.error;
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
          <Text style={styles.headerTitle}>Teacher Journal</Text>
          <Text style={styles.headerSubtitle}>Track lessons and student performance</Text>
        </View>
        {canManageJournal && (
          <TouchableOpacity
            testID="journal-add-button"
            accessibilityRole="button"
            accessibilityLabel="Add journal entry"
            style={[styles.addButton, !selectedGroup && styles.addButtonDisabled]}
            onPress={openCreateModal}
            disabled={!selectedGroup}
          >
            <Ionicons name="add" size={24} color={COLORS.marbleDark} />
          </TouchableOpacity>
        )}
      </View>

      {loadError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={20} color={COLORS.error} />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity onPress={() => selectedGroup ? loadJournalEntries(selectedGroup.id) : loadInitialData()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null}

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

      {/* Journal Entries */}
      <ScrollView
        style={styles.entriesList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadJournalEntries(); }} tintColor={COLORS.gold} />
        }
      >
        {entries.length > 0 ? (
          entries.map((entry) => (
            <TouchableOpacity
              key={entry.id}
              style={styles.entryCard}
              onPress={() => { setSelectedEntry(entry); setDetailModalVisible(true); }}
            >
              <View style={styles.entryHeader}>
                <View style={styles.lessonBadge}>
                  <Text style={styles.lessonNumber}>#{entry.lesson_number}</Text>
                </View>
                <View style={styles.entryInfo}>
                  <Text style={styles.entryTopic}>{entry.topic}</Text>
                  <Text style={styles.entryDate}>
                    <Ionicons name="calendar-outline" size={12} color={COLORS.textTertiary} />{' '}
                    {formatDate(entry.lesson_date)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
              </View>
              
              {entry.homework_assigned && (
                <View style={styles.homeworkPreview}>
                  <Ionicons name="book-outline" size={14} color={COLORS.gold} />
                  <Text style={styles.homeworkText} numberOfLines={1}>
                    HW: {entry.homework_assigned}
                  </Text>
                </View>
              )}

              <View style={styles.performanceStats}>
                <Text style={styles.performanceLabel}>
                  {getVisiblePerformance(entry.student_performance).length} students rated
                </Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="journal-outline" size={64} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>No journal entries yet</Text>
            <Text style={styles.emptySubtext}>Create your first lesson entry</Text>
          </View>
        )}
      </ScrollView>

      {/* Entry Detail Modal */}
      <Modal visible={detailModalVisible} animationType="slide" transparent={true} onRequestClose={() => setDetailModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Journal Entry</Text>
              <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedEntry && (
              <ScrollView style={styles.detailContent}>
                <View style={styles.detailSection}>
                  <View style={styles.detailRow}>
                    <View style={styles.lessonBadgeLarge}>
                      <Text style={styles.lessonNumberLarge}>Lesson #{selectedEntry.lesson_number}</Text>
                    </View>
                    <Text style={styles.detailDate}>{formatDate(selectedEntry.lesson_date)}</Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Topic</Text>
                  <Text style={styles.detailValue}>{selectedEntry.topic}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Materials Covered</Text>
                  <Text style={styles.detailValue}>{selectedEntry.materials_covered}</Text>
                </View>

                {selectedEntry.homework_assigned && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Homework Assigned</Text>
                    <View style={styles.homeworkBox}>
                      <Ionicons name="book" size={18} color={COLORS.gold} />
                      <Text style={styles.homeworkValue}>{selectedEntry.homework_assigned}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Student Performance</Text>
                  {getVisiblePerformance(selectedEntry.student_performance).map((sp, idx) => (
                    <View key={idx} style={styles.performanceItem}>
                      <Text style={styles.performanceStudentName}>{getStudentName(sp.student_id)}</Text>
                      <View style={styles.participationDisplay}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <View
                            key={n}
                            style={[styles.participationDot, n <= sp.participation && { backgroundColor: getParticipationColor(sp.participation) }]}
                          />
                        ))}
                      </View>
                      {sp.notes && <Text style={styles.performanceNotes}>{sp.notes}</Text>}
                    </View>
                  ))}
                </View>

                {canManageJournal && (
                  <Button title="Edit Entry" onPress={() => openEditModal(selectedEntry)} style={{ marginTop: SIZES.lg }} />
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Create/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => { setModalVisible(false); resetForm(); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditing ? 'Edit Entry' : 'New Journal Entry'}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <CalendarDatePicker
                    testID="journal-lesson-date"
                    label="Lesson Date"
                    value={formData.lesson_date}
                    onChange={(date) => setFormData({ ...formData, lesson_date: date })}
                    minimumDate={dateStringWithOffset(-366)}
                    maximumDate={todayDateString()}
                  />
                </View>
                <View style={{ width: 100, marginLeft: SIZES.sm }}>
                  <Input
                    testID="journal-lesson-number"
                    accessibilityLabel="Lesson number"
                    label="Lesson #"
                    value={formData.lesson_number.toString()}
                    onChangeText={(text) => setFormData({ ...formData, lesson_number: parseInt(text) || 1 })}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Input
                label="Topic *"
                value={formData.topic}
                onChangeText={(text) => setFormData({ ...formData, topic: text })}
                placeholder="Enter lesson topic"
              />

              <Input
                label="Materials Covered *"
                value={formData.materials_covered}
                onChangeText={(text) => setFormData({ ...formData, materials_covered: text })}
                placeholder="What was taught today"
                multiline
                numberOfLines={3}
              />

              <Input
                label="Homework Assigned"
                value={formData.homework_assigned}
                onChangeText={(text) => setFormData({ ...formData, homework_assigned: text })}
                placeholder="Homework for next class"
              />

              {formData.student_performance.length > 0 && (
                <View style={styles.performanceSection}>
                  <Text style={styles.sectionLabel}>Student Participation (1-5)</Text>
                  {formData.student_performance.map((sp) => (
                    <View key={sp.student_id} style={styles.studentPerformanceRow}>
                      <Text style={styles.studentName}>{getStudentName(sp.student_id)}</Text>
                      <View style={styles.participationButtons}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <TouchableOpacity
                            key={n}
                            style={[styles.participationBtn, sp.participation === n && styles.participationBtnActive]}
                            onPress={() => updateParticipation(sp.student_id, n)}
                          >
                            <Text style={[styles.participationBtnText, sp.participation === n && styles.participationBtnTextActive]}>{n}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput
                        style={styles.notesInput}
                        placeholder="Notes"
                        placeholderTextColor={COLORS.textTertiary}
                        value={sp.notes || ''}
                        onChangeText={(text) => updateNotes(sp.student_id, text)}
                      />
                    </View>
                  ))}
                </View>
              )}

              <Button
                testID="journal-save-button"
                title={isEditing ? 'Update Entry' : 'Create Entry'}
                onPress={handleCreateEntry}
                loading={isSaving}
                disabled={isSaving}
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
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: SIZES.headerTop, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark },
  headerTitle: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  headerSubtitle: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs },
  addButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center', ...SHADOWS.medium },
  addButtonDisabled: { opacity: 0.45 },
  groupSelector: { padding: SIZES.md, maxWidth: 720, width: '100%' },
  selectorLabel: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SIZES.xs },
  pickerContainer: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, overflow: 'hidden', height: 48, justifyContent: 'center' },
  picker: { width: '100%', height: 48, color: COLORS.textPrimary, backgroundColor: COLORS.backgroundCard },
  pickerItem: { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundCard },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, marginHorizontal: SIZES.md, marginBottom: SIZES.md, padding: SIZES.md, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.error + '18', borderWidth: 1, borderColor: COLORS.error + '55' },
  errorText: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontSm },
  retryText: { color: COLORS.gold, fontSize: SIZES.fontSm, fontWeight: '700' },
  entriesList: { flex: 1, paddingHorizontal: SIZES.md },
  entryCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.md, ...SHADOWS.small },
  entryHeader: { flexDirection: 'row', alignItems: 'center' },
  lessonBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  lessonNumber: { fontSize: SIZES.fontSm, fontWeight: 'bold', color: COLORS.marbleDark },
  entryInfo: { flex: 1 },
  entryTopic: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  entryDate: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs },
  homeworkPreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.gold + '15', padding: SIZES.sm, borderRadius: SIZES.radiusSm, marginTop: SIZES.sm, gap: SIZES.xs },
  homeworkText: { fontSize: SIZES.fontSm, color: COLORS.gold, flex: 1 },
  performanceStats: { marginTop: SIZES.sm, paddingTop: SIZES.sm, borderTopWidth: 1, borderTopColor: COLORS.marbleGray },
  performanceLabel: { fontSize: SIZES.fontXs, color: COLORS.textTertiary },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: SIZES.xxl },
  emptyText: { fontSize: SIZES.fontMd, color: COLORS.textTertiary, marginTop: SIZES.md },
  emptySubtext: { fontSize: SIZES.fontSm, color: COLORS.textTertiary, marginTop: SIZES.xs },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, maxHeight: '90%', paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SIZES.lg, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  modalTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  modalForm: { padding: SIZES.lg },
  detailContent: { padding: SIZES.lg },
  detailSection: { marginBottom: SIZES.lg },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lessonBadgeLarge: { backgroundColor: COLORS.gold, paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, borderRadius: SIZES.radiusMd },
  lessonNumberLarge: { fontSize: SIZES.fontMd, fontWeight: 'bold', color: COLORS.marbleDark },
  detailDate: { fontSize: SIZES.fontMd, color: COLORS.textSecondary },
  detailLabel: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SIZES.xs, textTransform: 'uppercase', letterSpacing: 1 },
  detailValue: { fontSize: SIZES.fontMd, color: COLORS.textPrimary, backgroundColor: COLORS.backgroundLight, padding: SIZES.md, borderRadius: SIZES.radiusMd },
  homeworkBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.gold + '15', padding: SIZES.md, borderRadius: SIZES.radiusMd, gap: SIZES.sm },
  homeworkValue: { fontSize: SIZES.fontMd, color: COLORS.gold, flex: 1 },
  performanceItem: { backgroundColor: COLORS.backgroundLight, padding: SIZES.md, borderRadius: SIZES.radiusMd, marginBottom: SIZES.sm },
  performanceStudentName: { fontSize: SIZES.fontMd, fontWeight: '500', color: COLORS.textPrimary },
  participationDisplay: { flexDirection: 'row', marginTop: SIZES.sm, gap: 4 },
  participationDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.marbleGray },
  performanceNotes: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: SIZES.xs, fontStyle: 'italic' },
  formRow: { flexDirection: 'row', alignItems: 'flex-end' },
  performanceSection: { marginTop: SIZES.md },
  sectionLabel: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SIZES.md },
  studentPerformanceRow: { backgroundColor: COLORS.backgroundLight, padding: SIZES.md, borderRadius: SIZES.radiusMd, marginBottom: SIZES.sm },
  studentName: { fontSize: SIZES.fontMd, fontWeight: '500', color: COLORS.textPrimary, marginBottom: SIZES.sm },
  participationButtons: { flexDirection: 'row', gap: SIZES.xs, marginBottom: SIZES.sm },
  participationBtn: { width: SIZES.touchTarget, height: SIZES.touchTarget, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundCard, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.marbleGray },
  participationBtnActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  participationBtnText: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary },
  participationBtnTextActive: { color: COLORS.marbleDark },
  notesInput: { backgroundColor: COLORS.backgroundCard, padding: SIZES.sm, borderRadius: SIZES.radiusSm, fontSize: SIZES.fontSm, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.marbleGray },
});
