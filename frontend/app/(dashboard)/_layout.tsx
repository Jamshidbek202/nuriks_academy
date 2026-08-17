import React, { useMemo } from 'react';
import { ActivityIndicator, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../src/components/LocalizedText';
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
        tabBarActiveBackgroundColor: 'transparent',
        tabBarHideOnKeyboard: true,
        tabBarStyle: isDesktop ? styles.desktopTabBar : styles.mobileTabBar,
        tabBarItemStyle: isDesktop ? styles.desktopTabItem : styles.mobileTabItem,
        tabBarLabelPosition: isDesktop ? 'beside-icon' : 'below-icon',
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: isDesktop ? styles.desktopLabel : styles.mobileLabel,
        tabBarIconStyle: styles.tabIcon,
        tabBarBackground: isDesktop ? () => <DesktopRailBackdrop user={user} /> : undefined,
      }}
    >
      {visibleTabs.map((definition) => (
        <Tabs.Screen
          key={definition.name}
          name={definition.name}
          options={{
            title: t(definition.label),
            tabBarAccessibilityLabel: t(definition.label),
            tabBarIcon: ({ color, size, focused }) => (
              <View style={styles.navIconWrap}>
                <View style={[
                  styles.navIndicator,
                  isDesktop ? styles.navIndicatorDesktop : styles.navIndicatorMobile,
                  focused && styles.navIndicatorActive,
                ]} />
                <Ionicons name={definition.icon} size={size} color={color} />
              </View>
            ),
          }}
        />
      ))}
      {ALL_ROUTES.filter((routeName) => !visibleByName.has(routeName)).map((routeName) => (
        <Tabs.Screen key={routeName} name={routeName} options={{ href: null }} />
      ))}
    </Tabs>
  );
}

function DesktopRailBackdrop({ user }: { user: NonNullable<ReturnType<typeof useAuth>['user']> }) {
  const initials = String(user.full_name || 'Nurik Academy')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <View pointerEvents="none" style={styles.railBackdrop}>
      <View style={styles.railBrand}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.railLogo}
          resizeMode="contain"
          accessibilityLabel="Nurik's Academy logo"
        />
        <View style={styles.railBrandCopy}>
          <Text style={styles.railBrandName}>Nurik&apos;s Academy</Text>
          <Text style={styles.railBrandRole}>{String(user.role || '').replaceAll('_', ' ')}</Text>
        </View>
      </View>
      <View style={styles.railIdentity}>
        <View style={styles.railAvatar}><Text style={styles.railAvatarText}>{initials || 'NA'}</Text></View>
        <View style={styles.railIdentityCopy}>
          <Text numberOfLines={1} style={styles.railIdentityName}>{user.full_name}</Text>
          <Text style={styles.railIdentityPlace}>Nurik&apos;s Academy</Text>
        </View>
      </View>
    </View>
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
    minHeight: 70,
    paddingTop: 6,
    paddingBottom: 7,
    backgroundColor: COLORS.backgroundSubtle,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  desktopTabBar: {
    width: LAYOUT.sidebarWidth,
    minWidth: LAYOUT.sidebarWidth,
    paddingTop: 112,
    paddingHorizontal: 0,
    paddingBottom: 92,
    backgroundColor: COLORS.backgroundSubtle,
    borderTopWidth: 0,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  mobileTabItem: { borderRadius: 0 },
  desktopTabItem: {
    minHeight: 48,
    maxHeight: 48,
    marginVertical: 1,
    borderRadius: 0,
    paddingHorizontal: SIZES.md,
    overflow: 'hidden',
  },
  mobileLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.1 },
  desktopLabel: { fontSize: 13, fontWeight: '600', marginLeft: SIZES.sm },
  tabIcon: { marginBottom: 0 },
  navIconWrap: { minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  navIndicator: { position: 'absolute', backgroundColor: 'transparent' },
  navIndicatorDesktop: { left: -24, top: -10, bottom: -10, width: 2 },
  navIndicatorMobile: { top: -7, left: 2, right: 2, height: 2 },
  navIndicatorActive: { backgroundColor: COLORS.gold },
  railBackdrop: { ...StyleSheet.absoluteFillObject },
  railBrand: { position: 'absolute', top: 25, left: SIZES.md, right: SIZES.sm, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  railLogo: { width: 42, height: 42, flexShrink: 0 },
  railBrandCopy: { flex: 1, minWidth: 0 },
  railBrandName: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '800' },
  railBrandRole: { color: COLORS.textSecondary, fontSize: 10, marginTop: 3, textTransform: 'capitalize' },
  railIdentity: { position: 'absolute', left: SIZES.md, right: SIZES.sm, bottom: 23, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, paddingTop: SIZES.sm },
  railAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  railAvatarText: { color: COLORS.textOnGold, fontSize: 10, fontWeight: '900' },
  railIdentityCopy: { flex: 1, minWidth: 0 },
  railIdentityName: { color: COLORS.textPrimary, fontSize: 11, fontWeight: '700' },
  railIdentityPlace: { color: COLORS.textTertiary, fontSize: 9, marginTop: 2 },
});
