import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import RequestWizard, { WizardPhase } from '../components/RequestWizard';
import TrackPanel from '../components/TrackPanel';
import ComplaintPanel from '../components/ComplaintPanel';
import AdCarousel from '../components/AdCarousel';
import PromoPanel from '../components/PromoPanel';
import PopupAd from '../components/PopupAd';
import ContactCard from '../components/ContactCard';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import {
  getLandingBootstrap,
  issueOptionsFromCategories,
  filterAdsForPlacement,
  LandingAd,
  IssueOption,
} from '../api/landing';

interface Props {
  onStaffLogin: () => void;
}

type Mode = 'request' | 'track' | 'complaint' | 'install';

type Glyph = React.ComponentProps<typeof Ionicons>['name'];

// Design g_landing mode switch: a 4-up control, icon over label.
const TABS: { key: Mode; label: string; icon: Glyph; iconOn: Glyph }[] = [
  { key: 'request', label: 'New Request', icon: 'build-outline', iconOn: 'build' },
  { key: 'track', label: 'Track', icon: 'search-outline', iconOn: 'search' },
  { key: 'complaint', label: 'Complaint', icon: 'shield-checkmark-outline', iconOn: 'shield-checkmark' },
  { key: 'install', label: 'Installation', icon: 'construct-outline', iconOn: 'construct' },
];

const FALLBACK_ISSUE_OPTIONS: IssueOption[] = [
  { value: 'cctv-cameras', label: 'CCTV Cameras' },
  { value: 'networking-internet', label: 'Networking / Internet' },
  { value: 'biometric-attendance', label: 'Biometric & Attendance' },
  { value: 'gate-automation', label: 'Gate Automation' },
  { value: 'intercom-vdp', label: 'Intercom / VDP' },
  { value: 'other', label: 'Other' },
];

