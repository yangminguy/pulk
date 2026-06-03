#!/usr/bin/env bash
# D6 — live delegation loop smoke test.
# Seeds (via SQL, to bypass NocoBase REST FK/association quirks) a CMO→CTO
# delegation, then drives delegation:advance (runDelegationLoop) over REST and
# reports the outcome. No browser — claude CLI runs with MCP off.
set -euo pipefail

BASE="${NOCOBASE_BASE_URL:-http://localhost:13000}"
PSQL="psql -h 127.0.0.1 -p 5432 -U wonminyang -d nocobase -v ON_ERROR_STOP=1 -q"

I=$(uuidgen | tr 'A-Z' 'a-z')   # instruction
P=$(uuidgen | tr 'A-Z' 'a-z')   # interpretation
O=$(uuidgen | tr 'A-Z' 'a-z')   # origin CMO task
D=$(uuidgen | tr 'A-Z' 'a-z')   # delegation

echo "ids: instr=$I interp=$P origin=$O del=$D"

$PSQL <<SQL
INSERT INTO founder_instructions (id, raw_text, source, status, "createdAt", "updatedAt")
VALUES ('$I', '[D6-SMOKE] 세컨 브레인 MCP 활용 개선 위임', 'manual', 'new', now(), now());

INSERT INTO ceo_interpretations (id, instruction_id, goal, phase, risk_level, "createdAt", "updatedAt")
VALUES ('$P', '$I', '세컨 브레인 MCP 활용 개선', 'discovery', 'D2', now(), now());

INSERT INTO agent_tasks (id, instruction_id, interpretation_id, assigned_agent, title, rationale, expected_output, status, risk_level, blocker, "createdAt", "updatedAt")
VALUES ('$O', '$I', '$P', 'CMO', '[D6-SMOKE] CMO 캠페인 기획 (CTO 위임 대기)',
        '세컨 브레인 활용 개선안이 필요해 CTO에게 위임함.', 'CTO 개선안을 반영한 캠페인 기획.',
        'needs_review', 'D2', 'awaiting_delegation: $D', now(), now());

INSERT INTO executive_delegations (id, from_agent, to_agent, origin_task_id, objective, acceptance_criteria, status, round, max_rounds, "createdAt", "updatedAt")
VALUES ('$D', 'CMO', 'CTO', '$O',
        'CTO 관점에서 세컨 브레인을 MCP로 더 잘 활용하기 위한 개선안 초안을 작성하라.',
        '["개선안에 최소 2개의 구체적 액션 아이템이 포함된다","각 액션 아이템에 위험도(D1~D5)가 명시된다"]'::json,
        'open', 0, 2, now(), now());
SQL
echo "✅ seeded instruction/interpretation/origin/delegation"

TOKEN=$(curl -s -X POST "$BASE/api/auth:signIn" -H 'Content-Type: application/json' -H 'X-Authenticator: basic' \
  -d '{"account":"nocobase","password":"admin123"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.token))")
[ -n "$TOKEN" ] && echo "✅ auth ok" || { echo "❌ auth failed"; exit 1; }

echo "⏳ delegation:advance — running loop (worker 제작 → 요청임원 검증) … (수 분 소요)"
T0=$(date +%s)
RESP=$(curl -s --max-time 540 -X POST "$BASE/api/delegation:advance" \
  -H "Authorization: Bearer $TOKEN" -H 'X-Authenticator: basic' -H 'Content-Type: application/json' \
  -d "{\"id\":\"$D\"}")
T1=$(date +%s)
echo "✅ advance returned in $((T1-T0))s"
echo "advance payload:"; echo "$RESP" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.stringify(JSON.parse(s).data,null,2).slice(0,1500))}catch{console.log(s.slice(0,800))}})"

echo ""
echo "================ D6 RESULT (DB readback) ================"
$PSQL -P pager=off -c "SELECT status, round, max_rounds, left(coalesce(last_feedback,''),200) AS last_feedback, left(coalesce(result_summary,''),300) AS result_summary, work_task_id FROM executive_delegations WHERE id='$D';" -x
echo "--- work task ---"
$PSQL -P pager=off -c "SELECT assigned_agent, status, left(title,60) AS title FROM agent_tasks WHERE id=(SELECT work_task_id FROM executive_delegations WHERE id='$D');" -x
echo "--- origin task (resume?) ---"
$PSQL -P pager=off -c "SELECT assigned_agent, status, left(coalesce(blocker,''),80) AS blocker FROM agent_tasks WHERE id='$O';" -x
echo "========================================================"
echo "seed ids (cleanup): instr=$I interp=$P origin=$O del=$D"
