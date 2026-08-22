// home/clock/star adapted from a hand-drawn "network node" reference set
// (dots + links + arcs, 24x24 grid) the user supplied — dropped here for
// every icon we already had a slot for, so the tab bar and rating display
// pick up the richer style with no other UI changes needed. notification/
// leaderboard/tutorial/training are new, added to give Profile's menu rows
// real icons for features that had none. wrench/trash/eye/eye-off/chevrons
// keep their existing hand-drawn versions — the reference set doesn't cover
// them, and Icon.tsx already normalizes stroke weight across every icon
// regardless of source, so the visual language stays consistent.
export const ICONS = {
  home: ['M3.5 12.5 12 5l8.5 7.5', 'M5.5 11.5V19h13v-7.5', 'M9.5 19v-4.5h5V19'],
  clock: ['M12 20.4a8.4 8.4 0 100-16.8 8.4 8.4 0 000 16.8z', 'M12 7.4V12l3.1 1.9'],
  'check-circle': ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M8 12.5l2.5 2.5L16 9'],
  wrench: ['M14.7 6.3a4 4 0 10-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.8 2.8-2-2z'],
  wallet: ['M3 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z', 'M16 12h3v3h-3a1.5 1.5 0 010-3z'],
  user: ['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8'],
  'chevron-left': ['M15 18l-6-6 6-6'],
  'chevron-right': ['M9 18l6-6-6-6'],
  star: ['m12 3.6 2.5 5 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z'],
  trash: ['M4 7h16', 'M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 100-6 3 3 0 000 6z'],
  'eye-off': [
    'M9.9 5.1A10.9 10.9 0 0112 5c6.5 0 10 7 10 7a13.2 13.2 0 01-3.1 3.9M6.1 6.1A13.4 13.4 0 002 12s3.5 7 10 7c1.2 0 2.4-.2 3.4-.6',
    'M10.6 10.6a3 3 0 004.2 4.2',
    'M3 3l18 18',
  ],
  notification: ['M6.5 10.2a5.5 5.5 0 0111 0c0 3.4.9 5 1.8 5.9H4.7c.9-.9 1.8-2.5 1.8-5.9Z', 'M10.2 19a2 2 0 003.6 0'],
  leaderboard: ['M9.4 4.5h5.2v15.5h-5.2z', 'M3 10h5.2v10H3z', 'M15.8 12.5h5.2v7.5h-5.2z'],
  tutorial: ['M2.8 5h18.4v12.5H2.8z', 'm10.4 9.4 4.2 2.4-4.2 2.4z', 'M8.5 20.5h7'],
  training: ['M2.8 8.6 12 4.5l9.2 4.1L12 12.8z', 'M6.6 10.6v4.6c0 1.6 2.4 2.9 5.4 2.9s5.4-1.3 5.4-2.9v-4.6', 'M21.2 8.6v5'],
  tasks: ['M4 3.5h16v17H4z', 'M7.5 8.5l1.6 1.6 3-3.2', 'M13.5 9h3.2', 'M7.5 14.5l1.6 1.6 3-3.2', 'M13.5 15h3.2'],
  estimator: ['M4.5 2.8h15v18.4h-15z', 'M7.6 5.9h8.8v3.4H7.6z', 'M8.2 13h.01M12 13h.01M15.8 13h.01M8.2 16.6h.01M12 16.6h.01M15.8 16.6h.01'],
  device: ['M6.5 2.8h11v18.4h-11z', 'M10.6 5.6h2.8', 'M9.4 12.4h5.2M12 9.8v5.2', 'M10.4 18.4h3.2'],
  report: ['M6 3.5h7.5L18 8v12.5H6z', 'M13.3 3.6V8H18', 'M9 12.5h6M9 16h4'],
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
  mail: ['M4 6h16v12H4z', 'M4.5 6.5l7.5 6 7.5-6'],
  lock: ['M6.5 10.5h11v9h-11z', 'M8.5 10.5v-3a3.5 3.5 0 017 0v3', 'M12 14v2.5'],
  check: ['M4.5 12.5l5 5 10-11'],
  alert: ['M12 3.5l9.5 16.5h-19z', 'M12 9.5v5', 'M12 17.2h.01'],
  filter: ['M3.5 5h17', 'M6.5 12h11', 'M9.5 19h5'],
  calendar: ['M4.5 5.5h15v14h-15z', 'M8 3.5v4M16 3.5v4M4.5 10h15'],
} as const;

export type IconName = keyof typeof ICONS;