export default function LandingScreen({ onStaffLogin }: Props) {
  const insets = useSafeAreaInsets();
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<Mode>('request');
  const [phase, setPhase] = useState<WizardPhase>('start');
  const [wizardKey, setWizardKey] = useState(0);
  const [prefill, setPrefill] = useState<{ ticketNo: string; phone: string } | null>(null);
  const [ads, setAds] = useState<LandingAd[]>([]);
  const [popupAd, setPopupAd] = useState<LandingAd | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [reopenButtonEnabled, setReopenButtonEnabled] = useState(true);
  const [reopenLimit, setReopenLimit] = useState(2);
  const [issueOptions, setIssueOptions] = useState<IssueOption[]>(FALLBACK_ISSUE_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getLandingBootstrap();
        if (cancelled) return;
        setAds(filterAdsForPlacement(data.ads, 'landing'));
        setReopenButtonEnabled(data.reopenButtonEnabled !== false);
        setReopenLimit(typeof data.reopenLimit === 'number' ? data.reopenLimit : 2);
        setIssueOptions(issueOptionsFromCategories(data.categories || []));
        if (data.popupEnabled !== false) {
          const popups = filterAdsForPlacement(data.ads, 'popup_landing');
          if (popups.length > 0) {
            setPopupAd(popups[0]);
            setShowPopup(true);
          }
        }
      } catch {
        // Bootstrap is best-effort — the request/track/complaint flows all
        // work fine on their fallback data if this fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isWizard = mode === 'request' || mode === 'install';
  // The hero gives way to the form once the customer is past the first step,
  // and the whole shell steps aside for the booking confirmation.
  const success = isWizard && phase === 'success';
  const showHero = !isWizard || phase === 'start';

  const selectMode = (next: Mode) => {
    setPhase('start');
    setMode(next);
  };

  return (
    <View style={styles.root}>
      <MeshBackground />
      <PopupAd ad={showPopup ? popupAd : null} onDismiss={() => setShowPopup(false)} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + (success ? spacing(12) : spacing(2)),
          paddingBottom: success ? insets.bottom + spacing(10) : 112 + insets.bottom,
          paddingHorizontal: success ? spacing(6) : spacing(5),
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {!success && (
          <Animated.View entering={FadeInUp.duration(550)} style={styles.header}>
            <Image source={require('../../assets/images/logo.png')} style={styles.logoImage} resizeMode="contain" />
            <View style={styles.headerActions}>
              <Pressable
                onPress={toggleTheme}
                accessibilityRole="button"
                accessibilityLabel="Switch theme"
                style={({ pressed }) => [styles.iconButton, { borderColor: theme.line, backgroundColor: theme.panel2 }, pressed && styles.pressed]}
              >
                <Ionicons name="contrast-outline" size={20} color={theme.text2} />
              </Pressable>
              <Pressable
                onPress={onStaffLogin}
                accessibilityRole="button"
                style={({ pressed }) => [styles.loginButton, { borderColor: theme.line, backgroundColor: theme.panel2 }, pressed && styles.pressed]}
              >
                <Ionicons name="person-outline" size={16} color={theme.text2} />
                <Text style={[styles.loginButtonText, { color: theme.text2 }]}>Staff Login</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {!success && showHero && (
          <Animated.View entering={FadeInUp.delay(80).duration(550)} style={styles.hero}>
            <View style={[styles.badge, { backgroundColor: theme.okS }]}>
              <Ionicons name="shield-checkmark" size={14} color={theme.accent} />
              <Text style={[styles.badgeText, { color: theme.accent }]}>Verified technicians</Text>
            </View>
            <Text style={[typography.largeTitle, { color: theme.text }]}>Need help with CCTV, Wi‑Fi or access control?</Text>
            <Text style={[typography.body, styles.subcopy, { color: theme.text2 }]}>
              Raise a request in three steps. We verify your number by SMS and send the right technician.
            </Text>
          </Animated.View>
        )}

        {!success && showHero && (
          <Animated.View entering={FadeInUp.delay(140).duration(550)} style={{ marginBottom: spacing(5) }}>
            {ads.length > 0 ? <AdCarousel ads={ads} /> : <PromoPanel />}
          </Animated.View>
        )}

        {!success && (
          <Animated.View entering={FadeInUp.delay(200).duration(550)}>
            <View
              accessibilityRole="tablist"
              style={[styles.tabs, { backgroundColor: theme.panel2, borderColor: theme.line }]}
            >
              {TABS.map((t) => {
                const active = t.key === mode;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => selectMode(t.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.tab,
                      active
                        ? { backgroundColor: theme.panel, borderColor: theme.border }
                        : { borderColor: 'transparent' },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name={active ? t.iconOn : t.icon} size={20} color={active ? theme.accent : theme.text2} />
                    <Text
                      numberOfLines={1}
                      style={[styles.tabLabel, { color: active ? theme.text : theme.text2, fontFamily: active ? 'Manrope_700Bold' : 'Manrope_600SemiBold' }]}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInUp.delay(260).duration(550)}>
          {mode === 'request' && (
            <RequestWizard
              key={`request-${wizardKey}`}
              mode="request"
              issueOptions={issueOptions}
              onPhase={setPhase}
              onTrack={(ticketNo, phone) => { setPrefill({ ticketNo, phone }); selectMode('track'); }}
              onDone={() => { setWizardKey((k) => k + 1); setPhase('start'); }}
            />
          )}
          {mode === 'install' && (
            <RequestWizard
              key={`install-${wizardKey}`}
              mode="install"
              issueOptions={issueOptions}
              onPhase={setPhase}
              onTrack={(ticketNo, phone) => { setPrefill({ ticketNo, phone }); selectMode('track'); }}
              onDone={() => { setWizardKey((k) => k + 1); setPhase('start'); }}
            />
          )}
          {mode === 'track' && (
            <TrackPanel
              key={prefill ? `track-${prefill.ticketNo}` : 'track'}
              reopenButtonEnabled={reopenButtonEnabled}
              reopenLimit={reopenLimit}
              initialTicketNo={prefill?.ticketNo}
              initialPhone={prefill?.phone}
            />
          )}
          {mode === 'complaint' && <ComplaintPanel />}
        </Animated.View>
      </ScrollView>

      {!success && <ContactCard />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(5) },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  logoImage: { width: 83, height: 40, marginLeft: -8 },
  iconButton: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  loginButton: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
  },
  loginButtonText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  pressed: { opacity: 0.7 },
  hero: { marginBottom: spacing(5) },
  badge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: radius.full,
    marginBottom: 14,
  },
  badgeText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  subcopy: { marginTop: spacing(2) },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing(4),
  },
  tab: {
    flex: 1,
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabLabel: { fontSize: 11, letterSpacing: -0.1 },
});
