# QA 오픈소스 도구 조사 — Success Criteria 20개 항목 자동화

> 조사일: 2026-06-04
> 대상: QA_CHECKLIST.md 20개 항목 (Architecture 6 + Product 8 + Data Governance 7 + OSS Guardrail 4 = 25개 중 Manual Test Flow 제외 20개)

---

## 1. Architecture QA (6개 항목) — 모듈 경계/의존성 규칙 검증

| | dependency-cruiser | eslint-plugin-boundaries | Knip |
|---|---|---|---|
| **GitHub Stars** | ~6,700 | ~905 | ~11,400 |
| **라이선스** | MIT | MIT | ISC |
| **최근 릴리스** | v17.4 (2026-05) | v4.2 (2026-03) | v6.15 (2026-05) |
| **핵심 기능** | 의존성 그래프 규칙 + CI 게이트 | ESLint 인라인 경계 검사 | 미사용 export/dead code 탐지 |
| **pnpm monorepo** | ✅ tsconfig 연동 | ✅ flat config 지원 | ✅ workspace-native |
| **커버 항목** | ① NocoBase=Shell ② l5-core 독립 ③ 플러그인→l5-core 위임 ⑤⑥ 런타임 분리 | ①②③⑤⑥ (동일) | ③ 중복 로직 탐지 (보조) |
| **장점** | 전체 그래프 순회, Mermaid/GraphViz 시각화, CI exit code | IDE 인라인 피드백, 기존 ESLint 통합 | 미사용 l5-core export → 플러그인 중복 징후 탐지 |
| **단점** | 런타임 행위 분석 불가 (④ long-running 감지 한계) | 전체 그래프 순회 없음 | 경계 규칙 정의 불가 (보조 도구) |

### 채택 권고

- **채택**: `dependency-cruiser` — 6개 항목 중 5개를 단일 `.dependency-cruiser.cjs`로 커버. l5-core↔NocoBase, plugin↔l5-core, runtime 간 import 규칙을 선언적으로 정의하고 CI에서 자동 검증.
- **보조 채택**: `Knip` — 플러그인이 l5-core를 호출하지 않고 로직을 복제하는 경우, l5-core의 해당 export가 unused로 탐지됨. dependency-cruiser와 상호보완.
- **배제**: `eslint-plugin-boundaries` — dependency-cruiser와 기능 중복. 커뮤니티 규모(905 vs 6,700) 열세. ESLint 설정 복잡도 대비 추가 가치 부족.

---

## 2. Product QA (8개 항목) — API 워크플로우 E2E 검증

| | Jest (현재) | Hurl | Playwright API mode |
|---|---|---|---|
| **GitHub Stars** | ~44,000 | ~19,000 | ~90,200 |
| **라이선스** | MIT | Apache-2.0 | Apache-2.0 |
| **최근 릴리스** | v29.7 (활발) | v7.1 (2025-11) | 2026 활발 |
| **핵심 기능** | TS 유닛/통합 테스트 | 평문 HTTP 체인 + 어설션 | API + 브라우저 겸용 |
| **pnpm monorepo** | ✅ (이미 l5-core에 설치) | 언어 무관 CLI | ✅ (founder-ui에 설치) |
| **커버 항목** | 8개 전부 (코드 작성 필요) | 8개 전부 (`.hurl` 파일) | 8개 전부 + UI 검증 |
| **장점** | 이미 사용 중, 281개 테스트 통과, l5-core 도메인 로직 직접 검증 | 비개발자 가독성, Rust 바이너리(빠름), JUnit 리포트 | 이미 설치됨, 향후 UI 검증 확장 |
| **단점** | API 통합 테스트 시 full stack 필요 | 복잡한 비즈니스 로직 어설션 한계 | API-only 사용 시 과잉(브라우저 엔진 300MB) |

### 채택 권고

