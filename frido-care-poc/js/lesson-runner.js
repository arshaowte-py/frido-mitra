// Frido Care · guided class runner.
// Pure state machine (no DOM, no camera): the UI feeds pose frames and taps/voice, the runner decides
// what the coach says next and when a step is done. Testable with synthetic landmarks.
import { makePose, PoseSmoother, RepTracker, dist, mid, avg } from './engine.js';
import { check, allPass } from './predicates.js';
import { byId, CUES, FAULTS } from './exercises.js';
import { CONFIG } from './config.js';

const L = {
  good: { en: 'Good.', hi: 'बढ़िया।' },
  carryOn: { en: "Let's carry on.", hi: 'चलिए आगे बढ़ते हैं।' },
  keepPosition: { en: 'Get back into position.', hi: 'फिर से उसी स्थिति में आइए।' },
  thanks: { en: 'Thank you.', hi: 'धन्यवाद।' },
  stayUp: { en: 'Stay up on your toes.', hi: 'पंजों पर ही रहिए।' },
  paused: { en: 'Paused. Say continue when you are ready.', hi: 'रुका हुआ है। तैयार हों तो "चलो" बोलिए।' },
  resumed: { en: "Okay, let's continue.", hi: 'ठीक है, आगे चलते हैं।' },
};

// Spoken answers and commands (English, Hinglish and Hindi). Matched on whole words.
const ANSWERS = {
  pain: ['pain', 'painful', 'hurt', 'hurts', 'hurting', 'dard', 'dukh', 'sharp', 'ouch', 'दर्द'],
  no: ['no', 'nope', 'nahi', 'nahin', 'nai', 'not', 'नहीं', 'ना'],
  yes: ['yes', 'yeah', 'yep', 'haan', 'han', 'ha', 'haa', 'ji', 'hmm', 'sure', 'हाँ', 'हां', 'जी'],
};
const COMMANDS = {
  next: ['next', 'skip', 'aage', 'agla', 'done', 'आगे', 'अगला'],
  pause: ['pause', 'ruko', 'wait', 'stop', 'रुको', 'रुकिए'],
  resume: ['resume', 'continue', 'start', 'chalo', 'go', 'चलो', 'शुरू'],
  repeat: ['repeat', 'again', 'dobara', 'दोबारा', 'फिर'],
};
const NUMS = { zero: 0, shunya: 0, one: 1, ek: 1, two: 2, do: 2, three: 3, teen: 3, four: 4, char: 4, chaar: 4, five: 5, paanch: 5, panch: 5,
  six: 6, chhe: 6, che: 6, seven: 7, saat: 7, eight: 8, aath: 8, nine: 9, nau: 9, ten: 10, das: 10,
  'शून्य': 0, 'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पाँच': 5, 'पांच': 5, 'छह': 6, 'छः': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10 };

