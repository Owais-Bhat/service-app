import React, { useEffect, useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import GlassCard from './GlassCard';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import PressScale from './PressScale';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { springs } from '../theme/motion';
import { acceptAssignment, declineAssignment, TaskItem } from '../api/tasks';

interface Props {
  pending: TaskItem[];
  onChanged: () => void;
}

const SWIPE_THRESHOLD = 110;
const FLY_DURATION = 220;

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

interface SwipeCardProps {
  item: TaskItem;
  index: number;
  isTop: boolean;
  flingSignal: 'right' | 'left' | null;
  onFlingConsumed: () => void;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
}

// A single card in the stack. Only the top card responds to touch — the
// rest just peek out behind it (scaled + offset) for the physical "deck"
// look. flingSignal lets the Accept/Decline buttons trigger the exact same
// fly-off motion as an actual finger swipe, from outside this component.
function SwipeCard({ item, index, isTop, flingSignal, onFlingConsumed, onSwipeRight, onSwipeLeft }: SwipeCardProps) {
  const { theme } = useTheme();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const onSwipeRightRef = useRef(onSwipeRight);
  const onSwipeLeftRef = useRef(onSwipeLeft);
  onSwipeRightRef.current = onSwipeRight;
  onSwipeLeftRef.current = onSwipeLeft;

  const flyRightAndAccept = () => {
    translateX.value = withTiming(600, { duration: FLY_DURATION });
    setTimeout(() => onSwipeRightRef.current(), FLY_DURATION - 20);
  };
  const snapBackAndDecline = () => {
    translateX.value = withSpring(0, springs.bouncy);
    translateY.value = withSpring(0, springs.bouncy);
    onSwipeLeftRef.current();
  };

  useEffect(() => {
    if (!isTop || !flingSignal) return;
    if (flingSignal === 'right') flyRightAndAccept();
    else snapBackAndDecline();
    onFlingConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flingSignal, isTop]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8,
      onPanResponderMove: (_e, g) => {
        translateX.value = g.dx;
        translateY.value = g.dy * 0.2;
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dx > SWIPE_THRESHOLD) flyRightAndAccept();
        else if (g.dx < -SWIPE_THRESHOLD) snapBackAndDecline();
        else {
          translateX.value = withSpring(0, springs.bouncy);
          translateY.value = withSpring(0, springs.bouncy);
        }
      },
    }),
  ).current;

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(translateX.value, [-260, 0, 260], [-10, 0, 10], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value + (isTop ? 0 : index * 10) },
        { rotate: `${rotate}deg` },
        { scale: isTop ? 1 : 1 - index * 0.05 },
      ],
      opacity: isTop ? 1 : 1 - index * 0.3,
    };
  });

  const acceptStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [10, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));
  const declineStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, -10], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View
      style={[styles.cardSlot, cardStyle]}
      pointerEvents={isTop ? 'auto' : 'none'}
      {...(isTop ? panResponder.panHandlers : {})}
    >
      <GlassCard shadow style={styles.pendingCard}>
        {isTop && (
          <>
            <Animated.View style={[styles.stamp, styles.acceptStamp, acceptStampStyle]}>
              <Text style={styles.acceptStampText}>ACCEPT</Text>
            </Animated.View>
            <Animated.View style={[styles.stamp, styles.declineStamp, declineStampStyle]}>
              <Text style={styles.declineStampText}>DECLINE</Text>
            </Animated.View>
          </>
        )}

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
            <Text style={[styles.metaValue, { color: theme.text, flex: 1 }]} numberOfLines={3}>{item.location}</Text>
          </View>
        ) : null}
      </GlassCard>
    </Animated.View>
  );
}

