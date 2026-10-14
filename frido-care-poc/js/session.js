// Frido Care · one exercise session (sets × reps × sides). No DOM: the app feeds frames and renders state.
import { makePose, PoseSmoother, RepTracker, StrokeTracker, BalanceTracker, visibilityScore, mid, dist, angle, other } from './engine.js';
import { CUES, FAULTS } from './exercises.js';
import { CONFIG } from './config.js';

const now = () => performance.now();

export class Session {
  /**
   * @param spec exercise spec
   * @param io { say(cueKey|{en,hi}|number, priority), onChange() }
   * @param opts { guided: boolean }
   */
  constructor(spec, io, opts = {}) {
    this.spec = spec; this.io = io; this.cfg = CONFIG;
    this.guided = spec.mode === 'guided' || !!opts.guided;
    this.smoother = new PoseSmoother(CONFIG);
    this.set = 1; this.sets = spec.dosage.sets;
    this.repsTarget = spec.dosage.reps;
    this.history = [];           // all rep records across sets
    this.cues = [];              // displayed cue log
    this.lastCueAt = 0; this.lastCueByKey = {}; this.cleanStreak = 0;
    this.phase = this.guided ? 'ready' : 'setup';
    this.setup = { ok: false, since: null, items: {} };
    this.cal = {}; this.calBuf = { L: [], R: [] };
    this.autoSide = 'L';
    this.lostSince = null; this.paused = false;
    this.sideDoneSaid = {};
    this.startedAt = Date.now();
    this.makeTrackers();
  }

  get sideKeys() {
    const s = this.spec.sides;
    return s === 'both' ? ['L', 'R'] : s === 'none' ? ['C'] : ['A'];
  }

  makeTrackers() {
    const T = this.spec.mode === 'strokes' ? StrokeTracker : this.spec.mode === 'balance' ? BalanceTracker : RepTracker;
    this.trackers = {};
    for (const k of this.sideKeys) this.trackers[k] = new T(this.spec, k, this.cfg);
    if (this.spec.rangeFromCal && this.cal.A) {
      const r = this.spec.rangeFromCal(this.cal.A);
      this.trackers.A.setRange(r.start, r.target);
    }
  }

  // ---------------- counts ----------------
  countFor(k) { return this.trackers[k].count; }
  get perSide() { return this.spec.sides === 'both' && this.spec.countMode !== 'together'; }
  get displayCount() {
    if (this.spec.countMode === 'together') return Math.max(...['L', 'R'].map(k => this.countFor(k)));
    return null;
  }
  setComplete() {
    if (this.spec.countMode === 'together') return this.displayCount >= this.repsTarget;
    return this.sideKeys.every(k => this.countFor(k) >= this.repsTarget);
  }

  // ---------------- frames ----------------
  /** @param raw MediaPipe landmarks of the tracked person (or null), env {aspect, brightness, backlit, people} */
  frame(raw, env, t = now()) {
    if (this.guided || this.phase === 'done') return;
    if (!raw) { this.handleLost(t, 0); this.lastPose = null; this.setupCheck(null, env, t); return; }
    const lm = this.smoother.apply(raw, t, env.aspect);
    const p = makePose(lm);
    this.lastPose = p; this.env = env;

    if (this.phase === 'setup') return this.setupCheck(p, env, t);
    if (this.phase === 'calibrate') return this.calibrate(p, t);
    if (this.phase === 'countdown') { if (t >= this.countdownEnd) this.begin(); return; }
    if (this.phase === 'rest') { if (t >= this.restEnd) this.nextSet(); return; }
    if (this.phase !== 'active' || this.paused) return;

    const vis = this.trackVisibility(p);
    if (vis < this.cfg.lostVisibility) { this.handleLost(t, vis); return; }
    if (this.lostSince != null) { this.lostSince = null; this.lostSaid = false; }
    this.multi = env.people > 1;

    if (this.spec.sides === 'auto') this.pickSide(p);
    for (const k of this.sideKeys) this.step(k, p, t);
    this.io.onChange?.();
  }

