import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import GlassCard from './GlassCard';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import PressScale from './PressScale';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { acceptAssignment, declineAssignment, TaskItem } from '../api/tasks';

interface Props {
  pending: TaskItem[];
  onChanged: () => void;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function DeclineModal({ onDismiss, onConfirm }: { onDismiss: () => void; onConfirm: (reason: string) => void }) {
  const { theme } = useTheme();
  const [reason, setReason] = useState('');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <GlassSurface style={styles.modalCard} borderRadius={radius.lg}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>Decline Assignment</Text>
          <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: spacing(2) }]}>Reason (required)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.line }]}
            placeholder="Why can't you take this job?"
            placeholderTextColor={theme.text3}
            value={reason}
            onChangeText={setReason}
            multiline
          />
          <View style={styles.modalActions}>
            <Pressable onPress={onDismiss} style={[styles.cancelBtn, { borderColor: theme.line }]}>
              <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
            </Pressable>
            <PressScale onPress={() => reason.trim() && onConfirm(reason.trim())} style={{ flex: 1 }}>
              <View style={[styles.saveBtn, { backgroundColor: semantic.danger }]}>
                <Text style={styles.saveBtnText}>Decline</Text>
              </View>
            </PressScale>
          </View>
        </GlassSurface>
      </View>
    </Modal>
  );
}

// "New Assignments Pending" — shared between the dashboard (so a fresh
// assignment is visible the moment you land) and Manage Tasks (the full
// list). Same accept/decline workflow either place.
export default function PendingAssignments({ pending, onChanged }: Props) {
  const { theme } = useTheme();
  const [declineTarget, setDeclineTarget] = useState<TaskItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (pending.length === 0) return null;

  const handleAccept = async (item: TaskItem) => {
    setBusyId(item.key);
    setError(null);
    try {
      await acceptAssignment(item);
      onChanged();
    } catch {
      setError('Could not accept — check your connection');
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (reason: string) => {
    if (!declineTarget?.inquiryId) return;
    setBusyId(declineTarget.key);
    setError(null);
    try {
      await declineAssignment(declineTarget.inquiryId, reason);
      setDeclineTarget(null);
      onChanged();
    } catch {
      setError('Could not decline — check your connection');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={{ marginBottom: spacing(5) }}>
      <View style={styles.pendingHeader}>
        <Icon name="alert" size={18} color={brand.primary} />
        <Text style={[styles.sectionHeading, { color: brand.primary }]}>New Assignments Pending</Text>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>{pending.length}</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {pending.map((p, idx) => (
        <Animated.View key={p.key} entering={FadeInUp.delay(idx * 80).duration(450).springify()}>
          <GlassCard shadow style={styles.pendingCard}>
            <View style={styles.rowHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eyebrow, { color: brand.primary }]}>Service Request</Text>
                <Text style={[styles.name, { color: theme.text }]}>{p.fullName}</Text>
              </View>
              {p.serviceItem ? (
                <View style={styles.serviceChip}>
                  <Text style={styles.serviceChipText} numberOfLines={1}>{p.serviceItem}</Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.ticketBox, { borderColor: theme.line }]}>
              <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: 0 }]}>Ticket</Text>
              <Text style={[styles.ticketNo, { color: brand.primary }]}>{p.ticketNo || 'Pending'}</Text>
            </View>

            <View style={styles.metaGrid}>
              <View style={styles.metaCell}>
                <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: 0 }]}>Created</Text>
                <Text style={[styles.metaValue, { color: theme.text }]}>{timeAgo(p.createdAt)}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: 0 }]}>Preferred Time</Text>
                <Text style={[styles.metaValue, { color: brand.primary }]}>{p.preferredTime || 'Flexible'}</Text>
              </View>
            </View>

            {p.location ? (
              <View style={styles.locationRow}>
                <Icon name="pin" size={14} color={brand.primary} />
                <Text style={[styles.metaValue, { color: theme.text, flex: 1 }]} numberOfLines={2}>{p.location}</Text>
              </View>
            ) : null}

            <View style={styles.pendingActions}>
              <PressScale onPress={() => handleAccept(p)} disabled={busyId === p.key} style={{ flex: 1 }}>
                <View style={[styles.acceptBtn, { opacity: busyId === p.key ? 0.7 : 1 }]}>
                  <Icon name="check" size={16} color="#fff" />
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </View>
              </PressScale>
              <PressScale onPress={() => setDeclineTarget(p)} disabled={busyId === p.key} style={{ flex: 1 }}>
                <View style={[styles.declineBtn, { opacity: busyId === p.key ? 0.7 : 1 }]}>
                  <Icon name="close" size={16} color="#fff" />
                  <Text style={styles.acceptBtnText}>Decline</Text>
                </View>
              </PressScale>
            </View>
          </GlassCard>
        </Animated.View>
      ))}

      {declineTarget && <DeclineModal onDismiss={() => setDeclineTarget(null)} onConfirm={handleDecline} />}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeading: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, flex: 1 },
  pendingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginBottom: spacing(3) },
  pendingBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  pendingBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#fff' },
  pendingCard: { marginBottom: spacing(3), borderWidth: 1.5, borderColor: brand.primary },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing(2.5), gap: spacing(2) },
  eyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing(0.5) },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  serviceChip: { backgroundColor: brand.primary, borderRadius: radius.full, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), maxWidth: 140 },
  serviceChipText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: '#fff' },
  ticketBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing(2.5), marginBottom: spacing(2.5) },
  ticketNo: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 14, marginTop: spacing(0.5) },
  fieldLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing(3), marginBottom: spacing(1) },
  metaGrid: { flexDirection: 'row', gap: spacing(3), marginBottom: spacing(2.5) },
  metaCell: { flex: 1 },
  metaValue: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(1.5), marginBottom: spacing(3) },
  pendingActions: { flexDirection: 'row', gap: spacing(2.5) },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), backgroundColor: semantic.success, height: 42, borderRadius: radius.sm },
  declineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), backgroundColor: semantic.danger, height: 42, borderRadius: radius.sm },
  acceptBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
  error: { fontSize: 12, color: semantic.danger, marginBottom: spacing(2) },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  modalCard: { width: '100%', maxWidth: 440, padding: spacing(5) },
  modalTitle: { ...typography.heading, fontSize: 18 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), fontSize: 13, fontFamily: 'Manrope_600SemiBold', minHeight: 90, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(4) },
  cancelBtn: { paddingHorizontal: spacing(4), height: 46, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  saveBtn: { height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
});
