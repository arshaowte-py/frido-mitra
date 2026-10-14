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

