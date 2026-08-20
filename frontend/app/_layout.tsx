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
        <Stack.Screen name="(dashboard)" options={{ headerShown: false }} />
      </Stack>
    </NotificationProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <MotionProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </MotionProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
