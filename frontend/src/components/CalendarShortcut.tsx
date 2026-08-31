import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SHADOWS } from '../constants/theme';

export function CalendarShortcut({ style }: { style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Open academic calendar"
      activeOpacity={0.78}
      style={[styles.button, style]}
      onPress={() => router.push('/(dashboard)/calendar')}
    >
      <Ionicons name="calendar-outline" size={22} color={COLORS.goldLight} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.goldGlass,
    borderWidth: 1,
    borderColor: COLORS.goldHairline,
    ...SHADOWS.small,
  },
});
