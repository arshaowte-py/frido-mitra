// Synthetic landmark streams for tests and UI screenshots (no camera).
import { IDX } from '../js/engine.js';

export const ASPECT = 16 / 9, FPS = 30;
const rad = d => (d * Math.PI) / 180;

/** Side-view figure facing image-right. depth 0..1 squat; lean adds trunk lean; heel lifts heels (units of shin). */
export function sideFigure({ depth = 0, lean = 0, heel = 0, armUp = 0 }) {
  const L1 = 0.2, L2 = 0.21, L3 = 0.26; // shin, thigh, torso (normalised height units)
  const ank = { x: 0.85, y: 0.88 - heel * L1 };
  const ts = 5 + 30 * depth, tt = 4 + 82 * depth, tk = 5 + 30 * depth + lean;
  const knee = { x: ank.x + L1 * Math.sin(rad(ts)), y: ank.y - L1 * Math.cos(rad(ts)) };
  const hip = { x: knee.x - L2 * Math.sin(rad(tt)), y: knee.y - L2 * Math.cos(rad(tt)) };
  const sh = { x: hip.x + L3 * Math.sin(rad(tk)), y: hip.y - L3 * Math.cos(rad(tk)) };
  const ae = 15 + armUp * 150; // arm elevation from hanging
  const elb = { x: sh.x + 0.13 * Math.sin(rad(ae)), y: sh.y + 0.13 * Math.cos(rad(ae)) };
  const wr = { x: sh.x + 0.26 * Math.sin(rad(ae)), y: sh.y + 0.26 * Math.cos(rad(ae)) };
  const pts = { shoulder: sh, elbow: elb, wrist: wr, hip, knee, ankle: ank,
    heel: { x: ank.x - 0.03, y: 0.9 - heel * L1 * 1.4 }, foot: { x: ank.x + 0.07, y: 0.905 } };
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.2 }));
  for (const side of ['l', 'r']) for (const [n, p] of Object.entries(pts)) lm[IDX[`${side}_${n}`]] = { x: p.x / ASPECT + (side === 'r' ? 0.002 : 0), y: p.y, z: 0, visibility: 0.95 };
  lm[IDX.nose] = { x: (sh.x + 0.05) / ASPECT, y: sh.y - 0.1, visibility: 0.95 };
  lm[IDX.l_ear] = lm[IDX.r_ear] = { x: sh.x / ASPECT, y: sh.y - 0.1, visibility: 0.9 };
  return lm;
}

/** Front-view figure. bend: degrees of side bend to the person's left (+) / right (−); sway: hip x offset. */
export function frontFigure({ bend = 0, sway = 0 }) {
  const cx = 0.5 * ASPECT + sway, hipY = 0.55, sw = 0.2;
  const hipMid = { x: cx, y: hipY };
  const b = rad(bend);
  const shMid = { x: hipMid.x + 0.28 * Math.sin(b), y: hipMid.y - 0.28 * Math.cos(b) };
  const pts = {
    l_shoulder: { x: shMid.x + sw / 2, y: shMid.y }, r_shoulder: { x: shMid.x - sw / 2, y: shMid.y },
    l_hip: { x: cx + 0.07, y: hipY }, r_hip: { x: cx - 0.07, y: hipY },
    l_knee: { x: cx + 0.07, y: hipY + 0.17 }, r_knee: { x: cx - 0.07, y: hipY + 0.17 },
    l_ankle: { x: cx + 0.07, y: hipY + 0.34 }, r_ankle: { x: cx - 0.07, y: hipY + 0.34 },
    l_elbow: { x: shMid.x + sw / 2 + 0.02, y: shMid.y + 0.13 }, r_elbow: { x: shMid.x - sw / 2 - 0.02, y: shMid.y + 0.13 },
    l_wrist: { x: shMid.x + sw / 2 + 0.03, y: shMid.y + 0.25 }, r_wrist: { x: shMid.x - sw / 2 - 0.03, y: shMid.y + 0.25 },
    l_ear: { x: shMid.x + 0.04, y: shMid.y - 0.1 }, r_ear: { x: shMid.x - 0.04, y: shMid.y - 0.1 }, nose: { x: shMid.x, y: shMid.y - 0.09 },
  };
  pts.l_heel = { ...pts.l_ankle, y: pts.l_ankle.y + 0.02 }; pts.r_heel = { ...pts.r_ankle, y: pts.r_ankle.y + 0.02 };
  pts.l_foot = { ...pts.l_ankle, y: pts.l_ankle.y + 0.03 }; pts.r_foot = { ...pts.r_ankle, y: pts.r_ankle.y + 0.03 };
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.2 }));
  for (const [n, p] of Object.entries(pts)) lm[IDX[n]] = { x: p.x / ASPECT, y: p.y, visibility: 0.95 };
  return lm;
}

// a rep cycle: stand 1 s, go down over `down` s, hold `hold` s, up over 1.2 s
export function cycle(tSec, { down = 1.4, hold = 0.4, up = 1.2, rest = 1 } = {}) {
  const T = rest + down + hold + up, u = tSec % T;
  if (u < rest) return 0;
  if (u < rest + down) return (u - rest) / down;
  if (u < rest + down + hold) return 1;
  if (u < T) return 1 - (u - rest - down - hold) / up;
  return 0;
}


