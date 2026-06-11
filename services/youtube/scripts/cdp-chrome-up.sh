#!/bin/zsh
# launchd(com.l5.cdp-chrome)가 KeepAlive로 실행. 크롬 기동 후 화면 밖으로 밀고 크롬을 감시한다.
# 크롬이 죽으면 이 스크립트도 종료 → launchd가 재실행 → 재기동+재숨김.
PROFILE="$HOME/chrome-cdp"; PORT=9222
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
NODE="/usr/local/bin/node"
HIDE="$HOME/Desktop/pulk/services/youtube/scripts/cdp-hide-windows.mjs"

if curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/json/version"; then
  PID=$(pgrep -f "user-data-dir=$PROFILE" | head -1)   # 이미 떠있으면 그 크롬 감시
else
  "$CHROME" --remote-debugging-port=$PORT --user-data-dir="$PROFILE" \
    --no-first-run --no-default-browser-check --disable-session-crashed-bubble \
    about:blank &
  PID=$!
  for i in {1..20}; do curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/json/version" && break; sleep 1; done
fi
sleep 1
"$NODE" "$HIDE" 2>/dev/null   # 기동 직후 화면 밖으로
# 크롬 살아있는 동안 블록(죽으면 스크립트 종료 → launchd 재실행)
while kill -0 "$PID" 2>/dev/null; do sleep 5; done
