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
                fontSize: 10,
                fontWeight: '600',
              },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'Home',
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
              name="groups"
              options={{
                title: 'Groups',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="people-circle" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="journal"
              options={{
                title: 'Journal',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="journal" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="tests"
              options={{
                title: 'Tests',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="clipboard" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="progress"
              options={{
                title: 'Progress',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="analytics" size={size} color={color} />
                ),
              }}
            />
            {/* Hidden screens accessible via navigation */}
            <Tabs.Screen
              name="teachers"
              options={{
                href: null,
              }}
            />
            <Tabs.Screen
              name="leads"
              options={{
                href: null,
              }}
            />
            <Tabs.Screen
              name="attendance"
              options={{
                href: null,
              }}
            />
            <Tabs.Screen
              name="homework"
              options={{
                href: null,
              }}
            />
            <Tabs.Screen
              name="profile"
              options={{
                href: null,
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
              tabBarLabelStyle: {
                fontSize: 10,
                fontWeight: '600',
              },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'Home',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="calendar" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="journal"
              options={{
                title: 'Journal',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="journal" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="homework"
              options={{
                title: 'Homework',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="book" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="tests"
              options={{
                title: 'Tests',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="clipboard" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="attendance"
              options={{
                title: 'Attendance',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="checkbox" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="progress"
              options={{
                title: 'Progress',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="analytics" size={size} color={color} />
                ),
              }}
            />
            {/* Hidden screens */}
            <Tabs.Screen name="groups" options={{ href: null }} />
            <Tabs.Screen name="students" options={{ href: null }} />
            <Tabs.Screen name="teachers" options={{ href: null }} />
            <Tabs.Screen name="leads" options={{ href: null }} />
            <Tabs.Screen name="profile" options={{ href: null }} />
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
              tabBarLabelStyle: {
                fontSize: 10,
                fontWeight: '600',
              },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{
                title: 'Home',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="people" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="homework"
              options={{
                title: 'Homework',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="book" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="tests"
              options={{
                title: 'Tests',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="clipboard" size={size} color={color} />
                ),
              }}
            />
            <Tabs.Screen
              name="progress"
              options={{
                title: 'Progress',
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name="analytics" size={size} color={color} />
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
            {/* Hidden screens */}
            <Tabs.Screen name="groups" options={{ href: null }} />
            <Tabs.Screen name="students" options={{ href: null }} />
            <Tabs.Screen name="teachers" options={{ href: null }} />
            <Tabs.Screen name="leads" options={{ href: null }} />
            <Tabs.Screen name="journal" options={{ href: null }} />
            <Tabs.Screen name="attendance" options={{ href: null }} />
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
