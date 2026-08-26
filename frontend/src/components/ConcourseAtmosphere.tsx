import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  AppStateStatus,
  Easing,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import { useMotionPreference } from '../contexts/MotionContext';

type GlassTone = 'neutral' | 'brand' | 'gold';

export function ConcourseAtmosphere() {
  const isFocused = useIsFocused();
  const { reduceMotion, ready } = useMotionPreference();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const drift = useRef(new Animated.Value(0.22)).current;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    drift.stopAnimation();
    if (!ready || reduceMotion || !isFocused || appState !== 'active') {
      drift.setValue(0.22);
      return;
    }

    const animation = Animated.loop(Animated.sequence([
      Animated.timing(drift, {
        toValue: 1,
        duration: 14_000,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.timing(drift, {
        toValue: 0,
        duration: 16_000,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [appState, drift, isFocused, ready, reduceMotion]);

  const brandX = drift.interpolate({ inputRange: [0, 1], outputRange: [-54, 76] });
  const brandY = drift.interpolate({ inputRange: [0, 1], outputRange: [-26, 42] });
  const goldX = drift.interpolate({ inputRange: [0, 1], outputRange: [54, -74] });
  const goldY = drift.interpolate({ inputRange: [0, 1], outputRange: [34, -28] });
  const bronzeX = drift.interpolate({ inputRange: [0, 1], outputRange: [-28, 52] });
  const horizonX = drift.interpolate({ inputRange: [0, 1], outputRange: [-82, 64] });
  const horizonY = drift.interpolate({ inputRange: [0, 1], outputRange: [24, -38] });
  const slowScale = drift.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.08] });
  const horizonScale = drift.interpolate({ inputRange: [0, 1], outputRange: [1.04, 0.94] });
  const goldOpacity = drift.interpolate({ inputRange: [0, 1], outputRange: [0.66, 0.94] });
  const horizonOpacity = drift.interpolate({ inputRange: [0, 1], outputRange: [0.54, 0.86] });

  return (
    <View pointerEvents="none" style={styles.atmosphere}>
      <LinearGradient colors={['#0D0C08', '#090A07', '#050604']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.field, styles.brandField, { transform: [{ translateX: brandX }, { translateY: brandY }, { scale: slowScale }, { rotate: '-14deg' }] }]}>
        <LinearGradient colors={['rgba(116,87,22,0)', 'rgba(232,195,92,0.19)', 'rgba(116,87,22,0)']} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.field, styles.goldField, { opacity: goldOpacity, transform: [{ translateX: goldX }, { translateY: goldY }, { scale: slowScale }, { rotate: '18deg' }] }]}>
        <LinearGradient colors={['rgba(160,126,38,0)', 'rgba(213,182,98,0.17)', 'rgba(160,126,38,0)']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.field, styles.bronzeField, { transform: [{ translateX: bronzeX }, { scale: slowScale }, { rotate: '-28deg' }] }]}>
        <LinearGradient colors={['rgba(91,67,22,0)', 'rgba(176,135,52,0.15)', 'rgba(91,67,22,0)']} start={{ x: 0, y: 0.4 }} end={{ x: 1, y: 0.6 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.field, styles.horizonField, { opacity: horizonOpacity, transform: [{ translateX: horizonX }, { translateY: horizonY }, { scale: horizonScale }, { rotate: '8deg' }] }]}>
        <LinearGradient colors={['rgba(241,217,139,0)', 'rgba(241,217,139,0.085)', 'rgba(154,125,52,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <LinearGradient colors={['rgba(5,6,4,0.02)', 'rgba(5,6,4,0.24)', 'rgba(5,6,4,0.46)']} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

export function ConcourseGlassLayer({ tone = 'neutral', intensity = 42 }: { tone?: GlassTone; intensity?: number }) {
  const colors: [string, string, string] = tone === 'brand'
    ? ['rgba(241,217,139,0.12)', 'rgba(39,34,22,0.23)', 'rgba(255,255,255,0.018)']
    : tone === 'gold'
      ? ['rgba(241,217,139,0.10)', 'rgba(28,27,22,0.22)', 'rgba(255,255,255,0.018)']
      : ['rgba(255,250,236,0.075)', 'rgba(28,26,21,0.20)', 'rgba(213,182,98,0.035)'];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView tint="dark" intensity={Platform.OS === 'android' ? Math.min(intensity, 22) : intensity} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </View>
  );
}

export function ConcourseTintLayer({ tone = 'brand' }: { tone?: GlassTone }) {
  const colors: [string, string] = tone === 'gold'
    ? ['rgba(213,182,98,0.12)', 'rgba(17,23,29,0.02)']
    : tone === 'neutral'
      ? ['rgba(255,255,255,0.055)', 'rgba(17,23,29,0.02)']
      : ['rgba(213,182,98,0.10)', 'rgba(17,19,18,0.02)'];
  return <LinearGradient pointerEvents="none" colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />;
}

const styles = StyleSheet.create({
  atmosphere: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  field: { position: 'absolute', overflow: 'hidden', borderRadius: 999 },
  brandField: { width: 820, height: 440, left: -290, top: -170, opacity: 0.94 },
  goldField: { width: 760, height: 500, right: -320, top: 45, opacity: 0.9 },
  bronzeField: { width: 780, height: 420, left: '18%', bottom: -80, opacity: 0.9 },
  horizonField: { width: 980, height: 260, left: '4%', top: '38%', opacity: 0.8 },
});