// ---------- guided-class figures (realistic proportions, aspect units, y down) ----------
const toLm = pts => {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.2 }));
  for (const [n, p] of Object.entries(pts)) lm[IDX[n]] = { x: p.x / ASPECT, y: p.y, visibility: 0.95 };
  return lm;
};

/** Seated, facing the camera. cross: 'R'|'L' rests that ankle on the other knee; hand: holds that foot's toes; lean: shoulders shifted sideways. */
export function seatedFront({ cross = null, hand = false, lean = 0 } = {}) {
  const cx = 0.5 * ASPECT;
  const shY = 0.30, hipY = 0.55, sw = 0.2;
  const pts = {
    l_shoulder: { x: cx + sw / 2 + lean, y: shY }, r_shoulder: { x: cx - sw / 2 + lean, y: shY },
    l_elbow: { x: cx + 0.13 + lean, y: 0.44 }, r_elbow: { x: cx - 0.13 + lean, y: 0.44 },
    l_wrist: { x: cx + 0.08, y: 0.55 }, r_wrist: { x: cx - 0.08, y: 0.55 },
    l_index: { x: cx + 0.08, y: 0.59 }, r_index: { x: cx - 0.08, y: 0.59 },
    l_pinky: { x: cx + 0.10, y: 0.58 }, r_pinky: { x: cx - 0.10, y: 0.58 },
    l_hip: { x: cx + 0.07, y: hipY }, r_hip: { x: cx - 0.07, y: hipY },
    l_knee: { x: cx + 0.09, y: 0.60 }, r_knee: { x: cx - 0.09, y: 0.60 },
    l_ankle: { x: cx + 0.09, y: 0.85 }, r_ankle: { x: cx - 0.09, y: 0.85 },
    l_heel: { x: cx + 0.09, y: 0.87 }, r_heel: { x: cx - 0.09, y: 0.87 },
    l_foot: { x: cx + 0.10, y: 0.89 }, r_foot: { x: cx - 0.10, y: 0.89 },
    l_ear: { x: cx + 0.04 + lean, y: 0.2 }, r_ear: { x: cx - 0.04 + lean, y: 0.2 }, nose: { x: cx + lean, y: 0.21 },
  };
  if (cross) {
    const s = cross === 'R' ? 'r' : 'l', o = cross === 'R' ? 'l' : 'r', dir = cross === 'R' ? 1 : -1;
    const k = pts[`${o}_knee`];
    pts[`${s}_knee`] = { x: cx - dir * 0.18, y: 0.55 };
    pts[`${s}_ankle`] = { x: k.x - dir * 0.02, y: k.y - 0.03 };
    pts[`${s}_heel`] = { x: k.x - dir * 0.04, y: k.y - 0.02 };
    pts[`${s}_foot`] = { x: k.x + dir * 0.12, y: k.y - 0.07 };   // toes stick out past the knee
    if (hand) {
      const f = pts[`${s}_foot`];
      pts[`${s}_index`] = { x: f.x + dir * 0.01, y: f.y - 0.01 };
      pts[`${s}_pinky`] = { x: f.x - dir * 0.01, y: f.y + 0.01 };
      pts[`${s}_wrist`] = { x: f.x - dir * 0.05, y: f.y + 0.06 };
    }
  }
  return toLm(pts);
}

/** Standing, facing the camera. lift: 'L'|'R' lifts that foot; sway shifts the hips. */
export function standFront({ lift = null, sway = 0 } = {}) {
  const cx = 0.5 * ASPECT + sway;
  const pts = {
    l_shoulder: { x: cx + 0.1, y: 0.22 }, r_shoulder: { x: cx - 0.1, y: 0.22 },
    l_elbow: { x: cx + 0.12, y: 0.36 }, r_elbow: { x: cx - 0.12, y: 0.36 },
    l_wrist: { x: cx + 0.13, y: 0.48 }, r_wrist: { x: cx - 0.13, y: 0.48 },
    l_hip: { x: cx + 0.07, y: 0.47 }, r_hip: { x: cx - 0.07, y: 0.47 },
    l_knee: { x: cx + 0.07, y: 0.69 }, r_knee: { x: cx - 0.07, y: 0.69 },
    l_ankle: { x: cx + 0.07, y: 0.90 }, r_ankle: { x: cx - 0.07, y: 0.90 },
    l_heel: { x: cx + 0.07, y: 0.92 }, r_heel: { x: cx - 0.07, y: 0.92 },
    l_foot: { x: cx + 0.08, y: 0.93 }, r_foot: { x: cx - 0.08, y: 0.93 },
    l_ear: { x: cx + 0.04, y: 0.12 }, r_ear: { x: cx - 0.04, y: 0.12 }, nose: { x: cx, y: 0.13 },
  };
  if (lift) {
    const s = lift === 'L' ? 'l' : 'r';
    for (const j of ['ankle', 'heel', 'foot']) pts[`${s}_${j}`] = { ...pts[`${s}_${j}`], y: pts[`${s}_${j}`].y - 0.06 };
    pts[`${s}_knee`] = { ...pts[`${s}_knee`], y: pts[`${s}_knee`].y - 0.03 };
  }
  return toLm(pts);
}
