import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, TextInput } from '../src/components/LocalizedText';
import { useAuth } from '../src/contexts/AuthContext';
import { useLanguage } from '../src/contexts/LanguageContext';
import { COLORS, LAYOUT, SHADOWS, SIZES } from '../src/constants/theme';
import { LOGIN } from '../constants/testIds';

export default function LoginScreen() {
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { login: authLogin, sessionNotice, clearSessionNotice } = useAuth();
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const isWide = width >= 900;

  const handleLogin = async () => {
    const trimmedPhone = phone.trim();
    setPhone(trimmedPhone);
    setErrorMessage('');
    clearSessionNotice();

    if (!trimmedPhone || !password) {
      const message = 'Please enter phone number and password';
      setErrorMessage(message);
      Alert.alert('Error', message);
      return;
    }

    setLoading(true);
    try {
      await authLogin(trimmedPhone, password);
      router.replace('/(dashboard)');
    } catch (error: any) {
      const message = error.message || 'Invalid login or password';
      setErrorMessage(message);
      Alert.alert('Login Failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.shell, isWide && styles.shellWide]}>
            <View style={[styles.brandPanel, isWide && styles.brandPanelWide]}>
              <View style={styles.brandRow}>
                <Image
                  source={require('../assets/images/logo.png')}
                  style={styles.logoImage}
                  resizeMode="cover"
                  accessibilityLabel="Nurik's Academy logo"
                />
                <View>
                  <Text style={styles.brandName}>Nurik&apos;s Academy</Text>
                  <Text style={styles.brandMeta}>{t('Academy operations')}</Text>
                </View>
              </View>
              <View style={[styles.brandCopy, !isWide && styles.brandCopyMobile]}>
                <Text style={styles.brandEyebrow}>{t('STAFF · STUDENTS · PARENTS')}</Text>
                <Text style={[styles.brandTitle, !isWide && styles.brandTitleMobile]}>{t('One place to run the academy.')}</Text>
                {isWide && (
                  <Text style={styles.brandDescription}>
                    {t('Daily work, learning progress, and payments — clear and secure.')}
                  </Text>
                )}
              </View>
              {isWide && (
                <View style={styles.securityNote}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.gold} />
                  <Text style={styles.securityText}>{t('Protected access for approved academy accounts')}</Text>
                </View>
              )}
            </View>

            <View style={styles.formPanel}>
              <Text style={styles.formEyebrow}>{t('SECURE ACCESS')}</Text>
              <Text style={styles.title}>{t('Welcome Back')}</Text>
              <Text style={styles.subtitle}>{t('Sign in to continue')}</Text>

              {!!errorMessage && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={20} color={COLORS.error} />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}
              {!errorMessage && !!sessionNotice && (
                <View testID="session-ended-notice" style={styles.errorBox}>
                  <Ionicons name="information-circle-outline" size={20} color={COLORS.warning} />
                  <Text style={styles.errorText}>{sessionNotice}</Text>
                </View>
              )}

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('Phone number')}</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="call-outline" size={19} color={COLORS.textTertiary} />
                  <TextInput
                    testID={LOGIN.phoneInput}
                    style={styles.input}
                    placeholder="+998 90 123 45 67"
                    placeholderTextColor={COLORS.textTertiary}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('Password')}</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={19} color={COLORS.textTertiary} />
                  <TextInput
                    testID={LOGIN.passwordInput}
                    style={styles.input}
                    placeholder={t('Enter your password')}
                    placeholderTextColor={COLORS.textTertiary}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                </View>
              </View>

              <TouchableOpacity
                testID={LOGIN.submitButton}
                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.82}
              >
                {loading ? <ActivityIndicator color={COLORS.textOnGold} /> : <Text style={styles.loginButtonText}>{t('Sign In')}</Text>}
              </TouchableOpacity>

              <View style={styles.linkGroup}>
                <TouchableOpacity
                  testID={LOGIN.forgotPasswordLink}
                  style={styles.linkButton}
                  onPress={() => router.push('/forgot-password' as any)}
                >
                  <Text style={styles.secondaryLink}>{t('Forgot your password?')}</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity
                  testID={LOGIN.activateLink}
                  style={styles.linkButton}
                  onPress={() => router.push('/activate-account' as any)}
                >
                  <Text style={styles.primaryLink}>{t('I have an invitation code')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: SIZES.lg },
  shell: { width: '100%', maxWidth: 1080, alignSelf: 'center' },
  shellWide: { flexDirection: 'row', alignItems: 'stretch' },
  brandPanel: {
    padding: SIZES.lg,
    backgroundColor: COLORS.backgroundSubtle,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomWidth: 0,
    borderTopLeftRadius: SIZES.radiusXl,
    borderTopRightRadius: SIZES.radiusXl,
  },
  brandPanelWide: {
    flex: 1.08,
    minHeight: 610,
    padding: SIZES.xxl,
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderRightWidth: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: SIZES.radiusXl,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: SIZES.md },
  logoImage: { width: 56, height: 56, borderRadius: 18 },
  brandName: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, fontWeight: '800' },
  brandMeta: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, marginTop: 2, letterSpacing: 0.5 },
  brandCopy: { maxWidth: 430 },
  brandCopyMobile: { marginTop: SIZES.lg },
  brandEyebrow: { color: COLORS.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  brandTitle: { color: COLORS.textPrimary, fontSize: 46, lineHeight: 52, fontWeight: '800', marginTop: SIZES.md, letterSpacing: -1.3 },
  brandTitleMobile: { fontSize: SIZES.fontXl, lineHeight: 32, marginTop: SIZES.sm, letterSpacing: -0.4 },
  brandDescription: { color: COLORS.textSecondary, fontSize: SIZES.fontMd, lineHeight: 25, marginTop: SIZES.md },
  securityNote: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  securityText: { color: COLORS.textSecondary, fontSize: SIZES.fontXs },
  formPanel: {
    width: '100%',
    maxWidth: LAYOUT.formMaxWidth,
    alignSelf: 'center',
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: SIZES.radiusXl,
    borderBottomRightRadius: SIZES.radiusXl,
    padding: SIZES.lg,
    ...SHADOWS.medium,
  },
  formEyebrow: { color: COLORS.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: COLORS.textPrimary, fontSize: SIZES.fontXxl, fontWeight: '800', marginTop: SIZES.sm, letterSpacing: -0.6 },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginTop: SIZES.xs, marginBottom: SIZES.xl },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.sm, backgroundColor: COLORS.error + '12', borderColor: COLORS.error + '70', borderWidth: 1, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.md },
  errorText: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontSm, lineHeight: 20 },
  inputContainer: { marginBottom: SIZES.md },
  label: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginBottom: SIZES.sm, fontWeight: '700' },
  inputWrapper: { minHeight: SIZES.inputHeight, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusMd, borderWidth: 1, borderColor: COLORS.border },
  input: { flex: 1, minHeight: SIZES.inputHeight, paddingVertical: 12, fontSize: SIZES.fontMd, color: COLORS.textPrimary },
  loginButton: { minHeight: 52, marginTop: SIZES.sm, borderRadius: SIZES.radiusMd, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold, borderWidth: 1, borderColor: COLORS.goldLight },
  loginButtonDisabled: { opacity: 0.58 },
  loginButtonText: { fontSize: SIZES.fontMd, fontWeight: '800', color: COLORS.textOnGold },
  linkGroup: { marginTop: SIZES.lg },
  linkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryLink: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, fontWeight: '600' },
  primaryLink: { fontSize: SIZES.fontSm, color: COLORS.gold, fontWeight: '700' },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SIZES.xs },
});
