import { Appearance } from 'react-native';

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
  /** --pn: solid panel for dense lists and forms (glass is for headers, sheets, tab bars, hero cards). */
  panel: string;
  /** --acc: accent for text, links and selected states — AA on this mode's background. */
  accent: string;
  // Status hues. The solid colour is for text/icons; the `S` tint is its soft fill.
  ok: string; okS: string;
  warn: string; warnS: string;
  err: string; errS: string;
  info: string; infoS: string;
  vio: string; vioS: string;
  teal: string; tealS: string;
  grey: string; greyS: string;
}

export const DARK_TOKENS: ThemeTokens = {
  bg: '#06100b',
  surface: 'rgba(22,38,31,0.62)',
  surfaceStrong: 'rgba(20,34,28,0.86)',
  border: 'rgba(255,255,255,0.14)',
  text: '#e9f1ec',
  text2: '#a3b6ad',
  text3: '#7d9288',
  line: 'rgba(255,255,255,0.09)',
  panel2: 'rgba(255,255,255,0.06)',
  meshOp: 0.28,
  meshOp2: 0.2,
  meshOp3: 0.16,
  neuLight: 'rgba(255,255,255,0.04)',
  neuDark: 'rgba(0,20,12,0.5)',
  panel: '#0f1c16',
  accent: '#1fb066',
  ok: '#22b467', okS: 'rgba(21,160,90,0.18)',
  warn: '#ee9a2a', warnS: 'rgba(224,138,20,0.18)',
  err: '#f46a80', errS: 'rgba(240,85,109,0.16)',
  info: '#5ab0ff', infoS: 'rgba(46,155,255,0.16)',
  vio: '#a08aff', vioS: 'rgba(124,92,252,0.2)',
  teal: '#2cc4c4', tealS: 'rgba(14,165,165,0.18)',
  grey: '#93a69d', greyS: 'rgba(109,130,120,0.2)',
};

export const LIGHT_TOKENS: ThemeTokens = {
  bg: '#eef3ef',
  surface: 'rgba(255,255,255,0.68)',
  surfaceStrong: 'rgba(255,255,255,0.9)',
  border: 'rgba(16,50,36,0.14)',
  text: '#0e1d16',
  text2: '#41584d',
  text3: '#66796f',
  line: 'rgba(16,50,36,0.1)',
  panel2: 'rgba(16,50,36,0.05)',
  meshOp: 0.1,
  meshOp2: 0.08,
  meshOp3: 0.06,
  neuLight: 'rgba(255,255,255,0.9)',
  neuDark: 'rgba(163,182,173,0.45)',
  panel: '#ffffff',
  accent: '#0c6f3d',
  ok: '#0c7a43', okS: 'rgba(21,160,90,0.13)',
  warn: '#985800', warnS: 'rgba(224,138,20,0.15)',
  err: '#c42c47', errS: 'rgba(240,85,109,0.12)',
  info: '#1766b5', infoS: 'rgba(46,155,255,0.13)',
  vio: '#5a3ed8', vioS: 'rgba(124,92,252,0.13)',
  teal: '#08777a', tealS: 'rgba(14,165,165,0.13)',
  grey: '#5e7268', greyS: 'rgba(109,130,120,0.15)',
};

// Brand and semantic colours are mode-aware: dark uses the bright hues, light
// uses the darker text variants so they hold 4.5:1 on the sage background (the
// design's "Additions" note). These two objects are shared by ~1000 call sites,
// so ThemeProvider re-points them with applyPalette() whenever the mode flips,
// before the tree re-renders. Colours read during render are always current;
// the few read at module load (StyleSheet.create) keep the palette of the
// system scheme the app launched with.
export const brand = {
  /** Accent text, links, borders and tints (design --acc). */
  primary: '#1fb066',
  /** Solid fill behind white text — primary buttons, selected chips (Primary 600). */
  fill: '#0f8a4c',
  /** Pressed state of `fill` (Primary 700). */
  pressed: '#0c6f3d',
  primaryGradientEnd: '#0f8a4c',
  primaryDim: '#0c6f3d',
  danger: '#f46a80',
  /** Closed / inactive / hidden (design --grey). */
  grey: '#93a69d',
};

export const semantic = {
  success: '#22b467',
  warning: '#ee9a2a',
  danger: '#f46a80',
  info: '#5ab0ff',
};

export type ThemeMode = 'dark' | 'light';

const PALETTE: Record<ThemeMode, { brand: typeof brand; semantic: typeof semantic }> = {
  dark: {
    brand: { primary: '#1fb066', fill: '#0f8a4c', pressed: '#0c6f3d', primaryGradientEnd: '#0f8a4c', primaryDim: '#0c6f3d', danger: '#f46a80', grey: '#93a69d' },
    semantic: { success: '#22b467', warning: '#ee9a2a', danger: '#f46a80', info: '#5ab0ff' },
  },
  light: {
    brand: { primary: '#0c6f3d', fill: '#0f8a4c', pressed: '#0c6f3d', primaryGradientEnd: '#0f8a4c', primaryDim: '#0c6f3d', danger: '#c42c47', grey: '#5e7268' },
    semantic: { success: '#0c7a43', warning: '#985800', danger: '#c42c47', info: '#1766b5' },
  },
};

let currentMode: ThemeMode = 'dark';

export function getPaletteMode(): ThemeMode {
  return currentMode;
}

// Re-point the shared brand/semantic/status objects at one mode's palette.
export function applyPalette(mode: ThemeMode): void {
  currentMode = mode;
  const p = PALETTE[mode];
  Object.assign(brand, p.brand);
  Object.assign(semantic, p.semantic);
  const t = mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
  const set = (key: string, color: string, bg: string) => {
    const row = statusColors[key];
    if (row) { row.color = color; row.bg = bg; }
  };
  set('open', t.info, t.infoS);
  set('assigned', t.vio, t.vioS);
  set('in_progress', t.warn, t.warnS);
  set('resolved', t.ok, t.okS);
  set('paid', t.ok, t.okS);
  set('issue_not_resolved', t.err, t.errS);
  set('case_closed', t.grey, t.greyS);
  set('closed', t.grey, t.greyS);
  set('foc', t.grey, t.greyS);
  DEFAULT_STATUS_STYLE.color = t.grey;
  DEFAULT_STATUS_STYLE.bg = t.greyS;
}

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

// Seed from the system scheme so module-level styles match the launch mode.
// ThemeProvider calls applyPalette() again once a stored preference loads.
applyPalette(Appearance.getColorScheme() === 'light' ? 'light' : 'dark');
