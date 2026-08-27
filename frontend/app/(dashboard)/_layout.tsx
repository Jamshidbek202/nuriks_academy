import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { COLORS, SHADOWS } from '../../src/constants/theme';
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

// Route visibility remains role-driven. The concourse shell only changes how
// navigation adapts to available space; it never broadens a role's access.
const ROLE_TABS: Record<string, TabDefinition[]> = {
  super_admin: [
    tab('index', 'Home', 'today-outline'),
    tab('students', 'Students', 'people-outline'),
    tab('finance', 'Finance', 'wallet-outline'),
    tab('chats', 'Chats', 'chatbubbles-outline'),
    tab('profile', 'Profile', 'person-outline'),
  ],
  manager: [
    tab('index', 'Home', 'today-outline'),
    tab('students', 'Students', 'people-outline'),
    tab('finance', 'Finance', 'wallet-outline'),
    tab('leads', 'Leads', 'funnel-outline'),
    tab('profile', 'Profile', 'person-outline'),
  ],
  reception: [
    tab('index', 'Home', 'today-outline'),
    tab('leads', 'Leads', 'funnel-outline'),
    tab('finance', 'Payments', 'cash-outline'),
    tab('students', 'Students', 'people-outline'),
    tab('profile', 'Profile', 'person-outline'),
  ],
  teacher: [
    tab('index', 'Home', 'today-outline'),
    tab('groups', 'Groups', 'people-circle-outline'),
    tab('attendance', 'Attendance', 'checkbox-outline'),
    tab('earnings', 'Earnings', 'cash-outline'),
    tab('homework', 'Homework', 'book-outline'),
    tab('tests', 'Tests', 'clipboard-outline'),
    tab('profile', 'Profile', 'person-outline'),
  ],
  student: [
    tab('index', 'Home', 'today-outline'),
    tab('groups', 'Groups', 'people-circle-outline'),
    tab('chats', 'Chats', 'chatbubbles-outline'),
    tab('homework', 'Homework', 'book-outline'),
    tab('tests', 'Tests', 'clipboard-outline'),
    tab('payments', 'Payments', 'card-outline'),
    tab('progress', 'Grades', 'analytics-outline'),
    tab('profile', 'Profile', 'person-outline'),
  ],
  parent: [
    tab('index', 'Home', 'today-outline'),
    tab('groups', 'Groups', 'people-circle-outline'),
    tab('progress', 'Progress', 'analytics-outline'),
    tab('homework', 'Homework', 'book-outline'),
    tab('tests', 'Tests', 'clipboard-outline'),
    tab('payments', 'Payments', 'card-outline'),
    tab('profile', 'Profile', 'person-outline'),
  ],
  support: [
    tab('index', 'Bookings', 'calendar-outline'),
    tab('chats', 'Chats', 'chatbubbles-outline'),
    tab('profile', 'Profile', 'person-outline'),
  ],
};

const FALLBACK_TABS = [tab('index', 'Home', 'home-outline'), tab('profile', 'Profile', 'person-outline')];

