import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../../src/constants/theme';

interface AuditLog {
  id: string;
  user_id: string;
  user_name?: string;
  user_role?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  changes?: any;
  ip_address?: string;
  timestamp: string;
}

const ACTION_ICONS: { [key: string]: string } = {
  login: 'log-in',
  logout: 'log-out',
  create: 'add-circle',
  update: 'create',
  delete: 'trash',
  confirm: 'checkmark-circle',
  cancel: 'close-circle',
  complete: 'checkmark-done-circle',
};

const ACTION_COLORS: { [key: string]: string } = {
  login: COLORS.success,
  logout: COLORS.info,
  create: COLORS.gold,
  update: COLORS.info,
  delete: COLORS.error,
  confirm: COLORS.success,
  cancel: COLORS.warning,
  complete: COLORS.success,
};

const ENTITY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'user', label: 'Users' },
  { value: 'student', label: 'Students' },
  { value: 'payment', label: 'Payments' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'system_settings', label: 'Settings' },
  { value: 'feature_flags', label: 'Feature Flags' },
  { value: 'news', label: 'News' },
];

export default function AuditLogsScreen() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loginHistory, setLoginHistory] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'login'>('all');
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    loadLogs();
  }, [filterType]);

  const loadLogs = async () => {
    try {
      const params = filterType ? { entity_type: filterType } : {};
      const [logsRes, loginRes] = await Promise.all([
        api.get('/admin/audit-logs', { params }),
        api.get('/admin/audit-logs/login-history')
      ]);
      setLogs(logsRes.data);
      setLoginHistory(loginRes.data);
    } catch (error) {
      console.error('Error loading audit logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatEntityType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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

  const displayLogs = activeTab === 'login' ? loginHistory : logs;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Audit Logs</Text>
        <Text style={styles.subtitle}>Track all system activity</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, activeTab === 'all' && styles.tabActive]} onPress={() => setActiveTab('all')}>
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>All Activity</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'login' && styles.tabActive]} onPress={() => setActiveTab('login')}>
          <Text style={[styles.tabText, activeTab === 'login' && styles.tabTextActive]}>Login History</Text>
        </TouchableOpacity>
      </View>

      {/* Filter (only for All Activity) */}
      {activeTab === 'all' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
          {ENTITY_TYPES.map((type) => (
            <TouchableOpacity key={type.value} style={[styles.filterChip, filterType === type.value && styles.filterChipActive]} onPress={() => setFilterType(type.value)}>
              <Text style={[styles.filterChipText, filterType === type.value && styles.filterChipTextActive]}>{type.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadLogs(); }} tintColor={COLORS.gold} />
        }
      >
        {displayLogs.length > 0 ? (
          displayLogs.map((log) => (
            <View key={log.id} style={styles.logCard}>
              <View style={[styles.logIcon, { backgroundColor: (ACTION_COLORS[log.action] || COLORS.info) + '20' }]}>
                <Ionicons name={(ACTION_ICONS[log.action] || 'ellipse') as any} size={20} color={ACTION_COLORS[log.action] || COLORS.info} />
              </View>
              <View style={styles.logContent}>
                <View style={styles.logHeader}>
                  <Text style={styles.logAction}>{log.action.toUpperCase()}</Text>
                  <Text style={styles.logTime}>{formatDate(log.timestamp)}</Text>
                </View>
                <Text style={styles.logUser}>{log.user_name || 'Unknown User'}</Text>
                {log.user_role && (
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleText}>{log.user_role}</Text>
                  </View>
                )}
                {activeTab !== 'login' && (
                  <Text style={styles.logEntity}>{formatEntityType(log.entity_type)}: {log.entity_id.substring(0, 8)}...</Text>
                )}
                {log.ip_address && (
                  <Text style={styles.logIp}>IP: {log.ip_address}</Text>
                )}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>No logs found</Text>
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
  header: { paddingTop: 60, paddingHorizontal: SIZES.lg, paddingBottom: SIZES.md, backgroundColor: COLORS.marbleDark },
  title: { fontSize: SIZES.fontXxl, fontWeight: 'bold', color: COLORS.textPrimary },
  subtitle: { fontSize: SIZES.fontMd, color: COLORS.textSecondary, marginTop: SIZES.xs },
  tabs: { flexDirection: 'row', backgroundColor: COLORS.backgroundCard, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  tab: { flex: 1, paddingVertical: SIZES.md, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.gold },
  tabText: { fontSize: SIZES.fontMd, color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.gold, fontWeight: '600' },
  filterContainer: { paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, backgroundColor: COLORS.backgroundCard },
  filterChip: { paddingHorizontal: SIZES.md, paddingVertical: SIZES.xs, borderRadius: SIZES.radiusFull, backgroundColor: COLORS.backgroundLight, marginRight: SIZES.sm },
  filterChipActive: { backgroundColor: COLORS.gold },
  filterChipText: { fontSize: SIZES.fontSm, color: COLORS.textSecondary },
  filterChipTextActive: { color: COLORS.marbleDark, fontWeight: '600' },
  content: { flex: 1, padding: SIZES.md },
  logCard: { flexDirection: 'row', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm, ...SHADOWS.small },
  logIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: SIZES.md },
  logContent: { flex: 1 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  logAction: { fontSize: SIZES.fontXs, fontWeight: '700', color: COLORS.gold, letterSpacing: 0.5 },
  logTime: { fontSize: SIZES.fontXs, color: COLORS.textTertiary },
  logUser: { fontSize: SIZES.fontMd, fontWeight: '600', color: COLORS.textPrimary },
  roleBadge: { alignSelf: 'flex-start', backgroundColor: COLORS.gold + '20', paddingHorizontal: SIZES.sm, paddingVertical: 2, borderRadius: SIZES.radiusSm, marginTop: 4 },
  roleText: { fontSize: SIZES.fontXs, color: COLORS.gold, fontWeight: '500', textTransform: 'capitalize' },
  logEntity: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginTop: 4 },
  logIp: { fontSize: SIZES.fontXs, color: COLORS.textTertiary, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingVertical: SIZES.xxl },
  emptyText: { fontSize: SIZES.fontLg, color: COLORS.textSecondary, marginTop: SIZES.md },
});
