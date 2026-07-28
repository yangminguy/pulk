# Source contract — content-thumbnail-develop

Faithful extraction of the hardcoded prompts, judgment rules, step order, and schemas from the source TypeScript. Do not invent fields or prompts — this file is the transfer record.

## (d) Source files

- `packages/l5-core/src/functions/video-room/thumbnail-matrix.ts` — buildThumbnailMatrix9, analyzeThumbnailPsychology, reviewThumbnailCandidate + deterministic constants/maps.
- `packages/l5-core/src/functions/video-room/thumbnail-develop.ts` — B1~B6: develop/learn/judge/score/evaluate/discovery functions.
- Types: `packages/l5-core/src/functions/video-room/types.ts` (ThumbnailPattern, ThumbnailHookType, VideoRoomGateType, VideoRoomStatus).
- Gate/stage mapping: `packages/l5-core/src/functions/video-room/state-machine.ts` (GATE_REQUIRED_REPORT_STAGES).

Common LLM contract for every LLM step: `deps.llmComplete(prompt) → string`; retries = `max(0, deps.maxRetries ?? 2) + 1`; parse via `extractJson` (fenced ```json``` or first `{`/`[`…`}`/`]`) then zod `safeParse`; exhausted → `null` → deterministic fallback. `charCount` counts unicode code points (emoji-safe).

## (b) Step order + per-step LLM usage

Numbered by the natural pipeline (thumbnail pattern extraction → variant develop). Each function is independent; the orchestrator sequences them.

| # | Function (file) | LLM? | Fallback |
|---|---|---|---|
| B6a | `buildChannelFirstDiscoveryPlan` (develop) | LLM | deterministic query combos (audience + 브이로그/인터뷰/고민/일상 + product) |
| B6b | `selectAudienceChannels` (develop) | LLM | keyword token match on name+description |
| B1-6 | `learnThumbnailPatternsFromReferences` (develop) | LLM | `estimateHookType` keyword estimate + `unanalyzed` note |
| §3 | `buildThumbnailMatrix9` (matrix) | LLM | `buildFallbackMatrix` deterministic slot templates |
| §4 | `analyzeThumbnailPsychology` (matrix) | LLM | `buildFallbackPsychology` deterministic maps |
| B1 | `developThumbnailImage` (develop) | LLM | `fallbackImageDevelopSuggestions` per-technique templates |
| B3 | `developThumbnailTextWithTitleTechniques` (develop) | LLM | 원문 유지 + note |
| B2 | `judgeThumbnailAudienceFit` (develop) | LLM | `unknown` graceful |
| B5 | `evaluateDevelopImprovement` (develop) | LLM | `unknown` + keep 권장 |
| B4a | `scoreIntroHookStrength` (develop) | LLM | `null` score + manual note |
| B4b | `evaluateHookIntensityAlignment` (develop) | **no LLM** — pure deterministic | `insufficient_data` |
| E | `reviewThumbnailCandidate` (matrix) | **no LLM** — pure deterministic | n/a |

Validation gates inside buildThumbnailMatrix9: LLM output must be exactly 9 items; slot order normalized against SLOT_LABELS; `thumbnail_text` set size must be 9 (no dupes); no candidate `thumbnail_text === title`; each candidate passes `ThumbnailMatrixCandidateSchema`. Any failure → retry → fallback.

learnThumbnailPatternsFromReferences eligibility: `isGoodGrade` = /good|great|좋음|아주\s*좋음|높음/i on 성과도 OR 기여도. Order = measured(view desc) ++ unmeasured(view desc), slice(0,10). Unmeasured kept but `measured=false`; low-grade (graded but not good) excluded.

## (a) Extracted output schemas (field names · types · Korean free-text marked 🇰🇷)

### ThumbnailMatrixCandidate (ThumbnailMatrixCandidateSchema)
- `candidate_id`: string — `tm-{video_id}-{slot}`
- `slot`: enum A|B|C|D|E|F|G|H|I
- `image_strategy`: enum zoom|evidence|empathy
- `text_strategy`: enum gain|loss_avoidance|curiosity
- `click_hypothesis`: string 🇰🇷 (fixed CLICK_HYPOTHESES per slot)
- `thumbnail_text`: string(min 1) 🇰🇷
- `image_composition`: string(min 1) 🇰🇷
- `design_notes`: string 🇰🇷

