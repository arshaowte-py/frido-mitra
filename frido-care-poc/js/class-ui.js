// Frido Care · guided class screen ("press Start, the coach teaches you").
import { classById, buildClass, DOSES } from './lessons.js';
import { ClassRunner } from './lesson-runner.js';
import { createVoice } from './voice.js';
import { askCoach } from './coach.js';
import { byId, CUES, FAULTS } from './exercises.js';
import { MEDIA, embedUrl } from './media.js';
import { BONES, IDX } from './engine.js';
import { classRecords, uuid } from './records.js';

const $ = (s, el = document) => el.querySelector(s);
const ANSWER_LABEL = { yes: { en: 'Yes', hi: 'हाँ' }, no: { en: 'No', hi: 'नहीं' }, pain: { en: 'Pain', hi: 'दर्द' } };

/**
 * @param root  element to render into
 * @param id    class id
 * @param ctx   helpers from app.js: { prefs, savePrefs, esc, modal, closeModal, saveSession, store, today }
 */
export function renderClass(root, id, ctx) {
  const cls = classById(id);
  if (!cls) { root.innerHTML = '<p>Class not found.</p>'; return { destroy() {} }; }
  return new ClassController(root, cls, ctx);
}

class ClassController {
  constructor(root, cls, ctx) {
    this.root = root; this.cls = cls; this.ctx = ctx; this.p = ctx.prefs;
    this.voice = createVoice(() => this.p);
    this.dose = this.p.classDose === 'full' ? 'full' : 'quick';
    this.items = cls.items.map(byId);
    this.log = []; this.lastUi = 0; this.frames = []; this.fps = 0; this.demoOn = true; this.demoFor = null;
    this.render();
    this.onKey = e => this.key(e);
    window.addEventListener('keydown', this.onKey);
    this.onResize = () => this.fitCanvas();
    window.addEventListener('resize', this.onResize);
  }

  t(c) { return c ? (this.p.lang === 'hi' ? c.hi || c.en : c.en) : ''; }

  destroy() {
    this.running = false; cancelAnimationFrame(this.raf); clearInterval(this.timer);
    this.stream?.getTracks().forEach(tr => tr.stop());
    if (this.video?.src?.startsWith('blob:')) URL.revokeObjectURL(this.video.src);
    this.voice.stop(); this.voice.abortListen();
    this.wake?.release?.().catch(() => {});
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
  }

  // ---------------- layout ----------------
  render() {
    const { esc } = this.ctx, cls = this.cls;
    this.root.innerHTML = `
    <section class="ex cls">
      <div class="ex-head">
        <a class="back" href="#/">← Plans &amp; library</a>
        <div class="title-row">
          <div><p class="eyebrow">Guided class</p><h1>${esc(cls.title.en.replace(/ class$/i, ''))} <span class="lt">class</span></h1><p class="hi" lang="hi">${esc(cls.title.hi)}</p></div>
          <ol class="cls-ex" id="clsEx">${this.items.map((e, i) => `<li data-i="${i}"><span class="n">${i + 1}</span>${esc(e.title.en)}</li>`).join('')}</ol>
        </div>
        <div class="cls-bar" aria-hidden="true"><i id="clsBar"></i></div>
      </div>
      <div class="ex-grid">
        <div class="stage-col">
          <div class="stage cls-stage ${this.p.stick ? 'stick' : ''}" id="stage">
            <video id="vid" playsinline muted></video>
            <canvas id="ov"></canvas>
            <div class="demo-pip" id="demo" hidden></div>
            <div class="stage-bar" id="sbar"></div>
            <div class="gate-chip" id="gateChip" hidden></div>
            <div class="caption" id="caption" hidden><span class="cue-chip" id="cueChip" hidden></span><p id="capText"></p></div>
            <div class="stage-ovl" id="ovl"></div>
          </div>
          <p class="muted small kbd-hint">Shortcuts: <kbd>Space</kbd> ask the coach · <kbd>N</kbd> next · <kbd>R</kbd> repeat · <kbd>P</kbd> pause · <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> yes/no/pain</p>
        </div>
        <aside class="panel cls-panel">
          <div class="pn-top"><span class="eyebrow" id="nowEx">Ready</span><span class="phase" id="phase">Not started</span></div>
          <div id="nowStep" class="now-step"></div>
          <div id="widget" class="widget"></div>
          <div id="answers" class="answers"></div>
          <div class="coach">
            <div class="coach-row">
              <button type="button" class="mic" id="mic" aria-label="Ask the coach a question"><span class="mic-dot" aria-hidden="true"></span><span id="micLabel">Ask the coach</span></button>
              <form id="askForm" class="ask-form"><input id="askInput" type="text" placeholder="…or type a question" aria-label="Type a question for the coach" autocomplete="off"><button class="btn ghost small-btn" type="submit">Ask</button></form>
            </div>
            <p class="heard" id="heard" hidden></p>
            <ul class="coach-log" id="coachLog"></ul>
          </div>
          <div class="pn-actions">
            <button class="btn ghost" id="bPause" type="button">Pause</button>
            <button class="btn ghost" id="bRepeat" type="button">Repeat</button>
            <button class="btn" id="bNext" type="button">Next step</button>
          </div>
        </aside>
      </div>
    </section>`;
    this.video = $('#vid', this.root); this.canvas = $('#ov', this.root); this.ctx2d = this.canvas.getContext('2d');
    this.stage = $('#stage', this.root); this.ovl = $('#ovl', this.root);
    $('#mic', this.root).onclick = () => this.ask();
    $('#askForm', this.root).onsubmit = e => { e.preventDefault(); const q = $('#askInput', this.root).value.trim(); if (q) { $('#askInput', this.root).value = ''; this.askText(q); } };
    $('#bPause', this.root).onclick = () => this.runner && (this.runner.paused ? this.runner.resume() : this.runner.pause());
    $('#bRepeat', this.root).onclick = () => this.runner?.command('repeat');
    $('#bNext', this.root).onclick = () => this.runner?.command('next');
    this.startCard();
  }

