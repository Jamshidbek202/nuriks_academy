import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { COLORS, SHADOWS, SIZES } from '../constants/theme';
import { CalendarDatePicker } from './CalendarDatePicker';
import { LocalizedPickerItem, Text } from './LocalizedText';

interface DateTimePickerProps {
  testID?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const validTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

export function TimePicker({ testID, value, onChange }: { testID?: string; value: string; onChange: (value: string) => void }) {
  const normalized = validTime(value) ? value : '00:00';
  const [visible, setVisible] = useState(false);
  const [hour, setHour] = useState(normalized.slice(0, 2));
  const [minute, setMinute] = useState(normalized.slice(3, 5));

  useEffect(() => {
    if (!visible) return;
    setHour(normalized.slice(0, 2));
    setMinute(normalized.slice(3, 5));
  }, [normalized, visible]);

  return (
    <>
      <TouchableOpacity testID={testID} style={styles.timeInput} onPress={() => setVisible(true)} accessibilityRole="button">
        <Ionicons name="time-outline" size={20} color={COLORS.gold} />
        <Text style={styles.timeText}>{normalized}</Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.textTertiary} />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.clockCard}>
            <Text style={styles.clockTitle}>Select time</Text>
            <View style={styles.clockRow}>
              <View style={styles.pickerBox}>
                <Picker testID={`${testID || 'time'}-hour`} selectedValue={hour} onValueChange={setHour} style={styles.picker} dropdownIconColor={COLORS.gold}>
                  {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')).map((item) => (
                    <LocalizedPickerItem key={item} label={item} value={item} />
                  ))}
                </Picker>
              </View>
              <Text style={styles.separator}>:</Text>
              <View style={styles.pickerBox}>
                <Picker testID={`${testID || 'time'}-minute`} selectedValue={minute} onValueChange={setMinute} style={styles.picker} dropdownIconColor={COLORS.gold}>
                  {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map((item) => (
                    <LocalizedPickerItem key={item} label={item} value={item} />
                  ))}
                </Picker>
              </View>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setVisible(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity testID={`${testID || 'time'}-apply`} style={[styles.modalButton, styles.applyButton]} onPress={() => { onChange(`${hour}:${minute}`); setVisible(false); }}><Text style={styles.applyText}>Apply</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

/** A calendar date and a clock time are intentionally separate to prevent ambiguous finance timestamps. */
export function DateTimePicker({ testID, label, value, onChange }: DateTimePickerProps) {
  const [rawDate = '', rawTime = ''] = value.split('T');
  const date = validDate(rawDate) ? rawDate : '';
  const time = validTime(rawTime) ? rawTime : '00:00';

  return (
    <View testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dateTimeRow}>
        <CalendarDatePicker
          testID={`${testID || 'datetime'}-date`}
          value={date}
          onChange={(nextDate) => onChange(`${nextDate}T${time}`)}
          placeholder="Select date"
          style={styles.dateInput}
        />
        <TimePicker
          testID={`${testID || 'datetime'}-time`}
          value={time}
          onChange={(nextTime) => onChange(`${date}T${nextTime}`)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '600', marginBottom: SIZES.xs },
  dateTimeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm, alignItems: 'flex-start', marginBottom: SIZES.md },
  dateInput: { flexGrow: 1, minWidth: 210, marginBottom: 0 },
  timeInput: { minHeight: 50, minWidth: 130, borderWidth: 1, borderColor: COLORS.marbleGray, borderRadius: SIZES.radiusMd, paddingHorizontal: SIZES.md, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, backgroundColor: COLORS.backgroundCard },
  timeText: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontVariant: ['tabular-nums'] },
  overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center', padding: SIZES.lg },
  clockCard: { width: '100%', maxWidth: 420, borderRadius: SIZES.radiusLg, padding: SIZES.lg, backgroundColor: COLORS.backgroundCard, ...SHADOWS.large },
  clockTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '700', textAlign: 'center', marginBottom: SIZES.md },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  pickerBox: { flex: 1, minHeight: 52, borderWidth: 1, borderColor: COLORS.marbleGray, borderRadius: SIZES.radiusMd, overflow: 'hidden', backgroundColor: COLORS.backgroundLight },
  picker: { color: COLORS.textPrimary, minHeight: 52 },
  separator: { color: COLORS.textPrimary, fontSize: SIZES.fontXl, fontWeight: '800' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SIZES.sm, marginTop: SIZES.lg },
  modalButton: { minHeight: 44, minWidth: 88, alignItems: 'center', justifyContent: 'center', borderRadius: SIZES.radiusMd, paddingHorizontal: SIZES.md },
  applyButton: { backgroundColor: COLORS.gold },
  cancelText: { color: COLORS.gold, fontWeight: '700' },
  applyText: { color: COLORS.marbleDark, fontWeight: '800' },
});
