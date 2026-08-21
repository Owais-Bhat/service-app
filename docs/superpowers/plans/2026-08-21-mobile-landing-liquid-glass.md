# Mobile Landing Screen — Liquid Glass Redesign + Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `mobile/src/screens/LandingScreen.tsx` in full liquid-glass style (blurred `GlassCard` surfaces, gradient CTA glow, gradient headline text, staggered rise-in animation) on NEST's existing emerald token set, and bring it to feature parity with the web app's landing page (`src/pages/landing.js`): a 4-mode tab flow (New Request / Track / Complaint / Installation) with an OTP-gated 3-step wizard for New Request and Installation, an ad carousel + popup ad, a theme toggle, and a call/WhatsApp contact card.

**Architecture:** New reusable components under `mobile/src/components/` (SegmentedTabs, StepIndicator, ThemeToggleButton, ContactCard, PromoPanel, AdCarousel, PopupAd, InstallTypeGrid, RequestWizard, TrackPanel, ComplaintPanel) composed inside a rewritten `LandingScreen.tsx`. A new `mobile/src/api/` module per backend concern (`otp.ts`, `complaints.ts`, `landing.ts`), following the existing `api.get/post` (client.ts) and `dataPost` (client.ts) patterns already used by `mobile/src/api/inquiries.ts`. Fourteen new icon paths added to the existing hand-drawn icon registry (`mobile/src/theme/icons.ts`).

**Tech Stack:** React Native (Expo SDK 57), TypeScript (strict), `react-native-reanimated` v4 for animation, `expo-blur` for glass surfaces (already used by `GlassCard`/`GlassSurface`), `expo-location` for GPS (already a dependency, not yet used elsewhere), OpenStreetMap Nominatim for reverse geocoding (no key, matches what the web app already uses), `@react-native-async-storage/async-storage` (already used by `ThemeContext`).

**No test runner exists in `mobile/`** (`package.json` has no `test` script, no Jest/RN Testing Library dependency) — verification per task is `cd mobile && npx tsc --noEmit` (strict typecheck) plus a manual smoke-test note, not a TDD red/green cycle. This matches how the rest of `mobile/` has been built (recent commits are feature/UI commits with no accompanying test files).

---

## Reference facts gathered from the web app (`src/pages/landing.js`, `server/index.cjs`)

