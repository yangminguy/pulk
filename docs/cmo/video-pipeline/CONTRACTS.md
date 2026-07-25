# CONTRACTS — 소유권 · 재고정 · 검증 · 무효화 · 파일럿

> **코드를 쓰기 전에 반드시 읽는다.** 이 문서의 5개 계약이 파이프라인의 안전장치 전부다.
> 이 계약들은 Planner→Architect→Critic 2라운드 합의로 확정됐다. 임의로 바꾸지 않는다.

---

## 1. 필드 구역 소유권

### 원칙

**필드마다 작성자는 하나고, 모든 작성자는 CLI를 지난다.**

파일 단위 "작성자 하나"는 `shot-plan.json`에 대해 성립하지 않는다 — `plan`(비트·need 샷), `review`(선택), `reanchor`(시각) 셋이 **서로 다른 필드**를 써야 하기 때문이다. 그래서 파일이 아니라 **구역**으로 나눈다.

에이전트와 브라우저는 `shot-plan.json`을 직접 쓰지 않는다. 자기 전용 파일에만 쓰고 `--apply`가 병합한다.

```
plan 에이전트  → beat-plan.json           → pipeline plan   --apply → writeScoped(Z1)
검수 브라우저  → review-decisions-*.json  → pipeline review --apply → writeScoped(Z2)
reanchor (CLI)                            → pipeline reanchor       → writeScoped(Z3)
```

> `spec/03-plan.md:3`이 "**에이전트 작업이다. CLI로 구현하지 않는다**"라고 못박으므로, `plan` 자체는 에이전트가 맞다. 하지만 **산출물의 병합은 CLI가 한다.** 그래야 가드가 걸린다.

### `shot-plan.json` 구역표 (`schema/pipeline.ts:104-151` 전수)

| 구역 | 필드 | 작성자 |
|---|---|---|
| **Z1 계획** | `segments[]` · `beats[]` **전체** (`beat_id` `segment_id` `narration` `visual_function` **`importance`** `search_intent` `claim_ids` `must_show` `avoid` `emphasis_caption` `sfx_cue`) · `shots[]`의 `shot_id` `beat_ids` `purpose` `framing` · 신규 `need` 샷 생성 · `asset_kind` **초기값** · `emphasis_caption` **후보 제시** | `plan --apply` |
| **Z2 선택** | `shots[].selection_status` `source_id` `source_in` `source_out` `file` `rights_status` `locked_selection` · `asset_kind` **갱신** · `source_audio` `source_audio_in` `source_audio_out` · **`photo_motion` 확정**(사진 샷) · `emphasis_caption` **확정** | `review --apply` |
| **Z3 시각** | `beats[].{start,end,timing_rev}` · `shots[].{start,end,timing_rev,needs_review,orphaned}` | `reanchor` |
| **Z0 메타** | `revision` · `writers:{plan_rev,review_rev,reanchor_rev}` · `profile_rev` · `frame_rev` | 쓰는 명령이 자기 rev +1, `revision` +1 |

### 주의 — 스키마 실측 사실

- `Shot`에 **`importance`가 없다.** `Beat` 필드다 (`schema/pipeline.ts:111`).
- `Shot.beat_id`가 아니라 **`beat_ids: string[]`** 이다 (`:124`. `:123`은 `shot_id`). 한 샷이 인접 비트 2개를 덮을 수 있다 (`IMPLEMENTATION.md:86`).
- `asset_kind`·`emphasis_caption`은 **생성과 갱신의 구역이 다르다.** 표에 두 칸으로 명시했다 — 암묵적 abort보다 명시적 예외가 낫다.
  - `asset_kind`: Z1이 초기값, Z2가 갱신 (`spec/05-review.md:118`이 검수에서 기록을 요구)
  - `emphasis_caption`: Z1이 후보 제시, Z2가 확정 (`spec/03-plan.md:81-88` + `spec/05:90`)
- `source_audio`·`source_audio_in`·`source_audio_out`은 **Z2**다 (`spec/05:54`).
- **`photo_motion`은 Z2 전용.** 사진 소스가 선택되는 시점(검수)에 정해지므로 Z1은 관여하지 않는다. `review --apply`가 **기본 `type: "parallax"`**로 채우고, 사장님이 스토리보드에서 켄번즈 등으로 다운그레이드하면 그 값으로 확정한다. 사진은 **핵심 강조(`importance: critical`) 비트에만** 배치한다.

### `writeScoped(file, zone, mutator)` 해시 규약

