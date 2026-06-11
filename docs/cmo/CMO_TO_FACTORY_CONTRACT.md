# VideoExecutionBrief 계약 명세 (CMO → AI Slide Factory)

**최종 수정일:** 2026-06-06  
**계약 버전:** `cmo_to_factory_v2`  
**기준:** Factory PRD v2.1 §5 + CMO PRD v3.1 §12  
**대상 시스템:** Pulk CMO / Script Room → AI Slide Video Factory

---

## 0. 개요

VideoExecutionBrief는 CMO가 AI Slide Factory에 넘기는 **표준 계약 문서**다.  
이 문서는 CMO가 결정한 무엇(strategy), 왜(evidence), 누구(audience)를 Factory가 받아 어떻게(scene, timeline)를 결정할 때 필요한 모든 정보를 담는다.

### 책임 분리

| 계약서 섹션 | CMO 책임 | Factory 책임 |
|---|---|---|
| schema_version | 고정값 지정 | 버전 검증 |
| content_card_id, title, target_viewer | 명확히 작성 | 슬라이드 콘텐츠에 반영 |
| strategy (core_message, covered_stages) | 명확히 정의 | QA 검증 기준 |
| script (full_script, logic_blocks) | 완성본 제공 | 오디오/자막 기준 |
| communication_goal, viewer_reaction_target | 명확히 기술 | Scene 선택 근거 |
| visual_intent_hint | 힌트만 제공 | 참고만 함, 강제 아님 |
| asset_requests | 요청(need) 기록 | 자산 매칭, 부족 시 fallback |
| constraints (tone, format) | 명확히 지정 | 모든 슬라이드/렌더에 적용 |
| scene_type, best_medium, duration | **제공하지 않음** | **Scene Decision에서 최종 결정** |

---

## 1. 필드별 계약 명세

### 1.1 schema_version

**Path:** `schema_version`  
**Type:** `"cmo_to_factory_v2"` (string literal)  
**Required:** true  
**의미:** 계약 버전 식별자. Factory가 파싱 전 버전을 검증하는 데 사용.  
**CMO 책임:** 항상 이 고정값을 그대로 써야 함. 변경 금지.  
**Factory 책임:** 버전 미스매치 시 parsing 실패.

---

### 1.2 content_card_id

**Path:** `content_card_id`  
**Type:** `string` (UUID or unique identifier)  
**Required:** true  
**의미:** Pulk Content Card Board의 카드 ID. Factory가 어느 카드의 브리프인지 역참조하기 위한 식별자.  
**CMO 책임:** Content Card Board에서 이 brief를 생성한 카드의 고유 ID 기록.  
**Factory 책임:** 렌더 완료 후 output_metadata에 content_card_id 포함.

---

### 1.3 content_type

**Path:** `content_type`  
**Type:** `"key" | "pulling"` (enum)  
**Required:** true  
**의미:** 이 콘텐츠가 키 콘텐츠인지 풀링 콘텐츠인지 구분.  
**사용처:** Factory의 QA 전략 일치도 검증.  
**예시:**
```json
"content_type": "key"
```

---

### 1.4 title

**Path:** `title`  
**Type:** `string`  
**Required:** true  
**의미:** 영상 제목.  
**사용처:** Factory output package 파일명, youtube_metadata 생성.  
**예시:**
```json
"title": "카페 매출 구조의 비밀"
```

---

## 2. Target Viewer 섹션

### 2.1 target_viewer.who

**Path:** `target_viewer.who`  
**Type:** `string`  
**Required:** true  
**의미:** 타깃 시청자 정의. 구체적인 페르소나.  
**사용처:** Scene Decision Engine이 신뢰 구간, 설명 깊이를 조정할 때 참고.  
**예시:**
```json
"who": "카페 운영 3년 이상, 월매출 5백만 원 이상의 개인사업자"
```

---

### 2.2 target_viewer.knowledge_level

**Path:** `target_viewer.knowledge_level`  
**Type:** `string` (e.g., "beginner", "intermediate", "advanced")  
**Required:** true  
**의미:** 타깃 시청자의 주제 이해 수준.  
**사용처:** 슬라이드 텍스트 밀도, 설명 방식 결정.  
**예시:**
```json
"knowledge_level": "beginner"
```

---

### 2.3 target_viewer.pain

