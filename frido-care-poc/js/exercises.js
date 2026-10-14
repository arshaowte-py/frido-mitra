// Frido Care · exercise library + movement specs
// EVERY clinical number here (angles, holds, dosage, thresholds) is a placeholder for the
// Frido physio team to tune. Foot exercises follow the "Foot Core Exercises" protocol sheet;
// all other conditions are drafts awaiting physio approval.

import { angle, dist, mid, tiltFromVertical, signedTilt, signedFromDown, deg } from './engine.js';

// ---------- shared measurements ----------
const knee = (p, s) => angle(p.pt('hip', s), p.pt('knee', s), p.pt('ankle', s));
const hip = (p, s) => angle(p.pt('shoulder', s), p.pt('hip', s), p.pt('knee', s));
const trunk = (p, s) => tiltFromVertical(p.pt('hip', s), p.pt('shoulder', s));
const shin = (p, s) => dist(p.pt('knee', s), p.pt('ankle', s));
const thigh = (p, s) => dist(p.pt('hip', s), p.pt('knee', s));
const arm = (p, s) => angle(p.pt('hip', s), p.pt('shoulder', s), p.pt('elbow', s));
const elbow = (p, s) => angle(p.pt('shoulder', s), p.pt('elbow', s), p.pt('wrist', s));
const shMid = p => mid(p.pt('shoulder', 'L'), p.pt('shoulder', 'R'));
const hipMid = p => mid(p.pt('hip', 'L'), p.pt('hip', 'R'));
const ankMid = p => mid(p.pt('ankle', 'L'), p.pt('ankle', 'R'));
const shWidth = p => dist(p.pt('shoulder', 'L'), p.pt('shoulder', 'R'));
const torsoSigned = p => signedTilt(hipMid(p), shMid(p)); // + = leaning to the person's left (image right)
const lineTilt = (a, b) => deg(Math.atan2(a.y - b.y, a.x - b.x)); // l→r line vs horizontal
const sgn = s => (s === 'L' ? 1 : -1);
const r0 = v => Math.round(v);

// ---------- cue copy (short, kind, no medical terms) ----------
export const CUES = {
  start: { en: "Ready. Let's start.", hi: 'तैयार। शुरू करते हैं।' },
  good: { en: 'Good', hi: 'बढ़िया' },
  relax: { en: 'Good. Relax.', hi: 'बढ़िया। अब आराम करें।' },
  hold: { en: 'Hold it there', hi: 'वहीं रोकें' },
  hold_done: { en: 'Hold complete. Slowly relax.', hi: 'होल्ड पूरा। धीरे से छोड़ें।' },
  partial: { en: 'Almost. Go a bit further next time.', hi: 'लगभग। अगली बार थोड़ा और।' },
  go_deeper: { en: "Go a little further, if it's comfortable", hi: 'आराम से थोड़ा और' },
  stand_fully: { en: 'Stand up fully', hi: 'पूरा सीधा खड़े हों' },
  chest_up: { en: 'Keep your chest up', hi: 'छाती ऊपर रखें' },
  heels_down: { en: 'Keep your heels on the floor', hi: 'एड़ियाँ ज़मीन पर रखें' },
  slow_down: { en: 'Slower on the way down', hi: 'नीचे धीरे-धीरे जाएँ' },
  slow_return: { en: 'Come back slowly', hi: 'धीरे-धीरे वापस आएँ' },
  knees_straight: { en: 'Keep your knees straight', hi: 'घुटने सीधे रखें' },
  knee_straight: { en: 'Keep the knee straight', hi: 'घुटना सीधा रखें' },
  rise_straight: { en: "Rise straight up, don't lean forward", hi: 'सीधे ऊपर उठें, आगे न झुकें' },
  elbow_straight: { en: 'Keep your elbow straight', hi: 'कोहनी सीधी रखें' },
  no_lean_back: { en: "Keep your back straight, don't lean back", hi: 'कमर सीधी रखें, पीछे न झुकें' },
  stand_tall: { en: "Stand tall, don't lean sideways", hi: 'सीधे खड़े रहें, बगल में न झुकें' },
  hips_still: { en: 'Keep your hips still', hi: 'कूल्हे स्थिर रखें' },
  shoulders_level: { en: 'Relax your shoulders, keep them level', hi: 'कंधे ढीले और बराबर रखें' },
  arms_even: { en: 'Lift both arms evenly', hi: 'दोनों हाथ बराबर उठाएँ' },
  sit_tall: { en: 'Sit tall', hi: 'सीधे बैठें' },
  hold_toes: { en: 'Hold your toes and gently pull them back', hi: 'पंजे की उंगलियाँ पकड़कर धीरे से पीछे खींचें' },
  roll_slower: { en: 'Roll a little slower', hi: 'थोड़ा धीरे रोल करें' },
  steady: { en: 'Look at one point and stay steady', hi: 'एक जगह देखें और स्थिर रहें' },
  feet_flat: { en: 'Keep your feet flat and knees bent', hi: 'पैर ज़मीन पर, घुटने मुड़े रखें' },
  lost: { en: "I can't see you. Step back into view.", hi: 'आप दिख नहीं रहे। कैमरे के सामने आएँ।' },
  set_done: { en: 'Set complete. Take a short rest.', hi: 'सेट पूरा। थोड़ा आराम करें।' },
  switch_side: { en: 'Now the other side', hi: 'अब दूसरी तरफ़' },
  all_done: { en: 'Well done! Exercise complete.', hi: 'शाबाश! व्यायाम पूरा हुआ।' },
};

