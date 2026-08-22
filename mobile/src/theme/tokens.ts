// All values copied verbatim from the NEST design's DARK_TOKENS/LIGHT_TOKENS/
// CAT/STATUS_STYLE objects (docs/superpowers/specs/2026-08-17-nest-design-visual-foundation.md §2).
export interface ThemeTokens {
  bg: string;
  surface: string;
  surfaceStrong: string;
  border: string;
  text: string;
  text2: string;
  text3: string;
  line: string;
  panel2: string;
  meshOp: number;
  meshOp2: number;
  meshOp3: number;
  neuLight: string;
  neuDark: string;
}

export const DARK_TOKENS: ThemeTokens = {
  bg: '#06100b',
  surface: 'rgba(22,38,31,0.62)',
  surfaceStrong: 'rgba(20,34,28,0.86)',
  border: 'rgba(255,255,255,0.14)',
  text: '#e9f1ec',
  text2: '#a3b6ad',
  text3: '#6d8278',
  line: 'rgba(255,255,255,0.09)',
  panel2: 'rgba(255,255,255,0.06)',
  meshOp: 0.28,
  meshOp2: 0.2,
  meshOp3: 0.16,
  neuLight: 'rgba(255,255,255,0.04)',
  neuDark: 'rgba(0,20,12,0.5)',
};

export const LIGHT_TOKENS: ThemeTokens = {
  bg: '#eef3ef',
  surface: 'rgba(255,255,255,0.68)',
  surfaceStrong: 'rgba(255,255,255,0.9)',
  border: 'rgba(16,50,36,0.12)',
  text: '#0e1d16',
  text2: '#41584d',
  text3: '#7a8d84',
  line: 'rgba(16,50,36,0.1)',
  panel2: 'rgba(16,50,36,0.05)',
  meshOp: 0.1,
  meshOp2: 0.08,
  meshOp3: 0.06,
  neuLight: 'rgba(255,255,255,0.9)',
  neuDark: 'rgba(163,182,173,0.45)',
};

// Mode-independent — NEST doesn't vary these between light/dark.
export const brand = {
  primary: '#15a05a',
  primaryGradientEnd: '#0f8a4c',
  primaryDim: '#0c6f3d',
  danger: '#f0556d',
};

export const semantic = {
  success: '#15a05a',
  warning: '#e08a14',
  danger: '#f0556d',
  info: '#2e9bff',
};

export interface CategoryStyle {
  color: string;
  bg: string;
  initials: string;
}

// Real category values from src/pages/job-cards.js's CATEGORIES constant —
// wider than the NEST mockup's 5. String keys (not identifiers) since
// several contain spaces/slashes. 5 keep NEST's original colors; the 3
// NEST doesn't cover (Locks, Fire Alarm, Other) use unused hues already
// in the app's palette rather than new colors.
export const categoryColors: Record<string, CategoryStyle> = {
  CCTV: { color: '#15a05a', bg: 'rgba(21,160,90,0.16)', initials: 'CC' },
  Networking: { color: '#0ea5a5', bg: 'rgba(14,165,165,0.16)', initials: 'NW' },
  'Video Door Phone': { color: '#6366f1', bg: 'rgba(99,102,241,0.16)', initials: 'VD' },
  Locks: { color: '#2e9bff', bg: 'rgba(46,155,255,0.14)', initials: 'LK' },
  'Gate Automation': { color: '#e08a14', bg: 'rgba(224,138,20,0.16)', initials: 'GA' },
  'Access Control / Biometric': { color: '#7c5cfc', bg: 'rgba(124,92,252,0.16)', initials: 'BM' },
  'Fire Alarm': { color: '#f0556d', bg: 'rgba(240,85,109,0.14)', initials: 'FA' },
  Other: { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', initials: 'OT' },
};

export const DEFAULT_CATEGORY_STYLE: CategoryStyle = { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', initials: '—' };

export interface StatusStyle {
  color: string;
  bg: string;
  label: string;
}

// Real status values used across the app — wider than NEST's 4-state
// mockup (which also used the wrong key: "progress" instead of the real
// "in_progress"). TECH_STATUS_ORDER is the subset a technician
// self-advances through; the rest are admin/finance workflow states.
export const statusColors: Record<string, StatusStyle> = {
  open: { color: '#2e9bff', bg: 'rgba(46,155,255,0.14)', label: 'Open' },
  assigned: { color: '#7c5cfc', bg: 'rgba(124,92,252,0.14)', label: 'Assigned' },
  in_progress: { color: '#e08a14', bg: 'rgba(224,138,20,0.16)', label: 'In Progress' },
  resolved: { color: '#15a05a', bg: 'rgba(21,160,90,0.14)', label: 'Resolved' },
  case_closed: { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', label: 'Closed' },
  closed: { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', label: 'Closed' },
  foc: { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', label: 'FOC' },
  issue_not_resolved: { color: '#f0556d', bg: 'rgba(240,85,109,0.14)', label: 'Issue Not Resolved' },
  paid: { color: '#15a05a', bg: 'rgba(21,160,90,0.14)', label: 'Paid' },
};

export const DEFAULT_STATUS_STYLE: StatusStyle = { color: '#6d8278', bg: 'rgba(109,130,120,0.16)', label: 'Unknown' };

export const TECH_STATUS_ORDER = ['open', 'assigned', 'in_progress', 'resolved'] as const;
