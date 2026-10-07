#!/usr/bin/env bash
# Make MiroFish wait and retry (up to 20 times) when the free LLM API answers 429 Too Many Requests,
# instead of failing the step. Safe to run more than once.
set -euo pipefail
cd "$HOME/MiroFish/backend"
for f in app/utils/llm_client.py app/services/simulation_config_generator.py app/services/oasis_profile_generator.py; do
  grep -q "max_retries=20" "$f" || perl -0pi -e 's/OpenAI\(\n(\s+)api_key=/OpenAI(\n$1max_retries=20,\n$1api_key=/g' "$f"
done
grep -c "max_retries=20" app/utils/llm_client.py app/services/simulation_config_generator.py app/services/oasis_profile_generator.py
echo "Patched. Restart MiroFish (Ctrl+C in the npm run dev window, then npm run dev)."