  bestSide(p) {
    const vL = visibilityScore(p, this.spec.required, 'L', 0), vR = visibilityScore(p, this.spec.required, 'R', 0);
    const avgVis = s => this.spec.required.reduce((a, n) => a + (p.pt(n, s)?.v ?? 0), 0) / this.spec.required.length;
    return { L: vL + avgVis('L'), R: vR + avgVis('R') };
  }
  pickSide(p) {
    const b = this.bestSide(p), cur = this.autoSide, alt = other(cur);
    if (b[alt] > b[cur] + 0.25) this.autoSide = alt;
  }
  trackVisibility(p) {
    const r = this.spec.required, th = this.cfg.minVisibility;
    if (this.spec.view === 'side' || this.spec.sides === 'auto') return Math.max(visibilityScore(p, r, 'L', th), visibilityScore(p, r, 'R', th));
    return visibilityScore(p, r, null, th);
  }
  handleLost(t, vis) {
    if (this.phase !== 'active' || this.paused) return;
    if (this.lostSince == null) this.lostSince = t;
    if (t - this.lostSince > this.cfg.lostMs && !this.lostSaid) { this.lostSaid = true; this.say('lost', 'lost'); }
    this.io.onChange?.();
  }
  get isLost() { return this.lostSince != null && now() - this.lostSince > this.cfg.lostMs; }

  // ---------------- setup checks (brief §8) ----------------
  setupCheck(p, env, t) {
    const items = {};
    items.light = env.brightness == null ? 'wait' : env.brightness < this.cfg.light.dark ? 'dark' : env.backlit ? 'backlit' : 'ok';
    items.people = env.people > 1 ? 'many' : 'ok';
    if (!p) { items.body = 'none'; items.distance = 'wait'; }
    else {
      const sv = this.cfg.setupVisibility, r = this.spec.required;
      const vis = this.spec.view === 'side' ? Math.max(visibilityScore(p, r, 'L', sv), visibilityScore(p, r, 'R', sv)) : visibilityScore(p, r, null, sv);
      items.body = vis >= 1 ? 'ok' : 'partial';
      items.missing = vis >= 1 ? [] : this.missingNames(p, sv);
      // framing: extent of all visible landmarks
      const pts = p.lm.filter(l => l.v > 0.5);
      const ys = pts.map(l => l.y), xs = pts.map(l => l.x / env.aspect);
      const minY = Math.min(...ys), maxY = Math.max(...ys), minX = Math.min(...xs), maxX = Math.max(...xs);
      const lying = this.spec.position === 'lying' || this.spec.position === 'floor';
      const extent = lying ? maxX - minX : maxY - minY;
      const m = this.cfg.frame.margin;
      const clipped = minY < m || maxY > 1 - m || minX < m || maxX > 1 - m;
      const limbsOnly = this.spec.required.every(n => ['ear', 'shoulder', 'nose'].includes(n));
      items.distance = limbsOnly ? (clipped ? 'close' : 'ok')
        : extent > this.cfg.frame.maxHeight || clipped ? 'close' : extent < this.cfg.frame.minHeight ? 'far' : 'ok';
    }
    this.setup.items = items;
    const allOk = ['body', 'distance', 'people'].every(k => items[k] === 'ok') && items.light !== 'wait';
    if (allOk) {
      this.setup.since ??= t;
      if (t - this.setup.since >= this.cfg.setupHoldMs) this.afterSetup(t);
    } else this.setup.since = null;
    this.io.onChange?.();
  }
  missingNames(p, sv) {
    const out = new Set();
    const sides = this.spec.view === 'side' ? [this.bestSide(p).L >= this.bestSide(p).R ? 'L' : 'R'] : ['L', 'R'];
    for (const n of this.spec.required) for (const s of sides) if ((p.pt(n, s)?.v ?? 0) < sv) out.add(n);
    return [...out];
  }
  skipSetup() { this.afterSetup(now()); }
  afterSetup(t) {
    if (this.spec.calibrate) { this.phase = 'calibrate'; this.calBuf = { L: [], R: [] }; this.say('calibrating', 'calibrating', { en: 'Hold still in the start position', hi: 'शुरुआती स्थिति में स्थिर रहें' }); }
    else this.startCountdown(t);
    this.io.onChange?.();
  }
  calibrate(p, t) {
    for (const s of ['L', 'R']) {
      const v = this.spec.calibrate(p, s);
      if (Object.values(v).every(Number.isFinite)) this.calBuf[s].push(v);
    }
    if (this.calBuf.L.length >= this.cfg.calibrateFrames && this.calBuf.R.length >= this.cfg.calibrateFrames) {
      for (const s of ['L', 'R']) {
        const rows = this.calBuf[s], keys = Object.keys(rows[0]);
        this.cal[s] = Object.fromEntries(keys.map(k => [k, median(rows.map(r => r[k]))]));
      }
      this.cal.A = this.cal[this.bestSide(p).L >= this.bestSide(p).R ? 'L' : 'R'];
      if (this.spec.rangeFromCal) {
        for (const k of this.sideKeys) {
          const c = k === 'A' ? this.cal.A : this.cal[k];
          if (c) { const r = this.spec.rangeFromCal(c); this.trackers[k].setRange(r.start, r.target); }
        }
      }
      this.startCountdown(t);
    }
    this.io.onChange?.();
  }
  startCountdown(t) {
    this.phase = 'countdown';
    this.countdownEnd = t + this.cfg.countdownS * 1000;
    this.say('start', 'start');
  }
  begin() { this.phase = 'active'; this.setStartedAt = now(); this.io.onChange?.(); }

