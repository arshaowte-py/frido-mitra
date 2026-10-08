# Frido Care — Run 2 (survey run) steps

Uses `frido-care-seed-v2.md` (compares fee Design A vs Design B) and `autopilot.py` with survey mode.

## Before you start
- MiroFish was patched on the Mac to retry rate-limited AI calls (`max_retries=20`). Check it is still there:
  `grep -c "max_retries=20" ~/MiroFish/backend/app/utils/llm_client.py` → must print `1`.
- MiroFish running in Terminal window 1: `cd ~/MiroFish && npm run dev`.

## Steps
1. Download `frido-care-seed-v2.md` and `autopilot.py` (Download raw file on GitHub).
2. Open http://localhost:3000 and press Cmd+Shift+R. Set the language dropdown (top right) to **English**.
3. Upload `frido-care-seed-v2.md` and paste the question:
   > Compare consultation-fee Design A (refund only above a purchase threshold) with Design B (fee returned as Frido
   > credit on any purchase). How do physio-referred patients, existing Frido customers, Meta-ad leads, physios, Frido's
   > own staff, doctors and network heads perceive Frido Care under each design? Does it feel like care or a sales pitch,
   > who would use or recommend it, and what are the main objections?
4. Let step 1 (graph) finish, then click **Enter Environment Setup**. The page address changes to
   `localhost:3000/simulation/sim_XXXXXXXX`. Copy the `sim_XXXXXXXX` part.
5. **Close the MiroFish browser tab.** Setup continues on its own. Do NOT click "Start simulation" and do NOT
   reopen or reload MiroFish pages until the end: the simulation page force-restarts the run, and the report page
   regenerates the report.
6. In Terminal window 2:
   ```bash
   NEW=$(ls -t ~/Downloads/autopilot*.py | head -1); grep -c "Fee Design A" "$NEW"
   caffeinate -dimsu ~/MiroFish/backend/.venv/bin/python "$NEW" sim_XXXXXXXX auto survey
   ```
   The grep line must print `1` (proves it is the new script).
7. Leave both windows open, Mac plugged in, lid open. Expected 2–4 hours on the free tier.

## Results
- Survey: `~/MiroFish-reports/sim_XXXXXXXX-survey.md` (every agent's answers, grouped by role) — the main output.
- Report: `~/MiroFish-reports/sim_XXXXXXXX.md` (in English).
Upload both to Claude for analysis.

## If something goes wrong
- `Environment setup failed` or `Simulation failed`: send the last 30 lines of window 1.
- `question N failed`: the survey continues; the answers that did arrive are kept.
- `Report generation failed 3 times`: the survey file is still saved; send window 1's last lines.
