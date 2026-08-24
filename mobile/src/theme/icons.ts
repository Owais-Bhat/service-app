// Maps our own semantic icon names to real Ionicons glyphs (via
// @expo/vector-icons — bundled with every Expo project, no config plugin,
// Expo-Go-safe). `outline` is used by default, `filled` when Icon's
// `filled` prop is set — mirrors iOS's outline/solid icon convention.
// Every glyph name below is validated against the installed package's
// own glyph map (node_modules/@expo/vector-icons), not guessed.
export const ICONS = {
  home: { outline: 'home-outline', filled: 'home' },
  clock: { outline: 'time-outline', filled: 'time' },
  'check-circle': { outline: 'checkmark-circle-outline', filled: 'checkmark-circle' },
  wrench: { outline: 'build-outline', filled: 'build' },
  wallet: { outline: 'wallet-outline', filled: 'wallet' },
  user: { outline: 'person-outline', filled: 'person' },
  'chevron-left': { outline: 'chevron-back', filled: 'chevron-back' },
  'chevron-right': { outline: 'chevron-forward', filled: 'chevron-forward' },
  star: { outline: 'star-outline', filled: 'star' },
  trash: { outline: 'trash-outline', filled: 'trash' },
  eye: { outline: 'eye-outline', filled: 'eye' },
  'eye-off': { outline: 'eye-off-outline', filled: 'eye-off' },
  notification: { outline: 'notifications-outline', filled: 'notifications' },
  leaderboard: { outline: 'podium-outline', filled: 'podium' },
  tutorial: { outline: 'play-circle-outline', filled: 'play-circle' },
  training: { outline: 'school-outline', filled: 'school' },
  tasks: { outline: 'checkbox-outline', filled: 'checkbox' },
  estimator: { outline: 'calculator-outline', filled: 'calculator' },
  device: { outline: 'hardware-chip-outline', filled: 'hardware-chip' },
  report: { outline: 'document-text-outline', filled: 'document-text' },
  search: { outline: 'search-outline', filled: 'search' },
  shield: { outline: 'shield-checkmark-outline', filled: 'shield-checkmark' },
  box: { outline: 'cube-outline', filled: 'cube' },
  sun: { outline: 'sunny-outline', filled: 'sunny' },
  moon: { outline: 'moon-outline', filled: 'moon' },
  phone: { outline: 'call-outline', filled: 'call' },
  // Brand mark — Ionicons only has the one style, so both keys point at it.
  whatsapp: { outline: 'logo-whatsapp', filled: 'logo-whatsapp' },
  crosshair: { outline: 'locate-outline', filled: 'locate' },
  edit: { outline: 'create-outline', filled: 'create' },
  refresh: { outline: 'refresh-outline', filled: 'refresh' },
  'arrow-right': { outline: 'arrow-forward-outline', filled: 'arrow-forward' },
  pin: { outline: 'location-outline', filled: 'location' },
  receipt: { outline: 'receipt-outline', filled: 'receipt' },
  close: { outline: 'close-outline', filled: 'close' },
  mail: { outline: 'mail-outline', filled: 'mail' },
  lock: { outline: 'lock-closed-outline', filled: 'lock-closed' },
  check: { outline: 'checkmark', filled: 'checkmark' },
  alert: { outline: 'alert-circle-outline', filled: 'alert-circle' },
  filter: { outline: 'filter-outline', filled: 'filter' },
  calendar: { outline: 'calendar-outline', filled: 'calendar' },
  logout: { outline: 'log-out-outline', filled: 'log-out' },
} as const;

export type IconName = keyof typeof ICONS;
