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

export const categoryColors = {
  CCTV: { color: '#15a05a', bg: 'rgba(21,160,90,0.16)' },
  Networking: { color: '#0ea5a5', bg: 'rgba(14,165,165,0.16)' },
  Biometric: { color: '#7c5cfc', bg: 'rgba(124,92,252,0.16)' },
  VDP: { color: '#6366f1', bg: 'rgba(99,102,241,0.16)' },
  GateAutomation: { color: '#e08a14', bg: 'rgba(224,138,20,0.16)' },
} as const;

export const statusColors = {
  open: { color: '#2e9bff', bg: 'rgba(46,155,255,0.14)' },
  assigned: { color: '#7c5cfc', bg: 'rgba(124,92,252,0.14)' },
  progress: { color: '#e08a14', bg: 'rgba(224,138,20,0.16)' },
  resolved: { color: '#15a05a', bg: 'rgba(21,160,90,0.14)' },
} as const;
