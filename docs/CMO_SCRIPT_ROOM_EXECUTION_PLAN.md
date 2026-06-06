# CMO / Script Room v3.1 — 전체 실행계획 (Execution Plan)

최종 작성: 2026-06-06
원본 PRD: `~/Downloads/pulk_cmo_script_room_prd_v3_1_full.md` (v3.1, 정본)
참고 PRD: `~/Downloads/cmo_script_room_prd_v2.md` (v2, ScriptBeat 단계는 폐기), `~/Downloads/ai_slide_video_factory_v2_1_full.md` (수신 측)

---

## 0. 확정된 핵심 경계 (Locked Boundary)

```
[CMO / Script Room]  조사 → 전략 → 원고 → QA → VideoExecutionBrief
        │  (계약 1장: 기획+원고+근거+에셋요청 / scene_type 비움)
        ▼
[AI Slide Video Factory]  + 사용자 오디오/얼굴/화면 에셋
        → 오디오보정 → 전사 → MessageUnit → Scene Decision → Timeline v2 → Remotion 렌더
```

- CMO = **무엇을 말할지** 결정. 산출물의 끝 = `VideoExecutionBrief` (schema_version: `cmo_to_factory_v2`).
- CMO는 `scene_type` / `best_medium` / `duration`을 **확정하지 않는다.** `visual_intent_hint`(힌트)까지만.
- 실제 에셋 **파일**은 CMO가 안 넘긴다. brief는 `asset_requests`(요청)만 담는다. 파일은 사용자가 Factory에 직접 제공.
- v2의 **ScriptBeat Builder / Factory Handoff(scene_type 확정 VideoJob)** 경로는 **폐기**. 기존 `script-factory.ts`는 deprecate하고 `video-execution-brief.ts` 빌더로 교체.
- 범위 밖(§13 제외): voice_recording / slide_deck / rendering / qa(영상) / upload. 기존 `production.ts`·`review-publish.ts`는 레거시로 유지하되 신규 플로우에서 호출하지 않음.

---

## 1. 모듈 배치 결정

신규 도메인은 **기존 video-room 모듈 안**에 둔다 (사용자 결정: "기존 video room 모듈에 넣어줘"). PRD §16.18의 `cmo-script-room/` 별도 폴더 대신 `packages/l5-core/src/functions/video-room/` 하위에 파일을 추가한다. ConsumerStage·business-pt-context·second-brain·viewtrap·key/pulling-content 등 기존 자산을 그대로 import해 중복을 없앤다.

```
packages/l5-core/src/functions/video-room/
  types.ts                     # [확장] v3.1 계약 타입 추가
  research/
    market-research.ts         # [신규] Market Research Pack
    voc-research.ts            # [신규] VOC Pack
    claim-verification.ts      # [신규] Claim Evidence Report
    audience-fit.ts            # [신규] Audience Fit Report
    script-material-pack.ts    # [신규] Script Material Pack 빌더
  strategy/
    cmo-strategy-brief.ts      # [신규] CMO Video Strategy Brief (logic_blocks)
    content-set-validation.ts  # [신규/확장] Content Set Validation Matrix
    thumbnail-plan.ts          # [신규] 썸네일 후보 (reference-analysis 재사용)
  script/
    intro-writer.ts            # [신규] Intro 30s
    logic-block-writers.ts     # [신규] Logic Block 기반 Writer A/B/C
    script-integrator.ts       # [신규] 통합
    founder-voice.ts           # [신규] 말투 변환 (second-brain-query 재사용)
    script-qa.ts               # [신규] CMO Script QA
  video-execution-brief.ts     # [신규] VideoExecutionBrief 빌더 (script-factory 대체)
  brief-validators.ts          # [신규] brief JSON schema + scene_type 부재 검증
  revision-router.ts           # [신규] QA 실패 → 담당 agent 라우팅
  script-factory.ts            # [deprecate] 신규 플로우에서 미사용
```

