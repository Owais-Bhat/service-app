import React, { useEffect, useState } from 'react';
import { Overline, RowPanel, SwitchRow } from '../../components/admin/FinanceKit';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import ActionButton from '../../components/admin/ActionButton';
import Field from '../../components/admin/Field';
import {
  BookingRules,
  fetchBookingRules,
  saveBookingRules,
  AppSettings,
  fetchSettings,
  saveAutoClockOut,
  saveClockinRequirements,
  saveDeviceTracking,
  savePoolMinutes,
  savePopupEnabled,
  saveReopen,
} from '../../api/adminSettings';
import { fetchGeofence, fetchRegistrationKeys, regenerateRegistrationKey, saveGeofence, RegistrationKeys, Geofence } from '../../api/adminManage';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Tab = 'attendance' | 'security' | 'requests' | 'gig' | 'booking' | 'media';
const TABS: { key: Tab; label: string }[] = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'security', label: 'Security' },
  { key: 'requests', label: 'Requests' },
  { key: 'gig', label: 'Gig work' },
  { key: 'booking', label: 'Customer booking' },
  { key: 'media', label: 'Media' },
];

// The switches and limits the owner changes without a developer: clock-in rules,
// the office location, device tracking, the reopen policy, the gig-pool timeout
// and the registration keys. Every control saves on its own and says so.
export default function SettingsAdminScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>('attendance');
  const settings = useLoader(async () => {
    const [app, keys, geo] = await Promise.all([
      fetchSettings(),
      fetchRegistrationKeys().catch(() => null),
      fetchGeofence().catch(() => null),
    ]);
    return { app, keys, geo };
  }, 'Could not load settings');
  const [s, setS] = useState<AppSettings | null>(null);
  const [keys, setKeys] = useState<RegistrationKeys | null>(null);
  const [geo, setGeo] = useState<Geofence | null>(null);
  const [pool, setPool] = useState('');
  const [reopen, setReopen] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [radiusM, setRadiusM] = useState('150');
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rules, setRules] = useState<BookingRules | null>(null);
  const [minDues, setMinDues] = useState('0');
  const [radiusKm, setRadiusKm] = useState('0');

  useEffect(() => {
    fetchBookingRules()
      .then((r) => {
        setRules(r);
        setMinDues(String(r.minDuesRupees));
        setRadiusKm(String(r.radiusKm));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const d = settings.data;
    if (!d) return;
    setS(d.app);
    setKeys(d.keys);
    setGeo(d.geo);
    setPool(String(d.app.poolMinutes));
    setReopen(String(d.app.reopenLimit));
    setClockOut(d.app.autoClockOut);
    setRadiusM(String(d.geo?.radiusM || 150));
  }, [settings.data]);

  const run = async (key: string, fn: () => Promise<unknown>, apply: () => void) => {
    setBusy(key);
    try {
      await fn();
      apply();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const captureOffice = async () => {
    const r = Number(radiusM);
    if (!Number.isFinite(r) || r < 10 || r > 5000) return Alert.alert('Radius', 'Enter a radius from 10 to 5000 metres');
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return Alert.alert('Location', 'Allow location access to capture the office position.');
    setBusy('geo-save');
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude, radiusM: Math.round(r) };
      await saveGeofence(next);
      setGeo(next);
      Alert.alert('Office location saved', 'Clock-in is checked against where you are standing now.');
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const regenerate = (role: 'admin' | 'employee') =>
    Alert.alert('Regenerate key?', `The old ${role} registration key stops working immediately.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Regenerate',
        style: 'destructive',
        onPress: () =>
          run(`key-${role}`, () => regenerateRegistrationKey(role), () => {}).then(async () => {
            const next = await fetchRegistrationKeys().catch(() => null);
            if (next) setKeys(next);
          }),
      },
    ]);

  const copy = async (value: string) => {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', 'The key is on your clipboard.');
  };

  return (
    <AdminScreen
      title="Settings"
      subtitle="Rules and policies"
      onBack={onBack}
      onRefresh={settings.reload}
      loading={settings.loading}
      error={settings.error}
      toolbar={<FilterChips items={TABS} activeKey={tab} onSelect={(k) => setTab(k as Tab)} />}
    >
      {s ? (
        <>
          {tab === 'attendance' ? (
            <>
              <Overline>Clock-in</Overline>
              <RowPanel>
                <SwitchRow
                  disabled={busy === 'photo'}
                  label="Selfie required"
                  hint="Fixed employees take a photo to clock in"
                  value={s.photoRequired}
                  onValueChange={(v) => run('photo', () => saveClockinRequirements(v, s.geofenceRequired), () => setS({ ...s, photoRequired: v }))}
                />
                <SwitchRow
                  disabled={busy === 'geo'}
                  label="Office location required"
                  hint="Clock-in only inside the office radius"
                  value={s.geofenceRequired}
                  onValueChange={(v) => run('geo', () => saveClockinRequirements(s.photoRequired, v), () => setS({ ...s, geofenceRequired: v }))}
                  last
                />
              </RowPanel>
              <Field label="Auto clock-out time" value={clockOut} onChangeText={setClockOut} hint="Everyone still clocked in is clocked out at this time (HH:MM)" />
              <ActionButton
                label="Save clock-out time"
                tone="neutral"
                busy={busy === 'out'}
                onPress={() => run('out', () => saveAutoClockOut(clockOut.trim()), () => setS({ ...s, autoClockOut: clockOut.trim() }))}
              />

              <Overline style={{ marginTop: spacing(5) }}>Office geofence</Overline>
              <RowPanel style={{ padding: spacing(3.5), gap: spacing(2.5) }}>
                <Text style={[styles.coords, { color: theme.text }]}>
                  {geo?.lat != null && geo?.lng != null ? `${Number(geo.lat).toFixed(4)}, ${Number(geo.lng).toFixed(4)} · ${geo.radiusM} m` : 'No office location saved yet.'}
                </Text>
                <Field label="Allowed radius (metres)" value={radiusM} onChangeText={setRadiusM} keyboardType="numeric" />
                <ActionButton label="Use my current location as the office" tone="neutral" busy={busy === 'geo-save'} onPress={captureOffice} />
              </RowPanel>
            </>
          ) : null}

          {tab === 'security' ? (
            <>
              <Overline>Registration keys</Overline>
              {keys ? (
                (['employee', 'admin'] as const).map((role) => {
                  const value = keys[role] || '';
                  const visible = !!shown[role];
                  return (
                    <View key={role} style={[styles.keyBox, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                      <Text style={[styles.rowLabel, { color: theme.text }]}>{role === 'employee' ? 'Employee' : 'Admin'} registration key</Text>
                      <Text style={[styles.key, { color: value ? theme.text2 : theme.text3 }]} selectable>
                        {value ? (visible ? value : '•'.repeat(Math.min(value.length, 20))) : 'Not configured'}
                      </Text>
                      <View style={styles.keyActions}>
                        <ActionButton label={visible ? 'Hide' : 'Reveal'} tone="neutral" onPress={() => setShown((p) => ({ ...p, [role]: !visible }))} />
                        {value ? <ActionButton label="Copy" tone="neutral" onPress={() => copy(value)} /> : null}
                        <ActionButton label="Regenerate" tone="danger" busy={busy === `key-${role}`} onPress={() => regenerate(role)} />
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={[styles.hint, { color: theme.text3 }]}>The registration keys could not be loaded.</Text>
              )}
            </>
          ) : null}

          {tab === 'requests' ? (
            <>
              <Overline>Service</Overline>
              <RowPanel>
                <SwitchRow
                  disabled={busy === 'device'}
                  label="Device service tracking"
                  hint="Technicians can take a device for repair and log its return"
                  value={s.deviceTrackingEnabled}
                  onValueChange={(v) => run('device', () => saveDeviceTracking(v), () => setS({ ...s, deviceTrackingEnabled: v }))}
                />
                <SwitchRow
                  disabled={busy === 'reopen'}
                  label="Customers can reopen a ticket"
                  hint="Shows the Issue not resolved button on the public page"
                  value={s.reopenButtonEnabled}
                  onValueChange={(v) => run('reopen', () => saveReopen({ button_enabled: v }), () => setS({ ...s, reopenButtonEnabled: v }))}
                  last
                />
              </RowPanel>
              <Field label="Reopens allowed per ticket" value={reopen} onChangeText={setReopen} keyboardType="numeric" hint="0–99" />
              <ActionButton
                label="Save reopen limit"
                tone="neutral"
                busy={busy === 'limit'}
                onPress={() => {
                  const n = parseInt(reopen, 10);
                  if (!Number.isFinite(n) || n < 0 || n > 99) return Alert.alert('Reopen limit', 'Enter a number from 0 to 99');
                  run('limit', () => saveReopen({ limit: n }), () => setS({ ...s, reopenLimit: n }));
                }}
              />
            </>
          ) : null}

          {tab === 'gig' ? (
            <>
              <Overline>Gig pool</Overline>
              <Field label="Gig pool timeout (minutes)" value={pool} onChangeText={setPool} keyboardType="numeric" hint="An assigned job nobody accepts goes to the public pool after this long" />
              <ActionButton
                label="Save pool timeout"
                tone="neutral"
                busy={busy === 'pool'}
                onPress={() => {
                  const n = parseInt(pool, 10);
                  if (!Number.isFinite(n) || n < 1 || n > 1440) return Alert.alert('Pool timeout', 'Enter minutes from 1 to 1440');
                  run('pool', () => savePoolMinutes(n), () => setS({ ...s, poolMinutes: n }));
                }}
              />
            </>
          ) : null}

          {tab === 'booking' ? (
            rules ? (
              <>
                <Overline>Who can book a service</Overline>
                <RowPanel>
                  <SwitchRow
                    disabled={busy === 'dues'}
                    label="Block customers with a pending payment"
                    hint="A customer who still owes for an earlier job is asked to pay first"
                    value={rules.blockOnDues}
                    onValueChange={(v) => run('dues', () => saveBookingRules({ blockOnDues: v, minDuesRupees: rules.minDuesRupees, radiusKm: rules.radiusKm }), () => setRules({ ...rules, blockOnDues: v }))}
                    last
                  />
                </RowPanel>
                <Field label="Ignore dues below ₹" value={minDues} onChangeText={setMinDues} keyboardType="numeric" hint="Small leftovers under this amount do not block a booking" />
                <Field label="Service radius (km, 0 = no limit)" value={radiusKm} onChangeText={setRadiusKm} keyboardType="numeric" hint={`Measured from ${rules.centre.lat.toFixed(4)}, ${rules.centre.lng.toFixed(4)}${rules.centreIsDefault ? ' (the office location, or Srinagar if that is not set)' : ''}`} />
                <ActionButton
                  label="Save booking rules"
                  tone="neutral"
                  busy={busy === 'rules'}
                  onPress={() => {
                    const dues = Number(minDues);
                    const km = Number(radiusKm);
                    if (!Number.isFinite(km) || km < 0 || km > 2000) return Alert.alert('Radius', 'Enter a distance from 0 to 2000 km');
                    if (!Number.isFinite(dues) || dues < 0) return Alert.alert('Dues', 'Enter 0 or more');
                    run('rules', () => saveBookingRules({ blockOnDues: rules.blockOnDues, minDuesRupees: dues, radiusKm: km }), () => setRules({ ...rules, minDuesRupees: dues, radiusKm: km }));
                  }}
                />
              </>
            ) : (
              <Text style={[styles.hint, { color: theme.text3 }]}>The booking rules could not be loaded.</Text>
            )
          ) : null}

          {tab === 'media' ? (
            <>
              <Overline>Public page</Overline>
              <RowPanel>
                <SwitchRow
                  disabled={busy === 'popup'}
                  label="Landing popup ad"
                  hint="Show the popup ad once per visit"
                  value={s.popupEnabled}
                  onValueChange={(v) => run('popup', () => savePopupEnabled(v), () => setS({ ...s, popupEnabled: v }))}
                  last
                />
              </RowPanel>
            </>
          ) : null}
        </>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  rowLabel: { ...typography.body, fontFamily: 'Manrope_700Bold' },
  hint: { ...typography.caption, fontSize: 12, marginTop: 2 },
  coords: { ...typography.monoId, fontSize: 13 },
  keyBox: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5), marginBottom: spacing(2.5), gap: spacing(2) },
  key: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 15, letterSpacing: 2 },
  keyActions: { flexDirection: 'row', gap: spacing(2) },
});
