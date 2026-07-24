import { getActiveLocale } from '../../src/i18n/translations';
import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { Text, TextInput } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';

interface NewsItem {
  id: string;
  title: string;
  content: string;
  target_audience: string;
  is_published: boolean;
  created_at: string;
  published_at?: string;
}

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'All Users', icon: 'people' },
  { value: 'students', label: 'Students Only', icon: 'school' },
  { value: 'parents', label: 'Parents Only', icon: 'person' },
  { value: 'teachers', label: 'Teachers Only', icon: 'person-circle' },
];

export default function NewsScreen() {
  const { user } = useAuth();
  const canManageNews = user?.role === 'super_admin' || user?.role === 'manager';
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingNewsId, setDeletingNewsId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    target_audience: 'all',
    is_published: false,
  });

  useEffect(() => {
    loadNews();
  }, []);

  const loadNews = async () => {
    try {
      const res = await api.get('/admin/news');
      setNews(res.data);
    } catch (error) {
      console.error('Error loading news:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useLiveRefresh(loadNews, canManageNews, 'admin-news', 3000);

  const openCreateModal = () => {
    setEditingNews(null);
    setFormData({ title: '', content: '', target_audience: 'all', is_published: false });
    setModalVisible(true);
  };

  const openEditModal = (item: NewsItem) => {
    setEditingNews(item);
    setFormData({
      title: item.title,
      content: item.content,
      target_audience: item.target_audience,
      is_published: item.is_published,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.content) {
      Alert.alert('Error', 'Title and content are required');
      return;
    }
    setSaving(true);
    try {
      if (editingNews) {
        await api.put(`/admin/news/${editingNews.id}`, formData);
        Alert.alert('Success', 'News updated successfully');
      } else {
        await api.post('/admin/news', formData);
        Alert.alert('Success', 'News created successfully');
      }
      setModalVisible(false);
      loadNews();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save news');
    } finally {
      setSaving(false);
    }
  };

  const deleteNews = async (id: string) => {
    if (deletingNewsId) return;
    setDeletingNewsId(id);
    try {
      await api.delete(`/admin/news/${id}`);
      setNews((currentNews) => currentNews.filter((item) => item.id !== id));
      Alert.alert('Success', 'News deleted successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to delete news');
    } finally {
      setDeletingNewsId(null);
    }
  };

  const handleDelete = (item: NewsItem) => {
    const message = `Delete “${item.title}”? This cannot be undone.`;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        void deleteNews(item.id);
      }
      return;
    }

    Alert.alert('Delete News', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void deleteNews(item.id),
      },
    ]);
  };

  const handlePublish = async (id: string, publish: boolean) => {
    try {
      await api.put(`/admin/news/${id}`, { is_published: publish });
      loadNews();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update news');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(getActiveLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getAudienceLabel = (audience: string) => {
    return AUDIENCE_OPTIONS.find(o => o.value === audience)?.label || audience;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.gold} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{canManageNews ? 'News Management' : 'Academy News'}</Text>
          <Text style={styles.subtitle}>
            {canManageNews ? 'Create and manage announcements' : 'Announcements from Nurik’s Academy'}
          </Text>
        </View>
        {canManageNews && (
          <TouchableOpacity
            testID="news-add-button"
            accessibilityRole="button"
            accessibilityLabel="Add News"
            style={styles.addButton}
            onPress={openCreateModal}
          >
            <Ionicons name="add" size={24} color={COLORS.marbleDark} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadNews(); }} tintColor={COLORS.gold} />
        }
      >
        {news.length > 0 ? (
          news.map((item) => (
            <View key={item.id} style={styles.newsCard}>
              <View style={styles.newsHeader}>
                <View style={[styles.statusDot, { backgroundColor: item.is_published ? COLORS.success : COLORS.warning }]} />
                <Text style={styles.newsStatus}>{item.is_published ? 'Published' : 'Draft'}</Text>
                <View style={styles.audienceBadge}>
                  <Text style={styles.audienceText}>{getAudienceLabel(item.target_audience)}</Text>
                </View>
              </View>
              <Text style={styles.newsTitle}>{item.title}</Text>
              <Text style={styles.newsContent} numberOfLines={3}>{item.content}</Text>
              <Text style={styles.newsDate}>{formatDate(item.created_at)}</Text>
              {canManageNews && <View style={styles.newsActions}>
                <TouchableOpacity style={styles.actionButton} onPress={() => openEditModal(item)}>
                  <Ionicons name="create-outline" size={20} color={COLORS.gold} />
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={() => handlePublish(item.id, !item.is_published)}>
                  <Ionicons name={item.is_published ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.info} />
                  <Text style={[styles.actionText, { color: COLORS.info }]}>{item.is_published ? 'Unpublish' : 'Publish'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  disabled={deletingNewsId === item.id}
                  onPress={() => handleDelete(item)}
                >
                  {deletingNewsId === item.id ? (
                    <ActivityIndicator size="small" color={COLORS.error} />
                  ) : (
                    <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                  )}
                  <Text style={[styles.actionText, { color: COLORS.error }]}>Delete</Text>
                </TouchableOpacity>
              </View>}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="newspaper-outline" size={64} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>{canManageNews ? 'No news articles' : 'No announcements'}</Text>
            <Text style={styles.emptySubtext}>
              {canManageNews ? 'Create your first announcement' : 'New academy announcements will appear here.'}
            </Text>
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Create/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingNews ? 'Edit News' : 'Create News'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput style={styles.modalInput} value={formData.title} onChangeText={(text) => setFormData({ ...formData, title: text })} placeholder="Enter news title" placeholderTextColor={COLORS.textTertiary} />
              
              <Text style={styles.inputLabel}>Content *</Text>
              <TextInput style={[styles.modalInput, styles.textArea]} value={formData.content} onChangeText={(text) => setFormData({ ...formData, content: text })} placeholder="Enter news content" placeholderTextColor={COLORS.textTertiary} multiline numberOfLines={5} textAlignVertical="top" />
              
              <Text style={styles.inputLabel}>Target Audience</Text>
              <View style={styles.audienceOptions}>
                {AUDIENCE_OPTIONS.map((option) => (
                  <TouchableOpacity key={option.value} style={[styles.audienceOption, formData.target_audience === option.value && styles.audienceOptionSelected]} onPress={() => setFormData({ ...formData, target_audience: option.value })}>
                    <Ionicons name={option.icon as any} size={20} color={formData.target_audience === option.value ? COLORS.marbleDark : COLORS.textSecondary} />
                    <Text style={[styles.audienceOptionText, formData.target_audience === option.value && styles.audienceOptionTextSelected]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <View style={styles.checkboxRow}>
                <TouchableOpacity style={[styles.checkbox, formData.is_published && styles.checkboxChecked]} onPress={() => setFormData({ ...formData, is_published: !formData.is_published })}>
                  {formData.is_published && <Ionicons name="checkmark" size={16} color={COLORS.marbleDark} />}
                </TouchableOpacity>
                <Text style={styles.checkboxLabel}>Publish immediately</Text>
              </View>
              
              <View style={styles.notificationNote}>
                <Ionicons name="notifications-outline" size={20} color={COLORS.info} />
                <Text style={styles.notificationNoteText}>
                  Publishing notifies the selected audience according to each user&apos;s notification preferences.
                </Text>
              </View>
              
              <Button title={saving ? 'Saving...' : (editingNews ? 'Update News' : 'Create News')} onPress={handleSave} disabled={saving} style={{ marginTop: SIZES.md }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  accessDenied: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  accessDeniedText: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: SIZES.md },
  accessDeniedSub: { fontSize: SIZES.fontMd, color: COLORS.textSecondary, marginTop: SIZES.sm },
  header: { paddingTop: 60, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  subtitle: { fontSize: SIZES.fontMd, color: COLORS.textSecondary, marginTop: SIZES.xs },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, padding: SIZES.md },
  newsCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.lg, marginBottom: SIZES.md, ...SHADOWS.small },
  newsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SIZES.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: SIZES.xs },
  newsStatus: { fontSize: SIZES.fontXs, color: COLORS.textSecondary, flex: 1 },
  audienceBadge: { backgroundColor: COLORS.gold + '20', paddingHorizontal: SIZES.sm, paddingVertical: 2, borderRadius: SIZES.radiusSm },
  audienceText: { fontSize: SIZES.fontXs, color: COLORS.gold, fontWeight: '600' },
  newsTitle: { fontSize: SIZES.fontLg, fontWeight: '600', color: COLORS.textPrimary, marginBottom: SIZES.xs },
  newsContent: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, lineHeight: 20, marginBottom: SIZES.sm },
  newsDate: { fontSize: SIZES.fontXs, color: COLORS.textTertiary },
  newsActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.marbleGray, marginTop: SIZES.md, paddingTop: SIZES.md, gap: SIZES.lg },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: SIZES.fontSm, color: COLORS.gold },
  emptyState: { alignItems: 'center', paddingVertical: SIZES.xxl },
  emptyText: { fontSize: SIZES.fontLg, color: COLORS.textSecondary, marginTop: SIZES.md },
  emptySubtext: { fontSize: SIZES.fontSm, color: COLORS.textTertiary, marginTop: SIZES.xs },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SIZES.lg, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  modalTitle: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary },
  modalBody: { padding: SIZES.lg, paddingBottom: 40 },
  inputLabel: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SIZES.xs },
  modalInput: { backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, padding: SIZES.md, fontSize: SIZES.fontMd, color: COLORS.textPrimary, marginBottom: SIZES.md, borderWidth: 1, borderColor: COLORS.marbleGray },
  textArea: { height: 120, textAlignVertical: 'top' },
  audienceOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm, marginBottom: SIZES.md },
  audienceOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.backgroundLight, gap: SIZES.xs },
  audienceOptionSelected: { backgroundColor: COLORS.gold },
  audienceOptionText: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  audienceOptionTextSelected: { color: COLORS.marbleDark, fontWeight: '600' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SIZES.md, gap: SIZES.sm },
  checkbox: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: COLORS.marbleGray, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  checkboxLabel: { fontSize: SIZES.fontMd, color: COLORS.textPrimary },
  notificationNote: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, padding: SIZES.md, marginBottom: SIZES.md, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.info + '12' },
  notificationNoteText: { flex: 1, fontSize: SIZES.fontSm, lineHeight: 19, color: COLORS.textSecondary },
});
