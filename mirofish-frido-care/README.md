# MiroFish × Frido Care — free local setup

Runs [MiroFish](https://github.com/666ghj/MiroFish) (AGPL-3.0) on your laptop with free APIs:
NVIDIA build.nvidia.com for the LLM, Zep Cloud Free for memory. Internal experimentation only.

## 1. Get the code (once)
```bash
git clone https://github.com/666ghj/MiroFish.git
cd MiroFish
```

## 2. Configure
Copy `env.template` from this folder into the `MiroFish` folder as `.env`, then paste your NVIDIA key (`nvapi-...`) and Zep key.
- Mac: `cp /path/to/env.template .env` then `open -e .env`
- Windows (PowerShell): `copy C:\path\to\env.template .env` then `notepad .env`

## 3. Install and start
```bash
npm run setup:all   # first time only, takes a few minutes
npm run dev
```
Open http://localhost:3000 (backend runs on :5001). Stop with Ctrl+C.

## 4. First pilot
1. Fill the `[FILL: ...]` parts of `frido-care-seed.md` (no real customer data).
2. In MiroFish, upload it (accepts .md / .txt / .pdf) and paste ONE question from section 8.
3. Keep it small: ~10 rounds. Free NVIDIA limit is ~40 requests/min, so expect it to be slow.
4. Read the report, chat with a few agents to see *why* they reacted, adjust the seed, re-run.

Treat results as directional. Validate with a real signal (IG poll, physio panel, small paid test) before deciding.

## Troubleshooting
- `LLM_API_KEY 未配置` / `ZEP_API_KEY 未配置` → the key is missing in `.env`.
- 429 / rate limit errors → fewer rounds/agents, or wait a minute.
- Model errors → pick another chat model on build.nvidia.com and copy its exact model ID (e.g. `org/model-name`) into `LLM_MODEL_NAME`.
- Zep credits exhausted → wait for next month's reset or use a smaller seed file.