/** Failed-check key → cue key, and the wording used in reports. */
export const FAULTS = {
  rom_short: { cue: 'go_deeper', label: 'Did not reach target range' },
  short_hold: { cue: 'hold', label: 'Hold shorter than prescribed' },
  too_fast: { cue: 'slow_down', label: 'Moved too fast' },
  too_fast_return: { cue: 'slow_return', label: 'Came back too fast' },
  trunk_lean: { cue: 'chest_up', label: 'Chest dropped forward' },
  heel_lift: { cue: 'heels_down', label: 'Heels lifted' },
  knees_bent: { cue: 'knees_straight', label: 'Knees bent' },
  knee_bent: { cue: 'knee_straight', label: 'Knee bent' },
  lean_forward: { cue: 'rise_straight', label: 'Leaned forward' },
  elbow_bent: { cue: 'elbow_straight', label: 'Elbow bent' },
  lean_back: { cue: 'no_lean_back', label: 'Leaned back' },
  side_lean: { cue: 'stand_tall', label: 'Leaned sideways' },
  hip_shift: { cue: 'hips_still', label: 'Hips shifted' },
  shoulder_hike: { cue: 'shoulders_level', label: 'Shoulders lifted / uneven' },
  uneven_arms: { cue: 'arms_even', label: 'Arms uneven' },
  slouch: { cue: 'sit_tall', label: 'Leaned back while seated' },
  no_hand: { cue: 'hold_toes', label: 'Toes not pulled back by hand' },
  sway: { cue: 'steady', label: 'Unsteady balance' },
  feet_away: { cue: 'feet_flat', label: 'Feet too far / knees straightened' },
};

const FOOT_SRC = 'Frido Foot Core Exercises protocol';
const DRAFT = 'Draft: physio to approve';

// `assortment`: Frido product categories a physio may pair with the plan (draft; merchandising to map SKUs).
export const CONDITIONS = [
  { id: 'foot', en: 'Foot & heel', hi: 'पैर और एड़ी', note: 'Plantar fasciitis, flat feet, foot fatigue', assortment: ['Orthotic insoles', 'Footwear'] },
  { id: 'back', en: 'Lower back', hi: 'कमर दर्द', note: 'Desk-related and non-specific low back pain', assortment: ['Cushions', 'Chairs', 'Mattress'] },
  { id: 'knee', en: 'Knee', hi: 'घुटना', note: 'Knee pain, early OA, strengthening', assortment: ['Orthotics', 'Mobility aids'] },
  { id: 'neck', en: 'Neck & shoulder', hi: 'गर्दन और कंधा', note: 'Desk posture, stiffness', assortment: ['Pillows', 'Chairs'] },
  { id: 'mobility', en: 'General mobility', hi: 'सामान्य लचीलापन', note: 'Daily movement and flexibility', assortment: ['Footwear', 'Cushions'] },
];

