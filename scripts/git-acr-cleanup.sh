#!/usr/bin/env bash
# git-acr-cleanup.sh — ACR 자동생성 브랜치(acr/l5-*) 정리 안전망.
#
# ACR 디스패처가 phase마다 acr/l5-<uuid>-task-N-<date> 브랜치를 만들고 정리하지 않아
# 로컬/원격에 수백 개가 쌓인다(2026-06-05 기준 로컬 291·원격 25). 근본 수정은 ACR이
# 머지 후 브랜치를 삭제하는 것이고, 이 스크립트는 그 전까지의 안전망이다.
#
# 동작: main에 이미 머지된 acr/* 브랜치 중 N일 경과한 것을 로컬·원격에서 삭제.
#       보호 브랜치(아래 PROTECTED)와 워크트리 체크아웃 브랜치는 절대 건드리지 않음.
#
# 사용:
#   bash scripts/git-acr-cleanup.sh            # dry-run (삭제 대상만 출력)
#   bash scripts/git-acr-cleanup.sh --apply    # 실제 삭제
#   AGE_DAYS=3 bash scripts/git-acr-cleanup.sh --apply   # 3일 경과분만(기본 7)

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

APPLY=0; [[ "${1:-}" == "--apply" ]] && APPLY=1
AGE_DAYS="${AGE_DAYS:-7}"
NOW=$(date +%s)
CUTOFF=$(( NOW - AGE_DAYS * 86400 ))

# 보호: 이 패턴들은 acr/* 라도 절대 삭제하지 않음
PROTECTED='^(main|cmo/|feat/|omc/|wip/)'
# 워크트리에 체크아웃된 브랜치(삭제 불가)
CHECKED_OUT=$(git worktree list --porcelain | awk '/^branch /{sub("refs/heads/","",$2); print $2}')

is_protected() { grep -qE "$PROTECTED" <<<"$1" || grep -qxF "$1" <<<"$CHECKED_OUT"; }

echo "== git-acr-cleanup (AGE_DAYS=$AGE_DAYS, apply=$APPLY) =="

# --- 로컬: main에 머지됐고 N일 경과한 acr/* ---
local_del=()
while IFS='|' read -r ref ts; do
  [[ -z "$ref" ]] && continue
  is_protected "$ref" && continue
  (( ts < CUTOFF )) && local_del+=("$ref")
done < <(git for-each-ref --merged main --format='%(refname:short)|%(committerdate:unix)' refs/heads/acr/)

echo "로컬 삭제 대상: ${#local_del[@]}개"
if (( ${#local_del[@]} )); then
  printf '  %s\n' "${local_del[@]}" | head -10; (( ${#local_del[@]} > 10 )) && echo "  ..."
  (( APPLY )) && printf '%s\n' "${local_del[@]}" | xargs -n50 git branch -D
fi

# --- 원격: origin/acr/* (머지 여부는 origin/main 기준) ---
git fetch -q --prune origin 2>/dev/null || true
remote_del=()
while IFS='|' read -r ref ts; do
  [[ -z "$ref" ]] && continue
  short="${ref#origin/}"
  is_protected "$short" && continue
  (( ts < CUTOFF )) && remote_del+=("$short")
done < <(git for-each-ref --merged origin/main --format='%(refname:short)|%(committerdate:unix)' refs/remotes/origin/acr/)

echo "원격 삭제 대상: ${#remote_del[@]}개"
if (( ${#remote_del[@]} )); then
  printf '  %s\n' "${remote_del[@]}" | head -10; (( ${#remote_del[@]} > 10 )) && echo "  ..."
  (( APPLY )) && git push origin --delete "${remote_del[@]}"
fi

(( APPLY )) && { git remote prune origin -q; echo "완료. 주기적으로 'git gc' 권장."; } || echo "(dry-run — 실제 삭제하려면 --apply)"
