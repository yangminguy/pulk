# Source contract — content-script-draft

Faithful transfer of the prompts, step order, and schemas hardcoded in the source TS. Do not invent fields or prompt text — everything below is extracted from source.

## Source files

- `packages/l5-core/src/functions/video-room/content-production.ts` — `proposeScriptDraft` (primary), `assembleContext`, and the LLM prompt/guards. Also `proposeThumbnailDraft` (sibling, thumbnail draft).
- `packages/l5-core/src/functions/video-room/types.ts` — output interfaces (`Intro30s`, `ScriptPart`, `IntegratedScript`, `ScriptQaReport`).
- Called domain functions (re-used, not reimplemented): `buildIntro30s` (intro-writer.ts), `writeLogicBlockPart` (logic-block-writers.ts), `integrateScript` (script-integrator.ts), `evaluateScriptQa` (script-qa.ts).
- `packages/l5-core/src/functions/video-room/script-factory.ts` — `@deprecated` v3.1 (ScriptBeat → factory VideoJob). Superseded by `video-execution-brief.ts`; not part of the script-draft stage. Listed only for provenance.

## (a) Schemas

### Input — `ScriptDraftInput` (Zod: `ScriptDraftInputSchema`)

| field | type | required | notes |
|---|---|---|---|
| `content_id` | string (min 1) | yes | card identifier |
| `content_type` | `'key' \| 'pulling'` | yes | |
| `topic_title` | string (min 1) | yes | confirmed topic |
| `target_viewer` | string | no | who; falls back to `'타깃 시청자'` (Korean) |
| `video_promise` | string | no | falls back to `"<title>"의 핵심을 끝까지 알려준다` |
| `core_message` | string | no | falls back to title |
| `strategic_angle` | string | no | falls back to `<title>를 시청자 문제 관점에서 재구성` |
| `intro_direction` | string | no | falls back to `<title> — 궁금증 유발 도입` |
| `cta` | string | no | falls back to `관련 영상을 이어서 확인하세요` |
| `logic_blocks` | `Partial<LogicBlock>[]` | no | empty → 3 deterministic blocks |
| `materials` | string[] | no | usable sentences/scenes/evidence (Korean free text) |
| `voc_lines` | string[] | no | real viewer language (Korean); empty → derived from materials/topic |
| `safe_claims` | string[] | no | Korean free text |
| `proof_points` | string[] | no | Korean free text |
| `risk_notes` | string[] | no | Korean free text |
| `benchmark_video_id` | string | no | FR-8 intro benchmark video id |

Consumer stages (English enum), cycled in order: `phenomenon`, `desire`, `plan`, `action`, `reward`.

### Output — `ProposeScriptDraftResult`

`intro_30s` — **`Intro30s`**:
| field | type | notes |
|---|---|---|
| `first_sentence` | string | Korean |
| `hook_type` | string | copied into `rationale.intro.structure_name` |
| `tension` | string | Korean |
| `viewer_promise` | string | Korean |
| `script` | string | Korean narration free text (~200 chars) |
| `used_materials` | string[] | |
| `used_script_insights` | string[] | |
| `why_it_works` | string | Korean; copied into `rationale.intro.reason` |

`logic_blocks` — array of **`ScriptPart`** (one per block, in order):
| field | type | notes |
|---|---|---|
| `block_id` | string | |
| `draft` | string | Korean narration free text |
| `used_materials` | string[] | |
| `used_voc_lines` | string[] | |
| `used_claims` | string[] | |
| `transition_out` | string | Korean |
| `risk_notes` | string[] | Korean |

`integrated_script` — **`IntegratedScript`**:
| field | type | notes |
|---|---|---|
| `full_script` | string | Korean narration-ready full script (pure text, no markdown) |
| `section_map` | string[] | |
| `removed_repetition` | string[] | |
| `added_transitions` | string[] | |
| `strategy_alignment_notes` | string[] | fed into `qa.logic_block_alignment` |

`qa` — **`ScriptQaReport`**:
| field | type | notes |
|---|---|---|
| `strategy_fit_score` | number | fixed 85 |
| `audience_fit_score` | number | fixed 85 |
| `voice_fit_score` | number | fixed 80 |
| `sales_logic_score` | number | fixed 85 |
| `fact_safety_score` | number | fixed 95 |
| `desire_stage_coverage` | `Record<ConsumerStageEn, boolean>` | true per covered stage |
| `logic_block_alignment` | string[] | = integrated_script.strategy_alignment_notes |
| `missing_parts` | string[] | |
| `revision_requests` | string[] | |
| `overall_pass` | boolean | computed by `evaluateScriptQa` |

`rationale` — **`ScriptRationale`** (FR-8, produced at generation time):
| field | type | notes |
|---|---|---|
| `intro.benchmark_video_id` | string \| null | null → UI shows "벤치마킹 없음" |
| `intro.structure_name` | string | = intro_30s.hook_type |
| `intro.reason` | string | = intro_30s.why_it_works (Korean) |
| `intro.used_materials` | string[] | |
| `intro.generation` | `'llm' \| 'deterministic'` | which path produced the intro/body |
| `blocks[]` | `{ block_id, used_materials[], used_voc_lines[], used_claims[] }` | per-block source mapping |
| `research_sources` | string[] | cleaned `materials` (all input research) |

