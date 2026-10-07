#!/usr/bin/env bash
# One-shot MiroFish setup for Mac: clones MiroFish, asks for your keys (hidden input),
# writes a clean .env, checks the NVIDIA key works, installs everything, and starts the app.
set -euo pipefail

DIR="$HOME/MiroFish"
MODEL="${MODEL:-meta/llama-3.1-70b-instruct}"

for c in git node npm uv curl; do
  command -v "$c" >/dev/null || { echo "Missing: $c — install it first."; exit 1; }
done

[ -d "$DIR" ] || git clone https://github.com/666ghj/MiroFish.git "$DIR"
cd "$DIR"

read -rsp "Paste your NEW NVIDIA key (nvapi-...) and press Enter: " NV; echo
read -rsp "Paste your NEW Zep key and press Enter: " ZEP; echo
NV=$(printf %s "$NV" | tr -d '[:space:]')
ZEP=$(printf %s "$ZEP" | tr -d '[:space:]')
case "$NV" in nvapi-*) ;; *) echo "NVIDIA key should start with nvapi-"; exit 1;; esac
[ -n "$ZEP" ] || { echo "Zep key is empty"; exit 1; }

umask 077
cat > .env <<EOF
LLM_API_KEY=$NV
LLM_BASE_URL=https://integrate.api.nvidia.com/v1
LLM_MODEL_NAME=$MODEL
ZEP_API_KEY=$ZEP
OASIS_DEFAULT_MAX_ROUNDS=10
EOF
echo "Wrote $DIR/.env"

echo "Checking NVIDIA key with $MODEL ..."
code=$(curl -s -o /tmp/nv_check.json -w "%{http_code}" https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $NV" -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply OK\"}],\"max_tokens\":5}")
if [ "$code" != "200" ]; then
  echo "NVIDIA check failed (HTTP $code):"; cat /tmp/nv_check.json; echo
  echo "401 = wrong key. 404 = model not available: re-run with MODEL=mistralai/mistral-nemotron bash setup-mac.sh"
  exit 1
fi
echo "NVIDIA key works."

npm run setup:all
echo "Starting MiroFish — open http://localhost:3000 (Ctrl+C to stop)"
npm run dev
