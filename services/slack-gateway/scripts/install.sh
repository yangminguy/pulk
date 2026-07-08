#!/usr/bin/env bash
# Install the L5 Slack Gateway as a persistent launchd service (macOS).
#
# Provide the 6 tokens (from api.slack.com/apps → each app) once. They are
# written only into a private LaunchAgents plist under your home dir — never
# into the repo.
#
#   SLACK_CEO_BOT_TOKEN=xoxb-... SLACK_CEO_APP_TOKEN=xapp-... \
#   SLACK_CMO_BOT_TOKEN=xoxb-... SLACK_CMO_APP_TOKEN=xapp-... \
#   SLACK_CTO_BOT_TOKEN=xoxb-... SLACK_CTO_APP_TOKEN=xapp-... \
#   SLACK_ALLOWED_USER_IDS=U0AQT2N24K0 \
#   bash services/slack-gateway/scripts/install.sh
#
# Re-run after `pnpm --filter @l5/slack-gateway build` to pick up new code.
set -euo pipefail

GATEWAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_PATH="$(command -v node)"
LOG_DIR="${HOME}/.l5/logs"
PLIST_SRC="${GATEWAY_DIR}/launchd/com.l5.slack-gateway.plist"
PLIST_DST="${HOME}/Library/LaunchAgents/com.l5.slack-gateway.plist"

# At least the CEO pair is required to bring anything online.
: "${SLACK_CEO_BOT_TOKEN:?set SLACK_CEO_BOT_TOKEN (xoxb-...) — CEO app → OAuth & Permissions}"
: "${SLACK_CEO_APP_TOKEN:?set SLACK_CEO_APP_TOKEN (xapp-...) — CEO app → Basic Information → App-Level Tokens}"

if [ ! -f "${GATEWAY_DIR}/dist/index.js" ]; then
  echo "dist/index.js not found — build first: pnpm --filter @l5/slack-gateway build" >&2
  exit 1
fi

mkdir -p "${LOG_DIR}" "$(dirname "${PLIST_DST}")"

# Substitute path placeholders into a private LaunchAgents copy.
sed \
  -e "s|__NODE_PATH__|${NODE_PATH}|g" \
  -e "s|__GATEWAY_DIR__|${GATEWAY_DIR}|g" \
  -e "s|__LOG_DIR__|${LOG_DIR}|g" \
  "${PLIST_SRC}" > "${PLIST_DST}"

inject_env() { # $1=key $2=value  (only injected when value is non-empty)
  [ -z "${2:-}" ] && return 0
  /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:$1 string $2" "${PLIST_DST}" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:$1 $2" "${PLIST_DST}"
}

inject_env SLACK_CEO_BOT_TOKEN   "${SLACK_CEO_BOT_TOKEN:-}"
inject_env SLACK_CEO_APP_TOKEN   "${SLACK_CEO_APP_TOKEN:-}"
inject_env SLACK_CMO_BOT_TOKEN   "${SLACK_CMO_BOT_TOKEN:-}"
inject_env SLACK_CMO_APP_TOKEN   "${SLACK_CMO_APP_TOKEN:-}"
inject_env SLACK_CTO_BOT_TOKEN   "${SLACK_CTO_BOT_TOKEN:-}"
inject_env SLACK_CTO_APP_TOKEN   "${SLACK_CTO_APP_TOKEN:-}"
inject_env SLACK_ALLOWED_USER_IDS "${SLACK_ALLOWED_USER_IDS:-}"
# Optional tuning pass-throughs.
inject_env PULK_DIR              "${PULK_DIR:-}"
inject_env SLACK_AGENT_MODEL     "${SLACK_AGENT_MODEL:-}"
inject_env SLACK_CLAUDE_ARGS     "${SLACK_CLAUDE_ARGS:-}"
inject_env SLACK_RUN_TIMEOUT_MS  "${SLACK_RUN_TIMEOUT_MS:-}"
inject_env SLACK_POST_FILES      "${SLACK_POST_FILES:-}"
inject_env CLAUDE_BIN            "${CLAUDE_BIN:-}"

launchctl unload "${PLIST_DST}" 2>/dev/null || true
launchctl load "${PLIST_DST}"
echo "loaded com.l5.slack-gateway"
echo "logs: ${LOG_DIR}/slack-gateway.log"
