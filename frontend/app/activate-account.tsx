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
import { api, apiErrorMessage } from '../src/services/api';
import { COLORS, LAYOUT, SHADOWS, SIZES } from '../src/constants/theme';
import { formatUzbekPhoneInput, normalizeUzbekPhone } from '../src/utils/phone';
import { ACTIVATE } from '../constants/testIds/auth';

export default function ActivateAccountScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 820;
  const [phone, setPhone] = useState('+998');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const passwordChecks = [
    { label: '10+ characters', passed: password.length >= 10 && password.length <= 72 },
    { label: 'Upper & lowercase', passed: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: 'Number & symbol', passed: /\d/.test(password) && /[^A-Za-z0-9]/.test(password) },
    { label: 'No spaces', passed: password.length > 0 && !/\s/.test(password) },
  ];

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
        <ScrollView contentContainerStyle={[styles.content, compact && styles.contentCompact]} keyboardShouldPersistTaps="handled">
          <View style={[styles.shell, compact && styles.shellCompact]}>
            {!compact && (
              <View style={styles.introPanel}>
                <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Nurik's Academy logo" />
                <View style={styles.stepBadge}><Ionicons name="person-add-outline" size={16} color={COLORS.gold} /><Text style={styles.stepBadgeText}>ACCOUNT INVITATION</Text></View>
                <Text style={styles.introTitle}>Your academy account starts here.</Text>
                <Text style={styles.introText}>Use the private code you received to connect securely to classes, progress, messages, and payments.</Text>
                <View style={styles.benefitList}>
                  <Benefit icon="shield-checkmark-outline" title="Private access" copy="Your account is tied to your approved phone number." />
                  <Benefit icon="notifications-outline" title="One place for updates" copy="See the information and reminders allowed for your role." />
                  <Benefit icon="key-outline" title="You control the password" copy="Academy staff never need to know your password." />
                </View>
              </View>
            )}

            <View style={[styles.formPanel, compact && styles.formPanelCompact]}>
              <View style={styles.formHeading}>
                {compact && <Image source={require('../assets/images/logo.png')} style={styles.mobileLogo} resizeMode="contain" accessibilityLabel="Nurik's Academy logo" />}
                <View style={styles.progressBadge}><Text style={styles.progressBadgeText}>ACCOUNT SETUP · FINAL STEP</Text></View>
                <Text style={styles.title}>Activate your account</Text>
                <Text style={styles.subtitle}>Verify your invitation, then choose a password only you know.</Text>
              </View>
              {!!errorMessage && <View style={styles.error}><Ionicons name="alert-circle-outline" size={19} color={COLORS.error} /><Text style={styles.errorText}>{errorMessage}</Text></View>}

              <View style={styles.formSection}>
                <SectionHeading number="1" title="Verify invitation" copy="Enter the phone and Telegram code used for your invite." />
                <Text style={styles.label}>Phone number</Text>
                <View style={styles.inputShell}><Ionicons name="call-outline" size={20} color={COLORS.textTertiary} /><TextInput testID={ACTIVATE.phoneInput} style={styles.input} value={phone} onChangeText={(value) => setPhone(formatUzbekPhoneInput(value))} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" placeholder="+998 90 123 45 67" /></View>
                <Text style={styles.label}>Six-digit code</Text>
                <View style={styles.inputShell}><Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.textTertiary} /><TextInput testID={ACTIVATE.codeInput} style={[styles.input, styles.codeInput]} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="000000" /></View>
                <TouchableOpacity testID={ACTIVATE.resendButton} style={styles.inlineLink} onPress={resend} disabled={resending}><Text style={styles.linkText}>{resending ? 'Requesting…' : 'Send another invitation code'}</Text></TouchableOpacity>
              </View>

              <View style={styles.formSection}>
                <SectionHeading number="2" title="Protect your account" copy="Create a strong password, then enter it once more." />
                <Text style={styles.label}>New password</Text>
                <View style={styles.inputShell}><Ionicons name="lock-closed-outline" size={20} color={COLORS.textTertiary} /><TextInput testID={ACTIVATE.passwordInput} style={styles.input} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" placeholder="Create a strong password" /><TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} style={styles.eyeButton} onPress={() => setShowPassword((value) => !value)}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={COLORS.textSecondary} /></TouchableOpacity></View>
                <View style={styles.requirements}>{passwordChecks.map((check) => <View key={check.label} style={styles.requirement}><Ionicons name={check.passed ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={check.passed ? COLORS.success : COLORS.textTertiary} /><Text style={[styles.requirementText, check.passed && styles.requirementPassed]}>{check.label}</Text></View>)}</View>
                <Text style={styles.label}>Confirm password</Text>
                <View style={styles.inputShell}><Ionicons name="lock-closed-outline" size={20} color={COLORS.textTertiary} /><TextInput testID={ACTIVATE.passwordConfirmInput} style={styles.input} value={confirmation} onChangeText={setConfirmation} secureTextEntry={!showConfirmation} autoCapitalize="none" placeholder="Repeat your password" /><TouchableOpacity accessibilityRole="button" accessibilityLabel={showConfirmation ? 'Hide password confirmation' : 'Show password confirmation'} style={styles.eyeButton} onPress={() => setShowConfirmation((value) => !value)}><Ionicons name={showConfirmation ? 'eye-off-outline' : 'eye-outline'} size={21} color={COLORS.textSecondary} /></TouchableOpacity></View>
                {!!confirmation && <View style={styles.matchRow}><Ionicons name={password === confirmation ? 'checkmark-circle' : 'close-circle'} size={16} color={password === confirmation ? COLORS.success : COLORS.error} /><Text style={[styles.matchText, { color: password === confirmation ? COLORS.success : COLORS.error }]}>{password === confirmation ? 'Passwords match' : 'Passwords do not match'}</Text></View>}
              </View>

              <TouchableOpacity testID={ACTIVATE.submitButton} style={styles.primary} onPress={activate} disabled={loading}>{loading ? <ActivityIndicator color={COLORS.background} /> : <><Text style={styles.primaryText}>Activate account</Text><Ionicons name="arrow-forward" size={19} color={COLORS.textOnGold} /></>}</TouchableOpacity>
              <TouchableOpacity testID={ACTIVATE.loginLink} style={styles.linkButton} onPress={() => router.replace('/login')}><Ionicons name="arrow-back" size={16} color={COLORS.textSecondary} /><Text style={styles.secondaryLink}>Back to sign in</Text></TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function Benefit({ icon, title, copy }: { icon: string; title: string; copy: string }) {
  return <View style={styles.benefit}><Ionicons name={icon as any} size={22} color={COLORS.goldLight} /><View style={styles.benefitCopy}><Text style={styles.benefitTitle}>{title}</Text><Text style={styles.benefitText}>{copy}</Text></View></View>;
}

function SectionHeading({ number, title, copy }: { number: string; title: string; copy: string }) {
  return <View style={styles.sectionHeading}><View style={styles.sectionNumber}><Text style={styles.sectionNumberText}>{number}</Text></View><View style={styles.flexCopy}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionCopy}>{copy}</Text></View></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: COLORS.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: SIZES.xl },
  contentCompact: { justifyContent: 'flex-start', padding: SIZES.md },
  shell: { width: '100%', maxWidth: 1060, alignSelf: 'center', flexDirection: 'row', borderRadius: SIZES.radiusXl, borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.backgroundCard, overflow: 'hidden', ...SHADOWS.medium },
  shellCompact: { maxWidth: LAYOUT.formMaxWidth, flexDirection: 'column', borderRadius: SIZES.radiusLg },
  introPanel: { width: '42%', minHeight: 720, justifyContent: 'center', padding: SIZES.xl, backgroundColor: '#181A12' },
  logo: { width: 74, height: 74, marginBottom: SIZES.lg },
  stepBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: SIZES.xs, paddingHorizontal: SIZES.sm, paddingVertical: 7, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.goldGlass },
  stepBadgeText: { color: COLORS.goldLight, fontSize: 10, fontWeight: '800', letterSpacing: 0.9 },
  introTitle: { maxWidth: 340, color: COLORS.textPrimary, fontSize: 34, lineHeight: 40, fontWeight: '850' as any, marginTop: SIZES.lg },
  introText: { maxWidth: 350, color: COLORS.textSecondary, fontSize: SIZES.fontMd, lineHeight: 24, marginTop: SIZES.md },
  benefitList: { gap: SIZES.lg, marginTop: SIZES.xl },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.md },
  benefitCopy: { flex: 1 },
  benefitTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontSm, fontWeight: '800' },
  benefitText: { color: COLORS.textTertiary, fontSize: SIZES.fontXs, lineHeight: 18, marginTop: 3 },
  formPanel: { flex: 1, padding: SIZES.xl },
  formPanelCompact: { padding: SIZES.lg },
  formHeading: { marginBottom: SIZES.lg },
  mobileLogo: { width: 58, height: 58, marginBottom: SIZES.md },
  progressBadge: { alignSelf: 'flex-start', paddingHorizontal: SIZES.sm, paddingVertical: 6, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.backgroundElevated, marginBottom: SIZES.md },
  progressBadgeText: { color: COLORS.gold, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: COLORS.textPrimary, fontSize: 30, lineHeight: 36, fontWeight: '850' as any, marginBottom: SIZES.xs },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, lineHeight: 20 },
  formSection: { backgroundColor: COLORS.backgroundLight, borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusLg, padding: SIZES.md, marginBottom: SIZES.md },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.sm, marginBottom: SIZES.sm },
  sectionNumber: { width: 28, height: 28, borderRadius: SIZES.radiusSm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold },
  sectionNumberText: { color: COLORS.textOnGold, fontSize: SIZES.fontSm, fontWeight: '850' as any },
  flexCopy: { flex: 1 },
  sectionTitle: { color: COLORS.textPrimary, fontSize: SIZES.fontMd, fontWeight: '800' },
  sectionCopy: { color: COLORS.textTertiary, fontSize: 11, lineHeight: 16, marginTop: 2 },
  label: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, fontWeight: '700', marginBottom: SIZES.xs, marginTop: SIZES.sm },
  inputShell: { minHeight: SIZES.inputHeight, flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, backgroundColor: COLORS.background, borderColor: COLORS.borderStrong, borderWidth: 1, borderRadius: SIZES.radiusMd, paddingHorizontal: SIZES.md },
  input: { flex: 1, minHeight: SIZES.inputHeight, color: COLORS.textPrimary, fontSize: SIZES.fontMd, paddingVertical: SIZES.sm },
  codeInput: { letterSpacing: 4, fontVariant: ['tabular-nums'] },
  eyeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  requirements: { flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.xs, marginTop: SIZES.sm },
  requirement: { width: '48%', minWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 5 },
  requirementText: { color: COLORS.textTertiary, fontSize: 11 },
  requirementPassed: { color: COLORS.success },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: SIZES.xs, marginTop: SIZES.sm },
  matchText: { fontSize: 11, fontWeight: '700' },
  error: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm, backgroundColor: COLORS.error + '14', borderColor: COLORS.error + '70', borderWidth: 1, borderRadius: SIZES.radiusMd, padding: SIZES.md, marginBottom: SIZES.md },
  errorText: { flex: 1, color: COLORS.error, fontSize: SIZES.fontSm },
  primary: { flexDirection: 'row', gap: SIZES.sm, backgroundColor: COLORS.gold, borderRadius: SIZES.radiusMd, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: SIZES.sm },
  primaryText: { color: COLORS.textOnGold, fontWeight: '800', fontSize: SIZES.fontMd },
  inlineLink: { alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center', marginTop: SIZES.xs },
  linkButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SIZES.xs, padding: SIZES.sm },
  linkText: { color: COLORS.gold, fontWeight: '600' },
  secondaryLink: { color: COLORS.textSecondary },
});
