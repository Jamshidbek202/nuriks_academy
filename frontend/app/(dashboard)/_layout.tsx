import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS } from '../../src/constants/theme';
import { useLanguage } from '../../src/contexts/LanguageContext';

export default function DashboardLayout() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();

  // Show loading while auth is being restored
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
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
        <Tabs.Screen name="index" options={{ title: t('Home'), tabBarIcon: createTabIcon('grid') }} />
        <Tabs.Screen name="students" options={{ title: t('Students'), tabBarIcon: createTabIcon('people') }} />
        <Tabs.Screen name="finance" options={{ title: t('Finance'), tabBarIcon: createTabIcon('wallet') }} />
        <Tabs.Screen name="chats" options={{ title: t('Chats'), tabBarIcon: createTabIcon('chatbubbles') }} />
        <Tabs.Screen name="profile" options={{ title: t('Profile'), tabBarIcon: createTabIcon('person-circle') }} />
        {/* Hidden screens */}
        <Tabs.Screen name="groups" options={{ href: null }} />
        <Tabs.Screen name="payments" options={{ href: null }} />
        <Tabs.Screen name="earnings" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="leads" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="homework" options={{ href: null }} />
        <Tabs.Screen name="tests" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
	        <Tabs.Screen name="courses" options={{ href: null }} />
	        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
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
        <Tabs.Screen name="index" options={{ title: t('Home'), tabBarIcon: createTabIcon('grid') }} />
        <Tabs.Screen name="students" options={{ title: t('Students'), tabBarIcon: createTabIcon('people') }} />
        <Tabs.Screen name="finance" options={{ title: t('Finance'), tabBarIcon: createTabIcon('wallet') }} />
        <Tabs.Screen name="leads" options={{ title: t('Leads'), tabBarIcon: createTabIcon('people-circle') }} />
        <Tabs.Screen name="profile" options={{ title: t('Profile'), tabBarIcon: createTabIcon('person-circle') }} />
        {/* Hidden screens */}
        <Tabs.Screen name="chats" options={{ href: null }} />
        <Tabs.Screen name="payments" options={{ href: null }} />
        <Tabs.Screen name="earnings" options={{ href: null }} />
        <Tabs.Screen name="groups" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="homework" options={{ href: null }} />
        <Tabs.Screen name="tests" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
	        <Tabs.Screen name="courses" options={{ href: null }} />
	        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
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

  // Reception Tabs: CRM and cash collection only; no pricing, payroll, expenses, or profit.
  if (user?.role === 'reception') {
    return (
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="index" options={{ title: t('Home'), tabBarIcon: createTabIcon('home') }} />
        <Tabs.Screen name="leads" options={{ title: t('Leads'), tabBarIcon: createTabIcon('people-circle') }} />
        <Tabs.Screen name="finance" options={{ title: t('Payments'), tabBarIcon: createTabIcon('cash') }} />
        <Tabs.Screen name="profile" options={{ title: t('Profile'), tabBarIcon: createTabIcon('person-circle') }} />
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="payments" options={{ href: null }} />
        <Tabs.Screen name="earnings" options={{ href: null }} />
        <Tabs.Screen name="groups" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="chats" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="homework" options={{ href: null }} />
        <Tabs.Screen name="tests" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="courses" options={{ href: null }} />
        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
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
        <Tabs.Screen name="index" options={{ title: t('Home'), tabBarIcon: createTabIcon('calendar') }} />
        <Tabs.Screen name="groups" options={{ title: t('Groups'), tabBarIcon: createTabIcon('people-circle') }} />
        <Tabs.Screen name="attendance" options={{ title: t('Attendance'), tabBarIcon: createTabIcon('checkbox') }} />
        <Tabs.Screen name="earnings" options={{ title: t('Earnings'), tabBarIcon: createTabIcon('cash') }} />
        <Tabs.Screen name="homework" options={{ title: t('Homework'), tabBarIcon: createTabIcon('book') }} />
        <Tabs.Screen name="tests" options={{ title: t('Tests'), tabBarIcon: createTabIcon('clipboard') }} />
        <Tabs.Screen name="profile" options={{ title: t('Profile'), tabBarIcon: createTabIcon('person-circle') }} />
        {/* Hidden screens */}
        <Tabs.Screen name="chats" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="leads" options={{ href: null }} />
        <Tabs.Screen name="payments" options={{ href: null }} />
        <Tabs.Screen name="finance" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
	        <Tabs.Screen name="courses" options={{ href: null }} />
	        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
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
        <Tabs.Screen name="index" options={{ title: t('Home'), tabBarIcon: createTabIcon('home') }} />
        <Tabs.Screen name="groups" options={{ title: t('Groups'), tabBarIcon: createTabIcon('people-circle') }} />
        <Tabs.Screen name="chats" options={{ title: t('Chats'), tabBarIcon: createTabIcon('chatbubbles') }} />
        <Tabs.Screen name="homework" options={{ title: t('Homework'), tabBarIcon: createTabIcon('book') }} />
        <Tabs.Screen name="tests" options={{ title: t('Tests'), tabBarIcon: createTabIcon('clipboard') }} />
        <Tabs.Screen name="payments" options={{ title: t('Payments'), tabBarIcon: createTabIcon('card') }} />
        <Tabs.Screen name="progress" options={{ title: t('Grades'), tabBarIcon: createTabIcon('analytics') }} />
        <Tabs.Screen name="profile" options={{ title: t('Profile'), tabBarIcon: createTabIcon('person-circle') }} />
        {/* Hidden screens */}
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="leads" options={{ href: null }} />
        <Tabs.Screen name="finance" options={{ href: null }} />
        <Tabs.Screen name="earnings" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
	        <Tabs.Screen name="courses" options={{ href: null }} />
	        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
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
        <Tabs.Screen name="index" options={{ title: t('Home'), tabBarIcon: createTabIcon('home') }} />
        <Tabs.Screen name="groups" options={{ title: t('Groups'), tabBarIcon: createTabIcon('people-circle') }} />
        <Tabs.Screen name="progress" options={{ title: t('Progress'), tabBarIcon: createTabIcon('analytics') }} />
        <Tabs.Screen name="homework" options={{ title: t('Homework'), tabBarIcon: createTabIcon('book') }} />
        <Tabs.Screen name="tests" options={{ title: t('Tests'), tabBarIcon: createTabIcon('clipboard') }} />
        <Tabs.Screen name="payments" options={{ title: t('Payments'), tabBarIcon: createTabIcon('card') }} />
        <Tabs.Screen name="profile" options={{ title: t('Profile'), tabBarIcon: createTabIcon('person-circle') }} />
        {/* Hidden screens */}
        <Tabs.Screen name="chats" options={{ href: null }} />
        <Tabs.Screen name="finance" options={{ href: null }} />
        <Tabs.Screen name="earnings" options={{ href: null }} />
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="leads" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
	        <Tabs.Screen name="courses" options={{ href: null }} />
	        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
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
        <Tabs.Screen name="index" options={{ title: t('Bookings'), tabBarIcon: createTabIcon('calendar') }} />
        <Tabs.Screen name="chats" options={{ title: t('Chats'), tabBarIcon: createTabIcon('chatbubbles') }} />
        <Tabs.Screen name="profile" options={{ title: t('Profile'), tabBarIcon: createTabIcon('person-circle') }} />
        {/* Hidden screens */}
        <Tabs.Screen name="groups" options={{ href: null }} />
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="leads" options={{ href: null }} />
        <Tabs.Screen name="payments" options={{ href: null }} />
        <Tabs.Screen name="finance" options={{ href: null }} />
        <Tabs.Screen name="earnings" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="homework" options={{ href: null }} />
        <Tabs.Screen name="tests" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
	        <Tabs.Screen name="courses" options={{ href: null }} />
	        <Tabs.Screen name="notification-settings" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
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

  // Default fallback for an authenticated account with an unknown role.
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: t('Home'), tabBarIcon: createTabIcon('home') }} />
      <Tabs.Screen name="profile" options={{ title: t('Profile'), tabBarIcon: createTabIcon('person-circle') }} />
      {/* Hidden screens */}
      <Tabs.Screen name="chats" options={{ href: null }} />
      <Tabs.Screen name="groups" options={{ href: null }} />
      <Tabs.Screen name="students" options={{ href: null }} />
      <Tabs.Screen name="teachers" options={{ href: null }} />
      <Tabs.Screen name="leads" options={{ href: null }} />
      <Tabs.Screen name="payments" options={{ href: null }} />
      <Tabs.Screen name="finance" options={{ href: null }} />
      <Tabs.Screen name="earnings" options={{ href: null }} />
      <Tabs.Screen name="attendance" options={{ href: null }} />
      <Tabs.Screen name="journal" options={{ href: null }} />
      <Tabs.Screen name="homework" options={{ href: null }} />
      <Tabs.Screen name="tests" options={{ href: null }} />
      <Tabs.Screen name="certificates" options={{ href: null }} />
      <Tabs.Screen name="progress" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
	      <Tabs.Screen name="courses" options={{ href: null }} />
	      <Tabs.Screen name="notification-settings" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
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
