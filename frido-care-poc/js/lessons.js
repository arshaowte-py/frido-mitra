// Frido Care · guided lessons ("exercise → guide").
// A lesson turns one exercise into a sequence of teaching steps. The coach says one thing, then waits
// until the camera sees the person do it, the way a class instructor would.
//
// Step types (handled by js/lesson-runner.js):
//   say       speak a line, continue when it has been said
//   demo      play the demonstration video large while the intro is spoken
//   gate      give an instruction and wait until the named camera checks pass (hint if stuck)
//   checkin   ask a question; answer by voice or tap (yes / no / pain)
//   hold      timed hold that only runs while the position is kept; corrects when it slips
//   calibrate record the person's resting baseline for an exercise
//   teachRep  walk through one rep slowly: up → hold → down
//   reps      the person continues alone; the coach counts and corrects
//   rest      timed rest
//   pain      0–10 pain rating by voice or tap
//
// Scripts and every number in them are drafts for the Frido physio team to review. Hindi lines need
// review by a native-speaking physio before patients hear them.

const side = {
  en: s => (s === 'R' ? 'right' : 'left'),
  enOther: s => (s === 'R' ? 'left' : 'right'),
  hiFoot: s => (s === 'R' ? 'दायाँ पैर' : 'बायाँ पैर'),
  hiFootObl: s => (s === 'R' ? 'दाएँ पैर' : 'बाएँ पैर'),
  hiKneeOther: s => (s === 'R' ? 'बाएँ घुटने' : 'दाएँ घुटने'),
};

export const DOSES = {
  quick: { label: 'Quick demo', plantarHolds: 1, plantarHoldS: 15, heelSets: 1, heelReps: 5, balanceRounds: 1, balanceHoldS: 15 },
  full: { label: 'Full prescription', plantarHolds: 3, plantarHoldS: 20, heelSets: 2, heelReps: 15, balanceRounds: 2, balanceHoldS: 30 },
};

