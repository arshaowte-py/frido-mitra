// Guided-class tests: a simulated patient follows the coach's instructions on synthetic landmarks.
// Run: node --test frido-care-poc/tests/lesson.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ClassRunner, parseAnswer, parseNumber, parseCommand } from '../js/lesson-runner.js';
import { buildClass, classById, LESSONS, DOSES } from '../js/lessons.js';
import { byId } from '../js/exercises.js';
import { ASPECT, sideFigure, seatedFront, standFront } from './synthetic.mjs';

const ENV = { aspect: ASPECT };
const titles = Object.fromEntries(['plantar-stretch', 'heel-raise', 'balance'].map(id => [id, byId(id).title]));

function stubIO() {
  const said = [];
  return { said, say: (c, kind) => said.push({ text: typeof c === 'number' ? c : c.en, kind }), isSpeaking: () => false, readMs: () => 0 };
}

/** What a cooperative patient does for the current step. */
function patient(r, tStep, opts = {}) {
  const s = r.step; if (!s) return null;
  const ex = s.exercise;
  if (ex === 'plantar-stretch') {
    const side = (s.checks || s.keep || [])[0]?.split(':')[1];
    if (s.type === 'gate' && s.checks.includes('seated')) return seatedFront();
    if (s.type === 'gate' && s.checks.length === 1) return seatedFront({ cross: side });
    if (s.type === 'gate' || s.type === 'checkin') return seatedFront({ cross: side || r._lastSide, hand: true });
    if (s.type === 'hold') {
      r._lastSide = side;
      const letGo = opts.letGoAt && tStep > opts.letGoAt[0] && tStep < opts.letGoAt[1];
      return seatedFront({ cross: side, hand: !letGo });
    }
    if (s.type === 'say' && /pull your toes/.test(s.text.en)) return seatedFront({ cross: r._lastSide || 'R', hand: true });
    return seatedFront();
  }
  if (ex === 'heel-raise') {
    if (s.type === 'teachRep') {
      const ph = r.st.phase;
      return sideFigure({ heel: ph === 'up' || ph === 'hold' ? 0.7 : 0 });
    }
    if (s.type === 'reps') {
      const u = (tStep / 1000) % 5; // 1 s rest, 0.8 s up, 2.4 s hold, 0.8 s down
      const h = u < 1 ? 0 : u < 1.8 ? (u - 1) / 0.8 : u < 4.2 ? 1 : u < 5 ? 1 - (u - 4.2) / 0.8 : 0;
      return sideFigure({ heel: 0.7 * h });
    }
    return sideFigure({});
  }
  if (ex === 'balance') {
    const side = (s.checks || s.keep || [])[0]?.split(':')[1];
    if ((s.type === 'gate' || s.type === 'hold') && side) return standFront({ lift: side, sway: Math.sin(tStep / 300) * 0.002 });
    return standFront();
  }
  return seatedFront();
}

function runClass({ noCamera = false, maxS = 900, opts = {}, onStep } = {}) {
  const io = stubIO();
  const steps = buildClass(classById('heel-pain'), 'quick', titles);
  const r = new ClassRunner(steps, io, { noCamera });
  let t = 1000; r.start(t);
  let stepIdx = -1, stepT0 = t;
  while (!r.done && t < maxS * 1000) {
    t += 33;
    if (r.i !== stepIdx) { stepIdx = r.i; stepT0 = t; onStep?.(r); }
    const aw = r.awaiting();
    if (aw === 'pain' && t - stepT0 > 500) r.answer(r.step.key === 'pre' ? 3 : 2, t);
    if (aw === 'checkin' && t - stepT0 > 500) r.answer('yes', t);
    r.tick(noCamera ? null : patient(r, t - stepT0, opts), noCamera ? null : ENV, t);
  }
  return { r, io, seconds: (t - 1000) / 1000 };
}

