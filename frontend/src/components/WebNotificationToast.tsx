import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Image, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, SIZES } from '../constants/theme';

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
  const translateX = useRef(new Animated.Value(440)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissed = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const dismiss = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    Animated.parallel([
      Animated.timing(translateX, { toValue: 440, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => onDismissRef.current(notification.id));
  }, [notification.id, opacity, translateX]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    Animated.parallel([
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 170 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    const timeout = setTimeout(() => dismiss(), 8000);
    return () => clearTimeout(timeout);
  }, [dismiss, opacity, translateX]);

  return (
    <Animated.View
      style={[
        styles.toast,
        { top: 18 + index * 108, opacity, transform: [{ translateX }] },
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
