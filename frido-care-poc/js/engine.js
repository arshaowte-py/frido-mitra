// Frido Care · exercise tracking engine
// Pure module: no DOM, no camera. Landmark frames in → rep / hold / cue events out.
// Can be unit-tested with recorded landmark JSON (see tests/engine.test.mjs).

// BlazePose (MediaPipe Pose Landmarker) indices. "l_" / "r_" = the person's own left / right.
export const IDX = {
  nose: 0, l_ear: 7, r_ear: 8,
  l_shoulder: 11, r_shoulder: 12, l_elbow: 13, r_elbow: 14, l_wrist: 15, r_wrist: 16,
  l_pinky: 17, r_pinky: 18, l_index: 19, r_index: 20,
  l_hip: 23, r_hip: 24, l_knee: 25, r_knee: 26, l_ankle: 27, r_ankle: 28,
  l_heel: 29, r_heel: 30, l_foot: 31, r_foot: 32,
};

export const BONES = [
  ['l_shoulder', 'r_shoulder'], ['l_hip', 'r_hip'],
  ['l_shoulder', 'l_elbow'], ['l_elbow', 'l_wrist'], ['r_shoulder', 'r_elbow'], ['r_elbow', 'r_wrist'],
  ['l_shoulder', 'l_hip'], ['r_shoulder', 'r_hip'],
  ['l_hip', 'l_knee'], ['l_knee', 'l_ankle'], ['r_hip', 'r_knee'], ['r_knee', 'r_ankle'],
  ['l_ankle', 'l_heel'], ['l_heel', 'l_foot'], ['l_ankle', 'l_foot'],
  ['r_ankle', 'r_heel'], ['r_heel', 'r_foot'], ['r_ankle', 'r_foot'],
  ['l_ear', 'nose'], ['r_ear', 'nose'],
];

export const other = side => (side === 'L' ? 'R' : 'L');

// ---------- geometry (x already scaled by aspect so both axes share units; y points down) ----------
export const deg = r => (r * 180) / Math.PI;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });

/** Interior angle at b, in degrees (0–180). */
export function angle(a, b, c) {
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  return Math.abs(deg(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)));
}

/** Unsigned angle of the segment a→b away from straight up (0 = b directly above a, 90 = horizontal). */
export function tiltFromVertical(a, b) {
  return Math.abs(deg(Math.atan2(b.x - a.x, a.y - b.y)));
}

/** Signed angle of a→b from straight up; positive when b is to the image-right of a. */
export function signedTilt(a, b) {
  return deg(Math.atan2(b.x - a.x, a.y - b.y));
}

/** Signed angle of a→b from straight down; positive when b is to the image-right of a. */
export function signedFromDown(a, b) {
  return deg(Math.atan2(b.x - a.x, b.y - a.y));
}

/** Accessor over one smoothed frame of landmarks. */
export function makePose(lm) {
  return {
    lm,
    pt(name, side) {
      const key = side ? (side === 'L' ? 'l_' : 'r_') + name : name;
      return lm[IDX[key]];
    },
  };
}

// ---------- smoothing ----------
function alpha(cutoff, dtS) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dtS);
}

export class OneEuro {
  constructor(minCutoff = 1.7, beta = 3, dCutoff = 1) {
    Object.assign(this, { minCutoff, beta, dCutoff, xPrev: null, dxPrev: 0, tPrev: null });
  }
  filter(x, tMs) {
    if (this.tPrev == null) { this.xPrev = x; this.tPrev = tMs; return x; }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
    const dx = (x - this.xPrev) / dt;
    const dxh = alpha(this.dCutoff, dt) * dx + (1 - alpha(this.dCutoff, dt)) * this.dxPrev;
    const a = alpha(this.minCutoff + this.beta * Math.abs(dxh), dt);
    const xh = a * x + (1 - a) * this.xPrev;
    this.xPrev = xh; this.dxPrev = dxh; this.tPrev = tMs;
    return xh;
  }
}

/** One Euro filter per landmark; carries the last good value for a short time when a joint drops out. */
export class PoseSmoother {
  constructor(cfg) { this.cfg = cfg; this.fx = []; this.fy = []; this.last = []; }
  reset() { this.fx = []; this.fy = []; this.last = []; }
  apply(raw, tMs, aspect) {
    const { minVisibility, carryMs, oneEuro } = this.cfg;
    return raw.map((l, i) => {
      const v = l.visibility ?? 1;
      const x = l.x * aspect, y = l.y;
      if (!this.fx[i]) {
        this.fx[i] = new OneEuro(oneEuro.minCutoff, oneEuro.beta);
        this.fy[i] = new OneEuro(oneEuro.minCutoff, oneEuro.beta);
      }
      if (v < minVisibility) {
        const lg = this.last[i];
        if (lg && tMs - lg.t <= carryMs) return { ...lg.p, v, stale: true };
      }
      const p = { x: this.fx[i].filter(x, tMs), y: this.fy[i].filter(y, tMs), v };
      if (v >= minVisibility) this.last[i] = { p, t: tMs };
      return p;
    });
  }
}

