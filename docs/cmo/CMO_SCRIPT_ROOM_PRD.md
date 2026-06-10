# CMO / Script Room v3.1 — PRD (Pulk 정본)

**최종 수정일:** 2026-06-06  
**기준 문서:** `/Users/wonminyang/Downloads/pulk_cmo_script_room_prd_v3_1_full.md` (v3.1)  
**통합 설계:** `docs/cmo/CMO_SCRIPT_ROOM_EXECUTION_PLAN.md`  
**구현 기준:** 기존 `packages/l5-core/src/functions/video-room/` 모듈에 통합

---

## 0. 이 문서의 목적

이 PRD는 Pulk의 **CMO / Script Room**이 무엇을 하는지, 어디까지 책임지는지, AI Slide Factory와 어떤 계약을 맺는지를 정의한다.

### 핵심 책임 분리

```
Pulk CMO / Script Room
= 무엇을 말할지, 왜 말할지, 누구에게 어떤 순서로 말할지 결정
  → 산출물: VideoExecutionBrief (계약 문서 1장)

AI Slide Video Factory
= 어떻게 보여줄지 결정
  → 입력: VideoExecutionBrief
  → 산출물: Timeline JSON, Remotion 영상
```

### Pulk가 하지 않는 것

- Scene Type 확정 (강제값)
- Best Medium 확정 (강제값)
- Timeline JSON 생성
- Duration 확정
- 시각 자산 파일 직접 제공 (brief에 요청만 기록)

### Pulk가 하는 것

- 시장조사 (Market Research Pack)
- 타깃 실제 언어 수집 (VOC Research Pack)
- 주장/근거 검증 (Claim Evidence Report)
- 타깃 욕구 검증 (Audience Fit Report)
- 원고 재료표 구성 (Script Material Pack)
- CMO 영상 전략기획서 작성 (CMO Video Strategy Brief)
- 논리 블록 기반 원고 작성
- Founder Voice 변환
- CMO QA
- VideoExecutionBrief 생성

---

## 1. 핵심 원칙 18개

### 1.1 조사가 기획보다 먼저다

올바른 순서:

```
주제 발견
→ 시장조사 (Market Research Pack)
→ VOC 수집 (Voice of Customer Pack)
→ 주장/근거 검증 (Claim Evidence Report)
→ 타깃 욕구 검증 (Audience Fit Report)
→ 원고 재료표 구성 (Script Material Pack)
→ CMO 영상 전략기획서 (CMO Video Strategy Brief)
→ 원고 작성 (Logic Block 기반)
→ Founder Voice 변환
→ CMO QA
→ VideoExecutionBrief 생성
```

### 1.2 소비자 욕구 5단계는 고정 배정이 아니다

**잘못된 방식:**
```
풀링 1 = 현상
풀링 2 = 현상
풀링 3 = 욕구
풀링 4 = 계획
풀링 5 = 행동
```

**올바른 방식:**
```
각 콘텐츠는 multiple covered_stages를 가질 수 있다.
예: pulling_1 = [현상, 욕구], pulling_2 = [욕구, 계획], key = [욕구, 계획, 행동, 보상]
```

### 1.3 원고 작성 파트는 단계별이 아니라 논리 블록별이다

Writer A/B/C는 현상/욕구/계획으로 나뉘지 않는다.  
대신 CMO Strategy Brief의 `logic_blocks`를 기준으로 나눠 쓴다.

### 1.4 키 콘텐츠와 풀링 콘텐츠는 세트 단위로 검증한다

중요한 기준은 개별 콘텐츠의 단계가 아니라:

> 풀링 콘텐츠와 키 콘텐츠를 모두 봤을 때 소비자가 `현상 → 욕구 → 계획 → 행동 → 보상`을 순차적으로 느끼는가?

### 1.5 영상은 콘텐츠별로 순차 생성한다

콘텐츠 세트가 완성되어도 모든 영상을 한 번에 만들지 않는다.  
사용자가 특정 카드의 **영상 생성 버튼**을 누르면 그 카드만 Factory로 전달된다.

### 1.6 CMO는 scene_type을 확정하지 않는다

Factory PRD 테스트2:  
> "Pulk가 sceneType을 확정해서 넘기면 warning 또는 fail"

CMO는 `visual_intent_hint`(힌트)로만 의도를 전달할 수 있다.

### 1.7 CMO는 best_medium을 확정하지 않는다