// ---------- the library ----------
export const EXERCISES = [
  // ===================== FOOT (from the Frido protocol sheet) =====================
  {
    id: 'heel-raise', conditions: ['foot', 'knee'], source: FOOT_SRC,
    title: { en: 'Heel raises', hi: 'एड़ी उठाना' },
    purpose: 'Strengthens calves and supports arch function.',
    steps: ['Stand with feet shoulder-width apart.', 'Slowly lift your heels off the ground, rising onto your toes.',
      'Hold for 2–3 seconds, then slowly lower your heels.', 'Repeat 15 times, do 2–3 sets.'],
    tier: 'tracked', mode: 'rep', view: 'side', position: 'standing', space: 'small',
    setup: 'Phone on the floor or a low stool, side-on to you, about 2 m away. Feet must be in view.',
    dosage: { sets: 2, reps: 15, holdS: 2, restS: 30 },
    sides: 'auto', required: ['hip', 'knee', 'ankle', 'heel', 'foot'],
    calibrate: (p, s) => ({ ankleY: p.pt('ankle', s).y, heelY: p.pt('heel', s).y, shin: shin(p, s) }),
    metric: (p, s, c) => c && (((c.ankleY - p.pt('ankle', s).y) + (c.heelY - p.pt('heel', s).y)) / 2) / c.shin,
    start: 0.02, target: 0.13, activeAt: 0.35, restAt: 0.2, countAt: 0.55, holdS: 2,
    label: 'Heel lift', fmt: v => `≈${Math.max(0, v * 42).toFixed(1)} cm`, targetText: 'Heels ≈ 5–6 cm up, hold 2 s',
    focus: 'ankle',
    checks: [
      { key: 'knees_bent', weight: 0.15, fn: (p, s) => knee(p, s) < 150 },
      { key: 'lean_forward', weight: 0.15, ratio: 0.35, fn: (p, s) => tiltFromVertical(p.pt('ankle', s), p.pt('shoulder', s)) > 16 },
    ],
  },
  {
    id: 'plantar-stretch', conditions: ['foot'], source: FOOT_SRC,
    title: { en: 'Plantar fascia stretch', hi: 'तलवे का स्ट्रेच' },
    purpose: 'Relieves tightness and pain in the arch, especially for plantar fasciitis.',
    steps: ['Sit in a chair and cross one foot over the opposite knee.',
      'Use your hand to gently pull the toes back toward your shin until you feel a stretch in the arch.',
      'Hold the stretch for 15–30 seconds.', 'Repeat 2–3 times per foot, especially after activity or first thing in the morning.'],
    tier: 'tracked', mode: 'rep', view: 'front', position: 'seated', space: 'small',
    setup: 'Sit facing the phone, about 1.5–2 m away, phone at chair-seat height. Whole body in view.',
    dosage: { sets: 1, reps: 3, holdS: 20, restS: 10, perSide: true },
    sides: 'both', required: ['shoulder', 'hip', 'knee', 'ankle'],
    metric: (p, s) => dist(p.pt('ankle', s), p.pt('knee', s === 'L' ? 'R' : 'L')) / shWidth(p),
    start: 1.0, target: 0.45, activeAt: 0.4, restAt: 0.2, countAt: 0.6, holdS: 20,
    label: 'Foot on knee', fmt: v => (v < 0.6 ? 'Crossed' : 'Not crossed'), targetText: 'Foot crossed, hold 20 s',
    focus: 'ankle', sideNoun: 'foot',
    checks: [
      { key: 'no_hand', weight: 0.2, ratio: 0.5, fn: (p, s) => {
        const f = p.pt('foot', s), w = shWidth(p);
        return Math.min(dist(p.pt('wrist', 'L'), f), dist(p.pt('wrist', 'R'), f)) / w > 0.55;
      } },
    ],
  },
  {
    id: 'foot-roller', conditions: ['foot'], source: FOOT_SRC,
    title: { en: 'Foot roller massage', hi: 'फुट रोलर मसाज' },
    purpose: 'Releases tension in the plantar fascia, improves blood flow and relieves foot fatigue.',
    steps: ['Sit with one foot on a foot roller (or a frozen water bottle or massage ball).', 'Apply gentle to moderate pressure.',
      'Roll the foot slowly back and forth from heel to toes.', 'Continue for 1–2 minutes per foot.', 'Repeat 2–3 times a day, especially after activity.'],
    tier: 'tracked', mode: 'strokes', view: 'side', position: 'seated', space: 'small',
    setup: 'Sit side-on to the phone, phone at seat height, about 1.5 m away. Feet in view.',
    dosage: { sets: 1, reps: 1, holdS: 60, restS: 10, perSide: true },
    sides: 'both', required: ['hip', 'knee', 'ankle', 'foot'],
    calibrate: (p, s) => ({ thigh: thigh(p, s) }),
    metric: (p, s, c) => c && (p.pt('foot', s).x - p.pt('hip', s).x) / c.thigh,
    amplitude: 0.12, minStrokeMs: 650, holdS: 60,
    label: 'Rolling', fmt: () => '', targetText: '60 s of slow rolling per foot', focus: 'foot', sideNoun: 'foot',
  },
  {
    id: 'balance', conditions: ['foot', 'mobility'], source: FOOT_SRC,
    title: { en: 'Balance board hold', hi: 'बैलेंस बोर्ड' },
    purpose: 'Improves ankle stability, strength, coordination and balance.',
    steps: ['Stand on a wobble board with feet shoulder-width apart (or on the floor, on one leg, near a wall for safety).',
      'Balance without letting the edges touch the ground.', 'Hold for 30–60 seconds, repeat 2–3 times.'],
    tier: 'tracked', mode: 'balance', view: 'front', position: 'standing', space: 'medium',
    setup: 'Face the phone, about 2.5 m away, phone at waist height. Keep a wall or chair within reach.',
    dosage: { sets: 1, reps: 3, holdS: 30, restS: 15 },
    sides: 'none', required: ['shoulder', 'hip', 'knee', 'ankle'], holdS: 30,
    label: 'Steadiness', fmt: v => (v == null ? '–' : `${v}/100`), targetText: '30 s steady hold', focus: 'hip',
  },
  ...guided('toe-yoga', 'Toe yoga', 'टो योगा', 'Improves independent toe control and strengthens small foot muscles.',
    ['Sit in a chair or stand.', 'Press your big toe down while lifting the other four toes.', 'Then press the four toes down while lifting the big toe.',
      'Hold each position for 5 seconds, repeat 10–12 times on each foot.'],
    { sets: 1, reps: 10 }, [{ en: 'Big toe down, lift the other four', hi: 'अंगूठा नीचे, बाकी चार उंगलियाँ ऊपर', s: 5 },
      { en: 'Four toes down, lift the big toe', hi: 'चार उंगलियाँ नीचे, अंगूठा ऊपर', s: 5 }]),
  ...guided('short-foot', 'Short foot exercise', 'शॉर्ट फुट', 'Strengthens the arch muscles of the foot.',
    ['Sit with your foot flat on the floor.', 'Without curling your toes, pull the ball of your foot toward your heel. This raises the arch slightly.',
      'Hold the contraction for 5–10 seconds.', 'Repeat 10 times per foot.'],
    { sets: 1, reps: 10 }, [{ en: 'Pull the ball of the foot toward the heel. Hold', hi: 'पंजे को एड़ी की ओर खींचें। रोकें', s: 7 },
      { en: 'Relax', hi: 'आराम', s: 3 }]),
  ...guided('toe-splay', 'Toe splay', 'उंगलियाँ फैलाना', 'Strengthens toe muscles and improves coordination.',
    ['Sit comfortably with feet on the ground.', 'Spread all your toes apart as far as possible.', 'Hold for 5 seconds, then relax.', 'Repeat 10 times.'],
    { sets: 1, reps: 10 }, [{ en: 'Spread your toes wide. Hold', hi: 'उंगलियाँ फैलाएँ। रोकें', s: 5 }, { en: 'Relax', hi: 'आराम', s: 3 }]),
  ...guided('toe-squish', 'Toe squish', 'टो स्क्विश', 'Strengthens the muscles for toe stability and grip.',
    ['Sit with your foot flat on the floor.', 'Press your big toe and little toe down into the floor, middle toes relaxed.',
      'Focus on squeezing the sides of the foot together.', 'Hold for 5–10 seconds.', 'Repeat 10–12 times per foot.'],
    { sets: 1, reps: 10 }, [{ en: 'Press big toe and little toe down. Hold', hi: 'अंगूठा और छोटी उंगली दबाएँ। रोकें', s: 7 }, { en: 'Relax', hi: 'आराम', s: 3 }]),
  ...guided('towel-scrunch', 'Towel scrunches', 'तौलिया खींचना', 'Improves toe flexor strength.',
    ['Lay a towel on the floor.', 'Use your toes to scrunch the towel toward you.', 'Perform 10–15 repetitions.',
      "Add a light weight on the towel's end for extra resistance if desired."],
    { sets: 1, reps: 12 }, [{ en: 'Scrunch', hi: 'खींचें', s: 2 }, { en: 'Release', hi: 'छोड़ें', s: 2 }]),
  ...guided('toe-curl-band', 'Toe curl with resistance band', 'बैंड के साथ टो कर्ल', 'Strengthens toe flexors and improves grip and stability.',
    ['Sit in a chair with your foot flat on the floor.', 'Anchor a resistance band under your foot.',
      'Grab the band with your toes and curl them down as if gripping the floor.', 'Hold the curl for 5 seconds, then slowly release.', 'Repeat 10–15 times per foot.'],
    { sets: 1, reps: 12 }, [{ en: 'Curl the toes. Hold', hi: 'उंगलियाँ मोड़ें। रोकें', s: 5 }, { en: 'Slowly release', hi: 'धीरे छोड़ें', s: 3 }]),

  // ===================== LOWER BACK =====================
  {
    id: 'knee-to-chest', conditions: ['back'], source: DRAFT,
    title: { en: 'Knee to chest stretch', hi: 'घुटना छाती तक' },
    purpose: 'Gently stretches the lower back and hips.',
    steps: ['Lie on your back on a mat, legs straight.', 'Bring one knee toward your chest and hold it with both hands.',
      'Keep the other leg relaxed on the floor.', 'Hold 20 seconds, then lower slowly. Switch legs.'],
    tier: 'tracked', mode: 'rep', view: 'side', position: 'lying', orientation: 'landscape', space: 'medium',
    setup: 'Phone on the floor, landscape, side-on to you, about 2 m away.',
    dosage: { sets: 1, reps: 3, holdS: 20, restS: 10, perSide: true },
    sides: 'both', required: ['shoulder', 'hip', 'knee'],
    metric: (p, s) => hip(p, s), start: 160, target: 80, activeAt: 0.35, restAt: 0.2, countAt: 0.6, holdS: 20,
    label: 'Hip bend', fmt: v => `${r0(180 - v)}°`, targetText: 'Knee pulled to chest, hold 20 s', focus: 'hip', sideNoun: 'leg',
    checks: [],
  },
  {
    id: 'bridge', conditions: ['back', 'knee'], source: DRAFT,
    title: { en: 'Glute bridge', hi: 'ब्रिज' },
    purpose: 'Strengthens the hips and lower back muscles.',
    steps: ['Lie on your back, knees bent, feet flat and hip-width apart.', 'Squeeze your buttocks and lift your hips until your body is in a straight line from shoulders to knees.',
      'Hold 3 seconds at the top.', 'Lower slowly.'],
    tier: 'tracked', mode: 'rep', view: 'side', position: 'lying', orientation: 'landscape', space: 'medium',
    setup: 'Phone on the floor, landscape, side-on to you, about 2 m away.',
    dosage: { sets: 2, reps: 10, holdS: 3, restS: 30 },
    sides: 'auto', required: ['shoulder', 'hip', 'knee', 'ankle'],
    calibrate: (p, s) => ({ hip: hip(p, s) }),
    rangeFromCal: c => ({ start: c.hip > 150 || c.hip < 100 ? 130 : c.hip, target: 168 }),
    metric: (p, s) => hip(p, s), start: 130, target: 168, activeAt: 0.35, restAt: 0.2, countAt: 0.55, holdS: 3,
    label: 'Hip lift', fmt: v => `${r0(v)}°`, targetText: 'Straight line shoulder→knee, hold 3 s', focus: 'hip',
    tempo: { minReturnMs: 900, weight: 0.1 },
    checks: [{ key: 'feet_away', weight: 0.1, ratio: 0.5, fn: (p, s) => knee(p, s) > 130 }],
  },
  {
    id: 'bird-dog', conditions: ['back'], source: DRAFT,
    title: { en: 'Bird-dog', hi: 'बर्ड-डॉग' },
    purpose: 'Builds core and back stability.',
    steps: ['Start on hands and knees, hands under shoulders, knees under hips.', 'Reach one arm forward and the opposite leg back until both are level with your body.',
      'Hold 5 seconds, keeping your back flat.', 'Return slowly and switch sides.'],
    tier: 'tracked', mode: 'rep', view: 'side', position: 'floor', orientation: 'landscape', space: 'medium',
    setup: 'Phone on the floor, landscape, side-on to you, about 2.5 m away.',
    dosage: { sets: 1, reps: 8, holdS: 5, restS: 30, perSide: true },
    sides: 'both', required: ['shoulder', 'hip', 'knee', 'ankle', 'wrist'],
    // side L = left leg back + right arm forward
    metric: (p, s) => {
      const o = s === 'L' ? 'R' : 'L';
      const leg = (angle(p.pt('shoulder', s), p.pt('hip', s), p.pt('ankle', s)) - 115) / (170 - 115);
      const a = (arm(p, o) - 95) / (165 - 95);
      return Math.min(leg, a);
    },
    start: 0, target: 1, activeAt: 0.4, restAt: 0.2, countAt: 0.65, holdS: 5,
    label: 'Arm + leg reach', fmt: v => `${r0(Math.max(0, Math.min(1.2, v)) * 100)}%`, targetText: 'Arm and opposite leg level, hold 5 s',
    focus: 'hip', sideNoun: 'leg',
    readout: (p, s) => { const o = s === 'L' ? 'R' : 'L'; return `Arm ${r0(arm(p, o))}° · Leg ${r0(angle(p.pt('shoulder', s), p.pt('hip', s), p.pt('ankle', s)))}°`; },
    checks: [],
  },
  {
    id: 'side-bend', conditions: ['back', 'mobility'], source: DRAFT,
    title: { en: 'Standing side bend', hi: 'खड़े होकर बगल में झुकना' },
    purpose: 'Improves side-to-side mobility of the spine.',
    steps: ['Stand tall, feet hip-width apart, arms by your sides.', 'Slide one hand down the side of your thigh, bending sideways.',
      'Hold 3 seconds, come back to the centre.', 'Repeat on the other side.'],
    tier: 'tracked', mode: 'rep', view: 'front', position: 'standing', space: 'small',
    setup: 'Face the phone, about 2.5 m away, phone at waist height. Whole body in view.',
    dosage: { sets: 1, reps: 8, holdS: 3, restS: 20, perSide: true },
    sides: 'both', required: ['shoulder', 'hip', 'ankle'],
    metric: (p, s) => sgn(s) * torsoSigned(p), start: 3, target: 28, activeAt: 0.35, restAt: 0.2, countAt: 0.5, holdS: 3,
    label: 'Side bend', fmt: v => `${r0(Math.max(0, v))}°`, targetText: 'Bend ≈ 28°, hold 3 s', focus: 'shoulder',
    checks: [{ key: 'hip_shift', weight: 0.2, ratio: 0.35, fn: p => Math.abs(hipMid(p).x - ankMid(p).x) / shWidth(p) > 0.4 }],
  },
  ...guided('pelvic-tilt', 'Pelvic tilt', 'पेल्विक टिल्ट', 'Gently mobilises the lower back.',
    ['Lie on your back, knees bent, feet flat.', 'Tighten your stomach and press your lower back gently into the floor.', 'Hold 5 seconds, then relax.', 'Repeat 10 times.'],
    { sets: 1, reps: 10 }, [{ en: 'Press your lower back down. Hold', hi: 'कमर को ज़मीन पर दबाएँ। रोकें', s: 5 }, { en: 'Relax', hi: 'आराम', s: 3 }],
    ['back'], DRAFT, 'Camera tracking not reliable for this small movement yet'),
  ...guided('cat-camel', 'Cat-camel', 'कैट-कैमल', 'Mobilises the whole spine. Similar to Marjaryasana–Bitilasana (physio to confirm).',
    ['Start on hands and knees.', 'Slowly round your back up toward the ceiling, head down.', 'Then slowly let your back sink, head up.', 'Move gently, 10 times.'],
    { sets: 1, reps: 10 }, [{ en: 'Round your back up', hi: 'कमर ऊपर गोल करें', s: 3 }, { en: 'Let your back sink, look up', hi: 'कमर नीचे, ऊपर देखें', s: 3 }],
    ['back', 'mobility'], DRAFT, 'Spine curve tracking planned for a later phase'),

  // ===================== KNEE =====================
  {
    id: 'squat', conditions: ['knee', 'mobility'], source: DRAFT,
    title: { en: 'Squat', hi: 'स्क्वाट' },
    purpose: 'Strengthens thighs and hips for daily tasks like sitting and climbing stairs.',
    steps: ['Stand with feet shoulder-width apart, arms forward.', 'Push your hips back and bend your knees as if sitting on a chair.',
      'Go down as far as is comfortable, up to thighs level with the floor.', 'Push through your heels to stand up.'],
    tier: 'tracked', mode: 'rep', view: 'side', position: 'standing', space: 'small',
    setup: 'Phone at waist height, side-on to you, about 2.5 m away. Head to feet in view.',
    dosage: { sets: 2, reps: 12, restS: 45 },
    sides: 'auto', required: ['shoulder', 'hip', 'knee', 'ankle'],
    metric: (p, s) => knee(p, s), start: 168, target: 95, activeAt: 0.25, restAt: 0.12, countAt: 0.45,
    label: 'Knee bend', fmt: v => `${r0(v)}°`, targetText: 'Knees to ≈ 95°', focus: 'knee', depthLabel: 'Depth',
    tempo: { minDownMs: 900, weight: 0.1 },
    checks: [
      { key: 'trunk_lean', weight: 0.25, ratio: 0.3, fn: (p, s) => trunk(p, s) > 45 },
      { key: 'heel_lift', weight: 0.15, ratio: 0.3, fn: (p, s) => (p.pt('foot', s).y - p.pt('heel', s).y) / shin(p, s) > 0.12 },
    ],
  },
  {
    id: 'sit-to-stand', conditions: ['knee'], source: DRAFT,
    title: { en: 'Sit to stand', hi: 'कुर्सी से उठना-बैठना' },
    purpose: 'Builds leg strength for getting up from a chair.',
    steps: ['Sit on the front half of a firm chair, feet flat.', 'Lean slightly forward and stand up fully without using your hands.',
      'Sit back down slowly, taking about 2 seconds.'],
    tier: 'tracked', mode: 'rep', view: 'side', position: 'seated', space: 'small',
    setup: 'Chair side-on to the phone, phone at waist height, about 2 m away.',
    dosage: { sets: 2, reps: 10, restS: 45 },
    sides: 'auto', required: ['shoulder', 'hip', 'knee', 'ankle'],
    metric: (p, s) => knee(p, s), start: 100, target: 165, activeAt: 0.35, restAt: 0.2, countAt: 0.7, goodRom: 0.92,
    romCue: 'stand_fully', label: 'Knee straightening', fmt: v => `${r0(v)}°`, targetText: 'Stand fully, sit down in 2 s', focus: 'knee', depthLabel: 'Stand',
    tempo: { minReturnMs: 1200, weight: 0.3 },
    checks: [{ key: 'trunk_lean', weight: 0.2, ratio: 0.45, fn: (p, s) => trunk(p, s) > 55 }],
  },
  {
    id: 'slr', conditions: ['knee'], source: DRAFT,
    title: { en: 'Straight leg raise', hi: 'सीधा पैर उठाना' },
    purpose: 'Strengthens the thigh muscle without bending the knee.',
    steps: ['Lie on your back. Bend one knee, foot flat.', 'Keep the other leg straight and tighten the thigh.',
      'Lift the straight leg to the height of the bent knee.', 'Hold 5 seconds, lower slowly.'],
    tier: 'tracked', mode: 'rep', view: 'side', position: 'lying', orientation: 'landscape', space: 'medium',
    setup: 'Phone on the floor, landscape, side-on to you, about 2 m away.',
    dosage: { sets: 2, reps: 10, holdS: 5, restS: 30, perSide: true },
    sides: 'both', required: ['shoulder', 'hip', 'knee', 'ankle'],
    metric: (p, s) => (knee(p, s) > 140 ? 180 - angle(p.pt('shoulder', s), p.pt('hip', s), p.pt('ankle', s)) : 0),
    start: 5, target: 40, activeAt: 0.35, restAt: 0.2, countAt: 0.6, holdS: 5,
    label: 'Leg lift', fmt: v => `${r0(Math.max(0, v))}°`, targetText: 'Leg up ≈ 40°, hold 5 s', focus: 'hip', sideNoun: 'leg',
    tempo: { minReturnMs: 800, weight: 0.1 },
    checks: [{ key: 'knee_bent', weight: 0.3, ratio: 0.3, fn: (p, s) => knee(p, s) < 160 }],
  },
  {
    id: 'knee-extension', conditions: ['knee'], source: DRAFT,
    title: { en: 'Seated knee extension', hi: 'बैठकर घुटना सीधा करना' },
    purpose: 'Strengthens the thigh, gentle on painful knees.',
    steps: ['Sit tall on a chair, feet flat.', 'Straighten one knee until the leg is level, toes up.', 'Hold 5 seconds.', 'Lower slowly. Switch legs after the set.'],
    tier: 'tracked', mode: 'rep', view: 'side', position: 'seated', space: 'small',
    setup: 'Sit side-on to the phone, phone at seat height, about 1.5–2 m away.',
    dosage: { sets: 2, reps: 10, holdS: 5, restS: 30, perSide: true },
    sides: 'both', required: ['shoulder', 'hip', 'knee', 'ankle'],
    metric: (p, s) => knee(p, s), start: 95, target: 165, activeAt: 0.35, restAt: 0.2, countAt: 0.6, holdS: 5,
    label: 'Knee straightening', fmt: v => `${r0(v)}°`, targetText: 'Knee ≈ 165°, hold 5 s', focus: 'knee', sideNoun: 'leg',
    tempo: { minReturnMs: 800, weight: 0.1 },
    checks: [{ key: 'slouch', weight: 0.15, ratio: 0.4, fn: (p, s) => trunk(p, s) > 25 }],
  },

  // ===================== NECK & SHOULDER =====================
  {
    id: 'neck-tilt', conditions: ['neck'], source: DRAFT,
    title: { en: 'Neck side stretch', hi: 'गर्दन बगल में झुकाना' },
    purpose: 'Eases neck stiffness from desk work.',
    steps: ['Sit tall, shoulders relaxed.', 'Slowly tilt your ear toward your shoulder, without lifting the shoulder.', 'Hold 10 seconds.', 'Come back to centre and switch sides.'],
    tier: 'tracked', mode: 'rep', view: 'front', position: 'seated', space: 'small',
    setup: 'Sit facing the phone, about 1 m away, phone at face height. Head and shoulders in view.',
    dosage: { sets: 1, reps: 3, holdS: 10, restS: 10, perSide: true },
    sides: 'both', required: ['ear', 'shoulder'],
    metric: (p, s) => sgn(s) * lineTilt(p.pt('ear', 'L'), p.pt('ear', 'R')),
    start: 4, target: 32, activeAt: 0.35, restAt: 0.2, countAt: 0.55, holdS: 10,
    label: 'Neck tilt', fmt: v => `${r0(Math.max(0, v))}°`, targetText: 'Tilt ≈ 32°, hold 10 s', focus: 'ear',
    checks: [{ key: 'shoulder_hike', weight: 0.3, ratio: 0.3, fn: p => Math.abs(lineTilt(p.pt('shoulder', 'L'), p.pt('shoulder', 'R'))) > 8 }],
  },
  {
    id: 'shoulder-flexion', conditions: ['neck', 'mobility'], source: DRAFT,
    title: { en: 'Shoulder raise (forward)', hi: 'हाथ आगे से ऊपर उठाना' },
    purpose: 'Restores overhead shoulder movement.',
    steps: ['Stand tall, arms by your sides, thumbs forward.', 'Keeping the elbow straight, raise your arm forward and up as high as is comfortable.',
      'Pause, then lower slowly.'],
    tier: 'tracked', mode: 'rep', view: 'side', position: 'standing', space: 'small',
    setup: 'Stand side-on to the phone, about 2 m away, phone at chest height.',
    dosage: { sets: 2, reps: 10, restS: 30 },
    sides: 'auto', required: ['shoulder', 'elbow', 'wrist', 'hip'],
    metric: (p, s) => arm(p, s), start: 25, target: 160, activeAt: 0.3, restAt: 0.15, countAt: 0.5,
    label: 'Arm raise', fmt: v => `${r0(v)}°`, targetText: 'Arm ≈ 160°', focus: 'shoulder',
    tempo: { minReturnMs: 900, weight: 0.1 },
    checks: [
      { key: 'elbow_bent', weight: 0.2, ratio: 0.3, fn: (p, s) => elbow(p, s) < 145 },
      { key: 'lean_back', weight: 0.2, ratio: 0.3, fn: (p, s) => trunk(p, s) > 12 },
    ],
  },
  {
    id: 'shoulder-abduction', conditions: ['neck'], source: DRAFT,
    title: { en: 'Shoulder raise (sideways)', hi: 'हाथ बगल से ऊपर उठाना' },
    purpose: 'Improves side shoulder movement and strength.',
    steps: ['Stand facing the phone, arms by your sides.', 'Raise both arms out to the side and up, elbows straight.', 'Pause at the top, lower slowly.'],
    tier: 'tracked', mode: 'rep', view: 'front', position: 'standing', space: 'small',
    setup: 'Face the phone, about 2.5 m away, phone at chest height. Arms fully in view.',
    dosage: { sets: 2, reps: 10, restS: 30 },
    sides: 'both', countMode: 'together', required: ['shoulder', 'elbow', 'wrist', 'hip'],
    metric: (p, s) => arm(p, s), start: 25, target: 150, activeAt: 0.3, restAt: 0.15, countAt: 0.5,
    label: 'Arm raise', fmt: v => `${r0(v)}°`, targetText: 'Both arms ≈ 150°', focus: 'shoulder',
    tempo: { minReturnMs: 900, weight: 0.1 },
    checks: [
      { key: 'elbow_bent', weight: 0.15, ratio: 0.3, fn: (p, s) => elbow(p, s) < 145 },
      { key: 'side_lean', weight: 0.2, ratio: 0.3, fn: p => Math.abs(torsoSigned(p)) > 10 },
      { key: 'uneven_arms', weight: 0.15, ratio: 0.35, fn: p => Math.abs(arm(p, 'L') - arm(p, 'R')) > 25 },
    ],
  },
  ...guided('chin-tuck', 'Chin tuck', 'ठुड्डी अंदर', 'Corrects forward head posture from phone and laptop use.',
    ['Sit tall, looking straight ahead.', 'Gently draw your chin straight back, making a "double chin".', 'Hold 5 seconds, relax.', 'Repeat 10 times.'],
    { sets: 1, reps: 10 }, [{ en: 'Draw your chin straight back. Hold', hi: 'ठुड्डी सीधे पीछे करें। रोकें', s: 5 }, { en: 'Relax', hi: 'आराम', s: 3 }],
    ['neck'], DRAFT, 'Head-position tracking planned for a later phase'),

  // ===================== GENERAL MOBILITY =====================
  {
    id: 'forward-bend', conditions: ['mobility'], source: DRAFT,
    title: { en: 'Standing forward bend', hi: 'खड़े होकर आगे झुकना' },
    purpose: 'Stretches the back of the legs and lower back. Measures how far you can reach.',
    steps: ['Stand tall, feet hip-width apart, knees soft.', 'Slowly bend forward from the hips, letting your hands slide down your legs.',
      'Go only as far as is comfortable. Hold 5 seconds.', 'Roll back up slowly.'],
    tier: 'tracked', mode: 'rep', view: 'side', position: 'standing', space: 'small',
    setup: 'Stand side-on to the phone, about 2.5 m away, phone at waist height. Head to feet in view.',
    dosage: { sets: 1, reps: 5, holdS: 5, restS: 20 },
    sides: 'auto', required: ['shoulder', 'hip', 'knee', 'ankle', 'wrist'],
    metric: (p, s) => (p.pt('wrist', s).y - p.pt('hip', s).y) / Math.max(1e-3, p.pt('ankle', s).y - p.pt('hip', s).y),
    start: 0.35, target: 0.95, activeAt: 0.3, restAt: 0.12, countAt: 0.45, holdS: 5,
    label: 'Reach', fmt: v => (v < 0.45 ? 'Thigh' : v < 0.6 ? 'Knee' : v < 0.8 ? 'Shin' : v < 0.95 ? 'Ankle' : 'Floor'),
    targetText: 'Reach toward the ankles, hold 5 s', focus: 'wrist', depthLabel: 'Stretch',
    readout: (p, s) => `Trunk ${r0(trunk(p, s))}° from upright`,
    tempo: { minReturnMs: 1000, weight: 0.1 },
    checks: [{ key: 'knees_bent', weight: 0.1, ratio: 0.4, fn: (p, s) => knee(p, s) < 150 }],
  },
  {
    id: 'hip-abduction', conditions: ['mobility', 'knee'], source: DRAFT,
    title: { en: 'Standing side leg raise', hi: 'खड़े होकर पैर बगल में उठाना' },
    purpose: 'Strengthens the side hip muscles that steady the knee and pelvis.',
    steps: ['Stand tall facing the phone, hold a chair for balance if needed.', 'Lift one leg out to the side, toes pointing forward.',
      'Hold 2 seconds, lower slowly. Keep your body upright.'],
    tier: 'tracked', mode: 'rep', view: 'front', position: 'standing', space: 'small',
    setup: 'Face the phone, about 2.5 m away, phone at waist height. Feet in view.',
    dosage: { sets: 2, reps: 10, holdS: 2, restS: 30, perSide: true },
    sides: 'both', required: ['shoulder', 'hip', 'knee', 'ankle'],
    metric: (p, s) => sgn(s) * signedFromDown(p.pt('hip', s), p.pt('ankle', s)),
    start: 4, target: 30, activeAt: 0.35, restAt: 0.2, countAt: 0.55, holdS: 2,
    label: 'Leg out', fmt: v => `${r0(Math.max(0, v))}°`, targetText: 'Leg ≈ 30° out, hold 2 s', focus: 'hip', sideNoun: 'leg',
    checks: [{ key: 'side_lean', weight: 0.25, ratio: 0.3, fn: p => Math.abs(torsoSigned(p)) > 10 }],
  },
];

