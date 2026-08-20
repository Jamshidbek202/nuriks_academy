import React, { useEffect, useMemo, useRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../src/components/LocalizedText';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES } from '../../src/constants/theme';
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

// The original role-based navigation is intentionally retained. Each role sees
// its complete working set in one consistent tab bar, with every other route
// hidden from navigation as well as protected by the screen/API permissions.
const ROLE_TABS: Record<string, TabDefinition[]> = {
  super_admin: [
    tab('index', 'Home', 'grid-outline'),
    tab('students', 'Students', 'people-outline'),
    tab('finance', 'Finance', 'wallet-outline'),
    tab('chats', 'Chats', 'chatbubbles-outline'),
    tab('profile', 'Profile', 'person-circle-outline'),
  ],
  manager: [
    tab('index', 'Home', 'grid-outline'),
    tab('students', 'Students', 'people-outline'),
    tab('finance', 'Finance', 'wallet-outline'),
    tab('leads', 'Leads', 'funnel-outline'),
    tab('profile', 'Profile', 'person-circle-outline'),
  ],
  reception: [
    tab('index', 'Home', 'home-outline'),
    tab('leads', 'Leads', 'funnel-outline'),
    tab('finance', 'Payments', 'cash-outline'),
    tab('students', 'Students', 'people-outline'),
    tab('profile', 'Profile', 'person-circle-outline'),
  ],
  teacher: [
    tab('index', 'Home', 'calendar-outline'),
    tab('groups', 'Groups', 'people-circle-outline'),
    tab('attendance', 'Attendance', 'checkbox-outline'),
    tab('earnings', 'Earnings', 'cash-outline'),
    tab('homework', 'Homework', 'book-outline'),
    tab('tests', 'Tests', 'clipboard-outline'),
    tab('profile', 'Profile', 'person-circle-outline'),
  ],
  student: [
    tab('index', 'Home', 'home-outline'),
    tab('groups', 'Groups', 'people-circle-outline'),
    tab('chats', 'Chats', 'chatbubbles-outline'),
    tab('homework', 'Homework', 'book-outline'),
    tab('tests', 'Tests', 'clipboard-outline'),
    tab('payments', 'Payments', 'card-outline'),
    tab('progress', 'Grades', 'analytics-outline'),
    tab('profile', 'Profile', 'person-circle-outline'),
  ],
  parent: [
    tab('index', 'Home', 'home-outline'),
    tab('groups', 'Groups', 'people-circle-outline'),
    tab('progress', 'Progress', 'analytics-outline'),
    tab('homework', 'Homework', 'book-outline'),
    tab('tests', 'Tests', 'clipboard-outline'),
    tab('payments', 'Payments', 'card-outline'),
    tab('profile', 'Profile', 'person-circle-outline'),
  ],
  support: [
    tab('index', 'Bookings', 'calendar-outline'),
    tab('chats', 'Chats', 'chatbubbles-outline'),
    tab('profile', 'Profile', 'person-circle-outline'),
  ],
};

const FALLBACK_TABS = [
  tab('index', 'Home', 'home-outline'),
  tab('profile', 'Profile', 'person-circle-outline'),
];

export default function DashboardLayout() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();
  const visibleTabs = useMemo(() => ROLE_TABS[user?.role || ''] || FALLBACK_TABS, [user?.role]);
  const visibleByName = useMemo(() => new Set(visibleTabs.map((item) => item.name)), [visibleTabs]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  return (
    <View style={styles.appRoot}>
      <Tabs
        tabBar={(props) => <RoleTabBar {...props} tabs={visibleTabs} translate={t} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: styles.scene,
          tabBarHideOnKeyboard: true,
          animation: 'fade',
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
                <View style={styles.iconFrame}>
                  <View style={[styles.activeRule, focused && styles.activeRuleVisible]} />
                  <Ionicons name={definition.icon} size={Math.min(size, 22)} color={color} />
                </View>
              ),
            }}
          />
        ))}
        {ALL_ROUTES.filter((routeName) => !visibleByName.has(routeName)).map((routeName) => (
          <Tabs.Screen key={routeName} name={routeName} options={{ href: null }} />
        ))}
      </Tabs>
    </View>
  );
}

