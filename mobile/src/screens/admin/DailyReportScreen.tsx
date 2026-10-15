import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ActionButton from '../../components/admin/ActionButton';
import SectionLabel from '../../components/admin/SectionLabel';
import Field from '../../components/admin/Field';
import ListRow from '../../components/admin/ListRow';
import { RowPanel, SwitchRow } from '../../components/admin/FinanceKit';
import { buildReportText, DailyReport, fetchDailyReport, localToday } from '../../api/adminDailyReport';
import {
  loadReminderPrefs,
  markReportSent,
  parseTime,
  ReminderPrefs,
  saveReminderPrefs,
  syncDailyReportReminder,
  timeText,
} from '../../notifications/dailyReport';
import { sendToWhatsapp } from '../../utils/whatsapp';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { semantic } from '../../theme/tokens';
import { inr, shortTime } from '../../utils/format';

interface Props {
  onBack: () => void;
}

type Pick = 'today' | 'yesterday' | 'custom';
const CHIPS: { key: Pick; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'custom', label: 'Pick a date' },
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA');
}

// The end-of-day WhatsApp report: who clocked in and when, what was collected,
// what was sold. Nothing is sent automatically — the text opens in WhatsApp and
// the admin picks the group and presses send. A daily reminder (5:30 PM by
// default) brings the admin here.
export default function DailyReportScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [pick, setPick] = useState<Pick>('today');
  const [custom, setCustom] = useState(localToday());
  const date = pick === 'today' ? localToday() : pick === 'yesterday' ? yesterday() : custom;

  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);
  const [timeInput, setTimeInput] = useState('17:30');
  const [saving, setSaving] = useState(false);
  const [withJobs, setWithJobs] = useState(true);

  const load = useCallback(async () => {
    if (!DATE_RE.test(date)) return;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const r = await fetchDailyReport(date);
      if (mine !== seq.current) return;
      setReport(r);
      setError(null);
    } catch (e: unknown) {
      if (mine === seq.current) setError(e instanceof Error && e.message ? e.message : 'Could not build the report');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadReminderPrefs().then((p) => {
      setPrefs(p);
      setTimeInput(timeText(p));
    });
  }, []);

  const text = report ? buildReportText(report, withJobs) : '';

  const send = async () => {
    if (!report) return;
    try {
      await sendToWhatsapp(text);
      await markReportSent(report.date);
    } catch (e) {
      Alert.alert('Could not open WhatsApp', e instanceof Error ? e.message : 'Try Copy instead');
    }
  };

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied', 'Paste it into the WhatsApp group.');
    } catch {
      Alert.alert('Could not copy', 'Use Share instead.');
    }
  };

  const share = async () => {
    try {
      await Share.share({ message: text });
    } catch {
      // Dismissed.
    }
  };

  const saveReminder = async (next: ReminderPrefs) => {
    setSaving(true);
    try {
      await saveReminderPrefs(next);
      setPrefs(next);
      const ok = await syncDailyReportReminder(next);
      if (next.enabled && !ok) {
        Alert.alert('Reminder not set', 'Allow notifications for this app in the phone settings, then try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const saveTime = () => {
    const t = parseTime(timeInput);
    if (!t) return Alert.alert('Check the time', 'Use 24-hour time like 17:30.');
    saveReminder({ enabled: prefs?.enabled ?? true, hour: t.hour, minute: t.minute });
  };

  const t = report?.totals;
  return (
    <AdminScreen
      title="Daily Report"
      subtitle={`WhatsApp report · ${date}`}
      onBack={onBack}
      onRefresh={load}
      loading={loading && !report}
      error={!report ? error : null}
      toolbar={
        <View>
          <FilterChips items={CHIPS} activeKey={pick} onSelect={(k) => setPick(k as Pick)} />
          {pick === 'custom' ? (
            <View style={styles.dateRow}>
              <Field label="Date" value={custom} onChangeText={setCustom} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
            </View>
          ) : null}
        </View>
      }
    >
      {report && t ? (
        <>
          <StatGrid
            items={[
              { label: 'Clocked in', value: t.present, color: semantic.success },
              { label: 'Collected', value: inr(t.collected), color: t.collected ? semantic.success : undefined },
              { label: 'Jobs paid', value: t.jobs },
              { label: 'Sales', value: report.sales ? inr(report.sales.total) : '—' },
            ]}
          />

          <ActionButton label="Send on WhatsApp" onPress={send} />
          <View style={styles.pair}>
            <ActionButton label="Copy text" tone="neutral" onPress={copy} />
            <ActionButton label="Share…" tone="neutral" onPress={share} />
          </View>

          <RowPanel>
            <SwitchRow label="Include job details in the message" hint="Customer, place, map link, time and bill for every job" value={withJobs} onValueChange={setWithJobs} last />
          </RowPanel>

          <SectionLabel>Message preview</SectionLabel>
          <View style={[styles.preview, { backgroundColor: theme.panel, borderColor: theme.border }]}>
            <Text selectable style={[styles.previewText, { color: theme.text }]}>{text}</Text>
          </View>
          {report.sales === null ? (
            <Text style={[styles.hint, { color: theme.warn }]}>Sales could not be read, so they are left out of the message.</Text>
          ) : null}

          <SectionLabel>Jobs by employee</SectionLabel>
          {report.jobsKnown === false ? (
            <Text style={[styles.hint, { color: theme.warn }]}>Job details could not be loaded.</Text>
          ) : null}
          {report.staff.filter((s) => s.jobList.length > 0).length === 0 && report.jobsKnown ? (
            <Text style={[styles.hint, { color: theme.text3 }]}>No jobs were worked on this day.</Text>
          ) : null}
          {report.staff
            .filter((s) => s.jobList.length > 0)
            .map((s) => (
              <View key={s.id}>
                <Text style={[styles.person, { color: theme.text }]}>
                  {s.name} · {s.jobList.length} job{s.jobList.length === 1 ? '' : 's'}
                </Text>
                {s.jobList.map((j, i) => (
                  <ListRow
                    key={`${s.id}-${i}`}
                    icon="location"
                    title={j.customer}
                    subtitle={[j.ticket, j.service].filter(Boolean).join(' · ') + (j.address ? `\n${j.address}` : '')}
                    meta={[j.start ? `${shortTime(j.start)}${j.end ? ` – ${shortTime(j.end)}` : ''}` : '', j.status, j.note].filter(Boolean).join(' · ')}
                    value={j.amount > 0 ? inr(j.amount) : undefined}
                    valueColor={j.paid ? semantic.success : semantic.danger}
                    onPress={j.customerMap ? () => Linking.openURL(j.customerMap).catch(() => {}) : undefined}
                  />
                ))}
              </View>
            ))}

          <SectionLabel>Daily reminder</SectionLabel>
          <RowPanel>
            <SwitchRow
              label="Remind me every day"
              value={prefs?.enabled ?? true}
              onValueChange={(v) => saveReminder({ enabled: v, hour: prefs?.hour ?? 17, minute: prefs?.minute ?? 30 })}
              last
            />
          </RowPanel>
          <Field label="Reminder time (24-hour)" value={timeInput} onChangeText={setTimeInput} placeholder="17:30" keyboardType="numbers-and-punctuation" />
          <ActionButton label="Save time" tone="neutral" busy={saving} onPress={saveTime} />
          <Text style={[styles.hint, { color: theme.text3 }]}>
            At this time every day the phone shows a notification. Tap it, check the report, and send it to the group yourself.
          </Text>
        </>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  dateRow: { paddingHorizontal: spacing(4) },
  pair: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(2.5) },
  preview: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5) },
  previewText: { ...typography.body, lineHeight: 21 },
  hint: { ...typography.caption, marginTop: spacing(2), marginBottom: spacing(2) },
  person: { fontFamily: 'Manrope_700Bold', fontSize: 14, marginTop: spacing(2), marginBottom: spacing(1.5) },
});
