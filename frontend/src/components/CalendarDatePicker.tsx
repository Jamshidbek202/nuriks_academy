import { getActiveLocale } from '../i18n/translations';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Text } from './LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, SIZES } from '../constants/theme';

interface CalendarDatePickerProps {
  testID?: string;
  label?: string;
  value: string;
  onChange: (date: string) => void;
  minimumDate?: string;
  maximumDate?: string;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  mode?: 'date' | 'month';
  highlightedWeekdays?: number[];
  highlightHint?: string;
}

function parseDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function CalendarDatePicker({
  testID,
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  placeholder = 'Select a date',
  style,
  mode = 'date',
  highlightedWeekdays = [],
  highlightHint,
}: CalendarDatePickerProps) {
  const [visible, setVisible] = useState(false);
  const selectedDate = parseDate(mode === 'month' && /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate || parseDate(minimumDate) || new Date());
  const minimum = parseDate(minimumDate);
  const maximum = parseDate(maximumDate);
  const weekdays = Array.from({ length: 7 }, (_, day) => (
    new Intl.DateTimeFormat(getActiveLocale(), { weekday: 'short' }).format(new Date(2026, 0, 4 + day))
  ));

  useEffect(() => {
    if (visible) {
      setVisibleMonth(parseDate(mode === 'month' ? `${value}-01` : value) || parseDate(minimumDate) || new Date());
    }
  }, [visible, value, minimumDate, mode]);

  const days = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const canMoveTo = (offset: number) => {
    const candidate = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    const monthEnd = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0);
    return (!minimum || monthEnd >= minimum) && (!maximum || candidate <= maximum);
  };

  const moveMonth = (offset: number) => {
    if (!canMoveTo(offset)) return;
    setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1));
  };

  const canMoveYear = (offset: number) => {
    const year = visibleMonth.getFullYear() + offset;
    return (!minimum || year >= minimum.getFullYear()) && (!maximum || year <= maximum.getFullYear());
  };

  const moveYear = (offset: number) => {
    if (canMoveYear(offset)) setVisibleMonth(new Date(visibleMonth.getFullYear() + offset, 0, 1));
  };

  const formattedValue = selectedDate?.toLocaleDateString(getActiveLocale(), mode === 'month'
    ? { month: 'long', year: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity testID={testID} style={[styles.input, style]} onPress={() => setVisible(true)} accessibilityRole="button" accessibilityLabel={value || placeholder}>
        <Ionicons name="calendar-outline" size={20} color={COLORS.gold} />
        <Text style={[styles.inputText, !formattedValue && styles.placeholder]}>
          {formattedValue || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.textTertiary} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.calendar}>
            <View style={styles.header}>
              <TouchableOpacity testID={`${testID || 'calendar'}-previous`} disabled={mode === 'month' ? !canMoveYear(-1) : !canMoveTo(-1)} onPress={() => mode === 'month' ? moveYear(-1) : moveMonth(-1)} style={styles.iconButton}>
                <Ionicons name="chevron-back" size={24} color={(mode === 'month' ? canMoveYear(-1) : canMoveTo(-1)) ? COLORS.textPrimary : COLORS.textTertiary} />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>
                {mode === 'month' ? visibleMonth.getFullYear() : visibleMonth.toLocaleDateString(getActiveLocale(), { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity testID={`${testID || 'calendar'}-next`} disabled={mode === 'month' ? !canMoveYear(1) : !canMoveTo(1)} onPress={() => mode === 'month' ? moveYear(1) : moveMonth(1)} style={styles.iconButton}>
                <Ionicons name="chevron-forward" size={24} color={(mode === 'month' ? canMoveYear(1) : canMoveTo(1)) ? COLORS.textPrimary : COLORS.textTertiary} />
              </TouchableOpacity>
            </View>

            {mode === 'month' ? (
              <View style={styles.monthGrid}>
                {Array.from({ length: 12 }, (_, month) => {
                  const candidate = new Date(visibleMonth.getFullYear(), month, 1);
                  const candidateEnd = new Date(visibleMonth.getFullYear(), month + 1, 0);
                  const monthValue = `${visibleMonth.getFullYear()}-${String(month + 1).padStart(2, '0')}`;
                  const disabled = Boolean((minimum && candidateEnd < minimum) || (maximum && candidate > maximum));
                  return (
                    <TouchableOpacity
                      testID={`${testID || 'calendar'}-option-${monthValue}`}
                      key={monthValue}
                      disabled={disabled}
                      style={[styles.monthButton, value === monthValue && styles.selectedDay]}
                      onPress={() => { onChange(monthValue); setVisible(false); }}
                    >
                      <Text style={[styles.dayText, disabled && styles.disabled, value === monthValue && styles.selectedDayText]}>
                        {candidate.toLocaleDateString(getActiveLocale(), { month: 'short' })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : <View style={styles.grid}>
              {weekdays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}
              {days.map((date) => {
                const dateValue = toDateString(date);
                const disabled = Boolean((minimum && date < minimum) || (maximum && date > maximum));
                const outsideMonth = date.getMonth() !== visibleMonth.getMonth();
                const selected = dateValue === value;
                const highlighted = highlightedWeekdays.includes(date.getDay());
                return (
                  <TouchableOpacity
                    testID={`${testID || 'calendar'}-option-${dateValue}`}
                    key={dateValue}
                    disabled={disabled}
                    style={[styles.day, selected && styles.selectedDay]}
                    onPress={() => { onChange(dateValue); setVisible(false); }}
                  >
                    <Text style={[
                      styles.dayText,
                      outsideMonth && styles.outsideMonth,
                      disabled && styles.disabled,
                      selected && styles.selectedDayText,
                    ]}>{date.getDate()}</Text>
                    {highlighted && !selected ? <View style={styles.classDayDot} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>}

            {highlightHint && mode === 'date' ? (
              <View style={styles.hintRow}>
                <View style={styles.classDayDot} />
                <Text style={styles.hintText}>{highlightHint}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.cancelButton} onPress={() => setVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '600', marginBottom: SIZES.xs },
  input: { minHeight: 50, borderWidth: 1, borderColor: COLORS.marbleGray, borderRadius: SIZES.radiusMd, paddingHorizontal: SIZES.md, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, backgroundColor: COLORS.backgroundCard, marginBottom: SIZES.md },
  inputText: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontMd },
  placeholder: { color: COLORS.textTertiary },
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center', padding: SIZES.lg },
  calendar: { width: '100%', maxWidth: 420, borderRadius: SIZES.radiusLg, padding: SIZES.md, backgroundColor: COLORS.backgroundCard, ...SHADOWS.large },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SIZES.md },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm },
  monthButton: { width: '22%', flexGrow: 1, paddingVertical: SIZES.md, alignItems: 'center', borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundLight },
  weekday: { width: '14.2857%', textAlign: 'center', color: COLORS.textTertiary, fontSize: SIZES.fontXs, fontWeight: '700', paddingVertical: SIZES.sm },
  day: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  classDayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.gold, marginTop: 2 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.sm, paddingTop: SIZES.sm },
  hintText: { color: COLORS.textSecondary, fontSize: SIZES.fontXs },
  dayText: { color: COLORS.textPrimary, fontSize: SIZES.fontSm },
  outsideMonth: { color: COLORS.textTertiary },
  disabled: { opacity: 0.25 },
  selectedDay: { backgroundColor: COLORS.gold },
  selectedDayText: { color: COLORS.marbleDark, fontWeight: '800' },
  cancelButton: { alignSelf: 'flex-end', paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, marginTop: SIZES.sm },
  cancelText: { color: COLORS.gold, fontWeight: '700' },
});
