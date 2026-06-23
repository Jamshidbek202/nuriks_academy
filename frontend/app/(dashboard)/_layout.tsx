import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS } from '../../src/constants/theme';

export default function DashboardLayout() {
  const { user } = useAuth();

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

  // Super Admin Tabs
  if (user?.role === 'super_admin') {
    return (
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> }} />
        <Tabs.Screen name="students" options={{ title: 'Students', tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }} />
        <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: ({ color, size }) => <Ionicons name="card" size={size} color={color} /> }} />
        <Tabs.Screen name="journal" options={{ title: 'Journal', tabBarIcon: ({ color, size }) => <Ionicons name="journal" size={size} color={color} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }} />
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
        <Tabs.Screen name="feature-flags" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="news" options={{ href: null }} />
        <Tabs.Screen name="audit-logs" options={{ href: null }} />
        <Tabs.Screen name="backups" options={{ href: null }} />
        <Tabs.Screen name="parent-home" options={{ href: null }} />
        <Tabs.Screen name="teacher-home" options={{ href: null }} />
        <Tabs.Screen name="support-home" options={{ href: null }} />
        <Tabs.Screen name="student-home" options={{ href: null }} />
      </Tabs>
    );
  }

  // Manager Tabs
  if (user?.role === 'manager') {
    return (
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> }} />
        <Tabs.Screen name="students" options={{ title: 'Students', tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }} />
        <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: ({ color, size }) => <Ionicons name="card" size={size} color={color} /> }} />
        <Tabs.Screen name="leads" options={{ title: 'Leads', tabBarIcon: ({ color, size }) => <Ionicons name="people-circle" size={size} color={color} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }} />
        {/* Hidden screens */}
        <Tabs.Screen name="groups" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="homework" options={{ href: null }} />
        <Tabs.Screen name="tests" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="feature-flags" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="news" options={{ href: null }} />
        <Tabs.Screen name="audit-logs" options={{ href: null }} />
        <Tabs.Screen name="backups" options={{ href: null }} />
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
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }} />
        <Tabs.Screen name="journal" options={{ title: 'Journal', tabBarIcon: ({ color, size }) => <Ionicons name="journal" size={size} color={color} /> }} />
        <Tabs.Screen name="homework" options={{ title: 'Homework', tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} /> }} />
        <Tabs.Screen name="attendance" options={{ title: 'Attendance', tabBarIcon: ({ color, size }) => <Ionicons name="checkbox" size={size} color={color} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }} />
        {/* Hidden screens */}
        <Tabs.Screen name="groups" options={{ href: null }} />
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="leads" options={{ href: null }} />
        <Tabs.Screen name="payments" options={{ href: null }} />
        <Tabs.Screen name="tests" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="progress" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="feature-flags" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="news" options={{ href: null }} />
        <Tabs.Screen name="audit-logs" options={{ href: null }} />
        <Tabs.Screen name="backups" options={{ href: null }} />
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
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
        <Tabs.Screen name="homework" options={{ title: 'Homework', tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} /> }} />
        <Tabs.Screen name="tests" options={{ title: 'Tests', tabBarIcon: ({ color, size }) => <Ionicons name="clipboard" size={size} color={color} /> }} />
        <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: ({ color, size }) => <Ionicons name="analytics" size={size} color={color} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }} />
        {/* Hidden screens */}
        <Tabs.Screen name="groups" options={{ href: null }} />
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="leads" options={{ href: null }} />
        <Tabs.Screen name="payments" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="certificates" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="feature-flags" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="news" options={{ href: null }} />
        <Tabs.Screen name="audit-logs" options={{ href: null }} />
        <Tabs.Screen name="backups" options={{ href: null }} />
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
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
        <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: ({ color, size }) => <Ionicons name="analytics" size={size} color={color} /> }} />
        <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: ({ color, size }) => <Ionicons name="card" size={size} color={color} /> }} />
        <Tabs.Screen name="certificates" options={{ title: 'Certs', tabBarIcon: ({ color, size }) => <Ionicons name="ribbon" size={size} color={color} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }} />
        {/* Hidden screens */}
        <Tabs.Screen name="groups" options={{ href: null }} />
        <Tabs.Screen name="students" options={{ href: null }} />
        <Tabs.Screen name="teachers" options={{ href: null }} />
        <Tabs.Screen name="leads" options={{ href: null }} />
        <Tabs.Screen name="attendance" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
        <Tabs.Screen name="homework" options={{ href: null }} />
        <Tabs.Screen name="tests" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="feature-flags" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="news" options={{ href: null }} />
        <Tabs.Screen name="audit-logs" options={{ href: null }} />
        <Tabs.Screen name="backups" options={{ href: null }} />
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
        <Tabs.Screen name="index" options={{ title: 'Bookings', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }} />
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
        <Tabs.Screen name="feature-flags" options={{ href: null }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        <Tabs.Screen name="news" options={{ href: null }} />
        <Tabs.Screen name="audit-logs" options={{ href: null }} />
        <Tabs.Screen name="backups" options={{ href: null }} />
        <Tabs.Screen name="parent-home" options={{ href: null }} />
        <Tabs.Screen name="teacher-home" options={{ href: null }} />
        <Tabs.Screen name="support-home" options={{ href: null }} />
        <Tabs.Screen name="student-home" options={{ href: null }} />
      </Tabs>
    );
  }

  // Default fallback
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }} />
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
      <Tabs.Screen name="feature-flags" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="news" options={{ href: null }} />
      <Tabs.Screen name="audit-logs" options={{ href: null }} />
      <Tabs.Screen name="backups" options={{ href: null }} />
      <Tabs.Screen name="parent-home" options={{ href: null }} />
      <Tabs.Screen name="teacher-home" options={{ href: null }} />
      <Tabs.Screen name="support-home" options={{ href: null }} />
      <Tabs.Screen name="student-home" options={{ href: null }} />
    </Tabs>
  );
}