**Path:** `target_viewer.pain`  
**Type:** `string`  
**Required:** true  
**의미:** 타깃이 겪는 핵심 불편/문제.  
**사용처:** Scene Decision Engine이 problem/reframe scene 배치 판단 시 사용.  
**예시:**
```json
"pain": "광고비는 매달 100만 원 이상 쓰는데 단골이 안 늘어남"
```

---

### 2.4 target_viewer.desired_reaction

**Path:** `target_viewer.desired_reaction`  
**Type:** `string`  
**Required:** true  
**의미:** 영상을 본 후 시청자가 보여야 할 반응.  
**사용처:** Factory QA의 viewer_reaction_target 일치도 일괄 검사 기준.  
**예시:**
```json
"desired_reaction": "내 가게도 구조적으로 정리해야겠다는 느낌"
```

---

## 3. Strategy 섹션

### 3.1 strategy.core_message

**Path:** `strategy.core_message`  
**Type:** `string`  
**Required:** true  
**의미:** 이 영상이 전달해야 할 단 하나의 핵심 메시지.  
**사용처:** Factory QA (테스트7)가 이 값과 생성된 Timeline의 방향이 일치하는지 검증.  
**검증:** core_message 없으면 validate-brief 실패 (테스트1).  
**예시:**
```json
"core_message": "카페의 매출은 상품이 아니라 고객 구조로 결정된다"
```

---

### 3.2 strategy.covered_stages

**Path:** `strategy.covered_stages`  
**Type:** `array of string (enum)`  
**Enum values:** `"phenomenon" | "desire" | "plan" | "action" | "reward"`  
**Required:** true  
**의미:** 이 콘텐츠가 소비자 욕구 5단계 중 어떤 단계를 다루는지.  
**사용처:** Factory가 장면 배분 흐름을 이해하는 데 참고.  
**예시:**
```json
"covered_stages": ["phenomenon", "desire", "plan"]
```

---

### 3.3 strategy.role_in_content_set

**Path:** `strategy.role_in_content_set`  
**Type:** `string`  
**Required:** true  
**의미:** 이 콘텐츠가 세트 내에서 맡는 역할 설명.  
**사용처:** Factory QA의 전략 일치도 판단에 활용.  
**예시:**
```json
"role_in_content_set": "풀링 2번: 잘못된 광고 방식에서 벗어나는 방법 제시"
```

---

### 3.4 strategy.bridge_to_key_content

**Path:** `strategy.bridge_to_key_content`  
**Type:** `string`  
**Required:** false (pulling 타입일 때만 의미 있음)  
**의미:** 이 풀링 콘텐츠가 키 콘텐츠로 어떻게 연결되는지 설명.  
**사용처:** Factory CTA 장면 선택 시 참고.  
**예시:**
```json
"bridge_to_key_content": "광고 방법의 한계를 느낀 후, 구조 자체를 바꾸는 방법으로 연결"
```

---

## 4. Script 섹션

### 4.1 script.full_script

**Path:** `script.full_script`  
**Type:** `string`  
**Required:** true  
**의미:** Founder Voice 변환까지 완료된 완성 원고 전문.  
**사용처:** 
- Factory가 오디오 전사(transcript) 결과와 대조
- 장면별 speaker_text 배분의 기준

**예시:**
```json
"full_script": "... (완전한 원고 전문) ..."
```

---

### 4.2 script.intro_30s

**Path:** `script.intro_30s`  
**Type:** `string`  
**Required:** true  
**의미:** 도입부 30초 원고.  
**사용처:** 
- Factory가 hero/problem scene 초반 배치 판단
- face_video 도입 결정

**예시:**
```json
"intro_30s": "카페 사장님들은 일반적으로 뭘 놓칠까요? ..."
```

---

### 4.3 script.logic_blocks

**Path:** `script.logic_blocks`  
**Type:** `array of object` (min length: 1)  
**Required:** true  
**의미:** CMO 기획서의 논리 단위 배열. 각 블록이 하나의 MessageUnit 후보군이 된다.  
**사용처:** Factory의 MessageUnit 분해와 Scene Decision의 핵심 입력값.

#### 4.3.1 logic_blocks[].block_id

**Path:** `script.logic_blocks[].block_id`  
**Type:** `string`  
**Required:** true  
**의미:** 블록 고유 식별자.  
**사용처:** Factory가 message_unit과 logic_block을 역참조할 때 사용.  
**형식:** `"block_1"`, `"block_2"` 등.

#### 4.3.2 logic_blocks[].role

