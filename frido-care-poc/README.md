# Frido Care · Exercise Coach (POC)

A browser proof of concept for the Frido Care exercise module (brief: *Frido Care — Exercise Prescription, Tracking & Form Guidance*, Phase 2 camera tracking). The phone or laptop camera watches the patient, counts reps, measures depth, stretch and hold time live, speaks short form cues in English or Hindi, and sends a summary to a physio view.

Everything runs on the device. Pose detection is Google MediaPipe Pose Landmarker (Apache-2.0), vendored in `vendor/` with its models in `models/`, so the demo needs no CDN and no backend. No video frame is stored or uploaded. Session results are saved in the browser's localStorage for the demo.

## Run it

Camera access needs `localhost` or HTTPS.

```bash
# from the repo root
python3 -m http.server 8000
# open http://localhost:8000/frido-care-poc/ in Chrome
```

On a phone, open it from an HTTPS host. Any static host works (Netlify deploy preview, Vercel, GitHub Pages); the folder is self-contained.

Tests (engine only, no camera):

```bash
node --test frido-care-poc/tests/engine.test.mjs frido-care-poc/tests/lesson.test.mjs
```

The class tests run the whole heel-pain class against a simulated patient (synthetic landmarks that follow each instruction).

## Demo script (about 5 minutes)

1. **Home.** Six condition plans. The two foot plans use the Frido Foot Core protocol; the others are drafts for physio approval. Blue dot means camera tracked, hollow dot means guided.
2. **Squat** (Knee plan, or Library → Squat). Stand side-on to the laptop, about 2.5 m away, head to feet in view. Start with camera → pain check → camera check (lighting, body in view, distance, one person) → 3-2-1.
   - Do 2 good squats: count is spoken, depth bar fills to the target line, form score ≈ 90–100.
   - Do 1 shallow squat with your chest dropped forward: "Keep your chest up", amber/red score, both issues listed.
   - Do a quarter squat: not counted, and the coach says "Almost. Go a bit further next time."
3. **Heel raises** (Foot plan). Side-on, feet in view. Stand still for calibration, then rise and hold 2 s: lift shown in cm (estimated), hold timer, "Hold complete".
4. **Standing side bend** (front view): left and right counted separately, bend angle shown live.
5. **Toe yoga**: guided mode. Voice, timer ring and per-foot counts, because the camera can't see individual toes.
6. **Finish → summary** (reps, form score, best range, what to work on, pain after) → **Physio view**: adherence, form trend, pain before/after, traffic-light suggestion, red-flag alerts.

Toggle **EN / हिं** in the header to switch voice and captions to Hindi. Hindi needs a Hindi voice on the device (Chrome on Android and Windows/macOS usually have one); otherwise the app falls back to English. Use **Camera view / Stick figure** on the stage to hide the live image.

Tips for a clean demo: plain background, good front lighting, fitted clothes, nobody else in frame. If the room doesn't work, use **Use a video file** with a short phone recording.

## What's tracked

| Condition | Camera tracked | Guided (voice + timer) |
|---|---|---|
| Foot & heel (Frido protocol) | Heel raises, Plantar fascia stretch, Foot roller massage, Balance board hold | Toe yoga, Short foot, Toe splay, Toe squish, Towel scrunches, Toe curl with band |
| Lower back | Knee to chest, Glute bridge, Bird-dog, Standing side bend | Pelvic tilt, Cat-camel |
| Knee | Squat, Sit to stand, Straight leg raise, Seated knee extension | |
| Neck & shoulder | Neck side stretch, Shoulder raise (forward), Shoulder raise (sideways) | Chin tuck |
| General mobility | Standing forward bend (reach level), Standing side leg raise, plus shared ones above | |

Every number (target angles, hold times, fault thresholds, score weights) is a placeholder in `js/exercises.js` and `js/config.js` for the physio team to tune.

## Guided class (new)

Home → **Heel pain class**. Press Start and the coach teaches: it says one thing, waits until the camera sees you do it, then moves on, like an instructor in an online yoga class.