// "New Assignments Pending" — a Tinder-style swipeable card stack that pops
// up the moment a new service gets assigned. Swipe right (or tap Accept) to
// take the job; swipe left (or tap Decline) asks for the required reason.
// Shared between the dashboard (auto-popup) and Manage Tasks (same stack).
export default function PendingAssignments({ pending, onChanged }: Props) {
  const { theme } = useTheme();
  const [stack, setStack] = useState<TaskItem[]>(pending);
  const [dismissed, setDismissed] = useState(false);
  const [declineTarget, setDeclineTarget] = useState<TaskItem | null>(null);
  const [flingSignal, setFlingSignal] = useState<'right' | 'left' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    setStack(pending);
    const hasNew = pending.some((p) => !seenIds.current.has(p.key));
    if (hasNew) setDismissed(false);
    seenIds.current = new Set(pending.map((p) => p.key));
  }, [pending]);

  const total = stack.length;
  const open = !dismissed && total > 0;
  const top = stack[0] || null;

  const handleAccept = async (item: TaskItem) => {
    setStack((prev) => prev.filter((i) => i.key !== item.key));
    setError(null);
    try {
      await acceptAssignment(item);
      onChanged();
    } catch {
      setError('Could not accept — check your connection');
      onChanged();
    }
  };

  const handleDeclineConfirm = async (reason: string) => {
    if (!declineTarget?.inquiryId) return;
    const item = declineTarget;
    const inquiryId = declineTarget.inquiryId;
    setDeclineTarget(null);
    setStack((prev) => prev.filter((i) => i.key !== item.key));
    setError(null);
    try {
      await declineAssignment(inquiryId, reason);
      onChanged();
    } catch {
      setError('Could not decline — check your connection');
      onChanged();
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
              <Text style={styles.popupSub}>Swipe right to accept · left to decline</Text>
            </View>
            <View style={styles.counterPill}>
              <Text style={styles.counterPillText}>{total}</Text>
            </View>
            <Pressable onPress={() => setDismissed(true)} style={styles.closeBtn} hitSlop={10}>
              <Icon name="close" size={16} color="#fff" />
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.stackArea}>
            {stack
              .slice(0, 3)
              .map((item, idx) => (
                <SwipeCard
                  key={item.key}
                  item={item}
                  index={idx}
                  isTop={idx === 0}
                  flingSignal={idx === 0 ? flingSignal : null}
                  onFlingConsumed={() => setFlingSignal(null)}
                  onSwipeRight={() => handleAccept(item)}
                  onSwipeLeft={() => setDeclineTarget(item)}
                />
              ))
              .reverse()}
          </View>

          {top && (
            <View style={styles.popupActions}>
              <PressScale onPress={() => setFlingSignal('left')} style={{ flex: 1 }}>
                <View style={styles.declineCircle}>
                  <Icon name="close" size={22} color="#fff" />
                </View>
              </PressScale>
              <PressScale onPress={() => setFlingSignal('right')} style={{ flex: 1 }}>
                <View style={styles.acceptCircle}>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(4,10,7,0.92)', paddingHorizontal: spacing(5), paddingTop: spacing(9) },
  popupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginBottom: spacing(4) },
  popupTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, color: '#fff' },
  popupSub: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: spacing(0.5) },
  counterPill: { minWidth: 30, height: 30, borderRadius: 15, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  counterPillText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 12, color: semantic.danger, marginBottom: spacing(2) },
  stackArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardSlot: { position: 'absolute', width: '100%', maxWidth: 380 },
  pendingCard: { borderWidth: 1.5, borderColor: brand.primary },
  stamp: { position: 'absolute', top: spacing(4), zIndex: 5, borderWidth: 3, borderRadius: radius.sm, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1) },
  acceptStamp: { right: spacing(4), borderColor: semantic.success, transform: [{ rotate: '-14deg' }] },
  acceptStampText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: semantic.success, letterSpacing: 1 },
  declineStamp: { left: spacing(4), borderColor: semantic.danger, transform: [{ rotate: '14deg' }] },
  declineStampText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: semantic.danger, letterSpacing: 1 },
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
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(1.5) },
  popupActions: { flexDirection: 'row', gap: spacing(6), justifyContent: 'center', paddingVertical: spacing(6) },
  acceptCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: semantic.success, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  declineCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: semantic.danger, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  reasonCard: { width: '100%', maxWidth: 420, padding: spacing(5) },
  modalTitle: { ...typography.heading, fontSize: 18 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), fontSize: 13, fontFamily: 'Manrope_600SemiBold', minHeight: 90, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(4) },
  cancelBtn: { paddingHorizontal: spacing(4), height: 46, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  reasonSaveBtn: { height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  reasonSaveBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
});