```
1. 쓰기 전: 구역 밖 필드의 정규화 해시를 계산
2. mutator 실행
3. 쓰기 후: 같은 해시를 다시 계산
4. 다르면 → abort + 파일 무변경 + exit 1
```

**정규화 규칙 (반드시 지킨다)**
- 비교 단위는 **`shot_id` / `beat_id` 키 기준**. 배열 위치 무관 — `plan`이 재정렬해도 오탐이 나면 안 된다
- 키 정렬 후 직렬화
- 수치는 **소수 3자리 고정** (`134.2` == `134.200`)
- `undefined`와 필드 부재를 **동일 취급**

### 그 외 파일 소유권

| 파일 | 유일 작성자 | 읽는 쪽 |
|---|---|---|
| `script.md` · `script-map.json` (문장 ID · 세션 정의) | **사람** | align · plan · review |
| `config/edit-profile.json` · `config/frame.md` | **사람** | 전부 |
| `timeline.json` `words.json` `captions.srt` `captions.meta.json` `align-remap.json` `align-report.json` | `align` | plan · reanchor · review · assemble · qc |
| `beat-plan.json` | plan 에이전트 (전용) | `plan --apply` |
| `review-decisions-<ts>.json` | 브라우저 (append-only 증분) | `review --apply` |
| `sources/catalog.json` `sources/transcripts/` `candidates/` | `harvest` | review |
| `sources/a-roll/` + catalog `kind:"a_roll"` | **`ingest`** | review · assemble |
| **`sources/usage.json`** | **`review --apply`** | assemble (출처 자동 생성) · qc |
| `assets/selected/manifest.json` | `harvest` (3단계) | assemble (`shot_id` 조인) |
| `motion/requests/` · `motion/<beat_id>.<fmt>` | `motion bridge` | assemble |
| **`pilot.json`** | **사람** (선택적 룩체크 시 작성. spine 구간만 — 게이트 아님) | harvest · review · assemble (`--pilot`) |
| `research/questions.json` · `research/evidence.json` | 조사 에이전트 (`spec/01:26`) | plan · review(패스 B) |
| `music-cues.json` · `sound-cues.json` | `assemble` | 사람(마감) · qc |
| `qc-report.json` · `fix-list.json` | `qc` | 사람 |
| `eval/search-hit5.json` | 사람(판정) + T0b 프로토타입(후보) | harvest 회귀 검증 |
| `preflight-report.md` | 사람 (T0a) | 전 태스크 |

> `usage.json`의 작성자는 brandboy 원본이 모순한다 — `spec/01-schema.md:31`은 `assemble`, `IMPLEMENTATION.md:112`는 수집 에이전트. **`review --apply`로 확정한다**: 사용 구간(`source_in`/`source_out`)은 승인 시점에 정해지고 assemble은 읽어서 출처를 생성할 뿐이다. T10이 두 문서를 개정한다.

### `review --apply` 병합 규약

- 결정 로그는 **증분 append-only**. 파일명 `review-decisions-<ISO8601>.json`
- 여러 파일을 인자로 받으면 **타임스탬프 순차 적용**. 같은 `shot_id` 중복은 **나중 것 승리**
- 적용 전 `shot-plan.json.revision`을 HTML에 박힌 값과 대조 → 불일치 시 **거부 + diff 출력** (`--force`로만 강행)
- 브라우저는 **결정 10건마다 자동 다운로드 제안**. `spec/05-review.md:176`이 `localStorage`를 금지하므로 손실 창을 10건으로 제한하는 것이 최선이다

---

## 2. 시각 재고정 (re-anchor)

### 왜 필요한가

원고를 고치고 세션을 재녹음하면 마스터가 바뀌어 **그 이후 모든 절대 시각이 이동**한다. 그런데 `Shot.source_in`/`source_out`(원본 내 좌표)은 여전히 유효하고, 이것이 검수자가 몇 시간 들여 만든 판단이다.

단일 `locked` 플래그로는 "시각은 고치고 선택은 지키기"가 불가능하다. 그리고 **D3(세션 분할 녹음)는 이 위험을 키운다** — "세션 2만 재녹음"이 정상 절차이기 때문이다.

### 불변 문장 ID

```
sentence_key : script-map.json 최초 등재 시 부여하는 8자 ID.
               텍스트를 고쳐도 유지한다. 정의상 불변.
sentence_id  : "sn042" — 표시·정렬용 (가변)
```

**내용 해시로 만들면 안 된다.** 조사 하나만 고쳐도 키가 바뀌어 옛 키는 `removed`, 새 키는 `added`가 되고 그 문장의 승인 샷 전부가 고아가 된다. 원고 수정은 정규 워크플로우다 (`spec/05-review.md:88`의 검수 단축키 `X` = "원고 수정 필요").

