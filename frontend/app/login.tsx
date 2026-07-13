import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { COLORS, SIZES, SHADOWS } from '../src/constants/theme';

export default function LoginScreen() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { login: authLogin } = useAuth();
  const router = useRouter();

  const handleLogin = async () => {
    const trimmedLogin = login.trim();
    const trimmedPassword = password.trim();

    setLogin(trimmedLogin);
    setPassword(trimmedPassword);
    setErrorMessage('');

    if (!trimmedLogin || !trimmedPassword) {
      const message = 'Please enter login and password';
      setErrorMessage(message);
      Alert.alert('Error', message);
      return;
    }

    setLoading(true);
    try {
      await authLogin(trimmedLogin, trimmedPassword);
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={[COLORS.background, COLORS.marbleDark]}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo Section */}
          <View style={styles.logoSection}>
            <Image
              source={require('../assets/images/logo.png')}
              style={styles.logoImage}
              resizeMode="cover"
              accessibilityLabel="Nurik's Academy logo"
            />
            <Text style={styles.academyName}>Nurik{"'"}s Academy</Text>
            <Text style={styles.tagline}>Excellence in Education</Text>
          </View>

          {/* Login Form */}
          <View style={styles.formContainer}>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>
            {!!errorMessage && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Login</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your login"
                  placeholderTextColor={COLORS.textTertiary}
                  value={login}
                  onChangeText={setLogin}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor={COLORS.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[COLORS.gold, COLORS.goldDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginButtonGradient}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.background} />
                ) : (
                  <Text style={styles.loginButtonText}>Sign In</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Forgot Password Link */}
            <TouchableOpacity style={styles.forgotPasswordContainer}>
              <Text style={styles.forgotPasswordText}>Forgot your password?</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SIZES.lg,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: SIZES.xxl,
  },
  logoImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: SIZES.md,
    ...SHADOWS.large,
  },
  academyName: {
    fontSize: SIZES.fontXxl,
    fontWeight: 'bold',
    color: COLORS.gold,
    marginBottom: SIZES.xs,
  },
  tagline: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  formContainer: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.lg,
    ...SHADOWS.medium,
  },
  title: {
    fontSize: SIZES.fontXl,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.xs,
  },
  subtitle: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginBottom: SIZES.lg,
  },
  errorBox: {
    backgroundColor: COLORS.error + '18',
    borderColor: COLORS.error,
    borderWidth: 1,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    marginBottom: SIZES.md,
  },
  errorText: {
    color: COLORS.error,
    fontSize: SIZES.fontSm,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: SIZES.md,
  },
  label: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
    marginBottom: SIZES.xs,
    fontWeight: '600',
  },
  inputWrapper: {
    backgroundColor: COLORS.backgroundLight,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: COLORS.marbleGray,
  },
  input: {
    padding: SIZES.md,
    fontSize: SIZES.fontMd,
    color: COLORS.textPrimary,
  },
  loginButton: {
    borderRadius: SIZES.radiusMd,
    overflow: 'hidden',
    marginTop: SIZES.md,
    ...SHADOWS.medium,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonGradient: {
    padding: SIZES.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: SIZES.touchTarget,
  },
  loginButtonText: {
    fontSize: SIZES.fontLg,
    fontWeight: 'bold',
    color: COLORS.background,
  },
  forgotPasswordContainer: {
    marginTop: SIZES.lg,
    alignItems: 'center',
  },
  forgotPasswordText: {
    fontSize: SIZES.fontSm,
    color: COLORS.textSecondary,
  },
});