scene_type과 같은 이유.  
Factory Scene Decision Engine이 `communication_goal` 기반으로 최종 결정한다.

### 1.8 CMO는 duration을 확정하지 않는다

Factory PRD 테스트6:  
> "communication_goal 기반으로 Factory가 장면과 길이를 결정한다"

CMO가 특정 블록에 duration을 확정하면 Factory의 Scene Decision을 우회하는 위반이다.

### 1.9 CMO는 Timeline JSON을 생성하지 않는다

Factory PRD §12.1:  
> "AI Slide Factory가 최종 Timeline JSON을 생성한다"

CMO가 scenes 배열이나 Timeline JSON 구조를 brief에 포함하는 것은 Factory 책임 영역을 침범한다.

### 1.10 원고는 Script Material Pack 없이 작성할 수 없다

시장조사, VOC, 근거 검증, 타깃 검증 없이 CMO Strategy Brief를 만들면 실패다.  
테스트7 규칙.

### 1.11 키 콘텐츠는 반드시 계획/행동만 담당하지 않는다

가능한 역할:
- 문제 해결형
- 욕구 증폭형
- 방법론 제시형
- 전환 유도형
- 보상 상상형
- 사례/증거 기반 설득형

### 1.12 풀링 콘텐츠는 반드시 현상만 다루지 않는다

가능한 역할:
- 문제 자각
- 욕구 자극
- 오해 깨기
- 작은 실행 유도
- 사례 제시
- 보상 상상
- 키 콘텐츠로 연결

### 1.13 visual_intent_hint는 강제값이 아니라 힌트다

CMO가 "비교표가 효과적일 것 같음"이라고 제안해도 Factory는 다른 표현을 선택할 수 있다.

### 1.14 asset_requests는 요청이지 파일 확정이 아니다

CMO brief에 포함되는 asset_requests는:
- 어떤 자산이 필요한지 설명
- 선호 자산 유형
- 이유

실제 자산 파일은 **사용자가 Factory에 직접 제공**한다.

### 1.15 required_evidence는 근거 유형 목록일 뿐이다

source_screenshot scene의 배치 힌트 역할만 한다.  
Factory가 근거 위치와 방식을 최종 결정한다.

### 1.16 Founder Voice 변환은 논리를 보존해야 한다

Second Brain 기반 말투 변환 agent는 문체만 바꾸고 논리는 유지해야 한다.

### 1.17 썸끝원끝과 Second Brain 인사이트는 전 단계에서 조회해야 한다

- CMO Strategy Brief 작성 전: Second Brain 전략 인사이트
- 썸네일 계획 전: 썸끝 썸네일 인사이트
- 도입부 30초 작성 전: 원끝 원고 인사이트
- 전체 원고 작성 전: 원끝 + Script Material Pack
- Founder Voice 변환 전: Second Brain 사용자 원고/문서

### 1.18 각 콘텐츠는 고정 단계 배정 금지를 검증해야 한다

테스트1: 풀링 5개와 키 1개 생성 시 covered_stages가 자유롭게 배정되어야 함.

---

## 2. 전체 워크플로우

```
[1] Viewtrap / 주제 발견
    ↓
[2] CMO Intake Form
    ↓
[3] Market Research Pack
    ↓
[4] Voice of Customer Pack
    ↓
[5] Claim Evidence Report
    ↓
[6] Audience Fit Validation
    ↓
[7] Script Material Pack
    ↓
[8] CMO Video Strategy Brief
    ↓
[9] Logic Block 기반 원고 작성
    ↓
[10] 원고 통합
    ↓
[11] Founder Voice 변환
    ↓
[12] CMO Script QA
    ↓
[13] Content Card Board
    ↓
[14] VideoExecutionBrief 생성
    ↓
[15] AI Slide Factory handoff
```

---

## 3. Research Room (조사 5종)

### 3.1 Market Research Pack

목적: 주제에 대한 시장 맥락, 경쟁 콘텐츠, 사례, 오해, 빈틈을 찾는다.

```json
{
  "market_research_pack": {
    "topic": "",
    "why_this_topic_matters": "",
    "market_context": [],
    "competitor_content_patterns": [],
    "unanswered_questions": [],
    "common_misunderstandings": [],
    "example_materials": [],
    "content_opportunities": []
  }
}
```

### 3.2 Voice of Customer Pack

목적: 타깃의 실제 언어를 모은다.

