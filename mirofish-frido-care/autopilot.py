"""Run a prepared MiroFish simulation to a finished report, unattended.

Usage (on the Mac, with `npm run dev` already running in another window):
    caffeinate -dimsu ~/MiroFish/backend/.venv/bin/python ~/Downloads/autopilot.py sim_xxxxxxxx [rounds|auto] [survey]

- rounds: a number caps the simulation length; `auto` keeps the length MiroFish planned (more activity).
- survey: after the last round, interview every agent with SURVEY_QUESTIONS before the run closes
  (saved to ~/MiroFish-reports/<sim_id>-survey.md).

It waits for environment setup to finish, starts the simulation, waits for it to complete,
generates the report in English and saves it to ~/MiroFish-reports/<sim_id>.md.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = os.environ.get("MIROFISH_API", "http://localhost:5001/api")
SIM = sys.argv[1] if len(sys.argv) > 1 else ""
ROUNDS_ARG = sys.argv[2] if len(sys.argv) > 2 else "auto"
ROUNDS = None if ROUNDS_ARG == "auto" else int(ROUNDS_ARG)
SURVEY = "survey" in sys.argv[3:]
OUT_DIR = os.path.expanduser(os.environ.get("MIROFISH_OUT", "~/MiroFish-reports"))
POLL = int(os.environ.get("MIROFISH_POLL", "60"))  # seconds between status checks

# Asked to every agent (one platform) after the last round, before the environment closes.
SURVEY_QUESTIONS = [
    "From your own situation, what do you honestly think of Frido Care, the app where a physiotherapist assesses you "
    "and prescribes Frido products, services and exercises? Does it feel like genuine care or like a sales pitch, and why?",
    "Fee Design A: the patient pays about Rs 800-1,000 for the consultation, refunded only if they then buy Frido "
    "products above a set amount (for example Rs 3,000). How does Design A feel to you: fair, helpful, or pressure to "
    "buy? What would you do?",
    "Fee Design B: the patient pays the same Rs 800-1,000, and the full amount comes back as Frido credit usable on any "
    "Frido product within 30 days, with no minimum purchase. Which do you prefer, A or B, and why? Start your answer "
    "with A or B.",
    "Would you use, buy from, recommend or partner with Frido Care in the next month? Start your answer with yes, no or "
    "maybe, then give the single most important reason.",
    "What is your biggest worry or objection about Frido Care, and what one change would remove it?",
]


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def call(method, path, body=None, raw=False, timeout=120, retries=5):
    data = json.dumps(body).encode() if body is not None else None
    # Accept-Language picks the language MiroFish writes in; without it the report comes out in Chinese.
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Content-Type": "application/json", "Accept-Language": "en"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                payload = r.read()
                return payload if raw else json.loads(payload)
        except urllib.error.HTTPError as e:  # API answered with an error: return its JSON
            payload = e.read()
            try:
                return json.loads(payload)
            except ValueError:
                return {"success": False, "error": f"HTTP {e.code}"}
        except Exception as e:  # backend busy or briefly unreachable
            if attempt + 1 == retries:
                break
            log(f"  request {path} failed ({e}); retrying in 30s")
            time.sleep(30)
    return {"success": False, "error": f"no answer from backend for {path}. Is `npm run dev` still running?"}


def must(res, what):
    if not res.get("success"):
        raise SystemExit(f"{what} failed: {res.get('error')}")
    return res.get("data")


def run_survey():
    """Interview every agent with SURVEY_QUESTIONS and save the answers as Markdown, grouped by agent type."""
    config = must(call("GET", f"/simulation/{SIM}/config"), "Reading simulation config")
    agents = {a.get("agent_id"): a for a in config.get("agent_configs", [])}
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{SIM}-survey.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# Agent survey for {SIM}\n\n{len(agents)} agents, interviewed on the Reddit-style platform.\n\n")
    answered = 0
    for qi, q in enumerate(SURVEY_QUESTIONS, 1):
        log(f"Survey question {qi}/{len(SURVEY_QUESTIONS)} to {len(agents)} agents (several minutes on the free tier)")
        # One attempt only: re-sending would interview everyone twice.
        res = call("POST", "/simulation/interview/all",
                   {"simulation_id": SIM, "prompt": q, "platform": "reddit", "timeout": 1800},
                   timeout=1900, retries=1)
        results = ((res.get("data") or {}).get("result") or {}).get("results") or {}
        if not res.get("success"):
            log(f"  question {qi} failed: {res.get('error')}")
        rows = []
        for r in results.values():
            a = agents.get(r.get("agent_id"), {})
            answer = r.get("response")
            if answer:
                rows.append((a.get("entity_type") or "Unknown", a.get("entity_name") or f"agent {r.get('agent_id')}",
                             " ".join(str(answer).split())))
        rows.sort()
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"## Q{qi}. {q}\n\n")
            for etype, name, answer in rows:
                f.write(f"- **{name}** ({etype}): {answer}\n")
            if not rows:
                f.write("_No answers received for this question._\n")
            f.write("\n")
        answered += len(rows)
        log(f"  saved {len(rows)} answers")
    log(f"Survey saved to {path} ({answered} answers in total)")


def main():
    if not SIM.startswith("sim_"):
        raise SystemExit("Pass the simulation id from the browser URL, e.g. sim_ab739a073eb8")

    log(f"Autopilot for {SIM}, rounds={ROUNDS_ARG}, survey={'on' if SURVEY else 'off'}")

    # 1. Wait for environment setup (persona + config generation) to finish.
    while True:
        status = must(call("GET", f"/simulation/{SIM}"), "Reading simulation status")["status"]
        if status in ("ready", "running", "completed", "stopped"):
            break
        if status == "failed":
            raise SystemExit("Environment setup failed. Check the npm run dev window.")
        log(f"  setup status: {status}")
        time.sleep(POLL)

    # 2. Start the simulation unless it is already running or done.
    run = must(call("GET", f"/simulation/{SIM}/run-status"), "Reading run status")
    if status == "ready" and run.get("runner_status") in ("idle", None):
        body = {
            "simulation_id": SIM,
            "platform": "parallel",
            # Off to stay inside the Zep free quota; the report still reads the simulation logs.
            "enable_graph_memory_update": False,
        }
        if ROUNDS:
            body["max_rounds"] = ROUNDS
        must(call("POST", "/simulation/start", body), "Starting the simulation")
        log("Simulation started")
    elif SURVEY and run.get("runner_status") in ("completed", "stopped"):
        log("WARNING: this simulation is already closed, so its agents can no longer be interviewed. "
            "Survey skipped; start a new simulation to get survey answers.")

    # 3. Wait for the simulation to finish. After the last round the simulation process
    #    stays open (waiting for agent interviews) and keeps reporting "running", so once
    #    both platforms report completion we run the survey, then close the environment.
    closed = False
    while True:
        run = must(call("GET", f"/simulation/{SIM}/run-status"), "Reading run status")
        rs = run.get("runner_status")
        log(f"  round {run.get('current_round')}/{run.get('total_rounds')} "
            f"actions {run.get('total_actions_count')} status {rs} "
            f"done twitter={run.get('twitter_completed')} reddit={run.get('reddit_completed')}")
        if rs in ("completed", "stopped"):
            break
        if rs == "failed":
            raise SystemExit("Simulation failed. Check the npm run dev window.")
        if not closed and run.get("twitter_completed") and run.get("reddit_completed"):
            if SURVEY:
                run_survey()
            log("All rounds done; closing the simulation environment")
            res = call("POST", "/simulation/close-env", {"simulation_id": SIM, "timeout": 60}, timeout=180)
            if not res.get("success"):
                log(f"  close-env failed ({res.get('error')}); stopping instead")
                call("POST", "/simulation/stop", {"simulation_id": SIM}, timeout=180)
            closed = True
        time.sleep(POLL)
    log("Simulation finished")

    # 4. Generate the report. Free LLM tiers rate-limit, so retry a failed report a few times.
    for attempt in range(1, 4):
        data = must(call("POST", "/report/generate", {"simulation_id": SIM}), "Starting the report")
        task_id = data.get("task_id")
        log(f"Report attempt {attempt} started")
        while True:
            st = must(call("POST", "/report/generate/status", {"task_id": task_id, "simulation_id": SIM}),
                      "Reading report status")
            log(f"  report {st.get('status')} {st.get('progress')}% {str(st.get('message', ''))[:80]}")
            if st.get("status") in ("completed", "failed"):
                break
            time.sleep(POLL)
        if st.get("status") == "completed":
            break
        log("  report failed; waiting 5 minutes before retrying")
        time.sleep(5 * POLL)
    else:
        raise SystemExit("Report generation failed 3 times. Check the npm run dev window.")

    # 5. Save the report. A simulation can have several reports (e.g. an earlier failed
    #    attempt), so take the newest completed one.
    reports = must(call("GET", f"/report/list?simulation_id={SIM}"), "Listing reports") or []
    done = [r for r in reports if r.get("status") == "completed" and r.get("report_id")]
    if not done:
        raise SystemExit("No completed report found for this simulation.")
    report_id = max(done, key=lambda r: r.get("completed_at") or r.get("created_at") or "")["report_id"]
    md = call("GET", f"/report/{report_id}/download", raw=True)
    if not isinstance(md, bytes) or not md.strip():
        raise SystemExit(f"Report {report_id} downloaded empty.")
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{SIM}.md")
    with open(path, "wb") as f:
        f.write(md)
    log(f"DONE. Report saved to {path} ({len(md)} bytes)")


if __name__ == "__main__":
    main()