export const LESSONS = {
  'plantar-stretch': {
    view: 'front',
    build: d => {
      const steps = [
        { type: 'demo', text: { en: 'Plantar fascia stretch. It eases the tightness under your foot that causes heel pain, especially in the morning. Watch once, then we will do it together.', hi: 'तलवे का स्ट्रेच। यह पैर के नीचे की जकड़न कम करता है जिससे एड़ी में दर्द होता है। एक बार देखिए, फिर साथ में करेंगे।' } },
        { type: 'gate', label: 'Seated, facing the phone', checks: ['inView', 'seated'],
          text: { en: 'Sit on a chair facing the phone, about two steps away. I need to see you from head to feet.', hi: 'फ़ोन की तरफ़ मुँह करके कुर्सी पर बैठिए, लगभग दो कदम दूर। मुझे आप सिर से पैर तक दिखने चाहिए।' },
          hint: { en: 'Sit down on the chair and face the phone. Move back a little if your feet are not in view.', hi: 'कुर्सी पर बैठिए और फ़ोन की तरफ़ देखिए। अगर पैर नहीं दिख रहे, तो थोड़ा पीछे जाइए।' } },
      ];
      for (const s of ['R', 'L']) {
        for (let i = 0; i < d.plantarHolds; i++) {
          const first = i === 0;
          steps.push(
            { type: 'gate', label: `${side.en(s)} ankle on ${side.enOther(s)} knee`, checks: [`footOnKnee:${s}`], praise: first,
              text: first
                ? { en: `Lift your ${side.en(s)} foot and rest the ankle on your ${side.enOther(s)} knee.`, hi: `अपना ${side.hiFoot(s)} उठाइए और टखना ${side.hiKneeOther(s)} पर रखिए।` }
                : { en: `Again, ${side.en(s)} ankle on your ${side.enOther(s)} knee.`, hi: `फिर से, टखना ${side.hiKneeOther(s)} पर रखिए।` },
              hint: { en: `Bring your ${side.en(s)} ankle up a little higher, just above the ${side.enOther(s)} knee.`, hi: `टखने को थोड़ा और ऊपर लाइए, ${side.hiKneeOther(s)} के ठीक ऊपर।` } },
            { type: 'gate', label: `Hand holding the ${side.en(s)} toes`, checks: [`footOnKnee:${s}`, `handAtFoot:${s}`], praise: first,
              text: { en: `Hold the toes of your ${side.en(s)} foot with your hand.`, hi: `हाथ से ${side.hiFootObl(s)} की उंगलियाँ पकड़िए।` },
              hint: { en: 'Reach down and wrap your fingers around your toes.', hi: 'नीचे झुककर उंगलियों से पैर की उंगलियाँ पकड़िए।' } },
            { type: 'say', text: { en: 'Now gently pull your toes back towards your shin.', hi: 'अब धीरे से उंगलियों को पिंडली की तरफ़ पीछे खींचिए।' } },
          );
          if (first) steps.push({ type: 'checkin', key: `stretch_${s}`,
            text: { en: 'Can you feel a gentle stretch under your foot? Say yes, no, or pain.', hi: 'क्या तलवे के नीचे हल्का खिंचाव महसूस हो रहा है? हाँ, नहीं, या दर्द बोलिए।' },
            responses: {
              yes: { en: 'Perfect. That is the stretch we want.', hi: 'बढ़िया। यही खिंचाव चाहिए।' },
              no: { en: 'Pull the toes back a little more, slowly, until you feel a gentle stretch.', hi: 'उंगलियों को धीरे-धीरे थोड़ा और पीछे खींचिए, जब तक हल्का खिंचाव न लगे।' },
              pain: { en: 'Ease off a little. You should feel a stretch, not pain. If the pain is sharp, stop and tell your physio.', hi: 'थोड़ा ढीला छोड़िए। खिंचाव लगना चाहिए, दर्द नहीं। अगर तेज़ दर्द हो, तो रुकिए और अपने फ़िज़ियो को बताइए।' },
            } });
          steps.push(
            { type: 'hold', label: `Stretch hold · ${side.en(s)} foot`, seconds: d.plantarHoldS, keep: [`footOnKnee:${s}`, `handAtFoot:${s}`],
              text: { en: `Hold for ${d.plantarHoldS} seconds.`, hi: `${d.plantarHoldS} सेकंड रोकिए।` },
              lost: {
                [`footOnKnee:${s}`]: { en: 'Keep your ankle on your knee.', hi: 'टखना घुटने पर रखिए।' },
                [`handAtFoot:${s}`]: { en: 'Keep holding your toes.', hi: 'उंगलियाँ पकड़े रहिए।' },
              },
              watch: [{ check: 'sittingTall', cue: { en: 'Sit up tall.', hi: 'सीधे बैठिए।' } }],
              cues: [{ at: 5, text: { en: 'Breathe normally.', hi: 'सामान्य रूप से साँस लीजिए।' } }] },
            { type: 'say', text: { en: 'And slowly release. Well done.', hi: 'अब धीरे से छोड़िए। शाबाश।' } },
          );
          if (i < d.plantarHolds - 1) steps.push({ type: 'rest', seconds: 8, text: { en: 'Rest for a moment.', hi: 'थोड़ा आराम कीजिए।' } });
        }
        if (s === 'R') steps.push({ type: 'say', text: { en: 'Now the other foot. Put your right foot down.', hi: 'अब दूसरा पैर। दायाँ पैर नीचे रखिए।' } });
      }
      return steps;
    },
  },

  'heel-raise': {
    view: 'side',
    build: d => {
      const steps = [
        { type: 'demo', text: { en: 'Heel raises. They strengthen your calves and support the arch of your foot.', hi: 'एड़ी उठाना। इससे पिंडलियाँ मज़बूत होती हैं और तलवे के आर्च को सहारा मिलता है।' } },
        { type: 'gate', label: 'Standing, side-on to the phone', checks: ['standing', 'sideOn'],
          text: { en: 'Stand up and turn sideways to the phone, feet hip-width apart. Hold a chair or the wall if you need support.', hi: 'खड़े होइए और फ़ोन की तरफ़ बगल करके खड़े रहिए, पैर थोड़े खुले। ज़रूरत हो तो कुर्सी या दीवार पकड़ लीजिए।' },
          hint: { en: 'Turn so your side faces the phone, and step back until I can see your feet.', hi: 'ऐसे मुड़िए कि आपकी बगल फ़ोन की तरफ़ हो, और पीछे हटिए ताकि आपके पैर दिखें।' } },
        { type: 'calibrate', exercise: 'heel-raise', text: { en: 'Stand still with your feet flat for a moment.', hi: 'एक पल के लिए पैर ज़मीन पर रखकर स्थिर खड़े रहिए।' } },
        { type: 'teachRep', exercise: 'heel-raise', holdS: 2,
          up: { en: 'Slowly rise up onto your toes.', hi: 'धीरे-धीरे पंजों पर ऊपर उठिए।' },
          upHint: { en: 'Push up through the balls of your feet. Keep your knees straight.', hi: 'पंजों पर ज़ोर देकर ऊपर उठिए। घुटने सीधे रखिए।' },
          hold: { en: 'Hold it there.', hi: 'वहीं रोकिए।' },
          down: { en: 'Now lower your heels slowly.', hi: 'अब धीरे-धीरे एड़ियाँ नीचे लाइए।' },
          done: { en: "That's one. Good.", hi: 'एक हो गया। बढ़िया।' } },
      ];
      for (let set = 1; set <= d.heelSets; set++) {
        const n = set === 1 ? d.heelReps - 1 : d.heelReps;
        steps.push({ type: 'reps', exercise: 'heel-raise', n, label: `Heel raises · set ${set} of ${d.heelSets}`,
          text: set === 1
            ? { en: `Now ${n} more at your own pace. Up, hold, down. I'll count and help with your form.`, hi: `अब अपनी रफ़्तार से ${n} और कीजिए। ऊपर, रोकिए, नीचे। मैं गिनूँगी और सही तरीका बताऊँगी।` }
            : { en: `Set ${set}. ${n} heel raises. Off you go.`, hi: `सेट ${set}। ${n} बार एड़ी उठाइए। शुरू कीजिए।` } });
        if (set < d.heelSets) steps.push({ type: 'rest', seconds: 30, text: { en: 'Good set. Rest for 30 seconds.', hi: 'बढ़िया सेट। 30 सेकंड आराम कीजिए।' } });
      }
      steps.push({ type: 'say', text: { en: 'Well done. Your calves did good work.', hi: 'शाबाश। पिंडलियों ने अच्छा काम किया।' } });
      return steps;
    },
  },

  'balance': {
    view: 'front',
    build: d => {
      const steps = [
        { type: 'demo', text: { en: 'Balance hold. It trains the small muscles that keep your ankle steady. If you have a balance board, use it. Otherwise we will balance on one leg.', hi: 'संतुलन। इससे टखने को स्थिर रखने वाली छोटी मांसपेशियाँ मज़बूत होती हैं। बैलेंस बोर्ड हो तो उस पर खड़े होइए, नहीं तो एक पैर पर संतुलन बनाएँगे।' } },
        { type: 'gate', label: 'Standing, facing the phone', checks: ['standing', 'facing'],
          text: { en: 'Face the phone and stand near a wall or chair, so you can hold it if you wobble.', hi: 'फ़ोन की तरफ़ मुँह करके दीवार या कुर्सी के पास खड़े होइए, ताकि लड़खड़ाएँ तो पकड़ सकें।' },
          hint: { en: 'Turn to face the phone and step back until I can see your feet.', hi: 'फ़ोन की तरफ़ मुड़िए और पीछे हटिए ताकि आपके पैर दिखें।' } },
      ];
      for (let r = 0; r < d.balanceRounds; r++) {
        for (const s of ['L', 'R']) {
          steps.push(
            { type: 'gate', label: `${side.en(s)} foot lifted`, checks: [`footUp:${s}`], praise: r === 0,
              text: { en: `Lift your ${side.en(s)} foot a little off the floor.`, hi: `${side.hiFoot(s)} ज़मीन से थोड़ा ऊपर उठाइए।` },
              hint: { en: 'Just a few centimetres off the floor is enough. Hold the wall if you need.', hi: 'ज़मीन से बस थोड़ा सा ऊपर काफ़ी है। ज़रूरत हो तो दीवार पकड़िए।' } },
            { type: 'hold', label: `Balance · on ${side.enOther(s)} leg`, seconds: d.balanceHoldS, keep: [`footUp:${s}`], measure: 'sway',
              text: { en: `Balance for ${d.balanceHoldS} seconds. Look at one point in front of you.`, hi: `${d.balanceHoldS} सेकंड संतुलन बनाइए। सामने एक जगह पर नज़र रखिए।` },
              lost: { [`footUp:${s}`]: { en: "Foot down? That's okay. Lift it again when you're ready.", hi: 'पैर नीचे आ गया? कोई बात नहीं। तैयार हों तो फिर उठाइए।' } },
              unsteady: { en: 'Try to stay steady. Tighten your tummy a little.', hi: 'स्थिर रहने की कोशिश कीजिए। पेट थोड़ा कसिए।' } },
            { type: 'say', text: { en: 'And rest. Well done.', hi: 'अब आराम। शाबाश।' } },
          );
        }
      }
      return steps;
    },
  },
};