**Path:** `script.logic_blocks[].role`  
**Type:** `string`  
**Required:** true  
**의미:** 이 블록의 서사적 역할.  
**사용처:** Scene Decision Engine이 rhythm_role 선택 시 참고.  
**예시:** `"문제 제기"`, `"비교 구조"`, `"핵심 주장"`, `"증거 제시"`

#### 4.3.3 logic_blocks[].speaker_text

**Path:** `script.logic_blocks[].speaker_text`  
**Type:** `string`  
**Required:** true  
**의미:** 이 블록에 해당하는 실제 나레이션 원고.  
**사용처:** Factory가 장면의 speaker_text를 구성하는 원천 데이터.

#### 4.3.4 logic_blocks[].communication_goal

**Path:** `script.logic_blocks[].communication_goal`  
**Type:** `string`  
**Required:** true  
**의미:** 이 블록이 달성해야 할 커뮤니케이션 목표.  
**사용처:** Scene Decision Engine이 best_medium과 scene_type을 고를 때 **최우선 참고 기준** (Factory PRD 테스트6).  
**예시:** `"비교 구조를 통해 잘못된 통념을 깬다"`

#### 4.3.5 logic_blocks[].viewer_reaction_target

**Path:** `script.logic_blocks[].viewer_reaction_target`  
**Type:** `string`  
**Required:** true  
**의미:** 이 블록을 본 시청자가 보여야 할 반응.  
**사용처:** Factory QA가 장면 선택과 대조하는 검증 기준. 무시하면 QA 실패.  
**예시:** `"내가 잘못 알고 있었구나"`

#### 4.3.6 logic_blocks[].required_evidence

**Path:** `script.logic_blocks[].required_evidence`  
**Type:** `array of string`  
**Required:** false  
**의미:** 이 블록에서 주장을 뒷받침해야 할 근거 목록.  
**사용처:** Factory가 source_screenshot 또는 reference_image scene 배치 여부를 판단하는 힌트.  
**예시:**
```json
"required_evidence": [
  "시장조사 수치",
  "공식 리포트",
  "고객 사례"
]
```

#### 4.3.7 logic_blocks[].visual_intent_hint

**Path:** `script.logic_blocks[].visual_intent_hint`  
**Type:** `string`  
**Required:** false  
**의미:** CMO가 제안하는 시각적 표현 방향 힌트.  
**강제성:** **강제값이 아니다. 참고 재료일 뿐이다.**  
**사용처:** Factory Scene Decision의 참고 재료. Factory는 이를 무시하고 다른 표현을 선택할 수 있다 (PRD §7, §18.10 규칙 4).  
**예시:** `"비교표가 효과적할 것 같음"`

---

## 5. Source Materials 섹션

### 5.1 source_materials.market_research_pack_id

**Path:** `source_materials.market_research_pack_id`  
**Type:** `string` (UUID or ID)  
**Required:** false  
**의미:** Market Research Pack 아티팩트 ID.  
**사용처:** Factory가 used_sources.json 구성 시 역추적 레퍼런스로 사용.

---

### 5.2 source_materials.voc_pack_id

**Path:** `source_materials.voc_pack_id`  
**Type:** `string` (UUID or ID)  
**Required:** false  
**의미:** VOC Research Pack 아티팩트 ID.  
**사용처:** Factory QA의 타깃 언어 반영도 검증 시 레퍼런스.

---

### 5.3 source_materials.claim_evidence_report_id

**Path:** `source_materials.claim_evidence_report_id`  
**Type:** `string` (UUID or ID)  
**Required:** false  
**의미:** Claim Evidence Report 아티팩트 ID.  
**사용처:** Factory가 source_screenshot scene의 출처 안전성 판단 시 참고.

---

### 5.4 source_materials.script_material_pack_id

**Path:** `source_materials.script_material_pack_id`  
**Type:** `string` (UUID or ID)  
**Required:** false  
**의미:** Script Material Pack 아티팩트 ID.  
**사용처:** Factory가 원고 재료 추적에 사용.

---

### 5.5 source_materials.used_insights

**Path:** `source_materials.used_insights`  
**Type:** `object`  
**의미:** 각 단계에서 사용한 Second Brain / Viewtrap 인사이트 ID 목록.

#### 5.5.1 used_insights.thumbnail