Slot matrix (A~I): A zoom×gain, B zoom×loss_avoidance, C zoom×curiosity, D evidence×gain, E evidence×loss_avoidance, F evidence×curiosity, G empathy×gain, H empathy×loss_avoidance, I empathy×curiosity.

### ThumbnailPsychologyAnalysis (ThumbnailPsychologyAnalysisSchema)
- `candidate_id`: string
- `text_structure`: string(min 1) 🇰🇷
- `text_psychology`: string(min 1) 🇰🇷
- `image_association`: string(min 1) 🇰🇷
- `combined_click_psychology`: string(min 1) 🇰🇷
- `expected_viewer_question`: string(min 1) 🇰🇷
- `expected_viewer_desire`: string(min 1) 🇰🇷
- `expected_viewer_fear`: string(min 1) 🇰🇷
- `click_reason_clarity_score`: number 0~100
- `title_text_image_alignment_score`: number 0~100

### LearnedThumbnailPattern (extends ThumbnailPattern)
- `id`: string — `tp-{video_id}`
- `reference_video_id`: string
- `raw_thumbnail_text`: string 🇰🇷 (thumbnail_text || title)
- `hook_type`: enum loss|gain|curiosity|warning|authority|result|contrast
- `structure`: string 🇰🇷
- `reusable_formula`: string 🇰🇷
- `adapted_thumbnail_candidates`: string[] 🇰🇷
- `measured`: boolean
- `source_note`: string 🇰🇷
- result wrapper: `patterns[]`, `eligible_count`:number, `unmeasured_count`:number, `notes`:string[]🇰🇷, `source`:"llm"|"fallback"

### DevelopThumbnailImageResult (B1)
- `candidate_id?`: string
- `suggestions[]`: `{ technique: enum zoom|evidence|curiosity|empathy|audience_preferred, applicable: boolean, suggestion: string🇰🇷 }`
- `notes`: string[]🇰🇷, `source`: "llm"|"fallback"

### DevelopThumbnailTextResult (B3)
- `candidates[]`: `{ technique: enum easy_words|modifier|question, text: string🇰🇷, char_count: number, over_limit: boolean, warning?: string🇰🇷, shortened_candidate?: string🇰🇷 }`
- `notes`: string[]🇰🇷, `source`: "llm"|"fallback"
- Rule: THUMBNAIL_TEXT_RECOMMENDED_MAX = 16 code points; over → warning + `shortenText` slice(0,16).

### ThumbnailAudienceFitResult (B2)
- `fit`: "match"|"partial"|"mismatch"|"unknown"
- `reason`: string🇰🇷, `source`: "llm"|"fallback"

### IntroHookStrengthResult (B4a)
- `score`: number 0~10 | null
- `reason`: string🇰🇷, `source`: "llm"|"fallback"

### HookIntensityAlignment (B4b, pure)
- `status`: "aligned"|"intro_weaker"|"insufficient_data"
- `gap`: number|null (thumbnail_score − intro_score)
- `warning?`: string🇰🇷, `recommended_action?`: string🇰🇷
- Rule: intro_score ≥ thumbnail_score − 1 → aligned.

### DevelopImprovementResult (B5)
- `improved`: boolean|null
- `hook_reason_original`: string🇰🇷, `hook_reason_developed`: string🇰🇷
- `recommendation`: "keep"|"redo"|"unknown"
- `reason`: string🇰🇷, `source`: "llm"|"fallback"

### ChannelFirstDiscoveryPlan (B6a)
- `channel_queries`: string[]🇰🇷 (min 1)
- `term_mappings[]`: `{ discovered_term: string🇰🇷, my_term: string🇰🇷 }`
- `requery_terms`: string[]🇰🇷 (min 1)
- `notes`: string[]🇰🇷, `source`: "llm"|"fallback"

### SelectAudienceChannelsResult (B6b)
- `selected[]` / `rejected[]`: `{ channel_id, name, subscribers?, description?, would_watch: boolean, reason: string🇰🇷 }`
- `criteria`: string🇰🇷 (AUDIENCE_CHANNEL_CRITERIA), `source`: "llm"|"fallback"

