import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';

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
}

interface Student {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
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
];

export default function AttendanceScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [markingModalVisible, setMarkingModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentHistory, setStudentHistory] = useState<AttendanceRecord[]>([]);
  const [studentStats, setStudentStats] = useState<AttendanceStats | null>(null);

  // Today's attendance for current group
  const [todayAttendance, setTodayAttendance] = useState<Record<string, string>>({});

  useEffect(() => {
    loadGroups();
    loadStudents();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      loadGroupAttendance();
    }
  }, [selectedGroup, selectedDate]);

  const loadGroups = async () => {
    try {
      const response = await api.get('/groups');
      setGroups(response.data);
      if (response.data.length > 0) {
        setSelectedGroup(response.data[0]);
      }
    } catch (error) {
      console.error('Error loading groups:', error);
      Alert.alert('Error', 'Failed to load groups');
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

  const loadGroupAttendance = async () => {
    if (!selectedGroup) return;

    try {
      const response = await api.get(`/attendance/group/${selectedGroup.id}`);
      setAttendanceRecords(response.data);

      // Build today's attendance map
      const today = selectedDate;
      const todayRecords = response.data.filter(
        (r: AttendanceRecord) => r.date.split('T')[0] === today
      );
      const attendanceMap: Record<string, string> = {};
      todayRecords.forEach((r: AttendanceRecord) => {
        attendanceMap[r.student_id] = r.status;
      });
      setTodayAttendance(attendanceMap);
    } catch (error) {
      console.error('Error loading attendance:', error);
    } finally {
      setRefreshing(false);
    }
  };

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

  const markAttendance = async (studentId: string, status: string) => {
    if (!selectedGroup) return;

    try {
      await api.post('/attendance', {
        student_id: studentId,
        group_id: selectedGroup.id,
        date: selectedDate + 'T00:00:00',
        status: status,
      });

      // Update local state
      setTodayAttendance((prev) => ({
        ...prev,
        [studentId]: status,
      }));

      // Reload attendance for fresh data
      loadGroupAttendance();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to mark attendance');
    }
  };

  const getGroupStudents = () => {
    if (!selectedGroup) return [];
    return students.filter((s) => selectedGroup.student_ids.includes(s.id));
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

  const openHistoryModal = (student: Student) => {
    setSelectedStudent(student);
    loadStudentHistory(student.id);
    setHistoryModalVisible(true);
  };

  const changeDate = (days: number) => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + days);
    setSelectedDate(currentDate.toISOString().split('T')[0]);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Attendance</Text>
          <Text style={styles.headerSubtitle}>Mark and track student attendance</Text>
        </View>
      </View>

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
            dropdownIconColor={COLORS.gold}
          >
            <Picker.Item label="Select a group" value="" />
            {groups.map((group) => (
              <Picker.Item key={group.id} label={group.name} value={group.id} />
            ))}
          </Picker>
        </View>
      </View>

      {/* Date Navigator */}
      <View style={styles.dateNavigator}>
        <TouchableOpacity style={styles.navButton} onPress={() => changeDate(-1)}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.dateDisplay}>
          <Ionicons name="calendar" size={20} color={COLORS.gold} />
          <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
          {selectedDate === new Date().toISOString().split('T')[0] && (
            <View style={styles.todayBadge}>
              <Text style={styles.todayText}>Today</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => changeDate(1)}>
          <Ionicons name="chevron-forward" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Today's Stats */}
      {selectedGroup && (
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

      {/* Student List */}
      <ScrollView
        style={styles.studentList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadGroupAttendance();
            }}
            tintColor={COLORS.gold}
          />
        }
      >
        {selectedGroup ? (
          groupStudents.length > 0 ? (
            groupStudents.map((student) => (
              <View key={student.id} style={styles.studentCard}>
                <TouchableOpacity
                  style={styles.studentInfo}
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

                <View style={styles.attendanceButtons}>
                  {ATTENDANCE_STATUSES.map((status) => (
                    <TouchableOpacity
                      key={status.value}
                      style={[
                        styles.statusButton,
                        todayAttendance[student.id] === status.value && {
                          backgroundColor: status.color,
                          borderColor: status.color,
                        },
                      ]}
                      onPress={() => markAttendance(student.id, status.value)}
                    >
                      <Ionicons
                        name={status.icon as any}
                        size={20}
                        color={
                          todayAttendance[student.id] === status.value
                            ? COLORS.marbleDark
                            : status.color
                        }
                      />
                    </TouchableOpacity>
                  ))}
                </View>
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
  groupSelector: {
    padding: SIZES.md,
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
  },
  picker: {
    color: COLORS.textPrimary,
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
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    ...SHADOWS.small,
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
  studentList: {
    flex: 1,
    paddingHorizontal: SIZES.md,
  },
  studentCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.small,
  },
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  statusButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.marbleGray,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
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
