# SPEC: Success Criteria 20개 항목 QA 자동화

> 작성일: 2026-06-04
> 선행 조사: `docs/reports/QA_OPENSOURCE_RESEARCH.md`
> 대상: `docs/QA_CHECKLIST.md` 25개 항목 중 Manual Test Flow 제외 20+5개 (체크박스 20 + 수동 플로우 12스텝)

---

## 1. 목적

QA_CHECKLIST.md의 20개 체크박스 항목을 사람이 수동으로 확인하는 대신, CI 또는 로컬 스크립트로 자동 검증할 수 있는 테스트/린트 인프라를 구축한다.

---

## 2. 범위

### In Scope

- Architecture QA 6개: 의존성 규칙 린트 (dependency-cruiser)
- Data Governance QA 7개: Zod 스키마 검증 테스트 (l5-core 내 Jest)
- Open Source Guardrail QA 4개: 금지 의존성 + 라이선스 감사 스크립트
- Product QA 3개 (l5-core 단위 테스트로 커버 가능한 것): FounderFit, PMF Score, ToolCandidate 판단 로직

### Out of Scope (후속)

- Product QA 5개 중 full-stack API 필요 항목 (Hurl 도입은 별도 task)
- LLM 트레이스 PII 스캔 (OpenRedaction 도입은 별도 task)
- Manual Test Flow 12스텝 자동화

---

## 3. 영향 파일 및 모듈

### 신규 생성

| 파일 | 역할 |
|---|---|
| `.dependency-cruiser.cjs` | Architecture QA 규칙 정의 (루트) |
| `packages/l5-core/src/schemas/governance.ts` | Zod 스키마: Customer, ExternalAction, MemoryEntry 거버넌스 필드 검증 |
| `packages/l5-core/src/schemas/__tests__/governance.test.ts` | Data Governance QA 7개 항목 테스트 |
| `scripts/qa-guardrail.sh` | OSS Guardrail 4개 항목 검증 스크립트 |

### 수정

| 파일 | 변경 |
|---|---|
| `packages/l5-core/package.json` | `zod` devDependency 추가, `qa:arch` 스크립트 추가 |
| `package.json` (루트) | `dependency-cruiser` devDependency, `qa:arch` / `qa:guardrail` 스크립트 추가 |

### 참조만 (수정 없음)

| 파일 | 참조 이유 |
|---|---|
| `packages/l5-core/src/types/entities.ts` | PIILevel, RiskLevel, ConsoleStatus 타입 → Zod 스키마 원본 |
| `packages/l5-core/src/types/orchestration.ts` | AgentTask.risk_level, approval_required 타입 참조 |
| `apps/nocobase-app/packages/plugins/@l5/` | dependency-cruiser 규칙에서 import 금지 대상 |
| `services/agent-runtime/` | dependency-cruiser 규칙에서 분리 검증 대상 |
| `services/hermes-runtime/` | dependency-cruiser 규칙에서 분리 검증 대상 |

---

## 4. 상세 설계

### 4.1 Architecture QA — dependency-cruiser 규칙

`.dependency-cruiser.cjs`에 아래 forbidden 규칙 정의:

| 규칙 ID | from | to | 검증 항목 |
|---|---|---|---|
| `no-core-to-nocobase` | `packages/l5-core/**` | `apps/nocobase-app/**` | A1, A2: l5-core가 NocoBase에 의존하지 않음 |
| `plugin-must-use-core` | `apps/nocobase-app/packages/plugins/@l5/**` | `packages/l5-core/src/functions/**` 외 도메인 로직 직접 구현 금지 | A3: 플러그인→l5-core 위임 |
| `no-agent-in-shell` | `apps/nocobase-app/**` | `services/agent-runtime/**` | A5: agent runtime 분리 |
| `no-hermes-in-shell` | `apps/nocobase-app/**` | `services/hermes-runtime/**` | A6: hermes runtime 분리 |
| `no-cross-runtime` | `services/agent-runtime/**` | `services/hermes-runtime/**` (양방향) | A5, A6 보강 |

A4 (long-running job 핸들러 외부)는 정적 import 분석 한계로 **수동 리뷰 + 코드 코멘트 컨벤션** (`// @long-running` 어노테이션) 권고.

