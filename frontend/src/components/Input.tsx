import React from 'react';
import { View, StyleSheet, TextInputProps } from 'react-native';
import { TextInput, Text } from './LocalizedText';
import { COLORS, SIZES } from '../constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, style, ...props }) => {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor={COLORS.textTertiary}
        {...props}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SIZES.md,
  },
  label: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SIZES.xs,
  },
  input: {
    backgroundColor: COLORS.backgroundLight,
    borderRadius: SIZES.radiusSm,
    minHeight: SIZES.inputHeight,
    paddingHorizontal: SIZES.md,
    paddingVertical: 13,
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  error: {
    fontSize: SIZES.fontXs,
    color: COLORS.error,
    marginTop: SIZES.xs,
  },
});
