import { Alert, Platform } from 'react-native';
import { getActiveLanguage, translateText } from '../i18n/translations';

const localize = (value: string) => translateText(value, getActiveLanguage());

function normalizeMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => normalizeMessage(item)).filter(Boolean).join('\n');
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.msg) return normalizeMessage(record.msg);
    if (record.detail) return normalizeMessage(record.detail);
    if (record.message) return normalizeMessage(record.message);
  }
  return value == null ? 'Unknown error' : String(value);
}

/** React Native's Alert is a no-op on web, so all browser-visible feedback comes through here. */
export function showAlert(title: string, message: unknown, onOk?: () => void) {
  const normalizedMessage = normalizeMessage(message);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${localize(title)}\n\n${localize(normalizedMessage)}`);
    onOk?.();
    return;
  }
  Alert.alert(title, normalizedMessage, [{ text: 'OK', onPress: onOk }]);
}

/** Require an explicit decision for destructive or immutable workflows on every platform. */
export function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmText = 'Confirm',
) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${localize(title)}\n\n${localize(message)}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmText, style: 'destructive', onPress: onConfirm },
  ]);
}
