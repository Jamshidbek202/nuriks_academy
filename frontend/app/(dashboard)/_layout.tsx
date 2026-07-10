import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS } from '../../src/constants/theme';

export default function DashboardLayout() {
  const { user, isLoading } = useAuth();

  // Show loading while auth is being restored
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  const tabScreenOptions = {
    headerShown: false,
    tabBarActiveTintColor: COLORS.gold,
    tabBarInactiveTintColor: COLORS.textTertiary,
    tabBarStyle: {
      backgroundColor: COLORS.backgroundCard,
      borderTopColor: COLORS.marbleGray,
      height: 60,
      paddingBottom: 8,
    },
    tabBarLabelStyle: {
      fontSize: 10,
      fontWeight: '600' as const,
    },
  };

  // Helper function to create tab icon
  const createTabIcon = (iconName: string) => {
    const TabBarIcon = ({ color, size }: { color: string; size: number }) => (
      <Ionicons name={iconName as any} size={size} color={color} />
    );
    TabBarIcon.displayName = `TabBarIcon(${iconName})`;
    return TabBarIcon;
  };

  // Super Admin Tabs
  if (user?.role === 'super_admin') {
    return (
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: createTabIcon('grid') }} />
        <Tabs.Screen name="students" options={{ title: 'Students', tabBarIcon: createTabIcon('people') }} />
        <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: createTabIcon('card') }} />
        <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: createTabIcon('chatbubbles') }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: createTabIcon('person-circle') }} />
        {/* Hidden screens */}
        <Tabs.Screen name="groups" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="leads" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="homework" options={{ href: null }} />
        <Tabs.Screen name="tests" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="feature-flags" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="news" options={{ href: null }} />
        <Tabs.Screen name="audit-logs" options={{ href: null }} />
        <Tabs.Screen name="backups" options={{ href: null }} />
        <Tabs.Screen name="staff-management" options={{ href: null }} />
        <Tabs.Screen name="parent-home" options={{ href: null }} />
        <Tabs.Screen name="teacher-home" options={{ href: null }} />
        <Tabs.Screen name="support-home" options={{ href: null }} />
        <Tabs.Screen name="student-home" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
      </Tabs>
    );
  }

  // Manager Tabs
  if (user?.role === 'manager') {
    return (
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: createTabIcon('grid') }} />
        <Tabs.Screen name="students" options={{ title: 'Students', tabBarIcon: createTabIcon('people') }} />
        <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: createTabIcon('card') }} />
        <Tabs.Screen name="leads" options={{ title: 'Leads', tabBarIcon: createTabIcon('people-circle') }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: createTabIcon('person-circle') }} />
        {/* Hidden screens */}
        <Tabs.Screen name="chats" options={{ href: null }} />
        <Tabs.Screen name="groups" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="homework" options={{ href: null }} />
        <Tabs.Screen name="tests" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="feature-flags" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="news" options={{ href: null }} />
        <Tabs.Screen name="audit-logs" options={{ href: null }} />
        <Tabs.Screen name="backups" options={{ href: null }} />
        <Tabs.Screen name="staff-management" options={{ href: null }} />
        <Tabs.Screen name="parent-home" options={{ href: null }} />
        <Tabs.Screen name="teacher-home" options={{ href: null }} />
        <Tabs.Screen name="support-home" options={{ href: null }} />
        <Tabs.Screen name="student-home" options={{ href: null }} />
      </Tabs>
    );
  }

  // Teacher Tabs
  if (user?.role === 'teacher') {
    return (
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: createTabIcon('calendar') }} />
        <Tabs.Screen name="groups" options={{ title: 'Groups', tabBarIcon: createTabIcon('people-circle') }} />
        <Tabs.Screen name="attendance" options={{ title: 'Attendance', tabBarIcon: createTabIcon('checkbox') }} />
        <Tabs.Screen name="homework" options={{ title: 'Homework', tabBarIcon: createTabIcon('book') }} />
        <Tabs.Screen name="tests" options={{ title: 'Tests', tabBarIcon: createTabIcon('clipboard') }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: createTabIcon('person-circle') }} />
        {/* Hidden screens */}
        <Tabs.Screen name="chats" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="leads" options={{ href: null }} />
        <Tabs.Screen name="payments" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="feature-flags" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="news" options={{ href: null }} />
        <Tabs.Screen name="audit-logs" options={{ href: null }} />
        <Tabs.Screen name="backups" options={{ href: null }} />
        <Tabs.Screen name="staff-management" options={{ href: null }} />
        <Tabs.Screen name="parent-home" options={{ href: null }} />
        <Tabs.Screen name="teacher-home" options={{ href: null }} />
        <Tabs.Screen name="support-home" options={{ href: null }} />
        <Tabs.Screen name="student-home" options={{ href: null }} />
      </Tabs>
    );
  }

  // Student Tabs
  if (user?.role === 'student') {
    return (
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: createTabIcon('home') }} />
        <Tabs.Screen name="groups" options={{ title: 'Groups', tabBarIcon: createTabIcon('people-circle') }} />
        <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: createTabIcon('chatbubbles') }} />
        <Tabs.Screen name="homework" options={{ title: 'Homework', tabBarIcon: createTabIcon('book') }} />
        <Tabs.Screen name="tests" options={{ title: 'Tests', tabBarIcon: createTabIcon('clipboard') }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: createTabIcon('person-circle') }} />
        {/* Hidden screens */}
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="leads" options={{ href: null }} />
        <Tabs.Screen name="payments" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="feature-flags" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="news" options={{ href: null }} />
        <Tabs.Screen name="audit-logs" options={{ href: null }} />
        <Tabs.Screen name="backups" options={{ href: null }} />
        <Tabs.Screen name="staff-management" options={{ href: null }} />
        <Tabs.Screen name="parent-home" options={{ href: null }} />
        <Tabs.Screen name="teacher-home" options={{ href: null }} />
        <Tabs.Screen name="support-home" options={{ href: null }} />
        <Tabs.Screen name="student-home" options={{ href: null }} />
      </Tabs>
    );
  }

  // Parent Tabs
  if (user?.role === 'parent') {
    return (
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: createTabIcon('home') }} />
        <Tabs.Screen name="groups" options={{ title: 'Groups', tabBarIcon: createTabIcon('people-circle') }} />
        <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: createTabIcon('analytics') }} />
        <Tabs.Screen name="homework" options={{ title: 'Homework', tabBarIcon: createTabIcon('book') }} />
        <Tabs.Screen name="tests" options={{ title: 'Tests', tabBarIcon: createTabIcon('clipboard') }} />
        <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: createTabIcon('card') }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: createTabIcon('person-circle') }} />
        {/* Hidden screens */}
        <Tabs.Screen name="chats" options={{ href: null }} />
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="leads" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="feature-flags" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="news" options={{ href: null }} />
        <Tabs.Screen name="audit-logs" options={{ href: null }} />
        <Tabs.Screen name="backups" options={{ href: null }} />
        <Tabs.Screen name="staff-management" options={{ href: null }} />
        <Tabs.Screen name="parent-home" options={{ href: null }} />
        <Tabs.Screen name="teacher-home" options={{ href: null }} />
        <Tabs.Screen name="support-home" options={{ href: null }} />
        <Tabs.Screen name="student-home" options={{ href: null }} />
      </Tabs>
    );
  }

  // Support Tabs
  if (user?.role === 'support') {
    return (
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="index" options={{ title: 'Bookings', tabBarIcon: createTabIcon('calendar') }} />
        <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: createTabIcon('chatbubbles') }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: createTabIcon('person-circle') }} />
        {/* Hidden screens */}
        <Tabs.Screen name="groups" options={{ href: null }} />
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="leads" options={{ href: null }} />
        <Tabs.Screen name="payments" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="homework" options={{ href: null }} />
        <Tabs.Screen name="tests" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="feature-flags" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="news" options={{ href: null }} />
        <Tabs.Screen name="audit-logs" options={{ href: null }} />
        <Tabs.Screen name="backups" options={{ href: null }} />
        <Tabs.Screen name="staff-management" options={{ href: null }} />
        <Tabs.Screen name="parent-home" options={{ href: null }} />
        <Tabs.Screen name="teacher-home" options={{ href: null }} />
        <Tabs.Screen name="support-home" options={{ href: null }} />
        <Tabs.Screen name="student-home" options={{ href: null }} />
      </Tabs>
    );
  }

  // Default fallback (no user or unknown role)
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: createTabIcon('home') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: createTabIcon('person-circle') }} />
      {/* Hidden screens */}
      <Tabs.Screen name="chats" options={{ href: null }} />
      <Tabs.Screen name="groups" options={{ href: null }} />
      <Tabs.Screen name="students" options={{ href: null }} />
      <Tabs.Screen name="teachers" options={{ href: null }} />
      <Tabs.Screen name="leads" options={{ href: null }} />
      <Tabs.Screen name="payments" options={{ href: null }} />
      <Tabs.Screen name="attendance" options={{ href: null }} />
      <Tabs.Screen name="journal" options={{ href: null }} />
      <Tabs.Screen name="homework" options={{ href: null }} />
      <Tabs.Screen name="tests" options={{ href: null }} />
      <Tabs.Screen name="certificates" options={{ href: null }} />
      <Tabs.Screen name="progress" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="notification-settings" options={{ href: null }} />
      <Tabs.Screen name="feature-flags" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="news" options={{ href: null }} />
      <Tabs.Screen name="audit-logs" options={{ href: null }} />
      <Tabs.Screen name="backups" options={{ href: null }} />
        <Tabs.Screen name="staff-management" options={{ href: null }} />
      <Tabs.Screen name="parent-home" options={{ href: null }} />
      <Tabs.Screen name="teacher-home" options={{ href: null }} />
      <Tabs.Screen name="support-home" options={{ href: null }} />
      <Tabs.Screen name="student-home" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
