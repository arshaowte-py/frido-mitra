"""Run a prepared MiroFish simulation to a finished report, unattended.

Usage (on the Mac, with `npm run dev` already running in another window):
    caffeinate -dimsu ~/MiroFish/backend/.venv/bin/python ~/Downloads/autopilot.py sim_xxxxxxxx [rounds] [survey]

Add the word `survey` to interview every agent with the Frido Care questions before the run closes
(saved to ~/MiroFish-reports/<sim_id>-survey.md).

It waits for environment setup to finish, starts the simulation, waits for it to
complete, generates the report and saves it to ~/MiroFish-reports/<sim_id>.md.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "http://localhost:5001/api"
SIM = sys.argv[1] if len(sys.argv) > 1 else ""
ROUNDS = int(sys.argv[2]) if len(sys.argv) > 2 else 5
OUT_DIR = os.path.expanduser("~/MiroFish-reports")
SURVEY = "survey" in sys.argv[3:]

# Asked to every agent (one platform) after the last round, before the environment closes.
SURVEY_QUESTIONS = [
    "In your own words and from your own situation: what do you honestly think of Frido Care, the app where a "
    "physiotherapist assesses you and prescribes Frido products, services and exercises? Does it feel like genuine "
    "care or like a sales pitch, and why?",
    "The patient pays a consultation fee of about Rs 800-1,000, refunded if they then buy Frido products above a set "
    "amount. Does that feel fair, helpful, or like pressure to buy? What would you do?",
    "Would you use, buy from, recommend or partner with Frido Care in the next month? Answer yes, no or maybe, then "
    "give the single most important reason.",
    "What is your biggest worry or objection about Frido Care, and what one change would remove it?",
]


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def call(method, path, body=None, raw=False, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    for attempt in range(5):
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
            log(f"  request {path} failed ({e}); retrying in 30s")
            time.sleep(30)
    raise SystemExit(f"Backend not reachable for {path}. Is `npm run dev` still running?")


def run_survey():
    """Interview every agent with SURVEY_QUESTIONS and save the answers as Markdown."""
    profiles = call("GET", f"/simulation/{SIM}/profiles?platform=reddit")["data"]["profiles"]
    names = {}
    for i, p in enumerate(profiles):
        aid = p.get("user_id", i)
        names[aid] = p.get("name") or p.get("realname") or p.get("username") or f"agent {aid}"
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{SIM}-survey.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# Agent survey for {SIM}\n\n")
    for qi, q in enumerate(SURVEY_QUESTIONS, 1):
        log(f"Survey question {qi}/{len(SURVEY_QUESTIONS)} to {len(profiles)} agents (slow on free tier)")
        res = call("POST", "/simulation/interview/all",
                   {"simulation_id": SIM, "prompt": q, "platform": "reddit", "timeout": 1800},
                   timeout=1900)
        results = ((res.get("data") or {}).get("result") or {}).get("results") or {}
        if not res.get("success"):
            log(f"  question {qi} failed: {res.get('error')}")
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"## Q{qi}. {q}\n\n")
            for key, r in sorted(results.items(), key=lambda kv: kv[1].get("agent_id", 0)):
                who = names.get(r.get("agent_id"), f"agent {r.get('agent_id')}")
                answer = str(r.get("response", "")).strip().replace("\n", " ")
                f.write(f"- **{who}**: {answer}\n")
            f.write("\n")
        log(f"  saved {len(results)} answers")
    log(f"Survey saved to {path}")


def main():
    if not SIM.startswith("sim_"):
        raise SystemExit("Pass the simulation id from the browser URL, e.g. sim_ab739a073eb8")

    log(f"Autopilot for {SIM}, {ROUNDS} rounds")

    # 1. Wait for environment setup (persona + config generation) to finish.
    while True:
        status = call("GET", f"/simulation/{SIM}")["data"]["status"]
        if status in ("ready", "running", "completed", "stopped"):
            break
        if status == "failed":
            raise SystemExit("Environment setup failed. Check the npm run dev window.")
        log(f"  setup status: {status}")
        time.sleep(60)

    # 2. Start the simulation unless it is already running or done.
    run = call("GET", f"/simulation/{SIM}/run-status")["data"]
    if run.get("runner_status") in ("idle", None) and status == "ready":
        res = call("POST", "/simulation/start", {
            "simulation_id": SIM,
            "platform": "parallel",
            "max_rounds": ROUNDS,
            # Off to stay inside the Zep free quota; the report still reads the simulation logs.
            "enable_graph_memory_update": False,
        })
        if not res.get("success"):
            raise SystemExit(f"Could not start: {res.get('error')}")
        log("Simulation started")

    # 3. Wait for the simulation to finish. After the last round the simulation process
    #    stays open (waiting for agent interviews) and keeps reporting "running", so once
    #    both platforms report completion we close the environment ourselves.
    closed = False
    while True:
        run = call("GET", f"/simulation/{SIM}/run-status")["data"]
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
            res = call("POST", "/simulation/close-env", {"simulation_id": SIM, "timeout": 60})
            if not res.get("success"):
                log(f"  close-env failed ({res.get('error')}); stopping instead")
                call("POST", "/simulation/stop", {"simulation_id": SIM})
            closed = True
        time.sleep(60 if closed else 120)
    log("Simulation finished")

    # 4. Generate the report. Free LLM tiers rate-limit, so retry a failed report a few times.
    for attempt in range(1, 4):
        res = call("POST", "/report/generate", {"simulation_id": SIM})
        if not res.get("success"):
            raise SystemExit(f"Could not start report: {res.get('error')}")
        task_id = res["data"].get("task_id")
        log(f"Report attempt {attempt} started")
        while True:
            st = call("POST", "/report/generate/status", {"task_id": task_id, "simulation_id": SIM})["data"]
            log(f"  report {st.get('status')} {st.get('progress')}% {str(st.get('message', ''))[:80]}")
            if st.get("status") in ("completed", "failed"):
                break
            time.sleep(60)
        if st.get("status") == "completed":
            break
        log("  report failed; waiting 5 minutes before retrying")
        time.sleep(300)
    else:
        raise SystemExit("Report generation failed 3 times. Check the npm run dev window.")

    # 5. Save the report.
    report_id = call("GET", f"/report/by-simulation/{SIM}")["data"]["report_id"]
    md = call("GET", f"/report/{report_id}/download", raw=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{SIM}.md")
    with open(path, "wb") as f:
        f.write(md)
    log(f"DONE. Report saved to {path}")


if __name__ == "__main__":
    main()
