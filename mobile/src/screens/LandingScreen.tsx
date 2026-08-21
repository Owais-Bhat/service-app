import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import ThemeToggleButton from '../components/ThemeToggleButton';
import SegmentedTabs, { SegmentedTabItem } from '../components/SegmentedTabs';
import RequestWizard from '../components/RequestWizard';
import TrackPanel from '../components/TrackPanel';
import ComplaintPanel from '../components/ComplaintPanel';
import AdCarousel from '../components/AdCarousel';
import PromoPanel from '../components/PromoPanel';
import PopupAd from '../components/PopupAd';
import ContactCard from '../components/ContactCard';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
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

const TABS: SegmentedTabItem[] = [
  { key: 'request', label: 'New Request', icon: 'wrench' },
  { key: 'track', label: 'Track', icon: 'search' },
  { key: 'complaint', label: 'Complaint', icon: 'shield' },
  { key: 'install', label: 'Installation', icon: 'box' },
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
  const { theme } = useTheme();
  const [mode, setMode] = useState<Mode>('request');
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

  return (
    <View style={styles.root}>
      <MeshBackground />
      <PopupAd ad={showPopup ? popupAd : null} onDismiss={() => setShowPopup(false)} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing(4), paddingBottom: spacing(10), paddingHorizontal: spacing(5) }}
      >
        <Animated.View entering={FadeInUp.duration(550)} style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoChip}>
              <Text style={styles.logoLetter}>N</Text>
            </View>
            <Text style={[styles.wordmark, { color: theme.text }]}>NEST</Text>
          </View>
          <View style={styles.headerActions}>
            <ThemeToggleButton />
            <Pressable
              onPress={onStaffLogin}
              style={({ pressed }) => [styles.loginButton, { borderColor: theme.line, backgroundColor: theme.panel2 }, pressed && styles.pressed]}
            >
              <Text style={[styles.loginButtonText, { color: theme.text2 }]}>Staff Login</Text>
            </Pressable>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(80).duration(550)}>
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>Verified Service Request</Text>
          </View>
          <Text style={[styles.headline, { color: theme.text }]}>
            Need help?{'\n'}
            <Text style={styles.gradientHeadline}>We&apos;ll be there in minutes.</Text>
          </Text>
          <Text style={[styles.subcopy, { color: theme.text2 }]}>
            Raise a request in three quick steps. We verify by SMS, take your details and dispatch the right technician.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(140).duration(550)} style={{ marginBottom: spacing(5) }}>
          {ads.length > 0 ? <AdCarousel ads={ads} /> : <PromoPanel />}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(200).duration(550)} style={{ marginBottom: spacing(5) }}>
          <SegmentedTabs items={TABS} activeKey={mode} onSelect={(k) => setMode(k as Mode)} />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(260).duration(550)} style={{ marginBottom: spacing(6) }}>
          {mode === 'request' && <RequestWizard mode="request" issueOptions={issueOptions} />}
          {mode === 'install' && <RequestWizard mode="install" issueOptions={issueOptions} />}
          {mode === 'track' && <TrackPanel reopenButtonEnabled={reopenButtonEnabled} reopenLimit={reopenLimit} />}
          {mode === 'complaint' && <ComplaintPanel />}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(320).duration(550)}>
          <ContactCard />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(5) },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  logoChip: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.primary },
  logoLetter: { ...typography.heading, color: '#ffffff', fontSize: 16 },
  wordmark: { ...typography.heading, fontSize: 18 },
  loginButton: { paddingHorizontal: spacing(4), paddingVertical: spacing(2.5), borderRadius: radius.md, borderWidth: 1 },
  loginButtonText: { ...typography.caption, fontSize: 12 },
  pressed: { opacity: 0.7 },
  badge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(1.75),
    borderRadius: radius.full,
    backgroundColor: 'rgba(21,160,90,0.14)',
    marginBottom: spacing(4),
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: brand.primary },
  badgeText: { ...typography.caption, color: brand.primary, fontSize: 12 },
  headline: { ...typography.title, marginBottom: spacing(3) },
  gradientHeadline: { color: brand.primary },
  subcopy: { ...typography.body, marginBottom: spacing(5) },
});
