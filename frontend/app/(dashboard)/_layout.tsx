import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS } from '../../src/constants/theme';

export default function DashboardLayout() {
  const { user } = useAuth();

  // Role-based tabs
  const getTabsForRole = () => {
    switch (user?.role) {
      case 'super_admin':
      case 'manager':
        return (
          <Tabs
            screenOptions={{
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
                fontSize: 12,
                fontWeight: '600',
              },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'Dashboard',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="grid" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="students"
              options={{
                title: 'Students',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="people" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="leads"
              options={{
                title: 'CRM',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="person-add" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="teachers"
              options={{
                title: 'Teachers',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="school" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="groups"
              options={{
                title: 'Groups',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="people-circle" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title: 'Profile',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="person" size={size} color={color} />
                ),
              }}
            />
          </Tabs>
        );

      case 'teacher':
        return (
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: COLORS.gold,
              tabBarInactiveTintColor: COLORS.textTertiary,
              tabBarStyle: {
                backgroundColor: COLORS.backgroundCard,
                borderTopColor: COLORS.marbleGray,
                height: 60,
                paddingBottom: 8,
              },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'My Classes',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="calendar" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="groups"
              options={{
                title: 'Groups',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="people-circle" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title: 'Profile',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="person" size={size} color={color} />
                ),
              }}
            />
          </Tabs>
        );

      case 'student':
        return (
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: COLORS.gold,
              tabBarInactiveTintColor: COLORS.textTertiary,
              tabBarStyle: {
                backgroundColor: COLORS.backgroundCard,
                borderTopColor: COLORS.marbleGray,
                height: 60,
                paddingBottom: 8,
              },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'Home',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="home" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title: 'Profile',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="person" size={size} color={color} />
                ),
              }}
            />
          </Tabs>
        );

      case 'parent':
        return (
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: COLORS.gold,
              tabBarInactiveTintColor: COLORS.textTertiary,
              tabBarStyle: {
                backgroundColor: COLORS.backgroundCard,
                borderTopColor: COLORS.marbleGray,
                height: 60,
                paddingBottom: 8,
              },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'My Children',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="people" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title: 'Profile',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="person" size={size} color={color} />
                ),
              }}
            />
          </Tabs>
        );

      case 'support':
        return (
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: COLORS.gold,
              tabBarInactiveTintColor: COLORS.textTertiary,
              tabBarStyle: {
                backgroundColor: COLORS.backgroundCard,
                borderTopColor: COLORS.marbleGray,
                height: 60,
                paddingBottom: 8,
              },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'Bookings',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="calendar" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                title: 'Profile',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="person" size={size} color={color} />
                ),
              }}
            />
          </Tabs>
        );

      default:
        return null;
    }
  };

  return getTabsForRole();
}