**Path:** `source_materials.used_insights.thumbnail`  
**Type:** `array of string` (UUID list)  
**Required:** false  
**의미:** 썸네일 기획 시 참고한 인사이트 ID 목록.  
**사용처:** Factory의 thumbnail.png 생성 시 참고 기록.

#### 5.5.2 used_insights.script

**Path:** `source_materials.used_insights.script`  
**Type:** `array of string` (UUID list)  
**Required:** false  
**의미:** 원끝(script insights) 에서 원고 작성에 사용한 인사이트 ID 목록.  
**사용처:** used_sources.json 추적에 활용.

#### 5.5.3 used_insights.founder_voice

**Path:** `source_materials.used_insights.founder_voice`  
**Type:** `array of string` (UUID list)  
**Required:** false  
**의미:** Second Brain에서 Founder Voice 변환 시 참고한 문서/원고 ID 목록.  
**사용처:** 말투 일관성 감사 추적.

---

## 6. Asset Requests 섹션

### 6.1 asset_requests (배열)

**Path:** `asset_requests`  
**Type:** `array of object`  
**Required:** false  
**의미:** Factory에 요청하는 시각 자산 목록.  
**중요:** **요청(need)이지 확정 배치가 아니다.** 실제 자산이 없으면 Factory는 slide fallback을 사용한다 (Factory PRD 테스트3, §18.10 규칙5).

#### 6.1.1 asset_requests[].need

**Path:** `asset_requests[].need`  
**Type:** `string`  
**Required:** true  
**의미:** 어떤 장면에서 어떤 자산이 필요한지 설명.  
**사용처:** Factory AssetManifest 탐색의 매칭 키.  
**예시:** `"비교 구조 설명 직후 실제 작업 화면 필요"`

#### 6.1.2 asset_requests[].preferred_asset_type

**Path:** `asset_requests[].preferred_asset_type`  
**Type:** `enum: "face_video" | "screen_work" | "reference_image" | "source_screenshot" | "reference_video"`  
**Required:** true  
**의미:** 선호하는 자산 유형.  
**사용처:** Factory가 AssetManifest에서 매칭 후보를 좁히는 필터.  
**중요:** 선호일 뿐 Factory가 다른 유형으로 fallback할 수 있다.

#### 6.1.3 asset_requests[].reason

**Path:** `asset_requests[].reason`  
**Type:** `string`  
**Required:** true  
**의미:** 이 자산이 왜 필요한지 이유.  
**사용처:** Factory Scene Decision Engine의 confidence 판단 보조.  
**예시:** `"실제 과정을 보여줘야 설득력이 있음"`

---

## 7. Constraints 섹션

### 7.1 constraints.tone

**Path:** `constraints.tone`  
**Type:** `string`  
**Required:** true  
**의미:** 영상 전체의 톤 지침.  
**사용처:** 
- Factory Timeline style.tone 설정
- 슬라이드 mood 설정

**예시:** `"차분하지만 확신 있는 설명"`

---

### 7.2 constraints.avoid

**Path:** `constraints.avoid`  
**Type:** `array of string`  
**Required:** false  
**의미:** 피해야 할 표현, 스타일, 자료 유형 목록.  
**사용처:** Factory QA의 통합 검증에서 위반 여부 감지.  
**예시:**
```json
"avoid": [
  "자극적인 제목",
  "매크로 관점의 경제용어",
  "주식 투자 언급"
]
```

---

### 7.3 constraints.format

**Path:** `constraints.format`  
**Type:** `enum: "youtube_16_9" | "shorts_9_16"`  
**Required:** true  
**의미:** 출력 영상 포맷.  
**사용처:** 
- Factory VideoJob의 format, width, height 결정
- Remotion 렌더 설정

**예시:**
```json
"format": "youtube_16_9"
```

---

## 8. CMO가 제공하면 안 되는 필드 (절대 금지)

다음 필드들이 brief에 포함되면 Factory 검증 실패다.

### 8.1 scene_type (금지)

**위반 근거:** Factory PRD 테스트2  
> "Pulk가 sceneType을 확정해서 넘기면 warning 또는 fail"

**정의:** 개별 로직블록이나 brief 레벨에서 `scene_type: "face_video"` 같은 값.  
**CMO 책임:** 제공하지 않음. `visual_intent_hint`로만 의도 전달.

### 8.2 best_medium / bestMedium (금지)

**위반 근거:** Factory PRD 테스트2  
**정의:** `best_medium: "screen_work"` 같은 값.  
**CMO 책임:** 제공하지 않음.