- OTP endpoints: `POST /otp/send {phone}`, `POST /otp/verify {phone, otp}`, `POST /otp/resend {phone}` — all under the API's `/api` prefix. Verify returns no token; the client just advances its local step on success (`res.ok`). OTP is a UX-only gate — the inquiry-submission endpoint itself doesn't require a verified-OTP session server-side.
- Inquiry submission: `POST /api/data/inquiries` with `{ full_name, phone, location, customer_lat, customer_lng, bill_no, service_item, description, status:'open', assignment_status:'none', ticket_no, preferred_time }`. Mobile already has this exact shape in `mobile/src/api/inquiries.ts`'s `submitInquiry()` — **reuse it as-is**, no new inquiry API needed. Installation mode sets `service_item` to `` `Installation — ${installType}` `` — same endpoint, same function.
- Complaint submission: `POST /api/data/complaints` with `{ ticket_no, phone, complaint_text }` (server validates the ticket belongs to that phone before inserting — see `server/index.cjs:6617-6640`). No existing mobile wrapper — add one.
- `GET /api/landing/bootstrap` → `{ ads, popupEnabled, reopenButtonEnabled, reopenLimit, categories }`. `ads` is the combined list (both `landing` and `popup_landing` placements) — the client splits by `placement` and filters by `device_target`/`starts_at`/`expires_at` itself (`filterAds()` in web). No existing mobile wrapper — add one.
- Web's Details step (shared by New Request and Installation) collects: name, location (GPS-detect via reverse geocode, or manual text), preferred visit time (fixed 5-option dropdown), optional device bill number, then either an issue dropdown (New Request) or an install-type banner with "Change" (Installation), then optional description, then submit.
- GPS detect: `navigator.geolocation.getCurrentPosition` + a free reverse-geocode call to `https://nominatim.openstreetmap.org/reverse?format=json&lat=..&lon=..&zoom=18&addressdetails=1`, falling back to a raw `GPS: {lat}, {lng}` string if that fails.
- Ad shape: `{ id, url, kind?: 'image'|'video', device_target?: 'mobile'|'desktop'|'both', placement?: string, starts_at?, expires_at? }`. Video ads are **out of scope for mobile v1** (no video-player dependency exists yet in `mobile/`; adding one for ads alone isn't worth the new dependency — image ads only).
- Layout order (web): nav (brand + theme toggle + staff login) → badge + gradient headline + subcopy → ad carousel (or a static promo/stats panel when there are no ads) → glass card with 4 mode tabs + step indicator + step body → contact section (call/WhatsApp) → popup ad (shown once on load if `popupEnabled` and a popup ad exists).
- The existing mobile `LandingScreen.tsx`'s "Our Services" grid (CCTV/Networking/Biometric/Gate Automation/VDP) has no web-landing equivalent — it's superseded by the Installation tab's type grid and is dropped to avoid duplicating that content.

---

## Task 1: New icon paths

**Files:**
- Modify: `mobile/src/theme/icons.ts`

- [ ] **Step 1: Add 14 new icon entries**

Add these entries to the `ICONS` object in `mobile/src/theme/icons.ts` (insert after the existing `report` entry, before the closing `} as const;`):

```ts
  search: ['M11 4.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z', 'M20.5 20.5l-4.3-4.3'],
  shield: ['M12 3.3l7 3v5.4c0 5-3 8-7 9.5-4-1.5-7-4.5-7-9.5V6.3z'],
  box: ['M4 8l8-4.5L20 8v8l-8 4.5L4 16z', 'M4 8l8 4.5 8-4.5', 'M12 12.5V21'],
  sun: [
    'M12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9z',
    'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  ],
  moon: ['M20 14.5A8.5 8.5 0 1110 3.3 7 7 0 0020 14.5z'],
  phone: ['M6.6 3.5l3 3-1.8 2.2a13 13 0 006.5 6.5l2.2-1.8 3 3-2 2c-.8.8-2 1-3 .6A17.5 17.5 0 014.6 6.5c-.4-1 0-2.2.6-3z'],
  whatsapp: [
    'M6 18l1.2-3.5A7.5 7.5 0 1110 19.5L6 18z',
    'M9.2 10c0-.3.2-.6.5-.6h.5l.6 1.6-.7.9c.4 1 1.2 1.8 2.2 2.2l.9-.7 1.6.6v.5c0 .3-.3.6-.6.6-2.7 0-5-2.2-5-5z',
  ],
  crosshair: ['M12 3v4M12 17v4M3 12h4M17 12h4', 'M12 15a3 3 0 100-6 3 3 0 000 6z'],
  edit: ['M4 20l1-4.5L16 4.5a2 2 0 012.8 0l.7.7a2 2 0 010 2.8L8.5 19l-4.5 1z', 'M14 6.5l3.5 3.5'],
  refresh: ['M4 12a8 8 0 0113.6-5.7M20 12a8 8 0 01-13.6 5.7', 'M17 3v4h-4', 'M7 21v-4h4'],
  'arrow-right': ['M4 12h16', 'M13 5l7 7-7 7'],
  pin: ['M12 21s7-6.5 7-11.5A7 7 0 105 9.5C5 14.5 12 21 12 21z', 'M12 11a2 2 0 100-4 2 2 0 000 4z'],
  receipt: ['M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z', 'M9 8h6M9 12h6M9 16h3'],
  close: ['M5 5l14 14', 'M19 5L5 19'],
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors (icons.ts changes are additive; `IconName` widens automatically since it's `keyof typeof ICONS`).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/theme/icons.ts
git commit -m "$(cat <<'EOF'
feat(mobile): add icons needed for the landing screen redesign

search/shield/box/sun/moon/phone/whatsapp/crosshair/edit/refresh/
arrow-right/pin/receipt/close — same hand-drawn stroke-path style as the
existing registry, sized for Icon.tsx's outline renderer.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: API layer — OTP, complaints, landing bootstrap

**Files:**
- Create: `mobile/src/api/otp.ts`
- Create: `mobile/src/api/complaints.ts`
- Create: `mobile/src/api/landing.ts`

- [ ] **Step 1: Write `mobile/src/api/otp.ts`**

```ts
import { api } from './client';

// UX-only gate — mirrors web's sendSmsOTP/verifySmsOTP/resendSmsOTP
// (src/pages/landing.js). Verify returns no token; the caller just advances
// its local wizard step on success. Inquiry submission itself doesn't
// require a verified-OTP session server-side.
export function sendOtp(phone: string): Promise<unknown> {
  return api.post('/otp/send', { phone });
}

export function verifyOtp(phone: string, otp: string): Promise<unknown> {
  return api.post('/otp/verify', { phone, otp });
}

export function resendOtp(phone: string): Promise<unknown> {
  return api.post('/otp/resend', { phone });
}
```

- [ ] **Step 2: Write `mobile/src/api/complaints.ts`**

```ts
import { dataPost } from './client';

export interface ComplaintInput {
  ticket_no: string;
  phone: string;
  complaint_text: string;
}

export interface Complaint {
  id: string;
  ticket_no: string;
  phone: string;
  complaint_text: string;
  status: string;
  created_at: string;
}

// Public, unauthenticated — server verifies ticket_no+phone match an
// existing inquiry before inserting (server/index.cjs's dataAuth
// `complaints` POST-without-Authorization branch).
export function submitComplaint(input: ComplaintInput): Promise<Complaint> {
  return dataPost<Complaint>('complaints', input);
}
```

- [ ] **Step 3: Write `mobile/src/api/landing.ts`**

```ts
import { api } from './client';

export interface LandingAd {
  id: string;
  url: string;
  kind?: 'image' | 'video';
  device_target?: 'mobile' | 'desktop' | 'both';
  placement?: string;
  starts_at?: string | null;
  expires_at?: string | null;
}

export interface LandingBootstrap {
  ads: LandingAd[];
  popupEnabled: boolean;
  reopenButtonEnabled: boolean;
  reopenLimit: number;
  categories: string[];
}

export function getLandingBootstrap(): Promise<LandingBootstrap> {
  return api.get<LandingBootstrap>('/landing/bootstrap');
}

export interface IssueOption {
  value: string;
  label: string;
}

const OTHER_OPTION: IssueOption = { value: 'other', label: 'Other' };

const FALLBACK_ISSUE_OPTIONS: IssueOption[] = [
  { value: 'cctv-cameras', label: 'CCTV Cameras' },
  { value: 'networking-internet', label: 'Networking / Internet' },
  { value: 'biometric-attendance', label: 'Biometric & Attendance' },
  { value: 'gate-automation', label: 'Gate Automation' },
  { value: 'intercom-vdp', label: 'Intercom / VDP' },
  OTHER_OPTION,
];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Mirrors web's category-dedup logic in loadLandingBootstrap().
export function issueOptionsFromCategories(categories: string[]): IssueOption[] {
  const seen = new Map<string, IssueOption>();
  categories.forEach((raw) => {
    const label = String(raw || '').trim();
    if (!label) return;
    const value = slugify(label);
    if (!seen.has(value)) seen.set(value, { value, label });
  });
  return seen.size ? [...seen.values(), OTHER_OPTION] : FALLBACK_ISSUE_OPTIONS;
}

// Mirrors web's filterAds() + the placement split in loadLandingBootstrap() —
// combined into one pass since the native app is always "mobile" (no
// isMobileView media-query branch needed).
export function filterAdsForPlacement(
  ads: LandingAd[],
  placement: 'landing' | 'popup_landing',
): LandingAd[] {
  const now = Date.now();
  return ads.filter((ad) => {
    if (!ad || !ad.url) return false;
    if (ad.kind === 'video') return false;
    if ((ad.device_target || 'both') === 'desktop') return false;
    if ((ad.placement || 'landing') !== placement) return false;
    if (ad.starts_at && new Date(ad.starts_at).getTime() > now) return false;
    if (ad.expires_at && new Date(ad.expires_at).getTime() <= now) return false;
    return true;
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/api/otp.ts mobile/src/api/complaints.ts mobile/src/api/landing.ts
git commit -m "$(cat <<'EOF'
feat(mobile): add OTP, complaint, and landing-bootstrap API wrappers

Same backend endpoints and payload shapes the web app already uses
(src/pages/landing.js) — no server changes needed. submitInquiry already
covered New Request/Installation submission (mobile/src/api/inquiries.ts),
so only these three were missing.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: ThemeToggleButton, ContactCard, PromoPanel

**Files:**
- Create: `mobile/src/components/ThemeToggleButton.tsx`
- Create: `mobile/src/components/ContactCard.tsx`
- Create: `mobile/src/components/PromoPanel.tsx`

- [ ] **Step 1: Write `mobile/src/components/ThemeToggleButton.tsx`**

```tsx
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme';
import Icon from './Icon';

export default function ThemeToggleButton() {
  const { theme, mode, toggleTheme } = useTheme();
  return (
    <Pressable
      onPress={toggleTheme}
      style={({ pressed }) => [
        styles.btn,
        { borderColor: theme.line, backgroundColor: theme.panel2 },
        pressed && styles.pressed,
      ]}
      hitSlop={8}
      accessibilityLabel="Toggle light/dark theme"
    >
      <Icon name={mode === 'dark' ? 'sun' : 'moon'} size={17} color={theme.text2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
```

- [ ] **Step 2: Write `mobile/src/components/ContactCard.tsx`**

```tsx
import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import GlassCard from './GlassCard';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import Icon from './Icon';

const PHONE_DISPLAY = '+91 88991 33144';
const PHONE_TEL = 'tel:+918899133144';
const WHATSAPP_URL =
  'https://wa.me/918899133144?text=' +
  encodeURIComponent('Hello Networking Experts, I need help with a service request.');

// Mirrors web's `.srf-contact-section` — same number, same two actions.
export default function ContactCard() {
  const { theme } = useTheme();
  return (
    <GlassCard>
      <Text style={[styles.kicker, { color: brand.primary }]}>24×7 HELPLINE</Text>
      <Text style={[styles.number, { color: theme.text }]}>{PHONE_DISPLAY}</Text>
      <Text style={[styles.note, { color: theme.text2 }]}>
        Service requests, billing and technician updates.
      </Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => Linking.openURL(PHONE_TEL)}
          style={({ pressed }) => [styles.action, { backgroundColor: theme.surfaceStrong }, pressed && styles.pressed]}
        >
          <Icon name="phone" size={16} color={theme.text} />
          <Text style={[styles.actionLabel, { color: theme.text }]}>Call</Text>
        </Pressable>
        <Pressable
          onPress={() => Linking.openURL(WHATSAPP_URL)}
          style={({ pressed }) => [styles.action, { backgroundColor: `${semantic.success}33` }, pressed && styles.pressed]}
        >
          <Icon name="whatsapp" size={16} color={semantic.success} />
          <Text style={[styles.actionLabel, { color: semantic.success }]}>WhatsApp</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  kicker: { ...typography.caption, fontSize: 10, letterSpacing: 2 },
  number: { ...typography.heading, fontSize: 20, marginTop: spacing(1) },
  note: { ...typography.body, fontSize: 12, marginTop: spacing(1), marginBottom: spacing(4) },
  row: { flexDirection: 'row', gap: spacing(3) },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
    paddingVertical: spacing(3),
    borderRadius: radius.md,
  },
  pressed: { opacity: 0.75 },
  actionLabel: { ...typography.caption, fontSize: 12 },
});
```

- [ ] **Step 3: Write `mobile/src/components/PromoPanel.tsx`**

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import GlassCard from './GlassCard';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

const STATS = [
  { value: '12hr', label: 'Avg. resolution' },
  { value: '4,200+', label: 'Jobs completed' },
  { value: '4.9★', label: 'Customer rating' },
];

// Shown instead of the ad carousel when there are no active ads — mirrors
// web's `.promo` fallback block in the same slot.
export default function PromoPanel() {
  const { theme } = useTheme();
  return (
    <GlassCard>
      <Text style={[styles.tag, { color: brand.primary }]}>NEST SMART SECURITY</Text>
      <Text style={[styles.title, { color: theme.text }]}>
        CCTV, networking &amp; automation — installed and supported by experts.
      </Text>
      <View style={styles.statsRow}>
        {STATS.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={[styles.statValue, { color: brand.primary }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: theme.text3 }]}>{s.label}</Text>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  tag: { ...typography.caption, fontSize: 10, letterSpacing: 1.5, marginBottom: spacing(2) },
  title: { ...typography.heading, fontSize: 16, lineHeight: 22, marginBottom: spacing(4) },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'flex-start' },
  statValue: { ...typography.heading, fontSize: 16 },
  statLabel: { ...typography.caption, fontSize: 10, marginTop: spacing(0.5) },
});
```

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ThemeToggleButton.tsx mobile/src/components/ContactCard.tsx mobile/src/components/PromoPanel.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): add theme toggle, contact card, and promo panel components

Three of the landing screen's missing pieces relative to web: a UI control
for the theme mode that ThemeContext already supports, the call/WhatsApp
contact block, and the no-ads-available fallback panel.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: SegmentedTabs, StepIndicator

**Files:**
- Create: `mobile/src/components/SegmentedTabs.tsx`
- Create: `mobile/src/components/StepIndicator.tsx`

- [ ] **Step 1: Write `mobile/src/components/SegmentedTabs.tsx`**

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
import Icon from './Icon';
import { IconName } from '../theme/icons';

export interface SegmentedTabItem {
  key: string;
  label: string;
  icon: IconName;
}

interface Props {
  items: SegmentedTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}

// Glass segmented control for the landing screen's 4 request modes —
// mirrors web's `.srf-mode-tab` row. Distinct from GlassTabBar (that one's
// the app's persistent bottom nav chrome); this is a same-screen mode
// switch, so it reads as a panel within the surrounding glass card.
export default function SegmentedTabs({ items, activeKey, onSelect }: Props) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, { borderColor: theme.border, backgroundColor: theme.panel2 }]}>
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            onPress={() => onSelect(item.key)}
            style={({ pressed }) => [
              styles.tab,
              active && { backgroundColor: theme.surfaceStrong },
              pressed && styles.pressed,
            ]}
            hitSlop={4}
          >
            <Icon name={item.icon} size={15} color={active ? brand.primary : theme.text3} />
            <Text style={[styles.label, { color: active ? brand.primary : theme.text3 }]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing(1),
    gap: spacing(1),
  },
  tab: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(2.5),
    borderRadius: radius.sm,
  },
  pressed: { opacity: 0.7 },
  label: { ...typography.caption, fontSize: 11 },
});
```

- [ ] **Step 2: Write `mobile/src/components/StepIndicator.tsx`**

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme';
import { brand } from '../theme/tokens';

interface Props {
  steps: string[];
  activeIndex: number;
}

// Mirrors web's `.stepper` — a labelled progress bar above the request
// wizard's active step.
export default function StepIndicator({ steps, activeIndex }: Props) {
  const { theme } = useTheme();
  return (
    <View style={styles.row}>
      {steps.map((label, i) => {
        const on = i <= activeIndex;
        return (
          <View key={label} style={styles.col}>
            <View
              style={[
                styles.bar,
                { backgroundColor: on ? brand.primary : theme.line },
                i === activeIndex && { shadowColor: brand.primary, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
              ]}
            />
            <Text style={[styles.label, { color: on ? brand.primary : theme.text3 }]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(4) },
  col: { flex: 1, gap: spacing(1.5) },
  bar: { height: 4, borderRadius: 2 },
  label: { ...typography.caption, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
});
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/SegmentedTabs.tsx mobile/src/components/StepIndicator.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): add SegmentedTabs and StepIndicator components

Reusable glass segmented control (the 4 landing modes) and wizard
progress bar (Verify/OTP/Details), mirroring web's .srf-mode-tab and
.stepper.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: AdCarousel, PopupAd

**Files:**
- Create: `mobile/src/components/AdCarousel.tsx`
- Create: `mobile/src/components/PopupAd.tsx`

- [ ] **Step 1: Write `mobile/src/components/AdCarousel.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';
import { brand } from '../theme/tokens';
import { LandingAd } from '../api/landing';

interface Props {
  ads: LandingAd[];
  autoRotateMs?: number;
}

const HEIGHT = 160;

// Image-only rotating banner — mirrors web's AdCarousel minus video support
// (no video-player dependency exists in mobile/ yet; adding one for ads
// alone isn't worth it, see plan's reference-facts section).
export default function AdCarousel({ ads, autoRotateMs = 5000 }: Props) {
  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    setIndex(0);
    if (ads.length <= 1) return undefined;
    timer.current = setInterval(() => {
      setIndex((i) => (i + 1) % ads.length);
    }, autoRotateMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [ads, autoRotateMs]);

  if (ads.length === 0) return null;
  const ad = ads[index];

  return (
    <View style={[styles.wrap, { borderColor: theme.border, backgroundColor: theme.panel2 }]}>
      <Image source={{ uri: ad.url }} style={styles.image} resizeMode="cover" />
      {ads.length > 1 && (
        <View style={styles.dots}>
          {ads.map((a, i) => (
            <View key={a.id} style={[styles.dot, { backgroundColor: i === index ? brand.primary : theme.line }]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', height: HEIGHT },
  image: { width: '100%', height: '100%' },
  dots: { position: 'absolute', bottom: spacing(2.5), alignSelf: 'center', flexDirection: 'row', gap: spacing(1.5) },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
```

- [ ] **Step 2: Write `mobile/src/components/PopupAd.tsx`**

```tsx
import React from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme';
import Icon from './Icon';
import { LandingAd } from '../api/landing';

interface Props {
  ad: LandingAd | null;
  onDismiss: () => void;
}

// Mirrors web's popup-placement ad — a single dismissible modal, first ad
// only (web doesn't rotate popups either), shown once per landing visit.
export default function PopupAd({ ad, onDismiss }: Props) {
  const { theme } = useTheme();
  if (!ad) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}>
          <Image source={{ uri: ad.url }} style={styles.image} resizeMode="cover" />
          <Pressable
            onPress={onDismiss}
            style={[styles.close, { backgroundColor: theme.panel2 }]}
            hitSlop={8}
            accessibilityLabel="Dismiss"
          >
            <Icon name="close" size={16} color={theme.text} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(6) },
  card: { width: '100%', maxWidth: 360, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 1.4 },
  close: {
    position: 'absolute',
    top: spacing(2.5),
    right: spacing(2.5),
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/AdCarousel.tsx mobile/src/components/PopupAd.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): add AdCarousel and PopupAd components

Image-only rotating banner and a dismissible popup modal, sourced from
GET /landing/bootstrap — the ad system web already has and mobile didn't.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: InstallTypeGrid

**Files:**
- Create: `mobile/src/components/InstallTypeGrid.tsx`

- [ ] **Step 1: Write `mobile/src/components/InstallTypeGrid.tsx`**

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { categoryColors, CategoryStyle } from '../theme/tokens';

export interface InstallType {
  key: string;
  label: string;
  tagline: string;
  style: CategoryStyle;
}

// Ported verbatim (labels/taglines) from web's INSTALL_TYPES
// (src/pages/landing.js) — colors mapped onto the app's existing
// categoryColors where a direct match exists, reused creatively where it
// doesn't (WiFi/AP -> Networking's teal, Smart Home -> Gate Automation's
// amber) rather than introducing new hues.
export const INSTALL_TYPES: InstallType[] = [
  { key: 'cctv', label: 'CCTV Camera Installation', tagline: 'HD/IP cameras, DVR/NVR & remote viewing', style: categoryColors.CCTV },
  { key: 'networking', label: 'Networking & LAN Setup', tagline: 'Structured cabling, switches & routers', style: categoryColors.Networking },
  { key: 'wifi', label: 'WiFi / Access Point Setup', tagline: 'Whole-home / office coverage', style: categoryColors.Networking },
  { key: 'biometric', label: 'Biometric & Access Control', tagline: 'Fingerprint, RFID & door locks', style: categoryColors['Access Control / Biometric'] },
  { key: 'vdp', label: 'Video Door Phone / Intercom', tagline: 'See & speak to visitors', style: categoryColors['Video Door Phone'] },
  { key: 'smart-home', label: 'Smart Home Automation', tagline: 'Lights, sensors & smart control', style: categoryColors['Gate Automation'] },
];

interface Props {
  onSelect: (type: InstallType) => void;
}

export default function InstallTypeGrid({ onSelect }: Props) {
  const { theme } = useTheme();
  return (
    <View style={styles.grid}>
      {INSTALL_TYPES.map((t) => (
        <Pressable
          key={t.key}
          onPress={() => onSelect(t)}
          style={({ pressed }) => [
            styles.card,
            { borderColor: theme.line, backgroundColor: theme.panel2 },
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: t.style.bg }]}>
            <Text style={[styles.initials, { color: t.style.color }]}>{t.style.initials}</Text>
          </View>
          <Text style={[styles.label, { color: theme.text }]} numberOfLines={2}>{t.label}</Text>
          <Text style={[styles.tagline, { color: theme.text3 }]} numberOfLines={2}>{t.tagline}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2.5) },
  card: { width: '47%', borderRadius: radius.md, borderWidth: 1, padding: spacing(3.5), gap: spacing(1.5) },
  pressed: { opacity: 0.75 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: 'Manrope_700Bold', fontSize: 10 },
  label: { ...typography.caption, fontSize: 12 },
  tagline: { ...typography.body, fontSize: 10.5, lineHeight: 14 },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/InstallTypeGrid.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): add InstallTypeGrid component

The 6 fixed installation categories from web's INSTALL_TYPES, as tappable
cards that feed into the request wizard's installType.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: RequestWizard (New Request + Installation)

**Files:**
- Create: `mobile/src/components/RequestWizard.tsx`

This is the shared 3-step wizard (Verify → OTP → Details) for both New Request and Installation modes. Installation mode additionally shows the `InstallTypeGrid` before step 1 until a type is picked.

- [ ] **Step 1: Write `mobile/src/components/RequestWizard.tsx`**

```tsx
import React, { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';
import Icon from './Icon';
import StepIndicator from './StepIndicator';
import InstallTypeGrid, { InstallType } from './InstallTypeGrid';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { sendOtp, verifyOtp, resendOtp } from '../api/otp';
import { submitInquiry, Inquiry } from '../api/inquiries';
import { IssueOption } from '../api/landing';

interface Props {
  mode: 'request' | 'install';
  issueOptions: IssueOption[];
}

const PREFERRED_TIMES = ['Morning (10 AM - 1 PM)', 'Afternoon (1 PM - 4 PM)', 'Evening (4 PM - 6 PM)', 'Tomorrow Morning', "I'm Flexible"];
const CAPTCHA_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function makeCaptcha(): string {
  return Array.from({ length: 5 }, () => CAPTCHA_LETTERS[Math.floor(Math.random() * CAPTCHA_LETTERS.length)]).join('');
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
    const data = await res.json();
    return data.display_name || '';
  } catch {
    return '';
  }
}

export default function RequestWizard({ mode, issueOptions }: Props) {
  const { theme } = useTheme();

  const [installType, setInstallType] = useState<InstallType | null>(null);
  const [step, setStep] = useState(0); // 0 = verify, 1 = otp, 2 = details, 3 = success
  const [phone, setPhone] = useState('');
  const [captcha, setCaptcha] = useState(makeCaptcha);
  const [capInput, setCapInput] = useState('');
  const [otp, setOtp] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [locationMode, setLocationMode] = useState<'gps' | 'manual'>('manual');
  const [locationValue, setLocationValue] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [preferredTime, setPreferredTime] = useState(PREFERRED_TIMES[0]);
  const [billNo, setBillNo] = useState('');
  const [issueValue, setIssueValue] = useState(issueOptions[0]?.value ?? '');
  const [otherIssue, setOtherIssue] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<Inquiry | null>(null);

  const needsInstallPick = mode === 'install' && !installType;

  const handleSendOtp = async () => {
    if (phone.length !== 10) { setOtpError('Enter a valid 10-digit number'); return; }
    if (capInput.trim().toUpperCase() !== captcha) {
      setOtpError('Those letters don’t match — try again');
      setCaptcha(makeCaptcha());
      setCapInput('');
      return;
    }
    setOtpError(null);
    setSendingOtp(true);
    try {
      await sendOtp('+91' + phone);
      setStep(1);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Could not send OTP');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setOtpError('Enter the full 6-digit code'); return; }
    setOtpError(null);
    setVerifyingOtp(true);
    try {
      await verifyOtp('+91' + phone, otp);
      setStep(2);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Incorrect code');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      await resendOtp('+91' + phone);
      setOtpError(null);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Could not resend OTP');
    }
  };

  const handleDetectLocation = async () => {
    setDetecting(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setFormError('Location permission denied — switch to manual entry');
        setLocationMode('manual');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setCoords({ lat, lng });
      const address = await reverseGeocode(lat, lng);
      setLocationValue(address || `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    } catch {
      setFormError('Could not detect location — switch to manual entry');
      setLocationMode('manual');
    } finally {
      setDetecting(false);
    }
  };

  const handleSubmit = async () => {
    const issueLabel = issueOptions.find((o) => o.value === issueValue)?.label || '';
    if (!name.trim()) { setFormError('Please enter your name'); return; }
    if (!locationValue.trim()) { setFormError('Please add your location'); return; }
    if (!installType) {
      if (!issueValue) { setFormError('Please pick an issue'); return; }
      if (issueValue === 'other' && !otherIssue.trim()) { setFormError('Please describe the issue'); return; }
    }
    setFormError(null);
    setSubmitting(true);
    const service_item = installType
      ? `Installation — ${installType.label}`
      : issueValue === 'other'
        ? `Other: ${otherIssue.trim()}`
        : issueLabel;
    try {
      const inquiry = await submitInquiry({
        full_name: name.trim(),
        phone: '+91' + phone,
        location: locationValue.trim(),
        service_item,
        description: description.trim() || null,
        bill_no: billNo.trim() || null,
        preferred_time: preferredTime,
        customer_lat: coords?.lat ?? null,
        customer_lng: coords?.lng ?? null,
      });
      setResult(inquiry);
      setStep(3);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (needsInstallPick) {
    return <InstallTypeGrid onSelect={setInstallType} />;
  }

  if (step === 3 && result) {
    return (
      <GlassCard>
        <Text style={[styles.title, { color: theme.text }]}>Request submitted</Text>
        <Text style={[styles.body, { color: theme.text2, marginTop: spacing(2) }]}>Your ticket number is</Text>
        <Text style={[styles.ticket, { color: brand.primary }]}>{result.ticket_no}</Text>
        <Text style={[styles.body, { color: theme.text2, marginTop: spacing(3) }]}>
          Save this number — you can track progress anytime from the Track tab.
        </Text>
      </GlassCard>
    );
  }

  return (
    <View>
      <StepIndicator steps={['Verify', 'OTP', 'Details']} activeIndex={step} />
      <GlassCard>
        {installType && (
          <View style={[styles.installBanner, { backgroundColor: theme.panel2, borderColor: theme.line }]}>
            <Icon name="shield" size={16} color={brand.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.installBannerLabel, { color: theme.text3 }]}>Installation booking</Text>
              <Text style={[styles.installBannerName, { color: theme.text }]}>{installType.label}</Text>
            </View>
            <Pressable onPress={() => setInstallType(null)}>
              <Text style={{ color: brand.primary, fontSize: 12, fontFamily: 'Manrope_700Bold' }}>Change</Text>
            </Pressable>
          </View>
        )}

        {step === 0 && (
          <>
            <Text style={[styles.title, { color: theme.text }]}>Enter your mobile number</Text>
            <Text style={[styles.body, { color: theme.text2, marginBottom: spacing(4) }]}>
              We&apos;ll send a one-time code to verify it&apos;s you.
            </Text>
            <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <Icon name="phone" size={16} color={theme.text3} />
              <Text style={[styles.cc, { color: theme.text3 }]}>+91</Text>
              <TextInput
                value={phone}
                onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                keyboardType="number-pad"
                placeholder="98765 43210"
                placeholderTextColor={theme.text3}
                style={[styles.input, { color: theme.text }]}
              />
            </View>
            <Text style={[styles.label, { color: theme.text3 }]}>Quick check — type these letters</Text>
            <View style={styles.captchaRow}>
              <View style={[styles.captchaBox, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                <Text style={[styles.captchaText, { color: theme.text }]}>{captcha}</Text>
              </View>
              <Pressable onPress={() => { setCaptcha(makeCaptcha()); setCapInput(''); }} style={[styles.captchaRefresh, { borderColor: theme.line }]}>
                <Icon name="refresh" size={16} color={theme.text2} />
              </Pressable>
            </View>
            <TextInput
              value={capInput}
              onChangeText={(v) => setCapInput(v.toUpperCase().slice(0, 5))}
              placeholder="Enter the letters"
              placeholderTextColor={theme.text3}
              autoCapitalize="characters"
              style={[styles.captchaInput, { borderColor: theme.line, backgroundColor: theme.panel2, color: theme.text }]}
            />
            {otpError && <Text style={styles.error}>{otpError}</Text>}
            <GlowButton label={sendingOtp ? 'Sending…' : 'Send OTP by SMS'} onPress={handleSendOtp} loading={sendingOtp} />
          </>
        )}

        {step === 1 && (
          <>
            <Text style={[styles.title, { color: theme.text }]}>Enter the code</Text>
            <Text style={[styles.body, { color: theme.text2, marginBottom: spacing(4) }]}>
              We sent a 6-digit code to +91 {phone}.
            </Text>
            <TextInput
              value={otp}
              onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="••••••"
              placeholderTextColor={theme.text3}
              style={[styles.otpInput, { borderColor: theme.line, backgroundColor: theme.panel2, color: theme.text }]}
              maxLength={6}
            />
            {otpError && <Text style={styles.error}>{otpError}</Text>}
            <Pressable onPress={handleResendOtp} style={{ marginBottom: spacing(3) }}>
              <Text style={{ color: brand.primary, fontSize: 12, fontFamily: 'Manrope_700Bold' }}>Resend code</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: spacing(3) }}>
              <Pressable onPress={() => setStep(0)} style={[styles.backBtn, { borderColor: theme.line }]}>
                <Text style={{ color: theme.text }}>Back</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <GlowButton label={verifyingOtp ? 'Verifying…' : 'Verify code'} onPress={handleVerifyOtp} loading={verifyingOtp} />
              </View>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={[styles.title, { color: theme.text }]}>
              {installType ? 'Book your installation' : "Tell us what's wrong"}
            </Text>
            <Text style={[styles.body, { color: theme.text2, marginBottom: spacing(4) }]}>
              {installType ? "A few details and we'll schedule your visit." : 'A few quick details so we can help fast.'}
            </Text>

            <Text style={[styles.label, { color: theme.text3 }]}>Your name</Text>
            <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <Icon name="user" size={16} color={theme.text3} />
              <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={theme.text3} style={[styles.input, { color: theme.text }]} />
            </View>

            <Text style={[styles.label, { color: theme.text3 }]}>Location</Text>
            <View style={styles.segmentRow}>
              <Pressable onPress={() => setLocationMode('gps')} style={[styles.segment, { borderColor: theme.line }, locationMode === 'gps' && { backgroundColor: theme.surfaceStrong }]}>
                <Icon name="crosshair" size={14} color={locationMode === 'gps' ? brand.primary : theme.text3} />
                <Text style={{ color: locationMode === 'gps' ? brand.primary : theme.text3, fontSize: 12 }}>Current</Text>
              </Pressable>
              <Pressable onPress={() => setLocationMode('manual')} style={[styles.segment, { borderColor: theme.line }, locationMode === 'manual' && { backgroundColor: theme.surfaceStrong }]}>
                <Icon name="edit" size={14} color={locationMode === 'manual' ? brand.primary : theme.text3} />
                <Text style={{ color: locationMode === 'manual' ? brand.primary : theme.text3, fontSize: 12 }}>Manual</Text>
              </Pressable>
            </View>
            <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <Icon name="pin" size={16} color={theme.text3} />
              <TextInput
                value={locationValue}
                onChangeText={setLocationValue}
                editable={locationMode === 'manual'}
                placeholder={locationMode === 'gps' ? 'Tap detect to auto-fill…' : 'Type your address…'}
                placeholderTextColor={theme.text3}
                style={[styles.input, { color: theme.text }]}
              />
              {locationMode === 'gps' && (
                <Pressable onPress={handleDetectLocation} disabled={detecting}>
                  <Icon name="crosshair" size={16} color={brand.primary} />
                </Pressable>
              )}
            </View>
            {coords && (
              <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps?q=${coords.lat},${coords.lng}`)}>
                <Text style={{ color: brand.primary, fontSize: 11, marginBottom: spacing(2) }}>Open exact pin</Text>
              </Pressable>
            )}

            <Text style={[styles.label, { color: theme.text3 }]}>Preferred visit time</Text>
            <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <Icon name="clock" size={16} color={theme.text3} />
              {Platform.OS === 'web' ? (
                <TextInput value={preferredTime} onChangeText={setPreferredTime} style={[styles.input, { color: theme.text }]} />
              ) : (
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text }}>{preferredTime}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1.5) }}>
                    {PREFERRED_TIMES.map((t) => (
                      <Pressable key={t} onPress={() => setPreferredTime(t)}>
                        <Text style={{ fontSize: 10, color: t === preferredTime ? brand.primary : theme.text3 }}>{t}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <Text style={[styles.label, { color: theme.text3 }]}>Device bill number (optional)</Text>
            <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
              <Icon name="receipt" size={16} color={theme.text3} />
              <TextInput value={billNo} onChangeText={setBillNo} placeholder="e.g. INV-2024-001" placeholderTextColor={theme.text3} style={[styles.input, { color: theme.text }]} />
            </View>

            {!installType && (
              <>
                <Text style={[styles.label, { color: theme.text3 }]}>What&apos;s the issue?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(3) }}>
                  {issueOptions.map((o) => (
                    <Pressable
                      key={o.value}
                      onPress={() => setIssueValue(o.value)}
                      style={[styles.issueChip, { borderColor: theme.line, backgroundColor: issueValue === o.value ? theme.surfaceStrong : theme.panel2 }]}
                    >
                      <Text style={{ color: issueValue === o.value ? brand.primary : theme.text2, fontSize: 12 }}>{o.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {issueValue === 'other' && (
                  <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                    <Icon name="edit" size={16} color={theme.text3} />
                    <TextInput value={otherIssue} onChangeText={setOtherIssue} placeholder="Describe your issue briefly" placeholderTextColor={theme.text3} style={[styles.input, { color: theme.text }]} />
                  </View>
                )}
              </>
            )}

            <Text style={[styles.label, { color: theme.text3 }]}>Describe the problem (optional)</Text>
            <TextInput
              value={description}
              onChangeText={(v) => setDescription(v.slice(0, 1000))}
              placeholder="Anything our technician should know…"
              placeholderTextColor={theme.text3}
              multiline
              numberOfLines={3}
              style={[styles.textarea, { borderColor: theme.line, backgroundColor: theme.panel2, color: theme.text }]}
            />

            {formError && <Text style={styles.error}>{formError}</Text>}
            <GlowButton label={submitting ? 'Submitting…' : 'Submit request'} onPress={handleSubmit} loading={submitting} />
          </>
        )}
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, fontSize: 17 },
  body: { ...typography.body, fontSize: 12.5 },
  label: { ...typography.caption, fontSize: 11, marginBottom: spacing(1.5), marginTop: spacing(3) },
  error: { color: semantic.danger, fontSize: 12, marginTop: spacing(1), marginBottom: spacing(1) },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(1) },
  input: { flex: 1, paddingVertical: spacing(2.5), fontSize: 14, fontFamily: 'Manrope_400Regular' },
  cc: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 14 },
  captchaRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(1.5) },
  captchaBox: { flex: 1, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing(3) },
  captchaText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 18, letterSpacing: 4 },
  captchaRefresh: { width: 44, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  captchaInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), marginTop: spacing(2), textTransform: 'uppercase', letterSpacing: 3, fontFamily: 'JetBrainsMono_700Bold' },
  otpInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(3), fontSize: 22, letterSpacing: 8, textAlign: 'center', fontFamily: 'JetBrainsMono_700Bold', marginBottom: spacing(2) },
  backBtn: { paddingHorizontal: spacing(4), paddingVertical: spacing(3.5), borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segmentRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(2) },
  segment: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingHorizontal: spacing(3), paddingVertical: spacing(2), borderRadius: radius.sm, borderWidth: 1 },
  issueChip: { paddingHorizontal: spacing(3), paddingVertical: spacing(2), borderRadius: radius.full, borderWidth: 1 },
  textarea: { borderWidth: 1, borderRadius: radius.sm, padding: spacing(3), fontSize: 13, minHeight: 84, textAlignVertical: 'top', fontFamily: 'Manrope_400Regular' },
  installBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), borderWidth: 1, borderRadius: radius.md, padding: spacing(3), marginBottom: spacing(4) },
  installBannerLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  installBannerName: { fontFamily: 'Manrope_700Bold', fontSize: 13, marginTop: 2 },
  ticket: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 22, marginTop: spacing(1) },
});
```

**Note for the implementer:** `GlowButton` (`mobile/src/components/GlowButton.tsx`) already accepts `loading`/`disabled` props — no change needed there. `Platform` from `react-native` is used to fall back to a plain text input for preferred-time on web (Expo also targets web via `expo start --web`); on native the chip-row lets the user tap a preset directly, which is simpler than pulling in a picker dependency for 5 fixed strings.

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. If `expo-location`'s types report `Location.Accuracy.High` differently, check the installed version's typings (`node_modules/expo-location/build/Location.types.d.ts`) and adjust the enum reference to match — the API shape (`requestForegroundPermissionsAsync`, `getCurrentPositionAsync`) has been stable across recent Expo SDKs.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/RequestWizard.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): add RequestWizard (OTP-gated New Request / Installation flow)

3-step wizard (phone+captcha -> OTP -> details) shared by both modes,
matching web's flow exactly: GPS-or-manual location with reverse geocode,
preferred visit time, optional bill number, issue picker or install-type
banner, then submitInquiry(). This is the OTP verification step mobile
was missing entirely.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: TrackPanel

**Files:**
- Create: `mobile/src/components/TrackPanel.tsx`

- [ ] **Step 1: Write `mobile/src/components/TrackPanel.tsx`**

```tsx
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { trackInquiry, Inquiry } from '../api/inquiries';
import { submitComplaint } from '../api/complaints';

