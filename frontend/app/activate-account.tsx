import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Text, TextInput } from '../src/components/LocalizedText';
import { api, apiErrorMessage } from '../src/services/api';
import { COLORS, LAYOUT, SHADOWS, SIZES } from '../src/constants/theme';
import { formatUzbekPhoneInput, normalizeUzbekPhone } from '../src/utils/phone';
import { ACTIVATE } from '../constants/testIds/auth';

export default function ActivateAccountScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('+998');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const activate = async () => {
    setErrorMessage('');
    if (!phone.trim() || code.length !== 6 || !password || !confirmation) {
      setErrorMessage('Enter your phone, six-digit code, and new password.');
      return;
    }
    if (password !== confirmation) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/invitations/accept', { phone: normalizeUzbekPhone(phone), code, password });
      Alert.alert('Account activated', 'Your password is ready. Sign in with your phone number.');
      router.replace('/login');
    } catch (error: any) {
      setErrorMessage(apiErrorMessage(error, 'Account activation failed'));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!phone.trim()) return;
    setErrorMessage('');
    setResending(true);
    try {
      await api.post('/auth/invitations/resend', { phone: normalizeUzbekPhone(phone) });
      Alert.alert('Code requested', 'If this account is awaiting activation and Telegram is connected, a new code was sent.');
    } catch (error: any) {
      setErrorMessage(apiErrorMessage(error, 'Could not request another code'));
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.page}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>Activate your account</Text>
            <Text style={styles.subtitle}>{"Enter the six-digit code from the Nurik's Academy Telegram bot, then create your private password."}</Text>
            {!!errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

            <Text style={styles.label}>Phone number</Text>
            <TextInput testID={ACTIVATE.phoneInput} style={styles.input} value={phone} onChangeText={(value) => setPhone(formatUzbekPhoneInput(value))} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" placeholder="+998 90 123 45 67" />
            <Text style={styles.label}>Six-digit code</Text>
            <TextInput testID={ACTIVATE.codeInput} style={styles.input} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="000000" />
            <Text style={styles.label}>New password</Text>
            <TextInput testID={ACTIVATE.passwordInput} style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="Create a strong password" />
            <Text style={styles.hint}>At least 10 characters with uppercase, lowercase, number, and symbol. No spaces.</Text>
            <Text style={styles.label}>Confirm password</Text>
            <TextInput testID={ACTIVATE.passwordConfirmInput} style={styles.input} value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" placeholder="Repeat your password" />

            <TouchableOpacity testID={ACTIVATE.submitButton} style={styles.primary} onPress={activate} disabled={loading}>
              {loading ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.primaryText}>Activate account</Text>}
            </TouchableOpacity>
            <TouchableOpacity testID={ACTIVATE.resendButton} style={styles.linkButton} onPress={resend} disabled={resending}>
              <Text style={styles.linkText}>{resending ? 'Requesting…' : 'Send another invitation code'}</Text>
            </TouchableOpacity>
            <TouchableOpacity testID={ACTIVATE.loginLink} style={styles.linkButton} onPress={() => router.replace('/login')}>
              <Text style={styles.secondaryLink}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: COLORS.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: SIZES.lg },
  card: { width: '100%', maxWidth: LAYOUT.formMaxWidth, alignSelf: 'center', backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusXl, borderWidth: 1, borderColor: COLORS.border, padding: SIZES.lg, ...SHADOWS.medium },
  title: { color: COLORS.textPrimary, fontSize: SIZES.fontXl, fontWeight: 'bold', marginBottom: SIZES.xs },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginBottom: SIZES.lg, lineHeight: 20 },
  label: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '600', marginBottom: SIZES.xs, marginTop: SIZES.sm },
  input: { minHeight: SIZES.inputHeight, backgroundColor: COLORS.backgroundLight, borderColor: COLORS.border, borderWidth: 1, borderRadius: SIZES.radiusMd, color: COLORS.textPrimary, fontSize: SIZES.fontMd, padding: SIZES.md },
  hint: { color: COLORS.textTertiary, fontSize: 12, lineHeight: 17, marginTop: SIZES.xs },
  error: { color: COLORS.error, backgroundColor: COLORS.error + '18', borderColor: COLORS.error, borderWidth: 1, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm },
  primary: { backgroundColor: COLORS.gold, borderRadius: SIZES.radiusMd, minHeight: SIZES.touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: SIZES.lg },
  primaryText: { color: COLORS.textOnGold, fontWeight: '800', fontSize: SIZES.fontMd },
  linkButton: { alignItems: 'center', padding: SIZES.md },
  linkText: { color: COLORS.gold, fontWeight: '600' },
  secondaryLink: { color: COLORS.textSecondary },
});