/** Guided-only exercise (no camera): voiced phase timer. */
function guided(id, en, hi, purpose, steps, dosage, phases, conditions = ['foot'], source = FOOT_SRC,
  why = "The camera can't see individual toe movement yet") {
  return [{ id, title: { en, hi }, purpose, steps, conditions, source, tier: 'guided', mode: 'guided',
    position: 'seated', space: 'small', dosage: { ...dosage, restS: 20, perSide: conditions.includes('foot') }, phases, why,
    sideNoun: conditions.includes('foot') ? 'foot' : 'side' }];
}

/** Condition protocols ("today's plan" templates). Order = order performed. */
export const PLANS = [
  { id: 'heel-pain', condition: 'foot', en: 'Heel pain / plantar fasciitis', source: FOOT_SRC,
    items: ['foot-roller', 'plantar-stretch', 'toe-yoga', 'short-foot', 'heel-raise', 'balance'] },
  { id: 'foot-core', condition: 'foot', en: 'Foot core strength', source: FOOT_SRC,
    items: ['toe-splay', 'toe-squish', 'towel-scrunch', 'toe-curl-band', 'heel-raise', 'balance'] },
  { id: 'low-back', condition: 'back', en: 'Lower back pain', source: DRAFT,
    items: ['knee-to-chest', 'pelvic-tilt', 'cat-camel', 'bridge', 'bird-dog', 'side-bend'] },
  { id: 'knee-pain', condition: 'knee', en: 'Knee pain', source: DRAFT,
    items: ['knee-extension', 'slr', 'bridge', 'sit-to-stand', 'squat', 'heel-raise'] },
  { id: 'desk-neck', condition: 'neck', en: 'Desk neck & shoulder', source: DRAFT,
    items: ['chin-tuck', 'neck-tilt', 'shoulder-flexion', 'shoulder-abduction'] },
  { id: 'mobility', condition: 'mobility', en: 'Daily mobility', source: DRAFT,
    items: ['forward-bend', 'side-bend', 'hip-abduction', 'squat', 'shoulder-flexion', 'balance'] },
];

export const byId = id => EXERCISES.find(e => e.id === id);
