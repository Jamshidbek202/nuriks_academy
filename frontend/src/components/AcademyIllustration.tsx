import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/theme';

type Variant = 'login' | 'student' | 'parent' | 'empty';

const illustrationConfig = {
  login: { primary: 'book-education-outline', first: 'message-text-outline', second: 'chart-line-variant', accent: COLORS.gold },
  student: { primary: 'book-open-page-variant-outline', first: 'progress-check', second: 'message-text-outline', accent: COLORS.info },
  parent: { primary: 'account-heart-outline', first: 'calendar-check-outline', second: 'chart-line-variant', accent: COLORS.success },
  empty: { primary: 'school-outline', first: 'book-open-page-variant-outline', second: 'message-text-outline', accent: COLORS.gold },
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
        colors={[config.accent + '24', COLORS.gold + '12', 'rgba(7,8,6,0.04)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.gridVertical} />
      <View style={styles.gridHorizontal} />
      <View style={[styles.orbit, { borderColor: config.accent + '55' }]} />
      <View style={[styles.orbitInner, { borderColor: COLORS.goldHairline }]} />
      <View style={[styles.connector, { backgroundColor: config.accent + '66' }]} />
      <View style={[styles.connector, styles.connectorSecond, { backgroundColor: COLORS.goldHairline }]} />

      <View style={[styles.primaryNode, { borderColor: config.accent + '80', backgroundColor: config.accent + '18' }]}>
        {variant === 'login'
          ? <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          : <MaterialCommunityIcons name={config.primary} size={compact ? 30 : 38} color={config.accent} />}
      </View>

      <View style={[styles.satellite, styles.satelliteTop, { borderColor: config.accent + '5C' }]}>
        <MaterialCommunityIcons name={config.first} size={compact ? 15 : 18} color={config.accent} />
      </View>
      <View style={[styles.satellite, styles.satelliteBottom, { borderColor: COLORS.goldHairline }]}>
        <MaterialCommunityIcons name={config.second} size={compact ? 15 : 18} color={COLORS.goldLight} />
      </View>
      <View style={[styles.point, styles.pointOne, { backgroundColor: config.accent }]} />
      <View style={[styles.point, styles.pointTwo, { backgroundColor: COLORS.gold }]} />
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
  gridVertical: { position: 'absolute', width: 1, top: 0, bottom: 0, left: '50%', backgroundColor: COLORS.border },
  gridHorizontal: { position: 'absolute', height: 1, left: 0, right: 0, top: '50%', backgroundColor: COLORS.border },
  orbit: { position: 'absolute', width: '74%', aspectRatio: 1, borderWidth: 1, borderRadius: 999, left: '13%', top: '-7%' },
  orbitInner: { position: 'absolute', width: '45%', aspectRatio: 1, borderWidth: 1, borderRadius: 999, left: '28%', top: '17%' },
  connector: { position: 'absolute', width: '37%', height: 1, left: '14%', top: '29%', transform: [{ rotate: '-27deg' }] },
  connectorSecond: { left: '48%', top: '70%', transform: [{ rotate: '-25deg' }] },
  primaryNode: { position: 'absolute', width: '32%', aspectRatio: 1, left: '34%', top: '28%', borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: '72%', height: '72%' },
  satellite: { position: 'absolute', width: '17%', aspectRatio: 1, borderRadius: 999, borderWidth: 1, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
  satelliteTop: { left: '12%', top: '14%' },
  satelliteBottom: { right: '12%', bottom: '12%' },
  point: { position: 'absolute', width: 7, height: 7, borderRadius: 4 },
  pointOne: { right: '15%', top: '18%' },
  pointTwo: { left: '18%', bottom: '17%' },
});
