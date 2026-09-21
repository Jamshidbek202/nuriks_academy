import { getActiveLocale } from '../../src/i18n/translations';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Text, LocalizedPickerItem } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from 'expo-router';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES } from '../../src/constants/theme';
import { ConcourseAtmosphere } from '../../src/components/ConcourseAtmosphere';
import { Button } from '../../src/components/Button';
import { CalendarDatePicker } from '../../src/components/CalendarDatePicker';
import {
  dateStringWithOffset,
  scheduleWeekdayFromDateString,
  todayDateString,
  toLocalDateString,
} from '../../src/utils/dates';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';

interface AttendanceRecord {
  id: string;
  student_id: string;
  group_id: string;
  teacher_id: string;
  date: string;
  status: 'present' | 'absent' | 'late';
  notes?: string;
  marked_by: string;
}

interface Group {
  id: string;
  name: string;
  student_ids: string[];
  course_id: string;
  teacher_id: string;
  schedule: Schedule[];
}

interface Student {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  group_ids?: string[];
}

interface Schedule {
  day: string;
  start_time: string;
  end_time: string;
  room?: string;
}

interface LessonOccurrence {
  id: string;
  local_date: string;
  starts_at: string;
  ends_at: string;
  resolution_status: string;
  lesson_status: string;
  counts_as_scheduled: boolean;
  locked_at?: string;
  active_student_ids?: string[];
  attendance_open: boolean;
  attendance_state: 'upcoming' | 'in_progress' | 'ended_unresolved' | 'closed' | 'unavailable';
}

interface AttendanceStats {
  total: number;
  present: number;
  absent: number;
  late: number;
  presentRate: number;
}

const ATTENDANCE_STATUSES = [
  { value: 'present', label: 'Present', color: COLORS.success, icon: 'checkmark-circle' },
  { value: 'absent', label: 'Absent', color: COLORS.error, icon: 'close-circle' },
  { value: 'late', label: 'Late', color: COLORS.warning, icon: 'time' },
] as const;

