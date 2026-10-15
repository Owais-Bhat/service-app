import React, { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../components/admin/AdminScreen';
import EmptyNote from '../components/admin/EmptyNote';
import StatusBadge from '../components/admin/StatusBadge';
import Panel from '../components/Panel';
import Icon from '../components/Icon';
import { CalendarJob, fetchCalendarJobs } from '../api/employeeExtra';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import { humanize } from '../utils/format';
import { dayOf, useLoader } from '../utils/useLoader';

interface Props {
  onBack: () => void;
}

// Monday-first, as in the design's month grid.
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Dated installation work as a month grid. Employees see their own jobs and
// admins see all of them — the server decides which rows come back.
export default function CalendarScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const jobs = useLoader(fetchCalendarJobs, 'Could not load the calendar');
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [picked, setPicked] = useState(keyOf(now.getFullYear(), now.getMonth(), now.getDate()));

  const statusColor = (status?: string | null): string => {
    switch ((status || '').toLowerCase()) {
      case 'pending': return theme.warn;
      case 'assigned': return theme.vio;
      case 'in_progress': return theme.info;
      case 'completed': return theme.ok;
      case 'cancelled': return theme.grey;
      default: return theme.info;
    }
  };

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarJob[]>();
    (jobs.data ?? []).forEach((j) => {
      const k = dayOf(j.preferred_date);
      if (!k) return;
      map.set(k, [...(map.get(k) ?? []), j]);
    });
    return map;
  }, [jobs.data]);

  const first = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const today = keyOf(now.getFullYear(), now.getMonth(), now.getDate());
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const monthCount = [...byDay.entries()].filter(([k]) => k.startsWith(`${cursor.y}-${pad(cursor.m + 1)}`)).reduce((s, [, v]) => s + v.length, 0);

  const shift = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const goToday = () => {
    setCursor({ y: now.getFullYear(), m: now.getMonth() });
    setPicked(today);
  };

  const dayJobs = byDay.get(picked) ?? [];

  return (
    <AdminScreen
      title="Calendar"
      subtitle={`${monthCount} job${monthCount === 1 ? '' : 's'} in ${monthLabel}`}
      onBack={onBack}
      onRefresh={jobs.reload}
      loading={jobs.loading}
      error={jobs.error}
      headerRight={
        <Pressable onPress={goToday} hitSlop={8} style={styles.todayBtn} accessibilityRole="button" accessibilityLabel="Today">
          <Icon name="calendar" size={20} color={theme.accent} />
          <Text style={[styles.todayText, { color: theme.accent }]}>Today</Text>
        </Pressable>
      }
    >
      <View style={styles.monthRow}>
        <Text style={[styles.month, { color: theme.text }]}>{monthLabel}</Text>
        <Pressable onPress={() => shift(-1)} style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.panel }]} accessibilityLabel="Previous month">
          <Icon name="chevron-left" size={18} color={theme.text} />
        </Pressable>
        <Pressable onPress={() => shift(1)} style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.panel }]} accessibilityLabel="Next month">
          <Icon name="chevron-right" size={18} color={theme.text} />
        </Pressable>
      </View>

      <Panel style={styles.card}>
        <View style={styles.week}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} style={[styles.weekday, { color: theme.text3 }]}>{d}</Text>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((d, i) => {
            if (d === null) return <View key={`e${i}`} style={styles.cell} />;
            const k = keyOf(cursor.y, cursor.m, d);
            const n = byDay.get(k)?.length ?? 0;
            const on = k === picked;
            const isToday = k === today;
            return (
              <View key={k} style={styles.cell}>
                <Pressable
                  onPress={() => setPicked(k)}
                  accessibilityLabel={`${d}, ${n} jobs`}
                  style={[
                    styles.day,
                    { borderColor: !on && isToday ? theme.accent : 'transparent' },
                    on && { backgroundColor: brand.fill },
                  ]}
                >
                  <Text style={[styles.dayText, { color: on ? '#fff' : theme.text, fontFamily: on || isToday ? 'JetBrainsMono_700Bold' : 'JetBrainsMono_500Medium' }]}>{d}</Text>
                  <View style={[styles.dot, { backgroundColor: n ? (on ? '#fff' : theme.accent) : 'transparent' }]} />
                </Pressable>
              </View>
            );
          })}
        </View>
      </Panel>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        {new Date(`${picked}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
      </Text>
      {dayJobs.length === 0 ? <EmptyNote text="Nothing scheduled this day" icon="calendar" /> : null}
      {dayJobs.length > 0 ? (
        <Panel style={styles.list}>
          {dayJobs.map((j, idx) => {
            const color = statusColor(j.status);
            const last = idx === dayJobs.length - 1;
            const sub = [j.installation_type, j.address].filter(Boolean).join(' · ');
            return (
              <View key={j.id} style={[styles.jobRow, !last && { borderBottomColor: theme.line, borderBottomWidth: 1 }]}>
                <Text style={[styles.time, { color: theme.text }]} numberOfLines={1}>{j.preferred_time || '—'}</Text>
                <View style={styles.jobText}>
                  <Text style={[styles.jobName, { color: theme.text }]} numberOfLines={1}>{j.full_name}</Text>
                  {sub ? <Text style={[styles.jobMeta, { color: theme.text3 }]} numberOfLines={2}>{sub}</Text> : null}
                  {j.ticket_no ? <Text style={[styles.jobTicket, { color: theme.text3 }]}>{j.ticket_no}</Text> : null}
                  <View style={styles.badgeRow}>
                    <StatusBadge label={humanize(j.status) || 'Pending'} color={color} />
                  </View>
                </View>
                {j.address ? (
                  <Pressable
                    onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.address as string)}`)}
                    hitSlop={6}
                    style={styles.dirBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Directions"
                  >
                    <Icon name="map" size={18} color={theme.accent} />
                    <Text style={[styles.dirText, { color: theme.accent }]}>Directions</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </Panel>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  todayBtn: { height: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  todayText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginBottom: spacing(4) },
  month: { ...typography.heading, flex: 1 },
  navBtn: { width: 44, height: 44, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 10, borderRadius: radius.xl - 4, marginBottom: spacing(4.5) },
  week: { flexDirection: 'row', paddingTop: 4, paddingBottom: 8 },
  weekday: { fontFamily: 'Manrope_700Bold', fontSize: 11, flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, padding: 1 },
  day: { height: 44, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayText: { fontSize: 14 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  sectionTitle: { ...typography.heading, fontSize: 16, lineHeight: 22, marginBottom: spacing(2.5) },
  list: { padding: 0, overflow: 'hidden', borderRadius: radius.xl - 4 },
  jobRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  time: { width: 56, fontFamily: 'JetBrainsMono_700Bold', fontSize: 13, paddingTop: 2 },
  jobText: { flex: 1, minWidth: 0 },
  jobName: { ...typography.rowTitle, fontSize: 14, lineHeight: 19 },
  jobMeta: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
  jobTicket: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 11, marginTop: 2 },
  badgeRow: { marginTop: spacing(1.5) },
  dirBtn: { height: 40, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  dirText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
});