interface Props {
  reopenButtonEnabled: boolean;
  reopenLimit: number;
}

export default function TrackPanel({ reopenButtonEnabled, reopenLimit }: Props) {
  const { theme } = useTheme();
  const [ticketNo, setTicketNo] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Inquiry[] | null>(null);
  const [reopening, setReopening] = useState(false);
  const [reopened, setReopened] = useState(false);

  const handleTrack = async () => {
    if (!ticketNo.trim() || !phone.trim()) {
      setError('Enter both your ticket number and phone number');
      return;
    }
    setError(null);
    setLoading(true);
    setResults(null);
    setReopened(false);
    try {
      const phoneNormalized = '+91' + phone.trim();
      const rows = await trackInquiry(ticketNo.trim(), phoneNormalized);
      if (rows.length === 0) setError('No ticket found for that number and phone — double-check and try again');
      else setResults(rows);
    } catch {
      setError('Could not check your ticket — check your connection and try again');
    } finally {
      setLoading(false);
    }
  };

  const handleReopen = async (r: Inquiry) => {
    setReopening(true);
    try {
      await submitComplaint({
        ticket_no: r.ticket_no,
        phone: r.phone,
        complaint_text: 'ISSUE NOT RESOLVED: reopened from ticket tracking',
      });
      setReopened(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reopen — please try again');
    } finally {
      setReopening(false);
    }
  };

  if (results) {
    return (
      <View>
        <Pressable onPress={() => setResults(null)} style={{ marginBottom: spacing(3) }}>
          <Text style={{ color: brand.primary, fontSize: 12, fontFamily: 'Manrope_700Bold' }}>← New search</Text>
        </Pressable>
        {results.map((r) => {
          const s = statusColors[r.status] || DEFAULT_STATUS_STYLE;
          const canReopen = reopenButtonEnabled && (r.status === 'resolved' || r.status === 'case_closed' || r.status === 'closed');
          return (
            <GlassCard key={r.id} style={{ marginBottom: spacing(3) }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.ticketNo, { color: theme.text }]}>{r.ticket_no}</Text>
                  <Text style={{ color: theme.text2, fontSize: 12, marginTop: 2 }}>{r.service_item}</Text>
                  <Text style={{ color: theme.text3, fontSize: 11, marginTop: 2 }}>{r.location}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: s.bg }]}>
                  <Text style={{ color: s.color, fontSize: 11, fontFamily: 'Manrope_700Bold' }}>{s.label}</Text>
                </View>
              </View>
              {canReopen && !reopened && (
                <Pressable
                  onPress={() => handleReopen(r)}
                  disabled={reopening}
                  style={[styles.reopenBtn, { borderColor: theme.line, backgroundColor: theme.panel2 }]}
                >
                  <Text style={{ color: theme.text, fontSize: 12 }}>
                    {reopening ? 'Reopening…' : `Issue not resolved? Reopen (max ${reopenLimit})`}
                  </Text>
                </Pressable>
              )}
              {reopened && <Text style={{ color: semantic.success, fontSize: 12, marginTop: spacing(3) }}>Reopened — our team has been notified.</Text>}
            </GlassCard>
          );
        })}
      </View>
    );
  }

  return (
    <GlassCard>
      <Text style={[styles.title, { color: theme.text }]}>Track your requests</Text>
      <Text style={[styles.body, { color: theme.text2, marginBottom: spacing(4) }]}>
        Enter your phone number and ticket number to see its status.
      </Text>
      <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
        <Icon name="phone" size={16} color={theme.text3} />
        <TextInput
          value={phone}
          onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
          keyboardType="number-pad"
          placeholder="98765 43210"
          placeholderTextColor={theme.text3}
          style={[styles.input, { color: theme.text }]}
        />
      </View>
      <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2, marginTop: spacing(3) }]}>
        <Icon name="search" size={16} color={theme.text3} />
        <TextInput
          value={ticketNo}
          onChangeText={setTicketNo}
          autoCapitalize="characters"
          placeholder="NE-260506-1234"
          placeholderTextColor={theme.text3}
          style={[styles.input, { color: theme.text }]}
        />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <GlowButton label={loading ? 'Checking…' : 'Show my ticket'} onPress={handleTrack} loading={loading} />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, fontSize: 17 },
  body: { ...typography.body, fontSize: 12.5 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(1) },
  input: { flex: 1, paddingVertical: spacing(2.5), fontSize: 14, fontFamily: 'Manrope_400Regular' },
  error: { color: semantic.danger, fontSize: 12, marginTop: spacing(2), marginBottom: spacing(1) },
  ticketNo: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 15 },
  statusPill: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.full },
  reopenBtn: { marginTop: spacing(3), borderWidth: 1, borderRadius: radius.sm, padding: spacing(2.5), alignItems: 'center' },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/TrackPanel.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): add TrackPanel component

