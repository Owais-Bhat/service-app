import React, { useState, useEffect } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import BackLink from '../components/BackLink';
import Icon from '../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import NetworkScene3D from '../components/NetworkScene3D';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { ApiError } from '../api/client';

interface Props {
  onBack: () => void;
}

// No longer the guest stack's root — Landing is (design spec §5), reached
// via its "Staff Login" button. The old "Not staff? Submit a request /
// Track a request" shortcut links are gone: Landing offers those at the
// top level now, and NEST's own staff-login screen doesn't have them.
export default function LoginScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const loadCreds = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('saved_email');
        const savedPassword = await SecureStore.getItemAsync('saved_password');
        if (savedEmail) setEmail(savedEmail);
        if (savedPassword) setPassword(savedPassword);
      } catch (e) {
        console.log('Error loading credentials', e);
      }
    };
    loadCreds();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await AsyncStorage.setItem('saved_email', email.trim());
      await SecureStore.setItemAsync('saved_password', password);
      await login(email.trim(), password);
    } catch (err) {
      console.log('Login error:', err);
      setError(err instanceof ApiError ? err.message : 'Could not sign in — check your connection');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <View style={styles.sceneWrap}>
        <NetworkScene3D />
      </View>

      <View style={[styles.backButtonWrap, { top: insets.top + spacing(2) }]}>
        <BackLink onPress={onBack} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.root}
      >
        <ScrollView 
          contentContainerStyle={[styles.formWrap, { paddingBottom: insets.bottom + spacing(6) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.brand, { color: theme.text }]}>NEST</Text>
          <Text style={[styles.tagline, { color: theme.text3 }]}>Staff sign-in</Text>

          <GlassCard>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Email"
              placeholderTextColor={theme.text3}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <View style={styles.passwordWrap}>
              <TextInput
                style={[styles.input, styles.passwordInput, { color: theme.text, marginBottom: 0 }]}
                placeholder="Password"
                placeholderTextColor={theme.text3}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <Pressable style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} color={theme.text3} />
              </Pressable>
            </View>
          </GlassCard>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <GlowButton label="Sign In" onPress={handleLogin} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sceneWrap: { ...StyleSheet.absoluteFill },
  backButtonWrap: { position: 'absolute', left: spacing(6), zIndex: 10 },
  formWrap: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing(6) },
  brand: { ...typography.title, textAlign: 'center' },
  tagline: { ...typography.caption, textAlign: 'center', marginBottom: spacing(5) },
  input: { ...typography.body, borderRadius: radius.md, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(3) },
  passwordWrap: { justifyContent: 'center' },
  passwordInput: { paddingRight: spacing(14) },
  eyeButton: { position: 'absolute', right: spacing(4) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(2), textAlign: 'center' },
});
