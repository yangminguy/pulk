#!/bin/bash
# pulk 상시 데몬 전체 기동 (dock 버튼에서 호출).
set -uo pipefail
DOMAIN="gui/$(id -u)"
LA="$HOME/Library/LaunchAgents"

LABELS=(
  ai.openclaw.gateway
  ai.hermes.gateway
  com.l5.telegram-gateway
  com.l5.slack-gateway
  com.l5.notion-gateway
  com.l5.cloudflared-tunnel
  com.l5.nocobase
  com.l5.native-orchestrator
  com.l5.video-batch-render
)

for lbl in "${LABELS[@]}"; do
  launchctl enable    "$DOMAIN/$lbl" 2>/dev/null
  launchctl bootstrap "$DOMAIN" "$LA/$lbl.plist" 2>/dev/null && echo "  기동: $lbl" || echo "  (이미 실행 중): $lbl"
done

echo "pulk 상시 데몬 기동 완료."
