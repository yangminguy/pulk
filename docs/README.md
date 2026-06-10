# docs — L5 Business OS 문서 인덱스

> 전체 개발 문서의 진입점. 영역별로 분리 관리한다(2026-06-10~).
> 규칙: 문서 1개 250~300줄 이내. 넘으면 쪼개고 링크. 영역 작업 후엔 그 영역의 HANDOFF·TASKS 갱신.

## 영역별 라우터 (여기서 시작)

| 영역 | 라우터 | 무엇 |
|---|---|---|
| **CMO** | [cmo/CLAUDE.md](./cmo/CLAUDE.md) | 콘텐츠 마케팅 — 키/풀링/제작/영상/재학습 + 발굴 자동화. HANDOFF·TASKS·features 분리됨. |
| **CTO** | [cto/CLAUDE.md](./cto/CLAUDE.md) | 기술 기획/실행 지휘 — CTO brain + ACR executor. |
| **pulk(전역)** | 아래 ↓ | 제품 전체 스펙·아키텍처·상태. 영역에 안 속하는 것. |

## 전역 pulk 문서 (루트 docs/)

### 제품·아키텍처 (루트 CLAUDE.md Reading Order)
- [PRD.md](./PRD.md) · [SOURCE_PRD.md](./SOURCE_PRD.md) — 제품 요구사항
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 시스템 아키텍처
- [DATA_MODEL.md](./DATA_MODEL.md) — 데이터 모델
- [SECURITY_DATA_GOVERNANCE.md](./SECURITY_DATA_GOVERNANCE.md) — 보안·PII·인사이트 분리
- [AGENT_PROTOCOL.md](./AGENT_PROTOCOL.md) — 에이전트 프로토콜
- [HERMES_SPEC.md](./HERMES_SPEC.md) — Hermes 런타임
- [WORKFLOW_FACTORY_SPEC.md](./WORKFLOW_FACTORY_SPEC.md) — 워크플로우 팩토리

### 상태·계획 (전역)
- [HANDOFF.md](./HANDOFF.md) — 전역 현재 상태 (영역 포인터 포함, 점진 분리 중)
- [TASKS.md](./TASKS.md) — 전역 할 일 (CMO는 cmo/TASKS.md로 이관)
- [DECISIONS.md](./DECISIONS.md) — 구조 결정 기록
- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) · [projects_roadmap_implementation_plan.md](./projects_roadmap_implementation_plan.md)

### 에이전트·실행
- [AGENT_TEAM_ARCHITECTURE.md](./AGENT_TEAM_ARCHITECTURE.md) · [EXECUTIVE_DELEGATION_SPEC.md](./EXECUTIVE_DELEGATION_SPEC.md)
- [FOUNDER_BRIEF_SPEC.md](./FOUNDER_BRIEF_SPEC.md) · [HARNESS_UTILIZATION.md](./HARNESS_UTILIZATION.md)

### 운영·참고
- [API.md](./API.md) · [LOCAL_SETUP_GUIDE.md](./LOCAL_SETUP_GUIDE.md) · [CLI_COMMAND_REFERENCE.md](./CLI_COMMAND_REFERENCE.md)
- [OPEN_SOURCE_INTEGRATION.md](./OPEN_SOURCE_INTEGRATION.md) · [QA_CHECKLIST.md](./QA_CHECKLIST.md) · [QA_REPORT.md](./QA_REPORT.md)
- [SESSION_2026_05_27_SUMMARY.md](./SESSION_2026_05_27_SUMMARY.md)

## 하위 디렉토리

- `cmo/` · `cto/` — 영역별 문서 (위 라우터 참조)
- `prd/` · `specs/` — PRD·스펙 모음
- `index/` — 작업유형별 인덱스 로드용
- `reports/` · `research/` · `reviews/` · `projects/` — 산출물
- `archive/` · `legacy/` — 보관 (현행 아님)

## 분리 현황 / 다음

- [x] CMO 분리 (cmo/: CLAUDE·HANDOFF·TASKS·features) — 2026-06-10
- [x] CTO 라우터 (cto/CLAUDE.md) — 문서 모음 완료, HANDOFF/TASKS는 전역에서 점진 이관
- [ ] 전역 HANDOFF(2960줄)/TASKS(1639줄) — 영역 이관 후 전역 이력만 슬림화
