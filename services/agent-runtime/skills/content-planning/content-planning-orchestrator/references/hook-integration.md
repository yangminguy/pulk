# Hook Integration — validate-planning-artifact.mjs

기획 아티팩트의 결정적(deterministic) 검증 스크립트를 Claude Code 훅 또는 러너 검증 단계에 붙이는 방법.

## 스크립트

`scripts/validate-planning-artifact.mjs` — 인자로 받은 아티팩트 JSON이 필수 키
(`project_id`, `gate_stage`, `status`, `data`)를 갖췄는지, `gate_stage`가 알려진 값
(`key_content_plan_doc` / `pulling_plan_doc` / `title_development` / `thumbnail_plan` / `script_draft`)
인지 검사한다. 실패 시 exit 1 + stderr에 사유. 순수 node, 의존성 0.

```bash
node scripts/validate-planning-artifact.mjs <artifact.json>
# 성공: stdout "valid planning artifact <gate_stage> (<project_id>)" + exit 0
# 실패: stderr "invalid planning artifact: <사유들>" + exit 1
```

## 옵션 A — Claude Code PostToolUse 훅

기획 아티팩트가 파일로 기록될 때마다(PostToolUse: Write/Edit) 자동 검증. 훅이 non-zero로
종료하면 Claude Code에 실패가 노출되어 즉시 수정 루프로 돌아간다.

`.claude/settings.json` 스니펫:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "f=$(jq -r '.tool_input.file_path // empty'); case \"$f\" in *planning-artifact*.json) node \"$CLAUDE_PROJECT_DIR/services/agent-runtime/skills/content-planning/content-planning-orchestrator/scripts/validate-planning-artifact.mjs\" \"$f\";; esac"
          }
        ]
      }
    ]
  }
}
```

- 훅은 stdin으로 툴 페이로드(JSON)를 받는다 → `jq`로 `tool_input.file_path` 추출.
- `case` 가드로 기획 아티팩트 파일에만 적용(다른 파일 쓰기는 그냥 통과).
- exit 1이면 stderr 사유가 Claude Code 세션에 표시된다.

## 옵션 B — 러너 검증 단계

오케스트레이터가 각 게이트 단계 산출물을 다음 단계로 넘기기 전 검증 게이트로 실행.

```bash
# 러너 파이프라인 내부 (게이트 산출물 저장 직후)
if ! node scripts/validate-planning-artifact.mjs "$ARTIFACT_PATH"; then
  echo "gate blocked: planning artifact 검증 실패" >&2
  exit 1
fi
```

또는 Node에서 직접 spawn:

```js
import { spawnSync } from 'node:child_process';
const r = spawnSync('node', [
  'skills/content-planning/content-planning-orchestrator/scripts/validate-planning-artifact.mjs',
  artifactPath,
], { encoding: 'utf8' });
if (r.status !== 0) throw new Error(`planning artifact invalid: ${r.stderr.trim()}`);
```

## 왜 결정적인가

LLM 호출 없이 순수 구조 검사만 한다 — 같은 입력이면 항상 같은 판정. 후크로 붙이면
Phase 2 "후크" 조각으로서, 기획 산출물의 형태(shape) 회귀를 배포/게이트 통과 이전에 차단한다.
