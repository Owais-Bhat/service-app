import React, { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../components/admin/AdminScreen';
import ListRow from '../components/admin/ListRow';
import ActionButton from '../components/admin/ActionButton';
import EmptyNote from '../components/admin/EmptyNote';
import Icon from '../components/Icon';
import { CalendarJob, fetchCalendarJobs } from '../api/employeeExtra';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { humanize } from '../utils/format';
import { dayOf, useLoader } from '../utils/useLoader';

interface Props {
  onBack: () => void;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STATUS_COLOR: Record<string, string> = {
  pending: semantic.warning,
  assigned: '#7c5cfc',
  in_progress: semantic.info,
  completed: semantic.success,
  cancelled: brand.grey,
};

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

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarJob[]>();
    (jobs.data ?? []).forEach((j) => {
      const k = dayOf(j.preferred_date);
      if (!k) return;
      map.set(k, [...(map.get(k) ?? []), j]);
    });
    return map;
  }, [jobs.data]);

  const first = new Date(cursor.y, cursor.m, 1).getDay();
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

  const dayJobs = byDay.get(picked) ?? [];

  return (
    <AdminScreen
      title="Calendar"
      subtitle={`${monthCount} job${monthCount === 1 ? '' : 's'} in ${monthLabel}`}
      onBack={onBack}
      onRefresh={jobs.reload}
      loading={jobs.loading}
      error={jobs.error}
    >
      <View style={[styles.card, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityLabel="Previous month">
            <Icon name="chevron-left" size={22} color={theme.text2} />
          </Pressable>
          <Text style={[styles.month, { color: theme.text }]}>{monthLabel}</Text>
          <Pressable onPress={() => shift(1)} hitSlop={10} accessibilityLabel="Next month">
            <Icon name="chevron-right" size={22} color={theme.text2} />
          </Pressable>
        </View>
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
            return (
              <Pressable key={k} onPress={() => setPicked(k)} style={styles.cell} accessibilityLabel={`${d}, ${n} jobs`}>
                <View
                  style={[
                    styles.day,
                    on && { backgroundColor: brand.fill },
                    !on && k === today && { borderColor: brand.primary, borderWidth: 1 },
                  ]}
                >
                  <Text style={[styles.dayText, { color: on ? '#fff' : theme.text }]}>{d}</Text>
                </View>
                <View style={[styles.dot, { backgroundColor: n ? (on ? brand.primary : semantic.warning) : 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>
        {new Date(`${picked}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
      </Text>
      {dayJobs.length === 0 ? <EmptyNote text="Nothing scheduled this day" icon="calendar" /> : null}
      {dayJobs.map((j) => (
        <ListRow
          key={j.id}
          icon="construct"
          iconColor={STATUS_COLOR[(j.status || '').toLowerCase()]}
          title={j.full_name}
          subtitle={[j.installation_type, j.address].filter(Boolean).join(' · ') || undefined}
          meta={`${j.ticket_no || ''}${j.preferred_time ? ` · ${j.preferred_time}` : ''}`}
          badge={{ label: humanize(j.status) || 'Pending', color: STATUS_COLOR[(j.status || '').toLowerCase()] ?? semantic.info }}
          footer={
            j.address ? (
              <ActionButton
                label="Directions"
                tone="neutral"
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.address as string)}`)}
              />
            ) : undefined
          }
        />
      ))}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing(3), marginBottom: spacing(4) },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(3) },
  month: { ...typography.heading, fontSize: 17 },
  week: { flexDirection: 'row' },
  weekday: { ...typography.caption, fontSize: 11, flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: spacing(1) },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayText: { ...typography.body, fontSize: 14 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  sectionTitle: { ...typography.heading, fontSize: 16, marginBottom: spacing(2) },
});
