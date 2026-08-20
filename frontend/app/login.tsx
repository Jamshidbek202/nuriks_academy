import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
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
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Text, TextInput } from '../src/components/LocalizedText';
import { useAuth } from '../src/contexts/AuthContext';
import { useLanguage } from '../src/contexts/LanguageContext';
import { COLORS, LAYOUT, SHADOWS, SIZES } from '../src/constants/theme';
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
      <LinearGradient
        colors={['rgba(217,184,74,0.24)', 'rgba(217,184,74,0.04)', 'rgba(217,184,74,0)']}
        locations={[0, 0.48, 1]}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.9, y: 0.9 }}
        style={[styles.ambientPool, styles.ambientPoolGold]}
      />
      <LinearGradient
        colors={['rgba(73,99,126,0.16)', 'rgba(73,99,126,0.03)', 'rgba(73,99,126,0)']}
        locations={[0, 0.52, 1]}
        start={{ x: 0.1, y: 0.15 }}
        end={{ x: 0.9, y: 0.85 }}
        style={[styles.ambientPool, styles.ambientPoolCool]}
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
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const brandEntrance = useRef(new Animated.Value(0)).current;
  const formEntrance = useRef(new Animated.Value(0)).current;
  const illustrationFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let floatAnimation: Animated.CompositeAnimation | undefined;
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion) {
        brandEntrance.setValue(1);
        formEntrance.setValue(1);
        return;
      }

      Animated.stagger(90, [
        Animated.timing(brandEntrance, {
          toValue: 1,
          duration: 560,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(formEntrance, {
          toValue: 1,
          duration: 460,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
      ]).start();

      floatAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(illustrationFloat, {
            toValue: 1,
            duration: 2600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(illustrationFloat, {
            toValue: 0,
            duration: 2600,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      floatAnimation.start();
    });

    return () => {
      cancelled = true;
      floatAnimation?.stop();
      brandEntrance.stopAnimation();
      formEntrance.stopAnimation();
      illustrationFloat.stopAnimation();
    };
  }, [brandEntrance, formEntrance, illustrationFloat]);

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
                styles.brand,
                isWide && styles.brandWide,
                {
                  opacity: brandEntrance,
                  transform: [
                    { translateY: brandEntrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
                  ],
                },
              ]}
            >
              <Image
                source={require('../assets/images/logo.png')}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="Nurik's Academy logo"
              />
              <Text style={styles.academyName}>Nurik&apos;s Academy</Text>
              <Text style={styles.systemName}>{t('Academy management system')}</Text>
              <Animated.View
                style={[
                  styles.brandIllustration,
                  {
                    transform: [
                      { translateY: illustrationFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) },
                    ],
                  },
                ]}
              >
                <View
                  pointerEvents="none"
                  style={[styles.illustrationStage, !isWide && styles.illustrationStageCompact]}
                >
                  <View style={styles.illustrationGround} />
                  <Image
                    source={require('../assets/illustrations/classroom.png')}
                    style={[styles.classroomIllustration, !isWide && styles.classroomIllustrationCompact]}
                    resizeMode="contain"
                    accessibilityLabel={t('Teacher leading a classroom lesson')}
                  />
                </View>
              </Animated.View>
              {isWide && (
                <View style={styles.brandNote}>
                  <Text style={styles.brandNoteLabel}>{t('ONE ACADEMY · ONE SYSTEM')}</Text>
                  <Text style={styles.brandNoteText}>{t('Classes, progress, communication, and finance in one secure workspace.')}</Text>
                </View>
              )}
            </Animated.View>

            <Animated.View
              style={[
                styles.formColumn,
                {
                  opacity: formEntrance,
                  transform: [
                    { translateY: formEntrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                    { scale: formEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
                  ],
                },
              ]}
            >
              <View style={styles.formPanel}>
              <BlurView pointerEvents="none" tint="dark" intensity={38} style={StyleSheet.absoluteFill} />
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.075)', 'rgba(217,184,74,0.025)', 'rgba(255,255,255,0.008)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
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
  ambientPool: { position: 'absolute', borderRadius: 999 },
  ambientPoolGold: { width: '88%', aspectRatio: 1.12, top: '-28%', right: '-28%', transform: [{ rotate: '-14deg' }] },
  ambientPoolCool: { width: '74%', aspectRatio: 1.06, bottom: '-32%', left: '-30%', transform: [{ rotate: '16deg' }] },
  ambientSpeck: { position: 'absolute', backgroundColor: '#D4AF37' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: SIZES.lg, position: 'relative' },
  shell: { width: '100%', maxWidth: LAYOUT.formMaxWidth, alignSelf: 'center' },
  shellWide: { maxWidth: 1040, flexDirection: 'row', alignItems: 'center', gap: 72 },
  brand: { alignItems: 'center', marginBottom: SIZES.xl },
  brandWide: { flex: 1, alignItems: 'flex-start', marginBottom: 0 },
  logo: { width: 76, height: 76, marginBottom: SIZES.md },
  academyName: { color: COLORS.textPrimary, fontSize: SIZES.fontXl, lineHeight: 31, fontWeight: '800', letterSpacing: -0.4 },
  systemName: { color: COLORS.gold, fontSize: SIZES.fontXs, marginTop: SIZES.xs, letterSpacing: 0.45 },
  brandIllustration: { width: '100%', marginTop: SIZES.md, alignItems: 'center' },
  illustrationStage: {
    width: 430,
    height: 338,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  illustrationStageCompact: { width: 230, height: 184 },
  illustrationGround: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: '4%',
    height: '20%',
    borderRadius: 999,
    backgroundColor: 'rgba(217,184,74,0.075)',
    transform: [{ scaleY: 0.34 }],
  },
  classroomIllustration: { width: '100%', height: '100%' },
  classroomIllustrationCompact: { width: '100%', height: '100%' },
  brandNote: { maxWidth: 360, marginTop: SIZES.lg, paddingTop: SIZES.md, borderTopWidth: 1, borderTopColor: COLORS.goldHairline },
  brandNoteLabel: { color: COLORS.goldLight, fontSize: 10, lineHeight: 15, fontWeight: '800', letterSpacing: 1.25 },
  brandNoteText: { color: COLORS.textSecondary, fontSize: SIZES.fontSm, lineHeight: 21, marginTop: SIZES.sm },
  formColumn: { width: '100%', maxWidth: LAYOUT.formMaxWidth },
  formPanel: { backgroundColor: 'rgba(17,20,18,0.60)', borderWidth: 1, borderColor: COLORS.glassHighlight, borderRadius: SIZES.radiusLg, padding: SIZES.lg, overflow: 'hidden', ...SHADOWS.medium },
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
