# Trial readiness (against the POC trial brief)

Status of the brief's §4 "Minimum readiness before trial". ✅ done in the POC · 🟡 partly · ⬜ needs a decision or work outside the code.

| Brief requirement | Status | Where / what is left |
|---|---|---|
| Physio-approved exercises, dosage, instructions and tracking criteria | ⬜ | All content is in `js/exercises.js` (specs, thresholds) and `js/lessons.js` (class scripts, dosage). Everything outside the foot protocol is marked "Draft". Needs a physio review session; then bump `SPEC_VERSION` in `js/records.js`. Hindi lines need a native-speaking physio. |
| Clear camera setup guidance | ✅ | Setup card per exercise and class; live camera check (lighting, body in view, distance, one person); gate hints when stuck. |
| Honest handling of untrackable movements or technical failures | ✅ | Toe exercises are guided only (stated on screen). When the camera can't confirm a step, the coach says "this step won't be scored" and the record counts it as not checked / unassessed. Holds pause when position is lost. No-camera mode never reports camera counts. |
| Summaries distinguish prescribed, completed, camera-estimated and unassessed reps | ✅ | `reps.prescribed / cameraCounted / notCounted / unassessed / selfPaced`, hold seconds held vs out of position, `trackingCoverage`. Shown in the class summary and physio table. See `docs/SESSION_SUMMARY.md`. |
| Reliable export or secure storage beyond one browser/device | 🟡 | Export done: Physio view → Share records (phone share sheet, e.g. WhatsApp to the physio) or Download CSV. Central secure storage is not built yet: needs a decision on where trial data may live (e.g. Supabase in Mumbai, as in the main-app brief). |
| Consent, data access and retention rules | 🟡 | Consent screen with participant code, versioned (`trial-consent-1`), choice to exercise without saving, delete in Physio view. Wording needs legal review; retention period and who may access exports need to be set by the trial owner. |
| No false claims that a physio was notified | ✅ | All copy now says results are "in your session record" and that the app does not contact the physio by itself; red-flag answers tell the patient to call their physio. |

## Suggested additions to the brief

- **Counting-agreement method:** per exercise, per set: % of sets where camera count equals the physio count (and ±1), plus mean absolute error. Report holds as camera-timed vs stopwatch seconds.
- **Assessable reps:** use `trackingCoverage` and `reps.unassessed` from the records as the evidence for the "≥90% assessable" target.
- **Device mix:** include at least one budget Android (₹8–12k), one mid-range Android and one iPhone; tracking quality varies most with the phone.
- **Safety protocol:** who reviews flagged answers and how often during the trial (the app itself sends nothing); what counts as an adverse event.
- **AI coach:** decide whether AI answers are on during the trial. Safety, form and timing answers are on-device and fixed; other questions go to Claude only if the Netlify Function has an API key. With no key, questions are logged for the physio.
- **Guided class measure:** e.g. "≥80% of participants complete their first guided class without physio help", since teaching (not just counting) is what leadership asked for.
