# L5 Business OS

Founder가 채팅으로 방향을 잡으면 CEO Agent가 임원 Agent들에게 과제를 분배해 병렬 실행하고, Founder는 진행상황과 승인만 하는 AI 회사 운영체계.

## 시작하기

1. `CLAUDE.md`를 먼저 읽는다 (프로젝트 개요, 문서 체계, 개발 규칙).
2. `docs/ARCHITECTURE.md`에서 전체 문서 구조와 저장소 폴더 트리를 확인한다.
3. `docs/PRD.md` → `docs/TRD.md` → `docs/USER_FLOW.md` 순서로 읽는다.
4. `docs/TASK.md`에서 지금 해야 하는 일을 확인한다.

## 개발 명령

```bash
pnpm install
pnpm dev:all        # 전체 워크스페이스 dev
pnpm qa:static       # typecheck + lint + build
pnpm qa:test         # 전체 유닛테스트
pnpm qa:all          # 정적검사 + 테스트 + e2e 전체
```

앱별로 개별 실행하려면 `apps/founder-ui`, `apps/bizpt-manager`, `apps/nocobase-app` 각각의 `package.json` 스크립트를 참고한다.

## 문서 구조

```text
CLAUDE.md
AGENTS.md
docs/
  ARCHITECTURE.md   # 문서 인덱스, 저장소 구조
  PRD.md            # 제품 요구사항
  TRD.md            # 기술 구조 (+ trd/)
  USER_FLOW.md      # 사용자 동선
  DB_DESIGN.md      # 데이터 모델 (+ db-design/)
  SCREEN.md         # 화면 목록 (+ screen/)
  TASK.md           # 해야 하는 일
  CODING_CONVENTION.md
  archive/          # 과거 문서 보관
schemas/
  l5_entities.json
```
