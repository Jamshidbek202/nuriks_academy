import React, { useCallback, useEffect, useRef } from 'react';
import { Image, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text } from './LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, SIZES } from '../constants/theme';
import { useMotionPreference } from '../contexts/MotionContext';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

export interface WebToastNotification {
  id: string;
  title: string;
  message: string;
  type: string;
}

interface WebNotificationToastProps {
  notification: WebToastNotification;
  index: number;
  onDismiss: (id: string) => void;
}

export function WebNotificationToast({ notification, index, onDismiss }: WebNotificationToastProps) {
  const { reduceMotion, ready } = useMotionPreference();
  const translateX = useSharedValue(28);
  const opacity = useSharedValue(0);
  const dismissed = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const dismiss = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    const duration = !ready || reduceMotion ? 0 : 180;
    translateX.set(withTiming(!ready || reduceMotion ? 0 : 18, { duration, easing: EASE_OUT }));
    opacity.set(withTiming(0, { duration, easing: EASE_OUT }));
    dismissTimer.current = setTimeout(() => onDismissRef.current(notification.id), duration);
  }, [notification.id, opacity, ready, reduceMotion, translateX]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    cancelAnimation(translateX);
    cancelAnimation(opacity);
    translateX.set(!ready || reduceMotion ? 0 : 28);
    opacity.set(!ready ? 1 : 0);
    const duration = !ready || reduceMotion ? 0 : 210;
    translateX.set(withTiming(0, { duration, easing: EASE_OUT }));
    opacity.set(withTiming(1, { duration: Math.min(duration, 160), easing: EASE_OUT }));

    const timeout = setTimeout(() => dismiss(), 8000);
    return () => {
      clearTimeout(timeout);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      cancelAnimation(translateX);
      cancelAnimation(opacity);
    };
  }, [dismiss, opacity, ready, reduceMotion, translateX]);

  const toastMotion = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: translateX.get() }],
  }));

  return (
    <Animated.View
      style={[
        styles.toast,
        { top: 18 + index * 108 },
        toastMotion,
      ]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.iconContainer}>
        <Image source={require('../../assets/images/icon.png')} style={styles.icon} resizeMode="cover" />
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>{notification.title}</Text>
        <Text style={styles.message} numberOfLines={2}>{notification.message}</Text>
      </View>
      <TouchableOpacity style={styles.closeButton} onPress={dismiss} accessibilityLabel="Dismiss notification">
        <Ionicons name="close" size={19} color={COLORS.textSecondary} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    right: 18,
    zIndex: 10000,
    width: 390,
    maxWidth: 'calc(100vw - 36px)' as any,
    minHeight: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    padding: SIZES.md,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
    backgroundColor: COLORS.backgroundCard,
    ...SHADOWS.large,
  },
  iconContainer: { width: 48, height: 48, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.marbleDark },
  icon: { width: 48, height: 48 },
  content: { flex: 1, minWidth: 0 },
  title: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '800' },
  message: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, lineHeight: 19, marginTop: 3 },
  closeButton: { width: 44, height: 44, borderRadius: SIZES.radiusMd, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
});
