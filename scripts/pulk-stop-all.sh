#!/bin/bash
# pulk 상시 데몬 전체 정지 + 자동실행(재부팅 후 포함) 차단.
# 되돌리려면 pulk-start-all.sh 실행 (dock 버튼).
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
  launchctl bootout  "$DOMAIN/$lbl" 2>/dev/null && echo "  정지: $lbl" || echo "  (이미 중단됨): $lbl"
  launchctl disable  "$DOMAIN/$lbl" 2>/dev/null && echo "  자동실행 차단: $lbl"
done

# KeepAlive 잔여 워커/유령 프로세스 정리
pkill -f "nocobase/cli/bin/index.js start"     2>/dev/null && echo "  잔여 nocobase CLI 정리"
pkill -f "app-dev/lib/index.js start"          2>/dev/null && echo "  잔여 nocobase 워커 정리"
pkill -f "cloudflared-tunnel-keeper"           2>/dev/null
pkill -x cloudflared                            2>/dev/null && echo "  잔여 cloudflared 정리"

echo "pulk 상시 데몬 정지 완료."
