import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
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

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    setError(null);
    setLoading(true);
    try {
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.formWrap, { paddingBottom: insets.bottom + spacing(6) }]}
      >
        <Text style={styles.link} onPress={onBack}>← Back</Text>
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
          <TextInput
            style={[styles.input, { color: theme.text, marginBottom: 0 }]}
            placeholder="Password"
            placeholderTextColor={theme.text3}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </GlassCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <GlowButton label="Sign In" onPress={handleLogin} loading={loading} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sceneWrap: { flex: 1.1 },
  formWrap: { paddingHorizontal: spacing(6), paddingTop: spacing(4) },
  link: { ...typography.caption, color: brand.primary, marginBottom: spacing(3) },
  brand: { ...typography.title, textAlign: 'center' },
  tagline: { ...typography.caption, textAlign: 'center', marginBottom: spacing(5) },
  input: { ...typography.body, borderRadius: radius.md, paddingHorizontal: spacing(4), paddingVertical: spacing(3), marginBottom: spacing(3) },
  error: { ...typography.caption, color: brand.danger, marginBottom: spacing(2), textAlign: 'center' },
});
