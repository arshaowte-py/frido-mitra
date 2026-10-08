"""Survey every agent of a finished MiroFish simulation, one at a time, within free-tier rate limits.

Usage (on the Mac; MiroFish does not need to be running):
    ~/MiroFish/backend/.venv/bin/python ~/Downloads/survey.py sim_xxxxxxxx

Reads the agents MiroFish created for that simulation (persona, role, and their own posts during the run),
asks each one the questions below in a single paced request, and saves:
    ~/MiroFish-reports/<sim_id>-survey2.md   answers grouped by role
    ~/MiroFish-reports/<sim_id>-survey2.csv  one row per agent, for counting
Re-running resumes: agents already answered are skipped.
"""
import csv
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request

MIROFISH = os.path.expanduser(os.environ.get("MIROFISH_HOME", "~/MiroFish"))
OUT_DIR = os.path.expanduser(os.environ.get("MIROFISH_OUT", "~/MiroFish-reports"))
GAP_SECONDS = float(os.environ.get("SURVEY_GAP", "3"))  # pause between agents (free tier ~40 requests/min)

BRIEF = """Frido is an Indian ergonomic and orthopedic comfort brand (insoles, footwear, knee caps, lumbar belts, cushions,
ergonomic furniture). Frido Care is a new app: a physiotherapist or doctor assesses a patient, then writes one digital
prescription with Frido products (patient gets 10% off), Frido services (ergonomic assessment, 3D foot scan, gait analysis,
sleep assessment, physio consultation, about Rs 1,000-2,000 each) and home exercises, shared on WhatsApp. Partner physios
earn about 10-12% commission on products their patients buy (up to 15% at a higher tier); physio networks earn a 3-5%
override; doctors can only get non-cash benefits. Frido also sends its own customers and Meta-ad leads to partner physios.
Two consultation-fee designs are being considered for the patient's Rs 800-1,000 consultation fee:
Design A: refunded only if the patient then buys Frido products above a set amount (for example Rs 3,000).
Design B: returned in full as Frido credit usable on any Frido product within 30 days, with no minimum purchase.
In both designs the physio earns the same."""

