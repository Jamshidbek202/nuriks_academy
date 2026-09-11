import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text, TextInput } from '../src/components/LocalizedText';
import { api, apiErrorMessage } from '../src/services/api';
import { COLORS, LAYOUT, SHADOWS, SIZES } from '../src/constants/theme';
import { formatUzbekPhoneInput, normalizeUzbekPhone } from '../src/utils/phone';
import { PASSWORD_RESET } from '../constants/testIds/auth';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('+998');
  const [codeRequested, setCodeRequested] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const requestCode = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    setErrorMessage('');
    try {
      await api.post('/auth/password-reset/request', { phone: normalizeUzbekPhone(phone) });
      setCodeRequested(true);
      Alert.alert('Check Telegram', 'Open @nuriksacademy_bot. The six-digit reset code was sent to your connected private chat.');
    } catch (error: any) {
      setErrorMessage(apiErrorMessage(error, 'Could not request a reset code'));
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async () => {
    setErrorMessage('');
    if (code.length !== 6 || !password || !confirmation) {
      setErrorMessage('Enter the six-digit code and your new password.');
      return;
    }
    if (password !== confirmation) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/password-reset/confirm', { phone: normalizeUzbekPhone(phone), code, password });
      Alert.alert('Password changed', 'Sign in with your new password.');
      router.replace('/login');
    } catch (error: any) {
      setErrorMessage(apiErrorMessage(error, 'Password reset failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.page}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>We will send a six-digit code to the Telegram account connected to this phone-number login.</Text>
            {!!errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

            <Text style={styles.label}>Phone number</Text>
            <TextInput testID={PASSWORD_RESET.phoneInput} style={styles.input} value={phone} onChangeText={(value) => setPhone(formatUzbekPhoneInput(value))} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" editable={!codeRequested} placeholder="+998 90 123 45 67" />

            {!codeRequested ? (
              <TouchableOpacity testID={PASSWORD_RESET.requestButton} style={styles.primary} onPress={requestCode} disabled={loading}>
                {loading ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.primaryText}>Send reset code</Text>}
              </TouchableOpacity>
            ) : (
              <>
                <Text style={styles.label}>Six-digit code</Text>
                <TextInput testID={PASSWORD_RESET.codeInput} style={styles.input} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="000000" />
                <Text style={styles.label}>New password</Text>
                <View style={styles.passwordShell}>
                  <TextInput testID={PASSWORD_RESET.passwordInput} style={styles.passwordInput} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" placeholder="Create a strong password" />
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide new password' : 'Show new password'} style={styles.eyeButton} onPress={() => setShowPassword((value) => !value)}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.hint}>At least 10 characters with uppercase, lowercase, number, and symbol. No spaces.</Text>
                <Text style={styles.label}>Confirm password</Text>
                <View style={styles.passwordShell}>
                  <TextInput testID={PASSWORD_RESET.passwordConfirmInput} style={styles.passwordInput} value={confirmation} onChangeText={setConfirmation} secureTextEntry={!showConfirmation} autoCapitalize="none" placeholder="Repeat your password" />
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={showConfirmation ? 'Hide password confirmation' : 'Show password confirmation'} style={styles.eyeButton} onPress={() => setShowConfirmation((value) => !value)}>
                    <Ionicons name={showConfirmation ? 'eye-off-outline' : 'eye-outline'} size={21} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity testID={PASSWORD_RESET.confirmButton} style={styles.primary} onPress={confirmReset} disabled={loading}>
                  {loading ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.primaryText}>Change password</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.linkButton} onPress={() => { setCodeRequested(false); setCode(''); }}>
                  <Text style={styles.linkText}>Use a different phone number</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.telegramButton} onPress={() => Linking.openURL('https://t.me/nuriksacademy_bot')}>
                  <Ionicons name="paper-plane" size={18} color={COLORS.info} />
                  <Text style={styles.telegramText}>Open @nuriksacademy_bot</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity testID={PASSWORD_RESET.loginLink} style={styles.linkButton} onPress={() => router.replace('/login')}>
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
  passwordShell: { minHeight: SIZES.inputHeight, backgroundColor: COLORS.backgroundLight, borderColor: COLORS.border, borderWidth: 1, borderRadius: SIZES.radiusMd, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { minHeight: SIZES.inputHeight, flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontMd, padding: SIZES.md },
  eyeButton: { width: SIZES.touchTarget, height: SIZES.touchTarget, alignItems: 'center', justifyContent: 'center' },
  hint: { color: COLORS.textTertiary, fontSize: 12, lineHeight: 17, marginTop: SIZES.xs },
  error: { color: COLORS.error, backgroundColor: COLORS.error + '18', borderColor: COLORS.error, borderWidth: 1, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm },
  primary: { backgroundColor: COLORS.gold, borderRadius: SIZES.radiusMd, minHeight: SIZES.touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: SIZES.lg },
  primaryText: { color: COLORS.textOnGold, fontWeight: '800', fontSize: SIZES.fontMd },
  linkButton: { alignItems: 'center', padding: SIZES.md },
  linkText: { color: COLORS.gold, fontWeight: '600' },
  telegramButton: { minHeight: SIZES.touchTarget, flexDirection: 'row', gap: SIZES.sm, alignItems: 'center', justifyContent: 'center' },
  telegramText: { color: COLORS.info, fontWeight: '700' },
  secondaryLink: { color: COLORS.textSecondary },
});
