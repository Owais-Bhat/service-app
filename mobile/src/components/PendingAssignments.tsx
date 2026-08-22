import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
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
      <View style={styles.reasonBackdrop}>
        <GlassSurface style={styles.reasonCard} borderRadius={radius.lg}>
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
              <View style={[styles.reasonSaveBtn, { backgroundColor: semantic.danger }]}>
                <Text style={styles.reasonSaveBtnText}>Decline</Text>
              </View>
            </PressScale>
          </View>
        </GlassSurface>
      </View>
    </Modal>
  );
}

function AssignmentCard({ item, width }: { item: TaskItem; width: number }) {
  const { theme } = useTheme();
  return (
    <View style={{ width }}>
      <GlassCard shadow style={styles.pendingCard}>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.cardScroll}>
          <View style={styles.rowHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: brand.primary }]}>Service Request</Text>
              <Text style={[styles.name, { color: theme.text }]}>{item.fullName}</Text>
            </View>
            {item.serviceItem ? (
              <View style={styles.serviceChip}>
                <Text style={styles.serviceChipText} numberOfLines={1}>{item.serviceItem}</Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.ticketBox, { borderColor: theme.line }]}>
            <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: 0 }]}>Ticket</Text>
            <Text style={[styles.ticketNo, { color: brand.primary }]}>{item.ticketNo || 'Pending'}</Text>
          </View>

          <View style={styles.metaGrid}>
            <View style={styles.metaCell}>
              <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: 0 }]}>Created</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{timeAgo(item.createdAt)}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: 0 }]}>Preferred Time</Text>
              <Text style={[styles.metaValue, { color: brand.primary }]}>{item.preferredTime || 'Flexible'}</Text>
            </View>
          </View>

          {item.location ? (
            <View style={styles.locationRow}>
              <Icon name="pin" size={14} color={brand.primary} />
              <Text style={[styles.metaValue, { color: theme.text, flex: 1 }]}>{item.location}</Text>
            </View>
          ) : null}
        </ScrollView>
      </GlassCard>
    </View>
  );
}

