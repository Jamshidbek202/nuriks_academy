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
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Text, TextInput } from '../src/components/LocalizedText';
import { useAuth } from '../src/contexts/AuthContext';
import { useLanguage } from '../src/contexts/LanguageContext';
import { COLORS, LAYOUT, SIZES } from '../src/constants/theme';
import { formatUzbekPhoneInput, isCompleteUzbekPhone, normalizeUzbekPhone } from '../src/utils/phone';
import { LOGIN } from '../constants/testIds';

const AMBIENT_SPECKS = [
  { left: '7%', top: '14%', size: 2, opacity: 0.28 },
  { left: '15%', top: '38%', size: 1, opacity: 0.36 },
  { left: '23%', top: '8%', size: 1, opacity: 0.22 },
  { left: '31%', top: '27%', size: 2, opacity: 0.18 },
  { left: '39%', top: '12%', size: 1, opacity: 0.3 },
  { left: '47%', top: '34%', size: 1, opacity: 0.2 },
  { left: '55%', top: '7%', size: 2, opacity: 0.24 },
  { left: '64%', top: '23%', size: 1, opacity: 0.34 },
  { left: '73%', top: '13%', size: 1, opacity: 0.18 },
  { left: '82%', top: '32%', size: 2, opacity: 0.22 },
  { left: '92%', top: '17%', size: 1, opacity: 0.32 },
  { left: '11%', top: '68%', size: 1, opacity: 0.16 },
  { left: '27%', top: '81%', size: 2, opacity: 0.14 },
  { left: '44%', top: '72%', size: 1, opacity: 0.2 },
  { left: '61%', top: '87%', size: 1, opacity: 0.14 },
  { left: '78%', top: '76%', size: 2, opacity: 0.16 },
  { left: '89%', top: '91%', size: 1, opacity: 0.2 },
] as const;

