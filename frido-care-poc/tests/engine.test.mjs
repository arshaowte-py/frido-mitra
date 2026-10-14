// Engine tests on synthetic landmark streams (no camera). Run: node --test frido-care-poc/tests/engine.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../js/session.js';
import { byId } from '../js/exercises.js';
import { ASPECT, FPS, sideFigure, frontFigure, cycle } from './synthetic.mjs';

function run(spec, gen, seconds, startT = performance.now()) {
  const said = [];
  const s = new Session(spec, { say: (c, k) => said.push(typeof c === 'number' ? c : c?.en), onChange: () => {} });
  const env = { aspect: ASPECT, brightness: 120, backlit: false, people: 1 };
  let t = startT;
  for (let i = 0; i < seconds * FPS; i++) { t += 1000 / FPS; s.frame(gen(i / FPS), env, t); }
  return { s, said };
}

test('squat: counts reps, passes setup, scores clean reps high', () => {
  const lead = 6; // setup (1 s) + countdown (3 s) + margin
  const { s } = run(byId('squat'), t => sideFigure({ depth: t < lead ? 0 : cycle(t - lead) }), lead + 4 * 4);
  assert.equal(s.phase === 'active' || s.phase === 'rest', true, 'reached tracking');
  const n = s.trackers.A.count;
  assert.ok(n >= 3 && n <= 4, `expected ~4 reps, got ${n}`);
  const q = s.history.map(r => r.quality);
  assert.ok(q.every(v => v >= 80), `clean reps should score ≥80: ${q}`);
});

test('squat: flags trunk lean and shallow depth', () => {
  const lead = 6;
  const { s } = run(byId('squat'), t => { const d = t < lead ? 0 : cycle(t - lead); return sideFigure({ depth: d * 0.45, lean: d * 40 }); }, lead + 3 * 4);
  const reps = s.history;
  assert.ok(reps.length >= 2, `expected reps, got ${reps.length}`);
  assert.ok(reps.every(r => r.failed.includes('trunk_lean')), 'trunk lean flagged');
  assert.ok(reps.every(r => r.failed.includes('rom_short')), 'short depth flagged');
  assert.ok(reps.every(r => r.quality < 70), `faulty reps score lower: ${reps.map(r => r.quality)}`);
});

test('squat: tiny dips are not counted', () => {
  const lead = 6;
  const { s } = run(byId('squat'), t => sideFigure({ depth: t < lead ? 0 : cycle(t - lead) * 0.2 }), lead + 12);
  assert.equal(s.trackers.A.count, 0);
});

test('heel raise: calibrates, counts reps with holds', () => {
  const lead = 7;
  const { s } = run(byId('heel-raise'), t => sideFigure({ heel: t < lead ? 0 : 0.7 * cycle(t - lead, { down: 0.8, hold: 2.4, up: 0.8 }) }), lead + 5 * 5);
  assert.ok(s.cal.L, 'calibrated');
  const n = s.trackers.A.count;
  assert.ok(n >= 4, `expected ≥4 heel raises, got ${n}`);
  assert.ok(s.history.every(r => r.holdMs >= 1900), `holds ~2 s: ${s.history.map(r => r.holdMs)}`);
});

test('side bend: counts left and right separately', () => {
  const lead = 6;
  const { s } = run(byId('side-bend'), t => {
    if (t < lead) return frontFigure({});
    const k = Math.floor((t - lead) / 6.5), c = cycle(t - lead, { down: 1, hold: 3.5, up: 1, rest: 1 });
    return frontFigure({ bend: (k % 2 ? -1 : 1) * 30 * c });
  }, lead + 6.5 * 4);
  assert.equal(s.trackers.L.count, 2, 'left reps');
  assert.equal(s.trackers.R.count, 2, 'right reps');
});

test('balance: completes a 30 s hold and scores steadiness', () => {
  const lead = 6;
  const { s } = run(byId('balance'), t => frontFigure({ sway: Math.sin(t * 3) * 0.004 }), lead + 32);
  assert.equal(s.trackers.C.count, 1);
  assert.ok(s.history[0].quality >= 80, `steady hold should score high: ${s.history[0].quality}`);
});
