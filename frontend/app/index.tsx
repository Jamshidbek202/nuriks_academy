import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { COLORS } from '../src/constants/theme';

export default function Index() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        router.replace((user.must_change_password ? '/change-password' : '/(dashboard)') as any);
      } else {
        router.replace('/login');
      }
    }
  }, [user, isLoading, router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
      <ActivityIndicator size="large" color={COLORS.gold} />
    </View>
  );
}
