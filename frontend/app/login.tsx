import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
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
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/**
 * Direction contract — Login / Operate
 * A quiet academy workspace floats inside the established black-and-gold world;
 * the authentication sheet is the only dominant glass surface. Desktop shows
 * brand context beside the task, while mobile compresses the same scene above
 * a full-width form without cropping the artwork or hiding the primary action.
 */
function WorkspaceScene({ compact }: { compact: boolean }) {
  const { reduceMotion, ready } = useMotionPreference();
  const settle = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(settle);
    if (!ready) return;
    if (reduceMotion) {
      settle.set(withTiming(1, { duration: 170, easing: EASE_OUT }));
      return;
    }

    settle.set(0);
    settle.set(withDelay(70, withTiming(1, { duration: 480, easing: EASE_OUT })));
    return () => cancelAnimation(settle);
  }, [ready, reduceMotion, settle]);

  const shadowMotion = useAnimatedStyle(() => ({
    opacity: interpolate(settle.get(), [0, 1], [0.12, 0.28]),
    transform: [{ scaleX: interpolate(settle.get(), [0, 1], [0.86, 1]) }],
  }));
  const haloMotion = useAnimatedStyle(() => ({
    opacity: reduceMotion
      ? 0.1
      : interpolate(settle.get(), [0, 0.58, 1], [0, 0.26, 0.1]),
    transform: [{ scale: reduceMotion ? 1 : interpolate(settle.get(), [0, 0.58, 1], [0.72, 1.08, 1]) }],
  }), [reduceMotion]);
  const artworkMotion = useAnimatedStyle(() => ({
    opacity: interpolate(settle.get(), [0, 1], [0.72, 1]),
    transform: [
      { translateY: reduceMotion ? 0 : interpolate(settle.get(), [0, 1], [14, 0]) },
      { scale: reduceMotion ? 1 : interpolate(settle.get(), [0, 1], [0.955, 1]) },
      { rotate: `${reduceMotion ? 0 : interpolate(settle.get(), [0, 1], [-1.15, 0])}deg` },
    ],
  }), [reduceMotion]);

  return (
    <View style={[styles.workspaceScene, compact && styles.workspaceSceneCompact]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.workspaceHalo,
          compact && styles.workspaceHaloCompact,
          haloMotion,
        ]}
      >
        <LinearGradient
          colors={['rgba(245,219,127,0.48)', 'rgba(191,142,38,0.13)', 'rgba(191,142,38,0)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.workspaceShadow,
          compact && styles.workspaceShadowCompact,
          shadowMotion,
        ]}
      />
      <Animated.View
        style={[
          styles.workspaceArtwork,
          compact && styles.workspaceArtworkCompact,
          artworkMotion,
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
  const focus = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    cancelAnimation(focus);
    if (!ready || reduceMotion) {
      focus.set(active ? 1 : 0);
      return;
    }
    focus.set(withTiming(active ? 1 : 0, { duration: MOTION.state, easing: EASE_IN_OUT }));
    return () => cancelAnimation(focus);
  }, [active, focus, ready, reduceMotion]);

  const focusMotion = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.get(), [0, 1], [COLORS.borderStrong, COLORS.goldLight]),
    backgroundColor: interpolateColor(focus.get(), [0, 1], ['rgba(8,10,8,0.72)', 'rgba(19,18,11,0.84)']),
  }));

  return (
    <Animated.View
      style={[
        styles.inputWrapper,
        focusMotion,
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
  const {
    user,
    isLoading: authIsLoading,
    login: authLogin,
    sessionNotice,
    clearSessionNotice,
  } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const { reduceMotion, ready: motionReady } = useMotionPreference();
  const { width, height } = useWindowDimensions();
  const isWide = width >= 920;
  const isCompact = width < 600;
  const shortViewport = height < 760;
  const sceneEntrance = useSharedValue(0);
  const formEntrance = useSharedValue(0);
  const formContentEntrance = useSharedValue(0);
  const sheen = useSharedValue(0);
  const logoSheen = useSharedValue(0);
  const panelSheen = useSharedValue(0);

  useEffect(() => {
    if (!authIsLoading && user) {
      router.replace((user.must_change_password ? '/change-password' : '/(dashboard)') as any);
    }
  }, [authIsLoading, router, user]);

  useEffect(() => {
    cancelAnimation(sceneEntrance);
    cancelAnimation(formEntrance);
    cancelAnimation(formContentEntrance);
    cancelAnimation(sheen);
    cancelAnimation(logoSheen);
    cancelAnimation(panelSheen);
    if (!motionReady) return;

    if (reduceMotion) {
      sceneEntrance.set(0.88);
      formEntrance.set(0.9);
      formContentEntrance.set(0.88);
      sheen.set(1);
      logoSheen.set(1);
      panelSheen.set(1);
      sceneEntrance.set(withTiming(1, { duration: 170, easing: EASE_OUT }));
      formEntrance.set(withTiming(1, { duration: 170, easing: EASE_OUT }));
      formContentEntrance.set(withTiming(1, { duration: 170, easing: EASE_OUT }));
      return;
    }

    sceneEntrance.set(0);
    formEntrance.set(0);
    formContentEntrance.set(0);
    sheen.set(0);
    logoSheen.set(0);
    panelSheen.set(0);
    sceneEntrance.set(withTiming(1, { duration: 440, easing: EASE_OUT }));
    formEntrance.set(withDelay(120, withTiming(1, { duration: 420, easing: EASE_OUT })));
    formContentEntrance.set(withDelay(230, withTiming(1, { duration: 300, easing: EASE_OUT })));
    logoSheen.set(withDelay(170, withTiming(1, { duration: 520, easing: EASE_IN_OUT })));
    panelSheen.set(withDelay(250, withTiming(1, { duration: 780, easing: EASE_IN_OUT })));
    sheen.set(withDelay(470, withTiming(1, { duration: 640, easing: EASE_OUT })));

    return () => {
      cancelAnimation(sceneEntrance);
      cancelAnimation(formEntrance);
      cancelAnimation(formContentEntrance);
      cancelAnimation(sheen);
      cancelAnimation(logoSheen);
      cancelAnimation(panelSheen);
    };
  }, [formContentEntrance, formEntrance, logoSheen, motionReady, panelSheen, reduceMotion, sceneEntrance, sheen]);

  const handleLogin = async () => {
    const isStudentId = /^NA-\d+$/i.test(phone.trim());
    const identity = isStudentId ? phone.trim().toLowerCase() : normalizeUzbekPhone(phone);
    if (!isStudentId) setPhone(formatUzbekPhoneInput(phone));
    setErrorMessage('');
    clearSessionNotice();

    if ((!isStudentId && !isCompleteUzbekPhone(phone)) || !password) {
      setErrorMessage((!isStudentId && !isCompleteUzbekPhone(phone))
        ? t('Enter a complete phone number or student ID')
        : t('Please enter login and password'));
      return;
    }

    setLoading(true);
    try {
      await authLogin(identity, password);
    } catch (error: any) {
      setErrorMessage(error.message || t('Invalid login or password'));
    } finally {
      setLoading(false);
    }
  };

  const sceneMotion = useAnimatedStyle(() => ({
    opacity: interpolate(sceneEntrance.get(), [0, 1], [0.7, 1]),
    transform: isWide
      ? [
        { translateX: reduceMotion ? 0 : interpolate(sceneEntrance.get(), [0, 1], [-14, 0]) },
        { scale: reduceMotion ? 1 : interpolate(sceneEntrance.get(), [0, 1], [0.985, 1]) },
      ]
      : [
        { translateY: reduceMotion ? 0 : interpolate(sceneEntrance.get(), [0, 1], [9, 0]) },
        { scale: reduceMotion ? 1 : interpolate(sceneEntrance.get(), [0, 1], [0.985, 1]) },
      ],
  }), [isWide, reduceMotion]);
  const formMotion = useAnimatedStyle(() => {
    const value = formEntrance.get();
    return {
      opacity: interpolate(value, [0, 1], [0.7, 1]),
      transform: isWide
        ? [
          { translateX: reduceMotion ? 0 : interpolate(value, [0, 1], [18, 0]) },
          { scale: reduceMotion ? 1 : interpolate(value, [0, 1], [0.985, 1]) },
        ]
        : [
          { translateY: reduceMotion ? 0 : interpolate(value, [0, 1], [14, 0]) },
          { scale: reduceMotion ? 1 : interpolate(value, [0, 1], [0.985, 1]) },
        ],
    };
  }, [isWide, reduceMotion]);
  const formContentMotion = useAnimatedStyle(() => ({
    opacity: interpolate(formContentEntrance.get(), [0, 1], [0.76, 1]),
    transform: [{ translateY: reduceMotion ? 0 : interpolate(formContentEntrance.get(), [0, 1], [8, 0]) }],
  }), [reduceMotion]);
  const panelHighlightMotion = useAnimatedStyle(() => ({
    opacity: interpolate(formEntrance.get(), [0, 1], [0, 1]),
    transform: [{ scaleX: interpolate(formEntrance.get(), [0, 1], [0.3, 1]) }],
  }));
  const sheenMotion = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(sheen.get(), [0, 1], [-260, 540]) },
      { rotate: '-14deg' },
    ],
  }));
  const logoSheenMotion = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : interpolate(logoSheen.get(), [0, 0.16, 0.82, 1], [0, 0.75, 0.75, 0]),
    transform: [
      { translateX: interpolate(logoSheen.get(), [0, 1], [-58, 64]) },
      { rotate: '-16deg' },
    ],
  }), [reduceMotion]);
  const panelSheenMotion = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : interpolate(panelSheen.get(), [0, 0.16, 0.84, 1], [0, 0.42, 0.42, 0]),
    transform: [
      { translateX: interpolate(panelSheen.get(), [0, 1], [-180, isWide ? 680 : 540]) },
      { rotate: '-12deg' },
    ],
  }), [isWide, reduceMotion]);
  const arrowMotion = useAnimatedStyle(() => ({
    transform: [{ translateX: reduceMotion ? 0 : interpolate(sheen.get(), [0, 0.62, 1], [0, 4, 0]) }],
  }), [reduceMotion]);

  if (authIsLoading || user) {
    return (
      <View style={[styles.container, styles.sessionGate]} testID="login-session-gate">
        <ConcourseAtmosphere />
        <ActivityIndicator
          size="large"
          color={COLORS.gold}
          accessibilityLabel={t('Loading...')}
        />
      </View>
    );
  }

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
                sceneMotion,
              ]}
            >
              <View style={[styles.brandRow, isCompact && styles.brandRowCompact]}>
                <View style={[styles.logoWell, isCompact && styles.logoWellCompact]}>
                  <Image
                    source={require('../assets/images/logo.png')}
                    style={[styles.logo, isCompact && styles.logoCompact]}
                    resizeMode="contain"
                    accessibilityLabel="Nurik's Academy logo"
                  />
                  <AnimatedLinearGradient
                    pointerEvents="none"
                    colors={['rgba(255,255,255,0)', 'rgba(255,246,210,0.52)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.logoSheen, logoSheenMotion]}
                  />
                </View>
                <View style={styles.brandIdentity}>
                  <Text style={[styles.academyName, isCompact && styles.academyNameCompact]}>Nurik&apos;s Academy</Text>
                  <Text style={[styles.systemName, isCompact && styles.systemNameCompact]}>{t('Academy management system')}</Text>
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
                isCompact && styles.formPanelCompact,
                formMotion,
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
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(247,218,119,0.13)', 'rgba(247,218,119,0.025)', 'rgba(247,218,119,0)']}
                locations={[0, 0.48, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.78, y: 0.72 }}
                style={styles.panelAmbientGlow}
              />
              <AnimatedLinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0)', 'rgba(255,248,219,0.12)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.panelSheen, panelSheenMotion]}
              />
              <Animated.View pointerEvents="none" style={[styles.formTopHighlight, panelHighlightMotion]} />

              <Animated.View style={[styles.formContent, isCompact && styles.formContentCompact, formContentMotion]}>
                <View style={[styles.formHeading, isCompact && styles.formHeadingCompact]}>
                  <Text style={[styles.title, isCompact && styles.titleCompact]}>{t('Welcome Back')}</Text>
                  <Text style={[styles.subtitle, isCompact && styles.subtitleCompact]}>{t('Sign in to continue')}</Text>
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

                <View style={[styles.inputContainer, isCompact && styles.inputContainerCompact]}>
                  <Text style={[styles.label, phoneFocused && styles.labelActive]}>{t('Phone number or student ID')}</Text>
                  <FieldShell active={phoneFocused} icon="call-outline">
                    <TextInput
                      testID={LOGIN.phoneInput}
                      style={styles.input}
                      placeholder="+998 90 123 45 67"
                      placeholderTextColor={COLORS.textTertiary}
                      value={phone}
                      onChangeText={(value) => setPhone(/[A-Za-z-]/.test(value) ? value : formatUzbekPhoneInput(value))}
                      onFocus={() => setPhoneFocused(true)}
                      onBlur={() => setPhoneFocused(false)}
                      keyboardType="default"
                      textContentType="username"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                    />
                  </FieldShell>
                </View>

                <View style={[styles.inputContainer, isCompact && styles.inputContainerCompact]}>
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
                    style={[styles.buttonSheen, sheenMotion]}
                  />
                  {loading
                    ? <ActivityIndicator color={COLORS.textOnGold} />
                    : (
                      <View style={styles.loginButtonContent}>
                        <Text style={styles.loginButtonText}>{t('Sign In')}</Text>
                        <Animated.View style={arrowMotion}>
                          <Ionicons name="arrow-forward" size={18} color={COLORS.textOnGold} />
                        </Animated.View>
                      </View>
                    )}
                </MotionTouchableOpacity>

                <View style={styles.links}>
                  <TouchableOpacity
                    testID={LOGIN.forgotPasswordLink}
                    style={styles.linkButton}
                    onPress={() => setErrorMessage(t('Ask an administrator or manager to reset your password.'))}
                  >
                    <Text style={styles.secondaryLink}>{t('Forgot your password?')}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.accessNote}>
                  <Ionicons name="shield-checkmark-outline" size={17} color={COLORS.textTertiary} />
                  <Text style={styles.accessNoteText}>{t('Access is limited to approved Nurik’s Academy accounts')}</Text>
                </View>
              </Animated.View>
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
  sessionGate: { alignItems: 'center', justifyContent: 'center' },
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
  scrollContentCompact: { justifyContent: 'flex-start', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 22 },
  scrollContentShort: { justifyContent: 'flex-start' },
  shell: { width: '100%', maxWidth: 540, alignSelf: 'center' },
  shellWide: { maxWidth: 1180, minHeight: 660, flexDirection: 'row', alignItems: 'center', gap: 64 },
  brandPanel: { position: 'relative' },
  brandPanelWide: { flex: 1.08, minWidth: 0, justifyContent: 'space-between', paddingVertical: 12 },
  brandPanelCompact: { width: '100%', paddingHorizontal: 4, marginBottom: 8 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  brandRowCompact: { gap: 10 },
  logoWell: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,248,220,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(241,217,139,0.20)',
    overflow: 'hidden',
  },
  logoWellCompact: { width: 42, height: 42, borderRadius: 14 },
  logoSheen: { position: 'absolute', top: -12, bottom: -12, width: 20 },
  brandIdentity: { flex: 1 },
  logo: { width: 39, height: 39, flexShrink: 0 },
  logoCompact: { width: 34, height: 34 },
  academyName: { color: COLORS.textPrimary, fontSize: 21, lineHeight: 25, fontWeight: '800', letterSpacing: -0.45 },
  academyNameCompact: { fontSize: 18, lineHeight: 22, letterSpacing: -0.32 },
  systemName: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 1 },
  systemNameCompact: { fontSize: 10.5, lineHeight: 14 },
  workspaceScene: { height: 338, width: '100%', justifyContent: 'center', alignItems: 'center', marginVertical: 20 },
  workspaceSceneCompact: { height: 126, marginTop: 18, marginBottom: 18 },
  workspaceHalo: {
    position: 'absolute',
    width: '68%',
    height: '58%',
    borderRadius: 999,
    overflow: 'hidden',
    ...Platform.select({ web: { filter: 'blur(24px)' } as any, default: {} }),
  },
  workspaceHaloCompact: { width: '50%', height: '58%' },
  workspaceArtwork: { width: '100%', height: '100%', maxWidth: 610 },
  workspaceArtworkCompact: { maxWidth: 246 },
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
  workspaceShadowCompact: { width: '52%', height: 14, bottom: 3 },
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
  formPanelCompact: { borderRadius: 24 },
  panelAmbientGlow: {
    position: 'absolute',
    top: -1,
    left: -1,
    width: '74%',
    height: 190,
  },
  panelSheen: { position: 'absolute', top: -110, bottom: -110, width: 132 },
  formTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 28,
    right: 28,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  formContent: { paddingHorizontal: 34, paddingTop: 36, paddingBottom: 24 },
  formContentCompact: { paddingHorizontal: 24, paddingTop: 26, paddingBottom: 17 },
  formHeading: { marginBottom: 30 },
  formHeadingCompact: { marginBottom: 22 },
  title: { color: COLORS.textPrimary, fontSize: 38, lineHeight: 44, fontWeight: '850' as any, letterSpacing: -1.0 },
  titleCompact: { fontSize: 30, lineHeight: 35, letterSpacing: -0.7 },
  subtitle: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 21, marginTop: 5 },
  subtitleCompact: { fontSize: 14, lineHeight: 19, marginTop: 3 },
  messageBox: { flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.sm, borderWidth: 1, borderRadius: SIZES.radiusSm, padding: 13, marginBottom: SIZES.md },
  errorMessageBox: { borderColor: COLORS.error + '70', backgroundColor: COLORS.error + '10' },
  noticeMessageBox: { borderColor: COLORS.warning + '70', backgroundColor: COLORS.warning + '10' },
  messageText: { flex: 1, color: COLORS.textPrimary, fontSize: SIZES.fontSm, lineHeight: 20 },
  inputContainer: { marginBottom: 18 },
  inputContainerCompact: { marginBottom: 15 },
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
