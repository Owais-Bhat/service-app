import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, categoryColors, statusColors, DEFAULT_CATEGORY_STYLE, DEFAULT_STATUS_STYLE, TECH_STATUS_ORDER } from '../theme/tokens';
import { fetchTicketDetail, updateTicketStatus, TicketDetail } from '../api/tickets';

interface Props {
  ticketId: string;
  onBack: () => void;
}

type TechStatus = (typeof TECH_STATUS_ORDER)[number];

export default function TaskDetailScreen({ ticketId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await fetchTicketDetail(ticketId);
      setTicket(t);
      setError(t ? null : 'Ticket not found');
    } catch {
      setError('Could not load this task — check your connection');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  const advance = async () => {
    if (!ticket) return;
    const idx = TECH_STATUS_ORDER.indexOf(ticket.status as TechStatus);
    if (idx < 0 || idx >= TECH_STATUS_ORDER.length - 1) return;
    const next = TECH_STATUS_ORDER[idx + 1];
    setAdvancing(true);
    try {
      await updateTicketStatus(ticket.id, next);
      setTicket({ ...ticket, status: next });
      setError(null);
    } catch {
      setError('Could not update status — check your connection');
    } finally {
      setAdvancing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <View style={styles.centered}>
          <ActivityIndicator color={brand.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <Text style={[styles.body, { color: theme.text }]}>{error || 'Ticket not found'}</Text>
          <BackLink onPress={onBack} />
        </View>
      </View>
    );
  }

  const statusIdx = TECH_STATUS_ORDER.indexOf(ticket.status as TechStatus);
  const isTechStatus = statusIdx >= 0;
  const statusStyle = statusColors[ticket.status] || DEFAULT_STATUS_STYLE;
  const categoryStyle = categoryColors[ticket.category] || DEFAULT_CATEGORY_STYLE;
  const contact = ticket.inquiries?.[0];
  const canAdvance = isTechStatus && statusIdx < TECH_STATUS_ORDER.length - 1;
  const advanceLabel = !isTechStatus
    ? null
    : statusIdx >= TECH_STATUS_ORDER.length - 1
      ? 'Job Resolved'
      : `Mark as ${(statusColors[TECH_STATUS_ORDER[statusIdx + 1]] || DEFAULT_STATUS_STYLE).label}`;

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5) }}>
        <BackLink onPress={onBack} />

        <GlassCard>
          <View style={styles.headerRow}>
            <Text style={styles.ticketId}>{ticket.id.slice(0, 8).toUpperCase()}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
            </View>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{ticket.title}</Text>
          {ticket.description ? (
            <Text style={[styles.description, { color: theme.text2 }]}>{ticket.description}</Text>
          ) : null}
          <View style={[styles.categoryChip, { backgroundColor: categoryStyle.bg }]}>
            <Text style={[styles.categoryChipText, { color: categoryStyle.color }]}>{ticket.category}</Text>
          </View>
        </GlassCard>

        {contact ? (
          <Panel style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Customer</Text>
            {contact.full_name ? <Text style={[styles.contactName, { color: theme.text }]}>{contact.full_name}</Text> : null}
            {contact.phone ? <Text style={[styles.contactLine, { color: theme.text2 }]}>{contact.phone}</Text> : null}
            {contact.location ? <Text style={[styles.contactLine, { color: theme.text3 }]}>{contact.location}</Text> : null}
          </Panel>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Status</Text>
          <View style={styles.stepperRow}>
            {TECH_STATUS_ORDER.map((s, i) => (
              <View
                key={s}
                style={[styles.step, { backgroundColor: isTechStatus && i <= statusIdx ? brand.primary : theme.line }]}
              />
            ))}
          </View>
          {advanceLabel ? (
            canAdvance ? (
              <Pressable
                onPress={advance}
                disabled={advancing}
                style={({ pressed }) => [styles.advanceButton, pressed && styles.pressed, advancing && styles.disabled]}
              >
                <Text style={styles.advanceButtonText}>{advancing ? 'Updating…' : advanceLabel}</Text>
              </Pressable>
            ) : (
              <View style={[styles.advanceButton, styles.advanceButtonDone, { borderColor: theme.line }]}>
                <Text style={[styles.advanceButtonText, { color: theme.text3 }]}>{advanceLabel}</Text>
              </View>
            )
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.photoRow}>
          <View style={[styles.photoTile, { borderColor: theme.line }]}>
            <Text style={[styles.photoTileText, { color: theme.text3 }]}>Before photo</Text>
            <Text style={[styles.comingSoon, { color: theme.text3 }]}>Coming soon</Text>
          </View>
          <View style={[styles.photoTile, { borderColor: theme.line }]}>
            <Text style={[styles.photoTileText, { color: theme.text3 }]}>After photo</Text>
            <Text style={[styles.comingSoon, { color: theme.text3 }]}>Coming soon</Text>
          </View>
        </View>
        <View style={[styles.signatureTile, { borderColor: theme.line }]}>
          <Text style={[styles.photoTileText, { color: theme.text3 }]}>Customer signature</Text>
          <Text style={[styles.comingSoon, { color: theme.text3 }]}>Coming soon</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing(6), gap: spacing(3) },
  body: { ...typography.body, textAlign: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing(2) },
  ticketId: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13, color: brand.primary },
  statusBadge: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.sm },
  statusBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  title: { ...typography.heading, marginBottom: spacing(2) },
  description: { ...typography.body, marginBottom: spacing(3) },
  categoryChip: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.sm, alignSelf: 'flex-start' },
  categoryChipText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  section: { marginTop: spacing(4) },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing(2.5) },
  contactName: { ...typography.body, fontFamily: 'Manrope_700Bold', marginBottom: spacing(0.5) },
  contactLine: { ...typography.caption, marginBottom: spacing(0.5) },
  stepperRow: { flexDirection: 'row', gap: spacing(1.5), marginBottom: spacing(3) },
  step: { flex: 1, height: 6, borderRadius: 3 },
  advanceButton: { padding: spacing(3.5), borderRadius: radius.md, alignItems: 'center', backgroundColor: brand.primary },
  advanceButtonDone: { backgroundColor: 'transparent', borderWidth: 1 },
  advanceButtonText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#ffffff' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3), textAlign: 'center' },
  photoRow: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(5) },
  photoTile: { flex: 1, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: spacing(5), alignItems: 'center', gap: spacing(1) },
  signatureTile: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: spacing(4.5), alignItems: 'center', gap: spacing(1), marginTop: spacing(2.5) },
  photoTileText: { ...typography.caption, fontSize: 12 },
  comingSoon: { ...typography.caption, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
});