```json
{
  "voice_of_customer_pack": {
    "repeated_phrases": [],
    "pain_expressions": [],
    "desire_expressions": [],
    "objection_expressions": [],
    "realistic_situations": [],
    "must_use_language": [],
    "avoid_language": []
  }
}
```

### 3.3 Claim Evidence Report

목적: 원고에 들어갈 주장과 근거를 검증한다.

```json
{
  "claim_evidence_report": {
    "safe_claims": [],
    "risky_claims": [],
    "unverified_claims": [],
    "safe_wording": [],
    "proof_points": [],
    "claims_to_avoid": []
  }
}
```

### 3.4 Audience Fit Report

목적: 조사된 내용이 타깃이 실제로 듣고 싶은 말인지 검증한다.

검증 항목: Pain Fit, Desire Fit, Language Fit, Curiosity Fit, Trust Fit, Action Fit

```json
{
  "audience_fit_report": {
    "overall_score": 0,
    "pain_fit": 0,
    "desire_fit": 0,
    "language_fit": 0,
    "curiosity_fit": 0,
    "trust_fit": 0,
    "action_fit": 0,
    "what_target_wants_to_hear": [],
    "what_target_does_not_want_to_hear": [],
    "must_answer_questions": [],
    "recommended_angle": ""
  }
}
```

### 3.5 Script Material Pack

시장조사, VOC, 근거 검증, 타깃 검증 결과를 원고 작성 가능한 재료표로 만든다.

```json
{
  "script_material_pack": {
    "topic": "",
    "target_viewer": "",
    "core_message_candidates": [],
    "viewer_language": [],
    "pain_scenes": [],
    "desire_scenes": [],
    "proof_points": [],
    "examples": [],
    "counterarguments": [],
    "metaphors": [],
    "story_candidates": [],
    "must_use_lines": [],
    "must_avoid_lines": [],
    "safe_claims": [],
    "cta_materials": []
  }
}
```

**중요:** 원고 작성 agent는 이 재료표 밖에서 사실을 지어내면 안 된다.

---

## 4. CMO Video Strategy Brief

조사와 원고 재료표 이후에 작성되는 진짜 기획서다.

```json
{
  "cmo_video_strategy_brief": {
    "content_id": "",
    "content_type": "key | pulling",
    "topic": "",
    "channel_context": {
      "current_position": "",
      "content_pillar": "",
      "role_in_content_set": "",
      "bridge_from_previous_content": "",
      "bridge_to_next_content": ""
    },
    "target_viewer": {
      "who": "",
      "current_belief": "",
      "hidden_desire": "",
      "main_pain": "",
      "objection": "",
      "language_style": []
    },
    "consumer_desire_coverage": {
      "covered_stages": ["phenomenon", "desire"],
      "primary_stage": "",
      "stage_explanation": ""
    },
    "video_promise": "",
    "core_message": "",
    "strategic_angle": "",
    "logic_blocks": [
      {
        "block_id": "block_1",
        "role": "",
        "covered_stages": [],
        "main_claim": "",
        "supporting_materials": [],
        "viewer_emotion": "",
        "transition_to_next_block": "",
        "visual_intent_hint": ""
      }
    ],
    "intro_direction": "",
    "thumbnail_direction": "",
    "script_tone_direction": "",
    "cta": "",
    "risk_notes": []
  }
}
```

**중요:** `visual_intent_hint`는 AI Slide Factory가 참고할 힌트일 뿐, Scene Type 확정값이 아니다.

---

## 5. Script Room

### 5.1 Intro Writer

도입부 30초를 작성한다.

```json
{
  "intro_30s": {
    "first_sentence": "",
    "hook_type": "",
    "tension": "",
    "viewer_promise": "",
    "script": "",
    "used_materials": [],
    "used_script_insights": [],
    "why_it_works": ""
  }
}
```

### 5.2 Logic Block Writers

Writer A/B/C는 현상/욕구/계획을 나누는 것이 아니라, CMO 기획서의 `logic_blocks`를 나눠 쓴다.

```json
{
  "script_part": {
    "block_id": "",
    "draft": "",
    "used_materials": [],
    "used_voc_lines": [],
    "used_claims": [],
    "transition_out": "",
    "risk_notes": []
  }
}
```

### 5.3 Script Integrator

파트별 원고를 하나의 자연스러운 원고로 통합한다.

```json
{
  "integrated_script": {
    "full_script": "",
    "section_map": [],
    "removed_repetition": [],
    "added_transitions": [],
    "strategy_alignment_notes": []
  }
}
```