### 8.3 duration (확정값 금지)

**위반 근거:** Factory PRD 테스트6  
> "communication_goal 기반으로 Factory가 장면과 길이를 결정한다"

**정의:** logic_block 레벨의 `duration: 15` 같은 확정값.  
**허용:** Factory 내부 생성값인 MessageUnit의 estimated_duration은 별개.  
**CMO 책임:** duration 제공 금지.

### 8.4 timeline / timeline_json (금지)

**위반 근거:** Factory PRD §12.1  
> "AI Slide Factory가 최종 Timeline JSON을 생성한다"

**정의:** scenes 배열, Timeline JSON 구조.  
**CMO 책임:** 제공하지 않음. 이는 Factory의 책임 영역.

### 8.5 scenes 배열 (금지)

**정의:** 사전 정의된 장면 목록 배열.  
**CMO 책임:** 제공하지 않음.

### 8.6 message_unit_id (금지)

**위반 근거:** MessageUnit은 Factory의 내부 생성 객체 (Factory PRD §6.1).  
**CMO 책임:** 제공하지 않음. Factory가 logic_blocks를 분해해 생성.

---

## 9. 검증 규칙

### 규칙 1: schema_version 검증

```
if brief.schema_version !== "cmo_to_factory_v2"
  → FAIL: "schema_version must be 'cmo_to_factory_v2'"
```

### 규칙 2: 필수 필드 검증

```
required_fields = [
  "schema_version",
  "content_card_id",
  "content_type",
  "title",
  "target_viewer.who",
  "target_viewer.knowledge_level",
  "target_viewer.pain",
  "target_viewer.desired_reaction",
  "strategy.core_message",
  "strategy.covered_stages",
  "strategy.role_in_content_set",
  "script.full_script",
  "script.intro_30s",
  "script.logic_blocks",
  "constraints.tone",
  "constraints.format"
]

foreach field in required_fields:
  if !brief[field] || brief[field] == ""
    → FAIL: "missing required field: {field}"
```

### 규칙 3: logic_blocks 검증

```
if !Array.isArray(brief.script.logic_blocks)
  → FAIL: "script.logic_blocks must be array"

if brief.script.logic_blocks.length < 1
  → FAIL: "script.logic_blocks must have at least 1 block"

foreach block in brief.script.logic_blocks:
  if !block.block_id
    → FAIL: "logic_block missing block_id"
  if !block.communication_goal
    → FAIL: "logic_block {block_id} missing communication_goal"
  if !block.viewer_reaction_target
    → FAIL: "logic_block {block_id} missing viewer_reaction_target"
```

### 규칙 4: 금지 필드 검증 (절대 금지)

```
forbidden_fields = [
  "scene_type",
  "best_medium",
  "bestMedium",
  "duration",
  "timeline",
  "timeline_json",
  "scenes",
  "message_unit_id"
]

foreach field in forbidden_fields:
  if brief has field with value !== null && value !== undefined
    → FAIL: "forbidden field present: {field}"
```

검사 대상:
- brief 최상위 레벨
- script.logic_blocks[] 각 요소

### 규칙 5: covered_stages 검증

```
if !Array.isArray(brief.strategy.covered_stages)
  → FAIL: "strategy.covered_stages must be array"

valid_stages = ["phenomenon", "desire", "plan", "action", "reward"]
foreach stage in brief.strategy.covered_stages:
  if stage not in valid_stages
    → FAIL: "invalid stage: {stage}"
```

### 규칙 6: content_type 검증

```
if brief.content_type not in ["key", "pulling"]
  → FAIL: "content_type must be 'key' or 'pulling'"
```

### 규칙 7: format 검증

```
if brief.constraints.format not in ["youtube_16_9", "shorts_9_16"]
  → FAIL: "format must be 'youtube_16_9' or 'shorts_9_16'"
```

---

## 10. 에셋 파일 제공 방식

### 중요: CMO는 에셋 **파일**을 제공하지 않는다

**CMO brief에 포함:**
- `asset_requests` 배열 (요청만, 파일 경로 X)
- 각 요청의 need, preferred_asset_type, reason

**실제 에셋 파일 제공 방식:**
- 사용자가 자신의 Face Video, Screen Capture, Reference Image를 **직접** Factory에 업로드
- Factory는 AssetManifest에서 요청과 매칭된 파일을 찾음
- 매칭 실패 시 fallback (Factory PRD 테스트3): slide 자동 생성으로 대체

