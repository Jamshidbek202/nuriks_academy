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
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { Text, TextInput } from '../src/components/LocalizedText';
import { api, apiErrorMessage } from '../src/services/api';
import { COLORS, SHADOWS, SIZES } from '../src/constants/theme';
import { PASSWORD_RESET } from '../constants/testIds/auth';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('+998');
  const [codeRequested, setCodeRequested] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const requestCode = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    setErrorMessage('');
    try {
      await api.post('/auth/password-reset/request', { phone: phone.trim() });
      setCodeRequested(true);
      Alert.alert('Code requested', 'If an active account uses this number, a reset code was sent.');
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
      await api.post('/auth/password-reset/confirm', { phone: phone.trim(), code, password });
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
      <LinearGradient colors={[COLORS.background, COLORS.marbleDark]} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>We will send a six-digit code to the phone number on the account.</Text>
            {!!errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

            <Text style={styles.label}>Phone number</Text>
            <TextInput testID={PASSWORD_RESET.phoneInput} style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={!codeRequested} placeholder="+998 90 123 45 67" />

            {!codeRequested ? (
              <TouchableOpacity testID={PASSWORD_RESET.requestButton} style={styles.primary} onPress={requestCode} disabled={loading}>
                {loading ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.primaryText}>Send reset code</Text>}
              </TouchableOpacity>
            ) : (
              <>
                <Text style={styles.label}>Six-digit code</Text>
                <TextInput testID={PASSWORD_RESET.codeInput} style={styles.input} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="000000" />
                <Text style={styles.label}>New password</Text>
                <TextInput testID={PASSWORD_RESET.passwordInput} style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="Create a strong password" />
                <Text style={styles.hint}>At least 10 characters with uppercase, lowercase, number, and symbol. No spaces.</Text>
                <Text style={styles.label}>Confirm password</Text>
                <TextInput testID={PASSWORD_RESET.passwordConfirmInput} style={styles.input} value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" placeholder="Repeat your password" />
                <TouchableOpacity testID={PASSWORD_RESET.confirmButton} style={styles.primary} onPress={confirmReset} disabled={loading}>
                  {loading ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.primaryText}>Change password</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.linkButton} onPress={() => { setCodeRequested(false); setCode(''); }}>
                  <Text style={styles.linkText}>Use a different phone number</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity testID={PASSWORD_RESET.loginLink} style={styles.linkButton} onPress={() => router.replace('/login')}>
              <Text style={styles.secondaryLink}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: SIZES.lg },
  card: { backgroundColor: COLORS.backgroundCard, borderRadius: SIZES.radiusLg, padding: SIZES.lg, ...SHADOWS.medium },
  title: { color: COLORS.textPrimary, fontSize: SIZES.fontXl, fontWeight: 'bold', marginBottom: SIZES.xs },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginBottom: SIZES.lg, lineHeight: 20 },
  label: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '600', marginBottom: SIZES.xs, marginTop: SIZES.sm },
  input: { backgroundColor: COLORS.backgroundLight, borderColor: COLORS.marbleGray, borderWidth: 1, borderRadius: SIZES.radiusMd, color: COLORS.textPrimary, fontSize: SIZES.fontMd, padding: SIZES.md },
  hint: { color: COLORS.textTertiary, fontSize: 12, lineHeight: 17, marginTop: SIZES.xs },
  error: { color: COLORS.error, backgroundColor: COLORS.error + '18', borderColor: COLORS.error, borderWidth: 1, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.sm },
  primary: { backgroundColor: COLORS.gold, borderRadius: SIZES.radiusMd, minHeight: SIZES.touchTarget, alignItems: 'center', justifyContent: 'center', marginTop: SIZES.lg },
  primaryText: { color: COLORS.background, fontWeight: 'bold', fontSize: SIZES.fontMd },
  linkButton: { alignItems: 'center', padding: SIZES.md },
  linkText: { color: COLORS.gold, fontWeight: '600' },
  secondaryLink: { color: COLORS.textSecondary },
});