### 5.4 Founder Voice Agent

Second Brain에 저장된 사용자의 기존 원고와 문서를 기반으로 말투를 변환한다.

```json
{
  "voice_matched_script": {
    "full_script": "",
    "voice_profile_used": {},
    "changed_phrases": [],
    "preserved_logic": true
  }
}
```

---

## 6. CMO Script QA

최종 원고가 전략과 일치하는지 검증한다.

```json
{
  "script_qa_report": {
    "strategy_fit_score": 0,
    "audience_fit_score": 0,
    "voice_fit_score": 0,
    "sales_logic_score": 0,
    "fact_safety_score": 0,
    "desire_stage_coverage": {
      "phenomenon": true,
      "desire": true,
      "plan": true,
      "action": false,
      "reward": true
    },
    "logic_block_alignment": [],
    "missing_parts": [],
    "revision_requests": [],
    "overall_pass": false
  }
}
```

통과 기준:

| 항목 | 기준 |
|---|---:|
| 전략 부합도 | 80 이상 |
| 타깃 적합도 | 80 이상 |
| 내 말투 적합도 | 75 이상 |
| 판매 논리 | 80 이상 |
| 사실 안전성 | 90 이상 |

---

## 7. 소비자 욕구 5단계

| 단계 | 의미 | 콘텐츠에서의 역할 |
|---|---|---|
| 현상 (phenomenon) | 소비자가 지금 겪는 문제, 불편, 이상 징후 | "나도 이 상황인데?"라고 멈추게 한다 |
| 욕구 (desire) | 그 문제가 해결되었을 때 얻고 싶은 상태 | "그래서 내가 이걸 원했구나"를 자각시킨다 |
| 계획 (plan) | 욕구를 실현하기 위한 방법, 프레임, 순서 | "이렇게 하면 되겠네"라는 이해를 준다 |
| 행동 (action) | 실제로 따라 하게 만드는 구체적 액션 | 저장, 문의, 구매, 신청, 시도 유도 |
| 보상 (reward) | 행동 후 얻을 결과, 변화, 만족, 미래 상태 | "이걸 하면 내가 이렇게 좋아지는구나"를 상상하게 한다 |

중요: **소비자 욕구 5단계는 콘텐츠를 고정 배정하기 위한 표가 아니다. 각 콘텐츠와 각 logic_block은 여러 단계를 동시에 다룰 수 있다.**

---

## 8. Content Set Validation Matrix

키 콘텐츠와 풀링 콘텐츠 세트가 완성되면 반드시 아래 검증표를 만든다.

```json
{
  "content_set_validation": {
    "contents": [
      {
        "content_id": "pulling_01",
        "content_type": "pulling",
        "title": "",
        "covered_stages": ["phenomenon", "desire"],
        "primary_stage": "phenomenon",
        "bridge_to_key": ""
      }
    ],
    "stage_coverage": {
      "phenomenon": ["pulling_01"],
      "desire": ["pulling_01"],
      "plan": ["key_01"],
      "action": ["key_01"],
      "reward": ["key_01"]
    },
    "sequence_logic": {
      "is_sequential": true,
      "explanation": ""
    },
    "missing_stages": [],
    "overlap_risk": [],
    "revision_needed": false
  }
}
```

통과 조건:
- 현상/욕구/계획/행동/보상 5단계가 세트 전체에서 모두 커버된다.
- 콘텐츠 순서가 소비자 인식 흐름상 자연스럽다.
- 풀링 콘텐츠가 키 콘텐츠로 넘어갈 이유를 만든다.
- 키 콘텐츠 또는 연결 콘텐츠가 행동/보상까지 이어진다.
- 풀링 5개가 같은 말을 반복하지 않는다.
- 각 콘텐츠의 CTA와 다음 행동이 명확하다.

---

## 9. Quality Gates

### Gate 1. Research Completeness

통과 조건:
- Market Research Pack 존재
- VOC Pack 존재
- Claim Evidence Report 존재
- Audience Fit Report score 80 이상
- VOC real language 최소 5개 이상
- safe_claims 최소 3개 이상 또는 "근거 부족" 표시

### Gate 2. Content Set Coverage

통과 조건:
- Key Content 1개 존재
- Pulling Content 5개 존재
- 각 콘텐츠에 covered_stages 존재
- Content Set Validation Matrix 생성
- 현상/욕구/계획/행동/보상 5단계 전체 커버
- bridge_to_key_content가 모든 pulling에 존재

