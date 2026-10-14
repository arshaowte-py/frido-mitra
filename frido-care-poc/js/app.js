// Frido Care · Exercise Coach POC — UI shell (hash router, vanilla JS)
import { EXERCISES, PLANS, CONDITIONS, CUES, FAULTS, byId } from './exercises.js';
import { Session } from './session.js';
import { CONFIG } from './config.js';
import { BONES, IDX } from './engine.js';
import { MEDIA, thumbUrl, embedUrl, watchUrl } from './media.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');

// ---------------- prefs & storage (browser-local for the POC) ----------------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const prefs = Object.assign({ lang: 'en', voice: true, stick: false, model: 'auto', facing: 'user' }, store.get('fc_prefs_v1', {}));
const savePrefs = () => store.set('fc_prefs_v1', prefs);
const sessionsDb = () => store.get('fc_sessions_v1', []);
const saveSession = s => { const all = sessionsDb(); all.unshift(s); store.set('fc_sessions_v1', all.slice(0, 200)); };
const today = () => new Date().toISOString().slice(0, 10);

// ---------------- voice ----------------
const synth = window.speechSynthesis;
let voices = [];
const loadVoices = () => { voices = synth ? synth.getVoices() : []; };
if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }
const pickVoice = lang => lang === 'hi' ? voices.find(v => /^hi/i.test(v.lang))
  : voices.find(v => /en[-_]IN/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang));
function speak(c, kind) {
  if (c == null || !prefs.voice || !synth) return;
  let lang = prefs.lang, text = typeof c === 'number' ? String(c) : lang === 'hi' ? c.hi : c.en;
  let v = pickVoice(lang);
  if (lang === 'hi' && !v) { v = pickVoice('en'); if (typeof c !== 'number') text = c.en; }
  if (kind === 'count' || kind === 'phase') synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
  u.rate = 1.02;
  synth.speak(u);
}
const tr = c => (c ? (prefs.lang === 'hi' ? c.hi || c.en : c.en) : '');

// ---------------- header ----------------
function renderHeader() {
  const route = location.hash || '#/';
  $('#nav').innerHTML = `
    <a href="#/" class="${route === '#/' ? 'on' : ''}">Plans &amp; library</a>
    <a href="#/physio" class="${route.startsWith('#/physio') ? 'on' : ''}">Physio view</a>`;
  $('#tools').innerHTML = `
    <div class="seg" role="group" aria-label="Voice language">
      <button type="button" data-lang="en" aria-pressed="${prefs.lang === 'en'}">EN</button>
      <button type="button" data-lang="hi" aria-pressed="${prefs.lang === 'hi'}">हिं</button>
    </div>
    <button type="button" class="icon-btn" id="voiceBtn" aria-pressed="${prefs.voice}" title="Voice cues">${prefs.voice ? 'Voice on' : 'Voice off'}</button>`;
  $('#tools').querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { prefs.lang = b.dataset.lang; savePrefs(); renderHeader(); refreshStatic(); });
  $('#voiceBtn').onclick = () => { prefs.voice = !prefs.voice; savePrefs(); if (!prefs.voice) synth?.cancel(); renderHeader(); };
}
let refreshStatic = () => {};

// ---------------- router ----------------
let active = null; // running exercise controller
window.addEventListener('hashchange', route);
function route() {
  active?.destroy(); active = null;
  renderHeader();
  const parts = (location.hash || '#/').slice(2).split('/');
  if (parts[0] === 'ex' && byId(parts[1])) return renderExercise(byId(parts[1]), parts[2] === 'plan' ? { planId: parts[3], idx: +parts[4] } : null);
  if (parts[0] === 'physio') return renderPhysio();
  renderHome(parts[0] === 'c' ? parts[1] : null);
}