QUESTIONS = [
    "Does Frido Care feel like genuine care or like a sales pitch to you, and why?",
    "How does Design A feel to you: fair, helpful, or pressure to buy? What would you do?",
    "Which do you prefer, Design A or Design B? Start with A or B, then say why.",
    "Would you use, buy from, recommend or partner with Frido Care in the next month? Start with Yes, No or Maybe, "
    "then give the single most important reason.",
    "What is your biggest worry or objection about Frido Care, and what one change would remove it?",
]


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def read_env():
    env = {}
    with open(os.path.join(MIROFISH, ".env"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    for k in ("LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL_NAME"):
        if not env.get(k):
            raise SystemExit(f"{k} missing in {MIROFISH}/.env")
    return env


def load_agents(sim_dir):
    with open(os.path.join(sim_dir, "simulation_config.json"), encoding="utf-8") as f:
        configs = {a.get("agent_id"): a for a in json.load(f).get("agent_configs", [])}
    with open(os.path.join(sim_dir, "reddit_profiles.json"), encoding="utf-8") as f:
        profiles = json.load(f)
    agents = []
    for i, p in enumerate(profiles):
        aid = p.get("user_id", i)
        c = configs.get(aid, {})
        agents.append({
            "agent_id": aid,
            "name": c.get("entity_name") or p.get("name") or p.get("username") or f"agent {aid}",
            "role": c.get("entity_type") or "Unknown",
            "profile": p,
        })
    return agents


def own_posts(sim_dir, agent_id, limit=4):
    """What this agent wrote during the simulation (best effort; empty if the tables differ)."""
    texts = []
    db = os.path.join(sim_dir, "reddit_simulation.db")
    if not os.path.exists(db):
        return texts
    try:
        conn = sqlite3.connect(db)
        for table in ("post", "comment"):
            try:
                rows = conn.execute(
                    f"SELECT content FROM {table} WHERE user_id = ? AND content IS NOT NULL "
                    f"ORDER BY created_at DESC LIMIT ?", (agent_id, limit)).fetchall()
                texts += [r[0] for r in rows if r[0]]
            except sqlite3.Error:
                pass
        conn.close()
    except sqlite3.Error:
        pass
    return [" ".join(t.split())[:400] for t in texts[:limit]]


def build_messages(agent, posts):
    p = agent["profile"]
    facts = ", ".join(f"{k}: {p[k]}" for k in ("age", "gender", "profession", "country") if p.get(k))
    persona = " ".join(str(p.get("persona") or p.get("bio") or "").split())[:2500]
    system = (f"You are {agent['name']} ({agent['role']}). {facts}\n\nWho you are: {persona}\n\n"
              "Stay fully in character. Speak in first person, honestly, from your own interests and situation. "
              "You may be negative, unsure or uninterested. Do not mention being an AI. Answer in English.")
    said = ("\n\nThings you said earlier in this discussion:\n- " + "\n- ".join(posts)) if posts else ""
    numbered = "\n".join(f"Q{i}. {q}" for i, q in enumerate(QUESTIONS, 1))
    user = (f"Background you have heard about:\n{BRIEF}{said}\n\nPlease answer each question in 1-3 sentences, "
            f"using exactly this format, one per line: Q1: ... Q2: ... up to Q{len(QUESTIONS)}:\n\n{numbered}")
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def ask(env, messages, tries=8):
    url = env["LLM_BASE_URL"].rstrip("/") + "/chat/completions"
    body = json.dumps({"model": env["LLM_MODEL_NAME"], "messages": messages,
                       "temperature": 0.7, "max_tokens": 1500}).encode()
    for attempt in range(1, tries + 1):
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Authorization": f"Bearer {env['LLM_API_KEY']}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                content = json.loads(r.read())["choices"][0]["message"].get("content") or ""
                return re.sub(r"<think>[\s\S]*?</think>", "", content).strip()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                wait = min(20 * attempt, 120)
                log(f"    HTTP {e.code}; waiting {wait}s (attempt {attempt}/{tries})")
                time.sleep(wait)
                continue
            raise SystemExit(f"LLM error HTTP {e.code}: {e.read()[:300]!r}")
        except Exception as e:  # network hiccup
            log(f"    {e}; waiting 20s (attempt {attempt}/{tries})")
            time.sleep(20)
    return None


def parse(text):
    answers = {}
    for m in re.finditer(r"Q(\d+)\s*[:.)-]\s*(.*?)(?=\n?\s*Q\d+\s*[:.)-]|\Z)", text or "", re.S):
        answers[int(m.group(1))] = " ".join(m.group(2).split())
    return answers


def first_word(s, options):
    """Leading choice such as 'A', 'Design B', 'Yes', 'maybe' -> normalised option, else ''."""
    m = re.match(r"\W*(?:design\s*)?(\w+)", s or "", re.I)
    w = m.group(1).capitalize() if m else ""
    w = w.upper() if len(w) == 1 else w
    return w if w in options else ""


def main():
    if len(sys.argv) < 2 or not sys.argv[1].startswith("sim_"):
        raise SystemExit("Usage: survey.py sim_xxxxxxxx")
    sim = sys.argv[1]
    sim_dir = os.path.join(MIROFISH, "backend", "uploads", "simulations", sim)
    if not os.path.isdir(sim_dir):
        raise SystemExit(f"Simulation folder not found: {sim_dir}")
    env = read_env()
    agents = load_agents(sim_dir)
    os.makedirs(OUT_DIR, exist_ok=True)
    raw_path = os.path.join(OUT_DIR, f"{sim}-survey2.jsonl")
    done = {}
    if os.path.exists(raw_path):
        with open(raw_path, encoding="utf-8") as f:
            for line in f:
                r = json.loads(line)
                done[r["agent_id"]] = r
    log(f"Survey of {len(agents)} agents in {sim} with {env['LLM_MODEL_NAME']} ({len(done)} already done)")

    for n, a in enumerate(agents, 1):
        if a["agent_id"] in done:
            continue
        log(f"[{n}/{len(agents)}] {a['name']} ({a['role']})")
        text = ask(env, build_messages(a, own_posts(sim_dir, a["agent_id"])))
        rec = {"agent_id": a["agent_id"], "name": a["name"], "role": a["role"],
               "raw": text, "answers": parse(text) if text else {}}
        if not text:
            log("    no answer after retries; will retry on the next run")
        else:
            with open(raw_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            done[a["agent_id"]] = rec
        time.sleep(GAP_SECONDS)

    rows = sorted(done.values(), key=lambda r: (r["role"], r["name"]))
    md_path = os.path.join(OUT_DIR, f"{sim}-survey2.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(f"# Agent survey for {sim}\n\n{len(rows)} of {len(agents)} agents answered "
                f"(model {env['LLM_MODEL_NAME']}).\n\n## Background given to every agent\n\n{BRIEF}\n\n")
        for qi, q in enumerate(QUESTIONS, 1):
            f.write(f"## Q{qi}. {q}\n\n")
            for r in rows:
                ans = {int(k): v for k, v in r["answers"].items()}.get(qi)
                if ans:
                    f.write(f"- **{r['name']}** ({r['role']}): {ans}\n")
            f.write("\n")
        unparsed = [r for r in rows if not r["answers"]]
        if unparsed:
            f.write("## Answers not in Q1-Q5 format (raw)\n\n")
            for r in unparsed:
                f.write(f"- **{r['name']}** ({r['role']}): {' '.join((r['raw'] or '').split())}\n")
    csv_path = os.path.join(OUT_DIR, f"{sim}-survey2.csv")
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "role", "prefers", "will_use"] + [f"Q{i}" for i in range(1, len(QUESTIONS) + 1)])
        for r in rows:
            ans = {int(k): v for k, v in r["answers"].items()}
            w.writerow([r["name"], r["role"], first_word(ans.get(3), {"A", "B"}),
                        first_word(ans.get(4), {"Yes", "No", "Maybe"})] +
                       [ans.get(i, "") for i in range(1, len(QUESTIONS) + 1)])
    log(f"DONE. {len(rows)}/{len(agents)} agents answered.\n  {md_path}\n  {csv_path}")
    if len(rows) < len(agents):
        log("Some agents did not answer; run the same command again to retry only those.")


if __name__ == "__main__":
    main()