### Gate 3. Strategy Brief Review

통과 조건:
- content_type 명확
- covered_stages 명확
- logic_blocks 3개 이상
- 각 block에 main_claim, supporting_materials 존재
- intro_direction, thumbnail_direction, cta 존재
- risk_notes 존재

### Gate 4. Script Draft Review

통과 조건:
- Intro 30s가 viewer promise를 포함
- 각 logic_block 원고가 기획서와 일치
- 통합 원고가 반복 없이 자연스러움
- 타깃 언어 반영
- 위험 주장 제거

### Gate 5. Script QA Pass

통과 조건:
- Second Brain 기반 말투 반영
- AI스러운 문장 최소화
- 논리 변경 없음
- 사용자가 실제로 말할 수 있는 구어체

---

## 10. AI Slide Factory와의 계약

Pulk가 AI Slide Factory에 넘기는 표준 산출물은 `VideoExecutionBrief`다.  
자세한 필드별 계약은 `docs/cmo/CMO_TO_FACTORY_CONTRACT.md`를 참조.

### 핵심 원칙

- Pulk는 `bestMedium`을 확정하지 않는다.
- Pulk는 `sceneType`을 확정하지 않는다.
- Pulk는 `duration`을 확정하지 않는다.
- Pulk는 `communication_goal`, `viewer_reaction_target`, `visual_intent_hint`, `asset_requests`를 넘긴다.
- AI Slide Factory가 최종 `Timeline JSON`을 생성한다.

### VideoExecutionBrief 스키마

```json
{
  "schema_version": "cmo_to_factory_v2",
  "content_card_id": "",
  "content_type": "key | pulling",
  "title": "",
  "target_viewer": {
    "who": "",
    "knowledge_level": "",
    "pain": "",
    "desired_reaction": ""
  },
  "strategy": {
    "core_message": "",
    "covered_stages": [],
    "role_in_content_set": "",
    "bridge_to_key_content": ""
  },
  "script": {
    "full_script": "",
    "intro_30s": "",
    "logic_blocks": [
      {
        "block_id": "",
        "role": "",
        "speaker_text": "",
        "communication_goal": "",
        "viewer_reaction_target": "",
        "required_evidence": [],
        "visual_intent_hint": ""
      }
    ]
  },
  "source_materials": {
    "market_research_pack_id": "",
    "voc_pack_id": "",
    "claim_evidence_report_id": "",
    "script_material_pack_id": "",
    "used_insights": {
      "thumbnail": [],
      "script": [],
      "founder_voice": []
    }
  },
  "asset_requests": [
    {
      "need": "",
      "preferred_asset_type": "face_video | screen_work | reference_image | source_screenshot | reference_video",
      "reason": ""
    }
  ],
  "constraints": {
    "tone": "",
    "avoid": [],
    "format": "youtube_16_9 | shorts_9_16"
  }
}
```

---

## 11. CMO가 금지하는 필드

다음 필드들은 brief에 포함되면 안 된다. Factory PRD 테스트2·6 위반.

**절대 금지:**
- `scene_type` (any value)
- `best_medium` / `bestMedium`
- `duration` (확정값)
- `timeline` / `timeline_json`
- `scenes` (배열)
- `message_unit_id`

**근거:**
- scene_type / best_medium: Factory가 Scene Decision Engine에서 최종 결정
- duration: communication_goal 기반으로 Factory가 결정
- timeline JSON / scenes: Factory의 책임 영역
- message_unit_id: Factory 내부 생성값

---

## 12. 18개 Agent 워크플로우

