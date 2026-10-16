import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from './KeyboardAware';
import { Ionicons } from '@expo/vector-icons';
import GlowButton from './GlowButton';
import StatusBadge from './admin/StatusBadge';
import { CardHeader, FieldError, GuestCard, GuestInput, InfoNote } from './GuestFields';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { trackInquiry, Inquiry } from '../api/inquiries';
import { submitComplaint } from '../api/complaints';

interface Props {
  reopenButtonEnabled: boolean;
  reopenLimit: number;
  /** Pre-filled after a booking so the customer only has to tap "Find". */
  initialTicketNo?: string;
  initialPhone?: string;
}

function formatWhen(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d.toDateString();
  }
}

export default function TrackPanel({ reopenButtonEnabled, reopenLimit, initialTicketNo = '', initialPhone = '' }: Props) {
  const { theme } = useTheme();
  const [ticketNo, setTicketNo] = useState(initialTicketNo);
  const [phone, setPhone] = useState(initialPhone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Inquiry[] | null>(null);
  const [reopening, setReopening] = useState(false);
  const [reopened, setReopened] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<Inquiry | null>(null);
  const [reopenNote, setReopenNote] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);

  const handleTrack = async () => {
    if (!ticketNo.trim() || !phone.trim()) {
      setError('Enter both your ticket number and phone number');
      return;
    }
    setError(null);
    setLoading(true);
    setResults(null);
    setReopened(false);
    try {
      const phoneNormalized = '+91' + phone.trim();
      const rows = await trackInquiry(ticketNo.trim(), phoneNormalized);
      if (rows.length === 0) setError('No ticket found for that number and phone — double-check and try again');
      else setResults(rows);
    } catch {
      setError('Could not check your ticket — check your connection and try again');
    } finally {
      setLoading(false);
    }
  };

  const closeSheet = () => {
    setReopenTarget(null);
    setReopenNote('');
    setSheetError(null);
  };

  const handleReopen = async (r: Inquiry) => {
    setReopening(true);
    setSheetError(null);
    try {
      const note = reopenNote.trim();
      await submitComplaint({
        ticket_no: r.ticket_no,
        phone: r.phone,
        complaint_text: note
          ? `ISSUE NOT RESOLVED: reopened from ticket tracking — ${note}`
          : 'ISSUE NOT RESOLVED: reopened from ticket tracking',
      });
      setReopened(true);
      closeSheet();
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Could not reopen — please try again');
    } finally {
      setReopening(false);
    }
  };

  if (results) {
    return (
      <View>
        <Pressable
          onPress={() => setResults(null)}
          accessibilityRole="button"
          style={styles.backRow}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={18} color={theme.accent} />
          <Text style={[styles.backText, { color: theme.accent }]}>New search</Text>
        </Pressable>
        {results.map((r) => {
          const s = statusColors[r.status] || DEFAULT_STATUS_STYLE;
          const canReopen = reopenButtonEnabled && (r.status === 'resolved' || r.status === 'case_closed' || r.status === 'closed');
          const when = formatWhen(r.created_at);
          return (
            <View key={r.id} style={{ marginBottom: spacing(3) }}>
              <GuestCard padding={18}>
                <View style={styles.headRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.overline, { color: theme.text3 }]}>Ticket</Text>
                    <Text style={[styles.ticketNo, { color: theme.accent }]} selectable>{r.ticket_no}</Text>
                  </View>
                  <StatusBadge label={s.label} color={s.color} />
                </View>
                <Text style={[typography.rowTitle, { color: theme.text, marginTop: spacing(2.5) }]}>{r.service_item}</Text>
                {r.location ? (
                  <Text style={[typography.supporting, { color: theme.text2, marginTop: spacing(1) }]}>{r.location}</Text>
                ) : null}
                {when ? (
                  <Text style={[typography.supporting, { color: theme.text3, marginTop: spacing(1) }]}>Booked {when}</Text>
                ) : null}

                {canReopen && !reopened && (
                  <View style={[styles.reopenWrap, { borderTopColor: theme.line }]}>
                    <Text style={[typography.supporting, { color: theme.text2, marginBottom: spacing(2.5) }]}>
                      Problem came back? You can reopen this ticket up to {reopenLimit} {reopenLimit === 1 ? 'time' : 'times'}.
                    </Text>
                    <Pressable
                      onPress={() => { setSheetError(null); setReopenTarget(r); }}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.reopenBtn, { borderColor: theme.border, backgroundColor: theme.panel }, pressed && { opacity: 0.75 }]}
                    >
                      <Ionicons name="refresh-outline" size={18} color={theme.text} />
                      <Text style={[styles.reopenText, { color: theme.text }]}>Report issue again</Text>
                    </Pressable>
                  </View>
                )}
                {reopened && (
                  <View style={styles.reopenedRow}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.ok} />
                    <Text style={[typography.caption, { color: theme.ok, flex: 1 }]}>Reopened — our team has been notified.</Text>
                  </View>
                )}
              </GuestCard>
            </View>
          );
        })}

        <Modal visible={!!reopenTarget} transparent animationType="slide" onRequestClose={closeSheet}>
          <View style={styles.backdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityLabel="Dismiss" />
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <View style={[styles.sheet, { backgroundColor: theme.panel, borderTopColor: theme.border }]}>
                <View style={[styles.handle, { backgroundColor: theme.border }]} />
                <View style={[styles.sheetIcon, { backgroundColor: theme.warnS }]}>
                  <Ionicons name="refresh-outline" size={24} color={theme.warn} />
                </View>
                <Text style={[typography.heading, styles.sheetTitle, { color: theme.text }]}>
                  Reopen {reopenTarget?.ticket_no}?
                </Text>
                <Text style={[styles.sheetBody, { color: theme.text2 }]}>
                  A technician will revisit if it&apos;s the same issue. You can reopen a ticket up to{' '}
                  <Text style={{ color: theme.text, fontFamily: 'Manrope_700Bold' }}>{reopenLimit}</Text>{' '}
                  {reopenLimit === 1 ? 'time' : 'times'}.
                </Text>
                <GuestInput
                  multiline
                  minHeight={72}
                  placeholder="What's happening now?"
                  value={reopenNote}
                  onChangeText={(v) => setReopenNote(v.slice(0, 500))}
                />
                {sheetError ? <FieldError text={sheetError} /> : null}
                <View style={styles.sheetActions}>
                  <Pressable
                    onPress={closeSheet}
                    accessibilityRole="button"
                    style={[styles.cancelBtn, { borderColor: theme.border }]}
                  >
                    <Text style={[styles.cancelText, { color: theme.text }]}>Cancel</Text>
                  </Pressable>
                  <View style={{ flex: 1.4 }}>
                    <GlowButton
                      label="Reopen ticket"
                      loading={reopening}
                      onPress={() => { if (reopenTarget) void handleReopen(reopenTarget); }}
                    />
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <GuestCard>
      <CardHeader title="Track a request" body="Enter both the ticket number and the phone number used to book." />
      <View style={styles.fields}>
        <GuestInput
          label="Ticket number"
          mono
          autoCapitalize="characters"
          placeholder="NE-260506-1234"
          hint="It's in your booking SMS."
          value={ticketNo}
          onChangeText={setTicketNo}
        />
        <GuestInput
          label="Phone number"
          prefix="+91"
          mono
          keyboardType="number-pad"
          placeholder="98765 43210"
          value={phone}
          onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
        />
      </View>
      {error && <FieldError text={error} />}
      <View style={{ marginTop: spacing(2) }}>
        <GlowButton label={loading ? 'Checking…' : 'Find my request'} onPress={handleTrack} loading={loading} icon="search" />
      </View>
      <InfoNote
        icon="lock-closed-outline"
        text="If the details don't match a request, we'll just say we couldn't find it — we never reveal other customers' bookings."
      />
    </GuestCard>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 14, marginTop: spacing(4) },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: spacing(3) },
  backText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  ticketNo: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 18 },
  reopenWrap: { borderTopWidth: 1, paddingTop: 14, marginTop: spacing(4) },
  reopenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), height: 48, borderRadius: radius.md, borderWidth: 1 },
  reopenText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  reopenedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginTop: spacing(3.5) },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetScroll: { flex: 1 },
  sheetScrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  handle: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 18 },
  sheetIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: spacing(3) },
  sheetTitle: { fontSize: 20, lineHeight: 26 },
  sheetBody: { fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 14 },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: spacing(4) },
  cancelBtn: { flex: 1, height: 52, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...typography.button },
});