export default function DashboardLayout() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const expanded = width >= 1040;
  const visibleTabs = useMemo(() => ROLE_TABS[user?.role || ''] || FALLBACK_TABS, [user?.role]);
  const visibleByName = useMemo(() => new Set(visibleTabs.map((item) => item.name)), [visibleTabs]);

  if (isLoading) return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.gold} /></View>;
  if (!user) return <Redirect href="/login" />;

  return (
    <View style={styles.appRoot}>
      <Tabs
        tabBar={(props) => (
          <RoleTabBar
            {...props}
            tabs={visibleTabs}
            translate={t}
            expanded={expanded}
            fullName={user.full_name || 'Nurik\'s Academy'}
            role={user.role}
          />
        )}
        screenOptions={{
          headerShown: false,
          sceneStyle: [styles.scene, expanded && styles.sceneExpanded],
          tabBarHideOnKeyboard: true,
          animation: 'none',
        }}
      >
        {visibleTabs.map((definition) => (
          <Tabs.Screen key={definition.name} name={definition.name} options={{ title: t(definition.label), tabBarAccessibilityLabel: t(definition.label) }} />
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
  expanded,
  fullName,
  role,
}: BottomTabBarProps & {
  tabs: TabDefinition[];
  translate: (value: string) => string;
  expanded: boolean;
  fullName: string;
  role: string;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const needsScroll = tabs.length * 76 > width - 24;

  const tabButtons = tabs.map((definition) => {
    const route = state.routes.find((candidate) => candidate.name === definition.name);
    if (!route) return null;
    const focused = state.index === state.routes.indexOf(route);
    return (
      <RoleTabButton
        key={definition.name}
        definition={definition}
        focused={focused}
        label={translate(definition.label)}
        expanded={expanded}
        flexible={!expanded && !needsScroll}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
      />
    );
  });

  if (expanded) {
    return (
      <View style={styles.desktopRail}>
        <GlassBackdrop />
        <View style={styles.brandLockup}>
          <Image source={require('../../assets/images/logo.png')} style={styles.brandLogo} resizeMode="contain" />
          <View style={styles.brandCopy}>
            <Text numberOfLines={1} style={styles.brandName}>Nurik&apos;s</Text>
            <Text style={styles.brandDescriptor}>Academy</Text>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.desktopTabs}>
          {tabButtons}
        </ScrollView>
        <View style={styles.identityBlock}>
          <View style={styles.identityAvatar}><Text style={styles.identityInitial}>{fullName.trim().charAt(0).toUpperCase()}</Text></View>
          <View style={styles.identityCopy}>
            <Text numberOfLines={1} style={styles.identityName}>{fullName}</Text>
            <Text numberOfLines={1} style={styles.identityRole}>{translate(role.replaceAll('_', ' '))}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.mobileRail, { bottom: Math.max(insets.bottom, Platform.OS === 'web' ? 12 : 8) }]}>
      <GlassBackdrop />
      <ScrollView
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        style={styles.mobileScroller}
        contentContainerStyle={[styles.mobileTabs, needsScroll ? styles.mobileTabsScrollable : styles.mobileTabsCentered]}
      >
        {tabButtons}
      </ScrollView>
    </View>
  );
}

function GlassBackdrop() {
  return (
    <View pointerEvents="none" style={styles.glassClip}>
      <BlurView tint="dark" intensity={Platform.OS === 'android' ? 24 : 58} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(255,255,255,0.10)', 'rgba(213,182,98,0.035)', 'rgba(241,217,139,0.055)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function RoleTabButton({ definition, focused, label, expanded, flexible, onPress, onLongPress }: {
  definition: TabDefinition;
  focused: boolean;
  label: string;
  expanded: boolean;
  flexible: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={focused ? { selected: true } : {}}
      activeOpacity={0.78}
      style={[
        expanded ? styles.desktopTab : styles.mobileTab,
        flexible && styles.mobileTabFlexible,
        focused && (expanded ? styles.desktopTabActive : styles.mobileTabActive),
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View
        pointerEvents="none"
        style={[
          styles.tabActiveSurface,
          expanded ? styles.tabActiveSurfaceDesktop : styles.tabActiveSurfaceMobile,
          !focused && { opacity: 0 },
        ]}
      />
      <View
        style={[
          styles.tabMotion,
          expanded && styles.tabMotionExpanded,
        ]}
      >
        <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
          <Ionicons name={definition.icon} size={expanded ? 20 : 21} color={focused ? COLORS.textPrimary : COLORS.textTertiary} />
        </View>
        <Text numberOfLines={1} style={[styles.tabLabel, expanded && styles.tabLabelExpanded, focused && styles.tabLabelActive]}>{label}</Text>
        {expanded && focused && <View style={styles.activeBeacon} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: COLORS.backgroundSolid },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  scene: { backgroundColor: COLORS.background },
  sceneExpanded: { paddingLeft: 224 },
  glassClip: { ...StyleSheet.absoluteFillObject, borderRadius: 28, overflow: 'hidden', backgroundColor: COLORS.glassStrong },
  desktopRail: {
    position: 'absolute', zIndex: 50, left: 16, top: 16, bottom: 16, width: 192, padding: 12,
    borderRadius: 28, borderWidth: 1, borderColor: COLORS.glassHighlight, ...SHADOWS.large,
  },
  brandLockup: { height: 70, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  brandLogo: { width: 34, height: 34 },
  brandCopy: { flex: 1, minWidth: 0 },
  brandName: { color: COLORS.textPrimary, fontSize: 16, lineHeight: 19, fontWeight: '850' as any, letterSpacing: -0.35 },
  brandDescriptor: { color: COLORS.gold, fontSize: 11, lineHeight: 14, fontWeight: '650' as any },
  desktopTabs: { flexGrow: 1, gap: 5, paddingVertical: 14 },
  desktopTab: { position: 'relative', minHeight: 52, justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: 'transparent', overflow: 'hidden' },
  desktopTabActive: { borderColor: COLORS.goldHairline },
  tabMotion: { alignItems: 'center', justifyContent: 'center' },
  tabMotionExpanded: { minHeight: 50, flexDirection: 'row', justifyContent: 'flex-start', paddingHorizontal: 10, gap: 10 },
  tabIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  tabIconActive: { backgroundColor: 'rgba(255,255,255,0.065)' },
  tabLabel: { color: COLORS.textTertiary, fontSize: 10, lineHeight: 13, fontWeight: '650' as any, textAlign: 'center' },
  tabLabelExpanded: { flex: 1, color: COLORS.textSecondary, fontSize: 13, lineHeight: 17, textAlign: 'left' },
  tabLabelActive: { color: COLORS.textPrimary, fontWeight: '750' as any },
  activeBeacon: { width: 5, height: 18, borderRadius: 4, backgroundColor: COLORS.gold },
  identityBlock: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 7, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  identityAvatar: { width: 34, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.goldGlass, borderWidth: 1, borderColor: COLORS.goldHairline },
  identityInitial: { color: COLORS.goldLight, fontSize: 13, fontWeight: '850' as any },
  identityCopy: { flex: 1, minWidth: 0 },
  identityName: { color: COLORS.textPrimary, fontSize: 11, lineHeight: 14, fontWeight: '750' as any },
  identityRole: { color: COLORS.textTertiary, fontSize: 9, lineHeight: 12, marginTop: 2, textTransform: 'capitalize' },
  mobileRail: {
    position: 'absolute', zIndex: 50, left: 12, right: 12, minHeight: 66, maxWidth: 680, alignSelf: 'center',
    borderRadius: 28, borderWidth: 1, borderColor: COLORS.glassHighlight, overflow: 'hidden', ...SHADOWS.large,
  },
  mobileScroller: { width: '100%' },
  mobileTabs: { minHeight: 64, alignItems: 'stretch', padding: 5 },
  mobileTabsCentered: { flexGrow: 1, justifyContent: 'center' },
  mobileTabsScrollable: { paddingHorizontal: 5 },
  mobileTab: { position: 'relative', width: 72, minWidth: 72, minHeight: 54, justifyContent: 'center', borderRadius: 21, borderWidth: 1, borderColor: 'transparent', overflow: 'hidden' },
  mobileTabFlexible: { width: 'auto', minWidth: 62, maxWidth: 116, flexGrow: 1, flexBasis: 72 },
  mobileTabActive: { borderColor: COLORS.goldHairline },
  tabActiveSurface: { position: 'absolute', backgroundColor: 'rgba(213,182,98,0.16)' },
  tabActiveSurfaceDesktop: { left: 0, right: 0, top: 0, bottom: 0, borderRadius: 15 },
  tabActiveSurfaceMobile: { left: 0, right: 0, top: 0, bottom: 0, borderRadius: 20 },
});
