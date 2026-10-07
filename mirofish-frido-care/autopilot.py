"""Run a prepared MiroFish simulation to a finished report, unattended.

Usage (on the Mac, with `npm run dev` already running in another window):
    caffeinate -dimsu ~/MiroFish/backend/.venv/bin/python ~/Downloads/autopilot.py sim_xxxxxxxx [rounds]

It waits for environment setup to finish, starts the simulation, waits for it to
complete, generates the report and saves it to ~/MiroFish-reports/<sim_id>.md.
"""
import json
import os
import sys
import time
import urllib.request

API = "http://localhost:5001/api"
SIM = sys.argv[1] if len(sys.argv) > 1 else ""
ROUNDS = int(sys.argv[2]) if len(sys.argv) > 2 else 5
OUT_DIR = os.path.expanduser("~/MiroFish-reports")


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def call(method, path, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                payload = r.read()
                return payload if raw else json.loads(payload)
        except Exception as e:  # backend busy or briefly unreachable
            log(f"  request {path} failed ({e}); retrying in 30s")
            time.sleep(30)
    raise SystemExit(f"Backend not reachable for {path}. Is `npm run dev` still running?")


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

    # 3. Wait for the simulation to finish.
    while True:
        run = call("GET", f"/simulation/{SIM}/run-status")["data"]
        rs = run.get("runner_status")
        log(f"  round {run.get('current_round')}/{run.get('total_rounds')} "
            f"actions {run.get('total_actions_count')} status {rs}")
        if rs in ("completed", "stopped"):
            break
        if rs == "failed":
            raise SystemExit("Simulation failed. Check the npm run dev window.")
        time.sleep(120)
    log("Simulation finished")

    # 4. Generate the report.
    res = call("POST", "/report/generate", {"simulation_id": SIM})
    if not res.get("success"):
        raise SystemExit(f"Could not start report: {res.get('error')}")
    task_id = res["data"].get("task_id")
    while True:
        st = call("POST", "/report/generate/status", {"task_id": task_id, "simulation_id": SIM})["data"]
        log(f"  report {st.get('status')} {st.get('progress')}% {st.get('message', '')[:80]}")
        if st.get("status") == "completed":
            break
        if st.get("status") == "failed":
            raise SystemExit("Report generation failed. Check the npm run dev window.")
        time.sleep(60)

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
