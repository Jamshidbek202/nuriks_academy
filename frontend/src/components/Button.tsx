import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'outline';
  style?: ViewStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
}) => {
  if (variant === 'primary') {
    return (
      <TouchableOpacity
        style={[styles.button, disabled && styles.disabled, style]}
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[COLORS.gold, COLORS.goldDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.marbleDark} />
          ) : (
            <Text style={styles.primaryText}>{title}</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
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
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: SIZES.radiusMd,
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  gradient: {
    padding: SIZES.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  secondary: {
    backgroundColor: COLORS.backgroundCard,
    padding: SIZES.md,
    alignItems: 'center',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.gold,
    padding: SIZES.md,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
  },
  primaryText: {
    color: COLORS.marbleDark,
    fontSize: SIZES.fontMd,
    fontWeight: 'bold',
  },
  secondaryText: {
    color: COLORS.textPrimary,
  },
  outlineText: {
    color: COLORS.gold,
  },
});