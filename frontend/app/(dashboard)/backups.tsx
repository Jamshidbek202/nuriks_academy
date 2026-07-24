import { getActiveLocale } from '../../src/i18n/translations';
import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { Text } from '../../src/components/LocalizedText';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { api, API_URL } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { useLiveRefresh } from '../../src/hooks/use-live-refresh';

interface Backup {
  id: string;
  backup_type: string;
  status: string;
  created_by: string;
  created_at: string;
  completed_at?: string;
  collections: { [key: string]: number };
  total_records: number;
  size_estimate: string;
  downloadable?: boolean;
}

const EXPORT_OPTIONS = [
  { collection: 'students', label: 'Students', icon: 'people' },
  { collection: 'teachers', label: 'Teachers', icon: 'person-circle' },
  { collection: 'payments', label: 'Payments', icon: 'card' },
  { collection: 'attendance', label: 'Attendance', icon: 'checkbox' },
  { collection: 'groups', label: 'Groups', icon: 'people-circle' },
];

export default function BackupsScreen() {
  const { user, token } = useAuth();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    try {
      const res = await api.get('/admin/backups');
      setBackups(res.data);
    } catch (error) {
      console.error('Error loading backups:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useLiveRefresh(loadBackups, user?.role === 'super_admin', 'admin-backups', 5000);

  const downloadFile = async (path: string, filename: string) => {
    if (Platform.OS === 'web') {
      const response = await api.get(path, { responseType: 'blob' });
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      return;
    }

    if (!FileSystem.documentDirectory || !token) {
      throw new Error('Secure download storage is unavailable');
    }
    const target = `${FileSystem.documentDirectory}${filename}`;
    const result = await FileSystem.downloadAsync(`${API_URL}/api${path}`, target, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Download failed with status ${result.status}`);
    }
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri);
  };

  const handleDownloadBackup = async (backup: Backup) => {
    const stamp = backup.created_at.replace(/[^0-9]/g, '').slice(0, 14);
    await downloadFile(`/admin/backups/${backup.id}/download`, `nuriks-academy-backup-${stamp}.json.gz`);
  };

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      const response = await api.post('/admin/backups');
      const backup = response.data as Backup;
      await handleDownloadBackup(backup);
      Alert.alert('Success', 'Backup snapshot created, verified, and downloaded');
      await loadBackups();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const handleExport = async (collection: string, format: 'csv' | 'pdf') => {
    setExporting(`${collection}-${format}`);
    try {
      const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      await downloadFile(`/admin/export/${format}?collection=${encodeURIComponent(collection)}`, `${collection}-${stamp}.${format}`);
      Alert.alert('Export Ready', `${collection} data downloaded as ${format.toUpperCase()}.`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to export data');
    } finally {
      setExporting(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(getActiveLocale(), { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
        <View>
          <Text style={styles.title}>Backups</Text>
          <Text style={styles.subtitle}>Data backup and export</Text>
        </View>
        <TouchableOpacity
          testID="backup-create-header-button"
          accessibilityRole="button"
          accessibilityLabel="Create and download backup"
          style={styles.createButton}
          onPress={handleCreateBackup}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator size="small" color={COLORS.marbleDark} />
          ) : (
            <Ionicons name="cloud-upload" size={24} color={COLORS.marbleDark} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadBackups(); }} tintColor={COLORS.gold} />
        }
      >
        {/* Manual Backup */}
        <View style={styles.backupCard}>
          <View style={styles.backupIcon}>
            <Ionicons name="cloud-upload" size={32} color={COLORS.gold} />
          </View>
          <View style={styles.backupInfo}>
            <Text style={styles.backupTitle}>Create Manual Backup</Text>
            <Text style={styles.backupDesc}>Create a verified compressed snapshot and download it</Text>
          </View>
          <Button testID="backup-create-button" title={creating ? 'Creating...' : 'Backup Now'} onPress={handleCreateBackup} disabled={creating} style={{ minWidth: 100 }} />
        </View>

        {/* Export Options */}
        <Text style={styles.sectionTitle}>Export Data</Text>
        <View style={styles.exportCard}>
          {EXPORT_OPTIONS.map((option, index) => (
            <View key={option.collection} style={[styles.exportRow, index === EXPORT_OPTIONS.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.exportIcon}>
                <Ionicons name={option.icon as any} size={24} color={COLORS.gold} />
              </View>
              <Text style={styles.exportLabel}>{option.label}</Text>
              <View style={styles.exportButtons}>
                <TouchableOpacity
                  testID={`backup-export-${option.collection}-csv`}
                  accessibilityRole="button"
                  accessibilityLabel={`Export ${option.label} as CSV`}
                  style={styles.exportButton}
                  onPress={() => handleExport(option.collection, 'csv')}
                  disabled={exporting === `${option.collection}-csv`}
                >
                  {exporting === `${option.collection}-csv` ? (
                    <ActivityIndicator size="small" color={COLORS.success} />
                  ) : (
                    <>
                      <Ionicons name="document" size={16} color={COLORS.success} />
                      <Text style={[styles.exportButtonText, { color: COLORS.success }]}>CSV</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`backup-export-${option.collection}-pdf`}
                  accessibilityRole="button"
                  accessibilityLabel={`Export ${option.label} as PDF`}
                  style={styles.exportButton}
                  onPress={() => handleExport(option.collection, 'pdf')}
                  disabled={exporting === `${option.collection}-pdf`}
                >
                  {exporting === `${option.collection}-pdf` ? (
                    <ActivityIndicator size="small" color={COLORS.error} />
                  ) : (
                    <>
                      <Ionicons name="document-text" size={16} color={COLORS.error} />
                      <Text style={[styles.exportButtonText, { color: COLORS.error }]}>PDF</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Backup History */}
        <Text style={styles.sectionTitle}>Backup History</Text>
        {backups.length > 0 ? (
          backups.map((backup) => (
            <View key={backup.id} testID={`backup-history-${backup.id}`} style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <View style={[styles.statusDot, { backgroundColor: backup.status === 'completed' ? COLORS.success : COLORS.warning }]} />
                <Text style={styles.historyType}>{backup.backup_type.toUpperCase()}</Text>
                <Text style={styles.historyDate}>{formatDate(backup.created_at)}</Text>
              </View>
              <View style={styles.historyStats}>
                <View style={styles.historyStat}>
                  <Ionicons name="documents" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.historyStatText}>{backup.total_records} records</Text>
                </View>
                <View style={styles.historyStat}>
                  <Ionicons name="server" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.historyStatText}>{backup.size_estimate}</Text>
                </View>
              </View>
              <View style={styles.historyCollections}>
                {Object.entries(backup.collections).map(([name, count]) => (
                  <View key={name} style={styles.collectionBadge}>
                    <Text style={styles.collectionText}>{name}: {count}</Text>
                  </View>
                ))}
              </View>
              {backup.downloadable && (
                <TouchableOpacity
                  testID={`backup-download-${backup.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Download backup ${formatDate(backup.created_at)}`}
                  style={styles.downloadButton}
                  onPress={() => handleDownloadBackup(backup).catch((error: any) => Alert.alert('Error', error.message || 'Failed to download backup'))}
                >
                  <Ionicons name="download" size={18} color={COLORS.gold} />
                  <Text style={styles.downloadText}>Download verified snapshot</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-offline-outline" size={64} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>No backups yet</Text>
            <Text style={styles.emptySubtext}>Create your first backup above</Text>
          </View>
        )}

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
  header: { paddingTop: 60, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  subtitle: { fontSize: SIZES.fontMd, color: COLORS.textSecondary, marginTop: SIZES.xs },
  createButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, padding: SIZES.md },
  backupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.lg, ...SHADOWS.small, marginBottom: SIZES.lg },
  backupIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.gold + '20', justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  backupInfo: { flex: 1 },
  backupTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  backupDesc: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.gold, marginBottom: SIZES.sm },
  exportCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, ...SHADOWS.small, marginBottom: SIZES.lg, overflow: 'hidden' },
  exportRow: { flexDirection: 'row', alignItems: 'center', padding: SIZES.md, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  exportIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.gold + '20', justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  exportLabel: { flex: 1, fontSize: SIZES.fontMd, color: COLORS.textPrimary },
  exportButtons: { flexDirection: 'row', gap: SIZES.sm },
  exportButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.sm, paddingVertical: 6, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.backgroundLight, gap: 4 },
  exportButtonText: { fontSize: SIZES.fontXs, fontWeight: '600' },
  historyCard: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, ...SHADOWS.small },
  historyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SIZES.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: SIZES.xs },
  historyType: { fontSize: SIZES.fontXs, fontWeight: '700', color: COLORS.gold, letterSpacing: 0.5, flex: 1 },
  historyDate: { fontSize: SIZES.fontXs, color: COLORS.textTertiary },
  historyStats: { flexDirection: 'row', gap: SIZES.lg, marginBottom: SIZES.sm },
  historyStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyStatText: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  historyCollections: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.xs },
  collectionBadge: { backgroundColor: COLORS.backgroundLight, paddingHorizontal: SIZES.sm, paddingVertical: 2, borderRadius: SIZES.radiusSm },
  collectionText: { fontSize: SIZES.fontXs, color: COLORS.textTertiary },
  downloadButton: { marginTop: SIZES.md, paddingTop: SIZES.sm, borderTopWidth: 1, borderTopColor: COLORS.marbleGray, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SIZES.xs },
  downloadText: { fontSize: SIZES.fontSm, fontWeight: '600', color: COLORS.gold },
  emptyState: { alignItems: 'center', paddingVertical: SIZES.xxl },
  emptyText: { fontSize: SIZES.fontLg, color: COLORS.textSecondary, marginTop: SIZES.md },
  emptySubtext: { fontSize: SIZES.fontSm, color: COLORS.textTertiary, marginTop: SIZES.xs },
});
