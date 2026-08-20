import React from 'react';
import { StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { Text } from './LocalizedText';
import { MotionTouchableOpacity } from './Motion';
import { COLORS, SIZES } from '../constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'outline';
  style?: ViewStyle;
  testID?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
  testID,
}) => {
  if (variant === 'primary') {
    return (
      <MotionTouchableOpacity
        testID={testID}
        accessibilityRole="button"
        style={[styles.button, styles.primary, disabled && styles.disabled, style]}
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.82}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.textOnGold} />
        ) : (
          <Text style={styles.primaryText}>{title}</Text>
        )}
      </MotionTouchableOpacity>
    );
  }

  return (
    <MotionTouchableOpacity
      testID={testID}
      accessibilityRole="button"
      style={[styles.button, styles[variant], disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.gold} />
      ) : (
        <Text style={[styles.text, styles[`${variant}Text`]]}>{title}</Text>
      )}
    </MotionTouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: SIZES.radiusSm,
    overflow: 'hidden',
    minHeight: SIZES.touchTarget,
    paddingHorizontal: SIZES.lg,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: COLORS.gold,
    borderWidth: 1,
    borderColor: COLORS.goldLight,
  },
  secondary: {
    backgroundColor: COLORS.backgroundLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
  },
  primaryText: {
    color: COLORS.textOnGold,
    fontSize: SIZES.fontMd,
    fontWeight: '700',
  },
  secondaryText: {
    color: COLORS.textPrimary,
  },
  outlineText: {
    color: COLORS.textPrimary,
  },
});
