#!/bin/bash
# Hermes launchd installer
# Builds hermes-runtime and registers 4 cron jobs with macOS launchd.
# Run from repo root: bash services/hermes-runtime/scripts/install-launchd.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
HERMES_DIR="$REPO_ROOT/services/hermes-runtime"
LAUNCHD_DIR="$HERMES_DIR/launchd"
LOG_DIR="$HOME/Library/Logs/l5-hermes"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

NODE_PATH="$(which node 2>/dev/null || true)"
if [ -z "$NODE_PATH" ]; then
  # Try common nvm path
  NVM_NODE="$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin/node"
  if [ -f "$NVM_NODE" ]; then
    NODE_PATH="$NVM_NODE"
  else
    echo "ERROR: node not found in PATH or nvm. Install Node.js and re-run."
    exit 1
  fi
fi

echo "Using node: $NODE_PATH"
echo "Hermes dir: $HERMES_DIR"
echo "Log dir:    $LOG_DIR"

echo ""
echo "Building hermes-runtime..."
cd "$REPO_ROOT"
if command -v pnpm >/dev/null 2>&1; then
  PNPM_CMD="pnpm"
elif command -v corepack >/dev/null 2>&1; then
  PNPM_CMD="corepack pnpm"
else
  echo "ERROR: neither pnpm nor corepack found in PATH."
  exit 1
fi
$PNPM_CMD --filter @l5/hermes-runtime build

echo ""
echo "Creating log directory..."
mkdir -p "$LOG_DIR"

echo ""
echo "Installing launchd agents..."
mkdir -p "$LAUNCH_AGENTS_DIR"

PLISTS=(
  "com.l5.hermes.repetition-analyzer.plist"
  "com.l5.hermes.approval-checker.plist"
  "com.l5.hermes.daily-brief.plist"
  "com.l5.hermes.cto-weekly-review.plist"
  "com.l5.hermes.cto-verification-loop.plist"
  "com.l5.hermes.model-verify.plist"
  "com.l5.hermes.self-learning.plist"
  "com.l5.hermes.cmo-strategy-watch.plist"
  "com.l5.hermes.task-archiver.plist"
  "com.l5.git-acr-cleanup.plist"
)

for PLIST in "${PLISTS[@]}"; do
  LABEL="${PLIST%.plist}"
  SRC="$LAUNCHD_DIR/$PLIST"
  DEST="$LAUNCH_AGENTS_DIR/$PLIST"

  # Unload existing agent if loaded
  launchctl unload "$DEST" 2>/dev/null || true

  # Substitute placeholders
  sed \
    -e "s|__NODE_PATH__|$NODE_PATH|g" \
    -e "s|__HERMES_DIR__|$HERMES_DIR|g" \
    -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
    -e "s|__LOG_DIR__|$LOG_DIR|g" \
    "$SRC" > "$DEST"

  launchctl load "$DEST"
  echo "  Loaded: $LABEL"
done

echo ""
echo "Done. Verify with: launchctl list | grep l5"