### reviewThumbnailCandidate (Stage E, pure)
- returns `{ warnings: string[]🇰🇷, checklist: readonly string[]🇰🇷 }`
- warnings: 16자 초과; design_notes > 120자; font_source.license_checked !== true.
- checklist = THUMBNAIL_REVIEW_CHECKLIST (8 items) + AUDIENCE_FIT_CHECKLIST_ITEM when channel_audience_profile 제공.

### Fixed doctrine constants
- `THUMBNAIL_COMPONENT_WEIGHTS = { image: 0.45, text: 0.45, design: 0.10 }`
- `THUMBNAIL_TEXT_RECOMMENDED_MAX = 16`
- Image develop technique ids: zoom, evidence, curiosity, empathy, audience_preferred, reference_learning (1~5 direct on a candidate; 6 = reference learning function).

## Extracted prompts (verbatim intent — transfer, do not re-create)

- **Matrix (§3, buildMatrixPrompt):** "당신은 CMO다. … 이미지전략(zoom/evidence/empathy) × 문구전략(gain/loss_avoidance/curiosity) = 9개." Injects title, main_click_reason, target audience/problem/desire/loss, optional channel_audience_profile, up to 5 reference_patterns (`[hook_type] raw_text / structure`, 직접 복사 금지). 9 rules incl. 서로 다른 클릭 가설, 제목 반복 금지, 이미지 45%/문구 45%/디자인 10%, 16자 이내, 시선 좌상, 레퍼런스는 클릭 이유(이미지/제목) 판단 후 디벨롭, 시청층 기준 판단. Output: JSON array 9, no id.
- **Psychology (§4, buildPsychologyPrompt):** "당신은 CMO 심리분석 전문가다. … 3단계로 분석." 9 analysis fields; JSON only.
- **Image develop (B1, buildImageDevelopPrompt):** "당신은 CMO다. … 이미지 디벨롭 기술 1~5 적용." Technique defs from IMAGE_DEVELOP_TECHNIQUES; per technique applicable + suggestion; JSON array 5.
- **Pattern learning (B1-6, buildPatternLearningPrompt):** "당신은 CMO다. 같은 카테고리의 성과 썸네일 구성을 학습한다." Lists refs with 조회수/성과/기여(미실측 표기); output hook_type/structure/reusable_formula/adapted candidates; JSON array.
- **Audience fit (B2):** "당신은 CMO다. … 내 채널에 모인 사람에게 매력적인지 판정." match|partial|mismatch; 주제 매몰 금지.
- **Text develop (B3):** "당신은 CMO다. 제목 디벨롭 기술을 썸네일 문구에 재적용해 후보 3개." easy_words/modifier/question guidance from THUMBNAIL_TEXT_TECHNIQUE_GUIDANCE (제목 2·5·6단계 번안); 16자 이내, 제목 반복 금지; JSON array 3.
- **Intro hook (B4):** "당신은 CMO다. 도입부 후킹 강도 0~10 채점." JSON {score,reason}.
- **Develop improvement (B5):** "당신은 CMO다. 디벨롭 결과가 원본보다 더 후킹되게 됐는지 자가 점검." ① 더 후킹? ② 왜 후킹? 설명 못 하면 개선 아님.
- **Channel-first discovery (B6):** "당신은 CMO 컨설턴트다. 타깃 채널 우선 발굴 계획." ① 채널 검색 쿼리 ② 발견 주제→내 용어 매핑 ③ 재검색 쿼리; AUDIENCE_CHANNEL_CRITERIA 강조.
- **Select audience channels (B6):** "당신은 CMO 컨설턴트다. … 타깃이 실제로 볼만한 채널을 고른다." would_watch + reason per channel.

## (c) Gate report this skill fills

- Report card `stage = "thumbnail_plan"`.
- Gate `hook_draft_approval` requires stages `["title_development", "thumbnail_plan"]` (GATE_REQUIRED_REPORT_STAGES). This skill produces the `thumbnail_plan` half; title_development is a sibling skill.
- Gate page: `strategy`. VideoRoomStatus at this gate: `hook_draft_approval` (preceded by `thumbnail_pattern_extraction`, `intro_30s_analysis`).
- `advanceStatus` blocks the gate until both report stages are present (`missingGateReports`), so a missing `thumbnail_plan` artifact halts hook approval.