- **유지**: `Jest` — 이미 l5-core에서 281개 테스트 운용 중. 도메인 로직 단위 테스트 + 통합 테스트 모두 커버.
- **채택**: `Hurl` — Product QA 8개 항목을 `.hurl` 파일로 문서화하면 비개발자도 읽을 수 있는 API 스모크 테스트가 됨. CI에서 빠르게 실행 가능.
- **유지(확장 보류)**: `Playwright` — founder-ui에 이미 설치됨. API-only 테스트보다는 향후 UI 검증 시 활용. 현 단계에서 Product QA 전용으로 추가 도입 불필요.

---

## 3. Data Governance QA (7개 항목) — 스키마 검증 + PII 탐지

| | Zod | OpenRedaction | syncpack |
|---|---|---|---|
| **GitHub Stars** | ~38,000+ | ~87 | ~2,100 |
| **라이선스** | MIT | MIT | MIT |
| **최근 릴리스** | v4.x (2026) | v1.1.2 (2026-03) | v15.3 (2026-05) |
| **핵심 기능** | 타입+런타임 스키마 검증 | 570+ 정규식 PII 패턴 탐지 | 의존성 버전 일관성 강제 |
| **pnpm monorepo** | ✅ 제로 의존성 | ✅ npm 패키지 | ✅ workspace-native |
| **커버 항목** | ① PII/인사이트 분리(구조) ② pii_level ③ consent ④ risk_level ⑤ D3-D5 승인 | ⑥ LLM 트레이스 PII 스캔 | 스키마 패키지 버전 일관성 |
| **장점** | 이미 agent-runtime에 설치, TS 타입 자동 생성, `.refine()`으로 비즈니스 규칙 | 로컬 전용(외부 API 없음), GDPR/HIPAA 프리셋 | pnpm catalog 지원, 거버넌스 드리프트 방지 |
| **단점** | 자유 텍스트 내 PII 미탐지 | 낮은 커뮤니티(87★), NER 미지원, false positive | PII/스키마 내용 검증 불가 |

### 채택 권고

- **확장**: `Zod` — 이미 agent-runtime에 v3 설치. l5-core 엔티티 스키마에 Zod 적용하여 pii_level/consent/risk_level 필수화. `.refine()`으로 "D3-D5면 approval 필수" 규칙 인코딩.
- **채택(PII 스캔 전용)**: `OpenRedaction` — LLM 트레이스 PII 검사 항목(⑥)은 스키마 검증으로 불가. CI에서 Langfuse 트레이스 fixture를 OpenRedaction으로 스캔하는 테스트 추가. 단, 커뮤니티 규모가 작아 래핑 레이어 최소화 필요.
- **배제**: `syncpack` — 현재 l5-core 스키마 패키지가 workspace 내 다수 패키지에 공유되는 구조가 아님. 패키지 수가 늘어난 후 재평가.

---

## 4. Open Source Guardrail QA (4개 항목) — 라이선스/의존성 감사

| | Sherif | license-checker-evergreen | onebeyond/license-checker |
|---|---|---|---|
| **GitHub Stars** | ~1,200 | ~170 | ~32 |
| **라이선스** | MIT | MIT | MIT |
| **최근 릴리스** | v1.11 (2026-03) | 2025/2026 | v2.2 (2026-01) |
| **핵심 기능** | 금지 의존성 + monorepo 구조 린트 | 라이선스 목록 + 허용/거부 리스트 | SPDX 파싱 + CI 강제 |
| **pnpm monorepo** | ✅ Rust 바이너리, workspace.yaml native | ✅ Node.js CLI | ✅ Node.js CLI |
| **커버 항목** | ① 상용 플러그인 금지 ② 유료 자동화 금지 | ④ 라이선스 사전 플래깅 | ④ SPDX 복합 라이선스 검증 |
| **장점** | `pnpm install` 전 실행 가능(빠름), `--fix` 자동 수정 | 원조 license-checker 후속, JSON/CSV/MD 출력 | SPDX 논리 연산 정확도 |
| **단점** | 라이선스 메타데이터 미읽기 | 낮은 커뮤니티(170★), 선언 기반만 | 최소 커뮤니티(32★) |

