import React, { useMemo, useState } from 'react';
import { Alert, Linking } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import SectionLabel from '../../components/admin/SectionLabel';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import { dataGet, resolveUploadUrl } from '../../api/client';
import { fetchAttendanceLogs, fetchEodKeys } from '../../api/adminOps';
import { resetFaceId, resolveRestriction } from '../../api/adminManage';
import { semantic } from '../../theme/tokens';
import { hoursBetween, shortDate, shortTime, todayIso } from '../../utils/format';
import { dayOf, RANGE_CHIPS, RangeKey, rangeStart, useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type StateKey = 'all' | 'present' | 'late' | 'missing_eod' | 'on_shift';

const LATE_AFTER_MINUTES = 10 * 60;
// Four missed end-of-day reports lock an employee out of clock-in (web rule).
const STRICT_EOD_LIMIT = 4;
const PAGE = 60;

// Attendance log: who clocked in, when, for how long, with the same Late /
// Missing-EOD reading the web Attendance page uses — plus the clock-in
// restriction panel and Face ID reset.
export default function AttendanceLogsScreen({ onBack }: Props) {
  const logs = useLoader(async () => {
    const [rows, eod, profiles] = await Promise.all([
      fetchAttendanceLogs(),
      fetchEodKeys(),
      dataGet<{ id: string; eod_exempt: number | null }[]>('profiles', { select: 'id,eod_exempt' }),
    ]);
    return {
      rows,
      eod: new Set(eod.map((e) => `${e.employee_id}|${dayOf(e.date)}`)),
      exempt: new Set(profiles.filter((p) => Number(p.eod_exempt) === 1).map((p) => p.id)),
    };
  }, 'Could not load attendance');

  const [range, setRange] = useState<RangeKey>('month');
  const [state, setState] = useState<StateKey>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);

  const decorated = useMemo(() => {
    if (!logs.data) return [];
    return logs.data.rows.map((r) => {
      const date = dayOf(r.date) || dayOf(r.clock_in);
      const hasEod = logs.data!.eod.has(`${r.user_id}|${date}`);
      let st: Exclude<StateKey, 'all'> = 'present';
      if (r.clock_in && !r.clock_out) st = 'on_shift';
      else if (r.clock_in && !hasEod) st = 'missing_eod';
      else if (r.clock_in) {
        const t = new Date(r.clock_in);
        if (t.getHours() * 60 + t.getMinutes() > LATE_AFTER_MINUTES) st = 'late';
      }
      return { ...r, date, hasEod, st, name: r.profiles?.full_name || 'Employee' };
    });
  }, [logs.data]);

  // Employees blocked from clocking in: past days with a clock-in and no EOD.
  const restricted = useMemo(() => {
    if (!logs.data) return [];
    const today = todayIso();
    const byUser = new Map<string, { name: string; dates: string[] }>();
    decorated.forEach((r) => {
      if (!r.clock_in || r.hasEod || r.date === today) return;
      const e = byUser.get(r.user_id) ?? { name: r.name, dates: [] };
      e.dates.push(r.date);
      byUser.set(r.user_id, e);
    });
    return [...byUser.entries()]
      .filter(([id, e]) => e.dates.length >= STRICT_EOD_LIMIT && !logs.data!.exempt.has(id))
      .map(([id, e]) => ({ id, name: e.name, dates: [...new Set(e.dates)] }));
  }, [decorated, logs.data]);

  const inRange = useMemo(() => {
    const from = rangeStart(range);
    return decorated.filter((r) => !from || r.date >= from);
  }, [decorated, range]);

  const counts = useMemo(
    () => ({
      all: inRange.length,
      present: inRange.filter((r) => r.st === 'present').length,
      late: inRange.filter((r) => r.st === 'late').length,
      missing_eod: inRange.filter((r) => r.st === 'missing_eod').length,
      on_shift: inRange.filter((r) => r.st === 'on_shift').length,
    }),
    [inRange],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inRange
      .filter((r) => state === 'all' || r.st === state)
      .filter((r) => !q || `${r.name} ${r.location || ''}`.toLowerCase().includes(q));
  }, [inRange, state, query]);

  const BADGE: Record<string, { label: string; color: string }> = {
    present: { label: 'Present', color: semantic.success },
    late: { label: 'Late', color: semantic.warning },
    missing_eod: { label: 'No EOD', color: semantic.danger },
    on_shift: { label: 'On shift', color: semantic.info },
  };

  const resolve = (r: { id: string; name: string; dates: string[] }) =>
    Alert.alert('Resolve restriction?', `${r.name} has ${r.dates.length} missed end-of-day reports. A cleared-by-admin report is filed for each day.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resolve',
        onPress: async () => {
          setBusy(r.id);
          try {
            await resolveRestriction(r.id, r.dates);
            await logs.reload();
          } catch (e) {
            Alert.alert('Could not resolve', e instanceof Error ? e.message : 'Try again');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const resetFace = (userId: string, name: string) =>
    Alert.alert('Reset Face ID?', `${name} will be asked to take a new reference selfie at the next clock-in.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          setBusy(`face-${userId}`);
          try {
            await resetFaceId(userId);
            Alert.alert('Done', `${name}'s Face ID was reset.`);
          } catch (e) {
            Alert.alert('Could not reset', e instanceof Error ? e.message : 'Try again');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  return (
    <AdminScreen
      title="Attendance"
      subtitle={`${counts.all} records`}
      onBack={onBack}
      onRefresh={logs.reload}
      loading={logs.loading}
      error={logs.error}
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search employee or place" />
          <FilterChips items={RANGE_CHIPS} activeKey={range} onSelect={(k) => { setRange(k as RangeKey); setShown(PAGE); }} />
          <FilterChips
            activeKey={state}
            onSelect={(k) => { setState(k as StateKey); setShown(PAGE); }}
            items={[
              { key: 'all', label: 'All', count: counts.all },
              { key: 'on_shift', label: 'On shift', count: counts.on_shift },
              { key: 'late', label: 'Late', count: counts.late },
              { key: 'missing_eod', label: 'No EOD', count: counts.missing_eod },
            ]}
          />
        </>
      }
    >
      <StatGrid
        items={[
          { label: 'Clocked in', value: counts.all, color: semantic.success },
          { label: 'Late arrivals', value: counts.late, color: counts.late ? semantic.warning : undefined },
          { label: 'Missing EOD', value: counts.missing_eod, color: counts.missing_eod ? semantic.danger : undefined },
          { label: 'Restricted', value: restricted.length, color: restricted.length ? semantic.danger : semantic.success },
        ]}
      />

      {restricted.length > 0 ? (
        <>
          <SectionLabel>Clock-in restrictions</SectionLabel>
          {restricted.map((r) => (
            <ListRow
              key={r.id}
              icon="lock"
              iconColor={semantic.danger}
              title={r.name}
              subtitle={`${r.dates.length} missed end-of-day reports`}
              badge={{ label: 'Blocked', color: semantic.danger }}
              footer={<ActionButton label="Resolve restriction" tone="success" busy={busy === r.id} onPress={() => resolve(r)} />}
            />
          ))}
          <SectionLabel>Records</SectionLabel>
        </>
      ) : null}

      {visible.length === 0 ? <EmptyNote text="No attendance in this view" icon="clock" /> : null}
      {visible.slice(0, shown).map((r) => {
        const hasPin = r.latitude != null && r.longitude != null && r.latitude !== '' && r.longitude !== '';
        return (
          <ListRow
            key={r.id}
            icon="clock"
            iconColor={BADGE[r.st].color}
            title={r.name}
            subtitle={`${shortTime(r.clock_in)} → ${r.clock_out ? shortTime(r.clock_out) : 'still in'}  ·  ${hoursBetween(r.clock_in, r.clock_out)}`}
            meta={`${shortDate(r.date)}${r.location ? ` · ${r.location}` : ''}`}
            badge={BADGE[r.st]}
            footer={
              <>
                {hasPin ? (
                  <ActionButton label="Map" tone="neutral" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}`)} />
                ) : null}
                {r.selfie_url ? <ActionButton label="Selfie" tone="neutral" onPress={() => Linking.openURL(resolveUploadUrl(r.selfie_url as string))} /> : null}
                <ActionButton label="Reset Face ID" tone="neutral" busy={busy === `face-${r.user_id}`} onPress={() => resetFace(r.user_id, r.name)} />
              </>
            }
          />
        );
      })}
      {visible.length > shown ? <ActionButton label={`Show more (${visible.length - shown})`} tone="neutral" onPress={() => setShown((n) => n + PAGE)} /> : null}
    </AdminScreen>
  );
}
