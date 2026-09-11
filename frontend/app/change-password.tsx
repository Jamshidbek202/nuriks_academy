import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text, TextInput } from '../src/components/LocalizedText';
import { ConcourseAtmosphere } from '../src/components/ConcourseAtmosphere';
import { useAuth } from '../src/contexts/AuthContext';
import { api, apiErrorMessage } from '../src/services/api';
import { COLORS, SIZES } from '../src/constants/theme';

export default function ChangePasswordScreen() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={COLORS.gold} /></View>;
  if (!user) return <Redirect href="/login" />;
  if (!user.must_change_password) return <Redirect href="/(dashboard)" />;

  const submit = async () => {
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/password/change', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      await logout();
      router.replace('/login');
    } catch (requestError) {
      setError(apiErrorMessage(requestError, 'Could not change password'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ConcourseAtmosphere />
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="key-outline" size={28} color={COLORS.goldLight} />
        </View>
        <Text style={styles.title}>Choose your password</Text>
        <Text style={styles.subtitle}>Your temporary password can only be used to complete this step.</Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <TextInput testID="managed-current-password" style={styles.input} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry={!visible} placeholder="Temporary password" placeholderTextColor={COLORS.textTertiary} autoCapitalize="none" />
        <TextInput testID="managed-new-password" style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry={!visible} placeholder="New password" placeholderTextColor={COLORS.textTertiary} autoCapitalize="none" />
        <TextInput testID="managed-confirm-password" style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!visible} placeholder="Repeat new password" placeholderTextColor={COLORS.textTertiary} autoCapitalize="none" />
        <TouchableOpacity style={styles.visibility} onPress={() => setVisible((value) => !value)}>
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={19} color={COLORS.textSecondary} />
          <Text style={styles.visibilityText}>{visible ? 'Hide passwords' : 'Show passwords'}</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="managed-password-submit" style={styles.button} disabled={saving} onPress={submit}>
          {saving ? <ActivityIndicator color={COLORS.textOnGold} /> : <Text style={styles.buttonText}>Save and sign in again</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SIZES.lg, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  card: { width: '100%', maxWidth: 520, padding: SIZES.xl, borderRadius: 28, backgroundColor: 'rgba(22,23,19,0.92)', borderWidth: 1, borderColor: COLORS.borderStrong, gap: SIZES.md },
  icon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(211,177,77,0.12)' },
  title: { color: COLORS.textPrimary, fontSize: 30, fontWeight: '800' },
  subtitle: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: SIZES.sm },
  error: { color: COLORS.error, fontSize: 14 },
  input: { minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: 'rgba(5,7,5,0.74)', color: COLORS.textPrimary, paddingHorizontal: SIZES.md, fontSize: 16 },
  visibility: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 38 },
  visibilityText: { color: COLORS.textSecondary, fontWeight: '600' },
  button: { minHeight: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gold, marginTop: SIZES.sm },
  buttonText: { color: COLORS.textOnGold, fontSize: 16, fontWeight: '800' },
});
