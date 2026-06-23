import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';

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
}

const EXPORT_OPTIONS = [
  { collection: 'students', label: 'Students', icon: 'people' },
  { collection: 'teachers', label: 'Teachers', icon: 'person-circle' },
  { collection: 'payments', label: 'Payments', icon: 'card' },
  { collection: 'attendance_records', label: 'Attendance', icon: 'checkbox' },
  { collection: 'groups', label: 'Groups', icon: 'people-circle' },
];

export default function BackupsScreen() {
  const { user } = useAuth();
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

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      await api.post('/admin/backups');
      Alert.alert('Success', 'Backup created successfully');
      loadBackups();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const handleExport = async (collection: string, format: 'excel' | 'pdf') => {
    setExporting(collection);
    try {
      const res = await api.get(`/admin/export/${format}`, { params: { collection } });
      // In a real app, this would download the file
      // For now, show the record count
      Alert.alert('Export Ready', `${res.data.record_count} ${collection} records ready for export.\n\nIn production, this would download as ${format.toUpperCase()}.`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to export data');
    } finally {
      setExporting(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
        <TouchableOpacity style={styles.createButton} onPress={handleCreateBackup} disabled={creating}>
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
            <Text style={styles.backupDesc}>Backup all data collections</Text>
          </View>
          <Button title={creating ? 'Creating...' : 'Backup Now'} onPress={handleCreateBackup} disabled={creating} style={{ minWidth: 100 }} />
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
                <TouchableOpacity style={styles.exportButton} onPress={() => handleExport(option.collection, 'excel')} disabled={exporting === option.collection}>
                  {exporting === option.collection ? (
                    <ActivityIndicator size="small" color={COLORS.success} />
                  ) : (
                    <>
                      <Ionicons name="document" size={16} color={COLORS.success} />
                      <Text style={[styles.exportButtonText, { color: COLORS.success }]}>Excel</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.exportButton} onPress={() => handleExport(option.collection, 'pdf')} disabled={exporting === option.collection}>
                  <Ionicons name="document-text" size={16} color={COLORS.error} />
                  <Text style={[styles.exportButtonText, { color: COLORS.error }]}>PDF</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Backup History */}
        <Text style={styles.sectionTitle}>Backup History</Text>
        {backups.length > 0 ? (
          backups.map((backup) => (
            <View key={backup.id} style={styles.historyCard}>
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
  emptyState: { alignItems: 'center', paddingVertical: SIZES.xxl },
  emptyText: { fontSize: SIZES.fontLg, color: COLORS.textSecondary, marginTop: SIZES.md },
  emptySubtext: { fontSize: SIZES.fontSm, color: COLORS.textTertiary, marginTop: SIZES.xs },
});
