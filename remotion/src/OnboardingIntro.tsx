import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { NetworkNodes } from "./NetworkNodes";

const COLORS = {
  bg: "#06100b",
  primary: "#2bbf73",
  text: "#eaf5ee",
  textDim: "#8fa79a",
};

function BrandTitle() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleIn = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const taglineIn = spring({ frame: frame - 12, fps, config: { damping: 16, mass: 0.6 } });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 30}px)`,
          fontSize: 72,
          fontWeight: 800,
          color: COLORS.text,
          letterSpacing: 1,
          textAlign: "center",
        }}
      >
        Networking Experts
      </div>
      <div
        style={{
          opacity: taglineIn,
          transform: `translateY(${(1 - taglineIn) * 20}px)`,
          fontSize: 30,
          fontWeight: 500,
          color: COLORS.primary,
          marginTop: 18,
          textAlign: "center",
        }}
      >
        Service. On time. Verified.
      </div>
    </AbsoluteFill>
  );
}

// One composition, three beats: network builds in silently, brand title and
// tagline land on top, then everything holds and fades to black at the end
// (fadeOutStart tuned against durationInFrames so the cut never feels abrupt).
export function OnboardingIntro() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fadeOutStart = durationInFrames - 20;
  const globalOpacity = interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, opacity: globalOpacity }}>
      <AbsoluteFill style={{ opacity: 0.9 }}>
        <NetworkNodes />
      </AbsoluteFill>
      <Sequence from={20}>
        <BrandTitle />
      </Sequence>
    </AbsoluteFill>
  );
}