// ---------- rep tracker (reps, holds and stretches all use this) ----------
/**
 * Progress = (value - start) / (target - start). 0 = resting position, 1 = prescribed target.
 * A rep starts when progress passes `activeAt`, and is counted when the person returns below `restAt`
 * after reaching at least `countAt`. Hold time accumulates while progress stays near the rep's peak.
 */
export class RepTracker {
  constructor(spec, side, cfg) {
    this.spec = spec; this.side = side; this.cfg = cfg;
    this.range = { start: spec.start, target: spec.target };
    this.reset();
  }
  reset() {
    this.state = 'rest'; this.count = 0; this.reps = []; this.partials = 0;
    this.above = 0; this.below = 0; this.rep = null; this.pr = 0; this.value = null; this.tPrev = null;
  }
  setRange(start, target) { this.range = { start, target }; }
  progress(v) { const { start, target } = this.range; return (v - start) / (target - start); }
  get holdMs() { return this.rep ? this.rep.holdCur : 0; }

  /** @param faultsNow keys of form checks failing on this frame (only counted while active) */
  update(v, tMs, faultsNow = []) {
    const sp = this.spec, cf = this.cfg.confirmFrames, ev = [];
    const dt = this.tPrev == null ? 0 : Math.min(200, tMs - this.tPrev);
    this.tPrev = tMs;
    if (v == null || Number.isNaN(v)) return ev;
    const pr = this.progress(v);
    this.pr = pr; this.value = v;
    const activeAt = sp.activeAt ?? 0.3, restAt = sp.restAt ?? 0.15, countAt = sp.countAt ?? 0.5;

    if (this.state === 'rest') {
      if (pr >= activeAt) {
        if (++this.above >= cf) {
          this.state = 'active'; this.below = 0;
          this.rep = { tStart: tMs, peak: pr, peakV: v, tPeak: tMs, tNearPeak: tMs, holdCur: 0, holdBest: 0,
            belowSince: null, frames: 0, fault: {}, holdDone: false };
          ev.push({ type: 'start', side: this.side });
        }
      } else this.above = 0;
      return ev;
    }

    const r = this.rep;
    r.frames++;
    if (pr > r.peak + 0.01) { r.peak = pr; r.peakV = v; r.tPeak = tMs; }
    if (pr >= 0.9 * r.peak) r.tNearPeak = tMs;
    for (const k of faultsNow) r.fault[k] = (r.fault[k] || 0) + 1;

    const holdOn = pr >= Math.max(countAt, 0.85 * Math.min(r.peak, 1));
    if (holdOn) { r.holdCur += dt; r.belowSince = null; }
    else {
      if (r.belowSince == null) r.belowSince = tMs;
      if (tMs - r.belowSince > this.cfg.holdDipMs) r.holdCur = 0;
    }
    r.holdBest = Math.max(r.holdBest, r.holdCur);
    if (sp.holdS && !r.holdDone && r.holdBest >= sp.holdS * 1000) {
      r.holdDone = true;
      ev.push({ type: 'holdDone', side: this.side });
    }

    if (pr <= restAt) {
      if (++this.below >= cf) ev.push(...this.finish(tMs));
    } else this.below = 0;
    return ev;
  }

  finish(tMs) {
    const sp = this.spec, r = this.rep, cfg = this.cfg;
    this.state = 'rest'; this.above = 0; this.below = 0; this.rep = null;
    const countAt = sp.countAt ?? 0.5;
    if (r.peak < countAt) { this.partials++; return [{ type: 'partial', side: this.side, peak: r.peak }]; }

    let q = 100;
    const failed = [];
    const rom = Math.min(1, r.peak);
    q -= (1 - rom) * 100 * cfg.romWeight;
    if (rom < (sp.goodRom ?? 0.9)) failed.push('rom_short');
    if (sp.holdS) {
      const hs = Math.min(1, r.holdBest / (sp.holdS * 1000));
      if (hs < 0.9) { q -= (1 - hs) * 100 * cfg.holdWeight; failed.push('short_hold'); }
    }
    for (const c of sp.checks || []) {
      const ratio = (r.fault[c.key] || 0) / Math.max(1, r.frames);
      if (ratio > (c.ratio ?? 0.25)) { q -= c.weight * 100; failed.push(c.key); }
    }
    const downMs = r.tPeak - r.tStart, returnMs = tMs - r.tNearPeak;
    if (sp.tempo?.minDownMs && downMs < sp.tempo.minDownMs) { q -= (sp.tempo.weight ?? 0.1) * 100; failed.push('too_fast'); }
    if (sp.tempo?.minReturnMs && returnMs < sp.tempo.minReturnMs) { q -= (sp.tempo.weight ?? 0.1) * 100; failed.push('too_fast_return'); }

    q = Math.max(0, Math.min(100, Math.round(q)));
    this.count++;
    const rec = { side: this.side, n: this.count, quality: q, peak: r.peak, peakValue: r.peakV,
      holdMs: Math.round(r.holdBest), durationMs: tMs - r.tStart, downMs, returnMs, failed };
    this.reps.push(rec);
    return [{ type: 'rep', ...rec }];
  }
}

