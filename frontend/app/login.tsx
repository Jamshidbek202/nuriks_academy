import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Text, TextInput } from '../src/components/LocalizedText';
import { useAuth } from '../src/contexts/AuthContext';
import { useLanguage } from '../src/contexts/LanguageContext';
import { COLORS, LAYOUT, SHADOWS, SIZES } from '../src/constants/theme';
import { formatUzbekPhoneInput, isCompleteUzbekPhone, normalizeUzbekPhone } from '../src/utils/phone';
import { LOGIN } from '../constants/testIds';
import { MOTION, useMotionPreference } from '../src/contexts/MotionContext';

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
      <LinearGradient
        colors={['rgba(217,184,74,0)', 'rgba(217,184,74,0.055)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.ambientGoldWash}
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
  const { reduceMotion, ready: motionReady } = useMotionPreference();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const brandEntrance = useRef(new Animated.Value(1)).current;
  const formEntrance = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    brandEntrance.stopAnimation();
    formEntrance.stopAnimation();
    if (!motionReady || reduceMotion) {
      brandEntrance.setValue(1);
      formEntrance.setValue(1);
      return;
    }

    brandEntrance.setValue(0.78);
    formEntrance.setValue(0.78);
    Animated.stagger(70, [
      Animated.timing(brandEntrance, {
        toValue: 1,
        duration: MOTION.hero,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(formEntrance, {
        toValue: 1,
        duration: MOTION.overlay,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      brandEntrance.stopAnimation();
      formEntrance.stopAnimation();
    };
  }, [brandEntrance, formEntrance, motionReady, reduceMotion]);

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
          <View style={[styles.shell, isWide && styles.shellWide]}>
            <Animated.View
              style={[
                styles.brandPanel,
                isWide && styles.brandPanelWide,
                {
                  opacity: brandEntrance,
                  transform: [
                    { translateY: brandEntrance.interpolate({ inputRange: [0.78, 1], outputRange: [10, 0] }) },
                  ],
                },
              ]}
            >
              <View style={styles.brandRow}>
                <Image
                  source={require('../assets/images/logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                  accessibilityLabel="Nurik's Academy logo"
                />
                <View style={styles.brandIdentity}>
                  <Text style={styles.academyName}>Nurik&apos;s Academy</Text>
                  <Text style={styles.systemName}>{t('Academy management system')}</Text>
                </View>
              </View>

              <View style={[styles.illustrationStage, !isWide && styles.illustrationStageCompact]}>
                <ExpoImage
                  source={require('../assets/illustrations/academy-operations.png')}
                  style={styles.studyIllustration}
                  contentFit="contain"
                  accessibilityLabel={t('Books, learning plans, and academy operations')}
                />
              </View>

              {isWide && (
                <View style={styles.brandCopy}>
                  <Text style={styles.brandTitle}>{t('One place to run the academy.')}</Text>
                  <Text style={styles.brandDescription}>
                    {t('Daily work, learning progress, and payments — clear and secure.')}
                  </Text>
                </View>
              )}
            </Animated.View>

            <Animated.View
              style={[
                styles.formPanel,
                isWide && styles.formPanelWide,
                {
                  opacity: formEntrance,
                  transform: [
                    { translateY: formEntrance.interpolate({ inputRange: [0.78, 1], outputRange: [10, 0] }) },
                  ],
                },
              ]}
            >
              <View style={styles.formHeading}>
                <Text style={styles.title}>{t('Welcome Back')}</Text>
                <Text style={styles.subtitle}>{t('Sign in to continue')}</Text>
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

              <View style={styles.accessNote}>
                <Ionicons name="shield-checkmark-outline" size={17} color={COLORS.textTertiary} />
                <Text style={styles.accessNoteText}>{t('Access is limited to approved Nurik’s Academy accounts')}</Text>
              </View>
            </Animated.View>
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
  ambientGoldWash: { position: 'absolute', top: 0, right: 0, bottom: 0, width: '48%' },
  ambientSpeck: { position: 'absolute', backgroundColor: '#D4AF37' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: SIZES.md, position: 'relative' },
  shell: { width: '100%', maxWidth: LAYOUT.formMaxWidth, alignSelf: 'center', ...SHADOWS.medium },
  shellWide: { maxWidth: 1060, flexDirection: 'row', alignItems: 'stretch' },
  brandPanel: {
    padding: SIZES.lg,
    backgroundColor: '#0B0E0A',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomWidth: 0,
    borderTopLeftRadius: SIZES.radiusXl,
    borderTopRightRadius: SIZES.radiusXl,
    overflow: 'hidden',
  },
  brandPanelWide: {
    flex: 1.04,
    minHeight: 590,
    padding: SIZES.xl,
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderRightWidth: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: SIZES.radiusXl,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: SIZES.md },
  brandIdentity: { flex: 1 },
  logo: { width: 54, height: 54, flexShrink: 0 },
  academyName: { color: COLORS.textPrimary, fontSize: SIZES.fontLg, lineHeight: 24, fontWeight: '800', letterSpacing: -0.3 },
  systemName: { color: COLORS.textSecondary, fontSize: SIZES.fontXs, lineHeight: 17, marginTop: 2 },
  illustrationStage: {
    width: '84%',
    maxWidth: 400,
    aspectRatio: 1100 / 733,
    alignSelf: 'center',
    marginVertical: SIZES.lg,
  },
  illustrationStageCompact: { width: '66%', marginTop: SIZES.md, marginBottom: 0 },
  studyIllustration: { width: '100%', height: '100%' },
  brandCopy: { maxWidth: 410 },
  brandTitle: { color: COLORS.textPrimary, fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -0.8 },
  brandDescription: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, lineHeight: 21, marginTop: SIZES.sm, maxWidth: 360 },
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
  },
  formPanelWide: {
    flex: 0.96,
    minHeight: 590,
    maxWidth: 510,
    justifyContent: 'center',
    alignSelf: 'stretch',
    borderTopRightRadius: SIZES.radiusXl,
    borderBottomLeftRadius: 0,
  },
  formHeading: { marginBottom: SIZES.xl },
  title: { color: COLORS.textPrimary, fontSize: SIZES.fontXxl, lineHeight: 41, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, lineHeight: 20, marginTop: SIZES.xs },
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
