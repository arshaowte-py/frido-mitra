// Frido Care · tracking config. All values are placeholders for the physio + engineering teams to tune.
export const CONFIG = {
  minVisibility: 0.5,        // below this a landmark is treated as not seen
  setupVisibility: 0.6,      // required landmarks must reach this during camera setup (brief §8 step 5)
  setupHoldMs: 1000,         // setup checks must pass continuously for this long
  calibrateFrames: 15,       // frames averaged for exercise-specific baselines
  countdownS: 3,
  lostVisibility: 0.4,       // tracking pauses when required-landmark visibility drops below this…
  lostMs: 3000,              // …for this long
  carryMs: 300,              // carry the last good landmark this long when it drops out
  holdDipMs: 300,            // brief dips during a hold are tolerated
  confirmFrames: 3,          // frames needed to confirm a phase change
  oneEuro: { minCutoff: 1.7, beta: 3 },
  romWeight: 0.5,            // quality points lost per 1.0 of range shortfall (×100)
  holdWeight: 0.3,
  swayGain: 500,             // balance steadiness: 100 − sd(hip x / shoulder width) × gain
  cueGapMs: 2500,            // min gap between any two corrective cues
  sameCueGapMs: 6000,        // min gap before repeating the same cue
  goodEvery: 3,              // say "Good" after this many clean reps in a row
  frame: { minHeight: 0.4, maxHeight: 0.94, margin: 0.015 },
  light: { dark: 55, backlitDelta: 55 },
  tiers: { tier1Fps: 20, tier2Fps: 12 },
  painCeiling: 5,
  goodRepQuality: 80,
};
