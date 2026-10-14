// Frido Care · "Ask the coach".
// Safety-critical and live-form questions are answered on the device with fixed, physio-reviewable copy.
// Everything else goes to the coach endpoint (Netlify Function → Claude) with the live session context.
// Only text and numbers are sent; never images or video.
import { words } from './lesson-runner.js';

const has = (q, list) => { const ws = words(q), joined = ws.join(' '); return list.some(k => (k.includes(' ') ? joined.includes(k) : ws.includes(k))); };

// Phrases rather than single words where a word alone is common in harmless questions ("how should I breathe?").
const RED_FLAGS = ['sharp pain', 'shooting pain', 'chest', 'breathless', 'short of breath', 'can t breathe', 'cant breathe', 'numb', 'numbness',
  'tingling', 'swelling', 'swollen', 'i fell', 'fell down', 'dizzy', 'faint', 'saans nahi', 'chakkar', 'sujan',
  'सीने', 'साँस नहीं', 'सांस नहीं', 'सुन्न', 'झनझनाहट', 'सूजन', 'चक्कर', 'गिर गया', 'गिर गई'];
const PAIN = ['pain', 'painful', 'hurt', 'hurts', 'hurting', 'dard', 'ache', 'aching', 'दर्द'];
const FORM = ['right', 'correct', 'correctly', 'properly', 'sahi', 'सही'];
const ASKING_ME = ['am i', 'is this', 'is my', 'kya main', 'kya mai', 'kya ye', 'kya yeh', 'क्या मैं', 'क्या यह', 'क्या ये'];
const HOW_LONG = ['how long', 'how many', 'kitna', 'kitne', 'kitni', 'left', 'baaki', 'baki', 'कितना', 'कितने', 'बाकी'];
const WHY = ['why', 'kyun', 'kyon', 'kyu', 'क्यों', 'benefit', 'faayda', 'fayda'];

export function localAnswer(q, ctx) {
  if (has(q, RED_FLAGS)) {
    return { stop: true, flagged: true, answer: {
      en: 'Please stop the exercise now and rest. Contact your physio before you continue. If you have chest pain or trouble breathing, get medical help straight away.',
      hi: 'कृपया अभी व्यायाम रोकिए और आराम कीजिए। आगे करने से पहले अपने फ़िज़ियो से बात कीजिए। अगर सीने में दर्द या साँस लेने में तकलीफ़ हो, तो तुरंत डॉक्टर की मदद लीजिए।' } };
  }
  if (has(q, PAIN)) {
    return { flagged: true, answer: {
      en: "A gentle stretch or mild discomfort is okay. Pain should stay low and settle soon after. If it's sharp or getting worse, stop and tell your physio. I've noted this for them.",
      hi: 'हल्का खिंचाव या थोड़ी असुविधा ठीक है। दर्द कम रहना चाहिए और जल्दी ठीक हो जाना चाहिए। अगर तेज़ दर्द हो या बढ़ रहा हो, तो रुकिए और अपने फ़िज़ियो को बताइए। मैंने उनके लिए नोट कर लिया है।' } };
  }
  if (has(q, FORM) && has(q, ASKING_ME)) return { answer: formAnswer(ctx) };
  if (has(q, HOW_LONG)) return { answer: remainingAnswer(ctx) };
  if (has(q, WHY) && ctx.purpose) return { answer: { en: ctx.purpose, hi: ctx.purposeHi || ctx.purpose } };
  return null;
}

function formAnswer(ctx) {
  if (ctx.waitingFor) return { en: `Not yet. ${ctx.instruction?.en || ''}`.trim(), hi: `अभी नहीं। ${ctx.instruction?.hi || ''}`.trim() };
  if (ctx.positionLost) return { en: `You've slipped out of position. ${ctx.instruction?.en || ''}`.trim(), hi: `आप स्थिति से हट गए हैं। ${ctx.instruction?.hi || ''}`.trim() };
  if (ctx.lastFaults?.length) return { en: `Mostly, yes. Watch this: ${ctx.lastFaults[0].en}`, hi: `लगभग सही है। इस पर ध्यान दीजिए: ${ctx.lastFaults[0].hi}` };
  return { en: `Yes, that looks right.${ctx.measure ? ` ${ctx.measure}.` : ''} Keep going.`, hi: 'हाँ, सही लग रहा है। ऐसे ही करते रहिए।' };
}

function remainingAnswer(ctx) {
  if (ctx.hold) { const s = Math.max(0, Math.ceil(ctx.hold.total - ctx.hold.elapsed)); return { en: `${s} more seconds on this hold.`, hi: `इस होल्ड में ${s} सेकंड और।` }; }
  if (ctx.reps) { const n = Math.max(0, ctx.reps.n - ctx.reps.count); return { en: `${n} more to go.`, hi: `${n} और बाकी हैं।` }; }
  const left = ctx.exercisesLeft ?? 0;
  return { en: left ? `${left} more exercise${left > 1 ? 's' : ''} after this one.` : 'This is the last exercise.', hi: left ? `इसके बाद ${left} व्यायाम और।` : 'यह आखिरी व्यायाम है।' };
}

/** Answer a patient question. Returns { answer: {en,hi}, source, flagged?, stop? }. */
export async function askCoach(question, ctx, lang) {
  const local = localAnswer(question, ctx);
  if (local) return { ...local, source: 'on-device' };
  try {
    const res = await fetch('/.netlify/functions/coach', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, lang, context: ctx }),
    });
    if (!res.ok) throw new Error(`coach endpoint ${res.status}`);
    const j = await res.json();
    if (!j.answer) throw new Error('empty answer');
    return { answer: { en: j.answer, hi: j.answer }, source: 'ai', flagged: !!j.escalate };
  } catch (e) {
    console.warn('Coach endpoint unavailable:', e.message);
    return { source: 'saved', flagged: false, answer: {
      en: "Good question. I've saved it for your physio, who will answer it at your next session.",
      hi: 'अच्छा सवाल है। मैंने इसे आपके फ़िज़ियो के लिए सेव कर लिया है, वे अगली बार जवाब देंगे।' } };
  }
}
