---
name: content-thumbnail-develop
description: Extract performing thumbnail patterns from viewtrap references and develop a 9-slot thumbnail matrix with per-candidate click-psychology, image/text develop suggestions, audience-fit judgement and a deterministic review checklist for the founder hook_draft_approval gate.
---

# Content Thumbnail Develop

Input: a video's key content (title, main_click_reason, target audience/problem/desire/loss), the channel_audience_profile ("내 채널에 모인 사람"), the founder's own product terms, and viewtrap-discovered reference videos (same category, with view_count and optional 성과도/기여도 grades). Output: a `thumbnail_plan` artifact that fills the `thumbnail_plan` report card required by the `hook_draft_approval` gate. All LLM steps carry a deterministic fallback — never fabricate measured grades or hook reasons.

Preserve the source lecture doctrine verbatim: 클릭률 비중은 이미지 45% / 문구 45% / 디자인 10% (디자인에 시간을 쏟지 말 것); 썸네일 문구는 권장 16자 이내; 시선은 왼쪽 위부터(핵심 요소는 좌상~중앙); "주제 매몰 금지 — 같은 주제라도 시청층이 다르면 다른 썸네일"; "대표님(타깃)들이 볼만한 채널인지가 제일 중요하다".

1. **타깃 채널 우선 발굴 (B6).** Build a channel-first discovery plan: ① 타깃이 볼만한 유튜브 검색 쿼리, ② 발견 주제 → 내 용어 매핑, ③ 재검색 쿼리. Then filter candidate channels by the single criterion `AUDIENCE_CHANNEL_CRITERIA` (would_watch true/false). Fallback = deterministic keyword-combination queries and name/description token matching.
2. **성과 썸네일 패턴 학습 (B1-6).** From the reference videos, keep only 성과도/기여도 Good·Great 실측 (한국어 동급 좋음/아주 좋음/높음 포함) first, then 미실측 references, sorted by view_count desc, top 10. Analyze each into `hook_type` (loss|gain|curiosity|warning|authority|result|contrast), `structure`, `reusable_formula`, `adapted_thumbnail_candidates`. Mark every unmeasured reference `measured=false` with a transparent `source_note` — never present an unmeasured reference as measured. Fallback = deterministic `estimateHookType` (keyword-based) + `unanalyzed` note.
3. **9-슬롯 매트릭스 생성 (PRD §3).** With the learned patterns as `reference_patterns`, generate exactly 9 candidates: 이미지전략(zoom/evidence/empathy) × 문구전략(gain/loss_avoidance/curiosity) → slots A~I. Each slot has a fixed `click_hypothesis`. Enforce: 9개 서로 다른 thumbnail_text; thumbnail_text ≠ title; 문구는 짧게(권장 16자); 제목·문구·이미지가 같은 클릭 이유를 강화; design_notes는 최소한. Fallback = deterministic slot templates from target fields.
4. **심리분석 3단계 (PRD §4).** For each of the 9 candidates produce: 문구 구조(text_structure/text_psychology), 이미지 연상(image_association), 결합 심리(combined_click_psychology) + expected_viewer_question/desire/fear + click_reason_clarity_score(0~100) + title_text_image_alignment_score(0~100). Fallback = deterministic maps keyed on image_strategy/text_strategy.
5. **이미지 디벨롭 (B1, 기술 1~5).** For a chosen candidate, apply zoom(확대)·evidence(증거)·curiosity(궁금증)·empathy(공감)·audience_preferred(시청층 선호): per technique output `applicable` + `suggestion` (무의미하면 applicable=false + 이유). Fallback = deterministic per-technique templates.
6. **문구 디벨롭 (B3, 제목기술 2·5·6).** Re-apply title-development techniques to the thumbnail text: easy_words(쉬운 일상어)·modifier(수식어)·question(질문화) → 3 candidates. Inspect each for 16자 초과 → `over_limit` + `warning` + deterministic `shortened_candidate`. Fallback = 원문 유지 + note.
7. **시청층 정합 판정 (B2).** Judge each candidate against `channel_audience_profile`: fit = match|partial|mismatch (프로필 없거나 LLM 실패 시 `unknown`). 주제 매몰 금지.
8. **디벨롭 자가 재귀 점검 (B5).** For any develop result, compare original vs developed: `improved` (true→keep, false→redo, null→unknown) with hook_reason for both. "후킹 이유를 설명할 수 없으면 개선이 아니다." LLM 실패 시 unknown + keep 권장.
9. **썸네일↔도입부 강도 연동 (B4).** Optionally score the intro hook 0~10, then align: intro_score ≥ thumbnail_score − 1 → `aligned`, else `intro_weaker` warning ("썸네일이 9점이면 도입부도 9점"). 점수 하나라도 없으면 `insufficient_data` (pure deterministic, no LLM).
10. **결정론 검수 (Stage E).** Run `reviewThumbnailCandidate` on selected candidates: 16자 초과 경고, 과도한 design_notes 경고, 폰트 라이선스 미확인 경고, and the review checklist (channel_audience_profile 제공 시 시청층 정합 항목 추가). This is human-review aid, not a pass/fail gate.

