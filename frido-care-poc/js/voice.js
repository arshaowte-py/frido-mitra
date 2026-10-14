// Frido Care · voice in and out for the guided class.
// Out: browser text-to-speech, with "is the coach still talking?" tracking so the class waits for it.
// In: browser speech recognition (Chrome / Edge / Safari), English (India) or Hindi.
// Real app: recorded voice packs + on-device speech recognition (brief §10).

export function createVoice(getPrefs) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  let voices = [];
  const load = () => { voices = synth ? synth.getVoices() : []; };
  if (synth) { load(); synth.addEventListener?.('voiceschanged', load); }
  const active = new Set();
  let lastEnd = 0, rec = null;

  const pick = lang => (lang === 'hi'
    ? voices.find(v => /^hi/i.test(v.lang))
    : voices.find(v => /en[-_]IN/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)));

  function textFor(c, lang) {
    if (typeof c === 'number') return String(c);
    return lang === 'hi' ? c.hi || c.en : c.en;
  }

  const api = {
    supported: { speak: !!synth, listen: !!SR },
    hasHindiVoice: () => !!pick('hi'),

    /** Estimated reading time, used as a minimum step length (longer when the voice is off). */
    readMs(c) {
      if (c == null) return 0;
      const n = textFor(c, getPrefs().lang).split(/\s+/).length;
      return n * (getPrefs().voice ? 180 : 330);
    },

    say(c, kind) {
      if (c == null) return;
      const prefs = getPrefs();
      if (!prefs.voice || !synth) return;
      let lang = prefs.lang, v = pick(lang), text = textFor(c, lang);
      if (lang === 'hi' && !v) { v = pick('en'); text = textFor(c, 'en'); }
      if (kind === 'count') { synth.cancel(); active.clear(); }
      const u = new SpeechSynthesisUtterance(text);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
      u.rate = kind === 'count' ? 1.1 : 1.0;
      const done = () => { if (active.delete(u)) lastEnd = performance.now(); };
      u.onend = done; u.onerror = done;
      active.add(u);
      // Some browsers never fire onend; never let the class wait forever.
      setTimeout(done, 2000 + text.split(/\s+/).length * 450);
      synth.speak(u);
    },

    isSpeaking: () => active.size > 0 || performance.now() - lastEnd < 250,
    stop() { if (synth) synth.cancel(); active.clear(); lastEnd = performance.now(); },

    /** Listen once. Resolves with the transcript, or null on silence / error / no support. */
    listen({ timeoutMs = 6000, onInterim } = {}) {
      if (!SR) return Promise.resolve(null);
      api.abortListen();
      return new Promise(resolve => {
        const r = rec = new SR();
        r.lang = getPrefs().lang === 'hi' ? 'hi-IN' : 'en-IN';
        r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
        let text = '', settled = false;
        const finish = val => { if (settled) return; settled = true; clearTimeout(timer); if (rec === r) rec = null; resolve(val && val.trim() ? val.trim() : null); };
        r.onresult = e => {
          text = Array.from(e.results).map(x => x[0].transcript).join(' ');
          onInterim?.(text);
          if (e.results[e.results.length - 1].isFinal) { finish(text); try { r.stop(); } catch { /* already stopped */ } }
        };
        r.onerror = () => finish(text || null);
        r.onend = () => finish(text || null);
        const timer = setTimeout(() => { try { r.stop(); } catch { /* ignore */ } finish(text || null); }, timeoutMs);
        try { r.start(); } catch { finish(null); }
      });
    },
    abortListen() { if (rec) { try { rec.abort(); } catch { /* ignore */ } rec = null; } },
    isListening: () => !!rec,
  };
  return api;
}