export const CLASSES = [
  {
    id: 'heel-pain', plan: 'heel-pain',
    title: { en: 'Heel pain class', hi: 'एड़ी दर्द क्लास' },
    summary: 'Plantar fascia stretch, heel raises and balance. The coach teaches each step and checks you on camera.',
    items: ['plantar-stretch', 'heel-raise', 'balance'],
    minutes: { quick: 4, full: 9 },
    welcome: { en: 'Namaste. This is your heel pain class from your physio. Three exercises. I will guide you step by step and watch your form on the camera. You can ask me anything: tap the mic or press the space bar.', hi: 'नमस्ते। यह आपके फ़िज़ियो की एड़ी दर्द क्लास है। तीन व्यायाम हैं। मैं हर कदम पर आपको बताऊँगी और कैमरे से आपका तरीका देखूँगी। कुछ भी पूछना हो तो माइक दबाइए।' },
    closing: { en: 'Class complete. Well done. Your physio will see how it went.', hi: 'क्लास पूरी हुई। शाबाश। आपके फ़िज़ियो देख पाएँगे कि कैसा रहा।' },
  },
];

export const classById = id => CLASSES.find(c => c.id === id);

/** Flatten a class into one ordered step list, tagging each step with its exercise. */
export function buildClass(cls, doseKey = 'quick', titles = {}) {
  const d = DOSES[doseKey];
  const steps = [
    { type: 'say', text: cls.welcome, exIdx: -1 },
    { type: 'pain', key: 'pre', exIdx: -1, text: { en: 'Before we start: how much heel pain do you have right now, from 0 to 10?', hi: 'शुरू करने से पहले: अभी एड़ी में कितना दर्द है, 0 से 10 तक?' } },
  ];
  cls.items.forEach((id, i) => {
    if (i > 0) steps.push({ type: 'say', exIdx: i, text: { en: `Next: ${titles[id]?.en || id}.`, hi: `अगला: ${titles[id]?.hi || id}।` } });
    for (const s of LESSONS[id].build(d)) steps.push({ ...s, exIdx: i, exercise: s.exercise || id, view: LESSONS[id].view });
  });
  steps.push({ type: 'pain', key: 'post', exIdx: cls.items.length, text: { en: 'How much heel pain do you have now, from 0 to 10?', hi: 'अब एड़ी में कितना दर्द है, 0 से 10 तक?' } });
  steps.push({ type: 'say', text: cls.closing, exIdx: cls.items.length });
  return steps;
}