## STRICT output — `thumbnail_plan` artifact

> Envelope: wrap the fields below inside `data` per [../content-planning-orchestrator/references/artifact-contract.md](../content-planning-orchestrator/references/artifact-contract.md) — set top-level `schema_version:"content_planning_v1"` and `gate_stage:"thumbnail_plan"`.

Write the artifact that fills the `thumbnail_plan` report card (gate `hook_draft_approval`). Required top-level fields:

- `stage`: literal `"thumbnail_plan"`.
- `video_id`: string.
- `channel_first_discovery` (B6): `{ channel_queries: string[], term_mappings: {discovered_term, my_term}[], requery_terms: string[], selected_channels: {channel_id, would_watch, reason}[], criteria: string, source: "llm"|"fallback" }`.
- `learned_patterns` (B1-6): array of `{ id, reference_video_id, raw_thumbnail_text, hook_type, structure, reusable_formula, adapted_thumbnail_candidates: string[], measured: boolean, source_note }`; plus `eligible_count`, `unmeasured_count`.
- `matrix` (§3): exactly 9 candidates `{ candidate_id, slot(A~I), image_strategy, text_strategy, click_hypothesis, thumbnail_text, image_composition, design_notes }`; plus `matrix_source: "llm"|"fallback"`.
- `psychology` (§4): array of `{ candidate_id, text_structure, text_psychology, image_association, combined_click_psychology, expected_viewer_question, expected_viewer_desire, expected_viewer_fear, click_reason_clarity_score, title_text_image_alignment_score }`.
- `image_develop` (B1): `{ candidate_id?, suggestions: {technique, applicable, suggestion}[], notes: string[], source }`.
- `text_develop` (B3): `{ candidates: {technique, text, char_count, over_limit, warning?, shortened_candidate?}[], notes: string[], source }`.
- `audience_fit` (B2): per-candidate `{ fit: "match"|"partial"|"mismatch"|"unknown", reason, source }`.
- `develop_improvement` (B5, when applicable): `{ improved: boolean|null, hook_reason_original, hook_reason_developed, recommendation: "keep"|"redo"|"unknown", reason, source }`.
- `hook_intensity_alignment` (B4, optional): `{ status: "aligned"|"intro_weaker"|"insufficient_data", gap: number|null, warning?, recommended_action? }`.
- `review` (Stage E): `{ warnings: string[], checklist: string[] }` per reviewed candidate.
- `component_weights`: `{ image: 0.45, text: 0.45, design: 0.10 }` and `text_recommended_max: 16` (fixed doctrine constants).

Rules: emit exactly 9 matrix candidates; every `source` field must state `"llm"` or `"fallback"` honestly; unmeasured references stay `measured=false`; never let a thumbnail_text equal the title or duplicate another; keep Korean free-text (문구/구성/이유/제안) in Korean. Block when title or main_click_reason is empty, or when no eligible reference and no channel profile leave the audience judgement ungrounded.
