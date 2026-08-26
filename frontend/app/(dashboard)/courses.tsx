import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';

import { Text, TextInput, LocalizedPickerItem } from '../../src/components/LocalizedText';
import { useAuth } from '../../src/contexts/AuthContext';
import { api, apiErrorMessage } from '../../src/services/api';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';
import { COLORS, SIZES } from '../../src/constants/theme';
import {
  AdaptiveGrid,
  AdaptivePageHeader,
  AdaptiveScrollView,
  useAdaptiveLayout,
} from '../../src/components/AdaptiveLayout';
import { MotionListItem, MotionTouchableOpacity } from '../../src/components/Motion';

type ProgramCode = 'general' | 'pre_ielts' | 'ielts';

interface Course {
  id: string;
  name: string;
  program_code?: ProgramCode | null;
  description?: string | null;
  levels: string[];
  is_active: boolean;
}

const emptyForm = () => ({
  name: '',
  program_code: 'general' as ProgramCode,
  description: '',
  levels: '',
});

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', style: 'destructive', onPress: onConfirm },
  ]);
};

const programLabels: Record<ProgramCode, string> = {
  general: 'General',
  pre_ielts: 'Pre-IELTS',
  ielts: 'IELTS',
};

const programLabel = (program?: ProgramCode | null) => (
  program ? programLabels[program] : 'Program not configured'
);