  // ---------------- per-side tracking step ----------------
  step(k, p, t) {
    const sp = this.spec, tr = this.trackers[k];
    const side = k === 'A' ? this.autoSide : k;
    const cal = k === 'A' ? this.cal[side] : this.cal[k];
    if (this.perSide && tr.count >= this.repsTarget) { tr.value = null; return; }
    let events = [];
    try {
      if (sp.mode === 'balance') {
        const hipC = mid(p.pt('hip', 'L'), p.pt('hip', 'R')), shC = mid(p.pt('shoulder', 'L'), p.pt('shoulder', 'R'));
        const upright = shC.y < hipC.y && ['L', 'R'].some(s => angle(p.pt('hip', s), p.pt('knee', s), p.pt('ankle', s)) > 140);
        events = tr.update(upright, hipC.x, dist(p.pt('shoulder', 'L'), p.pt('shoulder', 'R')), t);
        if (tr.stability != null && tr.stability < 65) this.liveCue('sway', t);
      } else {
        const v = sp.metric(p, side, cal);
        if (sp.mode === 'strokes') events = tr.update(v, t);
        else {
          const faults = tr.state === 'active' ? (sp.checks || []).filter(c => { try { return c.fn(p, side); } catch { return false; } }).map(c => c.key) : [];
          tr.faultsNow = faults;
          events = tr.update(v, t, faults);
          if (faults.length && tr.state === 'active') {
            const top = (sp.checks || []).filter(c => faults.includes(c.key)).sort((a, b) => b.weight - a.weight)[0];
            this.liveFaultFrames = (this.liveFaultFrames || 0) + 1;
            if (this.liveFaultFrames > 8) this.liveCue(top.key, t);
          } else this.liveFaultFrames = 0;
        }
      }
    } catch (e) { return; }
    for (const ev of events) this.onEvent(k, ev, t);
  }

