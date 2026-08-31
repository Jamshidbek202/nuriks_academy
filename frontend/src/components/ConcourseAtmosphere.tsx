import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import { useMotionPreference } from '../contexts/MotionContext';

type GlassTone = 'neutral' | 'brand' | 'gold';

type AtmosphereMotionValue = {
  x: SharedValue<number>;
  y: SharedValue<number>;
};

const AtmosphereMotionContext = createContext<AtmosphereMotionValue | null>(null);

type AtmosphereLayout = {
  compact: boolean;
  brand: ViewStyle;
  gold: ViewStyle;
  bronze: ViewStyle;
  horizon: ViewStyle;
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(Math.max(value, minimum), maximum)
);

export function AtmosphereMotionProvider({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const { reduceMotion } = useMotionPreference();
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const update = useCallback((pageX: number, pageY: number) => {
    if (reduceMotion || width <= 0 || height <= 0) return;
    x.set(clamp((pageX / width) * 2 - 1, -1, 1));
    y.set(clamp((pageY / height) * 2 - 1, -1, 1));
  }, [height, reduceMotion, width, x, y]);

  const settle = useCallback(() => {
    x.set(withSpring(0, { damping: 24, stiffness: 120 }));
    y.set(withSpring(0, { damping: 24, stiffness: 120 }));
  }, [x, y]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || reduceMotion) return;
    const pointer = (event: PointerEvent) => update(event.clientX, event.clientY);
    const wheel = (event: WheelEvent) => {
      y.set(clamp(y.get() + event.deltaY / 1800, -1, 1));
    };
    window.addEventListener('pointermove', pointer, { passive: true });
    window.addEventListener('wheel', wheel, { passive: true });
    return () => {
      window.removeEventListener('pointermove', pointer);
      window.removeEventListener('wheel', wheel);
    };
  }, [reduceMotion, update, y]);

  return (
    <AtmosphereMotionContext.Provider value={{ x, y }}>
      <View
        style={styles.motionRoot}
        onTouchMove={(event) => {
          const touch = event.nativeEvent.touches?.[0];
          if (touch) update(touch.pageX, touch.pageY);
        }}
        onTouchEnd={settle}
        onTouchCancel={settle}
      >
        {children}
      </View>
    </AtmosphereMotionContext.Provider>
  );
}

function getAtmosphereLayout(width: number, height: number): AtmosphereLayout {
  const compact = width < 700 || (height < 600 && width < 1000);

  if (compact) {
    const brandSize = clamp(Math.min(width * 0.96, height * 0.8), 280, 440);
    const goldSize = clamp(Math.min(width * 0.78, height * 0.68), 220, 360);

    return {
      compact,
      brand: {
        width: brandSize,
        height: brandSize,
        left: -brandSize * 0.38,
        top: -brandSize * 0.26,
      },
      gold: {
        width: goldSize,
        height: goldSize,
        right: -goldSize * 0.35,
        top: clamp(height * 0.22, 86, 260),
      },
      bronze: {},
      horizon: {},
    };
  }

  const brandWidth = clamp(width * 0.57, 640, 900);
  const goldWidth = clamp(width * 0.52, 600, 820);
  const bronzeWidth = clamp(width * 0.55, 640, 860);
  const horizonWidth = clamp(width * 0.72, 820, 1120);

  return {
    compact,
    brand: {
      width: brandWidth,
      height: clamp(brandWidth * 0.54, 360, 490),
      left: -brandWidth * 0.31,
      top: -clamp(height * 0.18, 130, 220),
    },
    gold: {
      width: goldWidth,
      height: clamp(goldWidth * 0.64, 400, 520),
      right: -goldWidth * 0.39,
      top: clamp(height * 0.05, 40, 90),
    },
    bronze: {
      width: bronzeWidth,
      height: clamp(bronzeWidth * 0.52, 350, 460),
      left: clamp(width * 0.16, 120, 300),
      bottom: -clamp(height * 0.1, 70, 130),
    },
    horizon: {
      width: horizonWidth,
      height: clamp(horizonWidth * 0.23, 220, 300),
      left: clamp(width * 0.03, 24, 70),
      top: '38%',
    },
  };
}

