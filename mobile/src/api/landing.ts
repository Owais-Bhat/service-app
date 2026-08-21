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