export default function CoursesScreen() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState(emptyForm());
  const { isCompact } = useAdaptiveLayout();

  const loadCourses = useCallback(async () => {
    if (user?.role !== 'super_admin') return;
    try {
      const response = await api.get('/courses', { params: { include_inactive: true } });
      setCourses(response.data);
    } catch (error: any) {
      Alert.alert('Error', apiErrorMessage(error, 'Failed to load courses'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.role]);

  // Course changes affect lead, group, teacher, certificate, and student forms.
  // Keep concurrent super-admin catalog screens current within the live UI gate.
  useLiveRefresh(loadCourses, user?.role === 'super_admin', 'course-catalog', 1000);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (course: Course) => {
    setEditing(course);
    setForm({
      name: course.name,
      program_code: course.program_code || 'general',
      description: course.description || '',
      levels: course.levels.join(', '),
    });
    setModalOpen(true);
  };

  const saveCourse = async () => {
    const name = form.name.trim();
    if (name.length < 2) {
      Alert.alert('Required fields', 'Enter a course name and billing program.');
      return;
    }
    const levels = form.levels
      .split(/[,\n]/)
      .map((level) => level.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      const payload = {
        name,
        program_code: form.program_code,
        description: form.description.trim() || null,
        levels,
      };
      if (editing) await api.put(`/courses/${editing.id}`, payload);
      else await api.post('/courses', payload);
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm());
      await loadCourses();
      Alert.alert('Success', editing ? 'Course updated successfully' : 'Course created successfully');
    } catch (error: any) {
      Alert.alert('Course was not saved', apiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const changeCourseStatus = (course: Course) => {
    const action = course.is_active ? 'archive' : 'reactivate';
    showConfirm(
      course.is_active ? 'Archive course' : 'Reactivate course',
      course.is_active
        ? `Archive ${course.name}? It will disappear from new lead and group choices. Courses in active use cannot be archived.`
        : `Reactivate ${course.name} and make it available for new leads and groups?`,
      async () => {
        setSaving(true);
        try {
          await api.patch(`/courses/${course.id}/${action}`);
          await loadCourses();
        } catch (error: any) {
          Alert.alert('Course status was not changed', apiErrorMessage(error));
        } finally {
          setSaving(false);
        }
      },
    );
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return courses;
    return courses.filter((course) => (
      `${course.name} ${programLabel(course.program_code)} ${course.levels.join(' ')}`
        .toLowerCase()
        .includes(query)
    ));
  }, [courses, search]);

  if (user?.role !== 'super_admin') {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed" size={60} color={COLORS.error} />
        <Text style={styles.emptyTitle}>Access Denied</Text>
        <Text style={styles.emptyText}>Super Admin access required</Text>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.gold} /></View>;
  }

  return (
    <View style={styles.container}>
      <AdaptivePageHeader
        title="Courses"
        description="Manage the academic catalog used by leads, students, teachers, and groups"
        action={<MotionTouchableOpacity accessibilityLabel="Create course" testID="courses-add-button" style={styles.addButton} onPress={openCreate}>
          <Ionicons name="add" size={25} color={COLORS.marbleDark} />
        </MotionTouchableOpacity>}
      />

      <AdaptiveScrollView
        style={styles.list}
        contentContainerStyle={filtered.length === 0 ? styles.emptyList : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadCourses(); }} tintColor={COLORS.gold} />}
      >
      <View style={styles.financeNote}>
        <Ionicons name="shield-checkmark" size={20} color={COLORS.gold} />
        <Text style={styles.financeNoteText}>Course names do not set tuition. Normal, Mini, and Individual prices remain in Finance settings.</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={19} color={COLORS.textTertiary} />
        <TextInput
          testID="courses-search-input"
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search courses"
        />
      </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="library-outline" size={56} color={COLORS.textTertiary} />
            <Text style={styles.emptyTitle}>No courses yet</Text>
            <Text style={styles.emptyText}>Create General English, Pre-IELTS, or IELTS to populate course selectors.</Text>
          </View>
        ) : <AdaptiveGrid minItemWidth={340} maxColumns={2} style={styles.courseGrid}>
          {filtered.map((course, index) => (
          <MotionListItem key={course.id} index={index} testID={`course-card-${course.id}`} style={styles.card}>
            <View style={styles.cardIcon}>
              <Ionicons name="book" size={23} color={COLORS.gold} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.courseName}>{course.name}</Text>
              <Text style={styles.program}>{programLabel(course.program_code)}</Text>
              {!!course.description && <Text style={styles.description}>{course.description}</Text>}
              {course.levels.length > 0 && <Text style={styles.levels}>Levels: {course.levels.join(', ')}</Text>}
            </View>
            <View style={styles.cardActions}>
              <View style={[styles.badge, course.is_active ? styles.activeBadge : styles.archivedBadge]}>
                <Text style={styles.badgeText}>{course.is_active ? 'Active' : 'Archived'}</Text>
              </View>
              <View style={styles.iconActions}>
                <TouchableOpacity
                  testID={`course-edit-${course.id}`}
                  accessibilityLabel={`Edit ${course.name}`}
                  style={styles.iconButton}
                  onPress={() => openEdit(course)}
                  disabled={saving}
                >
                  <Ionicons name="create-outline" size={21} color={COLORS.info} />
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`course-${course.is_active ? 'archive' : 'reactivate'}-${course.id}`}
                  accessibilityLabel={`${course.is_active ? 'Archive' : 'Reactivate'} ${course.name}`}
                  style={styles.iconButton}
                  onPress={() => changeCourseStatus(course)}
                  disabled={saving}
                >
                  <Ionicons name={course.is_active ? 'archive-outline' : 'refresh-outline'} size={21} color={course.is_active ? COLORS.warning : COLORS.success} />
                </TouchableOpacity>
              </View>
            </View>
          </MotionListItem>
          ))}
        </AdaptiveGrid>}
      </AdaptiveScrollView>

      <Modal visible={modalOpen} transparent animationType={isCompact ? 'slide' : 'fade'} onRequestClose={() => setModalOpen(false)}>
        <View style={[styles.overlay, !isCompact && styles.overlayWide]}>
          <View style={[styles.modal, !isCompact && styles.modalWide]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? 'Edit course' : 'Create course'}</Text>
              <TouchableOpacity accessibilityLabel="Close course editor" onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={25} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Course name *</Text>
              <TextInput
                testID="course-name-input"
                style={styles.input}
                value={form.name}
                onChangeText={(name) => setForm({ ...form, name })}
                placeholder="e.g., General English"
              />

              <Text style={styles.label}>Billing program *</Text>
              <View style={styles.pickerBox}>
                <Picker
                  testID="course-program-picker"
                  selectedValue={form.program_code}
                  onValueChange={(program_code) => setForm({ ...form, program_code })}
                  style={styles.picker}
                  dropdownIconColor={COLORS.gold}
                >
                  <LocalizedPickerItem label="General" value="general" />
                  <LocalizedPickerItem label="Pre-IELTS" value="pre_ielts" />
                  <LocalizedPickerItem label="IELTS" value="ielts" />
                </Picker>
              </View>

              <Text style={styles.label}>Description</Text>
              <TextInput
                testID="course-description-input"
                style={[styles.input, styles.multiline]}
                value={form.description}
                onChangeText={(description) => setForm({ ...form, description })}
                placeholder="What this course covers"
                multiline
              />

              <Text style={styles.label}>Levels</Text>
              <TextInput
                testID="course-levels-input"
                style={styles.input}
                value={form.levels}
                onChangeText={(levels) => setForm({ ...form, levels })}
                placeholder="A1, A2, B1, B2"
              />
              <Text style={styles.hint}>Separate levels with commas.</Text>

              <TouchableOpacity
                testID="course-save-button"
                style={[styles.saveButton, saving && styles.disabled]}
                onPress={saveCourse}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={COLORS.marbleDark} /> : <Text style={styles.saveText}>{editing ? 'Save course' : 'Create course'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background, padding: SIZES.lg },
  addButton: { width: 46, height: 46, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  financeNote: { marginBottom: SIZES.sm, padding: SIZES.md, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.gold + '13', borderWidth: 1, borderColor: COLORS.gold + '44', flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  financeNoteText: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.fontSm },
  searchBox: { marginBottom: SIZES.md, backgroundColor: COLORS.backgroundCard, borderColor: COLORS.marbleGray, borderWidth: 1, borderRadius: SIZES.radiusMd, flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.md },
  searchInput: { flex: 1, minHeight: 46, padding: SIZES.sm, color: COLORS.textPrimary },
  list: { flex: 1 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: SIZES.xl },
  emptyTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '700', marginTop: SIZES.sm, textAlign: 'center' },
  emptyText: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginTop: SIZES.xs, textAlign: 'center' },
  courseGrid: { alignItems: 'stretch' },
  card: { minHeight: 148, backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, flexDirection: 'row', alignItems: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  cardIcon: { width: 46, height: 46, borderRadius: 0, backgroundColor: 'transparent', alignItems: 'flex-start', justifyContent: 'center', marginRight: SIZES.md },
  cardBody: { flex: 1 },
  courseName: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '700' },
  program: { color: COLORS.gold, fontSize: SIZES.fontSm, fontWeight: '600', marginTop: 3 },
  description: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginTop: SIZES.xs },
  levels: { color: COLORS.textTertiary, fontSize: SIZES.fontXs, marginTop: SIZES.xs },
  cardActions: { alignItems: 'flex-end', marginLeft: SIZES.sm },
  badge: { borderRadius: SIZES.radiusSm, paddingHorizontal: SIZES.sm, paddingVertical: 4 },
  activeBadge: { backgroundColor: COLORS.success + '25' },
  archivedBadge: { backgroundColor: COLORS.textTertiary + '25' },
  badgeText: { color: COLORS.textPrimary, fontSize: SIZES.fontXs, fontWeight: '600' },
  iconActions: { flexDirection: 'row', marginTop: SIZES.sm, gap: SIZES.xs },
  iconButton: { width: SIZES.touchTarget, height: SIZES.touchTarget, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modal: { maxHeight: '90%', backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, padding: SIZES.lg, paddingBottom: 38 },
  overlayWide: { justifyContent: 'center', padding: SIZES.lg },
  modalWide: { width: '100%', maxWidth: 640, alignSelf: 'center', borderRadius: SIZES.radiusXl },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SIZES.lg },
  modalTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontXl, fontWeight: '700' },
  label: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '600', marginBottom: SIZES.xs, marginTop: SIZES.sm },
  input: { minHeight: 48, backgroundColor: COLORS.backgroundLight, color: COLORS.textPrimary, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, padding: SIZES.md },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  pickerBox: { backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray, overflow: 'hidden' },
  picker: { minHeight: 48, color: COLORS.textPrimary },
  hint: { color: COLORS.textTertiary, fontSize: SIZES.fontXs, marginTop: SIZES.xs },
  saveButton: { minHeight: 50, marginTop: SIZES.lg, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: COLORS.marbleDark, fontWeight: '700', fontSize: SIZES.fontMd },
  disabled: { opacity: 0.6 },
});