**실행**: `npx dependency-cruiser --config .dependency-cruiser.cjs packages/ apps/ services/`
**CI 게이트**: exit code 0 = pass, non-zero = violation 존재

### 4.2 Data Governance QA — Zod 스키마 + Jest 테스트

`packages/l5-core/src/schemas/governance.ts`:

```typescript
import { z } from 'zod';

const PIILevel = z.enum(['none', 'low', 'medium', 'high']);
const RiskLevel = z.enum(['D1', 'D2', 'D3', 'D4', 'D5']);
const ConsentStatus = z.enum(['pending', 'approved', 'rejected', 'expired']);

// D1: PII/인사이트 분리 — Customer 레코드 스키마
export const CustomerRecordSchema = z.object({
  pii_level: PIILevel,                    // D2
  consent_status: ConsentStatus,           // D3
  consent_scope: z.string().min(1),        // D3
});

// D4: 외부 액션 risk_level 필수
export const ExternalActionSchema = z.object({
  risk_level: RiskLevel,
  approval_status: z.string().optional(),
}).refine(
  // D5: D3-D5 승인 필수
  (data) => {
    if (['D3', 'D4', 'D5'].includes(data.risk_level)) {
      return data.approval_status != null;
    }
    return true;
  },
  { message: 'D3-D5 actions require approval_status' }
);

// D1 보강: BusinessInsight에 PII 필드 없음
export const BusinessInsightSchema = z.object({
  content: z.string(),
  category: z.string(),
  searchable_tags: z.array(z.string()),
}).strict();  // strict()으로 PII 필드 추가 시 실패

// D7: 내보내기 포맷 지원 (함수 시그니처 검증)
export const ExportFormatSchema = z.enum(['json', 'csv', 'markdown']);
```

`governance.test.ts` — 7개 테스트 케이스:

| 테스트 | 검증 항목 |
|---|---|
| `CustomerRecord without pii_level → reject` | D2 |
| `CustomerRecord without consent_status → reject` | D3 |
| `CustomerRecord with valid fields → accept` | D2, D3 |
| `ExternalAction without risk_level → reject` | D4 |
| `ExternalAction D4 without approval → reject` | D5 |
| `ExternalAction D2 without approval → accept` | D5 역검증 |
| `BusinessInsight with email field → reject (strict)` | D1 |
| `ExportFormat accepts json/csv/markdown` | D7 |

### 4.3 Open Source Guardrail QA — 셸 스크립트

`scripts/qa-guardrail.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

FAIL=0

# G1: 상용 NocoBase 플러그인 없음
if grep -r '"@nocobase/plugin-' apps/nocobase-app/packages/plugins/*/package.json 2>/dev/null | grep -v '"@nocobase/plugin-' | grep -qv '^\s*$'; then
  echo "FAIL: G1 — 상용 NocoBase 플러그인 감지"; FAIL=1
fi

# G1/G2: bannedDependencies 패턴 검사
BANNED_PATTERNS=("nocobase-commercial" "activepieces-enterprise" "trigger.dev-pro")
for pattern in "${BANNED_PATTERNS[@]}"; do
  if grep -rq "$pattern" **/package.json 2>/dev/null; then
    echo "FAIL: G1/G2 — 금지 의존성 '$pattern' 감지"; FAIL=1
  fi
done

# G3: posthog/openpanel이 dependencies(not devDependencies)에 없음
if node -e "
  const pkg = require('./package.json');
  const deps = Object.keys(pkg.dependencies || {});
  const analytics = deps.filter(d => /posthog|openpanel/i.test(d));
  if (analytics.length) { console.log('FAIL: G3 — ' + analytics.join(', ')); process.exit(1); }
" 2>/dev/null; then true; else FAIL=1; fi

# G4: 라이선스 감사 (license-checker-evergreen 설치 시)
if command -v license-checker &>/dev/null; then
  license-checker --onlyAllow "MIT;Apache-2.0;ISC;BSD-2-Clause;BSD-3-Clause;0BSD;CC0-1.0;Unlicense;Python-2.0;BlueOak-1.0.0" --production || FAIL=1
else
  echo "SKIP: G4 — license-checker 미설치 (npm i -g license-checker-evergreen)"
fi

exit $FAIL
```

