# 제목 디벨롭 8단계 워크플로우

> 정본 PRD = [`docs/prd/cmo-title-development.md`](../../prd/cmo-title-development.md) (§19~24).
> 라우터 = [CMO/CLAUDE.md](../CLAUDE.md). 상태 요약 = [HANDOFF.md](../HANDOFF.md).

## 한 줄

확정된 풀링 콘텐츠 주제에 대해 **Viewtrap 검증 레퍼런스 2개**를 입력받아 제목·썸네일을 교차 조합한 뒤, 8단계로 제목을 디벨롭하고 100점 평가로 최종 제목/썸네일 방향을 만든다. 감(感) 기반 제목 작성을 검증 가능한 파이프라인으로 대체한다.

## 파이프라인

```text
풀링 주제 확정 (cmo.pulling.plan)
  → 레퍼런스 2개 검증 (조회수 5만+, 성과도/기여도 Good·Great, 주제 유사도)   ← AC-01~06
  → 4종 교차 조합 생성                                                      ← AC-07
  → 어색함 판단 (LLM, 감점 누적 0=정상)                                      ← AC-08
  → 2~8단계 디벨롭 (단계당 LLM 1콜, 입력/출력/탈락이유 저장)                   ← AC-09~10
  → 최종 100점 평가 (6항목) → ≥85 업로드후보 / 70~84 수정 / ≤69 레퍼런스재검색  ← AC-11~12
  → approval_status='draft' (Founder 승인 전 외부 게시 금지)                  ← AC-13
  → proposal.data 저장 + 세컨브레인 요약                                      ← AC-14~15
```

8단계: 2.쉬운 단어 / 3.상위어 / 4.부정·반대 / 5.수식어(35자 제한) / 6.질문화 / 7.핫비디오 구조 치환 / 8.강한 단어.

## 코드 위치

| 레이어 | 파일 | 책임 |
|---|---|---|
| 타입 | `packages/l5-core/src/functions/cmo-strategy/title-development-types.ts` | PRD §19 5개 타입 (Reference/Combination/StepResult/Evaluation/Run) |
| 결정론 함수 | `cmo-strategy/title-development.ts` | 검색어·레퍼런스 검증·4교차조합·35자·점수합산·임계·proposal·세컨브레인 |
| LLM 실행기 | `cmo-strategy/title-development-llm.ts` | 어색함판단·2~8단계·최종평가·합성 `runTitleDevelopmentWorkflow`. Sonnet 고정, 단계별 폴백 |
| 오케스트레이터 스킬 | `cmo-orchestrator/skills/title-development.ts` | `cmo.title.development` (depends_on `cmo.pulling.plan`, next `cmo.script.write`) |
| 라이브 액션 | `plugin-orchestration/src/server/plugin.ts` `proposeTitleDevelopment` (+ dist 패치) | 레퍼런스+풀링주제 → 워크플로우 실행 → `title_development` 카드 |
| UI | `apps/founder-ui/.../video-room/_components/TitleDevelopmentBoard.tsx` | 레퍼런스 입력 → 조합/타임라인/평가 표시 (도메인 로직 없음) |
| UI 배선 | `StrategyBoard.tsx`(승인3) · `ProductionBoard.tsx`(승인4 확정제목 노출) | hook_draft~script 승인 흐름 |

## 상태머신 접목 (PRD §20.1 MVP)

새 상태를 추가하지 않고 **`thumbnail_pattern_extraction` 단계 내부**에서 수행한다. 산출 카드 stage = `title_development`. 최종 제목/썸네일은 **`hook_draft_approval` 게이트(승인3)**에서 승인받고, **`script_approval`(승인4, 원고 확인)** 시 확정 제목을 함께 노출해 원고가 제목 약속을 회수하는지 검토한다.

## API

`POST /api/cmo:proposeTitleDevelopment`
```jsonc
{ "project_id": "...", "references": [ref1, ref2],
  "pulling_topic?": "...", "pulling_content_id?": "...",
  "target_audience?": "...", "business_goal?": "...", "script_summary?": "..." }
```
- references < 2 → 400. 검증 실패 → `{ ok:false, failed_references:[{reference_id, reasons}] }`.
- 성공 → `{ ok:true, run: TitleDevelopmentWorkflowRun, fallback_count }` + `title_development` 카드 upsert.
- `pulling_topic` 미입력 시 최신 `pulling_plan` 카드의 첫 주제 사용.

## 검증 현황 (2026-06-10)

- l5-core jest: title-development 59/59, 영향영역 회귀 68 suites/865 tests 0실패.
- tsc 0 · founder-ui `next build` 0 · dist `node --check` OK · 런타임 export 실재 확인.
- **미실행(활성화 후 권장)**: 라이브 HTTP smoke(NocoBase 재기동 필요 — dev 프로세스라 자동 미반영) · Playwright smoke(thumbnail 단계 프로젝트 필요).

## 함정

- **dist 패치 필수**: plugin src만 고치면 라이브 무변화. `dist/plugin.js`(번들)에 require·ACL·액션 3곳 직접 패치. 재기동해야 로드.
- **LLM 폴백 무한 주의**: 8단계가 매번 폴백이면 통과처럼 보이나 빈약. `fallback_count`로 검출(UI에 "N개 단계 폴백" 표기).
- **도메인 로직 UI 누수 금지**: 점수 계산·검증은 l5-core. 보드는 `run` 표시만.
