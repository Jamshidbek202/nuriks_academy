import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, LAYOUT, SIZES } from '../../src/constants/theme';
import { useLanguage } from '../../src/contexts/LanguageContext';

type TabDefinition = {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const ALL_ROUTES = [
  'index', 'students', 'finance', 'chats', 'profile', 'groups', 'payments',
  'earnings', 'teachers', 'leads', 'attendance', 'homework', 'tests',
  'certificates', 'progress', 'settings', 'courses', 'notification-settings',
  'notifications', 'feature-flags', 'analytics', 'news', 'audit-logs', 'backups',
  'staff-management', 'parent-home', 'teacher-home', 'support-home',
  'student-home', 'reception-home', 'journal', 'more',
] as const;

const tab = (name: string, label: string, icon: keyof typeof Ionicons.glyphMap): TabDefinition => ({ name, label, icon });

const ROLE_TABS: Record<string, { mobile: TabDefinition[]; desktop: TabDefinition[] }> = {
  super_admin: {
    mobile: [tab('index', 'Home', 'grid-outline'), tab('students', 'Students', 'people-outline'), tab('finance', 'Finance', 'wallet-outline'), tab('chats', 'Chats', 'chatbubbles-outline'), tab('profile', 'Profile', 'person-circle-outline')],
    desktop: [tab('index', 'Home', 'grid-outline'), tab('students', 'Students', 'people-outline'), tab('finance', 'Finance', 'wallet-outline'), tab('groups', 'Groups', 'people-circle-outline'), tab('teachers', 'Teachers', 'school-outline'), tab('leads', 'Leads', 'funnel-outline'), tab('chats', 'Chats', 'chatbubbles-outline'), tab('profile', 'Profile', 'person-circle-outline')],
  },
  manager: {
    mobile: [tab('index', 'Home', 'grid-outline'), tab('students', 'Students', 'people-outline'), tab('finance', 'Finance', 'wallet-outline'), tab('leads', 'Leads', 'funnel-outline'), tab('profile', 'Profile', 'person-circle-outline')],
    desktop: [tab('index', 'Home', 'grid-outline'), tab('students', 'Students', 'people-outline'), tab('finance', 'Finance', 'wallet-outline'), tab('groups', 'Groups', 'people-circle-outline'), tab('teachers', 'Teachers', 'school-outline'), tab('leads', 'Leads', 'funnel-outline'), tab('profile', 'Profile', 'person-circle-outline')],
  },
  reception: {
    mobile: [tab('index', 'Home', 'home-outline'), tab('students', 'Students', 'people-outline'), tab('finance', 'Payments', 'cash-outline'), tab('leads', 'Leads', 'funnel-outline'), tab('profile', 'Profile', 'person-circle-outline')],
    desktop: [tab('index', 'Home', 'home-outline'), tab('students', 'Students', 'people-outline'), tab('finance', 'Payments', 'cash-outline'), tab('leads', 'Leads', 'funnel-outline'), tab('profile', 'Profile', 'person-circle-outline')],
  },
  teacher: {
    mobile: [tab('index', 'Today', 'calendar-outline'), tab('groups', 'Groups', 'people-circle-outline'), tab('attendance', 'Attendance', 'checkbox-outline'), tab('earnings', 'Earnings', 'cash-outline'), tab('more', 'More', 'menu-outline')],
    desktop: [tab('index', 'Today', 'calendar-outline'), tab('groups', 'Groups', 'people-circle-outline'), tab('attendance', 'Attendance', 'checkbox-outline'), tab('earnings', 'Earnings', 'cash-outline'), tab('homework', 'Homework', 'book-outline'), tab('tests', 'Tests', 'clipboard-outline'), tab('profile', 'Profile', 'person-circle-outline')],
  },
  student: {
    mobile: [tab('index', 'Home', 'home-outline'), tab('groups', 'Groups', 'people-circle-outline'), tab('homework', 'Homework', 'book-outline'), tab('payments', 'Payments', 'card-outline'), tab('more', 'More', 'menu-outline')],
    desktop: [tab('index', 'Home', 'home-outline'), tab('groups', 'Groups', 'people-circle-outline'), tab('chats', 'Chats', 'chatbubbles-outline'), tab('homework', 'Homework', 'book-outline'), tab('tests', 'Tests', 'clipboard-outline'), tab('payments', 'Payments', 'card-outline'), tab('progress', 'Grades', 'analytics-outline'), tab('profile', 'Profile', 'person-circle-outline')],
  },
  parent: {
    mobile: [tab('index', 'Home', 'home-outline'), tab('progress', 'Progress', 'analytics-outline'), tab('homework', 'Homework', 'book-outline'), tab('payments', 'Payments', 'card-outline'), tab('more', 'More', 'menu-outline')],
    desktop: [tab('index', 'Home', 'home-outline'), tab('groups', 'Groups', 'people-circle-outline'), tab('progress', 'Progress', 'analytics-outline'), tab('homework', 'Homework', 'book-outline'), tab('tests', 'Tests', 'clipboard-outline'), tab('payments', 'Payments', 'card-outline'), tab('profile', 'Profile', 'person-circle-outline')],
  },
  support: {
    mobile: [tab('index', 'Bookings', 'calendar-outline'), tab('chats', 'Chats', 'chatbubbles-outline'), tab('profile', 'Profile', 'person-circle-outline')],
    desktop: [tab('index', 'Bookings', 'calendar-outline'), tab('chats', 'Chats', 'chatbubbles-outline'), tab('profile', 'Profile', 'person-circle-outline')],
  },
};

const FALLBACK_TABS = {
  mobile: [tab('index', 'Home', 'home-outline'), tab('profile', 'Profile', 'person-circle-outline')],
  desktop: [tab('index', 'Home', 'home-outline'), tab('profile', 'Profile', 'person-circle-outline')],
};

export default function DashboardLayout() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const isDesktop = width >= LAYOUT.desktopBreakpoint;

  const visibleTabs = useMemo(() => {
    const roleTabs = ROLE_TABS[user?.role || ''] || FALLBACK_TABS;
    return isDesktop ? roleTabs.desktop : roleTabs.mobile;
  }, [isDesktop, user?.role]);

  const visibleByName = useMemo(() => new Map(visibleTabs.map((item) => [item.name, item])), [visibleTabs]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: styles.scene,
        tabBarPosition: isDesktop ? 'left' : 'bottom',
        tabBarActiveTintColor: COLORS.gold,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarActiveBackgroundColor: COLORS.gold + '12',
        tabBarHideOnKeyboard: true,
        tabBarStyle: isDesktop ? styles.desktopTabBar : styles.mobileTabBar,
        tabBarItemStyle: isDesktop ? styles.desktopTabItem : styles.mobileTabItem,
        tabBarLabelPosition: isDesktop ? 'beside-icon' : 'below-icon',
        tabBarLabelStyle: isDesktop ? styles.desktopLabel : styles.mobileLabel,
        tabBarIconStyle: styles.tabIcon,
      }}
    >
      {visibleTabs.map((definition) => (
        <Tabs.Screen
          key={definition.name}
          name={definition.name}
          options={{
            title: t(definition.label),
            tabBarAccessibilityLabel: t(definition.label),
            tabBarIcon: ({ color, size }) => <Ionicons name={definition.icon} size={size} color={color} />,
          }}
        />
      ))}
      {ALL_ROUTES.filter((routeName) => !visibleByName.has(routeName)).map((routeName) => (
        <Tabs.Screen key={routeName} name={routeName} options={{ href: null }} />
      ))}
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
  scene: { backgroundColor: COLORS.background },
  mobileTabBar: {
    minHeight: 68,
    paddingTop: SIZES.sm,
    paddingBottom: SIZES.sm,
    backgroundColor: COLORS.backgroundCard,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  desktopTabBar: {
    width: LAYOUT.sidebarWidth,
    paddingTop: SIZES.xl,
    paddingHorizontal: SIZES.sm,
    paddingBottom: SIZES.lg,
    backgroundColor: COLORS.backgroundSubtle,
    borderTopWidth: 0,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  mobileTabItem: { borderRadius: SIZES.radiusMd },
  desktopTabItem: {
    minHeight: 52,
    maxHeight: 52,
    marginVertical: 3,
    borderRadius: SIZES.radiusMd,
    overflow: 'hidden',
  },
  mobileLabel: { fontSize: 11, fontWeight: '700' },
  desktopLabel: { fontSize: 14, fontWeight: '700', marginLeft: SIZES.sm },
  tabIcon: { marginBottom: 0 },
});