function RoleTabBar({
  state,
  navigation,
  tabs,
  translate,
}: BottomTabBarProps & { tabs: TabDefinition[]; translate: (value: string) => string }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const needsScroll = tabs.length * 76 > width;

  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 5 : 4) }]}>
      <BlurView
        pointerEvents="none"
        tint="dark"
        intensity={Platform.OS === 'android' ? 18 : 42}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.06)', 'rgba(217,184,74,0.025)', 'rgba(255,255,255,0.015)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tabBarFrame}>
        <ScrollView
          horizontal
          bounces={false}
          showsHorizontalScrollIndicator={false}
          style={styles.tabBarScroller}
          contentContainerStyle={[
            styles.tabBarContent,
            needsScroll ? styles.tabBarContentScrollable : styles.tabBarContentCentered,
          ]}
        >
          {tabs.map((definition) => {
          const route = state.routes.find((candidate) => candidate.name === definition.name);
          if (!route) return null;
          const focused = state.index === state.routes.indexOf(route);
          const label = translate(definition.label);

          return (
            <RoleTabButton
              key={definition.name}
              definition={definition}
              focused={focused}
              label={label}
              flexible={!needsScroll}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            />
          );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

function RoleTabButton({
  definition,
  focused,
  label,
  flexible,
  onPress,
  onLongPress,
}: {
  definition: TabDefinition;
  focused: boolean;
  label: string;
  flexible: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const focusMotion = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion) {
        focusMotion.setValue(focused ? 1 : 0);
        return;
      }
      Animated.timing(focusMotion, {
        toValue: focused ? 1 : 0,
        duration: focused ? 210 : 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      cancelled = true;
      focusMotion.stopAnimation();
    };
  }, [focusMotion, focused]);

  return (
    <TouchableOpacity
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={focused ? { selected: true } : {}}
      activeOpacity={0.72}
      style={[styles.tabItem, flexible && styles.tabItemFlexible, focused && styles.tabItemActive]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <Animated.View
        style={[
          styles.tabItemMotion,
          {
            opacity: focusMotion.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
            transform: [
              { translateY: focusMotion.interpolate({ inputRange: [0, 1], outputRange: [1, -1] }) },
              { scale: focusMotion.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
            ],
          },
        ]}
      >
        <View style={styles.iconFrame}>
          <View style={[styles.activeRule, focused && styles.activeRuleVisible]} />
          <Ionicons
            name={definition.icon}
            size={21}
            color={focused ? COLORS.gold : COLORS.textTertiary}
          />
        </View>
        <TextLabel focused={focused}>{label}</TextLabel>
      </Animated.View>
    </TouchableOpacity>
  );
}

function TextLabel({ children, focused }: { children: string; focused: boolean }) {
  return (
    <Text numberOfLines={1} style={[styles.tabLabel, focused && styles.tabLabelActive]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: COLORS.backgroundSolid },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  // An opaque navigator scene is the route-isolation boundary. Individual
  // home screens may add their own atmosphere above this foundation.
  scene: { backgroundColor: COLORS.background },
  tabBar: {
    minHeight: Platform.OS === 'web' ? 64 : 68,
    paddingTop: 5,
    backgroundColor: COLORS.glassStrong,
    borderTopWidth: 1,
    borderTopColor: COLORS.glassHighlight,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.26,
    shadowRadius: 20,
  },
  tabBarFrame: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  tabBarScroller: { width: '100%' },
  tabBarContent: { minHeight: 56, alignItems: 'stretch' },
  tabBarContentScrollable: { paddingHorizontal: 4 },
  tabBarContentCentered: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 8 },
  tabItem: {
    width: 76,
    minWidth: 76,
    minHeight: 56,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabItemActive: { backgroundColor: COLORS.goldGlass, borderColor: COLORS.goldHairline },
  tabItemFlexible: { width: 'auto', minWidth: 64, maxWidth: 112, flexGrow: 1, flexBasis: 76 },
  tabItemMotion: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '650' as any,
    letterSpacing: 0,
    color: COLORS.textTertiary,
    marginTop: 1,
    textAlign: 'center',
  },
  tabLabelActive: { color: COLORS.gold },
  iconFrame: {
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeRule: {
    position: 'absolute',
    top: -6,
    left: 4,
    right: 4,
    height: 2,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  activeRuleVisible: { backgroundColor: COLORS.gold },
});
