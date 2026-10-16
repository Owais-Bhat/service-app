import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView as RNScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from './KeyboardAware';
import Animated, { FadeIn } from 'react-native-reanimated';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { acceptAssignment, declineAssignment, TaskItem } from '../api/tasks';
import { useAttendanceStatus } from '../context/AttendanceContext';

interface Props {
  pending: TaskItem[];
  onChanged: () => void;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// Decline reason — a bottom sheet (design: r28, grabber) with a 52 dp field.
function DeclineModal({ onDismiss, onConfirm }: { onDismiss: () => void; onConfirm: (reason: string) => void }) {
  const { theme } = useTheme();
  const [reason, setReason] = useState('');
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <Text style={[styles.sheetTitle, { color: theme.text }]}>Decline assignment</Text>
          <Text style={[styles.fieldLabel, { color: theme.text2 }]}>
            Reason <Text style={{ color: theme.err }}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.panel2 }]}
            placeholder="Why can't you take this job?"
            placeholderTextColor={theme.text3}
            value={reason}
            onChangeText={setReason}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.actionRow}>
            <Pressable onPress={onDismiss} style={[styles.btn, { flex: 1, borderColor: theme.border, borderWidth: 1 }]}>
              <Text style={[styles.btnText, { color: theme.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => reason.trim() && onConfirm(reason.trim())}
              style={[styles.btn, { flex: 1.4, backgroundColor: theme.errS, borderColor: theme.err, borderWidth: 1 }, !reason.trim() && styles.disabled]}
            >
              <Text style={[styles.btnText, { color: theme.err }]}>Decline</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Design e_home "New assignments" card: mono ticket id in the accent colour,
// customer name, one meta line. The Decline / Accept pair lives under the pager.
function AssignmentCard({ item, width }: { item: TaskItem; width: number }) {
  const { theme } = useTheme();
  return (
    <View style={{ width }}>
      <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border }]}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.cardScroll}>
          <View style={styles.cardTop}>
            <Text style={[styles.ticketNo, { color: theme.accent }]}>{item.ticketNo || 'Pending'}</Text>
            <Text style={[styles.created, { color: theme.text3 }]}>{timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{item.fullName}</Text>
          {item.serviceItem ? <Text style={[styles.meta, { color: theme.text2 }]}>{item.serviceItem}</Text> : null}
          {item.location ? (
            <View style={styles.locationRow}>
              <Icon name="pin" size={14} color={theme.text3} />
              <Text style={[styles.meta, { color: theme.text2, flex: 1, marginTop: 0 }]}>{item.location}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

// "New assignments" — a popup that opens the moment a new service gets
// assigned. Swiping left/right just pages through the cards (a plain
// horizontal ScrollView, so it's real native scrolling — nothing hand-rolled
// to get stuck); Accept/Decline are separate buttons that act on whichever
// card is currently in view. Shared between the dashboard (auto-popup) and
// Manage Tasks (same stack).
export default function PendingAssignments({ pending, onChanged }: Props) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const { clockedIn, attendance, showGate } = useAttendanceStatus();
  const [stack, setStack] = useState<TaskItem[]>(pending);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [declineTarget, setDeclineTarget] = useState<TaskItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const scrollRef = useRef<RNScrollView>(null);

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

  // Not clocked in — close this popup (two native Modals don't stack
  // reliably) and bring the clock-in gate back instead.
  const promptClockIn = () => {
    if (attendance?.clock_in) return;
    setDismissed(true);
    showGate();
  };

  if (total === 0 && !dismissed) return null;

  return (
    <>
      {dismissed && total > 0 && (
        <Pressable
          onPress={() => setDismissed(false)}
          style={[styles.reopenRow, { backgroundColor: theme.panel, borderColor: theme.border }]}
          accessibilityRole="button"
        >
          <View style={[styles.reopenIcon, { backgroundColor: theme.vioS }]}>
            <Icon name="alert" size={18} color={theme.vio} />
          </View>
          <Text style={[styles.reopenText, { color: theme.text }]}>
            {total} pending assignment{total > 1 ? 's' : ''}
          </Text>
          <Icon name="chevron-right" size={18} color={theme.text3} />
        </Pressable>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setDismissed(true)}>
        <View style={styles.backdrop}>
          <View style={styles.popupHeader}>
            <Text style={styles.popupTitle}>New assignments</Text>
            <View style={[styles.counterPill, { backgroundColor: theme.vioS }]}>
              <Text style={[styles.counterPillText, { color: theme.vio }]}>
                {activeIndex + 1}/{total}
              </Text>
            </View>
            <Pressable onPress={() => setDismissed(true)} style={styles.closeBtn} hitSlop={10} accessibilityLabel="Close">
              <Icon name="close" size={18} color="#ffffff" />
            </Pressable>
          </View>
          <Text style={styles.popupSub}>Swipe to browse · Accept or Decline below</Text>

          {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

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
              <Pressable
                onPress={() => (clockedIn ? setDeclineTarget(active) : promptClockIn())}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.popupBtn, { flex: 1, borderColor: 'rgba(255,255,255,0.35)', borderWidth: 1 }, (busy || !clockedIn) && styles.disabled]}
              >
                <Text style={[styles.btnText, { color: '#ffffff' }]}>Decline</Text>
              </Pressable>
              <Pressable
                onPress={() => (clockedIn ? handleAccept(active) : promptClockIn())}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.popupBtn, { flex: 1.4, backgroundColor: brand.fill }, (busy || !clockedIn) && styles.disabled]}
              >
                <Icon name={clockedIn ? 'check' : 'lock'} size={18} color="#ffffff" />
                <Text style={[styles.btnText, { color: '#ffffff' }]}>Accept</Text>
              </Pressable>
            </View>
          )}
          {active && !clockedIn ? (
            <Text style={styles.clockHint}>
              {attendance?.clock_in ? 'You have clocked out for today.' : 'Clock in to accept or decline.'}
            </Text>
          ) : null}
        </View>
      </Modal>

      {declineTarget && <DeclineModal onDismiss={() => setDeclineTarget(null)} onConfirm={handleDeclineConfirm} />}
    </>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.4 },
  clockHint: { ...typography.supporting, fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: spacing(3) },
  reopenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), padding: spacing(3.5), borderRadius: 20, borderWidth: 1 },
  reopenIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  reopenText: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: 'rgba(4,10,7,0.94)', paddingTop: spacing(9), paddingBottom: spacing(6) },
  popupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingHorizontal: spacing(5) },
  popupTitle: { flex: 1, ...typography.heading, color: '#ffffff' },
  popupSub: { ...typography.supporting, fontSize: 12, color: 'rgba(255,255,255,0.55)', paddingHorizontal: spacing(5), marginTop: spacing(1), marginBottom: spacing(4) },
  counterPill: { minWidth: 40, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  counterPillText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  closeBtn: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  error: { ...typography.caption, marginBottom: spacing(2), paddingHorizontal: spacing(5) },
  pager: { flexGrow: 0 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing(1.5), marginTop: spacing(3) },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { backgroundColor: brand.fill, width: 18 },
  card: { borderRadius: 20, borderWidth: 1, padding: spacing(3.5), maxHeight: 420 },
  cardScroll: { maxHeight: 380 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(2) },
  ticketNo: { ...typography.monoId },
  created: { ...typography.caption, fontSize: 12 },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 16, marginTop: spacing(1.5) },
  meta: { ...typography.supporting, marginTop: spacing(0.5) },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(1.5), marginTop: spacing(2) },
  popupActions: { flexDirection: 'row', gap: spacing(3), paddingHorizontal: spacing(5), paddingTop: spacing(6) },
  popupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), height: 48, borderRadius: radius.md },
  btn: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(4.5) },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderTopWidth: 1, paddingHorizontal: spacing(5), paddingTop: spacing(2.5), paddingBottom: spacing(9) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing(4.5) },
  sheetTitle: { ...typography.heading, fontSize: 20, lineHeight: 26, marginBottom: spacing(3.5) },
  fieldLabel: { ...typography.caption, marginBottom: spacing(1.5) },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3.5), paddingVertical: spacing(3), fontSize: 14, fontFamily: 'Manrope_500Medium', minHeight: 96 },
});