### 4.4 Product QA — 기존 Jest 테스트 커버리지 확인

이미 l5-core Jest 테스트 281개가 존재. 아래 3개 항목은 기존 테스트로 커버 확인:

| 항목 | 기존 테스트 파일 | 상태 |
|---|---|---|
| P1: BusinessIdea → FounderFit | `functions/founder-fit/` 테스트 | 기존 커버 |
| P5: Hermes Alert (stalled) | `functions/monitor/` 테스트 | 기존 커버 |
| P8: Memory Room 인사이트 | `functions/memory/` 테스트 | 기존 커버 |

나머지 P2-P4, P6-P7은 full-stack API 의존 → Hurl 도입 시 별도 작성.

---

## 5. Acceptance Criteria

각 항목은 CI 스크립트 또는 `pnpm test` 실행으로 pass/fail 판정 가능해야 한다.

| ID | Acceptance Criterion | 측정 방법 |
|---|---|---|
| AC-1 | `npx dependency-cruiser` 실행 시 A1/A2/A3/A5/A6 위반이 exit code 1로 보고된다 | `pnpm qa:arch` exit code 확인 |
| AC-2 | l5-core에서 NocoBase import 시 dependency-cruiser가 `no-core-to-nocobase` 위반을 출력한다 | 의도적 위반 import 추가 후 실행 → 에러 메시지 확인 → 제거 |
| AC-3 | `governance.test.ts` 8개 테스트가 모두 통과한다 | `cd packages/l5-core && pnpm test -- governance` |
| AC-4 | `pii_level` 없는 CustomerRecord가 Zod parse에서 거부된다 | AC-3의 테스트 케이스 D2 |
| AC-5 | D4 risk_level 액션에 approval 없으면 Zod refine에서 거부된다 | AC-3의 테스트 케이스 D5 |
| AC-6 | BusinessInsight에 PII 필드 추가 시 strict()에서 거부된다 | AC-3의 테스트 케이스 D1 |
| AC-7 | `scripts/qa-guardrail.sh` 실행 시 금지 의존성 없으면 exit 0 | `bash scripts/qa-guardrail.sh` |
| AC-8 | 금지 패턴(`nocobase-commercial` 등) 의존성 추가 시 exit 1 | 의도적 추가 후 실행 → 에러 → 제거 |
| AC-9 | `package.json`에 `qa:arch`, `qa:guardrail` 스크립트가 정의되어 있다 | `pnpm qa:arch` / `pnpm qa:guardrail` 실행 가능 |
| AC-10 | 기존 l5-core 281개 테스트가 깨지지 않는다 | `cd packages/l5-core && pnpm test` 전체 pass |

---

## 6. 구현 순서

```
Step 1: Zod 설치 + governance 스키마 + 테스트 (AC-3~6, AC-10)
  → verify: pnpm test governance 8개 pass + 기존 281개 pass

Step 2: dependency-cruiser 설치 + 규칙 작성 (AC-1~2, AC-9)
  → verify: pnpm qa:arch exit 0 + 의도적 위반 시 exit 1

Step 3: qa-guardrail.sh 작성 (AC-7~8, AC-9)
  → verify: bash scripts/qa-guardrail.sh exit 0

Step 4: QA_CHECKLIST.md 항목별 자동화 상태 업데이트
  → verify: 각 항목에 [auto] / [manual] 태그
```

---

## 7. 제약 및 리스크

| 제약 | 대응 |
|---|---|
| A4 (long-running) 정적 분석 불가 | 수동 리뷰 유지. 코드 컨벤션으로 관리 |
| Product QA P2-P4, P6-P7 full-stack 의존 | Hurl 도입 별도 task로 분리 |
| D6 (LLM 트레이스 PII) OpenRedaction 87★ | 별도 task. 최소 래핑으로 교체 용이하게 |
| Zod v3 vs v4 호환 | agent-runtime 기존 v3 유지. l5-core에도 v3 설치하여 통일 |
| dependency-cruiser tsconfig 경로 | monorepo tsconfig.json references 설정 필요 시 최소 조정 |
