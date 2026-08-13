import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AuroraBackground from '../components/AuroraBackground';
import GlassCard from '../components/GlassCard';
import NetworkScene3D from '../components/NetworkScene3D';
import GlowButton from '../components/GlowButton';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing, typography } from '../theme';
import { ApiError } from '../api/client';

interface Props {
  onGoSubmit: () => void;
  onGoTrack: () => void;
}

export default function LoginScreen({ onGoSubmit, onGoTrack }: Props) {
  const insets = useSafeAreaInsets();
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
      <AuroraBackground />
      <View style={styles.sceneWrap}>
        <NetworkScene3D />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.formWrap, { paddingBottom: insets.bottom + spacing(6) }]}
      >
        <Text style={styles.brand}>Networking Experts</Text>
        <Text style={styles.tagline}>Staff sign-in</Text>

        <GlassCard>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={[styles.input, { marginBottom: 0 }]}
            placeholder="Password"
            placeholderTextColor={colors.textDim}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </GlassCard>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <GlowButton label="Sign In" onPress={handleLogin} loading={loading} />

        <Text style={styles.guestLink} onPress={onGoSubmit}>
          Not staff? Submit a service request →
        </Text>
        <Text style={styles.guestLink} onPress={onGoTrack}>
          Track an existing request →
        </Text>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  sceneWrap: { flex: 1.1 },
  formWrap: {
    paddingHorizontal: spacing(6),
    paddingTop: spacing(4),
  },
  brand: { ...typography.title, textAlign: 'center' },
  tagline: { ...typography.caption, textAlign: 'center', marginBottom: spacing(5) },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    color: colors.text,
    marginBottom: spacing(3),
    fontSize: 15,
  },
  error: { color: colors.danger, marginBottom: spacing(2), textAlign: 'center' },
  guestLink: {
    ...typography.caption,
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing(4),
  },
});
