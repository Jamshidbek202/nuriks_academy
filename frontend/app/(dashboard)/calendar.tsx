import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Text } from '../../src/components/LocalizedText';
import { api } from '../../src/services/api';
import { COLORS, LAYOUT, SHADOWS, SIZES } from '../../src/constants/theme';
import { ConcourseAtmosphere, ConcourseGlassLayer } from '../../src/components/ConcourseAtmosphere';
import { MotionListItem, MotionReveal } from '../../src/components/Motion';
import { getActiveLocale } from '../../src/i18n/translations';

type CalendarEvent = {
  id: string;
  type: 'class' | 'homework' | 'test';
  title: string;
  group_id: string;
  group_name: string;
  starts_at: string;
  ends_at?: string;
  date: string;
  status: string;
  detail: string;
};

const dayKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const monthWindow = (month: Date) => ({
  start: dayKey(new Date(month.getFullYear(), month.getMonth(), 1)),
  end: dayKey(new Date(month.getFullYear(), month.getMonth() + 1, 0)),
});

const EVENT_META = {
  class: { icon: 'school-outline' as const, label: 'Class', color: COLORS.success },
  homework: { icon: 'book-outline' as const, label: 'Homework', color: COLORS.gold },
  test: { icon: 'clipboard-outline' as const, label: 'Test', color: COLORS.warning },
};

