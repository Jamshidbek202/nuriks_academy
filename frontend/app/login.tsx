import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { LOGIN } from '../constants/testIds';
import { Text, TextInput } from '../src/components/LocalizedText';
import { ConcourseAtmosphere } from '../src/components/ConcourseAtmosphere';
import { MotionTouchableOpacity } from '../src/components/Motion';
import { COLORS, SHADOWS, SIZES } from '../src/constants/theme';
import { useAuth } from '../src/contexts/AuthContext';
import { useLanguage } from '../src/contexts/LanguageContext';
import { MOTION, useMotionPreference } from '../src/contexts/MotionContext';
import { formatUzbekPhoneInput, isCompleteUzbekPhone, normalizeUzbekPhone } from '../src/utils/phone';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

/**
 * Direction contract — Login / Operate
 * A quiet academy workspace floats inside the established black-and-gold world;
 * the authentication sheet is the only dominant glass surface. Desktop shows
 * brand context beside the task, while mobile compresses the same scene above
 * a full-width form without cropping the artwork or hiding the primary action.
 */
function WorkspaceScene({ compact }: { compact: boolean }) {
  const { reduceMotion, ready } = useMotionPreference();
  const settle = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    settle.stopAnimation();
    if (!ready || reduceMotion) {
      settle.setValue(1);
      return;
    }

    settle.setValue(0);
    const animation = Animated.timing(settle, {
      toValue: 1,
      delay: 110,
      duration: 880,
      easing: Easing.bezier(...MOTION.easing.enter),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [ready, reduceMotion, settle]);

  const lift = settle.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const tilt = settle.interpolate({ inputRange: [0, 1], outputRange: ['-1.1deg', '0deg'] });
  const shadowScale = settle.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  const shadowOpacity = settle.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.28] });

  return (
    <View style={[styles.workspaceScene, compact && styles.workspaceSceneCompact]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.workspaceShadow,
          compact && styles.workspaceShadowCompact,
          { opacity: shadowOpacity, transform: [{ scaleX: shadowScale }] },
        ]}
      />
      <Animated.View
        style={[
          styles.workspaceArtwork,
          compact && styles.workspaceArtworkCompact,
          { transform: [{ translateY: lift }, { rotate: tilt }] },
        ]}
      >
        <ExpoImage
          source={require('../assets/illustrations/academy-operations.png')}
          style={styles.studyIllustration}
          contentFit="contain"
          transition={compact ? 0 : 180}
          accessibilityLabel="Books, learning plans, and academy operations"
        />
      </Animated.View>
    </View>
  );
}

function FieldShell({
  active,
  icon,
  children,
}: {
  active: boolean;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  children: React.ReactNode;
}) {
  const { reduceMotion, ready } = useMotionPreference();
  const focus = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    focus.stopAnimation();
    if (!ready || reduceMotion) {
      focus.setValue(active ? 1 : 0);
      return;
    }
    Animated.timing(focus, {
      toValue: active ? 1 : 0,
      duration: MOTION.state,
      easing: Easing.bezier(...MOTION.easing.standard),
      useNativeDriver: false,
    }).start();
    return () => focus.stopAnimation();
  }, [active, focus, ready, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.inputWrapper,
        {
          borderColor: focus.interpolate({
            inputRange: [0, 1],
            outputRange: [COLORS.borderStrong, COLORS.goldLight],
          }),
          backgroundColor: focus.interpolate({
            inputRange: [0, 1],
            outputRange: ['rgba(8,10,8,0.72)', 'rgba(19,18,11,0.84)'],
          }),
        },
      ]}
    >
      <Ionicons name={icon} size={19} color={active ? COLORS.goldLight : COLORS.textTertiary} />
      {children}
    </Animated.View>
  );
}