`script-map.json`은 이미 사람 소유이므로 규약 추가만으로 성립한다.

### 스키마

```ts
Beat / Shot : anchor: { sentence_key: string; offset_sec: number }   // 원본
              timing_rev: number                                      // 이 시각을 만든 align_rev
              start: number; end: number                              // anchor에서 유도되는 캐시
Shot        : locked_selection: boolean
              needs_review?: boolean
              orphaned?: boolean
```

`locked_timing`은 **두지 않는다.** 소비자가 없고 V13과 영구 충돌한다. `anchor`가 있으면 `reanchor`가 항상 재계산하므로 사람이 타임라인 위치를 고정할 이유가 없다.

### `align-remap.json` — status 6종

```json
{ "align_rev": 4, "sentences": [
  { "key":"a1b2c3d4", "status":"unchanged", "old_start":134.2, "new_start":134.2, "old_dur":3.6, "new_dur":3.6 },
  { "key":"b2c3d4e5", "status":"shifted",   "old_start":140.0, "new_start":141.2, "old_dur":2.8, "new_dur":2.8 },
  { "key":"c3d4e5f6", "status":"rescaled",  "old_dur":3.0, "new_dur":4.1 },
  { "key":"d4e5f6a7", "status":"edited",    "old_text":"…", "new_text":"…", "similarity":0.86 },
  { "key":"e5f6a7b8", "status":"added" },
  { "key":"f6a7b8c9", "status":"removed" } ] }
```

### `reanchor` 처리 규칙

| status | 처리 | `timing_rev` | Z2(선택) |
|---|---|---|---|
| `unchanged` · `shifted` | `offset_sec` 유지, `start`/`end` 평행이동 | **갱신** | 보존 |
| `rescaled` | **기계적 재계산 금지.** 문장 내부 단어 시각이 스케일되어 `offset_sec`가 다른 단어를 가리킨다(`spec/03-plan.md:47` 위배). `needs_review: true` | 미갱신 | **보존** |
| `edited` | 키 동일 + 텍스트 변경. `rescaled`와 동일 처리 | 미갱신 | **보존** — 화면 선택은 대부분 여전히 유효하다 |
| `removed` | `orphaned: true`. **샷을 삭제하지 않는다** | 미갱신 | 보존 |
| `added` | 해당 구간에 비트 없음 → `plan_rerun_required[]` 보고 | — | — |

`edited` 판정은 `lib/similarity.ts`가 `removed` 키와 `added` 키 사이 유사도로 수행한다(임계 이상 + 인접 순번). 사람 부여 ID를 쓰면 대부분 키가 같아 자동 판정된다.

---

## 3. 검증 규칙 (brandboy 치명 12종에 추가)

| 규칙 | 판정 | 내용 |
|---|---|---|
| **V13** | 실패 | `shot.timing_rev != timeline.align_rev` → `rescaled`/`edited`/`removed`가 여기서 잡힌다. **낡은 시각으로 조립되는 경로를 스키마 레벨에서 차단** |
| **V14** | 실패 | **봉인 해시** — 파일 실제 해시 ≠ `writers.seal` → "CLI 외부 쓰기 발생" 실패 + 마지막 CLI 쓰기 이후 diff 출력 (아래 상세) |
| **V14b** | 실패 | **구역 정합** — `selection_status="approved"`인데 `source_id` 없음 / `locked_selection=true`인데 `source_in` 없음 / `writers.reanchor_rev < writers.plan_rev` |
| **V15** | **중요도별** | `needs_review`/`orphaned` 샷의 앵커 비트 `importance` 기준 — **`critical` → `assemble` 실패** · `normal` → 경고 + 검수 대상 표시 · `bridge` → 리포트 구간 표시만. 근거: `IMPLEMENTATION.md:32-34` |
| **V16** | 경고 | `profile_rev` / `frame_rev` 불일치 → §4 무효화 표 출력. 치명이 아니다 — 어느 그룹이 바뀌었는지에 따라 사람이 판단 |
| **V17a** | 실패 | **`validate`** — 같은 `asset_kind` 샷끼리 시간 중첩이 `tracks.allowed_overlap_sec`를 초과하면 실패 |
| **V17b** | 실패 | **`assemble/checks.ts`** — 실제 트랙 배정 후 같은 레인 내 중첩 최종 검사 |
| **V18** | 실패 | **사진 촬영모션** — `asset_kind="image"`인 샷에 `photo_motion`이 없으면 실패. 정지 사진이 그대로 들어가는 경로 차단(기본 parallax) |
| **V18b** | 경고 | **사진 남용** — `image` 샷이 비강조 비트에 있거나 15분당 개수가 `sources.still_image_max_per_15min` 초과 → 경고. 영상 우선 원칙 |

