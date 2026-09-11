import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';

import { Text } from './LocalizedText';
import { COLORS, SIZES } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';

export interface TelegramInviteItem {
  label: string;
  login: string;
  temporaryPassword: string;
}

interface Props {
  visible: boolean;
  invites: TelegramInviteItem[];
  onClose: () => void;
}

export const telegramInviteFromResponse = (
  response: any,
  label: string,
): TelegramInviteItem | null => {
  const credentials = response?.credentials || response;
  const login = credentials?.login;
  const temporaryPassword = credentials?.temporary_password;
  if (!login || !temporaryPassword) return null;
  return {
    label,
    login,
    temporaryPassword,
  };
};

export default function TelegramInviteModal({ visible, invites, onClose }: Props) {
  const { t } = useLanguage();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const notify = (title: string, message: string) => {
    if (Platform.OS === 'web') window.alert(`${t(title)}\n\n${t(message)}`);
    else Alert.alert(title, message);
  };

  useEffect(() => {
    if (visible) setSelectedIndex(0);
  }, [visible, invites]);

  const selected = invites[selectedIndex];
  if (!selected) return null;

  const credentialText = `${t('Login')}: ${selected.login}\n${t('Temporary password')}: ${selected.temporaryPassword}`;

  const copyCredentials = async () => {
    await Clipboard.setStringAsync(credentialText);
    notify('Copied', 'Send these credentials privately to the intended person.');
  };

  const shareLink = async () => {
    if (Platform.OS === 'web') {
      await copyCredentials();
      return;
    }
    await Share.share({
      message: `${t("Nurik's Academy account for")} ${selected.label}\n${credentialText}`,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Account credentials</Text>
              <Text style={styles.subtitle}>For {selected.label}</Text>
            </View>
            <TouchableOpacity testID="credentials-close" onPress={onClose} accessibilityLabel={t('Close account credentials')}>
              <Ionicons name="close" size={26} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          {invites.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {invites.map((invite, index) => (
                <TouchableOpacity
                  key={`${invite.label}-${index}`}
                  style={[styles.tab, selectedIndex === index && styles.tabActive]}
                  onPress={() => setSelectedIndex(index)}
                >
                  <Text style={[styles.tabText, selectedIndex === index && styles.tabTextActive]}>{invite.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.notice}>
              <Ionicons name="shield-checkmark" size={23} color={COLORS.gold} />
              <Text style={styles.noticeText}>
                This temporary password is shown only now. Send it privately. The user will be required to choose a new password after signing in.
              </Text>
            </View>
            <View style={styles.credentialBox}>
              <Text style={styles.credentialLabel}>Login</Text>
              <Text selectable style={styles.credentialValue}>{selected.login}</Text>
              <Text style={styles.credentialLabel}>Temporary password</Text>
              <Text selectable style={styles.credentialValue}>{selected.temporaryPassword}</Text>
            </View>
            <View style={styles.secondaryRow}>
              <TouchableOpacity testID="credentials-copy" style={styles.secondary} onPress={copyCredentials}>
                <Ionicons name="copy-outline" size={19} color={COLORS.gold} />
                <Text style={styles.secondaryText}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="credentials-share" style={styles.secondary} onPress={shareLink}>
                <Ionicons name="share-outline" size={19} color={COLORS.gold} />
                <Text style={styles.secondaryText}>Share</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.76)', alignItems: 'center', justifyContent: 'center', padding: SIZES.md },
  modal: { width: '100%', maxWidth: 520, maxHeight: '92%', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusLg, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SIZES.lg, borderBottomWidth: 1, borderBottomColor: COLORS.marbleGray },
  headerText: { flex: 1, paddingRight: SIZES.sm },
  title: { color: COLORS.textPrimary, fontSize: SIZES.fontXl, fontWeight: '800' },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginTop: 3 },
  tabs: { paddingHorizontal: SIZES.md, paddingTop: SIZES.md, gap: SIZES.sm },
  tab: { paddingHorizontal: SIZES.md, paddingVertical: SIZES.sm, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.marbleGray },
  tabActive: { borderColor: COLORS.gold, backgroundColor: COLORS.gold + '20' },
  tabText: { color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.gold, fontWeight: '700' },
  content: { padding: SIZES.lg },
  notice: { flexDirection: 'row', gap: SIZES.sm, padding: SIZES.md, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.gold + '14', borderWidth: 1, borderColor: COLORS.gold + '55' },
  noticeText: { flex: 1, color: COLORS.textSecondary, fontSize: SIZES.fontSm, lineHeight: 20 },
  credentialBox: { backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginTop: SIZES.lg, gap: 5 },
  credentialLabel: { color: COLORS.textTertiary, fontSize: 12, marginTop: SIZES.xs },
  credentialValue: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '700' },
  secondaryRow: { flexDirection: 'row', gap: SIZES.sm, marginTop: SIZES.sm },
  secondary: { flex: 1, minHeight: SIZES.touchTarget, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: SIZES.xs },
  secondaryText: { color: COLORS.gold, fontWeight: '700' },
});
