// Professional 3D Icon Set — filled shapes with depth layers using currentColor.
// Each icon: shadow (offset + low opacity) → main fill → highlight (white overlay) → white details.
export const ICONS = {

  shield: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2.5L4 5.8v6.4c0 4.2 3.4 8.1 8 9.3 4.6-1.2 8-5.1 8-9.3V5.8z" fill="currentColor" opacity=".2" transform="translate(.5 .7)"/>
    <path d="M12 2.5L4 5.8v6.4c0 4.2 3.4 8.1 8 9.3 4.6-1.2 8-5.1 8-9.3V5.8z" fill="currentColor"/>
    <path d="M12 4.2l6.5 2.5V12c0 3.2-2.3 6.1-6.5 7.5z" fill="white" opacity=".12"/>
    <path d="M12 4.2L5.5 6.7V12c0 3.2 2.3 6.1 6.5 7.5z" fill="black" opacity=".07"/>
    <path d="m9.2 12.3 2 2.2 3.8-4.1" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  bell: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3a7 7 0 0 1 7 7c0 3.5.8 5.5 1.5 6.5H3.5C4.2 15.5 5 13.5 5 10a7 7 0 0 1 7-7zm-1.5 16.8h3a1.5 1.5 0 0 1-3 0z" fill="currentColor" opacity=".2" transform="translate(.4 .6)"/>
    <path d="M12 3a7 7 0 0 1 7 7c0 3.5.8 5.5 1.5 6.5H3.5C4.2 15.5 5 13.5 5 10a7 7 0 0 1 7-7zm-1.5 16.5h3a1.5 1.5 0 0 1-3 0z" fill="currentColor"/>
    <path d="M12 1.5v2.2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <ellipse cx="9" cy="9.5" rx="2.5" ry="1.8" fill="white" opacity=".22" transform="rotate(-25 9 9.5)"/>
  </svg>`,

  check: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12.4" cy="12.5" r="9.5" fill="currentColor" opacity=".2" transform="translate(.3 .5)"/>
    <circle cx="12" cy="12" r="9.5" fill="currentColor"/>
    <path d="M5.8 9a9 9 0 0 1 6.2-3.5" stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".38"/>
    <path d="m8.3 12.2 2.7 2.7 4.7-5.1" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  user: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12.4" cy="8.4" r="4.4" fill="currentColor" opacity=".2" transform="translate(.3 .5)"/>
    <circle cx="12" cy="8" r="4.5" fill="currentColor"/>
    <circle cx="10.5" cy="6.5" r="1.5" fill="white" opacity=".25"/>
    <path d="M4.5 21a7.5 7.5 0 0 1 15 0z" fill="currentColor" opacity=".2" transform="translate(.3 .5)"/>
    <path d="M4.5 20.8a7.5 7.5 0 0 1 15 0z" fill="currentColor"/>
    <path d="M7 20.8a7.4 7.4 0 0 1 5-5" stroke="white" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".28"/>
  </svg>`,

  users: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="9" cy="7" r="4" fill="currentColor"/>
    <circle cx="8" cy="5.8" r="1.4" fill="white" opacity=".25"/>
    <path d="M1.5 20.5a7.5 7.5 0 0 1 15 0z" fill="currentColor"/>
    <path d="M3.5 20.5a7.4 7.4 0 0 1 5-5" stroke="white" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".28"/>
    <circle cx="17" cy="7" r="3.5" fill="currentColor" opacity=".75"/>
    <path d="M22.5 20.5a6.5 6.5 0 0 0-11-.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" opacity=".75"/>
  </svg>`,

  pin: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22.5S19.5 16 19.5 10a7.5 7.5 0 1 0-15 0C4.5 16 12 22.5 12 22.5z" fill="currentColor" opacity=".2" transform="translate(.4 .6)"/>
    <path d="M12 22S19.5 15.5 19.5 10a7.5 7.5 0 1 0-15 0C4.5 15.5 12 22 12 22z" fill="currentColor"/>
    <path d="M7 8.5a7.4 7.4 0 0 1 5-4" stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".35"/>
    <circle cx="12" cy="10" r="3" fill="white" opacity=".25"/>
    <circle cx="12" cy="10" r="1.4" fill="currentColor" opacity=".55"/>
  </svg>`,

  crosshair: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="12.3" cy="12.3" r="5.3" fill="currentColor" opacity=".2" transform="translate(.3 .4)"/>
    <circle cx="12" cy="12" r="5.5" fill="currentColor"/>
    <path d="M8.5 9a5 5 0 0 1 3.5-2" stroke="white" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".38"/>
    <circle cx="12" cy="12" r="2.5" fill="white" opacity=".3"/>
    <circle cx="12" cy="12" r="1.2" fill="currentColor" opacity=".65"/>
  </svg>`,

  edit: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 20.5h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M17.1 3.9a2 2 0 0 1 2.8 2.8L8.4 18.2 4 19l.8-4.4z" fill="currentColor" opacity=".22" transform="translate(.4 .5)"/>
    <path d="M17.1 3.9a2 2 0 0 1 2.8 2.8L8.4 18.2 4 19l.8-4.4z" fill="currentColor"/>
    <path d="M15.2 5.8 19 9.5" stroke="white" stroke-width="1.2" stroke-linecap="round" fill="none" opacity=".3"/>
  </svg>`,

  receipt: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M5.4 3.4H18.6v18l-2.6-2-2 2-2-2-2 2-2-2-2.6 2z" fill="currentColor" opacity=".2" transform="translate(.3 .4)"/>
    <path d="M5 3h14v18l-2.5-2-2 2-2-2-2 2-2-2L5 21z" fill="currentColor"/>
    <path d="M5 3h6v18L9 19l-2 2z" fill="black" opacity=".08"/>
    <path d="M11 3h8v12" fill="white" opacity=".09"/>
    <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h5" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>
  </svg>`,

  wrench: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M16.5 2a5.5 5.5 0 0 0-5.5 5.5c0 .5.07 1 .2 1.44L3.66 16.96A2.5 2.5 0 1 0 7.04 20.34l8.02-8.04c.44.13.9.2 1.44.2A5.5 5.5 0 0 0 16.5 2zM5.85 19.15a1 1 0 1 1-1.41-1.41 1 1 0 0 1 1.41 1.41z" fill="currentColor" opacity=".22" transform="translate(.4 .5)"/>
    <path d="M16.5 2a5.5 5.5 0 0 0-5.5 5.5c0 .5.07 1 .2 1.44L3.66 16.96A2.5 2.5 0 1 0 7.04 20.34l8.02-8.04c.44.13.9.2 1.44.2A5.5 5.5 0 0 0 16.5 2zM5.85 19.15a1 1 0 1 1-1.41-1.41 1 1 0 0 1 1.41 1.41z" fill="currentColor"/>
    <path d="M13.5 4.5a3.5 3.5 0 0 1 2 1" stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".35"/>
  </svg>`,

  refresh: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9M3.5 12A8.5 8.5 0 0 1 18.1 6.1" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" opacity=".28" transform="translate(.4 .5)"/>
    <path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9M3.5 12A8.5 8.5 0 0 1 18.1 6.1" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M21 4.5v6h-6M3 19.5v-6h6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  arrowRight: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 12h13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M13.5 6.5 20 12l-6.5 5.5z" fill="currentColor" opacity=".22" transform="translate(.4 .5)"/>
    <path d="M13.5 6.5 20 12l-6.5 5.5z" fill="currentColor"/>
    <path d="M15 8.5l3.5 3.5" stroke="white" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".35"/>
  </svg>`,

  arrowLeft: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 12H6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M10.5 6.5 4 12l6.5 5.5z" fill="currentColor" opacity=".22" transform="translate(-.4 .5)"/>
    <path d="M10.5 6.5 4 12l6.5 5.5z" fill="currentColor"/>
    <path d="M9 8.5 5.5 12" stroke="white" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".35"/>
  </svg>`,

  moon: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 12.8A9.5 9.5 0 1 1 11.2 3a7.5 7.5 0 0 0 9.8 9.8z" fill="currentColor" opacity=".22" transform="translate(.4 .5)"/>
    <path d="M21 12.8A9.5 9.5 0 1 1 11.2 3a7.5 7.5 0 0 0 9.8 9.8z" fill="currentColor"/>
    <path d="M14 4.5a7 7 0 0 1 2 1.8" stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".35"/>
    <circle cx="8" cy="9" r="1.2" fill="white" opacity=".18"/>
  </svg>`,

  sun: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12.4" cy="12.4" r="4.4" fill="currentColor" opacity=".2" transform="translate(.3 .4)"/>
    <circle cx="12" cy="12" r="4.5" fill="currentColor"/>
    <circle cx="10.5" cy="10.5" r="1.5" fill="white" opacity=".3"/>
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`,

  staff: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="3" fill="currentColor" opacity=".2" transform="translate(.4 .5)"/>
    <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor"/>
    <rect x="3" y="3" width="9" height="18" rx="3" fill="black" opacity=".08"/>
    <rect x="3" y="3" width="18" height="6" rx="3" fill="white" opacity=".12"/>
    <circle cx="12" cy="9.5" r="2.5" fill="white" opacity=".28"/>
    <rect x="7" y="13.5" width="10" height="1.5" rx=".8" fill="white" opacity=".28"/>
    <rect x="8" y="16.5" width="8" height="1.5" rx=".8" fill="white" opacity=".18"/>
  </svg>`,

  dashboard: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.3" y="3.3" width="7" height="9" rx="2" fill="currentColor" opacity=".2" transform="translate(.4 .5)"/>
    <rect x="14.3" y="3.3" width="6.7" height="5" rx="2" fill="currentColor" opacity=".2" transform="translate(.4 .5)"/>
    <rect x="14.3" y="12.3" width="6.7" height="8.7" rx="2" fill="currentColor" opacity=".2" transform="translate(.4 .5)"/>
    <rect x="3.3" y="16.3" width="7" height="5" rx="2" fill="currentColor" opacity=".2" transform="translate(.4 .5)"/>
    <rect x="3" y="3" width="7" height="9" rx="2" fill="currentColor"/>
    <rect x="14" y="3" width="7" height="5" rx="2" fill="currentColor"/>
    <rect x="14" y="12" width="7" height="9" rx="2" fill="currentColor"/>
    <rect x="3" y="16" width="7" height="5" rx="2" fill="currentColor"/>
    <rect x="3" y="3" width="7" height="4" rx="2" fill="white" opacity=".15"/>
    <rect x="14" y="3" width="7" height="2.5" rx="2" fill="white" opacity=".15"/>
  </svg>`,

  ticket: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M3.4 9.4a2 2 0 0 1 2-2H18.6a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" fill="currentColor" opacity=".2" transform="translate(.3 .4)"/>
    <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" fill="currentColor"/>
    <path d="M13 7v10" fill="none" stroke="white" stroke-width="1.8" stroke-dasharray="2 2" stroke-linecap="round" opacity=".4"/>
    <path d="M16 10h3M16 12h3M16 14h3" fill="none" stroke="white" stroke-width="1.3" stroke-linecap="round" opacity=".32"/>
  </svg>`,

  inbox: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M5.4 4.4H18.6l3 9v5a2 2 0 0 1-2 2H4.4a2 2 0 0 1-2-2v-5z" fill="currentColor" opacity=".2" transform="translate(.3 .4)"/>
    <path d="M5 4h14l3 9v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5z" fill="currentColor"/>
    <path d="M5 4h5v14" fill="black" opacity=".07"/>
    <path d="M3 13h5l2 3h4l2-3h5" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/>
  </svg>`,

  box: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.4 3.4 21.4 8v8l-9 5-9-5V8z" fill="currentColor" opacity=".2" transform="translate(.3 .4)"/>
    <path d="M12 3 21 8v8l-9 5-9-5V8z" fill="currentColor"/>
    <path d="M3 8l9 5 9-5" fill="none" stroke="white" stroke-width="1.5" opacity=".38"/>
    <path d="M12 13v8" fill="none" stroke="white" stroke-width="1.8" opacity=".3"/>
    <path d="M3 8l9-5" fill="none" opacity="0"/>
    <path d="M21 8l-9 5V8l9-5z" fill="white" opacity=".1"/>
    <path d="M3 8l9 5V8L3 3z" fill="black" opacity=".09"/>
  </svg>`,

  building: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <rect x="4.3" y="2.3" width="15.4" height="19.4" rx="1.5" fill="currentColor" opacity=".2" transform="translate(.4 .5)"/>
    <rect x="4" y="2" width="16" height="20" rx="1.5" fill="currentColor"/>
    <rect x="4" y="2" width="6" height="20" rx="1.5" fill="black" opacity=".09"/>
    <rect x="4" y="2" width="16" height="5" rx="1.5" fill="white" opacity=".12"/>
    <rect x="6.5" y="6" width="2.5" height="3" rx=".7" fill="white" opacity=".3"/>
    <rect x="10.8" y="6" width="2.5" height="3" rx=".7" fill="white" opacity=".3"/>
    <rect x="15" y="6" width="2.5" height="3" rx=".7" fill="white" opacity=".3"/>
    <rect x="6.5" y="11" width="2.5" height="3" rx=".7" fill="white" opacity=".22"/>
    <rect x="10.8" y="11" width="2.5" height="3" rx=".7" fill="white" opacity=".22"/>
    <rect x="15" y="11" width="2.5" height="3" rx=".7" fill="white" opacity=".22"/>
    <rect x="9" y="16" width="6" height="6" rx=".7" fill="white" opacity=".18"/>
  </svg>`,

  clock: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12.4" cy="12.4" r="9.4" fill="currentColor" opacity=".2" transform="translate(.3 .4)"/>
    <circle cx="12" cy="12" r="9.5" fill="currentColor"/>
    <path d="M6 8.5a9 9 0 0 1 6-5" stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".35"/>
    <circle cx="12" cy="12" r="7" fill="white" opacity=".09"/>
    <path d="M12 7.5V12l3.2 2" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="1.3" fill="white" opacity=".55"/>
  </svg>`,

  clipboard: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <rect x="6.3" y="4.3" width="11.4" height="17.4" rx="2" fill="currentColor" opacity=".2" transform="translate(.3 .4)"/>
    <rect x="6" y="4" width="12" height="18" rx="2" fill="currentColor"/>
    <rect x="6" y="4" width="5" height="18" rx="2" fill="black" opacity=".09"/>
    <rect x="6" y="4" width="12" height="5" rx="2" fill="white" opacity=".1"/>
    <rect x="9" y="2.8" width="6" height="3" rx="1" fill="currentColor" opacity=".22" transform="translate(.2 .3)"/>
    <rect x="9" y="2.5" width="6" height="3" rx="1" fill="currentColor"/>
    <path d="M9 11h6M9 14.5h6M9 18h4" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round" opacity=".42"/>
  </svg>`,

  search: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="11.4" cy="11.4" r="7.4" fill="currentColor" opacity=".2" transform="translate(.3 .4)"/>
    <circle cx="11" cy="11" r="7.5" fill="currentColor"/>
    <path d="M7 7.5a6.5 6.5 0 0 1 4.5-3" stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".35"/>
    <circle cx="11" cy="11" r="5" fill="white" opacity=".09"/>
    <path d="M16.8 16.8 21 21" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <path d="M16.8 16.8 21 21" stroke="white" stroke-width="1.2" stroke-linecap="round" opacity=".22"/>
  </svg>`,

  eye: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 5c7 0 10.5 7 10.5 7S19 19 12 19 1.5 12 1.5 12 5 5 12 5z" fill="currentColor" opacity=".2" transform="translate(.3 .5)"/>
    <path d="M12 5c7 0 10.5 7 10.5 7S19 19 12 19 1.5 12 1.5 12 5 5 12 5z" fill="currentColor"/>
    <path d="M4.5 12c1.5-3 4.5-5.5 7.5-5.5" stroke="white" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".3"/>
    <circle cx="12.3" cy="12.3" r="3.3" fill="currentColor" opacity=".2" transform="translate(.2 .3)"/>
    <circle cx="12" cy="12" r="3.5" fill="white" opacity=".28"/>
    <circle cx="12" cy="12" r="2" fill="currentColor" opacity=".72"/>
    <circle cx="11" cy="11" r=".8" fill="white" opacity=".5"/>
  </svg>`,

  eyeOff: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 3l18 18" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" opacity=".22" transform="translate(.4 .5)"/>
    <path d="M3 3l18 18" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M10.6 5.2a10 10 0 0 1 1.4-.2c7 0 10.5 7 10.5 7a17 17 0 0 1-3 4.2M6.5 6.8C4 8.5 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.5-1.7M10 10.3A3 3 0 0 0 13.7 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>
    <path d="M3 3l18 18" stroke="white" stroke-width="1.2" stroke-linecap="round" opacity=".2"/>
  </svg>`,

  star: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.4 2.4l3.1 7.1 7.3.7-5.5 4.8 1.7 7.2-6.6-3.9-6.6 3.9 1.7-7.2-5.5-4.8 7.3-.7z" fill="currentColor" opacity=".22" transform="translate(.3 .5)"/>
    <path d="M12 2l3 7 7 .6-5.3 4.6 1.6 7L12 17.4 5.7 21l1.6-7L2 9.6 9 9z" fill="currentColor"/>
    <path d="M12 3.5l2 5" stroke="white" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".35"/>
    <path d="M3.5 10l5 .5" stroke="white" stroke-width="1.1" stroke-linecap="round" fill="none" opacity=".22"/>
  </svg>`,

  starOutline: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2l3 7 7 .6-5.3 4.6 1.6 7L12 17.4 5.7 21l1.6-7L2 9.6 9 9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M12 4.5l1.8 4.5" stroke="white" stroke-width="1.1" stroke-linecap="round" fill="none" opacity=".3"/>
  </svg>`,

  settings: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.4 14.9a1.8 1.8 0 0 0 .4 2l.05.05a2.1 2.1 0 0 1-3 3 1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.65V21.5a2.1 2.1 0 0 1-4.2 0v-.08a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-2 .4l-.05.05a2.1 2.1 0 0 1-3-3 1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.65-1.1H2a2.1 2.1 0 0 1 0-4.2h.08a1.8 1.8 0 0 0 1.65-1.1 1.8 1.8 0 0 0-.4-2l-.05-.05a2.1 2.1 0 0 1 3-3 1.8 1.8 0 0 0 2 .4h.08A1.8 1.8 0 0 0 9.5 2.1V2a2.1 2.1 0 0 1 4.2 0v.08a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 2-.4l.05-.05a2.1 2.1 0 0 1 3 3 1.8 1.8 0 0 0-.4 2v.08a1.8 1.8 0 0 0 1.65 1.1H22a2.1 2.1 0 0 1 0 4.2h-.08a1.8 1.8 0 0 0-1.65 1.1z" fill="currentColor" opacity=".22" transform="translate(.4 .5)"/>
    <path d="M19.4 14.9a1.8 1.8 0 0 0 .4 2l.05.05a2.1 2.1 0 0 1-3 3 1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.65V21.5a2.1 2.1 0 0 1-4.2 0v-.08a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-2 .4l-.05.05a2.1 2.1 0 0 1-3-3 1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.65-1.1H2a2.1 2.1 0 0 1 0-4.2h.08a1.8 1.8 0 0 0 1.65-1.1 1.8 1.8 0 0 0-.4-2l-.05-.05a2.1 2.1 0 0 1 3-3 1.8 1.8 0 0 0 2 .4h.08A1.8 1.8 0 0 0 9.5 2.1V2a2.1 2.1 0 0 1 4.2 0v.08a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 2-.4l.05-.05a2.1 2.1 0 0 1 3 3 1.8 1.8 0 0 0-.4 2v.08a1.8 1.8 0 0 0 1.65 1.1H22a2.1 2.1 0 0 1 0 4.2h-.08a1.8 1.8 0 0 0-1.65 1.1z" fill="currentColor"/>
    <circle cx="12.3" cy="12.3" r="3" fill="currentColor" opacity=".22" transform="translate(.3 .4)"/>
    <circle cx="12" cy="12" r="3.5" fill="currentColor"/>
    <circle cx="11" cy="11" r="1.2" fill="white" opacity=".32"/>
  </svg>`,

  block: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12.4" cy="12.4" r="9.4" fill="currentColor" opacity=".22" transform="translate(.3 .4)"/>
    <circle cx="12" cy="12" r="9.5" fill="currentColor"/>
    <path d="M5.8 9a9 9 0 0 1 6.2-4" stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".3"/>
    <path d="M5.5 5.5l13 13" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,

  rupee: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 4h12M6 9h12M6 13.5c4.5 0 6.5-2 6.5-4.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity=".3" transform="translate(.3 .4)"/>
    <path d="M6 4h12M6 9h12M6 13.5c4.5 0 6.5-2 6.5-4.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M9.5 13.5 16.5 21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,

  card: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <rect x="2.3" y="5.3" width="19.4" height="13.4" rx="2.5" fill="currentColor" opacity=".2" transform="translate(.3 .4)"/>
    <rect x="2" y="5" width="20" height="14" rx="2.5" fill="currentColor"/>
    <rect x="2" y="5" width="20" height="5" rx="2.5" fill="black" opacity=".15"/>
    <rect x="2" y="9.5" width="20" height="1.8" fill="currentColor" opacity=".4"/>
    <rect x="2" y="5" width="8" height="14" rx="2.5" fill="white" opacity=".06"/>
    <rect x="5" y="14" width="3" height="2" rx=".8" fill="white" opacity=".32"/>
    <rect x="10" y="14" width="4" height="2" rx=".8" fill="white" opacity=".2"/>
  </svg>`,

  logout: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity=".3" transform="translate(.3 .4)"/>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M16.5 7.5 21 12l-4.5 4.5z" fill="currentColor" opacity=".22" transform="translate(.4 .5)"/>
    <path d="M16.5 7.5 21 12l-4.5 4.5z" fill="currentColor"/>
    <path d="M21 12H9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M18.5 9.5 21 12" stroke="white" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".35"/>
  </svg>`,

  menu: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.3 6.3h15.4M4.3 12.3h15.4M4.3 18.3h15.4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" opacity=".25" transform="translate(.3 .4)"/>
    <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
  </svg>`,

  close: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.4 6.4 6.4 18.4M6.4 6.4l12 12" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" opacity=".25" transform="translate(.3 .4)"/>
    <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>
  </svg>`,

  play: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.4 5.4 19.6 12l-11.2 6.6z" fill="currentColor" opacity=".22" transform="translate(.3 .5)"/>
    <path d="M8 5l11 7-11 7z" fill="currentColor"/>
    <path d="M9 7l7 5" stroke="white" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".3"/>
  </svg>`,

  pause: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <rect x="5.3" y="4.3" width="4.4" height="15.4" rx="1.5" fill="currentColor" opacity=".22" transform="translate(.3 .4)"/>
    <rect x="14.3" y="4.3" width="4.4" height="15.4" rx="1.5" fill="currentColor" opacity=".22" transform="translate(.3 .4)"/>
    <rect x="5" y="4" width="4.5" height="16" rx="1.5" fill="currentColor"/>
    <rect x="14.5" y="4" width="4.5" height="16" rx="1.5" fill="currentColor"/>
    <rect x="5" y="4" width="4.5" height="4" rx="1.5" fill="white" opacity=".18"/>
    <rect x="14.5" y="4" width="4.5" height="4" rx="1.5" fill="white" opacity=".12"/>
  </svg>`,

  alert: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.6 4 2 20h20L13.4 4a2 2 0 0 0-2.8 0z" fill="currentColor" opacity=".22" transform="translate(.3 .5)"/>
    <path d="M10.3 3.7 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z" fill="currentColor"/>
    <path d="M5 18.5 12 5.5" stroke="white" stroke-width="1" fill="none" opacity=".18" stroke-linecap="round"/>
    <path d="M12 8.5v5" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="12" cy="17" r="1.3" fill="white"/>
  </svg>`,

  hourglass: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.3 2.3h11.4M6.3 21.7h11.4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity=".3" transform="translate(.3 .4)"/>
    <path d="M6 2h12M6 22h12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M6.3 2.3v4l5.7 5.7 5.7-5.7V2.3z" fill="currentColor" opacity=".22" transform="translate(.2 .3)"/>
    <path d="M6 2v4l6 6 6-6V2z" fill="currentColor"/>
    <path d="M6 22v-4l6-6 6 6v4z" fill="currentColor" opacity=".72"/>
    <path d="M6.5 2.5h11v2L12 10" stroke="white" stroke-width="1.2" fill="none" opacity=".22" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  plus: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.3 5.3v13.4M5.3 12.3h13.4" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" opacity=".25" transform="translate(.3 .4)"/>
    <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  </svg>`,

  link: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.4 13.4a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity=".28" transform="translate(.3 .4)"/>
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,

  upload: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.3 15.3v4a2 2 0 0 1-2 2H4.7a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".28" transform="translate(.3 .4)"/>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M17.3 8.3 12 3l-5.3 5.3z" fill="currentColor" opacity=".22" transform="translate(.3 .4)"/>
    <path d="M17 8l-5-5-5 5z" fill="currentColor"/>
    <path d="M12 3v12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M10 4.5l2-2" stroke="white" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".38"/>
  </svg>`,

  download: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.3 15.3v4a2 2 0 0 1-2 2H4.7a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".28" transform="translate(.3 .4)"/>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M7.3 10.3 12 15l4.7-4.7z" fill="currentColor" opacity=".22" transform="translate(.3 .4)"/>
    <path d="M7 10l5 5 5-5z" fill="currentColor"/>
    <path d="M12 15V3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M10 12.5l2 2" stroke="white" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".38"/>
  </svg>`,

  phone: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z" fill="currentColor" opacity=".22" transform="translate(.4 .5)"/>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z" fill="currentColor"/>
    <path d="M5 3.5c2.5.5 5 2 7 4" stroke="white" stroke-width="1.3" stroke-linecap="round" fill="none" opacity=".3"/>
  </svg>`,

  whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`,

  calendar: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.3" y="4.3" width="17.4" height="17.4" rx="2.5" fill="currentColor" opacity=".2" transform="translate(.3 .4)"/>
    <rect x="3" y="4" width="18" height="18" rx="2.5" fill="currentColor"/>
    <rect x="3" y="4" width="18" height="7" rx="2.5" fill="black" opacity=".15"/>
    <rect x="3" y="4" width="8" height="18" rx="2.5" fill="white" opacity=".05"/>
    <path d="M8 2v4M16 2v4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity=".7"/>
    <path d="M3 11h18" stroke="white" stroke-width="1.5" fill="none" opacity=".35"/>
    <rect x="6.5" y="14" width="2.5" height="2.5" rx=".7" fill="white" opacity=".3"/>
    <rect x="10.8" y="14" width="2.5" height="2.5" rx=".7" fill="white" opacity=".25"/>
    <rect x="15" y="14" width="2.5" height="2.5" rx=".7" fill="white" opacity=".2"/>
    <rect x="6.5" y="18" width="2.5" height="2" rx=".7" fill="white" opacity=".18"/>
    <rect x="10.8" y="18" width="2.5" height="2" rx=".7" fill="white" opacity=".14"/>
  </svg>`,
};