UI: `apps/founder-ui/src/app/video-room/_components/` 에 패널 추가.

---

## 2. Phase 분할 (workflow 단위, 순차 실행)

각 Phase = workflow 1회 호출. workflow 안에서 agent team이 병렬 fan-out → 어드버사리얼 검증 → 합성. **Phase 사이마다 결과를 확인하고 다음 Phase로 진행.**

ConsumerStage 영문 매핑: `현상=phenomenon, 욕구=desire, 계획=plan, 행동=action, 보상=reward`.

---

### Phase 0 — 기획 정렬 + 계약 문서 (workflow)
**목표:** 갭을 코드 레벨로 확정하고, 계약 문서 2종을 만든다.
**Agent team:** research-analyst(기존 코드 정밀 스캔) ×2, architect(통합 설계) ×1, technical-writer(문서) ×1.
**산출물:**
- `docs/CMO_SCRIPT_ROOM_PRD.md` — v3.1을 pulk 기준으로 정리 (정본)
- `docs/CMO_TO_FACTORY_CONTRACT.md` — VideoExecutionBrief 필드별 계약 + 금지 필드(scene_type 등) 명세 (Factory PRD §5와 1:1)
- 기존 video-room 심볼별 교체/추가/유지/폐기 표 (이 문서 §1 보강)
**Verify:** 두 계약 문서가 Factory PRD §5 스키마와 필드 단위로 일치. scene_type 금지 규칙 명시.

### Phase 1 — 계약/타입 레이어 (workflow)
**목표:** 모든 산출물의 단일 타입 소스 + VideoExecutionBrief + validator + scene_type 부재 검증 테스트.
**Agent team:** typescript-pro ×2 (types/validators 분담), qa-expert ×1 (테스트), code-reviewer ×1.
**산출물:**
- `types.ts` 확장: 7개 Research pack, CmoVideoStrategyBrief(+LogicBlock), ContentSetValidation, Intro30s, ScriptPart, IntegratedScript, VoiceMatchedScript, ScriptQaReport, VideoExecutionBrief, ContentCard 상태 enum
- `video-execution-brief.ts` 빌더 스텁 + `brief-validators.ts` (JSON schema validation + 테스트6: scene_type/best_medium/duration 있으면 invalid)
**Verify:** `pnpm --filter @l5/core build` tsc 0. brief validator 단위테스트 GREEN (scene_type 포함 brief → invalid 확인).

### Phase 2 — Research Room (workflow)
**목표:** 조사 5종 도메인 함수 + 단위테스트. 모두 순수함수(Date/random 주입).
**Agent team:** backend-developer ×5 병렬 (Market/VOC/Claim/AudienceFit/MaterialPack 각 1), qa-expert ×1 (Gate 1 검증 테스트), code-reviewer ×1.
**산출물:** `research/*.ts` 5개 + 각 `__tests__`. Gate 1(Research Completeness: Audience Fit ≥80, VOC real ≥5, safe_claims ≥3) 검증 함수.
**Verify:** 각 pack 빌더가 PRD §6~7 JSON 구조 산출. Gate 1 테스트 GREEN. tsc 0.

### Phase 3 — Strategy + Content Set (workflow)
**목표:** CMO Strategy Brief(logic_blocks) + Content Set Validation Matrix + Thumbnail plan.
**Agent team:** backend-developer ×3 (strategy-brief / content-set-validation / thumbnail), qa-expert ×1 (Gate 2·3 + 고정배정 금지 테스트), code-reviewer ×1.
**산출물:** `strategy/*.ts` 3개 + 테스트. 테스트1(고정배정 금지: covered_stages 자유), 테스트2(키 콘텐츠 단계 유연), 테스트3(세트 5단계 커버리지), 테스트7(조사 없이 brief 생성 시 실패).
**Verify:** logic_blocks ≥3, 각 block main_claim+supporting_materials 존재. 세트 5단계 100% 커버 검증. tsc 0.