test('quick heel-pain class completes on camera with a cooperative patient', () => {
  const { r, io, seconds } = runClass();
  assert.ok(r.done, `class finished (stuck at step ${r.i}: ${r.step?.type} ${r.step?.label || ''})`);
  assert.equal(r.results.painPre, 3); assert.equal(r.results.painPost, 2);
  const plantar = r.results.holds.filter(h => h.exercise === 'plantar-stretch');
  assert.equal(plantar.length, 2, 'one stretch hold per foot');
  assert.ok(plantar.every(h => h.heldS >= DOSES.quick.plantarHoldS && !h.partial), JSON.stringify(plantar));
  assert.equal(r.results.checkins.stretch_R, 'yes');
  const reps = r.results.reps.find(x => x.exercise === 'heel-raise');
  assert.ok(reps && reps.done === DOSES.quick.heelReps - 1, `heel raises counted: ${JSON.stringify(reps)}`);
  const balance = r.results.holds.filter(h => h.exercise === 'balance');
  assert.equal(balance.length, 2);
  assert.ok(balance.every(h => h.stability >= 80), `steady balance: ${balance.map(b => b.stability)}`);
  assert.ok(r.results.gates.every(g => !g.skipped), `no skipped steps: ${JSON.stringify(r.results.gates.filter(g => g.skipped))}`);
  assert.ok(seconds < 300, `quick class length ${seconds}s`);
  assert.ok(io.said.some(x => /Good\./.test(x.text)), 'praises a reached position');
});

test('the stretch timer pauses and the coach corrects when the patient lets go of the toes', () => {
  const { r, io } = runClass({ opts: { letGoAt: [4000, 8000] } });
  assert.ok(r.done);
  assert.ok(io.said.some(x => x.kind === 'warn' && /Keep holding your toes/.test(x.text)), 'correction spoken');
  const h = r.results.holds.find(x => x.exercise === 'plantar-stretch');
  assert.ok(h.lostCount >= 1 && h.heldS >= DOSES.quick.plantarHoldS);
});

test('a gate waits for the position and gives a hint when the patient is stuck', () => {
  const io = stubIO();
  const steps = LESSONS['plantar-stretch'].build(DOSES.quick).map(s => ({ ...s, exercise: 'plantar-stretch' }));
  const r = new ClassRunner(steps, io);
  let t = 0; r.start(t);
  while (r.step.type !== 'gate') { t += 33; r.tick(seatedFront(), ENV, t); }
  // standing, not seated: the seated gate must not pass
  for (let i = 0; i < 400; i++) { t += 33; r.tick(standFront(), ENV, t); }
  assert.equal(r.step.label, 'Seated, facing the phone');
  assert.ok(io.said.some(x => x.kind === 'hint'), 'hint given');
  for (let i = 0; i < 60; i++) { t += 33; r.tick(seatedFront(), ENV, t); }
  assert.notEqual(r.step.label, 'Seated, facing the phone', 'gate passes once seated');
});

test('class also runs without a camera (timer-guided)', () => {
  const { r } = runClass({ noCamera: true });
  assert.ok(r.done);
  assert.equal(r.results.reps[0].tracked, false);
});

test('spoken answers, numbers and commands are understood in English, Hinglish and Hindi', () => {
  assert.equal(parseAnswer('haan'), 'yes'); assert.equal(parseAnswer('yes I can'), 'yes');
  assert.equal(parseAnswer('nahi'), 'no'); assert.equal(parseAnswer('thoda dard hai'), 'pain'); assert.equal(parseAnswer('हाँ'), 'yes');
  assert.equal(parseAnswer('yes but it is quite painful'), 'pain');
  assert.equal(parseNumber('teen'), 3); assert.equal(parseNumber('about 4'), 4); assert.equal(parseNumber('पाँच'), 5);
  assert.equal(parseCommand('next'), 'next'); assert.equal(parseCommand('phir se repeat'), 'repeat'); assert.equal(parseCommand('ruko'), 'pause');
  assert.equal(parseCommand('should I stop if it hurts'), null, 'questions are not commands');
});

test('voice input during a check-in answers it; other speech becomes a question', () => {
  const io = stubIO();
  const r = new ClassRunner([{ type: 'checkin', key: 'k', text: { en: 'Feel it?' }, responses: { no: { en: 'Pull more.' } } }, { type: 'say', text: { en: 'End' } }], io);
  r.start(0); r.tick(null, null, 600);
  assert.deepEqual(r.voice('how long do I hold this', 700), { question: 'how long do I hold this' });
  assert.deepEqual(r.voice('nahi', 800), { handled: 'answer' });
  assert.equal(r.results.checkins.k, 'no');
  assert.ok(io.said.some(x => x.text === 'Pull more.'));
});
