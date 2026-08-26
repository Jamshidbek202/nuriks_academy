import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Text } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SHADOWS, SIZES } from '../../src/constants/theme';
import { useUnreadNotifications } from '../../src/hooks/use-unread-notifications';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';
import {
  AdaptiveColumns,
  AdaptiveGrid,
  AdaptivePageHeader,
  AdaptiveScrollView,
  AdaptiveSectionHeading,
} from '../../src/components/AdaptiveLayout';
import { MotionListItem, MotionReveal, MotionTouchableOpacity } from '../../src/components/Motion';

interface Group {
  id: string;
  name: string;
  course_id: string;
  student_ids: string[];
  schedule: { day: string; start_time: string; end_time: string; room?: string }[];
}

interface TodayClass {
  group: Group;
  schedule: { day: string; start_time: string; end_time: string; room?: string };
}

interface Course {
  id: string;
  name: string;
}

interface Student {
  id: string;
}

export default function TeacherHomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const unreadNotifications = useUnreadNotifications();
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = dayNames[new Date().getDay()];

  useLiveRefresh(
    () => loadTeacherData(),
    true,
    `teacher-membership:${user?.id || user?._id || ''}`,
    3000,
  );

  const loadTeacherData = async () => {
    try {
      // Get all groups and filter by teacher
      const [groupsRes, coursesRes, studentsRes] = await Promise.all([
        api.get('/groups'),
        api.get('/courses'),
        api.get('/students'),
      ]);

      setCourses(coursesRes.data);
      setStudents(studentsRes.data);

      // Show groups assigned to this teacher
      const teacherGroups = groupsRes.data;
      setGroups(teacherGroups);

      // Find today's classes
      const todaySchedule: TodayClass[] = [];
      teacherGroups.forEach((group: Group) => {
        if (group.schedule) {
          group.schedule.forEach((sched) => {
          if (sched.day.toLowerCase() === today.toLowerCase()) {
              todaySchedule.push({ group, schedule: sched });
            }
          });
        }
      });
      todaySchedule.sort((a, b) => a.schedule.start_time.localeCompare(b.schedule.start_time));
      setTodayClasses(todaySchedule);
    } catch (error) {
      console.error('Error loading teacher data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getCourseName = (courseId: string) => {
    const course = courses.find(c => c.id === courseId);
    return course ? course.name : 'Unknown';
  };

  const getTotalStudents = () => {
    const activeStudentIds = new Set(students.map((student) => student.id));
    const uniqueGroupStudentIds = new Set<string>();
    groups.forEach((group) => {
      group.student_ids?.forEach((studentId) => {
        if (activeStudentIds.has(studentId)) {
          uniqueGroupStudentIds.add(studentId);
        }
      });
    });
    return uniqueGroupStudentIds.size;
  };

  const getGroupStudentCount = (group: Group) => {
    const activeStudentIds = new Set(students.map((student) => student.id));
    return (group.student_ids || []).filter((studentId) => activeStudentIds.has(studentId)).length;
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
      <AdaptivePageHeader
        title="Teaching workspace"
        description={`${user?.full_name || 'Teacher'} · ${today}'s schedule, attendance, and class work`}
        action={<MotionTouchableOpacity accessibilityLabel="Open notifications" style={styles.headerBadge} onPress={() => router.push('/(dashboard)/notifications')}>
          <Ionicons name="notifications" size={24} color={COLORS.gold} />
          {unreadNotifications > 0 && <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{Math.min(unreadNotifications, 99)}</Text></View>}
        </MotionTouchableOpacity>}
      />

      <AdaptiveScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTeacherData(); }} tintColor={COLORS.gold} />
        }
      >
        <MotionReveal>
        <AdaptiveGrid minItemWidth={170} maxColumns={3} style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="people-circle" size={28} color={COLORS.gold} />
            <Text style={styles.statValue}>{groups.length}</Text>
            <Text style={styles.statLabel}>My Groups</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="people" size={28} color={COLORS.info} />
            <Text style={styles.statValue}>{getTotalStudents()}</Text>
            <Text style={styles.statLabel}>Students</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="today" size={28} color={COLORS.success} />
            <Text style={styles.statValue}>{todayClasses.length}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
        </AdaptiveGrid>
        </MotionReveal>

        <AdaptiveColumns collapseAt="compact" gap={SIZES.lg}>
          <View>
            <AdaptiveSectionHeading
              title={`Today · ${today}`}
              description={todayClasses.length ? `${todayClasses.length} scheduled ${todayClasses.length === 1 ? 'class' : 'classes'}` : 'No classes scheduled'}
            />
            {todayClasses.length > 0 ? todayClasses.map((item, idx) => (
            <MotionListItem key={`${item.group.id}-${item.schedule.start_time}`} index={idx} style={styles.scheduleCard}>
              <View style={styles.scheduleTime}>
                <Text style={styles.timeText}>{item.schedule.start_time}</Text>
                <Text style={styles.timeDivider}>-</Text>
                <Text style={styles.timeText}>{item.schedule.end_time}</Text>
              </View>
              <View style={styles.scheduleInfo}>
                <Text style={styles.groupName}>{item.group.name}</Text>
                <Text style={styles.courseName}>{getCourseName(item.group.course_id)}</Text>
                {item.schedule.room && (
                  <View style={styles.roomBadge}>
                    <Ionicons name="location" size={12} color={COLORS.textTertiary} />
                    <Text style={styles.roomText}>Room {item.schedule.room}</Text>
                  </View>
                )}
              </View>
              <MotionTouchableOpacity
                accessibilityLabel={`Open attendance for ${item.group.name}`}
                style={styles.attendanceButton}
                onPress={() => router.push('/(dashboard)/attendance')}
              >
                <Ionicons name="checkbox" size={20} color={COLORS.gold} />
              </MotionTouchableOpacity>
            </MotionListItem>
            )) : <View style={styles.emptySchedule}>
            <Ionicons name="calendar-outline" size={48} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>No classes scheduled for today</Text>
          </View>}
          </View>

          <View>
        <AdaptiveSectionHeading title="Class tools" description="The actions used during and after a lesson" />
        <AdaptiveGrid minItemWidth={132} maxColumns={2} style={styles.actionsGrid}>
          <MotionTouchableOpacity style={styles.actionCard} onPress={() => router.push('/(dashboard)/attendance')}>
            <Ionicons name="checkbox" size={28} color={COLORS.gold} />
            <Text style={styles.actionText}>Mark Attendance</Text>
          </MotionTouchableOpacity>
          <MotionTouchableOpacity style={styles.actionCard} onPress={() => router.push('/(dashboard)/journal')}>
            <Ionicons name="journal" size={28} color={COLORS.gold} />
            <Text style={styles.actionText}>Journal</Text>
          </MotionTouchableOpacity>
          <MotionTouchableOpacity style={styles.actionCard} onPress={() => router.push('/(dashboard)/homework')}>
            <Ionicons name="book" size={28} color={COLORS.gold} />
            <Text style={styles.actionText}>Homework</Text>
          </MotionTouchableOpacity>
          <MotionTouchableOpacity style={styles.actionCard} onPress={() => router.push('/(dashboard)/tests')}>
            <Ionicons name="clipboard" size={28} color={COLORS.gold} />
            <Text style={styles.actionText}>Tests</Text>
          </MotionTouchableOpacity>
        </AdaptiveGrid>

        <AdaptiveSectionHeading title="My groups" description={`${groups.length} assigned`} />
        {groups.map((group, index) => (
          <MotionListItem key={group.id} index={index}>
          <MotionTouchableOpacity
            key={group.id}
            style={styles.groupCard}
            onPress={() => router.push('/(dashboard)/groups')}
          >
            <View style={styles.groupIcon}>
              <Ionicons name="people-circle" size={32} color={COLORS.gold} />
            </View>
            <View style={styles.groupInfo}>
              <Text style={styles.groupTitle}>{group.name}</Text>
              <Text style={styles.groupCourse}>{getCourseName(group.course_id)}</Text>
              <View style={styles.groupMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="people" size={14} color={COLORS.textTertiary} />
                  <Text style={styles.metaText}>{getGroupStudentCount(group)} students</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar" size={14} color={COLORS.textTertiary} />
                  <Text style={styles.metaText}>{group.schedule?.length || 0} sessions/week</Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
          </MotionTouchableOpacity>
          </MotionListItem>
        ))}
          </View>
        </AdaptiveColumns>
      </AdaptiveScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  headerBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.gold + '20', justifyContent: 'center', alignItems: 'center' },
  unreadBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center' },
  unreadBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  content: { flex: 1 },
  statsRow: { marginBottom: SIZES.sm },
  statCard: { minHeight: 112, backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.glassHighlight, padding: SIZES.md, alignItems: 'flex-start', justifyContent: 'center', ...SHADOWS.small },
  statValue: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: SIZES.sm },
  statLabel: { fontSize: SIZES.fontXs, color: COLORS.textSecondary, marginTop: 2 },
  scheduleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, borderWidth: 1, borderColor: COLORS.goldHairline, ...SHADOWS.small },
  scheduleTime: { alignItems: 'center', marginRight: SIZES.md, minWidth: 60 },
  timeText: { fontSize: SIZES.fontMd, fontWeight: 'bold', color: COLORS.gold },
  timeDivider: { fontSize: SIZES.fontSm, color: COLORS.textTertiary },
  scheduleInfo: { flex: 1 },
  groupName: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  courseName: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  roomBadge: { flexDirection: 'row', alignItems: 'center', marginTop: SIZES.xs, gap: 4 },
  roomText: { fontSize: SIZES.fontXs, color: COLORS.textTertiary },
  attendanceButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.gold + '20', justifyContent: 'center', alignItems: 'center' },
  emptySchedule: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.glassHighlight, padding: SIZES.xl, alignItems: 'center', marginBottom: SIZES.md, ...SHADOWS.small },
  emptyText: { fontSize: SIZES.fontSm, color: COLORS.textTertiary, marginTop: SIZES.md },
  actionsGrid: { marginBottom: SIZES.sm },
  actionCard: { minHeight: 108, backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.glassHighlight, padding: SIZES.md, alignItems: 'flex-start', justifyContent: 'space-between', ...SHADOWS.small },
  actionText: { fontSize: SIZES.fontSm, color: COLORS.textPrimary, marginTop: SIZES.sm },
  groupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, borderWidth: 1, borderColor: COLORS.glassHighlight, ...SHADOWS.small },
  groupIcon: { width: 48, height: 48, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.goldGlass, justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  groupInfo: { flex: 1 },
  groupTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  groupCourse: { fontSize: SIZES.fontSm, color: COLORS.gold, marginTop: 2 },
  groupMeta: { flexDirection: 'row', gap: SIZES.md, marginTop: SIZES.xs },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: SIZES.fontXs, color: COLORS.textTertiary },
});