### V14 — 봉인 해시 (`writers.seal`)

`writers.plan_rev`가 증가했는지로 우회를 검출하면 **가장 흔한 실패 모드를 못 잡는다.** 에이전트가 `shot-plan.json`을 통째로 덮어쓸 때는 그 필드의 존재를 모르거나 무시하므로 `plan_rev`가 **증가하지 않는다.** 검출은 "rev가 오르지 않았는데 내용이 변했다"를 봐야 성립한다.

```ts
// CLI가 쓸 때마다 갱신 (writeScoped 마지막 단계)
writers.seal = sha256(canonicalJSON(shotPlan without writers.seal))

// V14
if (sha256(canonicalJSON(현재파일 without writers.seal)) !== writers.seal) {
  fail("CLI 외부에서 shot-plan.json이 수정되었습니다")
  // + 마지막 CLI 쓰기 스냅샷과의 diff 출력
}
```

`writeScoped`가 이미 정규화 직렬화를 하므로 추가 비용이 거의 없다. `spec/03-plan.md:3`이 "CLI로 구현하지 않는다"고 못박은 `plan` 에이전트에 대한 **유일한 사후 검출 장치**이므로 조건절이 강해야 한다.

### V17 — "레인"의 정의

트랙 배정은 `assemble/model.ts`가 하고 `shot-plan.json`에는 track 필드가 없다(`schema/pipeline.ts:122-144`). 그래서 **두 단계로 나눈다** — 매핑 로직을 validate에 복제하지 않기 위해서다.

| 단계 | 위치 | 근거 필드 |
|---|---|---|
| **V17a** | `validate` (T1) | `asset_kind` **직접 비교**. 매핑 불필요. 비트 재분할이 만든 중첩을 조기에 잡는다 |
| **V17b** | `assemble/checks.ts` (T5) | `edit-profile.json`의 `tracks.lane_by_asset_kind` 매핑 적용 후 실제 레인 검사 |

### 허용 중첩 — 사양이 요구하는 예외

`spec/07-assemble.md:51`의 **선행 컷**은 새 인물·제품·장소를 내레이션보다 **0.2~0.5초 먼저** 보여준다. J/L 컷도 의도적 중첩이다. 예외 없이 실패 처리하면 **정상 편집 문법을 차단**한다 — V15에서 배운 교훈과 같다.

```json
"tracks": {
  "allowed_overlap_sec": 0.5,
  "lane_by_asset_kind": {
    "video": "V1", "image": "V1", "interview": "V1",
    "a_roll": "V2", "motion": "V3", "overlay": "V3",
    "caption_card": "V5"
  }
}
```

`allowed_overlap_sec` 이내의 중첩은 통과, 초과하면 실패. 매핑 테이블은 `edit-profile.json` **한 곳**에만 둔다.

> **V15를 "하나라도 있으면 실패"로 하면 안 된다.** 200~400샷 규모에서 문장 하나를 수정하면 그 문장의 샷 전부가 `orphaned`가 되고, `bridge` 비트 하나 때문에도 조립이 전면 중단된다. "G3 반려 → 원고 수정 → 재조립" 루프가 매번 막힌다.

### V17의 짝 — Z1 사후조건

비트 재분할 시 `plan`은 **보존 샷이 덮는 시간대에 새 `need` 샷을 생성하지 않는다.**

보존 샷의 커버리지가 새 비트의 `acts.<act>.shot_sec` 산정치(`spec/03-plan.md:57`)에 미달해도 임의로 채우지 않고 **`coverage_gap[]`으로 보고**한다.

이게 없으면: `plan`이 b042를 b042a/b042b로 쪼갤 때 승인 샷 `sh0042`는 보존되지만 각 새 비트마다 샷 수를 다시 산정해 `need` 샷을 새로 만들고, **보존 샷과 새 샷이 같은 시간대를 점유**한다. Z1은 승인 샷을 못 건드리고 Z2는 검수를 돌려야 발동하고 Z3는 시각만 옮기므로 **아무도 못 푼다.**

---

---

> 파일럿 스코프 · 프로필 무효화 · 부분 재처리 단위는 **[SCOPES.md](./SCOPES.md)** 에 있다.