  onEvent(k, ev, t) {
    const sp = this.spec;
    if (ev.type === 'start' && sp.holdS && sp.mode === 'rep') this.holdAnnounced = false;
    if (ev.type === 'holdDone') this.say('hold_done', 'hold_done');
    if (ev.type === 'partial') { if (t - (this.lastPartial || 0) > 5000) { this.lastPartial = t; this.say('partial', 'partial'); } }
    if (ev.type === 'fault' && ev.key === 'too_fast') this.liveCue('roll', t, 'roll_slower');
    if (ev.type !== 'rep') return;

    const rec = { ...ev, set: this.set, sideKey: k, side: k === 'A' ? this.autoSide : ev.side, t: Date.now() };
    this.history.push(rec);
    const count = this.spec.countMode === 'together' ? this.displayCount : this.trackers[k].count;
    this.io.say(sp.mode === 'rep' ? count : null, 'count');
    if (sp.mode !== 'rep') this.say('relax', 'relax');
    const failed = rec.failed.filter(f => FAULTS[f]);
    if (failed.length) {
      this.cleanStreak = 0;
      const key = failed[0];
      const cue = k && key === 'rom_short' && sp.romCue ? sp.romCue : FAULTS[key].cue;
      setTimeout(() => this.say(cue, 'rep:' + key, null, true), 650);
    } else if (++this.cleanStreak % this.cfg.goodEvery === 0) setTimeout(() => this.say('good', 'good'), 650);

    if (this.perSide && this.trackers[k].count >= this.repsTarget && !this.sideDoneSaid[k + this.set]) {
      this.sideDoneSaid[k + this.set] = true;
      if (!this.setComplete()) setTimeout(() => this.say('switch_side', 'switch'), 1300);
    }
    if (this.setComplete()) this.completeSet();
    this.io.onChange?.();
  }

  completeSet() {
    if (this.set >= this.sets) { this.finish(); return; }
    this.phase = 'rest';
    this.restEnd = now() + this.spec.dosage.restS * 1000;
    setTimeout(() => this.say('set_done', 'set_done'), 1200);
  }
  nextSet() {
    this.set++;
    this.makeTrackers();
    this.phase = 'countdown';
    this.countdownEnd = now() + this.cfg.countdownS * 1000;
    this.say({ en: `Set ${this.set}. Ready.`, hi: `सेट ${this.set}। तैयार।` }, 'nextset');
    this.io.onChange?.();
  }
  skipRest() { if (this.phase === 'rest') this.restEnd = 0; if (this.guided && this.g?.resting) this.g.until = 0; }
  finish() {
    if (this.phase === 'done') return;
    this.phase = 'done'; this.endedAt = Date.now();
    setTimeout(() => this.say('all_done', 'done'), 1500);
    this.io.onChange?.(true);
  }
  togglePause() { this.paused = !this.paused; if (this.g) this.g.pausedAt = this.paused ? now() : null; this.io.onChange?.(); }

  // ---------------- cues ----------------
  liveCue(key, t, cueKey) {
    const ck = cueKey || FAULTS[key]?.cue || key;
    if (t - this.lastCueAt < this.cfg.cueGapMs) return;
    if (t - (this.lastCueByKey[ck] || 0) < this.cfg.sameCueGapMs) return;
    this.say(ck, ck);
  }
  say(cue, key, textOverride, corrective) {
    const t = now();
    const c = textOverride || (typeof cue === 'string' ? CUES[cue] : cue);
    if (!c) return;
    const kind = ['good', 'relax', 'hold_done', 'start', 'all_done', 'set_done', 'switch', 'nextset'].includes(key) ? 'ok'
      : ['lost'].includes(key) ? 'bad' : key === 'calibrating' ? 'info' : 'warn';
    if (kind === 'warn' || corrective) { this.lastCueAt = t; this.lastCueByKey[typeof cue === 'string' ? cue : key] = t; }
    this.cues.unshift({ ...c, kind: corrective ? 'warn' : kind, t });
    this.cues.length = Math.min(this.cues.length, 6);
    this.io.say(c, kind);
    this.io.onChange?.();
  }