Ticket lookup by phone+ticket number, plus the reopen-a-resolved-ticket
flow (files a complaint prefixed the same way web does), gated by the
reopenButtonEnabled/reopenLimit settings from landing/bootstrap.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: ComplaintPanel

**Files:**
- Create: `mobile/src/components/ComplaintPanel.tsx`

- [ ] **Step 1: Write `mobile/src/components/ComplaintPanel.tsx`**

```tsx
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { submitComplaint } from '../api/complaints';

export default function ComplaintPanel() {
  const { theme } = useTheme();
  const [ticketNo, setTicketNo] = useState('');
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!ticketNo.trim() || !phone.trim() || !text.trim()) {
      setError('Fill in your ticket number, phone number, and what went wrong');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await submitComplaint({
        ticket_no: ticketNo.trim(),
        phone: '+91' + phone.trim(),
        complaint_text: text.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit complaint — please try again');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <GlassCard>
        <Text style={[styles.title, { color: theme.text }]}>Complaint received</Text>
        <Text style={[styles.body, { color: theme.text2, marginTop: spacing(2) }]}>
          Our team has been notified and will follow up on ticket <Text style={{ color: theme.text, fontFamily: 'JetBrainsMono_700Bold' }}>{ticketNo}</Text> soon.
        </Text>
        <Pressable onPress={() => { setSubmitted(false); setTicketNo(''); setPhone(''); setText(''); }} style={{ marginTop: spacing(4) }}>
          <Text style={{ color: brand.primary, fontSize: 12, fontFamily: 'Manrope_700Bold' }}>File another complaint</Text>
        </Pressable>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <Text style={[styles.title, { color: theme.text }]}>File a complaint</Text>
      <Text style={[styles.body, { color: theme.text2, marginBottom: spacing(4) }]}>
        For an existing ticket — the issue came back, the technician didn&apos;t show, billing was wrong, etc.
      </Text>

      <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
        <Icon name="search" size={16} color={theme.text3} />
        <TextInput value={ticketNo} onChangeText={setTicketNo} autoCapitalize="characters" placeholder="NE-260506-1234" placeholderTextColor={theme.text3} style={[styles.input, { color: theme.text }]} />
      </View>
      <View style={[styles.inputWrap, { borderColor: theme.line, backgroundColor: theme.panel2, marginTop: spacing(3) }]}>
        <Icon name="phone" size={16} color={theme.text3} />
        <TextInput value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" placeholder="98765 43210" placeholderTextColor={theme.text3} style={[styles.input, { color: theme.text }]} />
      </View>
      <TextInput
        value={text}
        onChangeText={(v) => setText(v.slice(0, 2000))}
        placeholder="Describe what went wrong…"
        placeholderTextColor={theme.text3}
        multiline
        numberOfLines={4}
        style={[styles.textarea, { borderColor: theme.line, backgroundColor: theme.panel2, color: theme.text, marginTop: spacing(3) }]}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <GlowButton label={loading ? 'Submitting…' : 'Submit complaint'} onPress={handleSubmit} loading={loading} />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, fontSize: 17 },
  body: { ...typography.body, fontSize: 12.5 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing(3), paddingVertical: spacing(1) },
  input: { flex: 1, paddingVertical: spacing(2.5), fontSize: 14, fontFamily: 'Manrope_400Regular' },
  textarea: { borderWidth: 1, borderRadius: radius.sm, padding: spacing(3), fontSize: 13, minHeight: 100, textAlignVertical: 'top', fontFamily: 'Manrope_400Regular' },
  error: { color: semantic.danger, fontSize: 12, marginTop: spacing(2), marginBottom: spacing(1) },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/ComplaintPanel.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): add ComplaintPanel component

New on mobile — files a complaint against an existing ticket via the
same POST /api/data/complaints endpoint web uses.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Rewrite LandingScreen, wire up navigation

**Files:**
- Modify: `mobile/src/screens/LandingScreen.tsx` (full rewrite)
- Modify: `mobile/src/navigation/RootNavigator.tsx:61-69` (drop `onGoSubmit`/`onGoTrack`, now handled inline)

- [ ] **Step 1: Rewrite `mobile/src/screens/LandingScreen.tsx`**

```tsx
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
```

**Note for the implementer:** RN's `Text` can't clip a `LinearGradient` the way CSS `background-clip: text` does — `styles.gradientHeadline` uses `brand.primary` as a flat color instead of a true gradient. If a true gradient headline is wanted later, revisit with `@react-native-masked-view/masked-view` + `expo-linear-gradient` (the latter is already a dependency) wrapping the `Text` — that's a separate follow-up, not blocking this task, since the flat-primary version already reads as the app's accent color and matches the glow/emphasis intent.

- [ ] **Step 2: Update `mobile/src/navigation/RootNavigator.tsx`**

Replace lines 61-69 (`LandingRoute`):

```tsx
function LandingRoute({ navigation }: any) {
  return <LandingScreen onStaffLogin={() => navigation.navigate('Login')} />;
}
```

Leave the `SubmitTicket`/`TrackTicket` routes and their screens in place (unreferenced from Landing now, but still valid standalone routes — removing them is out of scope for this task, see plan's non-goals).

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. `RootNavigator.tsx`'s `GuestStackParams` type still declares `SubmitTicket`/`TrackTicket` — that's fine since the routes still exist, just unreferenced from the Landing screen.

- [ ] **Step 4: Manual smoke test**

Run: `cd mobile && npx expo start` (or use the `run` skill / Expo Go on a connected device/emulator)
Check:
- Landing screen renders with mesh background, glass hero, theme toggle (tap it, confirm colors flip and persist across reload), staff-login button navigates to Login.
- Ad carousel or promo panel shows depending on whether `GET /landing/bootstrap` returns ads (point `EXPO_PUBLIC_API_BASE_URL` at a running `server/index.cjs` to test against real data, or confirm the promo-panel fallback renders cleanly when the fetch fails/returns no ads).
- All 4 tabs switch correctly; New Request and Installation both walk through Verify → OTP → Details → success; Installation additionally shows the type grid first.
- Track and Complaint tabs submit and show their result/error states.
- Contact card's Call/WhatsApp buttons open the expected native intents (or at least don't crash in the simulator, where `tel:`/`wa.me` links may no-op).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/LandingScreen.tsx mobile/src/navigation/RootNavigator.tsx
git commit -m "$(cat <<'EOF'
feat(mobile): rewrite LandingScreen with liquid-glass style + full feature parity

Wires together the new tab flow (New Request / Track / Complaint /
Installation), theme toggle, ad carousel + popup ad, and contact card
into the glass-surface visual style approved via the brainstorming
mockup (docs/superpowers/specs/2026-08-21-mobile-landing-liquid-glass-design.md).
Drops the old services grid (superseded by the Installation tab) and the
onGoSubmit/onGoTrack navigation props (New Request/Track are now inline
tabs, not separate screens).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** every item in the approved design doc (`docs/superpowers/specs/2026-08-21-mobile-landing-liquid-glass-design.md`) has a task — icons (Task 1), API layer (Task 2), theme toggle/contact/promo (Task 3), tabs/stepper (Task 4), ads (Task 5), install grid (Task 6), OTP wizard (Task 7), track+reopen (Task 8), complaint (Task 9), screen assembly (Task 10).
- **Placeholder scan:** no TBD/TODO left — the one open item from the spec (complaint endpoint) was resolved during planning (`POST /api/data/complaints`, confirmed against `server/index.cjs`) and is now concrete code in Task 2/9.
- **Type consistency:** `LandingAd`/`IssueOption` (Task 2) are the single source of truth, imported everywhere they're used (Tasks 5, 6 doesn't need them, 7, 8, 10) rather than redefined. `InstallType` (Task 6) is imported by `RequestWizard` (Task 7). `Inquiry` (existing `mobile/src/api/inquiries.ts`) is reused by both `RequestWizard` (Task 7) and `TrackPanel` (Task 8) instead of a new type.
- **Known follow-up, explicitly deferred, not a gap:** the headline's gradient-clipped text (flat color used instead, see Task 10's implementer note) and video ad support (image-only, see Task 5) are both noted as intentional scope cuts, not missed requirements.