function BrandAtmosphere() {
  return (
    <View pointerEvents="none" accessibilityElementsHidden style={styles.atmosphere}>
      <LinearGradient
        colors={['#151208', '#0B0B0B', COLORS.background]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(8,9,7,0.78)', 'rgba(8,9,7,0)', 'rgba(8,9,7,0.78)']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      {AMBIENT_SPECKS.map((speck, index) => (
        <View
          key={index}
          style={[
            styles.ambientSpeck,
            {
              left: speck.left,
              top: speck.top,
              width: speck.size,
              height: speck.size,
              borderRadius: speck.size,
              opacity: speck.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function LoginScreen() {
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { login: authLogin, sessionNotice, clearSessionNotice } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const handleLogin = async () => {
    const normalizedPhone = normalizeUzbekPhone(phone);
    setPhone(formatUzbekPhoneInput(phone));
    setErrorMessage('');
    clearSessionNotice();

    if (!isCompleteUzbekPhone(phone) || !password) {
      const message = !isCompleteUzbekPhone(phone)
        ? t('Enter a complete phone number')
        : t('Please enter phone number and password');
      setErrorMessage(message);
      Alert.alert('Error', message);
      return;
    }

    setLoading(true);
    try {
      await authLogin(normalizedPhone, password);
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
        <BrandAtmosphere />
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.shell}>
            <View style={styles.brand}>
              <Image
                source={require('../assets/images/logo.png')}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="Nurik's Academy logo"
              />
              <Text style={styles.academyName}>Nurik&apos;s Academy</Text>
              <Text style={styles.systemName}>{t('Academy management system')}</Text>
            </View>

            <View style={styles.formPanel}>
              <View style={styles.formHeading}>
                <Text style={styles.title}>{t('Sign In')}</Text>
                <Text style={styles.subtitle}>{t('Use your approved academy account')}</Text>
              </View>

              {!!errorMessage && (
                <View accessibilityRole="alert" style={[styles.messageBox, styles.errorMessageBox]}>
                  <Ionicons name="alert-circle-outline" size={20} color={COLORS.error} />
                  <Text style={styles.messageText}>{errorMessage}</Text>
                </View>
              )}
              {!errorMessage && !!sessionNotice && (
                <View
                  testID="session-ended-notice"
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={[styles.messageBox, styles.noticeMessageBox]}
                >
                  <Ionicons name="information-circle-outline" size={20} color={COLORS.warning} />
                  <Text style={styles.messageText}>{sessionNotice}</Text>
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
                    onChangeText={(value) => setPhone(formatUzbekPhoneInput(value))}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
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
                    secureTextEntry={!passwordVisible}
                    textContentType="password"
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    testID={LOGIN.passwordVisibilityButton}
                    style={styles.passwordVisibilityButton}
                    onPress={() => setPasswordVisible((visible) => !visible)}
                    accessibilityRole="button"
                    accessibilityLabel={t(passwordVisible ? 'Hide password' : 'Show password')}
                    hitSlop={8}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                      size={21}
                      color={COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                testID={LOGIN.submitButton}
                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.82}
              >
                {loading
                  ? <ActivityIndicator color={COLORS.textOnGold} />
                  : <Text style={styles.loginButtonText}>{t('Sign In')}</Text>}
              </TouchableOpacity>

              <View style={styles.links}>
                <TouchableOpacity
                  testID={LOGIN.forgotPasswordLink}
                  style={styles.linkButton}
                  onPress={() => router.push('/forgot-password' as any)}
                >
                  <Text style={styles.secondaryLink}>{t('Forgot your password?')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID={LOGIN.activateLink}
                  style={styles.linkButton}
                  onPress={() => router.push('/activate-account' as any)}
                >
                  <Text style={styles.primaryLink}>{t('I have an invitation code')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.accessNote}>
              <Ionicons name="shield-checkmark-outline" size={17} color={COLORS.textTertiary} />
              <Text style={styles.accessNoteText}>{t('Access is limited to approved Nurik’s Academy accounts')}</Text>
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
  atmosphere: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  ambientSpeck: { position: 'absolute', backgroundColor: '#D4AF37' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: SIZES.lg, position: 'relative' },
  shell: { width: '100%', maxWidth: LAYOUT.formMaxWidth, alignSelf: 'center' },
  brand: { alignItems: 'center', marginBottom: SIZES.xl },
  logo: { width: 76, height: 76, marginBottom: SIZES.md },
  academyName: { color: COLORS.textPrimary, fontSize: SIZES.fontXl, lineHeight: 31, fontWeight: '800', letterSpacing: -0.4 },
  systemName: { color: COLORS.gold, fontSize: SIZES.fontXs, marginTop: SIZES.xs, letterSpacing: 0.45 },
  formPanel: { backgroundColor: 'rgba(17,18,15,0.94)', borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: SIZES.radiusMd, padding: SIZES.lg },
  formHeading: { marginBottom: SIZES.lg, paddingBottom: SIZES.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  title: { color: COLORS.textPrimary, fontSize: SIZES.fontXl, lineHeight: 31, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, marginTop: SIZES.xs },
  messageBox: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.sm, backgroundColor: COLORS.backgroundLight, borderWidth: 1, borderRadius: SIZES.radiusSm, padding: SIZES.md, marginBottom: SIZES.md },
  errorMessageBox: { borderColor: COLORS.error + '70', backgroundColor: COLORS.error + '0A' },
  noticeMessageBox: { borderColor: COLORS.warning + '70', backgroundColor: COLORS.warning + '0A' },
  messageText: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontSm, lineHeight: 20 },
  inputContainer: { marginBottom: SIZES.md },
  label: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, marginBottom: SIZES.sm, fontWeight: '650' as any },
  inputWrapper: { minHeight: SIZES.inputHeight, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, paddingHorizontal: SIZES.md, backgroundColor: COLORS.backgroundLight, borderRadius: SIZES.radiusSm, borderWidth: 1, borderColor: COLORS.borderStrong },
  input: { flex: 1, minHeight: SIZES.inputHeight, paddingVertical: 12, fontSize: SIZES.fontMd, color: COLORS.textPrimary },
  passwordVisibilityButton: { width: 44, height: 44, marginRight: -10, alignItems: 'center', justifyContent: 'center' },
  loginButton: { minHeight: 52, marginTop: SIZES.sm, borderRadius: SIZES.radiusSm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold, borderWidth: 1, borderColor: COLORS.goldLight },
  loginButtonDisabled: { opacity: 0.58 },
  loginButtonText: { fontSize: SIZES.fontMd, fontWeight: '800', color: COLORS.textOnGold },
  links: { marginTop: SIZES.lg, paddingTop: SIZES.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  linkButton: { minHeight: SIZES.touchTarget, alignItems: 'center', justifyContent: 'center' },
  secondaryLink: { fontSize: SIZES.fontSm, color: COLORS.textSecondary, fontWeight: '600' },
  primaryLink: { fontSize: SIZES.fontSm, color: COLORS.gold, fontWeight: '700' },
  accessNote: { minHeight: 44, marginTop: SIZES.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SIZES.sm },
  accessNoteText: { color: COLORS.textTertiary, fontSize: SIZES.fontXs, textAlign: 'center' },
});