| 순서 | Agent | 역할 | 산출물 |
|---:|---|---|---|
| 1 | CMO Intake Agent | 초기 폼 정리, 부족 정보 질문 | intake_summary.json |
| 2 | Market Research Agent | 시장/주제/경쟁 콘텐츠 조사 | market_research_pack.json |
| 3 | VOC Research Agent | 타깃 실제 언어 수집 | voice_of_customer_pack.json |
| 4 | Claim Verification Agent | 주장/근거 검증 | claim_evidence_report.json |
| 5 | Audience Fit Validator | 타깃이 듣고 싶은 말인지 검증 | audience_fit_report.json |
| 6 | Script Material Pack Builder | 원고 재료표 구성 | script_material_pack.json |
| 7 | CMO Strategy Agent | 영상 전략기획서 작성 | cmo_video_strategy_brief.json |
| 8 | Thumbnail Strategy Agent | 썸끝 인사이트 기반 썸네일 후보 생성 | thumbnail_plan.json |
| 9 | Intro Writer | 도입부 30초 작성 | intro_30s.json |
| 10 | Logic Block Writer A | 기획서 블록 원고 작성 | script_part_a.json |
| 11 | Logic Block Writer B | 기획서 블록 원고 작성 | script_part_b.json |
| 12 | Logic Block Writer C | 기획서 블록 원고 작성 | script_part_c.json |
| 13 | Script Integrator | 전체 원고 통합 | integrated_script.json |
| 14 | Founder Voice Agent | 사용자 말투 변환 | voice_matched_script.json |
| 15 | CMO Script QA Agent | 전략/타깃/말투/근거 검수 | script_qa_report.json |
| 16 | Content Set Validator | 세트 5단계 커버리지 검증 | content_set_validation.json |
| 17 | VideoExecutionBrief Builder | AI Slide Factory 전달 계약 생성 | video_execution_brief.json |
| 18 | Factory Handoff Agent | AI Slide Factory로 파일/transport 전달 | handoff_result.json |

---

## 13. 기존 video-room 모듈과의 통합

본 PRD v3.1의 CMO / Script Room 시스템은 기존 `packages/l5-core/src/functions/video-room/` 모듈에 통합된다.

### 기존 자산 재사용

- `ConsumerStage` enum (기존 '현상'|'욕구'|'계획'|'행동'|'보상')
- `BusinessPTContextSnapshot` (기존 Second Brain 컨텍스트)
- `ViewtrapResearchSession`, `ReferenceCandidate` (기존 조사 타입)
- `VideoRoomStatus`, `VideoRoomGateType` (기존 상태 머신)
- Approval Gate 로직 (기존 `approval-gates.ts`)

### 신규 추가

- Research Room 5종 pack 빌더
- Strategy Brief 생성
- Content Set Validation Matrix
- Script Room 원고 작성 파트
- VideoExecutionBrief 빌더 (기존 script-factory.ts 대체)
- Brief Validators (scene_type 부재 검증)
- Revision Router (QA 실패 시 담당 agent 라우팅)

### 폐기

다음은 신규 플로우에서 호출하지 않는 레거시로 유지하되, 기존 코드는 수정하지 않는다:
- `script-factory.ts` (전체 폐기 대신 VideoExecutionBrief로 re-export)
- `production.ts` (음성 녹음, 슬라이드 덱은 MVP 범위 밖)
- `review-publish.ts` (영상 QA, 업로드는 MVP 범위 밖)

관련 타입 (ScriptBeat, FactorySceneType, RenderJob 등) 비사용 주석 표기.

---

## 14. 완료 기준

CMO / Script Room은 다음 조건을 만족할 때 완료로 본다.

1. 주제 하나로 Research → Strategy → Script → QA → VideoExecutionBrief까지 생성된다.
2. 키 콘텐츠 1개와 풀링 콘텐츠 5개가 세트로 생성된다.
3. 콘텐츠 세트가 소비자 욕구 5단계(현상→욕구→계획→행동→보상)를 모두 커버한다.
4. 각 콘텐츠는 고정 단계 배정이 아니라 자유로운 covered_stages를 가진다.
5. 원고 작성은 CMO logic_blocks 기준으로 진행되며, 단계별 고정 분담이 아니다.
6. Founder Voice 변환이 Second Brain 자료 기반으로 수행되고 논리를 보존한다.
7. 썸끝원끝 인사이트가 썸네일 작성 전 조회·기록되고, 원끝 인사이트가 원고 작성 전 조회·기록된다.
8. VideoExecutionBrief에는 scene_type, best_medium, duration, timeline 확정값이 없다.
9. brief가 Factory `cmo_to_factory_v2` schema validation을 통과한다.
10. AI Slide Factory가 해당 brief를 받아 Timeline Draft를 만들 수 있다.

---

## 15. 참고 문서

- `docs/cmo/CMO_TO_FACTORY_CONTRACT.md` — VideoExecutionBrief 필드별 계약 + 금지 필드
- `docs/cmo/CMO_SCRIPT_ROOM_EXECUTION_PLAN.md` — Phase별 구현 계획
- Factory PRD `ai_slide_video_factory_v2_1_full.md` — Scene Decision Engine, Timeline 생성

---

**최종 정본 확정:** 2026-06-06  
**기준 저장소:** `/Users/wonminyang/Desktop/pulk` (main branch)
