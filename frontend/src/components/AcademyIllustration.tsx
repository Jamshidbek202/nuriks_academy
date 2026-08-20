import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/theme';

type Variant = 'login' | 'student' | 'parent' | 'empty';

const illustrationConfig = {
  login: { primary: 'book-education-outline' },
  student: { primary: 'book-open-page-variant-outline' },
  parent: { primary: 'account-heart-outline' },
  empty: { primary: 'school-outline' },
} as const;

/**
 * A small brand-owned learning motif made from vector glyphs and simple lines.
 * It intentionally avoids stock characters and heavy SVG scenes so it stays
 * crisp, fast, and consistent on web, iOS, and Android.
 */
export function AcademyIllustration({ variant, compact = false }: { variant: Variant; compact?: boolean }) {
  const config = illustrationConfig[variant];

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, compact && styles.frameCompact]}
    >
      <LinearGradient
        colors={[COLORS.gold + '1F', COLORS.gold + '08', 'rgba(7,8,6,0.04)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.accentBar} />
      <View style={styles.primaryMark}>
        {variant === 'login'
          ? <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          : <MaterialCommunityIcons name={config.primary} size={compact ? 34 : 46} color={COLORS.goldLight} />}
      </View>
      <View style={styles.ruleGroup}>
        <View style={styles.ruleStrong} />
        <View style={styles.ruleSoft} />
      </View>
      <View style={styles.point} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 260,
    height: 220,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundLight,
    overflow: 'hidden',
  },
  frameCompact: { width: 122, height: 104, borderRadius: 20 },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: COLORS.gold },
  primaryMark: { position: 'absolute', left: '18%', top: '20%', width: '64%', height: '52%', alignItems: 'center', justifyContent: 'center' },
  logo: { width: '72%', height: '72%' },
  ruleGroup: { position: 'absolute', left: '22%', right: '18%', bottom: '18%', gap: 5 },
  ruleStrong: { height: 2, width: '100%', borderRadius: 2, backgroundColor: COLORS.goldHairline },
  ruleSoft: { height: 1, width: '64%', borderRadius: 2, backgroundColor: COLORS.borderStrong },
  point: { position: 'absolute', width: 6, height: 6, borderRadius: 3, right: '14%', top: '15%', backgroundColor: COLORS.gold },
});
