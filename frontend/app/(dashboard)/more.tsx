import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '../../src/components/LocalizedText';
import { useAuth } from '../../src/contexts/AuthContext';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { COLORS, LAYOUT, SHADOWS, SIZES } from '../../src/constants/theme';
import { ConcourseAtmosphere } from '../../src/components/ConcourseAtmosphere';

type MoreItem = {
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
};

const ITEMS: Record<string, MoreItem[]> = {
  super_admin: [
    { label: 'Groups', detail: 'Schedules, teachers, and students', icon: 'people-circle-outline', route: '/(dashboard)/groups' },
    { label: 'Teachers', detail: 'Teaching staff and assignments', icon: 'school-outline', route: '/(dashboard)/teachers' },
    { label: 'Courses', detail: 'Programs and course catalogue', icon: 'book-outline', route: '/(dashboard)/courses' },
    { label: 'Certificates', detail: 'Issue and download certificates', icon: 'ribbon-outline', route: '/(dashboard)/certificates' },
    { label: 'Chats', detail: 'Messages and conversations', icon: 'chatbubbles-outline', route: '/(dashboard)/chats' },
    { label: 'Settings', detail: 'Academy and finance settings', icon: 'settings-outline', route: '/(dashboard)/settings' },
    { label: 'Profile', detail: 'Account and language settings', icon: 'person-circle-outline', route: '/(dashboard)/profile' },
  ],
  manager: [
    { label: 'Groups', detail: 'Schedules, teachers, and students', icon: 'people-circle-outline', route: '/(dashboard)/groups' },
    { label: 'Teachers', detail: 'Teaching staff and assignments', icon: 'school-outline', route: '/(dashboard)/teachers' },
    { label: 'Certificates', detail: 'Issue and download certificates', icon: 'ribbon-outline', route: '/(dashboard)/certificates' },
    { label: 'Profile', detail: 'Account and language settings', icon: 'person-circle-outline', route: '/(dashboard)/profile' },
  ],
  reception: [
    { label: 'Groups', detail: 'Student schedules and class details', icon: 'people-circle-outline', route: '/(dashboard)/groups' },
    { label: 'Profile', detail: 'Account and language settings', icon: 'person-circle-outline', route: '/(dashboard)/profile' },
  ],
  teacher: [
    { label: 'Homework', detail: 'Create and review assignments', icon: 'book-outline', route: '/(dashboard)/homework' },
    { label: 'Tests', detail: 'Tests, results, and grading', icon: 'clipboard-outline', route: '/(dashboard)/tests' },
    { label: 'Journal', detail: 'Lesson notes and student progress', icon: 'journal-outline', route: '/(dashboard)/journal' },
    { label: 'Chats', detail: 'Messages and conversations', icon: 'chatbubbles-outline', route: '/(dashboard)/chats' },
    { label: 'Profile', detail: 'Account and language settings', icon: 'person-circle-outline', route: '/(dashboard)/profile' },
  ],
  student: [
    { label: 'Chats', detail: 'Messages from teachers and staff', icon: 'chatbubbles-outline', route: '/(dashboard)/chats' },
    { label: 'Tests', detail: 'Upcoming tests and results', icon: 'clipboard-outline', route: '/(dashboard)/tests' },
    { label: 'Grades', detail: 'Attendance and learning progress', icon: 'analytics-outline', route: '/(dashboard)/progress' },
    { label: 'Receipts', detail: 'Official proof of confirmed payments', icon: 'receipt-outline', route: '/(dashboard)/payments' },
    { label: 'Profile', detail: 'Account and language settings', icon: 'person-circle-outline', route: '/(dashboard)/profile' },
  ],
  parent: [
    { label: 'Groups', detail: 'Your child’s groups and schedule', icon: 'people-circle-outline', route: '/(dashboard)/groups' },
    { label: 'Tests', detail: 'Upcoming tests and results', icon: 'clipboard-outline', route: '/(dashboard)/tests' },
    { label: 'Profile', detail: 'Account and language settings', icon: 'person-circle-outline', route: '/(dashboard)/profile' },
  ],
};

export default function MoreScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const items = ITEMS[user?.role || ''] || [];

  return (
    <View style={styles.container}>
      <ConcourseAtmosphere />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{t('Nurik\'s Academy')}</Text>
        <Text style={styles.title}>{t('More')}</Text>
        <Text style={styles.subtitle}>{t('Everything else you can use in one place')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.route}
              accessibilityRole="button"
              accessibilityLabel={t(item.label)}
              style={styles.item}
              activeOpacity={0.78}
              onPress={() => router.push(item.route as any)}
            >
              <View style={styles.iconBox}>
                <Ionicons name={item.icon} size={23} color={COLORS.gold} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.itemTitle}>{t(item.label)}</Text>
                <Text style={styles.itemDetail}>{t(item.detail)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingTop: SIZES.headerTop,
    paddingHorizontal: SIZES.lg,
    paddingBottom: SIZES.lg,
    backgroundColor: COLORS.marbleDark,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  eyebrow: { color: COLORS.gold, fontSize: SIZES.fontXs, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { color: COLORS.textPrimary, fontSize: SIZES.fontXxl, fontWeight: '800', marginTop: SIZES.xs },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginTop: SIZES.xs },
  scrollContent: { flexGrow: 1, padding: SIZES.lg },
  content: { width: '100%', maxWidth: LAYOUT.readableMaxWidth, alignSelf: 'center', gap: SIZES.sm },
  item: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.md,
    padding: SIZES.md,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusLg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  iconBox: { width: 44, height: 44, borderRadius: SIZES.radiusMd, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold + '12', borderWidth: 1, borderColor: COLORS.gold + '35' },
  copy: { flex: 1 },
  itemTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '700' },
  itemDetail: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 17, marginTop: 3 },
});