### Phase 4 — Script Room (workflow)
**목표:** Intro/Logic Block Writers/Integrator/Founder Voice/Script QA + Revision Router.
**Agent team:** backend-developer ×4 (intro+writers / integrator / founder-voice / script-qa), qa-expert ×1 (Gate 4·5 + 테스트8 logic_block 분담), code-reviewer ×1.
**산출물:** `script/*.ts` 5개 + `revision-router.ts` + 테스트. 테스트8(Writer A/B/C가 단계 아닌 logic_block 기준 분담), Founder Voice는 논리 보존(preserved_logic) 검증, Script QA 통과 기준(전략80/타깃80/말투75/판매80/사실90).
**Verify:** Revision Router가 실패 원인→담당 agent 매핑(§16.15). Founder Voice 논리 불변 테스트 GREEN. tsc 0.

### Phase 5 — VideoExecutionBrief 빌더 완성 + 핸드오프 (workflow)
**목표:** 전 단계 산출물 → VideoExecutionBrief 완성. script-factory 대체 배선. Factory 전달 경로(파일/transport).
**Agent team:** backend-developer ×2 (brief 빌더 / 핸드오프), qa-expert ×1 (테스트6 scene_type 부재 + end-to-end), code-reviewer ×1.
**산출물:** `video-execution-brief.ts` 완성, Factory handoff 어댑터, index.ts export 정리(script-factory deprecate 주석).
**Verify:** 하나의 콘텐츠 카드 입력 → Research→Strategy→Script→QA→brief 생성. brief가 Factory `cmo_to_factory_v2` validation 통과. scene_type 부재 보장. tsc 0, 전체 l5-core 테스트 GREEN.

### Phase 6 — UI / API (workflow)  *(범위 확정 후 진행)*
**목표:** founder-ui 패널 + `cmo:` API + Content Card Board.
**Agent team:** nextjs-developer ×1, react-specialist ×2 (Research/Strategy/Script/Board 패널 분담), ui-ux-tester ×1.
**산출물:** `_components/` 에 ResearchRoomPanel / StrategyBriefPanel / ScriptRoomPanel / ContentCardBoard / VideoExecutionBriefPanel + `cmo:generateVideoExecutionBrief` API + 콘텐츠별 "영상 생성" 버튼(순차 제작).
**Verify:** 카드 보드에서 카드별 영상 생성 버튼만 노출(테스트5 순차 제작). brief 패널이 JSON validation 결과 표시.

---

## 3. 완료 기준 (PRD §15 + §16.19)

- 주제 1개로 Research → Strategy → Script → QA → VideoExecutionBrief 생성.
- 키 1 + 풀링 5 세트, 5단계(현상→욕구→계획→행동→보상) 100% 커버, covered_stages 자유 배정.
- 원고는 logic_blocks 기준 분담, Founder Voice 변환까지 완료(논리 불변).
- 썸끝원끝/Second Brain 인사이트가 썸네일/원고 전 조회·기록.
- VideoExecutionBrief에 scene_type/best_medium 확정값 없음.
- brief가 Factory v2.1 validation 통과 → Factory가 Timeline Draft 생성 가능.

## 4. 실행 원칙

- 모든 도메인 로직은 `l5-core` 순수함수, NocoBase 없이 테스트 가능 (CLAUDE.md 개발규칙 2).
- 모든 scoring 규칙(Audience Fit, Script QA, Content Set)은 단위테스트 필수 (규칙 3).
- 각 Phase 완료 시 `docs/HANDOFF.md`·`docs/TASKS.md` 갱신, 아키텍처 변경은 `docs/DECISIONS.md` 기록.
- D-위험도/pii_level은 외부 액션 없는 순수 도메인이라 해당 없음. Factory handoff(외부 전달)만 승인 게이트 대상.
