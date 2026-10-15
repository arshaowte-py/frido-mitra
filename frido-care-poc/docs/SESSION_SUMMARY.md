# Session summary record

Schema id: `frido.care.session-summary/1` (see `js/records.js`). One record per exercise per session. A guided class with three exercises produces three records sharing one `sessionId`.

Records contain numbers and short text only: no images, video or names. They are stored on the device (`localStorage` key `fc_sessions_v1`) only when the participant has given trial consent, and leave the device only through **Physio view → Share records** (JSON) or **Download CSV**.

## Identifiers (stable, for integration with the main Frido Care app)

| Field | Meaning |
|---|---|
| `recordId` | UUID of this record |
| `sessionId` | UUID of the session (one class run, or one single-exercise session) |
| `participantId` | Trial participant code entered at consent (e.g. `FC-T07`), upper-cased; `null` if none given. Maps to the patient id in the main app later. |
| `deviceId` | Random UUID created once per browser/device |
| `exerciseId` | Exercise slug from `js/exercises.js` (e.g. `plantar-stretch`). Stable; maps to `exercises.slug` in the main app brief. |
| `classId` | Guided class id (e.g. `heel-pain`) or `null` |
| `appVersion`, `specVersion` | POC build and the version of exercise specs / lesson scripts used. Bump `specVersion` when physios approve changes. |

## Fields

| Field | Meaning |
|---|---|
| `source` | `guided_class` or `single_exercise` |
| `mode` | `camera`, `video_file` or `no_camera` |
| `dose` | `quick` or `full` (guided class), else `null` |
| `startedAt`, `endedAt` | ISO 8601 timestamps |
| `reps.prescribed` | Reps the plan asked for |
| `reps.cameraCounted` | Reps where the camera saw a full movement. `null` when no camera was used. |
| `reps.notCounted` | Attempts the camera saw that fell short of the counting threshold |
| `reps.unassessed` | Prescribed reps the camera never assessed (set skipped, person out of frame, tracking failed, or no camera) |
| `reps.selfPaced` | Reps done to the voice timer without a camera (not verified) |
| `holds.prescribed` / `holds.completed` | Number of holds asked for / completed in position |
| `holds.prescribedSeconds` / `holds.heldSeconds` | Seconds asked for / seconds held in position (camera-verified when `holds.verified`) |
| `holds.outOfPositionSeconds` | Seconds during holds when the person was out of position (timer paused) |
| `holds.notStarted` | Holds never reached (skipped or class ended) |
| `trackingCoverage` | Share of time on this exercise's teaching steps when all required joints were visible (0–1). `null` without camera. |
| `quality.avgFormScore`, `quality.perRep` | Form score per counted rep (0–100) and its average |
| `quality.steadiness` | Average balance steadiness (0–100) |
| `formIssues[]` | `{ key, label, count, of }` form faults over counted reps; includes reported pain during the exercise |
| `stepsNotChecked` | Teaching steps the camera could not confirm (coach moved on and said the step would not be scored) |
| `stepsSkippedByUser` | Steps the person skipped with Next |
| `checkins[]` | `{ key, value }` answers to coach questions (`yes` / `no` / `pain`) |
| `painBefore`, `painAfter`, `difficulty` | 0–10 ratings, `null` if not answered |
| `flags[]` | Safety flags raised during the exercise (e.g. `pain_during`) |

Questions asked to the coach are stored separately (`fc_questions_v1`): `{ q, a, source: on-device|ai|saved, flagged, stop, exercise, sessionId, participantId, at }` and included in the JSON export.

The export bundle is `{ schema, exportedAt, participantId, deviceId, consent, sessions[], questions[] }`. The CSV has one row per record with the reps/holds breakdown flattened into columns.
