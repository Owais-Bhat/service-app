import React, { useState } from 'react';
import { KeyboardTypeOptions, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlassCard from './GlassCard';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';

// Building blocks shared by the guest (customer-facing) flows — request
// wizard, tracking, complaint and staff sign-in — so every form matches the
// design's guest field: 52 dp, r14, --bd on --p2, accent border on focus.

export type GlyphName = React.ComponentProps<typeof Ionicons>['name'];

interface InputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  required?: boolean;
  /** Renders a muted "(optional)" after the label. */
  optional?: boolean;
  multiline?: boolean;
  /** Minimum height of a multiline box (default 84). */
  minHeight?: number;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secure?: boolean;
  /** JetBrains Mono — tickets, phone numbers. */
  mono?: boolean;
  /** Fixed leading text such as "+91", followed by a divider. */
  prefix?: string;
  leadingIcon?: GlyphName;
  /** Anything on the right inside the box (e.g. the show-password toggle). */
  trailing?: React.ReactNode;
  hint?: string;
  error?: string;
  /** Right-aligned character counter under the box. */
  counter?: string;
  maxLength?: number;
  returnKeyType?: TextInputProps['returnKeyType'];
}

export function GuestInput({
  label, value, onChangeText, placeholder, required, optional, multiline, minHeight = 84, keyboardType, autoCapitalize,
  secure, mono, prefix, leadingIcon, trailing, hint, error, counter, maxLength, returnKeyType,
}: InputProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const family = mono ? 'JetBrainsMono_500Medium' : 'Manrope_500Medium';
  return (
    <View>
      {label ? (
        <Text style={[styles.label, { color: theme.text2 }]}>
          {label}
          {required ? <Text style={{ color: theme.err }}> *</Text> : null}
          {optional ? <Text style={{ color: theme.text3, fontFamily: 'Manrope_500Medium' }}> (optional)</Text> : null}
        </Text>
      ) : null}
      <View
        style={[
          styles.box,
          multiline && { minHeight, alignItems: 'flex-start', paddingVertical: spacing(3) },
          {
            backgroundColor: theme.panel2,
            borderColor: error ? theme.err : focused ? theme.accent : theme.border,
            borderWidth: error || focused ? 1.5 : 1,
          },
        ]}
      >
        {leadingIcon ? <Ionicons name={leadingIcon} size={18} color={theme.text3} /> : null}
        {prefix ? (
          <>
            <Text style={[styles.prefix, { color: theme.text2 }]}>{prefix}</Text>
            <View style={[styles.divider, { backgroundColor: theme.line }]} />
          </>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.text3}
          multiline={multiline}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secure}
          maxLength={maxLength}
          returnKeyType={returnKeyType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[
            styles.input,
            { color: theme.text, fontFamily: family, fontSize: mono ? 16 : 15, letterSpacing: mono && prefix ? 0.5 : 0 },
            multiline && { minHeight: minHeight - spacing(6), paddingTop: 0 },
          ]}
        />
        {trailing}
      </View>
      {error ? <FieldError text={error} /> : null}
      {hint && !error ? <Text style={[styles.hint, { color: theme.text3 }]}>{hint}</Text> : null}
      {counter ? <Text style={[styles.counter, { color: theme.text3 }]}>{counter}</Text> : null}
    </View>
  );
}

// Inline validation / server message: alert glyph + error-hue text.
export function FieldError({ text }: { text: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.errorRow}>
      <Ionicons name="alert-circle-outline" size={16} color={theme.err} />
      <Text style={[styles.errorText, { color: theme.err }]}>{text}</Text>
    </View>
  );
}

// Quiet explanatory note on --p2 (privacy line, SMS autofill hint…).
export function InfoNote({ icon, text, tone = 'neutral' }: { icon: GlyphName; text: string; tone?: 'neutral' | 'info' }) {
  const { theme } = useTheme();
  const info = tone === 'info';
  return (
    <View style={[styles.note, { backgroundColor: info ? theme.infoS : theme.panel2 }]}>
      <Ionicons name={icon} size={16} color={info ? theme.info : theme.text3} />
      <Text style={[styles.noteText, { color: info ? theme.info : theme.text2, fontFamily: info ? 'Manrope_600SemiBold' : 'Manrope_500Medium' }]}>{text}</Text>
    </View>
  );
}

// 44 dp secondary action on the solid panel — Copy, Share, Call, WhatsApp.
export function ActionButton({ label, icon, onPress, color }: { label: string; icon?: GlyphName; onPress: () => void; color?: string }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.action, { backgroundColor: theme.panel, borderColor: theme.border }, pressed && { opacity: 0.75 }]}
    >
      {icon ? <Ionicons name={icon} size={16} color={color ?? theme.text} /> : null}
      <Text style={[styles.actionLabel, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

// Glass hero card at the design's 20 dp padding (GlassCard's own is 16).
export function GuestCard({ children, padding = 20 }: { children: React.ReactNode; padding?: number }) {
  return (
    <GlassCard>
      <View style={{ padding: padding - spacing(4) }}>{children}</View>
    </GlassCard>
  );
}

// Heading + supporting line that opens every guest card.
export function CardHeader({ title, body }: { title: string; body?: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View>
      <Text style={[typography.heading, { color: theme.text }]}>{title}</Text>
      {body ? <Text style={[styles.cardBody, { color: theme.text2 }]}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, marginBottom: spacing(1.5) },
  box: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), minHeight: 52, borderRadius: radius.md, paddingHorizontal: spacing(3.5) },
  prefix: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 15 },
  divider: { width: 1, height: 22 },
  input: { flex: 1, paddingVertical: spacing(2) },
  hint: { ...typography.supporting, fontSize: 12, lineHeight: 16, marginTop: spacing(1.5) },
  counter: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12, textAlign: 'right', marginTop: spacing(1) },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginTop: spacing(1.5) },
  errorText: { ...typography.caption, flex: 1 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2), borderRadius: radius.sm, paddingVertical: spacing(2.5), paddingHorizontal: spacing(3) },
  noteText: { flex: 1, fontSize: 12, lineHeight: 16 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 44, borderRadius: radius.sm, borderWidth: 1 },
  actionLabel: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  cardBody: { ...typography.supporting, marginTop: spacing(1) },
});