  startCard() {
    const { esc } = this.ctx, cls = this.cls;
    const listenNote = this.voice.supported.listen ? 'Answer the coach by voice or by tapping.' : 'Voice answers need Chrome, Edge or Safari. You can tap your answers instead.';
    this.ovl.hidden = false; this.ovl.className = 'stage-ovl';
    this.ovl.innerHTML = `<div class="ovl-card">
      <p class="eyebrow">Guided class</p>
      <h2>${esc(cls.title.en)}</h2>
      <p>${esc(cls.summary)}</p>
      <ol class="cls-list">${this.items.map(e => `<li><b>${esc(e.title.en)}</b> <span class="muted">· ${e.tier === 'tracked' ? 'camera checks your form' : 'guided'}</span></li>`).join('')}</ol>
      <div class="seg dose" role="group" aria-label="Class length">
        ${Object.entries(DOSES).map(([k, d]) => `<button type="button" data-dose="${k}" aria-pressed="${this.dose === k}">${d.label} · ${cls.minutes[k]} min</button>`).join('')}
      </div>
      <p class="setup-tip"><b>Set up:</b> prop the phone at about waist height, 2–3 m away, with a chair in view. You will sit, then stand. Turn the volume up.</p>
      <p class="privacy">Video stays on this device. Nothing is recorded or sent.</p>
      <div class="ovl-actions">
        <button class="btn yellow" id="bCam" type="button">Start class</button>
        <label class="btn ghost file">Use a video file<input type="file" id="bFile" accept="video/*"></label>
        <button class="btn ghost" id="bNone" type="button">Start without camera</button>
      </div>
      <p class="muted small">${listenNote}</p>
    </div>`;
    this.ovl.querySelectorAll('[data-dose]').forEach(b => b.onclick = () => {
      this.dose = b.dataset.dose; this.p.classDose = this.dose; this.ctx.savePrefs();
      this.ovl.querySelectorAll('[data-dose]').forEach(x => x.setAttribute('aria-pressed', x === b));
    });
    $('#bCam', this.ovl).onclick = () => this.precheck(() => this.startCamera());
    $('#bFile', this.ovl).onchange = e => { const f = e.target.files[0]; if (f) this.precheck(() => this.startFile(f)); };
    $('#bNone', this.ovl).onclick = () => this.precheck(() => this.begin(true));
  }

