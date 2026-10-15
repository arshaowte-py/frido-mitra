// Frido Care · trial records: consent, stable identifiers, session-summary records and export.
// Record structure is documented in docs/SESSION_SUMMARY.md. Records hold numbers and short text only.
import { FAULTS } from './exercises.js';

export const SCHEMA = 'frido.care.session-summary/1';
export const APP_VERSION = 'poc-0.5';
export const SPEC_VERSION = 'draft-2026-10';      // exercise specs + lesson scripts; bump when physios approve changes
export const CONSENT_VERSION = 'trial-consent-1';

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
const iso = t => new Date(t).toISOString();
const sum = a => a.reduce((x, y) => x + (y || 0), 0);
const round1 = x => Math.round(x * 10) / 10;

export function createRecords(store) {
  const trial = () => store.get('fc_trial_v1', null);
  return {
    trial,
    canSave: () => trial()?.consent === true,
    setTrial: ({ participantId, consent }) => store.set('fc_trial_v1', {
      participantId: (participantId || '').trim().toUpperCase() || null, consent: !!consent, version: CONSENT_VERSION, at: new Date().toISOString() }),
    resetTrial: () => store.set('fc_trial_v1', null),
    deviceId() {
      let id = store.get('fc_device_v1', null);
      if (!id) { id = uuid(); store.set('fc_device_v1', id); }
      return id;
    },
    /** Add identity + version fields every record carries. */
    stamp(rec) {
      return { schema: SCHEMA, recordId: uuid(), participantId: trial()?.participantId || null, deviceId: this.deviceId(),
        appVersion: APP_VERSION, specVersion: SPEC_VERSION, ...rec };
    },
  };
}

/** Display fields for the physio table (it predates the schema). Never overwrite schema fields here. */
function tableFields(rec) {
  const r = rec.reps, h = rec.holds;
  const issues = rec.formIssues || [];
  return {
    id: rec.recordId, type: 'session', at: Date.parse(rec.endedAt), exercise: rec.exerciseId, title: rec.exerciseTitle,
    modeLabel: { camera: 'camera', video_file: 'video file', no_camera: 'no camera' }[rec.mode] + (rec.source === 'guided_class' ? ' · guided class' : ''),
    completion: r ? (r.cameraCounted ?? r.selfPaced ?? 0) / Math.max(1, r.prescribed) : h ? h.completed / Math.max(1, h.prescribed) : 1,
    avgQuality: rec.quality?.avgFormScore ?? rec.quality?.steadiness ?? null,
    faults: issues.map(f => ({ key: f.key, n: f.count, of: f.of, label: f.label })),
    painPre: rec.painBefore, painPost: rec.painAfter,
  };
}

/** One record per exercise from a guided class run. `steps` is the built class (prescription source). */
export function classRecords(records, { cls, items, steps, dose, mode, results, sessionId }) {
  return items.map(e => {
    const id = e.id;
    const pSteps = steps.filter(s => s.exercise === id);
    const holdSteps = pSteps.filter(s => s.type === 'hold'), repSteps = pSteps.filter(s => s.type === 'reps' || s.type === 'teachRep');
    const holds = results.holds.filter(h => h.exercise === id), reps = results.reps.filter(r => r.exercise === id);
    const cov = results.tracking[id];
    const coverage = cov && cov.assessedMs + cov.unassessedMs > 0 ? Math.round((cov.assessedMs / (cov.assessedMs + cov.unassessedMs)) * 100) / 100 : null;
    const q = reps.flatMap(r => r.quality), stab = holds.map(h => h.stability).filter(x => x != null);
    const faults = {};
    for (const r of reps) for (const [k, n] of Object.entries(r.faults || {})) faults[k] = (faults[k] || 0) + n;
    const gates = results.gates.filter(g => g.exercise === id);
    const camera = mode !== 'no_camera';
    // The guided first rep counts as one prescribed rep; it is camera-checked step by step.
    const teach = repSteps.filter(s => s.type === 'teachRep').length;
    const teachDone = teach && !gates.some(g => g.label === 'Guided rep' && g.skipped) ? teach : 0;
    const rec = records.stamp({
      sessionId, source: 'guided_class', classId: cls.id, exerciseId: id, exerciseTitle: e.title.en, dose,
      startedAt: iso(results.startedAt), endedAt: iso(results.endedAt || Date.now()), mode,
      reps: repSteps.length ? {
        prescribed: sum(repSteps.map(s => s.n ?? 1)),
        cameraCounted: camera ? sum(reps.map(r => r.cameraCounted)) + teachDone : null,
        notCounted: camera ? sum(reps.map(r => r.notCounted)) : null,
        unassessed: camera ? Math.max(0, sum(repSteps.map(s => s.n ?? 1)) - sum(reps.map(r => r.cameraCounted)) - teachDone) : sum(repSteps.map(s => s.n ?? 1)),
        selfPaced: camera ? null : sum(reps.map(r => r.selfPaced)) + teach,
      } : null,
      holds: holdSteps.length ? {
        prescribed: holdSteps.length,
        completed: holds.filter(h => h.ended === 'complete').length,
        prescribedSeconds: sum(holdSteps.map(s => s.seconds)),
        heldSeconds: round1(sum(holds.map(h => h.heldS))),
        outOfPositionSeconds: round1(sum(holds.map(h => h.outOfPositionS))),
        notStarted: holdSteps.length - holds.length,
        verified: camera,
      } : null,
      trackingCoverage: camera ? coverage : null,
      quality: {
        avgFormScore: q.length ? Math.round(sum(q) / q.length) : null, perRep: q,
        steadiness: stab.length ? Math.round(sum(stab) / stab.length) : null,
      },
      formIssues: Object.entries(faults).map(([k, n]) => ({ key: k, label: FAULTS[k]?.label || k, count: n, of: q.length })),
      stepsNotChecked: gates.filter(g => g.reason === 'not_detected').length,
      stepsSkippedByUser: gates.filter(g => g.reason === 'skipped_by_user').length + holds.filter(h => h.ended === 'skipped_by_user').length + reps.filter(r => r.ended === 'skipped_by_user').length,
      checkins: results.answers.filter(a => a.exercise === id).map(a => ({ key: a.key, value: a.value })),
      painBefore: results.painPre, painAfter: results.painPost, difficulty: null,
      flags: results.flags.filter(f => f.exercise === id).map(f => f.type),
    });
    if (rec.checkins.some(c => c.value === 'pain')) rec.formIssues.unshift({ key: 'pain_during', label: 'Reported pain during the exercise', count: 1, of: 1 });
    return { ...rec, ...tableFields(rec), plan: `${cls.title.en} (guided)` };
  });
}