export default function AttendanceScreen() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isPhoneLayout = width < 600;
  const canMarkAttendance = user?.role === 'teacher';
  const canViewLessonOccurrences = ['teacher', 'manager', 'super_admin'].includes(user?.role || '');
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayDateString());
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentHistory, setStudentHistory] = useState<AttendanceRecord[]>([]);
  const [studentStats, setStudentStats] = useState<AttendanceStats | null>(null);

  // Today's attendance for current group
  const [todayAttendance, setTodayAttendance] = useState<Record<string, string>>({});
  const [markingStudentIds, setMarkingStudentIds] = useState<Set<string>>(new Set());
  const [isBulkMarking, setIsBulkMarking] = useState(false);
  const [occurrences, setOccurrences] = useState<LessonOccurrence[]>([]);
  const [selectedOccurrence, setSelectedOccurrence] = useState<LessonOccurrence | null>(null);
  const [occurrenceError, setOccurrenceError] = useState('');
  const [completingLesson, setCompletingLesson] = useState(false);
  const markingStudentIdsRef = useRef<Set<string>>(new Set());
  const attendanceContextRef = useRef('');
  const selectedGroupId = selectedGroup?.id;

  const loadOccurrences = useCallback(async () => {
    if (!selectedGroupId || !canViewLessonOccurrences) {
      setOccurrences([]);
      setSelectedOccurrence(null);
      setOccurrenceError('');
      return;
    }
    try {
      setOccurrenceError('');
      const response = await api.get('/finance/lesson-occurrences', {
        params: {
          group_id: selectedGroupId,
          month: selectedDate.slice(0, 7),
          local_date: selectedDate,
        },
      });
      const rows = (response.data || []).filter((row: LessonOccurrence) => (
        row.local_date === selectedDate && row.counts_as_scheduled
      ));
      setOccurrences(rows);
      setSelectedOccurrence((current) => (
        rows.find((row: LessonOccurrence) => row.attendance_state === 'in_progress')
        || rows.find((row: LessonOccurrence) => row.id === current?.id)
        || rows.find((row: LessonOccurrence) => row.attendance_state === 'ended_unresolved')
        || rows[0]
        || null
      ));
    } catch (error: any) {
      console.error('Error loading scheduled lesson occurrences:', error);
      setOccurrences([]);
      setSelectedOccurrence(null);
      const detail = error.response?.data?.detail;
      setOccurrenceError(
        typeof detail === 'string'
          ? detail
          : 'The lesson calendar could not be loaded. Pull down or tap retry.',
      );
    }
  }, [canViewLessonOccurrences, selectedDate, selectedGroupId]);

  const loadGroups = async () => {
    try {
      const response = await api.get('/groups');
      setGroups(response.data);
      setSelectedGroup((current) => {
        if (current) {
          return response.data.find((group: Group) => group.id === current.id) || response.data[0] || null;
        }
        return response.data[0] || null;
      });
    } catch (error) {
      console.error('Error loading groups:', error);
      Alert.alert('Error', 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = useCallback(async () => {
    try {
      const response = await api.get('/students');
      setStudents(response.data);
    } catch (error) {
      console.error('Error loading students:', error);
    }
  }, []);

  const loadGroupAttendance = useCallback(async () => {
    if (!selectedGroupId) return;
    if (occurrences.length > 1 && !selectedOccurrence) return;
    const requestedContext = `${selectedGroupId}:${selectedDate}:${selectedOccurrence?.id || 'legacy'}`;

    try {
      const response = await api.get(`/attendance/group/${selectedGroupId}`, {
        params: {
          start_date: `${selectedDate}T00:00:00`,
          end_date: `${selectedDate}T23:59:59`,
          occurrence_id: selectedOccurrence?.id,
        },
      });
      const attendanceMap: Record<string, string> = {};
      response.data.forEach((r: AttendanceRecord) => {
        attendanceMap[r.student_id] = r.status;
      });
      if (attendanceContextRef.current === requestedContext) {
        setTodayAttendance(attendanceMap);
      }
    } catch (error) {
      console.error('Error loading attendance:', error);
    } finally {
      setRefreshing(false);
    }
  }, [occurrences.length, selectedDate, selectedGroupId, selectedOccurrence]);

  useEffect(() => {
    loadGroups();
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    attendanceContextRef.current = selectedGroupId ? `${selectedGroupId}:${selectedDate}:${selectedOccurrence?.id || 'legacy'}` : '';
    setTodayAttendance({});
    if (selectedGroupId) {
      void loadGroupAttendance();
    }
  }, [loadGroupAttendance, selectedDate, selectedGroupId, selectedOccurrence]);

  useEffect(() => {
    void loadOccurrences();
  }, [loadOccurrences]);

  // Tabs stay mounted. Refresh records whenever the attendance screen becomes
  // active so student/parent accounts immediately see marks made elsewhere.
  useFocusEffect(
    useCallback(() => {
      loadStudents();
      if (selectedGroup) {
        loadGroupAttendance();
      }
    }, [loadGroupAttendance, loadStudents, selectedGroup])
  );

  useLiveRefresh(
    async () => {
      await Promise.all([
        loadGroups(),
        loadStudents(),
        loadOccurrences(),
        selectedGroupId ? loadGroupAttendance() : Promise.resolve(),
      ]);
    },
    true,
    `attendance:${selectedGroupId || ''}:${selectedDate}:${selectedOccurrence?.id || ''}`,
    3000,
  );

  const loadStudentHistory = async (studentId: string) => {
    try {
      const response = await api.get(`/attendance/student/${studentId}`);
      setStudentHistory(response.data);

      // Calculate stats
      const records = response.data;
      const total = records.length;
      const present = records.filter((r: AttendanceRecord) => r.status === 'present').length;
      const absent = records.filter((r: AttendanceRecord) => r.status === 'absent').length;
      const late = records.filter((r: AttendanceRecord) => r.status === 'late').length;
      const presentRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

      setStudentStats({
        total,
        present,
        absent,
        late,
        presentRate,
      });
    } catch (error) {
      console.error('Error loading student history:', error);
    }
  };

  const markAttendance = async (
    studentId: string,
    status: AttendanceRecord['status'],
    showError = true,
  ): Promise<boolean> => {
    if (!selectedGroup || markingStudentIdsRef.current.has(studentId)) return false;
    if (!canMarkAttendance) {
      if (showError) Alert.alert('Access denied', 'Only the teacher assigned to this lesson can mark attendance.');
      return false;
    }
    if (!hasClassOnSelectedDate()) {
      if (showError) Alert.alert('No class scheduled', 'This group does not have a class on the selected date.');
      return false;
    }

    const submittedGroupId = selectedGroup.id;
    const submittedDate = selectedDate;
    const submittedOccurrenceId = selectedOccurrence?.id;
    if (!submittedOccurrenceId) {
      if (showError) Alert.alert('Lesson unavailable', 'Attendance needs an exact scheduled lesson. Refresh and try again.');
      return false;
    }
    if (!selectedOccurrence.attendance_open) {
      if (showError) {
        Alert.alert(
          'Attendance is closed',
          selectedOccurrence.attendance_state === 'upcoming'
            ? `Attendance opens at ${new Date(selectedOccurrence.starts_at).toLocaleTimeString(getActiveLocale(), { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false })}.`
            : 'Attendance is unavailable for this lesson occurrence.',
        );
      }
      return false;
    }
    const submittedContext = `${submittedGroupId}:${submittedDate}:${submittedOccurrenceId || 'legacy'}`;
    const previousStatus = todayAttendance[studentId];
    markingStudentIdsRef.current.add(studentId);
    setMarkingStudentIds(new Set(markingStudentIdsRef.current));
    setTodayAttendance((current) => ({ ...current, [studentId]: status }));

    try {
      await api.post('/attendance', {
        student_id: studentId,
        group_id: submittedGroupId,
        date: submittedDate + 'T00:00:00',
        occurrence_id: submittedOccurrenceId,
        status,
      });
      return true;
    } catch (error: any) {
      if (attendanceContextRef.current === submittedContext) {
        setTodayAttendance((current) => {
          const next = { ...current };
          if (previousStatus) next[studentId] = previousStatus;
          else delete next[studentId];
          return next;
        });
      }
      if (showError) {
        Alert.alert('Error', error.response?.data?.detail || 'Failed to mark attendance');
      }
      return false;
    } finally {
      markingStudentIdsRef.current.delete(studentId);
      setMarkingStudentIds(new Set(markingStudentIdsRef.current));
    }
  };

  const getGroupStudents = () => {
    if (!selectedGroup) return [];
    if (selectedOccurrence?.active_student_ids) {
      const activeIds = new Set(selectedOccurrence.active_student_ids);
      return students.filter((student) => activeIds.has(student.id));
    }
    return students.filter((student) => (
      selectedGroup.student_ids.includes(student.id)
      || student.group_ids?.includes(selectedGroup.id)
    ));
  };

  const markRemainingPresent = async () => {
    const unmarkedStudents = getGroupStudents().filter(
      (student) => !todayAttendance[student.id],
    );
    if (unmarkedStudents.length === 0 || isBulkMarking) return;

    setIsBulkMarking(true);
    const results = await Promise.all(
      unmarkedStudents.map((student) => markAttendance(student.id, 'present', false)),
    );
    const failedCount = results.filter((saved) => !saved).length;
    setIsBulkMarking(false);

    if (failedCount > 0) {
      Alert.alert(
        'Some marks were not saved',
        'Some attendance records could not be saved. Please try those students again.',
      );
    }
  };

  const getSelectedDateDay = () => {
    return scheduleWeekdayFromDateString(selectedDate);
  };

  const hasClassOnSelectedDate = () => {
    if (!selectedGroup) return false;
    const selectedDay = getSelectedDateDay().toLowerCase();
    return (selectedGroup.schedule || []).some((session) => session.day.toLowerCase() === selectedDay);
  };

  const getSelectedDateSessions = () => {
    if (!selectedGroup) return [];
    const selectedDay = getSelectedDateDay().toLowerCase();
    return (selectedGroup.schedule || []).filter((session) => session.day.toLowerCase() === selectedDay);
  };

  const completeSelectedLesson = async () => {
    if (!selectedOccurrence || completingLesson) return;
    if (markedCount !== todayStats.total || todayStats.total === 0) {
      Alert.alert('Attendance incomplete', 'Mark every active student before completing the lesson.');
      return;
    }
    setCompletingLesson(true);
    try {
      const response = await api.post(`/finance/lesson-occurrences/${selectedOccurrence.id}/resolve`, {
        resolution: 'held',
        reason: 'Attendance submitted for completed lesson',
        idempotency_key: `attendance-complete:${selectedOccurrence.id}`,
      });
      if (response.data?.rolling_accrual?.status === 'needs_attention') {
        Alert.alert('Lesson completed', `The lesson was saved, but finance needs attention: ${response.data.rolling_accrual.detail}`);
      } else {
        Alert.alert('Lesson completed', 'Student charges and teacher earnings were updated.');
      }
      await loadOccurrences();
    } catch (error: any) {
      Alert.alert('Could not complete lesson', error.response?.data?.detail || 'Please try again.');
    } finally {
      setCompletingLesson(false);
    }
  };

  const getStatusColor = (status: string) => {
    const statusObj = ATTENDANCE_STATUSES.find((s) => s.value === status);
    return statusObj?.color || COLORS.textSecondary;
  };

  const getStatusIcon = (status: string) => {
    const statusObj = ATTENDANCE_STATUSES.find((s) => s.value === status);
    return statusObj?.icon || 'help-circle';
  };

  const openStudentStats = (student: Student) => {
    setSelectedStudent(student);
    loadStudentHistory(student.id);
    setStatsModalVisible(true);
  };

  const changeDate = (days: number) => {
    const currentDate = new Date(`${selectedDate}T00:00:00`);
    currentDate.setDate(currentDate.getDate() + days);
    const nextDate = toLocalDateString(currentDate);
    if (nextDate >= dateStringWithOffset(-366) && nextDate <= todayDateString()) {
      setSelectedDate(nextDate);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(getActiveLocale(), {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const getTodayStats = (): AttendanceStats => {
    const groupStudents = getGroupStudents();
    const total = groupStudents.length;
    const present = groupStudents.filter((s) => todayAttendance[s.id] === 'present').length;
    const absent = groupStudents.filter((s) => todayAttendance[s.id] === 'absent').length;
    const late = groupStudents.filter((s) => todayAttendance[s.id] === 'late').length;
    const markedCount = present + absent + late;
    const presentRate = markedCount > 0 ? Math.round(((present + late) / markedCount) * 100) : 0;

    return { total, present, absent, late, presentRate };
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  const groupStudents = getGroupStudents();
  const todayStats = getTodayStats();
  const markedCount = todayStats.present + todayStats.absent + todayStats.late;
  const unmarkedCount = Math.max(0, todayStats.total - markedCount);
  const hasClassToday = hasClassOnSelectedDate();
  const selectedDateSessions = getSelectedDateSessions();
  const lessonEnded = Boolean(
    selectedOccurrence && new Date(selectedOccurrence.ends_at).getTime() <= Date.now(),
  );
  const occurrenceTime = (value: string) => new Date(value).toLocaleTimeString(getActiveLocale(), {
    timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const attendanceOpen = Boolean(canMarkAttendance && selectedOccurrence?.attendance_open);
  const attendanceWindowCopy = (() => {
    if (!selectedOccurrence) return null;
    if (!canMarkAttendance) {
      return {
        icon: 'eye-outline' as const,
        title: 'Attendance is read-only',
        detail: 'Only the teacher assigned to this lesson can change the register.',
        color: COLORS.info,
      };
    }
    switch (selectedOccurrence.attendance_state) {
      case 'upcoming':
        return {
          icon: 'time-outline' as const,
          title: 'Attendance opens when class starts',
          detail: `Class begins at ${occurrenceTime(selectedOccurrence.starts_at)}. The register is read-only until then.`,
          color: COLORS.warning,
        };
      case 'in_progress':
        return {
          icon: 'radio-button-on' as const,
          title: 'Attendance is open',
          detail: `Class ends at ${occurrenceTime(selectedOccurrence.ends_at)}. The assigned teacher can update attendance now or later.`,
          color: COLORS.success,
        };
      case 'ended_unresolved':
        return {
          icon: 'alert-circle-outline' as const,
          title: 'Lesson ended — attendance stays open',
          detail: 'The assigned teacher can still add or correct attendance at any time.',
          color: COLORS.warning,
        };
      default:
        return {
          icon: 'lock-closed-outline' as const,
          title: 'Attendance is closed',
          detail: 'This lesson occurrence is unavailable.',
          color: COLORS.textSecondary,
        };
    }
  })();

  return (
    <View style={styles.container}>
      <ConcourseAtmosphere />
      {/* Header */}
      <View style={[styles.header, isPhoneLayout && styles.headerPhone]}>
        <View>
          <Text style={[styles.headerTitle, isPhoneLayout && styles.headerTitlePhone]}>Attendance</Text>
          <Text style={styles.headerSubtitle}>
            {canMarkAttendance ? 'Mark and track student attendance' : 'View attendance records'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageScrollContent}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadGroupAttendance();
            }}
            tintColor={COLORS.gold}
          />
        }
      >

      {/* Group Selector */}
      <View style={styles.groupSelector}>
        <Text style={styles.selectorLabel}>Select Group</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedGroup?.id || ''}
            onValueChange={(value) => {
              const group = groups.find((g) => g.id === value);
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

      {/* Date Navigator */}
      <View style={styles.dateNavigator}>
        <TouchableOpacity style={styles.navButton} disabled={selectedDate <= dateStringWithOffset(-366)} onPress={() => changeDate(-1)}>
          <Ionicons name="chevron-back" size={24} color={selectedDate <= dateStringWithOffset(-366) ? COLORS.textTertiary : COLORS.textPrimary} />
        </TouchableOpacity>
        <CalendarDatePicker
          value={selectedDate}
          onChange={setSelectedDate}
          minimumDate={dateStringWithOffset(-366)}
          maximumDate={todayDateString()}
          style={{ flex: 1, marginBottom: 0, borderWidth: 0, backgroundColor: 'transparent' }}
        />
        <TouchableOpacity style={styles.navButton} disabled={selectedDate >= todayDateString()} onPress={() => changeDate(1)}>
          <Ionicons name="chevron-forward" size={24} color={selectedDate >= todayDateString() ? COLORS.textTertiary : COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      {selectedGroup && hasClassToday && selectedDateSessions.length > 0 && (
        <View style={styles.sessionStrip}>
          {occurrences.length > 0 ? occurrences.map((occurrence) => (
            <TouchableOpacity
              key={occurrence.id}
              testID={`attendance-occurrence-${occurrence.id}`}
              style={[styles.sessionChip, selectedOccurrence?.id === occurrence.id && styles.sessionChipSelected]}
              onPress={() => setSelectedOccurrence(occurrence)}
            >
              <Ionicons name="time-outline" size={14} color={COLORS.gold} />
              <Text style={styles.sessionChipText}>
                {occurrenceTime(occurrence.starts_at)} - {occurrenceTime(occurrence.ends_at)}
              </Text>
              {occurrence.resolution_status === 'resolved' && <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />}
            </TouchableOpacity>
          )) : selectedDateSessions.map((session, index) => (
              <View key={`${session.day}-${session.start_time}-${index}`} style={styles.sessionChip}>
                <Ionicons name="time-outline" size={14} color={COLORS.gold} />
                <Text style={styles.sessionChipText}>
                  {session.start_time} - {session.end_time}
                  {session.room ? ` • Room ${session.room}` : ''}
                </Text>
              </View>
            ))}
        </View>
      )}

      {selectedGroup && occurrenceError ? (
        <View style={styles.windowStatus}>
          <Ionicons name="warning-outline" size={22} color={COLORS.error} />
          <View style={styles.windowStatusCopy}>
            <Text style={[styles.windowStatusTitle, { color: COLORS.error }]}>Lesson calendar unavailable</Text>
            <Text style={styles.windowStatusDetail}>{occurrenceError}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Retry lesson calendar"
              onPress={() => void loadOccurrences()}
              style={styles.occurrenceRetry}
            >
              <Ionicons name="refresh" size={17} color={COLORS.marbleDark} />
              <Text style={styles.occurrenceRetryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {selectedGroup && hasClassToday && attendanceWindowCopy && (
        <View
          testID="attendance-window-status"
          style={[styles.windowStatus, { borderColor: attendanceWindowCopy.color + '88' }]}
        >
          <Ionicons name={attendanceWindowCopy.icon} size={22} color={attendanceWindowCopy.color} />
          <View style={styles.windowStatusCopy}>
            <Text style={[styles.windowStatusTitle, { color: attendanceWindowCopy.color }]}>
              {attendanceWindowCopy.title}
            </Text>
            <Text style={styles.windowStatusDetail}>{attendanceWindowCopy.detail}</Text>
          </View>
        </View>
      )}

      {/* Today's Stats */}
      {selectedGroup && hasClassToday && (
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{todayStats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: COLORS.success + '20' }]}>
              <Text style={[styles.statNumber, { color: COLORS.success }]}>{todayStats.present}</Text>
              <Text style={styles.statLabel}>Present</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: COLORS.error + '20' }]}>
              <Text style={[styles.statNumber, { color: COLORS.error }]}>{todayStats.absent}</Text>
              <Text style={styles.statLabel}>Absent</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: COLORS.warning + '20' }]}>
              <Text style={[styles.statNumber, { color: COLORS.warning }]}>{todayStats.late}</Text>
              <Text style={styles.statLabel}>Late</Text>
            </View>
          </View>
          <View style={styles.attendanceBar}>
            <View
              style={[
                styles.attendanceBarFill,
                {
                  width: `${todayStats.presentRate}%`,
                  backgroundColor: todayStats.presentRate >= 80 ? COLORS.success : todayStats.presentRate >= 50 ? COLORS.warning : COLORS.error,
                },
              ]}
            />
          </View>
          <Text style={styles.attendanceRate}>{todayStats.presentRate}% Attendance Rate</Text>
        </View>
      )}

      {selectedGroup && hasClassToday && groupStudents.length > 0 && (
        <View style={styles.markingToolbar}>
          <View style={styles.markingProgress}>
            <Text style={styles.markingProgressLabel}>Marked:</Text>
            <Text style={styles.markingProgressValue}>{markedCount}/{todayStats.total}</Text>
          </View>
          {attendanceOpen && unmarkedCount > 0 ? (
            <TouchableOpacity
              style={styles.markRemainingButton}
              onPress={() => void markRemainingPresent()}
              disabled={isBulkMarking}
              accessibilityRole="button"
              accessibilityLabel={markedCount === 0 ? 'Mark all present' : 'Mark remaining present'}
            >
              {isBulkMarking ? (
                <ActivityIndicator size="small" color={COLORS.marbleDark} />
              ) : (
                <Ionicons name="checkmark-done" size={18} color={COLORS.marbleDark} />
              )}
              <Text style={styles.markRemainingText}>
                {markedCount === 0 ? 'Mark all present' : 'Mark remaining present'}
              </Text>
            </TouchableOpacity>
          ) : markedCount === todayStats.total ? (
            <View style={styles.allMarkedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
              <Text style={styles.allMarkedText}>All students are marked</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Student List */}
      <View style={styles.studentList}>
        {selectedGroup ? (
          !hasClassToday ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={64} color={COLORS.textTertiary} />
              <Text style={styles.emptyText}>No class scheduled</Text>
              <Text style={styles.emptySubtext}>
                {selectedGroup.name} does not meet on {getSelectedDateDay()}.
              </Text>
            </View>
          ) : groupStudents.length > 0 ? (
            groupStudents.map((student) => (
              <View
                key={student.id}
                style={[styles.studentCard, isPhoneLayout && styles.studentCardPhone]}
              >
                <TouchableOpacity
                  style={[styles.studentInfo, isPhoneLayout && styles.studentInfoPhone]}
                  onPress={() => openStudentStats(student)}
                >
                  <View style={styles.studentAvatar}>
                    <Text style={styles.studentAvatarText}>
                      {student.first_name[0]}
                      {student.last_name[0]}
                    </Text>
                  </View>
                  <View style={styles.studentDetails}>
                    <Text style={styles.studentName}>
                      {student.first_name} {student.last_name}
                    </Text>
                    <Text style={styles.studentId}>{student.student_id}</Text>
                  </View>
                </TouchableOpacity>

                {canMarkAttendance ? (
                  <View style={[styles.attendanceButtons, isPhoneLayout && styles.attendanceButtonsPhone]}>
                    {ATTENDANCE_STATUSES.map((status) => (
                      <TouchableOpacity
                        key={status.value}
                        style={[
                          styles.statusButton,
                          isPhoneLayout && styles.statusButtonPhone,
                          todayAttendance[student.id] === status.value && {
                            backgroundColor: status.color,
                            borderColor: status.color,
                          },
                          !attendanceOpen && styles.statusButtonDisabled,
                        ]}
                        onPress={() => void markAttendance(student.id, status.value)}
                        disabled={!attendanceOpen || markingStudentIds.has(student.id) || isBulkMarking}
                        accessibilityRole="button"
                        accessibilityLabel={`${student.first_name} ${student.last_name}: ${status.label}`}
                        hitSlop={isPhoneLayout ? 2 : 6}
                      >
                        {markingStudentIds.has(student.id)
                          && todayAttendance[student.id] === status.value ? (
                          <ActivityIndicator size="small" color={COLORS.marbleDark} />
                        ) : (
                          <>
                            <Ionicons
                              name={status.icon as any}
                              size={isPhoneLayout ? 19 : 20}
                              color={
                                todayAttendance[student.id] === status.value
                                  ? COLORS.marbleDark
                                  : status.color
                              }
                            />
                            {isPhoneLayout && (
                              <Text
                                style={[
                                  styles.statusButtonLabel,
                                  { color: todayAttendance[student.id] === status.value ? COLORS.marbleDark : status.color },
                                ]}
                              >
                                {status.label}
                              </Text>
                            )}
                          </>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.readOnlyStatus}>
                    {todayAttendance[student.id] ? (
                      <>
                        <Ionicons
                          name={getStatusIcon(todayAttendance[student.id]) as any}
                          size={18}
                          color={getStatusColor(todayAttendance[student.id])}
                        />
                        <Text style={[styles.readOnlyStatusText, { color: getStatusColor(todayAttendance[student.id]) }]}>
                          {todayAttendance[student.id]}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.unmarkedText}>Unmarked</Text>
                    )}
                  </View>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color={COLORS.textTertiary} />
              <Text style={styles.emptyText}>No students in this group</Text>
              <Text style={styles.emptySubtext}>Add students to the group first</Text>
            </View>
          )
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>Select a group to mark attendance</Text>
          </View>
        )}
      </View>

      {canMarkAttendance && selectedOccurrence && (
        <View testID="attendance-lesson-completion" style={styles.completionCard}>
          <View style={styles.completionCopy}>
            <Text style={styles.completionTitle}>
              {selectedOccurrence.resolution_status === 'resolved' ? 'Lesson completed' : 'Post this lesson to finance'}
            </Text>
            <Text style={styles.completionHint}>
              {selectedOccurrence.resolution_status === 'resolved'
                ? 'Student charges and teacher earnings already include this lesson.'
                : !lessonEnded
                  ? `Available after ${occurrenceTime(selectedOccurrence.ends_at)}.`
                  : markedCount !== todayStats.total
                    ? `Attendance missing for ${Math.max(0, todayStats.total - markedCount)} student(s).`
                    : 'This adds one lesson charge per active student and updates your earnings.'}
            </Text>
          </View>
          {selectedOccurrence.resolution_status !== 'resolved' && (
            <Button
              testID={`attendance-complete-lesson-${selectedOccurrence.id}`}
              title={completingLesson ? 'Completing…' : 'Complete lesson'}
              onPress={() => void completeSelectedLesson()}
              disabled={!lessonEnded || markedCount !== todayStats.total || todayStats.total === 0 || completingLesson}
              style={styles.completeButton}
            />
          )}
        </View>
      )}
      </ScrollView>

      {/* Student Stats Modal */}
      <Modal
        visible={statsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setStatsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Attendance Statistics</Text>
              <TouchableOpacity onPress={() => setStatsModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedStudent && studentStats && (
              <ScrollView style={styles.statsContent}>
                <View style={styles.statsHeader}>
                  <View style={styles.largeAvatar}>
                    <Text style={styles.largeAvatarText}>
                      {selectedStudent.first_name[0]}
                      {selectedStudent.last_name[0]}
                    </Text>
                  </View>
                  <Text style={styles.statsStudentName}>
                    {selectedStudent.first_name} {selectedStudent.last_name}
                  </Text>
                  <Text style={styles.statsStudentId}>{selectedStudent.student_id}</Text>
                </View>

                {/* Attendance Rate Circle */}
                <View style={styles.rateCircleContainer}>
                  <View
                    style={[
                      styles.rateCircle,
                      {
                        borderColor:
                          studentStats.presentRate >= 80
                            ? COLORS.success
                            : studentStats.presentRate >= 50
                            ? COLORS.warning
                            : COLORS.error,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.rateText,
                        {
                          color:
                            studentStats.presentRate >= 80
                              ? COLORS.success
                              : studentStats.presentRate >= 50
                              ? COLORS.warning
                              : COLORS.error,
                        },
                      ]}
                    >
                      {studentStats.presentRate}%
                    </Text>
                    <Text style={styles.rateLabel}>Attendance</Text>
                  </View>
                </View>

                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                  <View style={styles.statsGridItem}>
                    <Ionicons name="calendar" size={24} color={COLORS.textTertiary} />
                    <Text style={styles.statsGridValue}>{studentStats.total}</Text>
                    <Text style={styles.statsGridLabel}>Total Sessions</Text>
                  </View>
                  <View style={styles.statsGridItem}>
                    <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                    <Text style={[styles.statsGridValue, { color: COLORS.success }]}>
                      {studentStats.present}
                    </Text>
                    <Text style={styles.statsGridLabel}>Present</Text>
                  </View>
                  <View style={styles.statsGridItem}>
                    <Ionicons name="close-circle" size={24} color={COLORS.error} />
                    <Text style={[styles.statsGridValue, { color: COLORS.error }]}>
                      {studentStats.absent}
                    </Text>
                    <Text style={styles.statsGridLabel}>Absent</Text>
                  </View>
                  <View style={styles.statsGridItem}>
                    <Ionicons name="time" size={24} color={COLORS.warning} />
                    <Text style={[styles.statsGridValue, { color: COLORS.warning }]}>
                      {studentStats.late}
                    </Text>
                    <Text style={styles.statsGridLabel}>Late</Text>
                  </View>
                </View>

                <Button
                  title="View History"
                  variant="outline"
                  onPress={() => {
                    setStatsModalVisible(false);
                    setHistoryModalVisible(true);
                  }}
                  style={{ marginTop: SIZES.lg }}
                />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Attendance History Modal */}
      <Modal
        visible={historyModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Attendance History</Text>
              <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedStudent && (
              <ScrollView style={styles.historyContent}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyStudentName}>
                    {selectedStudent.first_name} {selectedStudent.last_name}
                  </Text>
                </View>

                {studentHistory.length > 0 ? (
                  studentHistory.slice(0, 30).map((record, index) => (
                    <View key={record.id || index} style={styles.historyItem}>
                      <View style={styles.historyDate}>
                        <Text style={styles.historyDateText}>
                          {formatDate(record.date)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.historyStatus,
                          { backgroundColor: getStatusColor(record.status) + '20' },
                        ]}
                      >
                        <Ionicons
                          name={getStatusIcon(record.status) as any}
                          size={18}
                          color={getStatusColor(record.status)}
                        />
                        <Text
                          style={[styles.historyStatusText, { color: getStatusColor(record.status) }]}
                        >
                          {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="document-outline" size={48} color={COLORS.textTertiary} />
                    <Text style={styles.emptyText}>No attendance records yet</Text>
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
    paddingTop: SIZES.headerTop,
    paddingHorizontal: SIZES.lg,
    paddingBottom: SIZES.md,
    backgroundColor: COLORS.marbleDark,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerPhone: {
    paddingTop: SIZES.headerTop,
    paddingHorizontal: SIZES.md,
    paddingBottom: SIZES.sm,
  },
  headerTitle: {
    fontSize: SIZES.fontXxl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  headerTitlePhone: {
    fontSize: SIZES.fontXl,
  },
  headerSubtitle: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginTop: SIZES.xs,
  },
  pageScroll: {
    flex: 1,
  },
  pageScrollContent: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    paddingBottom: 120,
  },
  groupSelector: {
    padding: SIZES.md,
    maxWidth: 720,
    width: '100%',
  },
  selectorLabel: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SIZES.xs,
  },
  pickerContainer: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
    overflow: 'hidden',
    height: 48,
    justifyContent: 'center',
  },
  picker: {
    width: '100%',
    height: 48,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundCard,
  },
  pickerItem: {
    color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundCard,
  },
  dateNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SIZES.md,
    marginBottom: SIZES.md,
    gap: SIZES.md,
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.backgroundCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundCard,
    paddingHorizontal: SIZES.lg,
    paddingVertical: SIZES.md,
    borderRadius: SIZES.radiusMd,
    gap: SIZES.sm,
  },
  dateText: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  sessionStrip: {
    paddingHorizontal: SIZES.md,
    marginBottom: SIZES.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.sm,
  },
  sessionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusFull,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.xs,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
    gap: SIZES.xs,
  },
  sessionChipSelected: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.gold + '18',
  },
  sessionChipText: {
    fontSize: SIZES.fontSm,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  windowStatus: {
    marginHorizontal: SIZES.md,
    marginBottom: SIZES.md,
    padding: SIZES.md,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    backgroundColor: COLORS.backgroundCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
  },
  windowStatusCopy: {
    flex: 1,
  },
  windowStatusTitle: {
    fontSize: SIZES.fontSm,
    fontWeight: '700',
  },
  windowStatusDetail: {
    marginTop: 2,
    color: COLORS.textSecondary,
    fontSize: SIZES.fontSm,
    lineHeight: 19,
  },
  occurrenceRetry: {
    alignSelf: 'flex-start',
    minHeight: 40,
    marginTop: SIZES.sm,
    paddingHorizontal: SIZES.md,
    borderRadius: SIZES.radiusFull,
    backgroundColor: COLORS.gold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.xs,
  },
  occurrenceRetryText: {
    color: COLORS.marbleDark,
    fontSize: SIZES.fontSm,
    fontWeight: '800',
  },
  todayBadge: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: SIZES.sm,
    paddingVertical: 2,
    borderRadius: SIZES.radiusSm,
  },
  todayText: {
    fontSize: SIZES.fontXs,
    fontWeight: '600',
    color: COLORS.marbleDark,
  },
  statsCard: {
    backgroundColor: COLORS.backgroundCard,
    margin: SIZES.md,
    marginTop: 0,
    borderRadius: 0,
    padding: SIZES.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SIZES.md,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    paddingVertical: SIZES.sm,
    marginHorizontal: 2,
    borderRadius: SIZES.radiusSm,
  },
  statNumber: {
    fontSize: SIZES.fontLg,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: SIZES.fontXs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  attendanceBar: {
    height: 8,
    backgroundColor: COLORS.backgroundLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  attendanceBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  attendanceRate: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SIZES.sm,
  },
  markingToolbar: {
    marginHorizontal: SIZES.md,
    marginBottom: SIZES.md,
    minHeight: SIZES.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.sm,
  },
  completionCard: {
    marginHorizontal: SIZES.md,
    marginBottom: SIZES.md,
    padding: SIZES.md,
    borderRadius: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.gold + '66',
    backgroundColor: COLORS.backgroundCard,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SIZES.md,
  },
  completionCopy: {
    flex: 1,
    minWidth: 220,
  },
  completionTitle: {
    color: COLORS.textPrimary,
    fontSize: SIZES.fontMd,
    fontWeight: '700',
  },
  completionHint: {
    color: COLORS.textSecondary,
    fontSize: SIZES.fontSm,
    lineHeight: 19,
    marginTop: SIZES.xs,
  },
  completeButton: {
    minWidth: 170,
  },
  markingProgress: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SIZES.xs,
  },
  markingProgressLabel: {
    color: COLORS.textSecondary,
    fontSize: SIZES.fontSm,
    fontWeight: '600',
  },
  markingProgressValue: {
    color: COLORS.textPrimary,
    fontSize: SIZES.fontLg,
    fontWeight: 'bold',
  },
  markRemainingButton: {
    minHeight: SIZES.touchTarget,
    flex: 1,
    maxWidth: 230,
    paddingHorizontal: SIZES.md,
    borderRadius: SIZES.radiusMd,
    backgroundColor: COLORS.gold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.xs,
  },
  markRemainingText: {
    color: COLORS.marbleDark,
    fontSize: SIZES.fontSm,
    fontWeight: 'bold',
  },
  allMarkedBadge: {
    minHeight: SIZES.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.xs,
  },
  allMarkedText: {
    color: COLORS.success,
    fontSize: SIZES.fontSm,
    fontWeight: '600',
  },
  studentList: {
    paddingHorizontal: SIZES.md,
  },
  studentCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: SIZES.md,
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  studentCardPhone: {
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: SIZES.md,
  },
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  studentInfoPhone: {
    width: '100%',
    marginBottom: SIZES.sm,
  },
  studentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SIZES.md,
  },
  studentAvatarText: {
    fontSize: SIZES.fontMd,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
  studentDetails: {
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
  attendanceButtons: {
    flexDirection: 'row',
    gap: SIZES.xs,
  },
  attendanceButtonsPhone: {
    width: '100%',
    gap: SIZES.sm,
  },
  readOnlyStatus: {
    minWidth: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.xs,
  },
  readOnlyStatusText: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  unmarkedText: {
    fontSize: SIZES.fontSm,
    color: COLORS.textTertiary,
  },
  statusButton: {
    width: SIZES.touchTarget,
    height: SIZES.touchTarget,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
  },
  statusButtonPhone: {
    width: 'auto',
    height: SIZES.touchTarget,
    flex: 1,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
  },
  statusButtonDisabled: {
    opacity: 0.45,
  },
  statusButtonLabel: {
    fontSize: SIZES.fontSm,
    fontWeight: '700',
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
  emptySubtext: {
    fontSize: SIZES.fontSm,
    color: COLORS.textTertiary,
    marginTop: SIZES.xs,
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
    maxHeight: '85%',
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
  statsContent: {
    padding: SIZES.lg,
  },
  statsHeader: {
    alignItems: 'center',
    marginBottom: SIZES.lg,
  },
  largeAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  largeAvatarText: {
    fontSize: SIZES.fontXxl,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
  statsStudentName: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  statsStudentId: {
    fontSize: SIZES.fontMd,
    color: COLORS.textSecondary,
    marginTop: SIZES.xs,
  },
  rateCircleContainer: {
    alignItems: 'center',
    marginVertical: SIZES.lg,
  },
  rateCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
  },
  rateText: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  rateLabel: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginTop: SIZES.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.sm,
  },
  statsGridItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.backgroundLight,
    padding: SIZES.md,
    borderRadius: SIZES.radiusMd,
    alignItems: 'center',
  },
  statsGridValue: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: SIZES.sm,
  },
  statsGridLabel: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginTop: SIZES.xs,
  },
  historyContent: {
    padding: SIZES.lg,
  },
  historyHeader: {
    marginBottom: SIZES.lg,
  },
  historyStudentName: {
    fontSize: SIZES.fontLg,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    padding: SIZES.md,
    borderRadius: SIZES.radiusMd,
    marginBottom: SIZES.sm,
  },
  historyDate: {
    flex: 1,
  },
  historyDateText: {
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
  },
  historyStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusMd,
    gap: SIZES.xs,
  },
  historyStatusText: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
  },
});
