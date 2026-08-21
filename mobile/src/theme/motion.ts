// Reanimated's duration/dampingRatio spring config maps directly onto
// Apple's "response" (here: duration, ms) and "damping ratio" parameters
// from Designing Fluid Interfaces (WWDC 2018). Every settling animation in
// this design system pulls its spring config from here instead of
// inventing its own timing. (AccentOrb's idle wobble is a looping
// withRepeat/withTiming, not a spring — springs settle to a target, which
// isn't what an infinite ambient loop needs.)
export const springs = {
  // Reposition/mount — critically damped, no overshoot.
  move: { duration: 400, dampingRatio: 1.0 },
  // Sheets/drawers — slight bounce only because the gesture carries momentum.
  drawer: { duration: 300, dampingRatio: 0.8 },
  // Icon presses/status transitions — the springy overshoot picked during
  // the technician icon/motion polish brainstorm (design spec §2).
  bouncy: { duration: 500, dampingRatio: 0.5 },
} as const;
