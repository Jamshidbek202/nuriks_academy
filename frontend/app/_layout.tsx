import React from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { AuthProvider } from '../src/contexts/AuthContext';
import { NotificationProvider } from '../src/contexts/NotificationContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LanguageProvider, useLanguage } from '../src/contexts/LanguageContext';
import { MotionProvider, MOTION, useMotionPreference } from '../src/contexts/MotionContext';
import { COLORS } from '../src/constants/theme';
import { AtmosphereMotionProvider } from '../src/components/ConcourseAtmosphere';

function RootNavigator() {
  const { language } = useLanguage();
  const { reduceMotion, ready } = useMotionPreference();
  return (
    <NotificationProvider>
      <StatusBar style="light" />
      <Stack
        key={language}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.backgroundSolid },
          animation: !ready || reduceMotion ? 'none' : Platform.OS === 'web' ? 'fade' : 'fade_from_bottom',
          animationDuration: !ready || reduceMotion ? 0 : MOTION.navigation,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="activate-account" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
      </Stack>
    </NotificationProvider>
  );
}

export default function RootLayout() {
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const viewport = document.querySelector('meta[name="viewport"]');
    viewport?.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
    );
    let hardeningStyle = document.getElementById('nuriks-web-hardening') as HTMLStyleElement | null;
    if (!hardeningStyle) {
      hardeningStyle = document.createElement('style');
      hardeningStyle.id = 'nuriks-web-hardening';
      hardeningStyle.textContent = `
        html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; touch-action: manipulation; }
        button, [role="button"], input, select, textarea { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
        input, select, textarea { font-size: 16px !important; }
      `;
      document.head.appendChild(hardeningStyle);
    }
    const elements = [document.documentElement, document.body, document.getElementById('root')].filter(Boolean) as HTMLElement[];
    elements.forEach((element) => {
      element.style.backgroundColor = COLORS.backgroundSolid;
      element.style.overscrollBehavior = 'none';
    });
    return () => {
      elements.forEach((element) => {
        element.style.removeProperty('background-color');
        element.style.removeProperty('overscroll-behavior');
      });
      hardeningStyle?.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <MotionProvider>
          <AtmosphereMotionProvider>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </AtmosphereMotionProvider>
        </MotionProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
