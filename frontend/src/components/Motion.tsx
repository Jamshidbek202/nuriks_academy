import React, { useEffect, useRef } from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { MOTION, useMotionPreference } from '../contexts/MotionContext';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

export function MotionTouchableOpacity({
  style,
  disabled,
  onPressIn,
  onPressOut,
  activeOpacity = 0.9,
  pressRetentionOffset = 12,
  pressScale = 0.97,
  children,
  ...props
}: TouchableOpacityProps & { pressScale?: number }) {
  const { reduceMotion, ready } = useMotionPreference();
  const scale = useSharedValue(1);
  const flattenedStyle = StyleSheet.flatten(style as StyleProp<ViewStyle>) || {};
  const inheritedTransform = flattenedStyle.transform || [];
  const baseStyle = { ...flattenedStyle };
  delete baseStyle.transform;

  useEffect(() => {
    if (!ready || reduceMotion || disabled) scale.set(1);
    return () => cancelAnimation(scale);
  }, [disabled, ready, reduceMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [...(inheritedTransform as any[]), { scale: scale.get() }],
  }), [inheritedTransform]);

  const moveTo = (value: number, duration: number) => {
    scale.set(withTiming(!ready || reduceMotion || disabled ? 1 : value, {
      duration,
      easing: EASE_OUT,
    }));
  };

  return (
    <AnimatedTouchableOpacity
      {...props}
      disabled={disabled}
      activeOpacity={activeOpacity}
      pressRetentionOffset={pressRetentionOffset}
      onPressIn={(event) => {
        moveTo(pressScale, MOTION.instant);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        moveTo(1, MOTION.feedback);
        onPressOut?.(event);
      }}
      style={[baseStyle, animatedStyle]}
    >
      {children}
    </AnimatedTouchableOpacity>
  );
}

export function MotionPressableCard({
  style,
  disabled,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  pressScale = 0.97,
  hoverLift = 2,
  hoverOverlayColor = 'rgba(241,217,139,0.035)',
  children,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pressScale?: number;
  hoverLift?: number;
  hoverOverlayColor?: string;
}) {
  const { reduceMotion, ready } = useMotionPreference();
  const press = useSharedValue(1);
  const hover = useSharedValue(0);
  const flattenedStyle = StyleSheet.flatten(style as StyleProp<ViewStyle>) || {};
  const inheritedTransform = flattenedStyle.transform || [];
  const baseStyle = { ...flattenedStyle };
  delete baseStyle.transform;

  useEffect(() => {
    if (!ready || reduceMotion || disabled) press.set(1);
    if (!ready || disabled) hover.set(0);
    return () => {
      cancelAnimation(press);
      cancelAnimation(hover);
    };
  }, [disabled, hover, press, ready, reduceMotion]);

  const cardMotion = useAnimatedStyle(() => ({
    transform: [
      ...(inheritedTransform as any[]),
      { translateY: reduceMotion ? 0 : interpolate(hover.get(), [0, 1], [0, -hoverLift]) },
      { scale: press.get() },
    ],
  }), [hoverLift, inheritedTransform, reduceMotion]);

  const hoverLayerMotion = useAnimatedStyle(() => ({ opacity: hover.get() }));

  const movePressTo = (value: number, duration: number) => {
    press.set(withTiming(!ready || reduceMotion || disabled ? 1 : value, {
      duration,
      easing: EASE_OUT,
    }));
  };

  const moveHoverTo = (value: number) => {
    hover.set(withTiming(!ready || disabled ? 0 : value, {
      duration: value > 0 ? MOTION.state : MOTION.feedback,
      easing: EASE_OUT,
    }));
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        movePressTo(pressScale, MOTION.instant);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        movePressTo(1, MOTION.feedback);
        onPressOut?.(event);
      }}
      onHoverIn={(event) => {
        moveHoverTo(1);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        moveHoverTo(0);
        onHoverOut?.(event);
      }}
      style={[baseStyle, cardMotion]}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: hoverOverlayColor }, hoverLayerMotion]} />
      {children}
    </AnimatedPressable>
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
  const progress = useSharedValue(ready && !reduceMotion ? 0 : 1);

  useEffect(() => {
    cancelAnimation(progress);
    if (!ready || reduceMotion) {
      progress.set(1);
      return;
    }
    if (!canAnimateFromMount.current) {
      canAnimateFromMount.current = true;
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(withDelay(delay, withTiming(1, { duration, easing: EASE_OUT })));
    return () => cancelAnimation(progress);
  }, [delay, duration, progress, ready, reduceMotion]);

  const revealMotion = useAnimatedStyle(() => {
    const value = progress.get();
    const signedDistance = direction === 'up' || direction === 'left' ? distance : -distance;
    const translate = interpolate(value, [0, 1], [signedDistance, 0]);
    const scale = interpolate(value, [0, 1], [scaleFrom, 1]);
    const transform = direction === 'left' || direction === 'right'
      ? [{ translateX: translate }, { scale }]
      : direction === 'none'
        ? [{ scale }]
        : [{ translateY: translate }, { scale }];

    return {
      opacity: interpolate(value, [0, 1], [0.84, 1]),
      transform,
    };
  }, [direction, distance, scaleFrom]);

  return (
    <Animated.View testID={testID} style={[style, revealMotion]}>
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
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    cancelAnimation(progress);
    if (!ready || reduceMotion) {
      progress.set(active ? 1 : 0);
      return;
    }
    progress.set(withTiming(active ? 1 : 0, { duration: MOTION.state, easing: EASE_IN_OUT }));
    return () => cancelAnimation(progress);
  }, [active, progress, ready, reduceMotion]);

  const rotateMotion = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.get(), [0, 1], [0, degrees])}deg` }],
  }), [degrees]);

  return <Animated.View style={[style, rotateMotion]}>{children}</Animated.View>;
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
  const progress = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(progress);
    if (!ready || reduceMotion) {
      progress.set(1);
      return;
    }
    progress.set(0.18);
    progress.set(withDelay(delay, withTiming(1, { duration, easing: EASE_OUT })));
    return () => cancelAnimation(progress);
  }, [delay, duration, progress, ready, reduceMotion]);

  const lineMotion = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scaleX: progress.get() }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { height: StyleSheet.hairlineWidth, backgroundColor: color },
        style,
        lineMotion,
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
  const pulse = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(pulse);
    if (!ready || reduceMotion) {
      pulse.set(0);
      return;
    }
    pulse.set(withRepeat(
      withTiming(1, { duration: 900, easing: EASE_IN_OUT }),
      -1,
      true,
    ));
    return () => cancelAnimation(pulse);
  }, [pulse, ready, reduceMotion]);

  const pulseMotion = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.get(), [0, 1], [0.72, 1]),
    transform: [{ scale: interpolate(pulse.get(), [0, 1], [1, 1.2]) }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
        pulseMotion,
      ]}
    />
  );
}