// ---------- stroke tracker (foot roller: back-and-forth strokes over a timed duration) ----------
export class StrokeTracker {
  constructor(spec, side, cfg) { this.spec = spec; this.side = side; this.cfg = cfg; this.reset(); }
  reset() {
    this.count = 0; this.reps = []; this.ext = null; this.dir = 1; this.lastStroke = null; this.periods = [];
    this.activeMs = 0; this.tPrev = null; this.holdDoneFor = 0; this.value = null; this.pr = 0;
  }
  get holdMs() { return this.activeMs - this.holdDoneFor; }
  update(v, tMs) {
    const sp = this.spec, ev = [];
    const dt = this.tPrev == null ? 0 : Math.min(200, tMs - this.tPrev);
    this.tPrev = tMs;
    if (v == null || Number.isNaN(v)) return ev;
    this.value = v;
    if (this.ext == null) this.ext = v;
    let stroke = false;
    if (this.dir > 0) { if (v > this.ext) this.ext = v; else if (this.ext - v > sp.amplitude) { stroke = true; this.dir = -1; this.ext = v; } }
    else { if (v < this.ext) this.ext = v; else if (v - this.ext > sp.amplitude) { stroke = true; this.dir = 1; this.ext = v; } }
    if (stroke) {
      if (this.lastStroke != null) this.periods.push(tMs - this.lastStroke);
      this.lastStroke = tMs; this.strokes = (this.strokes || 0) + 1;
      ev.push({ type: 'stroke', side: this.side, strokes: this.strokes });
      const fast = this.periods.length >= 3 && avg(this.periods.slice(-3)) < sp.minStrokeMs;
      if (fast) ev.push({ type: 'fault', side: this.side, key: 'too_fast' });
    }
    const moving = this.lastStroke != null && tMs - this.lastStroke < 2500;
    if (moving) this.activeMs += dt;
    this.pr = Math.min(1, this.holdMs / (sp.holdS * 1000));
    if (this.holdMs >= sp.holdS * 1000) {
      const okShare = this.periods.length ? this.periods.filter(p => p >= sp.minStrokeMs).length / this.periods.length : 1;
      const q = Math.round(100 * (0.4 + 0.6 * okShare));
      this.count++; this.holdDoneFor = this.activeMs;
      const rec = { side: this.side, n: this.count, quality: q, strokes: this.strokes || 0, holdMs: sp.holdS * 1000,
        failed: okShare < 0.8 ? ['too_fast'] : [], peak: 1 };
      this.reps.push(rec); this.periods = []; this.strokes = 0;
      ev.push({ type: 'rep', ...rec });
    }
    return ev;
  }
}

// ---------- balance tracker (timed hold, scored on steadiness) ----------
export class BalanceTracker {
  constructor(spec, side, cfg) { this.spec = spec; this.side = side; this.cfg = cfg; this.reset(); }
  reset() { this.count = 0; this.reps = []; this.hold = 0; this.win = []; this.stabSum = 0; this.stabN = 0; this.tPrev = null; this.stability = null; this.pr = 0; this.value = null; }
  get holdMs() { return this.hold; }
  /** @param upright whether the person is standing in position; x = hip-centre x; scale = shoulder width */
  update(upright, x, scale, tMs) {
    const sp = this.spec, ev = [];
    const dt = this.tPrev == null ? 0 : Math.min(200, tMs - this.tPrev);
    this.tPrev = tMs;
    if (!upright || x == null) { this.value = null; return ev; }
    this.hold += dt;
    this.win.push({ t: tMs, x });
    while (this.win.length && tMs - this.win[0].t > 2000) this.win.shift();
    if (this.win.length > 5) {
      const xs = this.win.map(w => w.x), m = avg(xs);
      const sd = Math.sqrt(avg(xs.map(v => (v - m) ** 2))) / Math.max(1e-3, scale);
      this.stability = Math.max(0, Math.min(100, Math.round(100 - sd * this.cfg.swayGain)));
      this.stabSum += this.stability; this.stabN++;
    }
    this.value = this.stability;
    this.pr = Math.min(1, this.hold / (sp.holdS * 1000));
    if (this.hold >= sp.holdS * 1000) {
      const q = this.stabN ? Math.round(this.stabSum / this.stabN) : 80;
      this.count++;
      const rec = { side: this.side, n: this.count, quality: q, holdMs: this.hold, peak: 1, failed: q < 70 ? ['sway'] : [] };
      this.reps.push(rec);
      this.hold = 0; this.stabSum = 0; this.stabN = 0;
      ev.push({ type: 'rep', ...rec });
    }
    return ev;
  }
}

export const avg = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

/** Fraction of `names` visible on `side` (null side = un-sided names or both sides). */
export function visibilityScore(p, names, side, minVis) {
  let ok = 0, n = 0;
  for (const nm of names) {
    const sides = side ? [side] : ['L', 'R'];
    for (const s of sides) {
      const pt = IDX[nm] != null ? p.lm[IDX[nm]] : p.pt(nm, s);
      n++; if (pt && pt.v >= minVis && !pt.stale) ok++;
      if (IDX[nm] != null) break;
    }
  }
  return n ? ok / n : 0;
}