/** Record from a single-exercise session (exercise screen). */
export function exerciseRecord(records, { ex, sm, mode, painPre, painPost, effort, plan }) {
  const camera = mode !== 'no_camera';
  const isHold = ex.mode === 'balance' || ex.mode === 'strokes';
  const rec = records.stamp({
    sessionId: uuid(), source: 'single_exercise', classId: null, exerciseId: ex.id, exerciseTitle: ex.title.en, dose: null,
    startedAt: iso(sm.startedAt), endedAt: iso(sm.endedAt), mode,
    reps: isHold ? null : {
      prescribed: sm.target, cameraCounted: camera ? sm.reps : null, notCounted: camera ? sm.notCounted ?? 0 : null,
      unassessed: camera ? Math.max(0, sm.target - sm.reps) : sm.target, selfPaced: camera ? null : sm.reps,
    },
    holds: isHold ? { prescribed: sm.target, completed: sm.reps, prescribedSeconds: null, heldSeconds: null, outOfPositionSeconds: null, notStarted: Math.max(0, sm.target - sm.reps), verified: camera } : null,
    trackingCoverage: null,
    quality: { avgFormScore: isHold ? null : sm.avgQuality, perRep: sm.reps_detail?.map(r => r.q) || [], steadiness: ex.mode === 'balance' ? sm.avgQuality : null },
    formIssues: (sm.faults || []).map(f => ({ key: f.key, label: f.label, count: f.n, of: f.of })),
    stepsNotChecked: 0, stepsSkippedByUser: 0, checkins: [],
    painBefore: painPre ?? null, painAfter: painPost ?? null, difficulty: effort ?? null, flags: [],
  });
  return { ...rec, ...tableFields(rec), plan: plan || null };
}

// ---------------- export ----------------
const CSV_COLS = ['recordId', 'sessionId', 'participantId', 'deviceId', 'startedAt', 'endedAt', 'source', 'classId', 'exerciseId', 'mode', 'dose',
  'repsPrescribed', 'repsCameraCounted', 'repsNotCounted', 'repsUnassessed', 'repsSelfPaced',
  'holdsPrescribed', 'holdsCompleted', 'holdSecondsPrescribed', 'holdSecondsHeld', 'holdSecondsOutOfPosition',
  'trackingCoverage', 'avgFormScore', 'steadiness', 'stepsNotChecked', 'stepsSkippedByUser', 'painBefore', 'painAfter', 'formIssues', 'checkins', 'flags', 'appVersion', 'specVersion'];

export function toCSV(sessions) {
  const cell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = sessions.filter(s => s.schema === SCHEMA).map(s => ({
    ...s,
    repsPrescribed: s.reps?.prescribed, repsCameraCounted: s.reps?.cameraCounted, repsNotCounted: s.reps?.notCounted, repsUnassessed: s.reps?.unassessed, repsSelfPaced: s.reps?.selfPaced,
    holdsPrescribed: s.holds?.prescribed, holdsCompleted: s.holds?.completed, holdSecondsPrescribed: s.holds?.prescribedSeconds, holdSecondsHeld: s.holds?.heldSeconds, holdSecondsOutOfPosition: s.holds?.outOfPositionSeconds,
    avgFormScore: s.quality?.avgFormScore, steadiness: s.quality?.steadiness,
    formIssues: (s.formIssues || []).map(f => `${f.label} (${f.count})`).join('; '),
    checkins: (s.checkins || []).map(c => `${c.key}=${c.value}`).join('; '),
    flags: (s.flags || []).join('; '),
  }));
  return [CSV_COLS.join(','), ...rows.map(r => CSV_COLS.map(c => cell(r[c])).join(','))].join('\n');
}

/** Share (phone share sheet, e.g. WhatsApp to the physio) or download a file. */
export async function shareOrDownload(filename, text, type) {
  const blob = new Blob([text], { type });
  const file = typeof File !== 'undefined' ? new File([blob], filename, { type }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
}
