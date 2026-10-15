import React, { useState, useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlowButton from '../components/GlowButton';
import { GuestInput } from '../components/GuestFields';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { ApiError } from '../api/client';

interface Props {
  onBack: () => void;
}

const FORM_MAX_WIDTH = 520;

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
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing(2), paddingBottom: insets.bottom + spacing(6) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <Animated.View entering={FadeInUp.duration(550)}>
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back to customer service"
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={20} color={theme.text2} />
              <Text style={[styles.backText, { color: theme.text2 }]}>Customer service</Text>
            </Pressable>
            <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
            <Text style={[typography.title, { color: theme.text }]}>Staff sign-in</Text>
            <Text style={[typography.body, styles.subcopy, { color: theme.text2 }]}>
              For Networking Experts technicians, team leads and office staff.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(100).duration(550)} style={styles.fields}>
            <GuestInput
              label="Email"
              leadingIcon="person-outline"
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <GuestInput
              label="Password"
              leadingIcon="lock-closed-outline"
              placeholder="Password"
              secure={!showPassword}
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              error={error ?? undefined}
              trailing={
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  style={styles.eyeBtn}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.text2} />
                </Pressable>
              }
            />
          </Animated.View>

          <View style={styles.spacer} />

          <GlowButton label="Sign in" onPress={handleLogin} loading={loading} />
          <Text style={[styles.footnote, { color: theme.text3 }]}>
            Customers don&apos;t need an account. Staff accounts are created by the office.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: spacing(6) },
  column: { flexGrow: 1, width: '100%', maxWidth: FORM_MAX_WIDTH },
  backBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing(1), height: 44, paddingRight: spacing(2.5), marginLeft: -6 },
  backText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  logo: { width: 117, height: 56, marginTop: spacing(7), marginBottom: spacing(2), marginLeft: -10 },
  subcopy: { marginTop: 6, marginBottom: spacing(6) },
  fields: { gap: 14 },
  eyeBtn: { width: 44, height: 44, marginRight: -spacing(2), alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1, minHeight: spacing(6) },
  footnote: { ...typography.supporting, fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: spacing(3.5) },
});