## (b) Step order and per-step LLM usage

| step | action | domain fn | LLM? |
|---|---|---|---|
| 0 | Validate `ScriptDraftInputSchema`; `assembleContext` builds brief/pack/voc/claims + logic blocks (deterministic fallbacks) | — | no |
| 1 | Intro 30s | `buildIntro30s` | no (deterministic) |
| 2 | One body part per logic block | `writeLogicBlockPart` ×N | no (deterministic) |
| 3 | Integrate full script | `integrateScript` | no (deterministic) |
| 3.5 | **Optional** real-prose regeneration overwriting `intro_30s.script` + `integrated_script.full_script` | inline | **yes, only when `llmComplete` injected** |
| 4 | QA scoring (fixed threshold scores) | `evaluateScriptQa` | no (deterministic) |
| 5 | FR-8 rationale assembly | inline | no |

Structure (intro/blocks/qa objects) is always deterministic. The LLM only rewrites the narration text of `intro_30s.script` and `integrated_script.full_script`, and only if it passes the guards; otherwise the deterministic draft is kept. The non-LLM path is the invariant deterministic contract.

### LLM prompt (step 3.5) — extracted verbatim from source

System/instruction lines (joined by `\n`, empty lines filtered out):

```
너는 유튜브 롱폼 낭독용 원고 작가다. 아래 기획을 근거로 한국어 원고를 작성하라.
출력 형식(이 두 구분자 외 다른 머리말·설명 금지):
===INTRO===
(도입부 — 200자 내외(170~280자, 낭독 30~50초). 썸네일을 클릭한 이유를 첫 문장에서 다시 확인시키고 시청자 상황에 공감시킨다. 정답은 아직 말하지 않는다. 170자 미만이면 실패다.)
===BODY===
(본론 — 2,500~3,500자. 로직블록 순서대로 전개. 왜 그런지 원리 설명, 직접 해본/국내 사례, 예상 반론에 대한 선반영을 포함해 신뢰도를 보강한다. 마지막은 다음 행동 제안 1문장.)

주제: {brief.topic}
타깃 시청자: {brief.target_viewer.who}
핵심 메시지: {brief.core_message}
영상의 약속: {brief.video_promise}
로직블록:
{blockOutline}
시청자의 말(VOC): {pain_expressions + desire_expressions, up to 5, " / " joined}   ← line omitted if no VOC

참고용 결정론 초안(뼈대 — 표현은 자유롭게 재작성):
{integrated_script.full_script sliced to first 1200 chars}
```

`blockOutline` = each logic block as `"{i+1}. {main_claim} — 근거: {supporting_materials joined ' / '} (시청자 감정: {viewer_emotion})"` (the `— 근거:` clause omitted when no supporting materials).

Retry feedback (appended on retries when a prior under-length body exists):

```
[재시도 피드백] 직전 시도의 본론은 {lastBody.length}자로 기준(2,500자 내외) 미달이었다. 이번에는 반드시 본론을 2,500자 이상으로 써라 — 각 로직블록의 원리 설명·국내 사례·반론 반박을 지금의 2배 깊이로 확장하라.
```

### Guards (step 3.5)

- Strip markdown before measuring: remove `**`, `__`, backticks, and leading `#`..`####` headings; trim.
- Parse `===INTRO=== … ===BODY===` and `===BODY=== … EOF`.
- Refusal regex (reject as script): `(어렵습니다|필요합니다|보내\s*주세요|제공해\s*주|다시\s*정리해|미완성|작성할\s*수\s*없)`.
- `introOk`: length 170–400 and not refusal.
- `bodyOk`: length ≥ 2000 and not refusal.
- Adopt LLM result only when `introOk && bodyOk`; set `full_script = "{intro}\n\n{body}"`, `generation='llm'`.
- Retries = `max(0, maxRetries ?? 2) + 1` (default 3 attempts). Keep the longest non-refusal candidate across attempts.
- Final fallback: if no attempt passed but best candidate has body ≥ 1600 and intro ≥ 150 chars, adopt it; else keep the deterministic draft (`generation='deterministic'`).

## (c) Gate report — stage `script_draft` → gate `script_approval`

This skill fills the `script_draft` stage, whose approval is the `script_approval` gate (`packages/l5-core/src/functions/video-room/approval-gates.ts`: `GATE_PAGE_MAP.script_approval = 'production'`). The gate is created via `createApprovalGate` and requires:

- `gate_type: "script_approval"` (page auto-derived to `production`).
- non-empty `title` and `context` (Korean), and non-empty `options` (PRD §4.3 — no approval-less automation; a gate with no options is invalid).
- optional `recommended_option`.
- `status` starts `pending`; founder/CEO decision applied via `decideGate` (cleared only when `status === 'approved'`).

The gate report's payload is the `script_draft.json` artifact above (intro + logic_blocks + integrated_script + qa + rationale); the founder approves/edits this draft to clear `script_approval` and advance to the storyboard stage.