// "New Assignments Pending" — a popup that opens the moment a new service
// gets assigned. Swiping left/right just pages through the cards (a plain
// horizontal ScrollView, so it's real native scrolling — nothing hand-rolled
// to get stuck); Accept/Decline are separate buttons that act on whichever
// card is currently in view. Shared between the dashboard (auto-popup) and
// Manage Tasks (same stack).
export default function PendingAssignments({ pending, onChanged }: Props) {
  const { width } = useWindowDimensions();
  const [stack, setStack] = useState<TaskItem[]>(pending);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [declineTarget, setDeclineTarget] = useState<TaskItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);

  const pageWidth = width - spacing(10);

  useEffect(() => {
    setStack(pending);
    const hasNew = pending.some((p) => !seenIds.current.has(p.key));
    if (hasNew) setDismissed(false);
    seenIds.current = new Set(pending.map((p) => p.key));
    setActiveIndex((i) => Math.min(i, Math.max(pending.length - 1, 0)));
  }, [pending]);

  const total = stack.length;
  const open = !dismissed && total > 0;
  const active = stack[activeIndex] || null;

  const handleAccept = async (item: TaskItem) => {
    setBusy(true);
    setError(null);
    try {
      await acceptAssignment(item);
      setStack((prev) => prev.filter((i) => i.key !== item.key));
      onChanged();
    } catch {
      setError('Could not accept — check your connection');
    } finally {
      setBusy(false);
    }
  };

  const handleDeclineConfirm = async (reason: string) => {
    if (!declineTarget?.inquiryId) return;
    const item = declineTarget;
    const inquiryId = declineTarget.inquiryId;
    setDeclineTarget(null);
    setBusy(true);
    setError(null);
    try {
      await declineAssignment(inquiryId, reason);
      setStack((prev) => prev.filter((i) => i.key !== item.key));
      onChanged();
    } catch {
      setError('Could not decline — check your connection');
    } finally {
      setBusy(false);
    }
  };

  if (total === 0 && !dismissed) return null;

  return (
    <>
      {dismissed && total > 0 && (
        <Pressable onPress={() => setDismissed(false)} style={styles.reopenPill}>
          <Icon name="alert" size={14} color="#fff" />
          <Text style={styles.reopenPillText}>{total} pending assignment{total > 1 ? 's' : ''}</Text>
        </Pressable>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setDismissed(true)}>
        <View style={styles.backdrop}>
          <View style={styles.popupHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.popupTitle}>New Assignments</Text>
              <Text style={styles.popupSub}>Swipe to browse · Accept or Decline below</Text>
            </View>
            <View style={styles.counterPill}>
              <Text style={styles.counterPillText}>{activeIndex + 1}/{total}</Text>
            </View>
            <Pressable onPress={() => setDismissed(true)} style={styles.closeBtn} hitSlop={10}>
              <Icon name="close" size={16} color="#fff" />
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={pageWidth + spacing(3)}
            contentContainerStyle={{ paddingHorizontal: spacing(5) }}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / (pageWidth + spacing(3)));
              setActiveIndex(Math.max(0, Math.min(idx, stack.length - 1)));
            }}
            style={styles.pager}
          >
            {stack.map((item, idx) => (
              <Animated.View key={item.key} entering={FadeIn.duration(250)} style={{ marginRight: idx === stack.length - 1 ? 0 : spacing(3) }}>
                <AssignmentCard item={item} width={pageWidth} />
              </Animated.View>
            ))}
          </ScrollView>

          {total > 1 && (
            <View style={styles.dotsRow}>
              {stack.map((item, idx) => (
                <View key={item.key} style={[styles.dot, idx === activeIndex && styles.dotActive]} />
              ))}
            </View>
          )}

          {active && (
            <View style={styles.popupActions}>
              <PressScale onPress={() => setDeclineTarget(active)} disabled={busy} style={{ flex: 1 }}>
                <View style={[styles.declineCircle, busy && styles.disabled]}>
                  <Icon name="close" size={22} color="#fff" />
                </View>
              </PressScale>
              <PressScale onPress={() => handleAccept(active)} disabled={busy} style={{ flex: 1 }}>
                <View style={[styles.acceptCircle, busy && styles.disabled]}>
                  <Icon name="check" size={22} color="#fff" />
                </View>
              </PressScale>
            </View>
          )}
        </View>
      </Modal>

      {declineTarget && <DeclineModal onDismiss={() => setDeclineTarget(null)} onConfirm={handleDeclineConfirm} />}
    </>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.6 },
  reopenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    alignSelf: 'flex-start',
    backgroundColor: brand.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2),
    marginBottom: spacing(5),
  },
  reopenPillText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#fff' },
  backdrop: { flex: 1, backgroundColor: 'rgba(4,10,7,0.94)', paddingTop: spacing(9), paddingBottom: spacing(6) },
  popupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(4), paddingHorizontal: spacing(5) },
  popupTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, color: '#fff' },
  popupSub: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: spacing(0.5) },
  counterPill: { minWidth: 40, height: 30, borderRadius: 15, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  counterPillText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#fff' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 12, color: semantic.danger, marginBottom: spacing(2), paddingHorizontal: spacing(5) },
  pager: { flexGrow: 0 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing(1.5), marginTop: spacing(3) },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { backgroundColor: brand.primary, width: 18 },
  pendingCard: { borderWidth: 1.5, borderColor: brand.primary, maxHeight: 420 },
  cardScroll: { maxHeight: 380 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing(2.5), gap: spacing(2) },
  eyebrow: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing(0.5) },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 17 },
  serviceChip: { backgroundColor: brand.primary, borderRadius: radius.full, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), maxWidth: 140 },
  serviceChipText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: '#fff' },
  ticketBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing(2.5), marginBottom: spacing(2.5) },
  ticketNo: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 14, marginTop: spacing(0.5) },
  fieldLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing(3), marginBottom: spacing(1) },
  metaGrid: { flexDirection: 'row', gap: spacing(3), marginBottom: spacing(2.5) },
  metaCell: { flex: 1 },
  metaValue: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(1.5), paddingBottom: spacing(2) },
  popupActions: { flexDirection: 'row', gap: spacing(6), justifyContent: 'center', paddingTop: spacing(6) },
  acceptCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: semantic.success, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  declineCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: semantic.danger, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  reasonBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  reasonCard: { width: '100%', maxWidth: 420, padding: spacing(5) },
  modalTitle: { ...typography.heading, fontSize: 18 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), fontSize: 13, fontFamily: 'Manrope_600SemiBold', minHeight: 90, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(4) },
  cancelBtn: { paddingHorizontal: spacing(4), height: 46, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  reasonSaveBtn: { height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  reasonSaveBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
});
