import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Switch,
  Alert,
} from 'react-native';
import { Text } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';

interface FeatureFlags {
  homework_submission: boolean;
  student_file_uploads: boolean;
  student_image_uploads: boolean;
  online_lessons: boolean;
  chat_system: boolean;
  push_notifications: boolean;
  support_booking: boolean;
}

const FEATURE_CONFIG = [
  { key: 'homework_submission', label: 'Homework Submission', description: 'Allow students to submit homework online', icon: 'document-text' },
  { key: 'student_file_uploads', label: 'Student File Uploads', description: 'Allow students to upload files', icon: 'cloud-upload' },
  { key: 'student_image_uploads', label: 'Student Image Uploads', description: 'Allow students to upload images', icon: 'image' },
  { key: 'online_lessons', label: 'Online Lessons', description: 'Enable online video lessons', icon: 'videocam' },
  { key: 'chat_system', label: 'Chat System', description: 'Enable in-app messaging', icon: 'chatbubbles' },
  { key: 'push_notifications', label: 'Push Notifications', description: 'Send push notifications to users', icon: 'notifications' },
  { key: 'support_booking', label: 'Support Booking', description: 'Allow students to book support sessions', icon: 'calendar' },
];

export default function FeatureFlagsScreen() {
  const { user } = useAuth();
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    loadFlags();
  }, []);

  const loadFlags = async () => {
    try {
      const res = await api.get('/admin/feature-flags');
      setFlags(res.data);
    } catch (error) {
      console.error('Error loading feature flags:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useLiveRefresh(loadFlags, user?.role === 'super_admin', 'feature-flags', 3000);

  const toggleFlag = async (key: string, value: boolean) => {
    setSaving(key);
    try {
      await api.put('/admin/feature-flags', { [key]: value });
      setFlags(prev => prev ? { ...prev, [key]: value } : null);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update feature flag');
    } finally {
      setSaving(null);
    }
  };

  if (user?.role !== 'super_admin') {
    return (
      <View style={styles.accessDenied}>
        <Ionicons name="lock-closed" size={64} color={COLORS.error} />
        <Text style={styles.accessDeniedText}>Access Denied</Text>
        <Text style={styles.accessDeniedSub}>Super Admin access required</Text>
      </View>
    );
  }

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
        <Text style={styles.title}>Feature Flags</Text>
        <Text style={styles.subtitle}>Toggle features ON/OFF</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadFlags(); }} tintColor={COLORS.gold} />
        }
      >
        <View style={styles.card}>
          {FEATURE_CONFIG.map((feature, index) => (
            <View key={feature.key} style={[styles.featureRow, index === FEATURE_CONFIG.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={[styles.featureIcon, { backgroundColor: flags?.[feature.key as keyof FeatureFlags] ? COLORS.success + '20' : COLORS.marbleGray }]}>
                <Ionicons name={feature.icon as any} size={24} color={flags?.[feature.key as keyof FeatureFlags] ? COLORS.success : COLORS.textTertiary} />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureLabel}>{feature.label}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
              {saving === feature.key ? (
                <ActivityIndicator size="small" color={COLORS.gold} />
              ) : (
                <Switch
                  testID={`feature-flag-${feature.key}`}
                  accessibilityLabel={feature.label}
                  value={flags?.[feature.key as keyof FeatureFlags] || false}
                  onValueChange={(value) => toggleFlag(feature.key, value)}
                  trackColor={{ false: COLORS.marbleGray, true: COLORS.gold + '50' }}
                  thumbColor={flags?.[feature.key as keyof FeatureFlags] ? COLORS.gold : COLORS.textTertiary}
                />
              )}
            </View>
          ))}
        </View>

        {/* Status Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Status Summary</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {flags ? Object.values(flags).filter(v => v === true).length : 0}
              </Text>
              <Text style={styles.summaryLabel}>Enabled</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {flags ? Object.values(flags).filter(v => v === false).length : 0}
              </Text>
              <Text style={styles.summaryLabel}>Disabled</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  accessDenied: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  accessDeniedText: { fontSize: SIZES.fontXl, fontWeight: 'bold', color: COLORS.textPrimary, marginTop: SIZES.md },
  accessDeniedSub: { fontSize: SIZES.fontMd, color: COLORS.textSecondary, marginTop: SIZES.sm },
  header: { paddingTop: SIZES.headerTop, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark },
  title: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  subtitle: { fontSize: SIZES.fontMd, color: COLORS.textSecondary, marginTop: SIZES.xs },
  content: { flex: 1, padding: SIZES.md },
  card: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, ...SHADOWS.small, overflow: 'hidden' },
  featureRow: { flexDirection: 'row', alignItems: 'center', padding: SIZES.md, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  featureIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  featureContent: { flex: 1 },
  featureLabel: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  featureDescription: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: 2 },
  summaryCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, ...SHADOWS.small, padding: SIZES.lg, marginTop: SIZES.lg },
  summaryTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.gold, marginBottom: SIZES.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  summaryLabel: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: 4 },
  summaryDivider: { width: 1, height: 40, backgroundColor: COLORS.marbleGray },
});