  // ---------------- guided mode (no camera; timer + voice) ----------------
  guidedPhases() {
    const sp = this.spec;
    if (sp.phases) return sp.phases;
    if (sp.holdS) return [{ en: 'Move into position', hi: 'स्थिति में आएँ', s: 3 }, { en: 'Hold', hi: 'रोकें', s: sp.holdS }, { en: 'Relax', hi: 'आराम', s: 3 }];
    return [{ en: 'Down', hi: 'नीचे', s: 2 }, { en: 'Up', hi: 'ऊपर', s: 2 }];
  }
  startGuided() {
    const sides = this.spec.dosage.perSide ? ['L', 'R'] : ['C'];
    this.g = { sides, sideIdx: 0, rep: 1, phaseIdx: -1, until: 0, resting: false, counts: Object.fromEntries(sides.map(s => [s, 0])) };
    this.phase = 'active';
    this.say('start', 'start');
    this.g.until = now() + 1500;
  }
  tickGuided() {
    const g = this.g; if (!g || this.phase === 'done' || this.paused) return;
    const t = now();
    const remain = Math.ceil((g.until - t) / 1000);
    if (remain !== g.lastSpoken && remain > 0 && remain <= 3 && g.phaseIdx >= 0 && this.guidedPhases()[g.phaseIdx]?.s >= 5) { g.lastSpoken = remain; this.io.say(remain, 'count'); }
    if (t < g.until) { this.io.onChange?.(); return; }
    const phases = this.guidedPhases();
    if (g.resting) { g.resting = false; this.set++; g.sideIdx = 0; g.rep = 1; g.phaseIdx = -1; Object.keys(g.counts).forEach(k => (g.counts[k] = 0)); }
    g.phaseIdx++;
    if (g.phaseIdx >= phases.length) {
      const side = g.sides[g.sideIdx];
      g.counts[side]++;
      this.history.push({ type: 'rep', side, set: this.set, n: g.counts[side], quality: null, failed: [], guided: true, t: Date.now() });
      this.io.say(g.counts[side], 'count');
      g.phaseIdx = 0; g.rep++;
      if (g.rep > this.repsTarget) {
        g.rep = 1; g.sideIdx++;
        if (g.sideIdx >= g.sides.length) {
          if (this.set >= this.sets) { this.finish(); return; }
          g.resting = true; g.until = t + this.spec.dosage.restS * 1000; this.say('set_done', 'set_done'); return;
        }
        this.say('switch_side', 'switch'); g.until = t + 2500; g.phaseIdx = -1; return;
      }
    }
    const ph = phases[g.phaseIdx];
    g.until = t + ph.s * 1000; g.lastSpoken = null;
    this.io.say({ en: ph.en, hi: ph.hi }, 'phase');
    this.g.label = ph; this.io.onChange?.();
  }

  // ---------------- summary ----------------
  summary() {
    const reps = this.history.filter(r => r.type === 'rep');
    const scored = reps.filter(r => r.quality != null);
    const avgQ = scored.length ? Math.round(scored.reduce((a, r) => a + r.quality, 0) / scored.length) : null;
    const faultCounts = {};
    for (const r of scored) for (const f of r.failed) faultCounts[f] = (faultCounts[f] || 0) + 1;
    const target = this.spec.dosage.sets * this.repsTarget * (this.spec.dosage.perSide && this.spec.countMode !== 'together' ? 2 : 1);
    const bestRep = scored.filter(r => r.peakValue != null).sort((a, b) => b.peak - a.peak)[0];
    const peak = bestRep ? bestRep.peakValue : null;
    const holds = scored.filter(r => r.holdMs).map(r => r.holdMs);
    return {
      exercise: this.spec.id, title: this.spec.title.en, mode: this.guided ? 'guided' : 'tracked',
      reps: reps.length, target, completion: Math.min(1, reps.length / target), avgQuality: avgQ,
      bestValue: Number.isFinite(peak) ? peak : null, avgHoldS: holds.length ? +(holds.reduce((a, b) => a + b, 0) / holds.length / 1000).toFixed(1) : null,
      faults: Object.entries(faultCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, n, of: scored.length, label: FAULTS[k]?.label || k })),
      reps_detail: scored.map(r => ({ n: r.n, side: r.side, set: r.set, q: r.quality, f: r.failed })),
      startedAt: this.startedAt, endedAt: this.endedAt || Date.now(),
    };
  }
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
