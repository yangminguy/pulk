#!/bin/bash
# cloudflared quick-tunnel keeper for L5 Business OS founder-ui
# - Spawns `cloudflared tunnel --url http://localhost:13000`
# - Captures the issued trycloudflare.com URL
# - If the URL changed since last run, updates Vercel
#   NEXT_PUBLIC_API_BASE (production) and redeploys --prod
# - Waits on the cloudflared process; exits when it dies so launchd respawns

set -uo pipefail

LOG="/tmp/cloudflared-tunnel-keeper.log"
STATE_DIR="$HOME/Library/Application Support/L5"
STATE_FILE="$STATE_DIR/cloudflared-tunnel-url"
PROJECT_DIR="/Users/wonminyang/Desktop/pulk/apps/founder-ui"

PATH="/opt/homebrew/bin:/Users/wonminyang/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"
export PATH

mkdir -p "$STATE_DIR"
PREV_URL=""
[ -f "$STATE_FILE" ] && PREV_URL=$(cat "$STATE_FILE")

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
log "==== keeper start (prev=$PREV_URL) ===="

CF_LOG=$(mktemp)
cloudflared tunnel --url http://localhost:13000 --no-autoupdate >"$CF_LOG" 2>&1 &
CF_PID=$!
log "cloudflared started PID=$CF_PID log=$CF_LOG"

URL=""
for i in {1..30}; do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  log "FAILED to obtain tunnel URL after 30s — killing cloudflared"
  kill "$CF_PID" 2>/dev/null || true
  exit 1
fi

log "tunnel URL = $URL"

if [ "$URL" != "$PREV_URL" ]; then
  log "URL changed: $PREV_URL -> $URL — syncing Vercel"
  printf "%s" "$URL" > "$STATE_FILE"
  cd "$PROJECT_DIR" || { log "cd failed"; wait "$CF_PID"; exit 1; }

  # remove existing var (ignore failure) then add fresh
  printf "y\n" | vercel env rm NEXT_PUBLIC_API_BASE production >>"$LOG" 2>&1 || true
  printf "%s" "$URL" | vercel env add NEXT_PUBLIC_API_BASE production >>"$LOG" 2>&1 || \
    printf "%s" "$URL" | vercel env add NEXT_PUBLIC_API_BASE production --force >>"$LOG" 2>&1 || true

  log "redeploying --prod"
  vercel --prod --yes >>"$LOG" 2>&1 || log "redeploy failed (will retry next cycle)"
else
  log "URL unchanged — no Vercel action"
fi

log "waiting on cloudflared PID=$CF_PID"
wait "$CF_PID"
EXIT=$?
log "cloudflared exited code=$EXIT — keeper exiting for launchd respawn"
exit "$EXIT"
