import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import PressScale from './PressScale';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  /** "YYYY-MM-DD HH:MM" or empty for "no selection yet". */
  value: string;
  onConfirm: (value: string) => void;
  onDismiss: () => void;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parseValue(value: string): { date: Date; hour: number; minute: number } {
  const [datePart, timePart] = value.split(' ');
  const now = new Date();
  if (datePart) {
    const [y, m, d] = datePart.split('-').map(Number);
    const [h, min] = (timePart || '09:00').split(':').map(Number);
    return { date: new Date(y, (m || 1) - 1, d || 1), hour: h ?? 9, minute: min ?? 0 };
  }
  return { date: now, hour: now.getHours(), minute: 0 };
}

// A pure-JS calendar + time stepper — no native date-picker dependency
// (deliberately avoided: it needs a custom dev build and would break
// testing through plain Expo Go, per AGENTS.md's SDK-compatibility lesson).
export default function CalendarPickerModal({ value, onConfirm, onDismiss }: Props) {
  const { theme } = useTheme();
  const initial = parseValue(value);
  const [viewMonth, setViewMonth] = useState(new Date(initial.date.getFullYear(), initial.date.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<Date>(initial.date);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const isSameDay = (d: number) => selectedDay.getFullYear() === year && selectedDay.getMonth() === month && selectedDay.getDate() === d;
  const isPast = (d: number) => new Date(year, month, d) < today;

  const adjustMinute = (delta: number) => {
    let m = minute + delta;
    let h = hour;
    if (m >= 60) { m = 0; h = (h + 1) % 24; }
    if (m < 0) { m = 45; h = (h - 1 + 24) % 24; }
    setMinute(m);
    setHour(h);
  };
  const adjustHour = (delta: number) => setHour((h) => (h + delta + 24) % 24);

  const confirm = () => {
    const y = selectedDay.getFullYear();
    const m = selectedDay.getMonth() + 1;
    const d = selectedDay.getDate();
    onConfirm(`${y}-${pad(m)}-${pad(d)} ${pad(hour)}:${pad(minute)}`);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <GlassSurface style={styles.card} borderRadius={radius.lg}>
          <Text style={[styles.title, { color: theme.text }]}>New Visit Date &amp; Time</Text>

          <View style={styles.monthRow}>
            <Pressable onPress={() => setViewMonth(new Date(year, month - 1, 1))} hitSlop={10} style={styles.navBtn}>
              <Icon name="chevron-left" size={16} color={theme.text} />
            </Pressable>
            <Text style={[styles.monthLabel, { color: theme.text }]}>{MONTH_NAMES[month]} {year}</Text>
            <Pressable onPress={() => setViewMonth(new Date(year, month + 1, 1))} hitSlop={10} style={styles.navBtn}>
              <Icon name="chevron-right" size={16} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={`${w}-${i}`} style={[styles.weekdayText, { color: theme.text3 }]}>{w}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (d == null) return <View key={`empty-${i}`} style={styles.dayCell} />;
              const selected = isSameDay(d);
              const disabled = isPast(d);
              return (
                <Pressable
                  key={d}
                  disabled={disabled}
                  onPress={() => setSelectedDay(new Date(year, month, d))}
                  style={[styles.dayCell, styles.dayTouchable, selected && { backgroundColor: brand.primary }]}
                >
                  <Text style={[styles.dayText, { color: disabled ? theme.text3 : selected ? '#fff' : theme.text }, disabled && { opacity: 0.35 }]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.timeLabel, { color: theme.text3 }]}>Time</Text>
          <View style={styles.timeRow}>
            <View style={styles.stepperCol}>
              <Pressable onPress={() => adjustHour(1)} style={[styles.stepperBtn, { borderColor: theme.line }]}><Text style={[styles.stepperArrow, { color: theme.text }]}>+</Text></Pressable>
              <Text style={[styles.stepperValue, { color: theme.text }]}>{pad(hour)}</Text>
              <Pressable onPress={() => adjustHour(-1)} style={[styles.stepperBtn, { borderColor: theme.line }]}><Text style={[styles.stepperArrow, { color: theme.text }]}>−</Text></Pressable>
            </View>
            <Text style={[styles.colon, { color: theme.text }]}>:</Text>
            <View style={styles.stepperCol}>
              <Pressable onPress={() => adjustMinute(15)} style={[styles.stepperBtn, { borderColor: theme.line }]}><Text style={[styles.stepperArrow, { color: theme.text }]}>+</Text></Pressable>
              <Text style={[styles.stepperValue, { color: theme.text }]}>{pad(minute)}</Text>
              <Pressable onPress={() => adjustMinute(-15)} style={[styles.stepperBtn, { borderColor: theme.line }]}><Text style={[styles.stepperArrow, { color: theme.text }]}>−</Text></Pressable>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onDismiss} style={[styles.cancelBtn, { borderColor: theme.line }]}>
              <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
            </Pressable>
            <PressScale onPress={confirm} style={{ flex: 1 }}>
              <View style={[styles.confirmBtn, { backgroundColor: brand.primary }]}>
                <Text style={styles.confirmBtnText}>Use This Time</Text>
              </View>
            </PressScale>
          </View>
        </GlassSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  card: { width: '100%', maxWidth: 400, padding: spacing(5) },
  title: { ...typography.heading, fontSize: 16, marginBottom: spacing(3) },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(3) },
  navBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontFamily: 'Manrope_700Bold', fontSize: 14 },
  weekdayRow: { flexDirection: 'row' },
  weekdayText: { flex: 1, textAlign: 'center', fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayTouchable: { borderRadius: 999 },
  dayText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  timeLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing(4), marginBottom: spacing(2), textAlign: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2) },
  stepperCol: { alignItems: 'center', gap: spacing(1) },
  stepperBtn: { width: 36, height: 28, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  stepperArrow: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16 },
  stepperValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 22, minWidth: 44, textAlign: 'center' },
  colon: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 22, marginTop: spacing(4) },
  actions: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(5) },
  cancelBtn: { paddingHorizontal: spacing(4), height: 46, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  confirmBtn: { height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
});