export const words = text => String(text || '').toLowerCase().replace(/[.,!?।'"]/g, ' ').split(/\s+/).filter(Boolean);
const has = (ws, list) => ws.some(w => list.includes(w)) || list.some(p => p.includes(' ') && ws.join(' ').includes(p));
export function parseAnswer(text) {
  const ws = words(text);
  if (ws.length > 6) return null;
  for (const k of ['pain', 'no', 'yes']) if (has(ws, ANSWERS[k])) return k;
  return null;
}
export function parseNumber(text) {
  for (const w of words(text)) {
    if (/^\d{1,2}$/.test(w) && +w <= 10) return +w;
    if (w in NUMS) return NUMS[w];
  }
  return null;
}
export function parseCommand(text) {
  const ws = words(text);
  if (!ws.length || ws.length > 3) return null;
  for (const k of Object.keys(COMMANDS)) if (has(ws, COMMANDS[k])) return k;
  return null;
}

const TEACHING = new Set(['gate', 'checkin', 'hold', 'teachRep', 'reps', 'calibrate']);

export class ClassRunner {
  /**
   * @param steps  from buildClass()
   * @param io     { say(text|number, kind), isSpeaking(), stopSpeaking?(), readMs?(text), listen?(what), onDone?(results), onChange?() }
   * @param opts   { noCamera }
   */
  constructor(steps, io, opts = {}) {
    this.steps = steps; this.io = io; this.noCamera = !!opts.noCamera;
    this.smoother = new PoseSmoother(CONFIG);
    this.i = -1; this.st = null; this.paused = false; this.held = false; this.done = false;
    this.cal = {}; this.sides = {}; this.cue = null; this.caption = null; this.lastT = null;
    this.results = { painPre: null, painPost: null, checkins: {}, answers: [], holds: [], reps: [], gates: [], questions: [], flags: [], startedAt: Date.now() };
  }

  get step() { return this.steps[this.i]; }
  speaking() { return !!this.io.isSpeaking?.(); }
  readMs(text) { return this.io.readMs ? this.io.readMs(text) : 0; }
  say(text, kind = 'instr') {
    if (text == null) return;
    if (kind === 'instr') this.caption = text;
    else if (kind !== 'count') this.cue = { text, kind, t: this.lastT ?? 0 };
    this.io.say(text, kind);
  }
  correct(text) { this.say(text, 'warn'); }

  start(t) { this.lastT = t; this.next(t); }

  next(t) {
    this.i++;
    this.cue = null;
    if (this.i >= this.steps.length) {
      this.done = true; this.results.endedAt = Date.now();
      this.io.onDone?.(this.results);
      this.io.onChange?.();
      return;
    }
    this.enter(this.step, t);
    this.io.onChange?.();
  }

  // ---------------- frames ----------------
  tick(raw, env, t) {
    if (this.done) return;
    const dt = this.lastT == null ? 0 : Math.min(200, Math.max(0, t - this.lastT));
    this.lastT = t;
    this.pose = raw && env ? makePose(this.smoother.apply(raw, t, env.aspect)) : null;
    if (this.paused || this.held || this.i < 0) return;
    if (this.update(this.step, this.pose, t, dt)) this.next(t);
  }

  enter(s, t) {
    const st = this.st = { t0: t };
    switch (s.type) {
      case 'say': case 'demo': this.say(s.text); break;
      case 'gate': Object.assign(st, { okSince: null, hints: 0, lastHint: t }); this.say(s.text); break;
      case 'checkin': case 'pain': Object.assign(st, { asked: t, answer: null, listening: false, reasked: false }); this.say(s.text); break;
      case 'hold': Object.assign(st, { elapsed: 0, lostSince: null, lastCorr: t, cuesDone: new Set(), xs: [], stab: [], lastCount: null, lostCount: 0, watchBad: {} }); this.say(s.text); break;
      case 'calibrate': Object.assign(st, { buf: { L: [], R: [] } }); this.say(s.text); break;
      case 'teachRep': Object.assign(st, { phase: 'up', phaseT: t, held: 0, below: null, lastHint: t, warned: false }); this.say(s.up); break;
      case 'reps': {
        const spec = byId(s.exercise);
        const tr = new RepTracker(spec, 'A', CONFIG);
        Object.assign(st, { spec, tr, started: false, lastRepT: t, faultFrames: 0, lastCorr: 0, pendingCue: null, simCount: 0 });
        this.say(s.text); break;
      }
      case 'rest': Object.assign(st, { end: t + s.seconds * 1000, lastCount: null }); this.say(s.text); break;
      default: break;
    }
  }

  update(s, p, t, dt) {
    const st = this.st, speaking = this.speaking();
    const minRead = this.readMs(s.text);
    switch (s.type) {
      case 'say':
        return !speaking && t - st.t0 >= Math.max(500, minRead);
      case 'demo':
        return !speaking && t - st.t0 >= Math.max(4000, minRead);

      case 'gate': {
        const ok = this.noCamera ? t - st.t0 > minRead + 1500 : allPass(s.checks, p);
        st.ok = ok;
        if (ok) {
          st.okSince ??= t;
          if (!speaking && t - st.okSince >= 700) {
            if (s.praise && !this.noCamera) this.say(L.good, 'ok');
            this.results.gates.push({ exercise: s.exercise, label: s.label, ms: Math.round(t - st.t0), hints: st.hints, skipped: false });
            return true;
          }
        } else {
          st.okSince = null;
          if (!speaking && s.hint && st.hints < 3 && t - st.t0 > (s.hintAfter ?? 9000) && t - st.lastHint > 9000) {
            this.say(s.hint, 'hint'); st.hints++; st.lastHint = t;
          }
          if (!speaking && t - st.t0 > (s.maxWait ?? 45000)) {
            this.say(L.carryOn, 'info');
            this.results.gates.push({ exercise: s.exercise, label: s.label, ms: Math.round(t - st.t0), hints: st.hints, skipped: true });
            return true;
          }
        }
        return false;
      }

      case 'checkin': case 'pain': {
        if (st.answer != null) return !speaking && t - st.answeredT > 300;
        if (!speaking && !st.listening) { st.listening = true; this.io.listen?.(s.type); }
        if (!speaking && !st.reasked && t - st.asked > 12000) { st.reasked = true; st.asked = t; st.listening = false; this.say(s.text); }
        if (!speaking && t - st.t0 > 32000) {
          if (s.type === 'checkin') this.results.checkins[s.key] = 'no answer';
          return true;
        }
        return false;
      }

      case 'hold': {
        const ok = this.noCamera || allPass(s.keep, p);
        if (ok) {
          st.elapsed += dt; st.lostSince = null;
        } else {
          st.lostSince ??= t;
          if (t - st.lostSince > 1200 && t - st.lastCorr > 5000) {
            const failing = s.keep.find(c => !check(c, p));
            this.correct(s.lost?.[failing] || L.keepPosition);
            st.lastCorr = t; st.lostCount++;
          }
          if (t - st.lostSince > 20000) { this.say(L.carryOn, 'info'); this.recordHold(s, st, true); return true; }
        }
        if (ok && p && !this.noCamera) {
          for (const w of s.watch || []) {
            st.watchBad[w.check] = check(w.check, p) ? 0 : (st.watchBad[w.check] || 0) + 1;
            if (st.watchBad[w.check] > 20 && t - st.lastCorr > 6000) { this.correct(w.cue); st.lastCorr = t; st.watchBad[w.check] = 0; }
          }
          if (s.measure === 'sway') this.measureSway(s, st, p, t);
        }
        for (const c of s.cues || []) {
          if (!st.cuesDone.has(c) && st.elapsed >= c.at * 1000 && !speaking) { st.cuesDone.add(c); this.say(c.text, 'tip'); }
        }
        const remaining = Math.ceil(s.seconds - st.elapsed / 1000);
        if (ok && s.seconds >= 8 && remaining <= 3 && remaining >= 1 && remaining !== st.lastCount) { st.lastCount = remaining; this.io.say(remaining, 'count'); }
        if (st.elapsed >= s.seconds * 1000) { this.recordHold(s, st, false); return true; }
        return false;
      }

      case 'calibrate': {
        if (this.noCamera) return t - st.t0 > 1500;
        const spec = byId(s.exercise);
        if (p) for (const sd of ['L', 'R']) {
          try { const v = spec.calibrate(p, sd); if (Object.values(v).every(Number.isFinite)) st.buf[sd].push(v); } catch { /* joint not seen */ }
        }
        const need = CONFIG.calibrateFrames;
        if (st.buf.L.length >= need && st.buf.R.length >= need && !speaking) {
          this.cal[s.exercise] = { L: medianObj(st.buf.L), R: medianObj(st.buf.R) };
          return true;
        }
        return t - st.t0 > 15000;
      }

      case 'teachRep': {
        const pr = this.noCamera ? simulatedPr(st, t, s.holdS) : this.progress(s.exercise, p);
        if (st.phase === 'up') {
          if (pr != null && pr >= 0.6 && !speaking) { this.say(s.hold); st.phase = 'hold'; st.phaseT = t; st.held = 0; }
          else if (!speaking && t - st.lastHint > 9000) { this.say(s.upHint, 'hint'); st.lastHint = t; }
        } else if (st.phase === 'hold') {
          if (pr != null && pr >= 0.45) { st.held += dt; st.below = null; }
          else {
            st.below ??= t;
            if (t - st.below > 900 && !st.warned) { this.correct(L.stayUp); st.warned = true; st.held = 0; }
          }
          if (st.held >= s.holdS * 1000) { this.say(s.down); st.phase = 'down'; st.phaseT = t; }
        } else if (st.phase === 'down') {
          if (pr != null && pr <= 0.2 && !speaking) { this.say(s.done, 'ok'); st.phase = 'finish'; }
        } else if (st.phase === 'finish') {
          return !speaking;
        }
        if (t - st.t0 > 45000 && !speaking) { this.say(L.carryOn, 'info'); return true; }
        return false;
      }

      case 'reps': return this.updateReps(s, st, p, t, speaking);

      case 'rest': {
        const remaining = Math.ceil((st.end - t) / 1000);
        if (remaining <= 3 && remaining >= 1 && remaining !== st.lastCount && s.seconds >= 8) { st.lastCount = remaining; this.io.say(remaining, 'count'); }
        return t >= st.end && !speaking;
      }
      default: return true;
    }
  }

  updateReps(s, st, p, t, speaking) {
    if (!st.started) { if (speaking) return false; st.started = true; st.lastRepT = t; }
    if (this.noCamera) {
      if (t - st.lastRepT > 3500) { st.simCount++; st.lastRepT = t; this.io.say(st.simCount, 'count'); }
      if (st.simCount >= s.n) { this.results.reps.push({ exercise: s.exercise, label: s.label, target: s.n, done: st.simCount, quality: [], faults: {}, tracked: false }); return true; }
      return false;
    }
    const { spec, tr } = st;
    const m = this.metric(s.exercise, p);
    if (st.pendingCue && t >= st.pendingCue.at) { this.correct(st.pendingCue.text); st.lastCorr = t; st.pendingCue = null; }
    if (m) {
      const faults = tr.state === 'active' ? (spec.checks || []).filter(c => { try { return c.fn(p, m.side); } catch { return false; } }).map(c => c.key) : [];
      tr.faultsNow = faults;
      const events = tr.update(m.v, t, faults);
      if (faults.length && tr.state === 'active') {
        if (++st.faultFrames > 8 && t - st.lastCorr > 4000) {
          const top = spec.checks.filter(c => faults.includes(c.key)).sort((a, b) => b.weight - a.weight)[0];
          this.correct(CUES[FAULTS[top.key].cue]); st.lastCorr = t; st.faultFrames = 0;
        }
      } else st.faultFrames = 0;
      for (const ev of events) {
        if (ev.type === 'rep') {
          st.lastRepT = t;
          this.io.say(tr.count, 'count');
          const key = ev.failed.find(f => FAULTS[f]);
          if (key && t - st.lastCorr > 2500) st.pendingCue = { text: CUES[FAULTS[key].cue], at: t + 700 };
        } else if (ev.type === 'partial' && t - st.lastCorr > 4000) {
          this.correct(CUES.partial); st.lastCorr = t;
        }
      }
    }
    if (tr.count >= s.n || (t - st.lastRepT > 30000 && !speaking)) {
      if (tr.count < s.n) this.say(L.carryOn, 'info');
      const faults = {};
      for (const r of tr.reps) for (const f of r.failed) faults[f] = (faults[f] || 0) + 1;
      this.results.reps.push({ exercise: s.exercise, label: s.label, target: s.n, done: tr.count, quality: tr.reps.map(r => r.quality), faults, tracked: true });
      return true;
    }
    return false;
  }

  recordHold(s, st, partial) {
    this.results.holds.push({ exercise: s.exercise, label: s.label, targetS: s.seconds, heldS: +(st.elapsed / 1000).toFixed(1),
      lostCount: st.lostCount, partial, stability: st.stab.length ? Math.round(avg(st.stab)) : null });
  }

  measureSway(s, st, p, t) {
    const hm = mid(p.pt('hip', 'L'), p.pt('hip', 'R'));
    const sw = dist(p.pt('shoulder', 'L'), p.pt('shoulder', 'R')) || 0.2;
    st.xs.push({ t, x: hm.x });
    while (st.xs.length && t - st.xs[0].t > 2000) st.xs.shift();
    if (st.xs.length < 6) return;
    const xs = st.xs.map(o => o.x), m = avg(xs);
    const sd = Math.sqrt(avg(xs.map(x => (x - m) ** 2))) / sw;
    const stability = Math.max(0, Math.min(100, Math.round(100 - sd * CONFIG.swayGain)));
    st.stab.push(stability); st.stability = stability;
    if (stability < 60 && s.unsteady && t - st.lastCorr > 7000) { this.correct(s.unsteady); st.lastCorr = t; }
  }

  // ---------------- exercise metric (uses the movement spec + calibration) ----------------
  pickSide(exercise, p) {
    const spec = byId(exercise);
    const score = sd => spec.required.reduce((a, n) => a + (p.pt(n, sd)?.v ?? 0), 0);
    const cur = this.sides[exercise] || 'L', alt = cur === 'L' ? 'R' : 'L';
    if (score(alt) > score(cur) + 0.4) this.sides[exercise] = alt;
    return this.sides[exercise] || cur;
  }
  metric(exercise, p) {
    if (!p) return null;
    const spec = byId(exercise), side = this.pickSide(exercise, p);
    const cal = this.cal[exercise]?.[side];
    if (spec.calibrate && !cal) return null;
    let v; try { v = spec.metric(p, side, cal); } catch { return null; }
    return Number.isFinite(v) ? { v, side } : null;
  }
  progress(exercise, p) {
    const m = this.metric(exercise, p); if (!m) return null;
    const spec = byId(exercise);
    return (m.v - spec.start) / (spec.target - spec.start);
  }

  // ---------------- input: taps, voice, buttons ----------------
  awaiting() { const s = this.step; return s && (s.type === 'checkin' || s.type === 'pain') && this.st?.answer == null ? s.type : null; }

  answer(value, t = this.lastT) {
    const s = this.step, st = this.st;
    if (!this.awaiting()) return false;
    st.answer = value; st.answeredT = t ?? 0;
    this.io.stopSpeaking?.();
    if (s.type === 'pain') {
      if (s.key === 'pre') this.results.painPre = value; else this.results.painPost = value;
      this.say(L.thanks, 'ok');
    } else {
      this.results.checkins[s.key] = value;
      this.results.answers.push({ exercise: s.exercise, key: s.key, value });
      if (value === 'pain') this.results.flags.push({ type: 'pain_during', exercise: s.exercise, at: Date.now() });
      const r = s.responses?.[value];
      if (r) this.say(r, value === 'pain' ? 'warn' : 'ok');
    }
    this.io.onChange?.();
    return true;
  }

  /** Voice transcript → answer, command, or a question for the coach. */
  voice(text, t = this.lastT) {
    const aw = this.awaiting();
    if (aw === 'pain') { const n = parseNumber(text); if (n != null) { this.answer(n, t); return { handled: 'answer' }; } }
    if (aw === 'checkin') { const a = parseAnswer(text); if (a) { this.answer(a, t); return { handled: 'answer' }; } }
    const cmd = parseCommand(text);
    if (cmd) { this.command(cmd, t); return { handled: cmd }; }
    return { question: text };
  }

  command(cmd, t = this.lastT) {
    if (cmd === 'next') { this.io.stopSpeaking?.(); this.skip(t); }
    else if (cmd === 'pause') this.pause();
    else if (cmd === 'resume') this.resume();
    else if (cmd === 'repeat') { if (this.step?.text) this.say(this.step.type === 'teachRep' ? this.step.up : this.step.text); }
    this.io.onChange?.();
  }

  skip(t = this.lastT) {
    const s = this.step; if (!s || this.done) return;
    if (s.type === 'gate') this.results.gates.push({ exercise: s.exercise, label: s.label, ms: Math.round(t - this.st.t0), hints: this.st.hints, skipped: true });
    if (s.type === 'hold') this.recordHold(s, this.st, true);
    this.next(t);
  }
  pause() { if (this.paused) return; this.paused = true; this.io.stopSpeaking?.(); this.say(L.paused, 'info'); this.io.onChange?.(); }
  resume() { if (!this.paused) return; this.paused = false; this.say(L.resumed, 'info'); this.io.onChange?.(); }
  /** Hold the class while the coach answers a question (no "paused" announcement). */
  hold(on) { this.held = on; this.io.onChange?.(); }

  logQuestion(q) { this.results.questions.push({ ...q, exercise: this.step?.exercise || null, at: Date.now() }); }

  // ---------------- UI snapshot ----------------
  view() {
    const s = this.step, st = this.st || {};
    const ex = s ? s.exIdx : -1;
    const teaching = this.steps.filter(x => x.exIdx === ex && TEACHING.has(x.type));
    const v = {
      done: this.done, paused: this.paused, exIdx: ex, type: s?.type, label: s?.label, caption: this.caption, cue: this.cue,
      demoBig: s?.type === 'demo', view: s?.view, exercise: s?.exercise,
      stepNo: s && TEACHING.has(s.type) ? teaching.indexOf(s) + 1 : null, stepsTotal: teaching.length,
      progress: this.steps.length ? Math.max(0, this.i) / this.steps.length : 0,
      awaiting: this.awaiting(),
    };
    if (!s) return v;
    if (s.type === 'gate') v.gate = { ok: !!st.ok, label: s.label };
    if (s.type === 'hold') v.hold = { elapsed: st.elapsed / 1000, total: s.seconds, lost: st.lostSince != null, stability: st.stability ?? null };
    if (s.type === 'rest') v.rest = { remaining: Math.max(0, Math.ceil((st.end - (this.lastT ?? 0)) / 1000)) };
    if (s.type === 'teachRep') v.teach = { phase: st.phase, progress: this.noCamera ? null : this.progress(s.exercise, this.pose) };
    if (s.type === 'reps') {
      const tr = st.tr;
      v.reps = { count: this.noCamera ? st.simCount : tr?.count ?? 0, n: s.n, quality: tr ? tr.reps.map(r => r.quality) : [],
        progress: tr && tr.pr != null ? tr.pr : null, holdMs: tr?.holdMs ?? 0 };
    }
    if (s.type === 'checkin') v.options = ['yes', 'no', 'pain'];
    return v;
  }
}

function medianObj(rows) {
  const keys = Object.keys(rows[0]);
  return Object.fromEntries(keys.map(k => { const s = rows.map(r => r[k]).sort((a, b) => a - b); return [k, s[Math.floor(s.length / 2)]]; }));
}

/** Without a camera, walk the teach rep on a timer so the class still flows. */
function simulatedPr(st, t, holdS) {
  const e = t - st.phaseT;
  if (st.phase === 'up') return e > 3000 ? 1 : 0;
  if (st.phase === 'hold') return 1;
  if (st.phase === 'down') return e > 2500 ? 0 : 1;
  return 0;
}
