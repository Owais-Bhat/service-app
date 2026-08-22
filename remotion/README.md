# Networking Experts — Promo/Onboarding Video

A standalone Remotion project that renders a short brand-intro MP4 (network
node animation + title/tagline), separate from the `mobile/` app. Remotion
renders offline via headless Chrome + ffmpeg — it is **not** something that
runs live inside the mobile app; the app would play back the exported MP4
as a static asset (e.g. on first launch or as a store-listing clip).

## Structure

- `src/OnboardingIntro.tsx` — the composition: brand title + tagline over an
  animated node network, dark theme matching the mobile app.
- `src/NetworkNodes.tsx` — the animated background, a pre-rendered SVG
  counterpart to the mobile app's live `NetworkScene3D` (three.js) component.

## Commands

**Install dependencies**

```console
npm i
```

**Preview in the Remotion Studio** (hot-reloading editor)

```console
npm run dev
```

**Render to MP4**

```console
npx remotion render OnboardingIntro out/onboarding-intro.mp4
```

If your environment blocks Remotion's own Chrome-Headless-Shell download
host, point it at any existing Chromium/Chrome-headless-shell binary instead:

```console
npx remotion render OnboardingIntro out/onboarding-intro.mp4 --browser-executable=/path/to/headless_shell
```

## Licensing

Remotion is free for teams of up to 3 people; larger teams need a company
license. See https://www.remotion.dev/license before shipping this in
production if the team using/building on this exceeds that.