  /** Once-a-day red-flag questions (brief §5.2). Pain is asked by the coach inside the class. */
  precheck(next) {
    const { store, today, modal, closeModal, saveSession, records } = this.ctx;
    if (!records.trial()) return this.ctx.ensureConsent(() => this.precheck(next));
    // unlock speech on this user gesture
    if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); }
    if (store.get('fc_checkin_v1', {}).date === today()) return next();
    const flags = [['numb', 'New numbness or tingling'], ['sharp', 'Sharp or shooting pain'], ['swell', 'New swelling'], ['fall', 'A fall since your last session'], ['chest', 'Chest pain or breathlessness']];
    const m = modal(`<h2>Before you start</h2><p class="muted">Once a day. ${records.canSave() ? 'Saved in your session record for your physio.' : 'Not saved.'}</p>
      <fieldset><legend>Since your last session, have you had…</legend>
      ${flags.map(([k, t]) => `<div class="yn"><span>${t}</span><span class="seg"><button type="button" data-f="${k}" data-v="0" aria-pressed="true">No</button><button type="button" data-f="${k}" data-v="1" aria-pressed="false">Yes</button></span></div>`).join('')}
      </fieldset><div class="modal-actions"><button class="btn" id="mGo">Continue</button></div>`);
    const ans = {};
    m.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { ans[b.dataset.f] = b.dataset.v === '1'; m.querySelectorAll(`[data-f="${b.dataset.f}"]`).forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('#mGo', m).onclick = () => {
      const red = Object.entries(ans).filter(([, v]) => v).map(([k]) => k);
      if (red.length) {
        saveSession({ id: crypto.randomUUID?.() || String(Date.now()), type: 'red_flag', flags: red, at: Date.now(), exercise: this.cls.id, title: this.cls.title.en });
        m.innerHTML = `<h2>Please contact your physio before continuing</h2><p>You answered yes to: ${red.map(k => flags.find(f => f[0] === k)[1].toLowerCase()).join(', ')}. Please call or message your physio now. The app does not contact your physio by itself.</p><div class="modal-actions"><button class="btn" id="mClose">OK</button></div>`;
        $('#mClose', m).onclick = () => { closeModal(); location.hash = '#/'; };
        return;
      }
      store.set('fc_checkin_v1', { date: today(), pain: null });
      closeModal(); next();
    };
  }

  // ---------------- camera ----------------
  async startCamera() {
    this.loading('Starting camera…');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.p.facing || 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) { return this.cameraError(`Allow camera access, or start without camera. (${e.name || e.message})`); }
    this.video.srcObject = this.stream; this.mirror = (this.p.facing || 'user') === 'user'; this.isCam = true;
    await this.video.play().catch(() => {});
    try { this.wake = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
    this.startTracking();
  }
  async startFile(file) {
    this.loading('Loading video…');
    this.video.srcObject = null; this.video.src = URL.createObjectURL(file); this.video.loop = true; this.mirror = false; this.isCam = false;
    await this.video.play().catch(() => {});
    this.startTracking();
  }
  async startTracking() {
    this.loading('Loading the motion model on this device…');
    try {
      const { loadLandmarker, defaultModel, pickPerson } = await import('./pose.js');
      this.pickPerson = pickPerson;
      this.det = await loadLandmarker(this.p.model === 'auto' || !this.p.model ? defaultModel() : this.p.model);
    } catch (e) { console.error(e); return this.cameraError('The motion model could not load on this browser. Try Chrome, or start without camera.'); }
    await new Promise(r => (this.video.readyState >= 2 ? r() : this.video.addEventListener('loadeddata', r, { once: true })));
    this.stage.classList.add('running');
    this.fitCanvas();
    this.begin(false);
  }
  loading(msg) { this.ovl.hidden = false; this.ovl.innerHTML = `<div class="ovl-card compact center"><div class="spinner" aria-hidden="true"></div><p>${this.ctx.esc(msg)}</p></div>`; }
  cameraError(msg) {
    this.ovl.hidden = false;
    this.ovl.innerHTML = `<div class="ovl-card"><h2>Camera unavailable</h2><p>${this.ctx.esc(msg)}</p><div class="ovl-actions"><button class="btn" id="bNone2">Start without camera</button></div></div>`;
    $('#bNone2', this.ovl).onclick = () => this.begin(true);
  }
  fitCanvas() {
    const vw = this.video.videoWidth || 16, vh = this.video.videoHeight || 9;
    this.stage.style.setProperty('--ar', vw / vh);
    const r = this.stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.video.classList.toggle('mirror', !!this.mirror);
  }

  // ---------------- class ----------------
  begin(noCamera) {
    this.noCamera = noCamera;
    if (noCamera) this.stage.classList.add('running', 'guided');
    this.ovl.hidden = true;
    const titles = Object.fromEntries(this.items.map(e => [e.id, e.title]));
    const steps = buildClass(this.cls, this.dose, titles);
    this.runner = new ClassRunner(steps, {
      say: (c, kind) => this.voice.say(c, kind),
      isSpeaking: () => this.voice.isSpeaking(),
      stopSpeaking: () => this.voice.stop(),
      readMs: c => this.voice.readMs(c),
      listen: what => this.autoListen(what),
      onDone: res => setTimeout(() => this.finish(res), 600),
      onChange: () => this.ui(true),
    }, { noCamera });
    this.startedAt = Date.now(); this.sessionId = uuid(); this.steps = steps;
    this.runner.start(performance.now());
    this.running = true;
    if (noCamera) this.timer = setInterval(() => { this.runner.tick(null, null, performance.now()); this.ui(); }, 100);
    else this.loop();
  }

  loop() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(() => this.loop());
    const v = this.video;
    if (v.readyState < 2 || v.paused) return;
    if (!this.isCam && v.currentTime === this.lastVT) { this.runner.tick(this.lastRaw, this.env, performance.now()); return; }
    this.lastVT = v.currentTime;
    const t = performance.now();
    let res;
    try { res = this.det.lm.detectForVideo(v, t); } catch (e) { console.warn(e); return; }
    this.frames.push(t); while (this.frames.length && t - this.frames[0] > 1000) this.frames.shift();
    this.fps = this.frames.length;
    const { person, people } = this.pickPerson(res.landmarks);
    this.lastRaw = person; this.env = { aspect: v.videoWidth / v.videoHeight, people };
    this.runner.tick(person, this.env, t);
    this.draw();
    this.ui();
  }

  draw() {
    const { ctx2d: c, canvas } = this, W = canvas.width, H = canvas.height, p = this.runner.pose;
    c.clearRect(0, 0, W, H);
    if (!p) return;
    const aspect = this.video.videoWidth / this.video.videoHeight;
    const X = pt => { const x = (pt.x / aspect) * W; return this.mirror ? W - x : x; }, Y = pt => pt.y * H;
    const css = getComputedStyle(document.documentElement);
    const v = this.runner.view();
    const bad = !!v.hold?.lost;
    const ok = v.gate?.ok || (v.hold && !v.hold.lost);
    c.lineCap = 'round';
    const lw = Math.max(3, W / 150);
    c.strokeStyle = bad ? css.getPropertyValue('--coral').trim() : ok ? css.getPropertyValue('--mint').trim() : css.getPropertyValue('--sk-active').trim();
    c.lineWidth = lw;
    for (const [a, b] of BONES) {
      const pa = p.lm[IDX[a]], pb = p.lm[IDX[b]];
      if (!pa || !pb || pa.v < 0.3 || pb.v < 0.3) continue;
      c.beginPath(); c.moveTo(X(pa), Y(pa)); c.lineTo(X(pb), Y(pb)); c.stroke();
    }
    c.fillStyle = '#fff';
    for (const name of Object.keys(IDX)) {
      const q = p.lm[IDX[name]]; if (!q || q.v < 0.3 || /ear|nose|index|pinky/.test(name)) continue;
      c.beginPath(); c.arc(X(q), Y(q), lw * 1.1, 0, Math.PI * 2); c.fill();
    }
  }

  // ---------------- panel + captions ----------------
  ui(force) {
    const now = performance.now();
    if (!force && now - this.lastUi < 100) return;
    this.lastUi = now;
    const r = this.runner; if (!r) return;
    const v = r.view(), { esc } = this.ctx;

    // exercise pills + progress
    this.root.querySelectorAll('#clsEx li').forEach(li => {
      const i = +li.dataset.i;
      li.className = v.done || i < v.exIdx ? 'done' : i === v.exIdx ? 'on' : '';
    });
    $('#clsBar', this.root).style.width = `${Math.round((v.done ? 1 : v.progress) * 100)}%`;

    // demo picture-in-picture
    this.demo(v);

    // stage bar
    $('#sbar', this.root).innerHTML = `${this.noCamera ? '<span class="pill">No camera · timer guided</span>' : `<span class="pill live">● On-device</span><span class="pill">${this.fps} fps</span>`}
      ${MEDIA[v.exercise] ? `<button type="button" class="pill btnp" id="demoT" aria-pressed="${this.demoOn}">${this.demoOn ? 'Hide demo' : 'Show demo'}</button>` : ''}
      ${this.noCamera ? '' : `<button type="button" class="pill btnp" id="stickT" aria-pressed="${this.p.stick}">${this.p.stick ? 'Stick figure' : 'Camera view'}</button>`}`;
    const dt = $('#demoT', this.root); if (dt) dt.onclick = () => { this.demoOn = !this.demoOn; this.demoFor = null; this.ui(true); };
    const sk = $('#stickT', this.root); if (sk) sk.onclick = () => { this.p.stick = !this.p.stick; this.ctx.savePrefs(); this.stage.classList.toggle('stick', this.p.stick); this.ui(true); };

    // gate status on stage
    const gc = $('#gateChip', this.root);
    if (v.gate && !this.noCamera) { gc.hidden = false; gc.className = `gate-chip ${v.gate.ok ? 'ok' : ''}`; gc.textContent = `${v.gate.ok ? '✓' : 'Waiting for'} ${v.gate.label}`; }
    else gc.hidden = true;

    // caption + cue
    const cap = $('#caption', this.root);
    cap.hidden = !v.caption && !v.done;
    $('#capText', this.root).textContent = v.paused ? (this.p.lang === 'hi' ? 'रुका हुआ है' : 'Paused') : this.t(v.caption);
    const chip = $('#cueChip', this.root);
    const cueFresh = v.cue && (r.lastT ?? 0) - v.cue.t < 4500;
    chip.hidden = !cueFresh;
    if (cueFresh) { chip.className = `cue-chip ${v.cue.kind}`; chip.textContent = this.t(v.cue.text); }

    // header + step
    const ex = this.items[v.exIdx];
    $('#nowEx', this.root).textContent = v.done ? 'Class complete' : ex ? `Exercise ${v.exIdx + 1} of ${this.items.length} · ${ex.title.en}` : v.exIdx < 0 ? 'Welcome' : 'Wrapping up';
    const ph = $('#phase', this.root);
    ph.textContent = v.paused ? 'Paused' : v.done ? 'Done' : this.listening ? 'Listening' : { demo: 'Watch', gate: 'Get into position', checkin: 'Question', hold: 'Hold', teachRep: 'Learn the move', reps: 'Your turn', rest: 'Rest', pain: 'Question', calibrate: 'Hold still', say: 'Coach' }[v.type] || 'Coach';
    ph.className = `phase ${v.paused ? 'rest' : 'active'}`;
    $('#nowStep', this.root).innerHTML = v.stepNo ? `<span class="muted small">Step ${v.stepNo} of ${v.stepsTotal}</span>${v.label ? `<b>${esc(v.label)}</b>` : ''}` : '';
    $('#bPause', this.root).textContent = v.paused ? 'Resume' : 'Pause';

    this.widget(v);
    this.answers(v);
  }

  widget(v) {
    const w = $('#widget', this.root);
    let html = '';
    if (v.hold) {
      const frac = Math.min(1, v.hold.elapsed / v.hold.total), left = Math.max(0, Math.ceil(v.hold.total - v.hold.elapsed));
      const C = 2 * Math.PI * 52;
      html = `<div class="ring ${v.hold.lost ? 'lost' : ''}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="track"/><circle cx="60" cy="60" r="52" class="fill" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - frac)}"/></svg>
        <div class="ring-in"><span class="big">${left}</span><span class="muted small">seconds</span></div></div>
        <p class="ring-note">${v.hold.lost ? 'Timer paused: get back into position' : 'Hold steady'}${v.hold.stability != null ? ` · steadiness ${v.hold.stability}/100` : ''}</p>`;
    } else if (v.reps) {
      html = `<div class="counter ${v.reps.count >= v.reps.n ? 'done' : ''}"><span class="c-num">${v.reps.count}<small>/${v.reps.n}</small></span><span class="c-lab">Heel raises</span></div>
        ${v.reps.quality.length ? `<div class="qbars">${v.reps.quality.slice(-10).map(q => `<span class="qb ${q >= 80 ? 'good' : q >= 60 ? 'mid' : 'low'}" style="--h:${Math.max(8, q)}%"><i>${q}</i></span>`).join('')}</div>` : '<p class="muted small">Form score appears after each rep.</p>'}`;
    } else if (v.teach) {
      const ph = v.teach.phase;
      html = `<ol class="teach">${['up', 'hold', 'down'].map(k => `<li class="${ph === k ? 'on' : (['up', 'hold', 'down', 'finish'].indexOf(ph) > ['up', 'hold', 'down'].indexOf(k) ? 'done' : '')}">${{ up: 'Rise up', hold: 'Hold', down: 'Lower' }[k]}</li>`).join('')}</ol>
        ${v.teach.progress != null ? `<div class="g-track"><i style="width:${Math.round(Math.max(0, Math.min(1, v.teach.progress)) * 100)}%"></i></div><p class="muted small">Heel lift</p>` : ''}`;
    } else if (v.rest) {
      html = `<div class="counter"><span class="c-num">${v.rest.remaining}<small>s</small></span><span class="c-lab">Rest</span></div>`;
    } else if (v.done) {
      html = '<p>Class complete.</p>';
    }
    if (w.innerHTML !== html) w.innerHTML = html;
  }

  answers(v) {
    const a = $('#answers', this.root);
    const key = v.awaiting ? `${v.awaiting}:${this.runner.i}:${this.p.lang}` : '';
    if (key === this.answersKey) return;
    this.answersKey = key;
    if (v.awaiting === 'checkin') {
      a.innerHTML = `<p class="muted small">Answer by voice or tap:</p><div class="ans-row">${['yes', 'no', 'pain'].map(k => `<button type="button" class="ans ${k}" data-a="${k}">${this.t(ANSWER_LABEL[k])}</button>`).join('')}</div>`;
      a.querySelectorAll('[data-a]').forEach(b => b.onclick = () => this.runner.answer(b.dataset.a));
    } else if (v.awaiting === 'pain') {
      a.innerHTML = `<p class="muted small">Pain from 0 (none) to 10 (worst):</p><div class="scale">${Array.from({ length: 11 }, (_, n) => `<button type="button" data-p="${n}">${n}</button>`).join('')}</div>`;
      a.querySelectorAll('[data-p]').forEach(b => b.onclick = () => this.runner.answer(+b.dataset.p));
    } else a.innerHTML = '';
  }

  demo(v) {
    const d = $('#demo', this.root), m = MEDIA[v.exercise];
    const want = m && this.demoOn && !v.done ? `${m.videoId}` : null;
    d.classList.toggle('big', !!v.demoBig);
    if (want !== this.demoFor) {
      this.demoFor = want;
      d.hidden = !want;
      d.innerHTML = want ? `<iframe src="${embedUrl(m.videoId)}&autoplay=1&mute=1&loop=1&playlist=${m.videoId}&controls=0" title="Demonstration: ${this.ctx.esc(m.title)}" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe><span class="demo-tag">Demo</span>` : '';
    }
  }

  // ---------------- voice: answers, commands, questions ----------------
  async autoListen(what) {
    if (!this.voice.supported.listen || this.asking || !this.p.voice) return;
    this.listening = true; this.setMic('listening', what === 'pain' ? 'Listening for a number…' : 'Listening for your answer…');
    const text = await this.voice.listen({ timeoutMs: 6000, onInterim: t => this.heard(t) });
    this.listening = false; this.setMic('idle');
    if (!text || !this.runner || this.runner.done) return;
    const res = this.runner.voice(text);
    if (res.question) this.heard(`Heard “${text}”. Tap an answer, or press the mic to ask a question.`);
  }

  async ask() {
    if (this.asking || !this.runner) return;
    if (!this.voice.supported.listen) { $('#askInput', this.root).focus(); this.heard('Voice questions need Chrome, Edge or Safari. Type your question instead.'); return; }
    this.asking = true;
    this.voice.stop(); this.voice.abortListen(); this.runner.hold(true);
    this.setMic('listening', 'Listening…');
    const text = await this.voice.listen({ timeoutMs: 7000, onInterim: t => this.heard(t) });
    this.setMic('idle');
    if (!text) { this.heard("I didn't catch that. Tap the mic and try again."); this.asking = false; this.runner.hold(false); return; }
    await this.handleSpoken(text);
  }
  async askText(q) {
    if (this.asking || !this.runner) return;
    this.asking = true; this.voice.stop(); this.runner.hold(true);
    await this.handleSpoken(q);
  }
  async handleSpoken(text) {
    this.heard(`“${text}”`);
    const r = this.runner.voice(text);
    if (r.question) {
      this.setMic('thinking', 'Thinking…');
      const res = await askCoach(text, this.coachContext(), this.p.lang);
      this.setMic('idle');
      const entry = { q: text, a: this.t(res.answer), source: res.source, flagged: !!res.flagged };
      this.log.unshift(entry); this.renderLog();
      this.runner.logQuestion({ q: text, a: res.answer.en, source: res.source, flagged: !!res.flagged, stop: !!res.stop });
      this.voice.say(res.answer, 'answer');
      if (res.stop) { this.runner.pause(); this.runner.results.flags.push({ type: 'red_flag_question', q: text, at: Date.now() }); }
      await this.untilQuiet();
    }
    this.asking = false;
    this.runner.hold(false);
  }
  untilQuiet() {
    return new Promise(res => { const tick = () => (this.voice.isSpeaking() ? setTimeout(tick, 200) : res()); setTimeout(tick, 300); });
  }
  heard(t) { const h = $('#heard', this.root); h.hidden = !t; h.textContent = t; }
  setMic(state, label) {
    const m = $('#mic', this.root); m.dataset.state = state;
    $('#micLabel', this.root).textContent = label || 'Ask the coach';
  }
  renderLog() {
    const { esc } = this.ctx;
    $('#coachLog', this.root).innerHTML = this.log.slice(0, 4).map(e => `<li><p class="q">${esc(e.q)}</p><p class="a">${esc(e.a)}</p>
      <p class="log-src">${e.source === 'ai' ? 'AI coach' : e.source === 'on-device' ? 'Coach (on device)' : 'Saved for your physio'}${e.flagged ? ' · flagged for your physio' : ''}</p></li>`).join('');
  }

  /** Live context for the coach: numbers and text only. */
  coachContext() {
    const r = this.runner, v = r.view(), s = r.step, ex = s?.exercise ? byId(s.exercise) : null;
    const faults = r.st?.tr?.faultsNow?.length ? r.st.tr.faultsNow : (r.st?.tr?.reps?.slice(-1)[0]?.failed || []);
    const lastFaults = faults.filter(f => FAULTS[f]).map(f => CUES[FAULTS[f].cue]);
    let measure = null;
    if (ex && r.pose && !this.noCamera) {
      const m = r.metric(ex.id, r.pose);
      if (m && ex.fmt) measure = `${ex.label} ${ex.fmt(m.v)}`;
    }
    return {
      class: this.cls.title.en, dose: DOSES[this.dose].label,
      exercise: ex?.title.en || null, purpose: ex?.purpose || null, exerciseSteps: ex?.steps || null,
      instruction: v.caption || null, currentInstruction: v.caption?.en || null, stepType: v.type, stepLabel: v.label || null,
      waitingFor: v.gate && !v.gate.ok ? v.gate.label : null,
      positionLost: !!v.hold?.lost, hold: v.hold ? { elapsed: +v.hold.elapsed.toFixed(1), total: v.hold.total } : null,
      reps: v.reps ? { count: v.reps.count, n: v.reps.n, lastQuality: v.reps.quality.slice(-1)[0] ?? null } : null,
      lastFaults, measure, exercisesLeft: Math.max(0, this.items.length - 1 - v.exIdx),
      painBefore: r.results.painPre, cameraTracking: !this.noCamera,
    };
  }

  key(e) {
    if (e.target.closest?.('input, textarea') || document.getElementById('modal')) return;
    const r = this.runner; if (!r) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); this.ask(); }
    else if (k === 'n') r.command('next');
    else if (k === 'r') r.command('repeat');
    else if (k === 'p') r.paused ? r.resume() : r.pause();
    else if (r.awaiting() === 'checkin' && ['1', '2', '3'].includes(k)) r.answer(['yes', 'no', 'pain'][+k - 1]);
    else if (r.awaiting() === 'pain' && /^\d$/.test(k)) r.answer(+k);
  }

  // ---------------- summary + save for the physio ----------------
  finish(res) {
    if (this.finished) return; this.finished = true;
    this.running = false; clearInterval(this.timer);
    this.stream?.getTracks().forEach(tr => tr.stop()); this.video.pause?.();
    const { esc, modal, saveSession, store } = this.ctx;
    const rows = this.items.map(e => {
      const holds = res.holds.filter(h => h.exercise === e.id), reps = res.reps.filter(x => x.exercise === e.id);
      const q = reps.flatMap(x => x.quality), stab = holds.map(h => h.stability).filter(x => x != null);
      const faults = {};
      for (const x of reps) for (const [k, n] of Object.entries(x.faults)) faults[k] = (faults[k] || 0) + n;
      const checkin = res.answers.filter(x => x.exercise === e.id).map(x => x.value);
      return { e, holds, reps, q, stab, faults, checkin,
        done: holds.length ? holds.filter(h => !h.partial).length : reps.reduce((a, x) => a + x.done, 0),
        target: holds.length ? holds.length : reps.reduce((a, x) => a + x.target, 0),
        avgQ: q.length ? Math.round(q.reduce((a, b) => a + b, 0) / q.length) : stab.length ? Math.round(stab.reduce((a, b) => a + b, 0) / stab.length) : null };
    });
    const minutes = Math.max(1, Math.round((Date.now() - this.startedAt) / 60000));
    const saved = this.ctx.records.canSave();
    const m = modal(`<p class="eyebrow">Class complete · ${minutes} min</p><h2>${esc(this.cls.title.en)}</h2>
      <div class="stats">
        <div><span class="k">Pain before</span><span class="v">${res.painPre ?? '–'}</span></div>
        <div><span class="k">Pain after</span><span class="v">${res.painPost ?? '–'}</span></div>
        <div><span class="k">Questions</span><span class="v">${res.questions.length}</span></div>
        <div><span class="k">Steps skipped</span><span class="v">${res.gates.filter(g => g.skipped).length}</span></div>
      </div>
      <ul class="cls-sum">${rows.map(r => `<li><b>${esc(r.e.title.en)}</b>
        <span>${r.holds.length ? `${r.done}/${r.target} holds · avg ${(r.holds.reduce((a, h) => a + h.heldS, 0) / r.holds.length).toFixed(0)} s` : `${r.done}/${r.target} reps`}${r.avgQ != null ? ` · ${r.stab.length && !r.q.length ? 'steadiness' : 'form'} ${r.avgQ}` : ''}${r.checkin.length ? ` · stretch felt: ${r.checkin.join(', ')}` : ''}</span>
        ${Object.keys(r.faults).length ? `<span class="muted small">Work on: ${Object.entries(r.faults).map(([k, n]) => `${FAULTS[k]?.label || k} (${n})`).join(', ')}</span>` : ''}</li>`).join('')}</ul>
      ${saved ? '' : '<p class="muted small">Results are not saved: you chose not to save results on this device.</p>'}
      <div class="modal-actions"><a class="btn ghost" href="#/" id="mHome">${saved ? 'Save &amp; finish' : 'Finish'}</a><a class="btn" href="#/physio" id="mPhys">${saved ? 'Save &amp; see physio view' : 'Physio view'}</a></div>`);
    const save = () => {
      const mode = this.noCamera ? 'no_camera' : this.isCam ? 'camera' : 'video_file';
      for (const rec of classRecords(this.ctx.records, { cls: this.cls, items: this.items, steps: this.steps, dose: this.dose, mode, results: res, sessionId: this.sessionId })) saveSession(rec);
      if (saved && res.questions.length) {
        const qs = store.get('fc_questions_v1', []);
        store.set('fc_questions_v1', [...res.questions.map(q => ({ ...q, class: this.cls.title.en, sessionId: this.sessionId, participantId: this.ctx.records.trial()?.participantId || null })), ...qs].slice(0, 200));
      }
      this.ctx.closeModal();
    };
    m.querySelectorAll('.modal-actions a').forEach(a => a.addEventListener('click', save));
  }
}
