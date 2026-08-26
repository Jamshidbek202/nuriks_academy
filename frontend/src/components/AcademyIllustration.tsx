import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

type Variant = 'login' | 'student' | 'parent' | 'empty';

const illustrationConfig = {
  login: { primary: 'book-education-outline' },
  student: { primary: 'book-open-page-variant-outline' },
  parent: { primary: 'account-heart-outline' },
  empty: { primary: 'school-outline' },
} as const;

/**
 * A compact rendering of the academy's own operations artwork. The full image
 * stays visible at every size; the role badge supplies context without mixing
 * unrelated stock-illustration styles. Expo Image keeps phone decoding cheap.
 */
export function AcademyIllustration({ variant, compact = false }: { variant: Variant; compact?: boolean }) {
  const config = illustrationConfig[variant];

  if (variant === 'empty') {
    return (
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.emptyFrame, compact && styles.emptyFrameCompact]}
      >
        <MaterialCommunityIcons name={config.primary} size={compact ? 34 : 46} color={COLORS.goldLight} />
      </View>
    );
  }

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, compact && styles.frameCompact]}
    >
      <Image
        source={require('../../assets/illustrations/academy-operations.png')}
        style={[styles.artwork, compact && styles.artworkCompact]}
        contentFit="contain"
        transition={120}
      />
      <View style={[styles.roleMark, compact && styles.roleMarkCompact]}>
        <MaterialCommunityIcons name={config.primary} size={compact ? 15 : 19} color={COLORS.goldLight} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 260,
    height: 166,
    overflow: 'hidden',
  },
  frameCompact: { width: 146, height: 96 },
  artwork: { position: 'absolute', width: 260, height: 166, top: 0, left: 0 },
  artworkCompact: { width: 146, height: 96 },
  roleMark: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: COLORS.goldHairline,
  },
  roleMarkCompact: { width: 30, height: 30, borderRadius: 15, right: 4, bottom: 4 },
  emptyFrame: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyFrameCompact: { width: 76, height: 76, borderRadius: 38 },
});
