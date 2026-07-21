import { getActiveLocale } from '../../src/i18n/translations';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from '../../src/components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../../src/services/api';
import { COLORS, SHADOWS, SIZES } from '../../src/constants/theme';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';

type Category = 'all' | 'chat' | 'academic' | 'payments' | 'news' | 'system';
type SortOrder = 'newest' | 'oldest';

interface InboxNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  category: Exclude<Category, 'all'>;
  data?: Record<string, string>;
  is_read: boolean;
  created_at: string;
}

const CATEGORIES: { value: Category; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: 'notifications-outline' },
  { value: 'chat', label: 'Chats', icon: 'chatbubble-outline' },
  { value: 'academic', label: 'Academic', icon: 'school-outline' },
  { value: 'payments', label: 'Payments', icon: 'card-outline' },
  { value: 'news', label: 'News', icon: 'newspaper-outline' },
  { value: 'system', label: 'System', icon: 'megaphone-outline' },
];

const CATEGORY_ICONS: Record<string, string> = {
  chat: 'chatbubble', academic: 'school', payments: 'card', news: 'newspaper', system: 'megaphone',
};

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [category, setCategory] = useState<Category>('all');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = async () => {
    try {
      const response = await api.get('/notifications', {
        params: {
          ...(category !== 'all' ? { category } : {}),
          unread_only: unreadOnly,
          sort,
          limit: 200,
          _: Date.now(),
        },
      });
      setNotifications(response.data);
    } catch (error) {
      console.error('Unable to load notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useLiveRefresh(loadNotifications, true, `${category}:${sort}:${unreadOnly}`);

  const markRead = async (notification: InboxNotification) => {
    if (!notification.is_read) {
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
      try {
        await api.patch(`/notifications/${notification.id}/read`);
      } catch {
        void loadNotifications();
        return;
      }
    }

    const data = notification.data || {};
    if (notification.type === 'chat_message' && data.conversation_id) {
      router.push(`/chat/${data.conversation_id}` as any);
    } else if (notification.type === 'homework_assigned') {
      router.push('/(dashboard)/homework');
    } else if (notification.type === 'attendance') {
      router.push('/(dashboard)/attendance');
    } else if (notification.type === 'certificate') {
      router.push('/(dashboard)/certificates');
    } else if (notification.type === 'grade') {
      router.push('/(dashboard)/progress');
    } else if (notification.category === 'academic') {
      router.push('/(dashboard)/tests');
    } else if (notification.category === 'payments') {
      router.push('/(dashboard)/payments');
    } else if (notification.category === 'news') {
      router.push('/(dashboard)/news');
    }
  };

  const markAllRead = async () => {
    await api.post('/notifications/read-all', null, {
      params: category !== 'all' ? { category } : {},
    });
    setNotifications((current) => unreadOnly ? [] : current.map((item) => ({ ...item, is_read: true })));
  };

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSubtitle}>{unreadCount} unread in this view</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(dashboard)/notification-settings')} style={styles.headerButton}>
          <Ionicons name="settings-outline" size={23} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filtersContent}>
        {CATEGORIES.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[styles.filterChip, category === item.value && styles.filterChipActive]}
            onPress={() => setCategory(item.value)}
          >
            <Ionicons name={item.icon as any} size={16} color={category === item.value ? COLORS.marbleDark : COLORS.textSecondary} />
            <Text style={[styles.filterText, category === item.value && styles.filterTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.toolbar}>
        <TouchableOpacity style={[styles.toolButton, unreadOnly && styles.toolButtonActive]} onPress={() => setUnreadOnly((value) => !value)}>
          <Ionicons name={unreadOnly ? 'mail-unread' : 'mail-unread-outline'} size={18} color={unreadOnly ? COLORS.gold : COLORS.textSecondary} />
          <Text style={[styles.toolText, unreadOnly && { color: COLORS.gold }]}>Unread only</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolButton} onPress={() => setSort((value) => value === 'newest' ? 'oldest' : 'newest')}>
          <Ionicons name="swap-vertical" size={18} color={COLORS.textSecondary} />
          <Text style={styles.toolText}>{sort === 'newest' ? 'Newest first' : 'Oldest first'}</Text>
        </TouchableOpacity>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.gold} /></View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={notifications.length === 0 ? styles.emptyList : styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadNotifications(); }} tintColor={COLORS.gold} />}
        >
          {notifications.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={58} color={COLORS.textTertiary} />
              <Text style={styles.emptyTitle}>No notifications here</Text>
              <Text style={styles.emptyText}>New messages and updates will appear automatically.</Text>
            </View>
          ) : notifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              style={[styles.notificationCard, !notification.is_read && styles.unreadCard]}
              onPress={() => void markRead(notification)}
            >
              <View style={[styles.notificationIcon, !notification.is_read && styles.unreadIcon]}>
                <Ionicons name={(CATEGORY_ICONS[notification.category] || 'notifications') as any} size={21} color={COLORS.gold} />
              </View>
              <View style={styles.notificationContent}>
                <View style={styles.notificationHeader}>
                  <Text style={[styles.notificationTitle, !notification.is_read && styles.unreadTitle]} numberOfLines={1}>{notification.title}</Text>
                  {!notification.is_read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.notificationMessage} numberOfLines={2}>{notification.message}</Text>
                <Text style={styles.notificationTime}>{new Date(notification.created_at).toLocaleString(getActiveLocale())}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitleContainer: { flex: 1, alignItems: 'center' },
  headerTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontXl, fontWeight: '800' },
  headerSubtitle: { color: COLORS.textTertiary, fontSize: SIZES.fontXs, marginTop: 2 },
  filters: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  filtersContent: { paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, gap: SIZES.sm },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SIZES.md, paddingVertical: 9, borderRadius: 20, backgroundColor: COLORS.backgroundLight },
  filterChipActive: { backgroundColor: COLORS.gold },
  filterText: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '600' },
  filterTextActive: { color: COLORS.marbleDark },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm },
  toolButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 9, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.backgroundLight },
  toolButtonActive: { borderWidth: 1, borderColor: COLORS.gold },
  toolText: { color: COLORS.textSecondary, fontSize: SIZES.fontXs },
  markAllText: { color: COLORS.gold, fontSize: SIZES.fontXs, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  listContent: { padding: SIZES.md, paddingBottom: SIZES.xxl },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: SIZES.xl },
  emptyTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '700', marginTop: SIZES.md },
  emptyText: { color: COLORS.textTertiary, fontSize: SIZES.fontSm, textAlign: 'center', marginTop: SIZES.xs },
  notificationCard: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, padding: SIZES.md, marginBottom: SIZES.sm, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundCard, ...SHADOWS.small },
  unreadCard: { borderLeftWidth: 3, borderLeftColor: COLORS.gold, backgroundColor: COLORS.gold + '0D' },
  notificationIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.backgroundLight },
  unreadIcon: { backgroundColor: COLORS.gold + '20' },
  notificationContent: { flex: 1 },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', gap: SIZES.xs },
  notificationTitle: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '600' },
  unreadTitle: { fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.gold },
  notificationMessage: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginTop: 3, lineHeight: 19 },
  notificationTime: { color: COLORS.textTertiary, fontSize: SIZES.fontXs, marginTop: 6 },
});
