// Frido Care · on-device pose detection (MediaPipe Pose Landmarker, served locally, no network calls).
// Frames are never stored or uploaded: they go straight from the <video> element into the model.
import { FilesetResolver, PoseLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

let cache = {};

export function defaultModel() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;
  return mobile ? 'lite' : 'full';
}

export async function loadLandmarker(model = defaultModel()) {
  if (cache[model]) return cache[model];
  cache[model] = (async () => {
    const vision = await FilesetResolver.forVisionTasks(new URL('../vendor/mediapipe/wasm', import.meta.url).href);
    const opts = delegate => ({
      baseOptions: { modelAssetPath: new URL(`../models/pose_landmarker_${model}.task`, import.meta.url).href, delegate },
      runningMode: 'VIDEO', numPoses: 2,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { return { lm: await PoseLandmarker.createFromOptions(vision, opts('GPU')), delegate: 'GPU', model }; }
    catch (e) { console.warn('GPU delegate failed, using CPU', e); return { lm: await PoseLandmarker.createFromOptions(vision, opts('CPU')), delegate: 'CPU', model }; }
  })();
  return cache[model];
}

/** Pick the largest, most central person when more than one is detected. */
export function pickPerson(landmarks) {
  if (!landmarks?.length) return { person: null, people: 0 };
  if (landmarks.length === 1) return { person: landmarks[0], people: 1 };
  let best = null, bestScore = -1;
  for (const l of landmarks) {
    const xs = l.map(p => p.x), ys = l.map(p => p.y);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const score = area * (1 - Math.abs(cx - 0.5));
    if (score > bestScore) { bestScore = score; best = l; }
  }
  return { person: best, people: landmarks.length };
}