// ---------------- home ----------------
function tierBadge(ex) {
  return ex.tier === 'tracked' ? '<span class="badge track">Camera tracked</span>' : '<span class="badge guided">Guided</span>';
}
function dosageText(ex) {
  const d = ex.dosage;
  const unit = ex.mode === 'strokes' ? `${d.holdS} s rolling` : ex.mode === 'balance' ? `${d.reps} × ${d.holdS} s hold` : `${d.reps} reps${ex.holdS || d.holdS ? ` · hold ${ex.holdS || d.holdS} s` : ''}`;
  const sets = ex.mode === 'balance' ? '' : `${d.sets} × `;
  return `${sets}${unit}${d.perSide ? ' · each side' : ''}`;
}
function renderHome(filter) {
  refreshStatic = () => renderHome(filter);
  const tracked = EXERCISES.filter(e => e.tier === 'tracked').length;
  const list = EXERCISES.filter(e => !filter || e.conditions.includes(filter));
  app.innerHTML = `
  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Frido Care · Exercise Coach</p>
      <h1>Your home exercises, <span class="lt">done right.</span></h1>
      <p class="lede">Your Frido physio prescribes the plan. Prop up your phone and move: the coach counts reps, measures depth, stretch and hold time, and gives short voice cues in English or Hindi. Your physio sees how it went.</p>
      <ul class="facts">
        <li><b>${tracked}</b> camera-tracked exercises</li>
        <li><b>${EXERCISES.length - tracked}</b> guided with voice timer</li>
        <li><b>0</b> frames uploaded: video stays on the phone</li>
      </ul>
    </div>
    <div class="hero-demo" aria-hidden="true">${heroFigure()}</div>
  </section>

  <section class="block">
    <div class="block-head"><p class="eyebrow">What is Frido Care</p><h2>Physio care <span class="lt">that continues at home</span></h2></div>
    <div class="about">
      <div><span class="n">1</span><h3>See a Frido physio</h3><p>Patients are connected with Frido partner physiotherapists, in clinic or online.</p></div>
      <div><span class="n">2</span><h3>Get a plan</h3><p>The physio prescribes exercises and, where useful, Frido products, all in one place in the app.</p></div>
      <div><span class="n">3</span><h3>Exercise with a coach</h3><p>Video guidance, a timer, voice counting and, for tracked exercises, live form feedback from the phone camera.</p></div>
      <div><span class="n">4</span><h3>Physio follows up</h3><p>Pain, adherence and form scores go back to the physio, who adjusts the plan and books the next visit.</p></div>
    </div>
  </section>

  <section class="block">
    <div class="block-head"><h2>Condition plans</h2><p class="muted">Start a plan to run its exercises in order, the way a patient would at home.</p></div>
    <div class="plans">
      ${PLANS.map(pl => {
        const c = CONDITIONS.find(x => x.id === pl.condition);
        const items = pl.items.map(byId);
        return `<article class="plan">
          <div class="plan-top"><span class="cond">${esc(c.en)}</span><span class="src ${pl.source.startsWith('Draft') ? 'draft' : ''}">${pl.source.startsWith('Draft') ? 'Draft' : 'Frido protocol'}</span></div>
          <h3>${esc(pl.en)}</h3>
          <ol>${items.map(e => `<li><span class="dot ${e.tier}"></span>${esc(e.title.en)}</li>`).join('')}</ol>
          <div class="row"><span class="muted small">${items.length} exercises · ${items.filter(e => e.tier === 'tracked').length} tracked</span><a class="btn" href="#/ex/${items[0].id}/plan/${pl.id}/0">Start plan</a></div>
          ${c.assortment ? `<div class="assort"><span class="lab">Frido products often paired:</span>${c.assortment.map(a => `<span>${esc(a)}</span>`).join('')}</div>` : ''}
        </article>`;
      }).join('')}
    </div>
    <p class="legend"><span class="dot tracked"></span>Camera tracked <span class="dot guided"></span>Guided (voice + timer)</p>
  </section>

  <section class="block" id="library">
    <div class="block-head"><h2>Exercise library</h2><p class="muted">${EXERCISES.length} exercises. Foot exercises follow the Frido Foot Core protocol; others are drafts for physio approval.</p></div>
    <div class="chips" role="tablist">
      <a href="#/" class="chip ${!filter ? 'on' : ''}">All</a>
      ${CONDITIONS.map(c => `<a href="#/c/${c.id}" class="chip ${filter === c.id ? 'on' : ''}">${esc(c.en)} <span lang="hi">${esc(c.hi)}</span></a>`).join('')}
    </div>
    <div class="cards">
      ${list.map(e => `<a class="card" href="#/ex/${e.id}">
        ${thumb(e)}
        <div class="card-body">
        <div class="card-top">${tierBadge(e)}<span class="meta">${e.view ? `${e.view} view · ` : ''}${e.position}</span></div>
        <h3>${esc(e.title.en)}</h3><p class="hi" lang="hi">${esc(e.title.hi)}</p>
        <p class="purpose">${esc(e.purpose)}</p>
        <div class="card-foot"><span>${esc(dosageText(e))}</span>${e.label && e.tier === 'tracked' ? `<span class="measures">Measures: ${esc(e.label.toLowerCase())}</span>` : `<span class="measures">${esc(e.why || '')}</span>`}</div>
        </div>
      </a>`).join('')}
    </div>
  </section>`;
}

function thumb(e) {
  const m = MEDIA[e.id];
  if (!m) return '<div class="thumb empty">Demo video coming soon</div>';
  return `<div class="thumb"><img src="${thumbUrl(m.videoId)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"><span class="play"><i aria-hidden="true">▶</i>Demo · ${esc(m.length)}</span></div>`;
}

function openVideo(ex) {
  const m = MEDIA[ex.id]; if (!m) return;
  const md = modal(`<div class="modal-head"><div><p class="eyebrow">Demonstration</p><h2>${esc(ex.title.en)}</h2></div><button class="close-x" id="vClose" aria-label="Close">✕</button></div>
    <div class="video-frame"><iframe src="${embedUrl(m.videoId)}" title="${esc(m.title)}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
    <p class="muted small">“${esc(m.title)}” · ${esc(m.channel)} on YouTube. <a href="${watchUrl(m.videoId)}" target="_blank" rel="noopener">Open on YouTube</a>. Placeholder until Frido records its own demos.</p>`);
  md.classList.add('wide');
  const close = () => { closeModal(); document.removeEventListener('keydown', esc_); };
  const esc_ = ev => { if (ev.key === 'Escape') close(); };
  document.addEventListener('keydown', esc_);
  $('#vClose', md).onclick = close;
  $('#modal').addEventListener('click', ev => { if (ev.target.id === 'modal') close(); });
}

function heroFigure() {
  // A tiny looping squat drawn with the same bone list the tracker uses.
  return `<svg viewBox="0 0 220 240" class="hero-svg">
    <line x1="20" y1="222" x2="200" y2="222" class="floor"/>
    <g class="fig">
      <circle cx="104" cy="40" r="13" class="head"/>
      <path d="M104 56 L100 120" class="bone torso"/>
      <path d="M102 70 L140 92" class="bone"/>
      <path d="M100 120 L132 168 L110 218" class="bone leg"/>
      <circle cx="132" cy="168" r="6" class="joint"/>
      <circle cx="100" cy="120" r="6" class="joint"/>
      <circle cx="110" cy="218" r="6" class="joint"/>
    </g>
    <g class="tag"><rect x="140" y="150" rx="10" width="74" height="26"/><text x="177" y="167">Knee 96°</text></g>
    <g class="tag ok"><rect x="8" y="12" rx="10" width="62" height="26"/><text x="39" y="29">Rep 7</text></g>
  </svg>`;
}

// ---------------- exercise screen ----------------
const PLAIN = { ankle: 'feet', heel: 'feet', foot: 'feet', knee: 'knees', hip: 'hips', shoulder: 'shoulders', wrist: 'hands', elbow: 'elbows', ear: 'head', nose: 'face' };
const FAULT_JOINTS = { trunk_lean: ['shoulder', 'hip'], heel_lift: ['heel', 'foot'], knees_bent: ['knee'], knee_bent: ['knee'], lean_forward: ['shoulder', 'ankle'],
  elbow_bent: ['elbow'], lean_back: ['shoulder', 'hip'], side_lean: ['shoulder', 'hip'], hip_shift: ['hip'], shoulder_hike: ['shoulder'], uneven_arms: ['elbow', 'wrist'],
  slouch: ['shoulder', 'hip'], no_hand: ['wrist', 'foot'], feet_away: ['knee', 'ankle'] };