export default function LoginScreen() {
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { login: authLogin, sessionNotice, clearSessionNotice } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const { reduceMotion, ready: motionReady } = useMotionPreference();
  const { width, height } = useWindowDimensions();
  const isWide = width >= 920;
  const isCompact = width < 600;
  const shortViewport = height < 760;
  const sceneEntrance = useRef(new Animated.Value(1)).current;
  const formEntrance = useRef(new Animated.Value(1)).current;
  const sheen = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    sceneEntrance.stopAnimation();
    formEntrance.stopAnimation();
    sheen.stopAnimation();
    if (!motionReady || reduceMotion) {
      sceneEntrance.setValue(1);
      formEntrance.setValue(1);
      sheen.setValue(1);
      return;
    }

    sceneEntrance.setValue(0);
    formEntrance.setValue(0);
    sheen.setValue(0);
    Animated.parallel([
      Animated.timing(sceneEntrance, {
        toValue: 1,
        duration: MOTION.hero,
        easing: Easing.bezier(...MOTION.easing.enter),
        useNativeDriver: true,
      }),
      Animated.timing(formEntrance, {
        toValue: 1,
        delay: 90,
        duration: MOTION.overlay,
        easing: Easing.bezier(...MOTION.easing.enter),
        useNativeDriver: true,
      }),
      Animated.timing(sheen, {
        toValue: 1,
        delay: 420,
        duration: 780,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      sceneEntrance.stopAnimation();
      formEntrance.stopAnimation();
      sheen.stopAnimation();
    };
  }, [formEntrance, motionReady, reduceMotion, sceneEntrance, sheen]);

  const handleLogin = async () => {
    const normalizedPhone = normalizeUzbekPhone(phone);
    setPhone(formatUzbekPhoneInput(phone));
    setErrorMessage('');
    clearSessionNotice();

    if (!isCompleteUzbekPhone(phone) || !password) {
      setErrorMessage(!isCompleteUzbekPhone(phone)
        ? t('Enter a complete phone number')
        : t('Please enter phone number and password'));
      return;
    }

    setLoading(true);
    try {
      await authLogin(normalizedPhone, password);
      router.replace('/(dashboard)');
    } catch (error: any) {
      setErrorMessage(error.message || t('Invalid login or password'));
    } finally {
      setLoading(false);
    }
  };

  const sceneTranslate = sceneEntrance.interpolate({ inputRange: [0, 1], outputRange: [isWide ? -18 : -8, 0] });
  const formTranslate = formEntrance.interpolate({ inputRange: [0, 1], outputRange: [isWide ? 22 : 14, 0] });
  const sheenTranslate = sheen.interpolate({ inputRange: [0, 1], outputRange: [-260, 540] });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container} testID="login-screen">
        <ConcourseAtmosphere />
        <View pointerEvents="none" style={styles.edgeVignette} />
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isCompact && styles.scrollContentCompact,
            shortViewport && styles.scrollContentShort,
          ]}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={[styles.shell, isWide && styles.shellWide]}>
            <Animated.View
              style={[
                styles.brandPanel,
                isWide ? styles.brandPanelWide : styles.brandPanelCompact,
                {
                  opacity: sceneEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.52, 1] }),
                  transform: [{ translateX: sceneTranslate }],
                },
              ]}
            >
              <View style={styles.brandRow}>
                <View style={styles.logoWell}>
                  <Image
                    source={require('../assets/images/logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                    accessibilityLabel="Nurik's Academy logo"
                  />
                </View>
                <View style={styles.brandIdentity}>
                  <Text style={styles.academyName}>Nurik&apos;s Academy</Text>
                  <Text style={styles.systemName}>{t('Academy management system')}</Text>
                </View>
              </View>

              <WorkspaceScene compact={!isWide} />

              {isWide && (
                <View style={styles.brandCopy}>
                  <Text style={styles.brandTitle}>{t('One place to run the academy.')}</Text>
                  <Text style={styles.brandDescription}>
                    {t('Daily work, learning progress, and payments — clear and secure.')}
                  </Text>
                  <View style={styles.workspaceLegend}>
                    <View style={styles.legendItem}>
                      <Ionicons name="calendar-clear-outline" size={17} color={COLORS.goldLight} />
                      <Text style={styles.legendText}>{t('Classes')}</Text>
                    </View>
                    <View style={styles.legendDivider} />
                    <View style={styles.legendItem}>
                      <Ionicons name="trending-up-outline" size={17} color={COLORS.goldLight} />
                      <Text style={styles.legendText}>{t('Progress')}</Text>
                    </View>
                    <View style={styles.legendDivider} />
                    <View style={styles.legendItem}>
                      <Ionicons name="wallet-outline" size={17} color={COLORS.goldLight} />
                      <Text style={styles.legendText}>{t('Finance')}</Text>
                    </View>
                  </View>
                </View>
              )}
            </Animated.View>

            <Animated.View
              style={[
                styles.formPanel,
                isWide && styles.formPanelWide,
                {
                  opacity: formEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
                  transform: [{ translateX: formTranslate }, { scale: formEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }],
                },
              ]}
            >
              <BlurView tint="dark" intensity={Platform.OS === 'android' ? 20 : 48} style={StyleSheet.absoluteFill} />
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,250,231,0.085)', 'rgba(24,23,18,0.58)', 'rgba(9,10,7,0.74)']}
                locations={[0, 0.34, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={styles.formTopHighlight} />

              <View style={styles.formContent}>
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
                  <Text style={[styles.label, phoneFocused && styles.labelActive]}>{t('Phone number')}</Text>
                  <FieldShell active={phoneFocused} icon="call-outline">
                    <TextInput
                      testID={LOGIN.phoneInput}
                      style={styles.input}
                      placeholder="+998 90 123 45 67"
                      placeholderTextColor={COLORS.textTertiary}
                      value={phone}
                      onChangeText={(value) => setPhone(formatUzbekPhoneInput(value))}
                      onFocus={() => setPhoneFocused(true)}
                      onBlur={() => setPhoneFocused(false)}
                      keyboardType="phone-pad"
                      textContentType="telephoneNumber"
                      autoComplete="tel"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                    />
                  </FieldShell>
                </View>

                <View style={styles.inputContainer}>
                  <Text style={[styles.label, passwordFocused && styles.labelActive]}>{t('Password')}</Text>
                  <FieldShell active={passwordFocused} icon="lock-closed-outline">
                    <TextInput
                      testID={LOGIN.passwordInput}
                      style={styles.input}
                      placeholder={t('Enter your password')}
                      placeholderTextColor={COLORS.textTertiary}
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
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
                        color={passwordVisible ? COLORS.goldLight : COLORS.textSecondary}
                      />
                    </TouchableOpacity>
                  </FieldShell>
                </View>

                <MotionTouchableOpacity
                  testID={LOGIN.submitButton}
                  style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                  onPress={handleLogin}
                  disabled={loading}
                  pressScale={0.988}
                  activeOpacity={0.92}
                >
                  <LinearGradient
                    colors={[COLORS.goldLight, COLORS.gold, '#BE9638']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <AnimatedLinearGradient
                    pointerEvents="none"
                    colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.46)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.buttonSheen, { transform: [{ translateX: sheenTranslate }, { rotate: '-14deg' }] }]}
                  />
                  {loading
                    ? <ActivityIndicator color={COLORS.textOnGold} />
                    : (
                      <View style={styles.loginButtonContent}>
                        <Text style={styles.loginButtonText}>{t('Sign In')}</Text>
                        <Ionicons name="arrow-forward" size={18} color={COLORS.textOnGold} />
                      </View>
                    )}
                </MotionTouchableOpacity>

                <View style={styles.links}>
                  <TouchableOpacity
                    testID={LOGIN.forgotPasswordLink}
                    style={styles.linkButton}
                    onPress={() => router.push('/forgot-password' as any)}
                  >
                    <Text style={styles.secondaryLink}>{t('Forgot your password?')}</Text>
                  </TouchableOpacity>
                  <View style={styles.linkDivider} />
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
  edgeVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    ...Platform.select({ web: { boxShadow: 'inset 0 0 160px rgba(0,0,0,0.42)' } as any, default: {} }),
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingVertical: 30,
    position: 'relative',
  },
  scrollContentCompact: { justifyContent: 'flex-start', paddingHorizontal: SIZES.md, paddingVertical: 18 },
  scrollContentShort: { justifyContent: 'flex-start' },
  shell: { width: '100%', maxWidth: 540, alignSelf: 'center' },
  shellWide: { maxWidth: 1180, minHeight: 660, flexDirection: 'row', alignItems: 'center', gap: 64 },
  brandPanel: { position: 'relative' },
  brandPanelWide: { flex: 1.08, minWidth: 0, justifyContent: 'space-between', paddingVertical: 12 },
  brandPanelCompact: { width: '100%', paddingHorizontal: 6, marginBottom: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  logoWell: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,248,220,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(241,217,139,0.20)',
  },
  brandIdentity: { flex: 1 },
  logo: { width: 39, height: 39, flexShrink: 0 },
  academyName: { color: COLORS.textPrimary, fontSize: 21, lineHeight: 25, fontWeight: '800', letterSpacing: -0.45 },
  systemName: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 1 },
  workspaceScene: { height: 338, width: '100%', justifyContent: 'center', alignItems: 'center', marginVertical: 20 },
  workspaceSceneCompact: { height: 162, marginTop: 6, marginBottom: 0 },
  workspaceArtwork: { width: '100%', height: '100%', maxWidth: 610 },
  workspaceArtworkCompact: { maxWidth: 330 },
  studyIllustration: { width: '100%', height: '100%' },
  workspaceShadow: {
    position: 'absolute',
    width: '72%',
    height: 34,
    bottom: 12,
    borderRadius: 999,
    backgroundColor: '#000',
    ...Platform.select({ web: { filter: 'blur(18px)' } as any, default: {} }),
  },
  workspaceShadowCompact: { width: '62%', height: 18, bottom: 5 },
  brandCopy: { maxWidth: 500 },
  brandTitle: { color: COLORS.textPrimary, fontSize: 38, lineHeight: 43, fontWeight: '850' as any, letterSpacing: -1.15 },
  brandDescription: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 9, maxWidth: 430 },
  workspaceLegend: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: SIZES.radiusFull,
    backgroundColor: 'rgba(18,18,13,0.54)',
    borderWidth: 1,
    borderColor: 'rgba(241,217,139,0.13)',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '650' as any },
  legendDivider: { width: 1, height: 16, marginHorizontal: 12, backgroundColor: COLORS.border },
  formPanel: {
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,249,229,0.17)',
    borderRadius: 28,
    backgroundColor: 'rgba(17,18,14,0.69)',
    ...SHADOWS.large,
  },
  formPanelWide: { flex: 0.92, maxWidth: 500 },
  formTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 28,
    right: 28,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  formContent: { paddingHorizontal: 34, paddingTop: 36, paddingBottom: 24 },
  formHeading: { marginBottom: 30 },
  title: { color: COLORS.textPrimary, fontSize: 38, lineHeight: 44, fontWeight: '850' as any, letterSpacing: -1.0 },
  subtitle: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 21, marginTop: 5 },
  messageBox: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.sm, borderWidth: 1, borderRadius: SIZES.radiusSm, padding: 13, marginBottom: SIZES.md },
  errorMessageBox: { borderColor: COLORS.error + '70', backgroundColor: COLORS.error + '10' },
  noticeMessageBox: { borderColor: COLORS.warning + '70', backgroundColor: COLORS.warning + '10' },
  messageText: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontSm, lineHeight: 20 },
  inputContainer: { marginBottom: 18 },
  label: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 8, fontWeight: '700' },
  labelActive: { color: COLORS.goldLight },
  inputWrapper: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  input: { flex: 1, minHeight: 54, paddingVertical: 12, fontSize: 16, color: COLORS.textPrimary },
  passwordVisibilityButton: { width: 44, height: 44, marginRight: -10, alignItems: 'center', justifyContent: 'center' },
  loginButton: {
    minHeight: 55,
    marginTop: 6,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,245,197,0.65)',
    ...SHADOWS.medium,
  },
  loginButtonDisabled: { opacity: 0.58 },
  buttonSheen: { position: 'absolute', top: -30, bottom: -30, width: 74 },
  loginButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  loginButtonText: { fontSize: 16, fontWeight: '850' as any, color: COLORS.textOnGold },
  links: {
    minHeight: 54,
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  linkDivider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: COLORS.border },
  secondaryLink: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '650' as any, textAlign: 'center' },
  primaryLink: { fontSize: 12, color: COLORS.goldLight, fontWeight: '750' as any, textAlign: 'center' },
  accessNote: { minHeight: 42, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  accessNoteText: { flexShrink: 1, color: COLORS.textTertiary, fontSize: 11, lineHeight: 15, textAlign: 'center' },
});