export default function AcademicCalendarScreen() {
  const router = useRouter();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => dayKey(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCalendar = useCallback(async () => {
    const range = monthWindow(month);
    try {
      const response = await api.get('/calendar', { params: range });
      setEvents(response.data?.events || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month]);

  useFocusEffect(useCallback(() => { void loadCalendar(); }, [loadCalendar]));

  const eventsByDate = useMemo(() => {
    const result: Record<string, CalendarEvent[]> = {};
    events.forEach((event) => {
      (result[event.date] ||= []).push(event);
    });
    return result;
  }, [events]);

  const gridDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const value = new Date(start);
      value.setDate(start.getDate() + index);
      return value;
    });
  }, [month]);

  const selectedEvents = eventsByDate[selectedDate] || [];
  const monthTitle = month.toLocaleDateString(getActiveLocale(), { month: 'long', year: 'numeric' });
  const selectedTitle = new Date(`${selectedDate}T12:00:00`).toLocaleDateString(getActiveLocale(), {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <View style={styles.container}>
      <ConcourseAtmosphere />
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={COLORS.gold} onRefresh={() => { setRefreshing(true); void loadCalendar(); }} />}
      >
        <View style={styles.topBar}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" style={styles.roundButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.titleCopy}>
            <Text style={styles.title}>Calendar</Text>
            <Text style={styles.subtitle}>Classes, homework, and tests in one timeline</Text>
          </View>
          <Image source={require('../../assets/illustrations/calendar.png')} style={styles.illustration} resizeMode="contain" />
        </View>

        <MotionReveal style={styles.calendarCard} duration={260} distance={8}>
          <ConcourseGlassLayer tone="neutral" intensity={52} />
          <View style={styles.monthHeader}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous month" style={styles.monthButton} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <Ionicons name="chevron-back" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{monthTitle}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next month" style={styles.monthButton} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={styles.weekHeader}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}
          </View>
          <View style={styles.grid}>
            {gridDays.map((date) => {
              const key = dayKey(date);
              const dayEvents = eventsByDate[key] || [];
              const currentMonth = date.getMonth() === month.getMonth();
              const selected = key === selectedDate;
              return (
                <TouchableOpacity
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${date.toLocaleDateString(getActiveLocale())}, ${dayEvents.length} events`}
                  onPress={() => setSelectedDate(key)}
                  style={[styles.day, selected && styles.daySelected]}
                >
                  <Text style={[styles.dayNumber, !currentMonth && styles.dayOutside, selected && styles.dayNumberSelected]}>{date.getDate()}</Text>
                  <View style={styles.dots}>
                    {(['class', 'homework', 'test'] as const).filter((type) => dayEvents.some((event) => event.type === type)).map((type) => (
                      <View key={type} style={[styles.dot, { backgroundColor: EVENT_META[type].color }]} />
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </MotionReveal>

        <View style={styles.agendaHeader}>
          <View>
            <Text style={styles.agendaTitle}>{selectedTitle}</Text>
            <Text style={styles.agendaMeta}>{selectedEvents.length ? `${selectedEvents.length} scheduled items` : 'No scheduled items'}</Text>
          </View>
          <TouchableOpacity style={styles.todayButton} onPress={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(dayKey(today)); }}>
            <Text style={styles.todayText}>Today</Text>
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator size="large" color={COLORS.gold} style={styles.loader} /> : selectedEvents.length ? selectedEvents.map((event, index) => {
          const meta = EVENT_META[event.type];
          const time = new Date(event.starts_at).toLocaleTimeString(getActiveLocale(), { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
          return (
            <MotionListItem key={`${event.type}-${event.id}`} index={index} style={styles.eventCard}>
              <View style={[styles.eventIcon, { backgroundColor: `${meta.color}18`, borderColor: `${meta.color}45` }]}>
                <Ionicons name={meta.icon} size={22} color={meta.color} />
              </View>
              <View style={styles.eventCopy}>
                <View style={styles.eventTitleRow}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventTime}>{time}</Text>
                </View>
                <Text style={styles.eventMeta}>{meta.label} · {event.group_name}</Text>
                <Text style={styles.eventDetail}>{event.detail}</Text>
              </View>
            </MotionListItem>
          );
        }) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-clear-outline" size={42} color={COLORS.gold} />
            <Text style={styles.emptyTitle}>Nothing scheduled</Text>
            <Text style={styles.emptyCopy}>Select another date or move to a different month.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  page: { width: '100%', maxWidth: LAYOUT.contentMaxWidth, alignSelf: 'center', padding: SIZES.lg, paddingTop: SIZES.headerTop, paddingBottom: 120 },
  topBar: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: SIZES.md, marginBottom: SIZES.lg },
  roundButton: { width: 46, height: 46, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassHighlight },
  titleCopy: { flex: 1, minWidth: 0 },
  title: { color: COLORS.textPrimary, fontSize: SIZES.fontXxl, lineHeight: 39, fontWeight: '850' as any },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, lineHeight: 19, marginTop: 3 },
  illustration: { width: 92, height: 92 },
  calendarCard: { position: 'relative', overflow: 'hidden', borderRadius: SIZES.radiusXl, borderWidth: 1, borderColor: COLORS.glassHighlight, padding: SIZES.md, ...SHADOWS.medium },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SIZES.sm },
  monthButton: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.045)' },
  monthTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800', textTransform: 'capitalize' },
  weekHeader: { flexDirection: 'row' },
  weekday: { width: '14.2857%', textAlign: 'center', color: COLORS.textTertiary, fontSize: 11, fontWeight: '750' as any, paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.2857%', minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 16, gap: 5 },
  daySelected: { backgroundColor: COLORS.gold },
  dayNumber: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '650' as any },
  dayOutside: { color: COLORS.textTertiary, opacity: 0.45 },
  dayNumberSelected: { color: COLORS.textOnGold, fontWeight: '850' as any },
  dots: { height: 4, flexDirection: 'row', gap: 3 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  agendaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SIZES.md, marginTop: SIZES.xl, marginBottom: SIZES.md },
  agendaTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800', textTransform: 'capitalize' },
  agendaMeta: { color: COLORS.textTertiary, fontSize: SIZES.fontXs, marginTop: 3 },
  todayButton: { paddingHorizontal: SIZES.md, paddingVertical: 10, borderRadius: SIZES.radiusFull, backgroundColor: COLORS.goldGlass, borderWidth: 1, borderColor: COLORS.goldHairline },
  todayText: { color: COLORS.goldLight, fontSize: SIZES.fontSm, fontWeight: '800' },
  loader: { marginTop: SIZES.xl },
  eventCard: { flexDirection: 'row', gap: SIZES.md, padding: SIZES.md, marginBottom: SIZES.sm, borderRadius: SIZES.radiusLg, backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassHighlight },
  eventIcon: { width: 48, height: 48, borderRadius: SIZES.radiusMd, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  eventCopy: { flex: 1, minWidth: 0 },
  eventTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: SIZES.sm },
  eventTitle: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '800' },
  eventTime: { color: COLORS.goldLight, fontSize: SIZES.fontSm, fontWeight: '750' as any },
  eventMeta: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: 4 },
  eventDetail: { color: COLORS.textTertiary, fontSize: SIZES.fontXs, marginTop: 3 },
  emptyState: { alignItems: 'center', padding: SIZES.xl, borderRadius: SIZES.radiusLg, backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassHighlight },
  emptyTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800', marginTop: SIZES.md },
  emptyCopy: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, textAlign: 'center', marginTop: 5 },
});