function renderExercise(ex, plan) {
  const pl = plan && PLANS.find(p => p.id === plan.planId);
  refreshStatic = () => { const t = $('#exHi'); if (t) t.textContent = ex.title.hi; };
  app.innerHTML = `
  <section class="ex">
    <div class="ex-head">
      <a class="back" href="#/">← All exercises</a>
      ${pl ? `<p class="plan-step">${esc(pl.en)} · exercise ${plan.idx + 1} of ${pl.items.length}</p>` : ''}
      <div class="title-row">
        <div><h1>${esc(ex.title.en)}</h1><p class="hi" id="exHi" lang="hi">${esc(ex.title.hi)}</p></div>
        <div class="badges">${tierBadge(ex)}${ex.view ? `<span class="badge">${ex.view} view</span>` : ''}<span class="badge">${ex.position}</span><span class="badge ${ex.source.startsWith('Draft') ? 'draft' : 'src'}">${esc(ex.source)}</span></div>
      </div>
      <p class="dose"><b>Prescribed:</b> ${esc(dosageText(ex))}${ex.targetText ? ` · <b>Target:</b> ${esc(ex.targetText)}` : ''}</p>
    </div>
    <div class="ex-grid">
      <div class="stage-col">
        <div class="stage ${prefs.stick ? 'stick' : ''}" id="stage">
          <video id="vid" playsinline muted></video>
          <canvas id="ov"></canvas>
          <div class="stage-bar" id="sbar"></div>
          <div class="stage-ovl" id="ovl"></div>
        </div>
        <details class="howto" open>
          <summary>How to do it</summary>
          <div class="howto-grid">
            <div style="display:grid;gap:10px;min-width:0">
              <p class="muted">${esc(ex.purpose)}</p>
              <ol>${ex.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
              ${ex.setup ? `<p class="setup-tip"><b>Phone setup:</b> ${esc(ex.setup)}</p>` : ''}
            </div>
            ${MEDIA[ex.id] ? `<button type="button" class="demo" id="demoBtn" aria-label="Watch demonstration video">${thumb(ex)}<small>Watch the demo · ${esc(MEDIA[ex.id].channel)}</small></button>` : ''}
          </div>
        </details>
      </div>
      <aside class="panel" id="panel" aria-live="off"></aside>
    </div>
  </section>`;
  $('#demoBtn')?.addEventListener('click', () => openVideo(ex));
  active = new ExerciseController(ex, plan);
}

class ExerciseController {
  constructor(ex, plan) {
    this.ex = ex; this.plan = plan;
    this.video = $('#vid'); this.canvas = $('#ov'); this.ctx = this.canvas.getContext('2d');
    this.stage = $('#stage'); this.ovl = $('#ovl'); this.panel = $('#panel'); this.sbar = $('#sbar');
    this.session = null; this.running = false; this.fps = 0; this.frames = []; this.lastPanel = 0;
    this.light = { brightness: null, backlit: false, at: 0 };
    this.lumaCanvas = document.createElement('canvas'); this.lumaCanvas.width = 32; this.lumaCanvas.height = 24;
    this.idle();
    this.renderPanel();
    this.onResize = () => this.fitCanvas();
    window.addEventListener('resize', this.onResize);
  }
  destroy() {
    this.running = false; cancelAnimationFrame(this.raf); clearInterval(this.gTimer);
    this.stream?.getTracks().forEach(t => t.stop());
    if (this.video.src?.startsWith('blob:')) URL.revokeObjectURL(this.video.src);
    this.wake?.release?.().catch(() => {});
    window.removeEventListener('resize', this.onResize);
    synth?.cancel();
  }

  // ----- overlays -----
  idle() {
    const ex = this.ex;
    const tracked = ex.tier === 'tracked';
    this.ovl.hidden = false;
    this.ovl.innerHTML = `<div class="ovl-card">
      ${tracked ? `<h2>Set up your phone</h2><p>${esc(ex.setup)}</p>
        <p class="privacy">Video stays on this device. Nothing is recorded or sent.</p>
        <div class="ovl-actions">
          <button class="btn" id="bCam">Start with camera</button>
          <label class="btn ghost file">Use a video file<input type="file" id="bFile" accept="video/*"></label>
          <button class="btn ghost" id="bGuided">Start without camera</button>
        </div>
        <label class="toggle"><input type="checkbox" id="stickT" ${prefs.stick ? 'checked' : ''}> Show me as a stick figure</label>`
      : `<h2>Guided exercise</h2><p>${esc(ex.why)}. The coach talks you through each hold with a timer.</p>
        <div class="ovl-actions"><button class="btn" id="bGuided">Start guided session</button></div>`}
    </div>`;
    $('#bCam', this.ovl)?.addEventListener('click', () => this.precheck(() => this.startCamera()));
    $('#bFile', this.ovl)?.addEventListener('change', e => { const f = e.target.files[0]; if (f) this.precheck(() => this.startFile(f)); });
    $('#bGuided', this.ovl)?.addEventListener('click', () => this.precheck(() => this.startGuided()));
    $('#stickT', this.ovl)?.addEventListener('change', e => { prefs.stick = e.target.checked; savePrefs(); this.stage.classList.toggle('stick', prefs.stick); });
  }
  loading(msg) { this.ovl.hidden = false; this.ovl.innerHTML = `<div class="ovl-card center"><div class="spinner" aria-hidden="true"></div><p>${esc(msg)}</p></div>`; }
  error(msg) {
    this.ovl.hidden = false;
    this.ovl.innerHTML = `<div class="ovl-card"><h2>Camera unavailable</h2><p>${esc(msg)}</p><div class="ovl-actions">
      <label class="btn ghost file">Use a video file<input type="file" id="bFile2" accept="video/*"></label><button class="btn ghost" id="bG2">Start without camera</button></div></div>`;
    $('#bFile2').onchange = e => e.target.files[0] && this.startFile(e.target.files[0]);
    $('#bG2').onclick = () => this.startGuided();
  }

