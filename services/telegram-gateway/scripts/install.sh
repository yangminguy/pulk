#!/usr/bin/env bash
# Install the L5 Telegram Gateway as a persistent launchd service (macOS).
# Usage:
#   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=12345 bash scripts/install.sh
#
# Re-run after `pnpm --filter @l5/telegram-gateway build` to pick up new code.
set -euo pipefail

GATEWAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_PATH="$(command -v node)"
LOG_DIR="${HOME}/.l5/logs"
PLIST_SRC="${GATEWAY_DIR}/launchd/com.l5.telegram-gateway.plist"
PLIST_DST="${HOME}/Library/LaunchAgents/com.l5.telegram-gateway.plist"

# --- Reuse the existing bot token/chat id ---------------------------------
# The same Telegram bot already powers Hermes outbound notifications. If the
# caller didn't pass TELEGRAM_BOT_TOKEN/CHAT_ID, auto-discover them from an
# already-installed com.l5.hermes.* LaunchAgent so the Founder never re-types.
LA_DIR="${HOME}/Library/LaunchAgents"
plist_env() { # $1=plist $2=key
  /usr/libexec/PlistBuddy -c "Print :EnvironmentVariables:$2" "$1" 2>/dev/null || true
}
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  for p in "${LA_DIR}"/com.l5.hermes.*.plist; do
    [ -f "$p" ] || continue
    [ -z "${TELEGRAM_BOT_TOKEN:-}" ] && TELEGRAM_BOT_TOKEN="$(plist_env "$p" TELEGRAM_BOT_TOKEN)"
    [ -z "${TELEGRAM_CHAT_ID:-}" ] && TELEGRAM_CHAT_ID="$(plist_env "$p" TELEGRAM_CHAT_ID)"
  done
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && echo "reusing TELEGRAM_BOT_TOKEN from existing Hermes LaunchAgent"
  [ -n "${TELEGRAM_CHAT_ID:-}" ] && echo "reusing TELEGRAM_CHAT_ID from existing Hermes LaunchAgent"
fi

: "${TELEGRAM_BOT_TOKEN:?set TELEGRAM_BOT_TOKEN (or install a Hermes LaunchAgent that has it)}"
: "${TELEGRAM_CHAT_ID:?set TELEGRAM_CHAT_ID (or install a Hermes LaunchAgent that has it)}"

if [ ! -f "${GATEWAY_DIR}/dist/index.js" ]; then
  echo "dist/index.js not found — build first: pnpm --filter @l5/telegram-gateway build" >&2
  exit 1
fi

mkdir -p "${LOG_DIR}" "$(dirname "${PLIST_DST}")"

# Substitute placeholders + inject secrets into a private LaunchAgents copy.
sed \
  -e "s|__NODE_PATH__|${NODE_PATH}|g" \
  -e "s|__GATEWAY_DIR__|${GATEWAY_DIR}|g" \
  -e "s|__LOG_DIR__|${LOG_DIR}|g" \
  "${PLIST_SRC}" > "${PLIST_DST}"

# Inject env (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) into the EnvironmentVariables dict.
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:TELEGRAM_BOT_TOKEN string ${TELEGRAM_BOT_TOKEN}" "${PLIST_DST}" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:TELEGRAM_BOT_TOKEN ${TELEGRAM_BOT_TOKEN}" "${PLIST_DST}"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:TELEGRAM_CHAT_ID string ${TELEGRAM_CHAT_ID}" "${PLIST_DST}" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:TELEGRAM_CHAT_ID ${TELEGRAM_CHAT_ID}" "${PLIST_DST}"
# Optional pass-through env vars (only injected when set in the caller's env).
inject_env() { # $1=key $2=value
  [ -z "${2:-}" ] && return 0
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:$1 string $2" "${PLIST_DST}" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:$1 $2" "${PLIST_DST}"
}
inject_env PULK_DIR "${PULK_DIR:-}"
inject_env TELEGRAM_AGENT_MODEL "${TELEGRAM_AGENT_MODEL:-}"
inject_env TELEGRAM_CLAUDE_ARGS "${TELEGRAM_CLAUDE_ARGS:-}"
inject_env TELEGRAM_RUN_TIMEOUT_MS "${TELEGRAM_RUN_TIMEOUT_MS:-}"
inject_env CLAUDE_BIN "${CLAUDE_BIN:-}"

launchctl unload "${PLIST_DST}" 2>/dev/null || true
launchctl load "${PLIST_DST}"
echo "loaded com.l5.telegram-gateway"
echo "logs: ${LOG_DIR}/telegram-gateway.log"
