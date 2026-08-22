import { Composition } from "remotion";
import { OnboardingIntro } from "./OnboardingIntro";

// Portrait, phone-shaped — this composition is the video counterpart to the
// mobile app's onboarding: a short brand intro that can be embedded as the
// app's first-launch splash video or used as a store-listing/promo clip.
export const OnboardingIntroComposition = () => {
  return (
    <Composition
      id="OnboardingIntro"
      component={OnboardingIntro}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
