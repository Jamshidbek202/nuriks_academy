import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants/theme';
import { MotionLine } from './Motion';

export function BrandFrame({
  children,
  style,
  accent = COLORS.gold,
  quiet = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: string;
  quiet?: boolean;
}) {
  return (
    <View style={[styles.frame, quiet && styles.frameQuiet, style]}>
      <LinearGradient
        pointerEvents="none"
        colors={quiet
          ? ['rgba(255,255,255,0.018)', 'rgba(255,255,255,0)']
          : [`${accent}18`, 'rgba(255,255,255,0.018)', 'rgba(255,255,255,0)']}
        locations={[0, 0.46, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
      <MotionLine color={`${accent}88`} style={styles.topRail} />
      <View pointerEvents="none" style={[styles.corner, styles.cornerTopLeft, { borderColor: `${accent}A0` }]} />
      <View pointerEvents="none" style={[styles.corner, styles.cornerBottomRight, { borderColor: `${accent}6E` }]} />
      <View pointerEvents="none" style={[styles.node, styles.nodeTop, { backgroundColor: accent }]} />
      <View pointerEvents="none" style={[styles.node, styles.nodeBottom, { borderColor: accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radiusLg,
  },
  frameQuiet: { backgroundColor: COLORS.backgroundLight },
  topRail: { position: 'absolute', top: 0, left: 24, right: 24 },
  corner: { position: 'absolute', width: 20, height: 20 },
  cornerTopLeft: { top: 10, left: 10, borderTopWidth: 1, borderLeftWidth: 1 },
  cornerBottomRight: { right: 10, bottom: 10, borderRightWidth: 1, borderBottomWidth: 1 },
  node: { position: 'absolute', width: 5, height: 5, borderRadius: 3 },
  nodeTop: { top: 8, right: 38 },
  nodeBottom: { bottom: 8, left: 38, borderWidth: 1, backgroundColor: COLORS.backgroundCard },
});