- **Flow:** welcome → pain 0–10 → plantar fascia stretch → heel raises → balance → pain again → summary for the physio. The demo video plays large during each intro, then shrinks to a corner.
- **Teaching steps:** "Sit facing the phone" waits until you're seated. "Rest your right ankle on your left knee" waits until it sees that. Stuck for 9 s, you get a hint; after 45 s it moves on.
- **Holds** only count down while the position is kept. Let go of your toes and the timer pauses with "Keep holding your toes".
- **Heel raises:** the coach walks through one rep slowly (up, hold, down), then you continue alone while it counts and corrects.
- **Check-ins** such as "Can you feel the stretch? Say yes, no, or pain" are answered by voice (English, Hinglish or Hindi) or by tap. Each answer gets its own reply.
- **Voice commands:** "next", "repeat", "ruko" / "pause", "chalo" / "continue".
- **Ask the coach:** tap the mic (or press Space) and ask anything mid-exercise, or type the question.
  - Red-flag symptoms stop the class and tell the person to contact their physio.
  - "Am I doing it right?", "how long?" and pain questions are answered on the device from live measurements.
  - Everything else goes to Claude (see below).
  - Every question is logged in the Physio view.
- **Length:** Quick demo (~4 min) or Full prescription (~9 min).

### How an exercise becomes a guide

`js/lessons.js` holds a short script per exercise: ordered steps of `say`, `demo`, `gate` (wait for a camera check), `checkin`, `hold`, `teachRep`, `reps` and `rest`. Camera checks come from a small reusable library in `js/predicates.js`: seated, standing, side-on, facing, foot on knee, hand at foot, foot lifted, sitting tall. `js/lesson-runner.js` runs any script.

New exercises mostly need a new script, not new code: an AI model can draft one from the exercise steps and a physio approves it.

### Ask the coach: setup

The on-device answers work everywhere. AI answers need the Netlify Function in `netlify/functions/coach.mjs`:

1. Deploy from Git (or the Netlify CLI). Drag-and-drop deploys don't include functions.
2. In Netlify → Site configuration → Environment variables, add `ANTHROPIC_API_KEY`.
3. The function calls Claude (`claude-opus-5-5`, low effort, server-side refusal fallback enabled). It receives only the question and the live session numbers, never camera images. Without a key, questions are saved for the physio instead.

## Design

Follows the Frido Brand Book (2024), applied lightly:

- Colours: Frido Yellow `#FFD100`, Frido Black `#101820` and white lead. Secondary blues, mint `#80E0A7` and coral `#FF585D` are used only as status colours (good / attention / fault).
- Type: Outfit, the brand's secondary typeface (Gilroy is the primary typeface but isn't freely licensed for the web).
- Shapes: pill buttons, hairline borders, and panels with one large rounded corner, as in the brand book layouts.
- The official Frido logo isn't embedded yet. The header shows "Frido Care" in Outfit with the yellow ring from the logo clear-space mark. Drop the official SVG into `assets/` when the brand team shares it.
- All tokens are at the top of `css/styles.css`.

## Demo videos

Each exercise links to a short third-party YouTube demonstration (`js/media.js`), mostly from physiotherapy and hospital channels. They play in a privacy-enhanced `youtube-nocookie.com` embed when the user taps the thumbnail, and are placeholders until Frido records its own demos (brief §10). Check embeds still work before a demo; channel owners can disable embedding.

## Moving to its own repo

The folder is self-contained (no build step, no dependencies outside it):

1. Copy everything in `frido-care-poc/` to the root of the new repo.
2. Netlify: publish directory `.` (already set in `netlify.toml`, which also allows camera access and caches the model files).
3. Tests: `node --test tests/engine.test.mjs`.

## How it works

```
camera frame → MediaPipe pose (33 keypoints, on device) → One Euro smoothing
  → joint angles from the exercise's movement spec → rep / hold state machine (with hysteresis)
  → per-rep form checks + range + hold + tempo → form score 0–100 → one spoken cue at a time
```

- `js/engine.js`: pure tracking engine (no DOM, no camera): geometry, smoothing, `RepTracker`, `StrokeTracker`, `BalanceTracker`. This is the module to port to the React Native app (brief §9.5).
- `js/exercises.js`: the exercise library and movement specs (brief §7): camera view, required joints, measured angle, start/target, hold, form checks and cue copy (EN + HI).
- `js/session.js`: one exercise session: camera checks (brief §8), calibration, sets × reps × sides, cue throttling, guided fallback, summary.
- `js/app.js`: UI (plans, library, live session, summary, physio view).

## Known limits of the POC

- Thresholds are untested on real patients; they need the validation pass in brief §18 (physio-labelled recordings, Indian home conditions).
- Single camera, 2D angles: each exercise needs the camera view it declares (side or front). Knee caving inward needs a front-view variant, which isn't built yet.
- The camera can't see toes, so toe exercises are guided only.
- Browser speech voices vary by device; the real app should use recorded voice packs (brief §10).
- Data lives in this browser only; the real app syncs to Supabase (Mumbai) per the brief.
