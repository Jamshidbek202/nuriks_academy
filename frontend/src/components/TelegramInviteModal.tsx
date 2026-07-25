import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
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
  url: string;
  qrDataUrl?: string | null;
  expiresAt?: string | null;
}

interface Props {
  visible: boolean;
  invites: TelegramInviteItem[];
  onClose: () => void;
  allowOpenInTelegram?: boolean;
}

export const telegramInviteFromResponse = (
  response: any,
  label: string,
): TelegramInviteItem | null => {
  const url = response?.telegram_invite_url;
  if (!url) return null;
  return {
    label,
    url,
    qrDataUrl: response?.telegram_invite_qr,
    expiresAt: response?.telegram_invite_expires_at,
  };
};

export default function TelegramInviteModal({ visible, invites, onClose, allowOpenInTelegram = false }: Props) {
  const { locale, t } = useLanguage();
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

  const copyLink = async () => {
    await Clipboard.setStringAsync(selected.url);
    notify('Link copied', 'Send this private, single-use link directly to the intended person.');
  };

  const shareLink = async () => {
    if (Platform.OS === 'web') {
      await copyLink();
      return;
    }
    await Share.share({
      message: `${t("Nurik's Academy account invitation for")} ${selected.label}: ${selected.url}`,
    });
  };

  const openTelegram = async () => {
    const supported = await Linking.canOpenURL(selected.url);
    if (!supported) {
      notify('Telegram unavailable', 'Copy the link and send it through Telegram manually.');
      return;
    }
    await Linking.openURL(selected.url);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Telegram invitation</Text>
              <Text style={styles.subtitle}>For {selected.label}</Text>
            </View>
            <TouchableOpacity testID="telegram-invite-close" onPress={onClose} accessibilityLabel={t('Close Telegram invitation')}>
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
                Send this link only to the intended person. They must open it and press Start. The bot will then send their six-digit code.
              </Text>
            </View>

            {!!selected.qrDataUrl && (
              <View style={styles.qrFrame}>
                <Image testID="telegram-invite-qr" source={{ uri: selected.qrDataUrl }} style={styles.qr} />
              </View>
            )}

            <Text selectable style={styles.url}>{selected.url}</Text>
            {!!selected.expiresAt && (
              <Text style={styles.expiry}>Link expires: {new Date(selected.expiresAt).toLocaleString(locale, { timeZone: 'Asia/Tashkent' })}</Text>
            )}

            {allowOpenInTelegram && (
              <TouchableOpacity testID="telegram-invite-open" style={styles.primary} onPress={openTelegram}>
                <Ionicons name="paper-plane" size={20} color={COLORS.marbleDark} />
                <Text style={styles.primaryText}>Open in Telegram</Text>
              </TouchableOpacity>
            )}
            <View style={styles.secondaryRow}>
              <TouchableOpacity testID="telegram-invite-copy" style={styles.secondary} onPress={copyLink}>
                <Ionicons name="copy-outline" size={19} color={COLORS.gold} />
                <Text style={styles.secondaryText}>Copy link</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="telegram-invite-share" style={styles.secondary} onPress={shareLink}>
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
  qrFrame: { alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: SIZES.radiusMd, padding: SIZES.sm, marginTop: SIZES.lg },
  qr: { width: 210, height: 210 },
  url: { color: COLORS.textPrimary, backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginTop: SIZES.lg, fontSize: 13 },
  expiry: { color: COLORS.textTertiary, fontSize: 12, marginTop: SIZES.xs, textAlign: 'center' },
  primary: { minHeight: SIZES.touchTarget, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.gold, marginTop: SIZES.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: SIZES.sm },
  primaryText: { color: COLORS.marbleDark, fontWeight: '800' },
  secondaryRow: { flexDirection: 'row', gap: SIZES.sm, marginTop: SIZES.sm },
  secondary: { flex: 1, minHeight: SIZES.touchTarget, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: SIZES.xs },
  secondaryText: { color: COLORS.gold, fontWeight: '700' },
});
