import { getActiveLocale } from '../../src/i18n/translations';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import { Text, TextInput } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';

// Cross-platform alert
const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function ChatsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');
  const [adminRoleFilter, setAdminRoleFilter] = useState('all');
  const adminRoleFilters = [
    { key: 'all', label: 'All' },
    { key: 'student', label: 'Students' },
    { key: 'parent', label: 'Parents' },
    { key: 'teacher', label: 'Teachers' },
    { key: 'support', label: 'Support' },
    { key: 'manager', label: 'Managers' },
  ];

  const loadData = useCallback(async () => {
    try {
      const [convResponse, contactsResponse] = await Promise.all([
        api.get('/chat/conversations'),
        api.get('/chat/contacts')
      ]);
      setConversations(convResponse.data);
      setContacts(contactsResponse.data);
    } catch (error: any) {
      console.error('Error loading chat data:', error);
      if (error.response?.status === 403) {
        // User doesn't have chat access
        setConversations([]);
        setContacts([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleStartChat = async (contact: any) => {
    try {
      const response = await api.post('/chat/conversations', {
        participant_id: contact.id
      });
      
      // Navigate to conversation
      router.push(`/chat/${response.data.id}`);
    } catch (error: any) {
      showAlert('Error', error.response?.data?.detail || 'Failed to start conversation');
    }
  };

  const handleOpenChat = (conversationId: string) => {
    router.push(`/chat/${conversationId}`);
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString(getActiveLocale(), { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString(getActiveLocale(), { weekday: 'short' });
    } else {
      return date.toLocaleDateString(getActiveLocale(), { month: 'short', day: 'numeric' });
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'super_admin': return 'shield-checkmark';
      case 'manager': return 'briefcase';
      case 'parent': return 'people';
      case 'teacher': return 'school';
      case 'student': return 'person';
      case 'support': return 'headset';
      default: return 'person';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'super_admin': return COLORS.gold;
      case 'manager': return COLORS.marbleLight;
      case 'parent': return COLORS.goldLight;
      case 'teacher': return COLORS.info;
      case 'student': return COLORS.success;
      case 'support': return COLORS.warning;
      default: return COLORS.textSecondary;
    }
  };

  const filteredConversations = conversations.filter(conv => {
    const role = conv.other_participant?.role || '';
    if (user?.role === 'super_admin' && adminRoleFilter !== 'all' && role !== adminRoleFilter) return false;
    if (!searchQuery) return true;
    const name = conv.other_participant?.name || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredContacts = contacts.filter(contact => {
    if (user?.role === 'super_admin' && adminRoleFilter !== 'all' && contact.role !== adminRoleFilter) return false;
    if (!searchQuery) return true;
    return contact.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Check if user has chat access
  const hasAccess = user?.role && !['parent', 'manager'].includes(user.role);

  useLiveRefresh(loadData, Boolean(hasAccess), `chat-list:${user?.id || user?._id || ''}`, 3000);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  if (!hasAccess) {
    return (
      <View style={styles.noAccessContainer}>
        <Ionicons name="chatbubbles-outline" size={80} color={COLORS.textTertiary} />
        <Text style={styles.noAccessTitle}>Chat Not Available</Text>
        <Text style={styles.noAccessText}>
          Chat feature is not available for your role.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>
            {conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)} unread
          </Text>
        </View>
      </View>

      {user?.role === 'super_admin' && (
        <View style={styles.adminFilterShell}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminFilterContent}>
            {adminRoleFilters.map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.adminFilterButton,
                  adminRoleFilter === filter.key && styles.adminFilterButtonActive,
                ]}
                onPress={() => setAdminRoleFilter(filter.key)}
              >
                <Text
                  style={[
                    styles.adminFilterText,
                    adminRoleFilter === filter.key && styles.adminFilterTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={COLORS.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor={COLORS.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={COLORS.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chats' && styles.activeTab]}
          onPress={() => setActiveTab('chats')}
        >
          <Text style={[styles.tabText, activeTab === 'chats' && styles.activeTabText]}>
            Chats ({conversations.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'contacts' && styles.activeTab]}
          onPress={() => setActiveTab('contacts')}
        >
          <Text style={[styles.tabText, activeTab === 'contacts' && styles.activeTabText]}>
            Contacts ({contacts.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
            tintColor={COLORS.gold}
          />
        }
      >
        {activeTab === 'chats' ? (
          // Conversations List
          filteredConversations.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubble-ellipses-outline" size={60} color={COLORS.textTertiary} />
              <Text style={styles.emptyTitle}>No Conversations</Text>
              <Text style={styles.emptyText}>
                Start a conversation from the Contacts tab
              </Text>
            </View>
          ) : (
            filteredConversations.map((conv) => (
              <TouchableOpacity
                key={conv.id}
                testID={`chat-conversation-${conv.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Open conversation with ${conv.other_participant?.name || 'user'}`}
                style={styles.conversationCard}
                onPress={() => handleOpenChat(conv.id)}
              >
                <View style={styles.avatarContainer}>
                  <View style={[styles.avatar, { backgroundColor: getRoleColor(conv.other_participant?.role) + '30' }]}>
                    <Ionicons
                      name={getRoleIcon(conv.other_participant?.role)}
                      size={24}
                      color={getRoleColor(conv.other_participant?.role)}
                    />
                  </View>
                  {conv.other_participant?.is_online && (
                    <View style={styles.onlineIndicator} />
                  )}
                </View>
                
                <View style={styles.conversationInfo}>
                  <View style={styles.conversationHeader}>
                    <Text style={styles.participantName} numberOfLines={1}>
                      {conv.other_participant?.role === 'super_admin' ? 'Chat with Admin' : conv.other_participant?.name || 'Unknown'}
                    </Text>
                    <Text style={styles.timeText}>
                      {formatTime(conv.last_message_at)}
                    </Text>
                  </View>
                  
                  <View style={styles.conversationFooter}>
                    <Text style={styles.lastMessage} numberOfLines={1}>
                      {conv.last_message || 'No messages yet'}
                    </Text>
                    {conv.unread_count > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{conv.unread_count}</Text>
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.roleBadge}>
                    <Text style={[styles.roleText, { color: getRoleColor(conv.other_participant?.role) }]}>
                      {conv.other_participant?.role?.replace('_', ' ')}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )
        ) : (
          // Contacts List
          filteredContacts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={60} color={COLORS.textTertiary} />
              <Text style={styles.emptyTitle}>No Contacts</Text>
              <Text style={styles.emptyText}>
                {user?.role === 'student' 
                  ? 'You can chat with your assigned teachers and support staff'
                  : user?.role === 'teacher'
                  ? 'You can chat with your assigned students'
                  : 'You can chat with students'}
              </Text>
            </View>
          ) : (
            filteredContacts.map((contact) => (
              <TouchableOpacity
                key={contact.id}
                testID={`chat-contact-${contact.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Start conversation with ${contact.name}`}
                style={styles.contactCard}
                onPress={() => handleStartChat(contact)}
              >
                <View style={styles.avatarContainer}>
                  <View style={[styles.avatar, { backgroundColor: getRoleColor(contact.role) + '30' }]}>
                    <Ionicons
                      name={getRoleIcon(contact.role)}
                      size={24}
                      color={getRoleColor(contact.role)}
                    />
                  </View>
                  {contact.is_online && (
                    <View style={styles.onlineIndicator} />
                  )}
                </View>
                
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <View style={styles.contactMeta}>
                    <View style={[styles.roleBadgeSmall, { backgroundColor: getRoleColor(contact.role) + '20' }]}>
                      <Text style={[styles.roleTextSmall, { color: getRoleColor(contact.role) }]}>
                        {contact.role?.replace('_', ' ')}
                      </Text>
                    </View>
                    {contact.subject && (
                      <Text style={styles.subjectText}>{contact.subject}</Text>
                    )}
                    {contact.student_id && (
                      <Text style={styles.studentIdText}>{contact.student_id}</Text>
                    )}
                  </View>
                </View>
                
                <Ionicons name="chatbubble-outline" size={24} color={COLORS.gold} />
              </TouchableOpacity>
            ))
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  noAccessContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SIZES.xl,
  },
  noAccessTitle: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: SIZES.lg,
  },
  noAccessText: {
    fontSize: SIZES.fontMd,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SIZES.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SIZES.headerTop,
    paddingHorizontal: SIZES.lg,
    paddingBottom: SIZES.md,
    backgroundColor: COLORS.marbleDark,
  },
  headerTitle: {
    fontSize: SIZES.fontXxl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  headerBadge: {
    backgroundColor: COLORS.gold + '30',
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.xs,
    borderRadius: SIZES.radiusFull,
  },
  headerBadgeText: {
    fontSize: SIZES.fontSm,
    color: COLORS.gold,
    fontWeight: '600',
  },
  adminFilterShell: {
    backgroundColor: COLORS.marbleDark,
    paddingBottom: SIZES.sm,
  },
  adminFilterContent: {
    paddingHorizontal: SIZES.md,
    gap: SIZES.sm,
  },
  adminFilterButton: {
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusFull,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
    backgroundColor: COLORS.backgroundCard,
  },
  adminFilterButtonActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  adminFilterText: {
    fontSize: SIZES.fontSm,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  adminFilterTextActive: {
    color: COLORS.marbleDark,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundCard,
    marginHorizontal: SIZES.md,
    marginVertical: SIZES.sm,
    paddingHorizontal: SIZES.md,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SIZES.sm,
    paddingHorizontal: SIZES.sm,
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: SIZES.md,
    marginBottom: SIZES.sm,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: SIZES.sm,
    alignItems: 'center',
    borderRadius: SIZES.radiusSm,
  },
  activeTab: {
    backgroundColor: COLORS.gold,
  },
  tabText: {
    fontSize: SIZES.fontSm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  activeTabText: {
    color: COLORS.marbleDark,
  },
  content: {
    flex: 1,
    paddingHorizontal: SIZES.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SIZES.xl * 2,
  },
  emptyTitle: {
    fontSize: SIZES.fontLg,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: SIZES.md,
  },
  emptyText: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SIZES.xs,
    paddingHorizontal: SIZES.lg,
  },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.sm,
    ...SHADOWS.small,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: SIZES.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.success,
    borderWidth: 2,
    borderColor: COLORS.backgroundCard,
  },
  conversationInfo: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participantName: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: SIZES.sm,
  },
  timeText: {
    fontSize: SIZES.fontXs,
    color: COLORS.textTertiary,
  },
  conversationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SIZES.xs,
  },
  lastMessage: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    flex: 1,
    marginRight: SIZES.sm,
  },
  unreadBadge: {
    backgroundColor: COLORS.gold,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    fontSize: SIZES.fontXs,
    fontWeight: 'bold',
    color: COLORS.marbleDark,
  },
  roleBadge: {
    marginTop: SIZES.xs,
  },
  roleText: {
    fontSize: SIZES.fontXs,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.sm,
    ...SHADOWS.small,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: SIZES.fontMd,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  contactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SIZES.xs,
    gap: SIZES.sm,
  },
  roleBadgeSmall: {
    paddingHorizontal: SIZES.sm,
    paddingVertical: 2,
    borderRadius: SIZES.radiusSm,
  },
  roleTextSmall: {
    fontSize: SIZES.fontXs,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  subjectText: {
    fontSize: SIZES.fontXs,
    color: COLORS.textSecondary,
  },
  studentIdText: {
    fontSize: SIZES.fontXs,
    color: COLORS.textTertiary,
  },
});