  // ----- pre-session check (pain + red flags, brief §5.2) -----
  precheck(next) {
    // unlock speech on a user gesture
    if (synth) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); }
    if (store.get('fc_checkin_v1', {}).date === today()) { this.painPre = store.get('fc_checkin_v1', {}).pain; return next(); }
    const flags = [['numb', 'New numbness or tingling'], ['sharp', 'Sharp or shooting pain'], ['swell', 'New swelling'], ['fall', 'A fall since your last session'], ['chest', 'Chest pain or breathlessness']];
    const m = modal(`
      <h2>Before you start</h2>
      <p class="muted">Once a day. Your physio sees these answers.</p>
      <fieldset class="pain"><legend>How much pain do you have right now?</legend>
        <div class="scale">${painButtons('pre')}</div>
        <div class="scale-ends"><span>0 · No pain</span><span>10 · Worst pain</span></div></fieldset>
      <fieldset><legend>Since your last session, have you had…</legend>
        ${flags.map(([k, t]) => `<div class="yn"><span>${t}</span><span class="seg"><button type="button" data-f="${k}" data-v="0" aria-pressed="true">No</button><button type="button" data-f="${k}" data-v="1" aria-pressed="false">Yes</button></span></div>`).join('')}
      </fieldset>
      <div class="modal-actions"><button class="btn" id="mGo">Continue</button></div>`);
    let pain = null; const ans = {};
    m.querySelectorAll('[data-pain]').forEach(b => b.onclick = () => { pain = +b.dataset.pain; m.querySelectorAll('[data-pain]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    m.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { ans[b.dataset.f] = b.dataset.v === '1'; m.querySelectorAll(`[data-f="${b.dataset.f}"]`).forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('#mGo', m).onclick = () => {
      const red = Object.entries(ans).filter(([, v]) => v).map(([k]) => k);
      if (red.length) {
        saveSession({ id: crypto.randomUUID?.() || String(Date.now()), type: 'red_flag', flags: red, painPre: pain, at: Date.now(), exercise: this.ex.id, title: this.ex.title.en });
        m.innerHTML = `<h2>Please contact your physio before continuing</h2><p>You answered yes to: ${red.map(k => flags.find(f => f[0] === k)[1].toLowerCase()).join(', ')}. We've let your physio know.</p>
          <div class="modal-actions"><button class="btn" id="mClose">OK</button></div>`;
        $('#mClose', m).onclick = () => { closeModal(); location.hash = '#/'; };
        return;
      }
      store.set('fc_checkin_v1', { date: today(), pain });
      this.painPre = pain; closeModal(); next();
    };
  }

  // ----- sources -----
  newSession(guided) {
    this.session = new Session(this.ex, { say: speak, onChange: done => { if (done === true) this.finish(); } }, { guided });
  }
  async startCamera() {
    this.loading('Starting camera…');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: prefs.facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) { return this.error('Allow camera access in your browser, or try a video file. (' + (e.name || e.message) + ')'); }
    this.video.srcObject = this.stream; this.mirror = prefs.facing === 'user'; this.isCam = true;
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
      this.det = await loadLandmarker(prefs.model === 'auto' ? defaultModel() : prefs.model);
    } catch (e) { console.error(e); return this.error('The motion model could not load on this browser. Try Chrome, or start without camera.'); }
    await new Promise(r => (this.video.readyState >= 2 ? r() : this.video.addEventListener('loadeddata', r, { once: true })));
    this.stage.classList.add('running');
    this.fitCanvas();
    this.newSession(false);
    this.running = true; this.t0 = performance.now();
    this.loop();
  }
  startGuided() {
    this.stage.classList.add('guided', 'running');
    this.newSession(true);
    this.session.startGuided();
    this.ovl.hidden = true;
    this.gTimer = setInterval(() => { this.session.tickGuided(); this.drawGuided(); this.renderPanel(); }, 100);
  }

  fitCanvas() {
    const vw = this.video.videoWidth || 16, vh = this.video.videoHeight || 9;
    this.stage.style.setProperty('--ar', vw / vh);
    const r = this.stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.video.classList.toggle('mirror', !!this.mirror);
  }

  // ----- main loop -----
  loop() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(() => this.loop());
    const v = this.video;
    if (v.readyState < 2 || v.paused) return;
    if (!this.isCam && v.currentTime === this.lastVT) return;
    this.lastVT = v.currentTime;
    const t = performance.now();
    let res;
    try { res = this.det.lm.detectForVideo(v, t); } catch (e) { console.warn(e); return; }
    this.frames.push(t); while (this.frames.length && t - this.frames[0] > 1000) this.frames.shift();
    this.fps = this.frames.length;
    if (t - this.light.at > 500) this.measureLight(t);
    const { person, people } = this.pickPerson(res.landmarks);
    this.raw = person;
    this.session.frame(person, { aspect: v.videoWidth / v.videoHeight, brightness: this.light.brightness, backlit: this.light.backlit, people }, t);
    this.draw();
    if (t - this.lastPanel > 90) { this.lastPanel = t; this.renderPanel(); this.renderOverlay(); }
  }
  measureLight(t) {
    this.light.at = t;
    const c = this.lumaCanvas.getContext('2d', { willReadFrequently: true });
    c.drawImage(this.video, 0, 0, 32, 24);
    const d = c.getImageData(0, 0, 32, 24).data;
    let all = 0, n = 0, cen = 0, cn = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4, l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      all += l; n++;
      if (x >= 10 && x < 22 && y >= 6 && y < 18) { cen += l; cn++; }
    }
    const border = (all - cen) / (n - cn), center = cen / cn;
    this.light.brightness = all / n;
    this.light.backlit = border - center > CONFIG.light.backlitDelta && border > 150;
  }

  // ----- drawing -----
  draw() {
    const { ctx, canvas } = this, W = canvas.width, H = canvas.height, s = this.session;
    ctx.clearRect(0, 0, W, H);
    const p = s.lastPose; if (!p) return;
    const aspect = this.video.videoWidth / this.video.videoHeight;
    const X = pt => { const x = (pt.x / aspect) * W; return this.mirror ? W - x : x; }, Y = pt => pt.y * H;
    const css = getComputedStyle(document.documentElement);
    const col = { bone: css.getPropertyValue('--sk-bone').trim(), act: css.getPropertyValue('--sk-active').trim(), bad: css.getPropertyValue('--bad').trim(), joint: css.getPropertyValue('--sk-joint').trim() };
    const sideSet = new Set(s.spec.sides === 'auto' ? [s.autoSide] : ['L', 'R']);
    const faultJoints = new Set();
    for (const tk of Object.values(s.trackers)) for (const f of tk.faultsNow || []) for (const j of FAULT_JOINTS[f] || []) { faultJoints.add('l_' + j); faultJoints.add('r_' + j); }
    const lw = Math.max(3, W / 160);
    ctx.lineCap = 'round';
    for (const [a, b] of BONES) {
      const pa = p.lm[IDX[a]], pb = p.lm[IDX[b]];
      if (!pa || !pb || pa.v < 0.3 || pb.v < 0.3) continue;
      const sideA = a[0] === 'l' ? 'L' : 'R';
      const isFault = faultJoints.has(a) && faultJoints.has(b);
      ctx.strokeStyle = isFault ? col.bad : sideSet.has(sideA) ? col.act : col.bone;
      ctx.lineWidth = sideSet.has(sideA) ? lw * 1.4 : lw;
      ctx.beginPath(); ctx.moveTo(X(pa), Y(pa)); ctx.lineTo(X(pb), Y(pb)); ctx.stroke();
    }
    for (const name of Object.keys(IDX)) {
      const q = p.lm[IDX[name]]; if (!q || q.v < 0.3 || name.includes('ear') || name === 'nose') continue;
      ctx.fillStyle = faultJoints.has(name) ? col.bad : col.joint;
      ctx.beginPath(); ctx.arc(X(q), Y(q), lw * 1.2, 0, Math.PI * 2); ctx.fill();
    }
    // value tag at the focus joint of each tracked side
    if (s.phase === 'active' && s.spec.focus) {
      for (const [k, tk] of Object.entries(s.trackers)) {
        const side = k === 'A' ? s.autoSide : k === 'C' ? 'L' : k;
        if (tk.value == null || (s.spec.sides === 'both' && tk.state !== 'active' && tk.pr < 0.2)) continue;
        const q = p.pt(s.spec.focus, side); if (!q) continue;
        const txt = `${s.spec.fmt(tk.value, tk)}`;
        if (!txt) continue;
        const fs = Math.max(13, W / 45); ctx.font = `600 ${fs}px "Outfit", system-ui, sans-serif`;
        const tw = ctx.measureText(txt).width + fs, th = fs * 1.7;
        let x = X(q) + fs, y = Y(q) - th / 2;
        x = Math.min(W - tw - 4, Math.max(4, x)); y = Math.min(H - th - 4, Math.max(4, y));
        ctx.fillStyle = 'rgba(16,24,32,.85)'; roundRect(ctx, x, y, tw, th, th / 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(txt, x + fs / 2, y + th * 0.66);
      }
    }
  }
  drawGuided() {
    const { ctx, canvas } = this; const r = this.stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
    const W = canvas.width, H = canvas.height, g = this.session.g; ctx.clearRect(0, 0, W, H);
    if (!g) return;
    const ph = this.session.guidedPhases()[g.phaseIdx];
    const total = (ph?.s || 1) * 1000, left = Math.max(0, g.until - performance.now());
    const frac = g.phaseIdx < 0 ? 0 : 1 - left / total;
    const css = getComputedStyle(document.documentElement);
    const R = Math.min(W, H) * 0.3, cx = W / 2, cy = H / 2;
    ctx.lineWidth = R * 0.12; ctx.lineCap = 'round';
    ctx.strokeStyle = css.getPropertyValue('--stage-ring').trim(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = css.getPropertyValue('--yellow').trim(); ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    ctx.fillStyle = css.getPropertyValue('--stage-fg').trim(); ctx.textAlign = 'center';
    ctx.font = `700 ${R * 0.5}px "Outfit", system-ui, sans-serif`;
    ctx.fillText(g.resting ? Math.ceil(left / 1000) : g.phaseIdx < 0 ? '…' : Math.ceil(left / 1000), cx, cy + R * 0.18);
    ctx.font = `600 ${Math.max(14, R * 0.14)}px "Outfit", system-ui, sans-serif`;
    ctx.fillText(g.resting ? 'Rest' : ph ? tr(ph) : 'Get ready', cx, cy + R * 1.45);
    ctx.textAlign = 'start';
  }

  renderOverlay() {
    const s = this.session; if (!s) return;
    this.sbar.innerHTML = `<span class="pill live">● On-device</span><span class="pill">${this.fps} fps · ${this.det?.model || ''} · ${this.det?.delegate || ''}</span>
      <button type="button" class="pill btnp" id="stickB" aria-pressed="${prefs.stick}">${prefs.stick ? 'Stick figure' : 'Camera view'}</button>`;
    $('#stickB').onclick = () => { prefs.stick = !prefs.stick; savePrefs(); this.stage.classList.toggle('stick', prefs.stick); this.renderOverlay(); };
    const o = this.ovl;
    if (s.phase === 'setup') {
      const it = s.setup.items;
      const row = (ok, label, hint) => `<li class="${ok ? 'ok' : 'no'}"><span class="tick" aria-hidden="true">${ok ? '✓' : '•'}</span><span>${label}</span>${!ok && hint ? `<em>${hint}</em>` : ''}</li>`;
      const missing = (it.missing || []).map(n => PLAIN[n] || n).filter((v, i, a) => a.indexOf(v) === i);
      const hint = it.light === 'dark' ? "It's a bit dark. Switch on a light or move closer to a window."
        : it.light === 'backlit' ? 'There is bright light behind you. Turn so the light falls on your face.'
        : it.people === 'many' ? 'Only the person exercising should be in view.'
        : it.body === 'none' ? 'Step into view so your whole body is visible.'
        : it.body === 'partial' ? `We can't see your ${missing.join(' and ')} clearly. ${this.ex.view === 'side' ? 'Stand side-on to the phone.' : 'Face the phone.'}`
        : it.distance === 'close' ? 'Step back a little.' : it.distance === 'far' ? 'Come a little closer.' : 'Perfect. Hold still…';
      o.hidden = false; o.className = 'stage-ovl setup';
      o.innerHTML = `<div class="ovl-card compact"><h2>Camera check</h2><ul class="checks">
        ${row(it.light === 'ok', 'Lighting')}${row(it.body === 'ok', `${this.ex.view === 'side' ? 'Side-on, ' : ''}body in view`)}${row(it.distance === 'ok', 'Distance')}${row(it.people === 'ok', 'Only you in view')}
        </ul><p class="hint">${esc(hint)}</p><button class="linkbtn" id="skipS">Skip checks</button></div>`;
      $('#skipS').onclick = () => s.skipSetup();
    } else if (s.phase === 'calibrate') {
      o.hidden = false; o.className = 'stage-ovl'; o.innerHTML = `<div class="ovl-card compact center"><div class="spinner" aria-hidden="true"></div><p>Hold still in the start position…</p></div>`;
    } else if (s.phase === 'countdown') {
      o.hidden = false; o.className = 'stage-ovl count'; o.innerHTML = `<div class="big-count">${Math.max(1, Math.ceil((s.countdownEnd - performance.now()) / 1000))}</div>`;
    } else if (s.phase === 'rest') {
      o.hidden = false; o.className = 'stage-ovl'; o.innerHTML = `<div class="ovl-card compact center"><p class="eyebrow">Set ${s.set} done</p><div class="big-count small">${Math.max(0, Math.ceil((s.restEnd - performance.now()) / 1000))}</div><p>Rest, then set ${s.set + 1} starts.</p><button class="btn ghost" id="skipR">Skip rest</button></div>`;
      $('#skipR').onclick = () => s.skipRest();
    } else if (s.phase === 'active' && s.isLost) {
      o.hidden = false; o.className = 'stage-ovl'; o.innerHTML = `<div class="ovl-card compact center"><h2>I've lost sight of you</h2><p>Step back into view.</p></div>`;
    } else if (s.phase === 'active' && s.paused) {
      o.hidden = false; o.className = 'stage-ovl'; o.innerHTML = `<div class="ovl-card compact center"><h2>Paused</h2></div>`;
    } else { o.hidden = true; }
  }

  // ----- side panel -----
  renderPanel() {
    const s = this.session, ex = this.ex;
    if (!s) {
      this.panel.innerHTML = `<div class="pn-block"><p class="eyebrow">What the coach tracks</p>
        ${ex.tier === 'tracked' ? `<ul class="tracks"><li><b>Reps</b> counted only after a full movement</li><li><b>${esc(ex.label)}</b> measured live${ex.targetText ? ` against the target (${esc(ex.targetText)})` : ''}</li>${ex.holdS ? `<li><b>Hold time</b> timed while you stay in position</li>` : ''}${(ex.checks || []).length ? `<li><b>Form:</b> ${ex.checks.map(c => FAULTS[c.key].label.toLowerCase()).join(', ')}</li>` : ''}<li><b>Form score</b> per rep, out of 100</li></ul>`
        : `<p>${esc(ex.why)}. The coach counts each hold out loud and keeps time for you.</p>`}
        <p class="muted small">All thresholds are placeholders for the Frido physio team to tune.</p></div>`;
      return;
    }
    const sideName = k => k === 'L' ? `Left ${ex.sideNoun || 'side'}` : k === 'R' ? `Right ${ex.sideNoun || 'side'}` : '';
    let counters = '', gauges = '';
    if (s.guided) {
      const g = s.g;
      counters = (g?.sides || ['C']).map(k => `<div class="counter"><span class="c-num">${g ? g.counts[k] : 0}<small>/${s.repsTarget}</small></span><span class="c-lab">${k === 'C' ? 'Reps' : sideName(k)}</span></div>`).join('');
      gauges = `<p class="muted small">Guided mode: reps follow the timer. No form tracking.</p>`;
    } else {
      const keys = s.spec.countMode === 'together' ? ['T'] : Object.keys(s.trackers);
      counters = keys.map(k => {
        const n = k === 'T' ? s.displayCount : s.trackers[k].count;
        const lab = ex.mode === 'balance' ? 'Holds' : ex.mode === 'strokes' ? 'Minutes' : k === 'A' || k === 'C' || k === 'T' ? 'Reps' : sideName(k);
        return `<div class="counter ${n >= s.repsTarget ? 'done' : ''}"><span class="c-num">${n}<small>/${s.repsTarget}</small></span><span class="c-lab">${lab}</span></div>`;
      }).join('');
      gauges = Object.entries(s.trackers).map(([k, tk]) => {
        const lab = k === 'A' ? `${ex.depthLabel || ex.label}${s.spec.sides === 'auto' ? ` <span class="muted">(${s.autoSide === 'L' ? 'left' : 'right'} side)</span>` : ''}` : k === 'C' ? ex.label : `${sideName(k)}`;
        if (ex.mode === 'balance') {
          const st = tk.stability; const hold = tk.holdMs / 1000;
          return gauge(lab, Math.min(1, hold / ex.holdS), `${hold.toFixed(1)} / ${ex.holdS} s`, st == null ? '' : `Steadiness ${st}/100`, st != null && st < 65 ? 'warn' : '');
        }
        if (ex.mode === 'strokes') {
          return gauge(lab, Math.min(1, tk.holdMs / 1000 / ex.holdS), `${(tk.holdMs / 1000).toFixed(0)} / ${ex.holdS} s`, `${tk.strokes || 0} strokes`, '');
        }
        const pr = tk.pr || 0, val = tk.value == null ? '–' : ex.fmt(tk.value, tk);
        const extra = ex.readout && s.lastPose && tk.value != null ? ex.readout(s.lastPose, k === 'A' ? s.autoSide : k) : '';
        const holdTxt = ex.holdS && tk.state === 'active' ? ` · hold ${(tk.holdMs / 1000).toFixed(1)}/${ex.holdS} s` : '';
        const peak = tk.rep ? Math.min(1.15, tk.rep.peak) : null;
        return gauge(lab, Math.max(0, Math.min(1.15, pr)) / 1.15, `${val}`, `${Math.round(Math.max(0, pr) * 100)}% of target${holdTxt}${extra ? ` · ${extra}` : ''}`,
          tk.faultsNow?.length && tk.state === 'active' ? 'warn' : pr >= 0.95 ? 'good' : '', 1 / 1.15, peak != null ? peak / 1.15 : null);
      }).join('');
    }
    const cue = s.cues[0];
    const recent = s.history.filter(r => r.quality != null).slice(-12);
    const sum = s.history.filter(r => r.quality != null);
    const avgQ = sum.length ? Math.round(sum.reduce((a, r) => a + r.quality, 0) / sum.length) : null;
    this.panel.innerHTML = `
      <div class="pn-top"><span class="eyebrow">Set ${s.set} of ${s.sets}</span><span class="phase ${s.phase}">${phaseLabel(s)}</span></div>
      <div class="counters">${counters}</div>
      <div class="gauges">${gauges}</div>
      <div class="cue ${cue?.kind || 'idle'}" aria-live="polite">${cue ? esc(tr(cue)) : s.guided ? 'Follow the voice.' : 'Cues appear here.'}</div>
      ${s.guided ? '' : `<div class="pn-block"><div class="row-between"><span class="eyebrow">Form score per rep</span>${avgQ != null ? `<span class="avgq ${qClass(avgQ)}">avg ${avgQ}</span>` : ''}</div>
        <div class="qbars">${recent.length ? recent.map(r => `<span class="qb ${qClass(r.quality)}" style="--h:${Math.max(8, r.quality)}%" title="Rep ${r.n}: ${r.quality}${r.failed.length ? ' · ' + r.failed.map(f => FAULTS[f]?.label).join(', ') : ''}"><i>${r.quality}</i></span>`).join('') : '<span class="muted small">Scores appear after each rep.</span>'}</div>
        ${s.multi ? '<p class="warnline">Someone else is in view. Tracking the person nearest the centre.</p>' : ''}</div>`}
      <div class="pn-actions">
        <button class="btn ghost" id="pPause">${s.paused ? 'Resume' : 'Pause'}</button>
        <button class="btn" id="pFinish">Finish</button>
      </div>`;
    $('#pPause').onclick = () => s.togglePause();
    $('#pFinish').onclick = () => s.finish();
  }

  // ----- finish & summary -----
  finish() {
    if (this.finished) return; this.finished = true;
    this.running = false; clearInterval(this.gTimer);
    this.stream?.getTracks().forEach(t => t.stop()); this.video.pause();
    this.renderPanel(); this.ovl.hidden = true;
    const sm = this.session.summary(), ex = this.ex;
    const pl = this.plan && PLANS.find(p => p.id === this.plan.planId);
    const nextIdx = pl && this.plan.idx + 1 < pl.items.length ? this.plan.idx + 1 : null;
    const m = modal(`
      <p class="eyebrow">Session complete</p><h2>${esc(ex.title.en)}</h2>
      <div class="stats">
        <div><span class="k">Reps done</span><span class="v">${sm.reps}<small>/${sm.target}</small></span></div>
        <div><span class="k">Form score</span><span class="v ${sm.avgQuality != null ? qClass(sm.avgQuality) : ''}">${sm.avgQuality ?? '–'}</span></div>
        <div><span class="k">${ex.mode === 'rep' ? 'Best range' : ex.mode === 'balance' ? 'Avg hold' : 'Rolling time'}</span><span class="v">${ex.mode === 'rep' ? (sm.bestValue != null ? esc(ex.fmt(sm.bestValue)) : '–') : ex.mode === 'balance' || ex.mode === 'strokes' ? (sm.avgHoldS != null ? sm.avgHoldS + ' s' : '–') : '–'}</span></div>
        <div><span class="k">${ex.holdS && ex.mode === 'rep' ? 'Avg hold' : 'Time'}</span><span class="v">${ex.holdS && ex.mode === 'rep' ? (sm.avgHoldS != null ? sm.avgHoldS + ' s' : '–') : fmtDur(sm.endedAt - sm.startedAt)}</span></div>
      </div>
      ${sm.faults.length ? `<div class="issues"><p class="eyebrow">What to work on</p><ul>${sm.faults.slice(0, 4).map(f => `<li><b>${esc(f.label)}</b> on ${f.n} of ${f.of} reps</li>`).join('')}</ul></div>`
        : sm.mode === 'tracked' && sm.reps ? '<p class="goodline">Clean form on every rep.</p>' : ''}
      <fieldset class="pain"><legend>Pain now, after the exercise</legend><div class="scale">${painButtons('post')}</div>
        <div class="scale-ends"><span>0 · No pain</span><span>10 · Worst pain</span></div></fieldset>
      <fieldset class="pain"><legend>How hard was it?</legend><div class="scale">${[0, 2, 4, 6, 8, 10].map(v => `<button type="button" data-eff="${v}" aria-pressed="false">${v}</button>`).join('')}</div>
        <div class="scale-ends"><span>Very easy</span><span>Maximum effort</span></div></fieldset>
      <div class="modal-actions">
        <a class="btn ghost" href="#/physio" id="mPhys">Save &amp; see physio view</a>
        ${nextIdx != null ? `<a class="btn" id="mNext" href="#/ex/${pl.items[nextIdx]}/plan/${pl.id}/${nextIdx}">Save &amp; next: ${esc(byId(pl.items[nextIdx]).title.en)}</a>` : `<a class="btn" id="mHome" href="#/">Save &amp; finish</a>`}
      </div>`);
    let painPost = null, effort = null;
    m.querySelectorAll('[data-pain]').forEach(b => b.onclick = () => { painPost = +b.dataset.pain; m.querySelectorAll('[data-pain]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    m.querySelectorAll('[data-eff]').forEach(b => b.onclick = () => { effort = +b.dataset.eff; m.querySelectorAll('[data-eff]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    const save = () => { saveSession({ id: crypto.randomUUID?.() || String(Date.now()), type: 'session', ...sm, painPre: this.painPre ?? null, painPost, effort, at: Date.now(), plan: pl?.en || null }); closeModal(); };
    m.querySelectorAll('.modal-actions a').forEach(a => a.addEventListener('click', save));
  }
}

function gauge(label, frac, value, sub, state, targetAt, peakAt) {
  return `<div class="gauge ${state}">
    <div class="g-head"><span class="g-lab">${label}</span><span class="g-val">${esc(value)}</span></div>
    <div class="g-track"><i style="width:${(frac * 100).toFixed(1)}%"></i>${targetAt ? `<b class="g-target" style="left:${(targetAt * 100).toFixed(1)}%" title="Target"></b>` : ''}${peakAt != null ? `<b class="g-peak" style="left:${(peakAt * 100).toFixed(1)}%"></b>` : ''}</div>
    ${sub ? `<div class="g-sub">${esc(sub)}</div>` : ''}</div>`;
}
const qClass = q => (q >= CONFIG.goodRepQuality ? 'good' : q >= 60 ? 'mid' : 'low');
function phaseLabel(s) {
  if (s.phase === 'done') return 'Done';
  if (s.paused) return 'Paused';
  if (s.guided) return 'Guided';
  return { ready: 'Ready', setup: 'Camera check', calibrate: 'Calibrating', countdown: 'Get ready', active: 'Tracking', rest: 'Rest' }[s.phase] || s.phase;
}
function painButtons(prefix) {
  const face = v => (v <= 1 ? '◡' : v <= 3 ? '‿' : v <= 6 ? '—' : v <= 8 ? '︵' : '︵︵');
  return Array.from({ length: 11 }, (_, v) => `<button type="button" data-pain="${v}" aria-pressed="false" class="p${Math.min(3, Math.floor(v / 3))}" aria-label="${prefix} pain ${v}"><span>${v}</span><i aria-hidden="true">${face(v)}</i></button>`).join('');
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function modal(html) {
  closeModal();
  const wrap = document.createElement('div'); wrap.className = 'modal-wrap'; wrap.id = 'modal';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('button, a')?.focus();
  return wrap.querySelector('.modal');
}
function closeModal() { $('#modal')?.remove(); }

// ---------------- physio view ----------------
function light(s) {
  if (s.type === 'red_flag') return 'red';
  const ceil = CONFIG.painCeiling;
  if (s.painPost != null && s.painPost > ceil) return 'red';
  if (s.painPost != null && s.painPre != null && s.painPost - s.painPre >= 1) return 'amber';
  if (s.avgQuality != null && s.avgQuality < CONFIG.goodRepQuality) return 'amber';
  if (s.completion != null && s.completion < 0.7) return 'amber';
  return 'green';
}
const lightText = { red: 'Review now', amber: 'Keep current dose', green: 'On track' };
function renderPhysio() {
  refreshStatic = renderPhysio;
  const all = sessionsDb();
  const week = all.filter(s => Date.now() - s.at < 7 * 864e5);
  const sess = week.filter(s => s.type === 'session');
  const days = new Set(sess.map(s => new Date(s.at).toDateString())).size;
  const tracked = sess.filter(s => s.avgQuality != null);
  const q = tracked.length ? Math.round(tracked.reduce((a, s) => a + s.avgQuality, 0) / tracked.length) : null;
  const painPairs = sess.filter(s => s.painPre != null && s.painPost != null);
  const painDelta = painPairs.length ? painPairs.reduce((a, s) => a + (s.painPost - s.painPre), 0) / painPairs.length : 0;
  const painScore = painDelta < -0.5 ? 100 : painDelta <= 0.5 ? 70 : 30;
  const move = sess.length ? Math.round(0.5 * Math.min(1, days / 7) * 100 + 0.35 * (q ?? 0) + 0.15 * painScore) : null;
  const reds = week.filter(s => light(s) === 'red');
  app.innerHTML = `
  <section class="block physio">
    <div class="block-head"><p class="eyebrow">Physio view · demo patient</p><h1>Patient progress</h1>
      <p class="muted">What the partner physio sees after the patient exercises at home. Data on this demo stays in this browser.</p></div>
    <div class="kpis">
      <div class="kpi"><span class="k">Frido Move Score</span><span class="v">${move ?? '–'}</span><span class="s">50% adherence · 35% form · 15% pain trend</span></div>
      <div class="kpi"><span class="k">Active days (7 d)</span><span class="v">${days}<small>/7</small></span><span class="s">${sess.length} exercise sessions</span></div>
      <div class="kpi"><span class="k">Avg form score</span><span class="v ${q != null ? qClass(q) : ''}">${q ?? '–'}</span><span class="s">${tracked.length} camera-tracked sessions</span></div>
      <div class="kpi ${reds.length ? 'alert' : ''}"><span class="k">Alerts</span><span class="v">${reds.length}</span><span class="s">Red flags or pain above ceiling (${CONFIG.painCeiling})</span></div>
    </div>
    ${all.length ? `<div class="tbl"><table>
      <thead><tr><th>When</th><th>Exercise</th><th>Mode</th><th>Reps</th><th>Form</th><th>Pain before → after</th><th>Flags</th><th>Suggestion</th></tr></thead>
      <tbody>${all.map(s => {
        const l = light(s);
        if (s.type === 'red_flag') return `<tr><td>${fmtTime(s.at)}</td><td>${esc(s.title)}</td><td>–</td><td>–</td><td>–</td><td>${s.painPre ?? '–'}</td><td>Red-flag answer: ${s.flags.join(', ')}</td><td><span class="tl red">Contact patient</span></td></tr>`;
        return `<tr><td>${fmtTime(s.at)}</td><td>${esc(s.title)}${s.plan ? `<br><span class="muted small">${esc(s.plan)}</span>` : ''}</td><td>${s.mode}</td><td>${s.reps}/${s.target}</td>
          <td>${s.avgQuality != null ? `<span class="avgq ${qClass(s.avgQuality)}">${s.avgQuality}</span>` : '–'}</td>
          <td>${s.painPre ?? '–'} → ${s.painPost ?? '–'}</td>
          <td>${s.faults?.length ? s.faults.slice(0, 2).map(f => `${esc(f.label)} (${f.n}/${f.of})`).join('<br>') : '–'}</td>
          <td><span class="tl ${l}">${lightText[l]}</span></td></tr>`;
      }).join('')}</tbody></table></div>
      <button class="linkbtn" id="clearD">Clear demo data</button>`
      : `<div class="empty"><h2>No sessions yet</h2><p>Do an exercise from a plan and its reps, form score and pain answers appear here.</p><a class="btn" href="#/">Go to plans</a></div>`}
    <p class="muted small">Suggestions follow the traffic-light rules in the brief and only go to the physio for approval; the patient's plan never changes on its own.</p>
  </section>`;
  $('#clearD')?.addEventListener('click', () => { store.set('fc_sessions_v1', []); store.set('fc_checkin_v1', {}); renderPhysio(); });
}
const fmtDur = ms => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const fmtTime = t => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' });

route();

// debug handle for automated UI checks
window.__fc = { get active() { return active; } };
