import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from 'react-native';
import { MOTION, useMotionPreference } from '../contexts/MotionContext';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function MotionTouchableOpacity({
  style,
  disabled,
  onPressIn,
  onPressOut,
  activeOpacity = 0.9,
  pressScale = 0.982,
  children,
  ...props
}: TouchableOpacityProps & { pressScale?: number }) {
  const { reduceMotion, ready } = useMotionPreference();
  const scale = useRef(new Animated.Value(1)).current;
  const flattenedStyle = StyleSheet.flatten(style as StyleProp<ViewStyle>) || {};
  const inheritedTransform = flattenedStyle.transform || [];
  const baseStyle = { ...flattenedStyle };
  delete baseStyle.transform;

  const moveTo = (value: number, duration: number) => {
    if (!ready || reduceMotion || disabled) {
      scale.setValue(1);
      return;
    }
    Animated.timing(scale, {
      toValue: value,
      duration,
      easing: value < 1 ? Easing.out(Easing.quad) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  return (
    <AnimatedTouchableOpacity
      {...props}
      disabled={disabled}
      activeOpacity={activeOpacity}
      onPressIn={(event) => {
        moveTo(pressScale, MOTION.instant);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        moveTo(1, MOTION.feedback);
        onPressOut?.(event);
      }}
      style={[baseStyle, { transform: [...(inheritedTransform as any[]), { scale }] } as any]}
    >
      {children}
    </AnimatedTouchableOpacity>
  );
}

export function MotionReveal({
  children,
  style,
  delay = 0,
  duration = MOTION.state,
  distance = 8,
  direction = 'up',
  scaleFrom = 0.994,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  duration?: number;
  distance?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  scaleFrom?: number;
  testID?: string;
}) {
  const { reduceMotion, ready } = useMotionPreference();
  const canAnimateFromMount = useRef(ready && !reduceMotion);
  const progress = useRef(new Animated.Value(ready && !reduceMotion ? 0 : 1)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (!ready || reduceMotion) {
      progress.setValue(1);
      return;
    }
    if (!canAnimateFromMount.current) {
      canAnimateFromMount.current = true;
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      delay,
      duration,
      easing: Easing.bezier(...MOTION.easing.enter),
      useNativeDriver: true,
    }).start();
    return () => progress.stopAnimation();
  }, [delay, duration, progress, ready, reduceMotion]);

  const signedDistance = direction === 'up' || direction === 'left' ? distance : -distance;
  const translate = progress.interpolate({ inputRange: [0, 1], outputRange: [signedDistance, 0] });
  const transform = direction === 'left' || direction === 'right'
    ? [{ translateX: translate }, { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [scaleFrom, 1] }) }]
    : direction === 'none'
      ? [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [scaleFrom, 1] }) }]
      : [{ translateY: translate }, { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [scaleFrom, 1] }) }];

  return (
    <Animated.View
      testID={testID}
      style={[
        style,
        {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
          transform,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A bounded list entrance. Only the first few visible records are staggered;
 * long finance, student, and notification lists never queue hundreds of
 * animations or keep low-end Android devices busy.
 */
export function MotionListItem({
  children,
  index,
  style,
  testID,
}: {
  children: React.ReactNode;
  index: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <MotionReveal
      testID={testID}
      style={style}
      delay={Math.min(index, 4) * 34}
      duration={MOTION.navigation}
      distance={6}
      scaleFrom={0.998}
    >
      {children}
    </MotionReveal>
  );
}

export function MotionRotate({
  children,
  active,
  style,
  degrees = 180,
}: {
  children: React.ReactNode;
  active: boolean;
  style?: StyleProp<ViewStyle>;
  degrees?: number;
}) {
  const { reduceMotion, ready } = useMotionPreference();
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (!ready || reduceMotion) {
      progress.setValue(active ? 1 : 0);
      return;
    }
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: MOTION.state,
      easing: Easing.bezier(...MOTION.easing.standard),
      useNativeDriver: true,
    }).start();
    return () => progress.stopAnimation();
  }, [active, progress, ready, reduceMotion]);

  return (
    <Animated.View
      style={[
        style,
        { transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${degrees}deg`] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function MotionLine({
  color,
  style,
  delay = 90,
  duration = MOTION.hero,
}: {
  color: string;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  duration?: number;
}) {
  const { reduceMotion, ready } = useMotionPreference();
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (!ready || reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0.18);
    Animated.timing(progress, {
      toValue: 1,
      delay,
      duration,
      easing: Easing.bezier(...MOTION.easing.enter),
      useNativeDriver: true,
    }).start();
    return () => progress.stopAnimation();
  }, [delay, duration, progress, ready, reduceMotion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          height: StyleSheet.hairlineWidth,
          backgroundColor: color,
          opacity: progress,
          transform: [{ scaleX: progress }],
        },
        style,
      ]}
    />
  );
}

export function MotionPulse({
  color,
  size = 8,
  style,
}: {
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { reduceMotion, ready } = useMotionPreference();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pulse.stopAnimation();
    if (!ready || reduceMotion) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, ready, reduceMotion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.34] }) }],
        },
        style,
      ]}
    />
  );
}