**CMO의 역할:**
1. asset_requests[]에 명확한 need 작성 (Factory 매칭 기준)
2. required_evidence[] 작성 (source_screenshot 필요 여부 힌트)
3. visual_intent_hint 작성 (화면 분위기 힌트)

---

## 11. 사용 예시

### 11.1 최소 유효 Brief 예시

```json
{
  "schema_version": "cmo_to_factory_v2",
  "content_card_id": "pulling_001",
  "content_type": "pulling",
  "title": "카페 매출을 좌우하는 것은?",
  "target_viewer": {
    "who": "개인 카페 운영자, 월매출 500만 원 이상",
    "knowledge_level": "beginner",
    "pain": "광고비는 많이 쓰는데 손님이 안 늘어남",
    "desired_reaction": "광고 방법을 바꿔야겠다는 깨달음"
  },
  "strategy": {
    "core_message": "카페 매출은 광고가 아니라 고객 구조로 결정된다",
    "covered_stages": ["phenomenon", "desire"],
    "role_in_content_set": "풀링 1번: 문제 자각",
    "bridge_to_key_content": "광고 방법의 한계에서 벗어나 구조 자체를 보는 방법으로"
  },
  "script": {
    "full_script": "... (완전한 원고) ...",
    "intro_30s": "카페 사장님들이 놓치는 게 뭘까요? ...",
    "logic_blocks": [
      {
        "block_id": "block_1",
        "role": "문제 제기",
        "speaker_text": "광고비는 많이 쓰는데...",
        "communication_goal": "현재 상황의 모순을 명확히 한다",
        "viewer_reaction_target": "내 상황이 맞다고 느낀다",
        "visual_intent_hint": "실제 광고 비용과 고객 수 비교표"
      }
    ]
  },
  "source_materials": {
    "market_research_pack_id": "mrp_001",
    "voc_pack_id": "voc_001",
    "used_insights": {
      "thumbnail": ["insight_001"],
      "script": ["insight_002"]
    }
  },
  "asset_requests": [
    {
      "need": "실제 광고 관리 화면",
      "preferred_asset_type": "screen_work",
      "reason": "광고 전략의 현실성을 보여주기 위함"
    }
  ],
  "constraints": {
    "tone": "현실적이고 공감하는 톤",
    "avoid": ["자극적인 문구", "복잡한 통계용어"],
    "format": "youtube_16_9"
  }
}
```

---

## 12. Factory 측 Scene Decision Engine과의 협력

Factory가 이 brief를 받으면:

### 단계 1: 검증
- schema_version, 필수 필드, 금지 필드 검사
- logic_blocks 완성도 검증

### 단계 2: 해석
- communication_goal 분석 → best_medium 후보 결정
- viewer_reaction_target 분석 → 장면 톤 결정
- asset_requests 분석 → AssetManifest 매칭 시도

### 단계 3: Scene Decision
- best_medium 최종 결정 (CMO의 visual_intent_hint는 참고만)
- scene_type 최종 결정
- duration 계산

### 단계 4: Timeline 생성
- 각 logic_block → MessageUnit 분해
- 각 MessageUnit → 1개 이상의 Scene 배치
- Timeline JSON v2 생성

---

## 13. 검증 도구

### CMO 측 Pre-validation (brief 생성 전)

```typescript
function validateVideoExecutionBrief(brief: any): ValidationResult {
  // 규칙 1~7 모두 검사
  // scene_type, best_medium, duration, timeline, scenes 존재 여부 확인
  // logic_blocks 완성도 확인
}
```

### Factory 측 Parsing (brief 수신 후)

```typescript
function parseAndValidateVideoExecutionBrief(
  briefJson: string
): { success: boolean; brief?: VideoExecutionBrief; errors: string[] } {
  // 같은 검증 규칙 적용
  // parse 실패 또는 validation 실패 시 factory-error 발생
}
```

---

## 14. 참고

- Factory PRD: `ai_slide_video_factory_v2_1_full.md`
- CMO PRD: `docs/cmo/CMO_SCRIPT_ROOM_PRD.md`
- Execution Plan: `docs/cmo/CMO_SCRIPT_ROOM_EXECUTION_PLAN.md`

---

**계약 문서 확정:** 2026-06-06  
**적용 대상:** CMO / Script Room v3.1 → AI Slide Video Factory v2.1