export function ConcourseAtmosphere() {
  const motion = useContext(AtmosphereMotionContext);
  const isFocused = useIsFocused();
  const { reduceMotion, ready } = useMotionPreference();
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => getAtmosphereLayout(width, height), [height, width]);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const drift = useSharedValue(0.22);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    cancelAnimation(drift);
    if (!ready || reduceMotion || !isFocused || appState !== 'active') {
      drift.set(0.22);
      return;
    }

    drift.set(withRepeat(
      withTiming(1, {
        duration: layout.compact ? 24_000 : 20_000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    ));

    return () => cancelAnimation(drift);
  }, [appState, drift, isFocused, layout.compact, ready, reduceMotion]);

  const brandMotion = useAnimatedStyle(() => {
    const value = drift.get();
    const compact = layout.compact;
    return {
      opacity: interpolate(value, [0, 1], compact ? [0.34, 0.46] : [0.7, 0.94]),
      transform: [
        { translateX: interpolate(value, [0, 1], compact ? [-8, 12] : [-54, 76]) + (motion?.x.get() || 0) * (compact ? 12 : 24) },
        { translateY: interpolate(value, [0, 1], compact ? [-5, 9] : [-26, 42]) + (motion?.y.get() || 0) * (compact ? 9 : 18) },
        { scale: interpolate(value, [0, 1], compact ? [0.98, 1.025] : [0.96, 1.08]) },
        { rotate: compact ? '-4deg' : '-14deg' },
      ],
    };
  }, [layout.compact]);

  const goldMotion = useAnimatedStyle(() => {
    const value = drift.get();
    const compact = layout.compact;
    return {
      opacity: interpolate(value, [0, 1], compact ? [0.28, 0.4] : [0.66, 0.94]),
      transform: [
        { translateX: interpolate(value, [0, 1], compact ? [10, -12] : [54, -74]) - (motion?.x.get() || 0) * (compact ? 10 : 20) },
        { translateY: interpolate(value, [0, 1], compact ? [7, -8] : [34, -28]) - (motion?.y.get() || 0) * (compact ? 8 : 16) },
        { scale: interpolate(value, [0, 1], compact ? [0.975, 1.02] : [0.96, 1.08]) },
        { rotate: compact ? '3deg' : '18deg' },
      ],
    };
  }, [layout.compact]);

  const bronzeMotion = useAnimatedStyle(() => {
    const value = drift.get();
    return {
      opacity: interpolate(value, [0, 1], [0.54, 0.78]),
      transform: [
        { translateX: interpolate(value, [0, 1], [-28, 52]) },
        { translateY: (motion?.y.get() || 0) * 14 },
        { scale: interpolate(value, [0, 1], [0.96, 1.08]) },
        { rotate: '-28deg' },
      ],
    };
  });

  const horizonMotion = useAnimatedStyle(() => {
    const value = drift.get();
    return {
      opacity: interpolate(value, [0, 1], [0.46, 0.72]),
      transform: [
        { translateX: interpolate(value, [0, 1], [-82, 64]) },
        { translateY: interpolate(value, [0, 1], [24, -38]) - (motion?.y.get() || 0) * 12 },
        { scale: interpolate(value, [0, 1], [1.04, 0.94]) },
        { rotate: '8deg' },
      ],
    };
  });

  return (
    <View pointerEvents="none" style={styles.atmosphere}>
      <LinearGradient
        colors={layout.compact ? ['#1A160A', '#10110B', '#090A07'] : ['#0D0C08', '#090A07', '#050604']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.field, layout.brand, brandMotion]}>
        <LinearGradient colors={layout.compact ? ['rgba(116,87,22,0)', 'rgba(232,195,92,0.14)', 'rgba(116,87,22,0)'] : ['rgba(116,87,22,0)', 'rgba(232,195,92,0.19)', 'rgba(116,87,22,0)']} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.field, layout.gold, goldMotion]}>
        <LinearGradient colors={layout.compact ? ['rgba(160,126,38,0)', 'rgba(213,182,98,0.12)', 'rgba(160,126,38,0)'] : ['rgba(160,126,38,0)', 'rgba(213,182,98,0.17)', 'rgba(160,126,38,0)']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {!layout.compact ? (
        <>
          <Animated.View style={[styles.field, layout.bronze, bronzeMotion]}>
            <LinearGradient colors={['rgba(91,67,22,0)', 'rgba(176,135,52,0.15)', 'rgba(91,67,22,0)']} start={{ x: 0, y: 0.4 }} end={{ x: 1, y: 0.6 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <Animated.View style={[styles.field, layout.horizon, horizonMotion]}>
            <LinearGradient colors={['rgba(241,217,139,0)', 'rgba(241,217,139,0.085)', 'rgba(154,125,52,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </>
      ) : null}
      <LinearGradient
        colors={layout.compact
          ? ['rgba(28,22,8,0.02)', 'rgba(8,9,6,0.12)', 'rgba(8,9,6,0.28)']
          : ['rgba(5,6,4,0.02)', 'rgba(5,6,4,0.24)', 'rgba(5,6,4,0.46)']}
        locations={[0, 0.58, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export function ConcourseGlassLayer({ tone = 'neutral', intensity = 54 }: { tone?: GlassTone; intensity?: number }) {
  const colors: [string, string, string] = tone === 'brand'
    ? ['rgba(241,217,139,0.085)', 'rgba(39,34,22,0.13)', 'rgba(255,255,255,0.012)']
    : tone === 'gold'
      ? ['rgba(241,217,139,0.075)', 'rgba(28,27,22,0.13)', 'rgba(255,255,255,0.012)']
      : ['rgba(255,250,236,0.050)', 'rgba(28,26,21,0.115)', 'rgba(213,182,98,0.025)'];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView tint="dark" intensity={Platform.OS === 'android' ? Math.min(intensity, 28) : intensity} style={StyleSheet.absoluteFill} />
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
  motionRoot: { flex: 1, backgroundColor: '#050604' },
  atmosphere: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  field: { position: 'absolute', overflow: 'hidden', borderRadius: 999 },
});