### 채택 권고

- **채택**: `Sherif` — `bannedDependencies`로 상용 NocoBase 플러그인/유료 자동화 패키지 차단. Rust 바이너리로 CI 초기에 빠르게 실행. monorepo 구조 린트도 부수 효과.
- **채택**: `license-checker-evergreen` — Sherif가 커버하지 않는 전체 라이선스 감사를 post-install 단계에서 수행. `--onlyAllow` 화이트리스트로 GPL/AGPL/Commercial 차단.
- **배제**: `onebeyond/license-checker` — 커뮤니티 32★으로 유지보수 리스크. SPDX 파싱 이점은 현 의존성 수준에서 필요하지 않음.

---

## 최종 채택 스택 요약

| 카테고리 | 채택 도구 | 역할 | 비고 |
|---|---|---|---|
| Architecture | **dependency-cruiser** | 모듈 경계 규칙 CI 게이트 | 신규 도입 |
| Architecture (보조) | **Knip** | 미사용 export = 로직 중복 징후 | 신규 도입 |
| Product QA | **Jest** (유지) | l5-core 도메인 테스트 | 기존 281개 테스트 |
| Product QA | **Hurl** | API 워크플로우 스모크 테스트 | 신규 도입 |
| Data Governance | **Zod** (확장) | 엔티티 스키마 필수 필드 강제 | agent-runtime에 기설치 |
| Data Governance | **OpenRedaction** | LLM 트레이스 PII 스캔 | 신규 도입, 소규모 래핑 |
| Guardrail | **Sherif** | 금지 의존성 + 구조 린트 | 신규 도입 |
| Guardrail | **license-checker-evergreen** | 라이선스 화이트리스트 감사 | 신규 도입 |

### 신규 도입 6개, 기존 유지/확장 2개 = 총 8개 도구로 20개 QA 항목 커버

---

## QA 항목 ↔ 도구 매핑

| # | QA 항목 | 도구 |
|---|---|---|
| A1 | NocoBase = Shell only | dependency-cruiser |
| A2 | l5-core NocoBase 없이 테스트 | Jest (기존) |
| A3 | Plugin → l5-core 위임 | dependency-cruiser + Knip |
| A4 | Long-running job 핸들러 외부 | 수동 리뷰 (정적 분석 한계) |
| A5 | Agent runtime 분리 | dependency-cruiser |
| A6 | Hermes runtime 분리 | dependency-cruiser |
| P1 | BusinessIdea → FounderFit | Hurl + Jest |
| P2 | PMF Plan → Tool Request 순서 | Hurl + Jest |
| P3 | Workflow/Agent Staffing 생성 | Hurl |
| P4 | Portfolio 상태 갱신 | Hurl |
| P5 | Hermes Alert Queue | Hurl + Jest |
| P6 | BPR Log 병목 기록 | Hurl |
| P7 | Tool Request Lab 후보 수신 | Hurl |
| P8 | Memory Room 인사이트 저장 | Hurl + Jest |
| D1 | PII/인사이트 분리 | Zod 스키마 구조 |
| D2 | pii_level 필수 | Zod `.required()` |
| D3 | consent scope/status | Zod `.required()` |
| D4 | 외부 액션 risk_level | Zod `.enum()` |
| D5 | D3-D5 승인 필수 | Zod `.refine()` |
| D6 | LLM 트레이스 PII 없음 | OpenRedaction |
| D7 | JSON/CSV/MD 내보내기 | Jest 통합 테스트 |
| G1 | 상용 플러그인 없음 | Sherif `bannedDependencies` |
| G2 | 유료 자동화 없음 | Sherif `bannedDependencies` |
| G3 | 선택적 분석 Phase 1 불필수 | Sherif |
| G4 | 라이선스 사전 플래깅 | license-checker-evergreen |
