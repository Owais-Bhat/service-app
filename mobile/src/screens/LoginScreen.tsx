import React, { useState, useEffect } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import Animated, { FadeInUp } from 'react-native-reanimated';
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

const CARD_MAX_WIDTH = 420;

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
          <View style={styles.centerCol}>
            <Animated.View entering={FadeInUp.duration(550)} style={styles.brandBlock}>
              <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
              <View style={styles.taglineBadge}>
                <View style={styles.taglineDot} />
                <Text style={styles.tagline}>Staff sign-in</Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(100).duration(550)} style={styles.cardWrap}>
              <GlassCard shadow>
                <View style={[styles.fieldWrap, { borderColor: theme.line }]}>
                  <Icon name="mail" size={16} color={theme.text3} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="Email"
                    placeholderTextColor={theme.text3}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>
                <View style={[styles.fieldWrap, styles.fieldWrapLast]}>
                  <Icon name="lock" size={16} color={theme.text3} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder="Password"
                    placeholderTextColor={theme.text3}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                    <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} color={theme.text3} />
                  </Pressable>
                </View>
              </GlassCard>

              {error ? (
                <View style={styles.errorPill}>
                  <Text style={styles.error}>{error}</Text>
                </View>
              ) : null}

              <GlowButton label="Sign In" onPress={handleLogin} loading={loading} icon="arrow-right" />
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sceneWrap: { ...StyleSheet.absoluteFill },
  backButtonWrap: { position: 'absolute', left: spacing(6), zIndex: 10 },
  formWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing(6) },
  centerCol: { width: '100%', maxWidth: CARD_MAX_WIDTH, alignItems: 'center' },
  brandBlock: { alignItems: 'center', marginBottom: spacing(7) },
  logo: { width: 168, height: 80, marginBottom: spacing(3) },
  taglineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(1.75),
    borderRadius: radius.full,
    backgroundColor: 'rgba(21,160,90,0.14)',
  },
  taglineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: brand.primary },
  tagline: { ...typography.caption, color: brand.primary, fontSize: 12 },
  cardWrap: { width: '100%' },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    borderBottomWidth: 1,
    borderColor: 'transparent',
    paddingBottom: spacing(3),
    marginBottom: spacing(3),
  },
  fieldWrapLast: { borderBottomWidth: 0, paddingBottom: 0, marginBottom: 0 },
  input: { ...typography.body, flex: 1, paddingVertical: spacing(1) },
  errorPill: { alignSelf: 'center', marginTop: spacing(3) },
  error: { ...typography.caption, color: brand.danger, textAlign: 'center' },
});
