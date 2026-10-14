// Frido Care · reusable camera checks for guided lessons.
// Each check answers "is the person in this position right now?" from one smoothed pose.
// Lesson scripts refer to them by name (optionally with a side), e.g. 'footOnKnee:R'.
// All thresholds are placeholders for the physio team to tune.
import { angle, dist, mid } from './engine.js';

const VIS = 0.45;
const seen = (...pts) => pts.every(p => p && p.v >= VIS);
const other = s => (s === 'L' ? 'R' : 'L');
const shoulderWidth = p => dist(p.pt('shoulder', 'L'), p.pt('shoulder', 'R'));
const torso = p => dist(mid(p.pt('shoulder', 'L'), p.pt('shoulder', 'R')), mid(p.pt('hip', 'L'), p.pt('hip', 'R')));
const knee = (p, s) => angle(p.pt('hip', s), p.pt('knee', s), p.pt('ankle', s));
const visibleSides = (p, names) => ['L', 'R'].filter(s => seen(...names.map(n => p.pt(n, s))));

/** Vertical drop from hip to knee relative to torso length: ~0.9 standing, ~0.3 seated (front or side view). */
function thighDrop(p) {
  const sides = visibleSides(p, ['hip', 'knee']);
  if (!sides.length || !seen(p.pt('shoulder', 'L'), p.pt('shoulder', 'R'))) return null;
  const t = torso(p);
  return sides.reduce((a, s) => a + (p.pt('knee', s).y - p.pt('hip', s).y) / t, 0) / sides.length;
}

export const CHECKS = {
  /** Someone with shoulders and hips in view. */
  inView: p => seen(p.pt('shoulder', 'L'), p.pt('shoulder', 'R'), p.pt('hip', 'L'), p.pt('hip', 'R')),

  seated: p => { const d = thighDrop(p); return d != null && d < 0.55; },

  standing: p => {
    const d = thighDrop(p);
    if (d == null || d < 0.65) return false;
    const sides = visibleSides(p, ['hip', 'knee', 'ankle']);
    return sides.length > 0 && sides.some(s => knee(p, s) > 145);
  },

  /** Body turned side-on to the camera: shoulders look narrow compared with the torso. */
  sideOn: p => seen(p.pt('shoulder', 'L'), p.pt('shoulder', 'R')) && shoulderWidth(p) / torso(p) < 0.45,

  /** Facing the camera: shoulders look wide. */
  facing: p => seen(p.pt('shoulder', 'L'), p.pt('shoulder', 'R')) && shoulderWidth(p) / torso(p) > 0.55,

  /** The `side` ankle resting on the other knee (seated cross-legged stretch). */
  footOnKnee: (p, s) => {
    const a = p.pt('ankle', s), k = p.pt('knee', other(s));
    return seen(a, k) && dist(a, k) / shoulderWidth(p) < 0.6;
  },

  /** Either hand holding the `side` foot's toes: a fingertip near the toes (wrist as a fallback). */
  handAtFoot: (p, s) => {
    const toes = p.pt('foot', s), ankle = p.pt('ankle', s);
    const target = seen(toes) ? toes : ankle;
    if (!seen(target)) return false;
    const w = shoulderWidth(p);
    const tips = ['index', 'pinky'].flatMap(n => ['L', 'R'].map(h => p.pt(n, h))).filter(pt => seen(pt));
    if (tips.length) return tips.some(pt => dist(pt, target) / w < 0.4);
    return ['L', 'R'].some(h => seen(p.pt('wrist', h)) && dist(p.pt('wrist', h), target) / w < 0.55
      && (!seen(ankle) || dist(p.pt('wrist', h), target) < dist(p.pt('wrist', h), ankle)));
  },

  /** Sitting upright: shoulders roughly above hips (front or side). */
  sittingTall: p => {
    const sm = mid(p.pt('shoulder', 'L'), p.pt('shoulder', 'R')), hm = mid(p.pt('hip', 'L'), p.pt('hip', 'R'));
    return seen(sm, hm) && Math.abs(sm.x - hm.x) / torso(p) < 0.35;
  },

  /** The `side` foot lifted clear of the floor while standing on the other leg. */
  footUp: (p, s) => {
    const up = p.pt('ankle', s), down = p.pt('ankle', other(s));
    if (!seen(up, down)) return false;
    const shin = dist(p.pt('knee', other(s)), down) || 0.2;
    return (down.y - up.y) / shin > 0.12;
  },
};

/** Evaluate 'name' or 'name:SIDE'. Unknown names count as passed so a script typo never blocks a class. */
export function check(spec, p) {
  if (!p) return false;
  const [name, side] = spec.split(':');
  const fn = CHECKS[name];
  if (!fn) return true;
  try { return !!fn(p, side); } catch { return false; }
}

export const allPass = (specs, p) => specs.every(s => check(s, p));
