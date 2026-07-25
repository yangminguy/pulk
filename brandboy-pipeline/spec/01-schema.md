# SPEC 01 — 데이터 계약과 검증

> **코드 태스크 T1.** `schema/pipeline.ts`를 그대로 복사해서 시작한다.

## 목적

원고 문단과 화면 파일을 곧바로 연결하지 않는다. 주장·비트·샷·출처를 분리해 **"왜 이 화면이 여기 있는가"를 데이터로 남긴다.**

---

## 1. 타입

`schema/pipeline.ts`에 전체 정의가 있다. 여기서 반복하지 않는다.

**핵심 설계 세 가지**

- `Shot.locked_selection` — 사람이 확정한 화면 선택. `--force` 없이 덮어쓰지 않는다. (rev5: `locked`에서 개명. 시각 재고정과 선택 보존을 분리하려고 `locked_timing`은 두지 않는다)
- `Shot.purpose` — 필수. "관련 영상" 같은 문구를 막기 위해 검수 화면에 그대로 노출된다
- `Beat`/`Shot`의 `anchor: { sentence_key, offset_sec }` — 원고 수정·재녹음에도 검수 판단을 보존하는 불변 앵커. `start`/`end`는 여기서 유도되는 캐시다

---

## 2. 필드 구역 소유권

> **정본은 video-pipeline 개발 문서 `CONTRACTS.md` §1(필드 구역 소유권)이다.** 여기서는 요지만 재게한다.

**필드마다 작성자는 하나고, 모든 작성자는 CLI를 지난다.** 에이전트도 브라우저도 `shot-plan.json`을 직접 쓰지 않는다. 자기 전용 파일에만 쓰고 `<cmd> --apply`가 병합한다.

| 파일 | 담는 것 | 유일 작성자 |
|---|---|---|
| `research/evidence.json` | 주장·근거·원문 URL·발행일·사실/해석 구분 | 조사 에이전트 |
| `script-map.json` | 원고 문장 ↔ 주장, 세그먼트, 막, 진행자 의도, **`sentence_key` 불변 ID** | 사람 |
| `timeline.json` | 정리된 내레이션의 단어·문장 시각 | `align` |
| `beat-plan.json` | 비트와 `need` 샷 (plan 에이전트 전용 산출물) | plan 에이전트 |
| `review-decisions-<ts>.json` | 검수 결정 로그 (append-only 증분) | 검수 브라우저 |
| `sources/catalog.json` | 원본 메타데이터·자막·해상도·라이선스 | `harvest` |
| `assets/selected/manifest.json` | 승인 구간 고화질 다운로드 결과 | `harvest` (3단계) |
| `sources/usage.json` | 실제 사용 샷, 영상 내 시각, 원본 구간, 출처 문구 | **`review --apply`** |

### `shot-plan.json` 구역표

`shot-plan.json`은 파일 단위 "작성자 하나"가 성립하지 않는다 — `plan`·`review`·`reanchor`가 서로 다른 **구역**을 써야 하기 때문이다. 그래서 파일이 아니라 구역으로 나눈다. 각 작성자는 자기 전용 파일에 쓰고 CLI가 `writeScoped(zone)`로 병합하며, 구역 밖 필드가 바뀌면 abort한다.

| 구역 | 필드 | 작성자 |
|---|---|---|
| **Z1 계획** | `segments[]` · `beats[]` 전체 · `shots[]`의 `shot_id` `beat_ids` `purpose` `framing` · 신규 `need` 샷 생성 · `asset_kind` **초기값** · `emphasis_caption` **후보** | `plan --apply` |
| **Z2 선택** | `shots[].{selection_status,source_id,source_in,source_out,file,rights_status,locked_selection}` · `asset_kind` **갱신** · `source_audio*` · **`photo_motion` 확정**(사진 샷, 기본 parallax) · `emphasis_caption` **확정** | `review --apply` |
| **Z3 시각** | `beats[].{start,end,timing_rev}` · `shots[].{start,end,timing_rev,needs_review,orphaned}` | `reanchor` |
| **Z0 메타** | `revision` · `writers:{plan_rev,review_rev,reanchor_rev,seal}` · `profile_rev` · `frame_rev` | 쓰는 명령이 자기 rev +1, `revision` +1 |

> `usage.json`의 작성자는 원본이 모순했다(`:31`=`assemble`, `IMPLEMENTATION.md:112`=수집 에이전트). **`review --apply`로 확정한다**: 사용 구간(`source_in`/`source_out`)은 승인 시점에 정해지고 `assemble`은 읽어서 출처를 생성할 뿐이다.

---

## 3. 검증 규칙

**모든 임계값은 `edit-profile.json`에서 읽는다. 하드코딩 금지.**

### 치명 오류 — 종료 코드 1

| ID | 규칙 | 참조 |
|---|---|---|
| V1 | ID가 중복되지 않는다 | — |
| V2 | 모든 `claim_id`가 실제 주장에 연결된다 | — |
| V3 | `critical` 주장에 근거가 하나 이상 있다 | — |
| V4 | 모든 내레이션 시간이 비트로 덮인다 | `beats.coverage_gap_max_sec` |
| V5 | 비트 시간이 겹치거나 역전되지 않는다 | — |
| V6 | `evidence` 비트를 `caption_card`·`fallback_text`·일반 스톡만으로 승인할 수 없다 | — |
| V7 | `critical` 비트에 승인된 샷이 하나 이상 있다 | — |
| V8 | `blocked` 권리 상태의 자산을 선택할 수 없다 | `qc.blocking_rights_status` |
| V9 | 선택된 외부 자산에 원본 URL과 게시자가 있다 | — |
| V10 | 동영상 샷은 `source_in < source_out` | — |
| V11 | `fallback_text`는 `approved` 상태가 될 수 없다 | — |
| V12 | 세그먼트의 막 순서가 역전되지 않는다 | — |

### 품질 경고 — 종료 코드 0, 리포트에 표시

| ID | 규칙 | 참조 |
|---|---|---|
| W1 | 6초를 넘는 비트 | `beats.max_duration_sec` |
| W2 | 8초를 넘는 정지 이미지 샷 | `shots.still_max_sec` |
| W3 | 10초를 넘는 동일 원본 연속 사용 | `shots.same_source_run_max_sec` |
| W4 | 75초 넘게 `reset` 비트가 없음 | `rhythm.presenter_reset_interval_sec[1]` |
| W5 | 도입 30초 시각 변화가 12회 미만 | `rhythm.intro_30s_visual_changes_min` |
| W6 | 모션그래픽이 10% 초과 | `ratios.motion[1]` |
| W7 | 스톡 샷이 10% 초과 | `ratios.stock_max` |
| W8 | 동일 소스가 외부 샷의 35% 초과 | `ratios.same_source_max` |
| W9 | `unknown`·`quotation_review`가 최종 승인에 남음 | — |
| W10 | 같은 화면 기능이 5회 이상 연속 | `qc.same_function_run_max` |
| W11 | 첫 15초에 hook 기능이 없음 | — |
| W12 | reveal 막에 반전 또는 해석 비트가 없음 | — |
| W13 | 15분 기준 `caption_card`가 범위 밖 | `counts_per_15min.impact_cards` |

**W5는 V4 프로필에서 경고가 아니라 수정 대상이다.** `qc` 리포트에서 P1로 분류한다.

### rev5 추가 규칙 — 재고정·구역·사진 (정본: `CONTRACTS.md` §3)

| ID | 판정 | 내용 | 참조 |
|---|---|---|---|
| **V13** | 실패 | `shot.timing_rev != timeline.align_rev` → 낡은 시각으로 조립되는 경로를 스키마 레벨에서 차단 (`rescaled`/`edited`/`removed`가 여기서 잡힌다) | — |
| **V14** | 실패 | **봉인 해시** — 파일 실제 해시 ≠ `writers.seal` → "CLI 외부 쓰기 발생" + 마지막 CLI 쓰기 이후 diff 출력 | — |
| **V14b** | 실패 | **구역 정합** — `selection_status="approved"`인데 `source_id` 없음 / `locked_selection=true`인데 `source_in` 없음 / `writers.reanchor_rev < writers.plan_rev` | — |
| **V15** | **중요도별** | `needs_review`/`orphaned` 샷의 앵커 비트 `importance` 기준 — `critical`→`assemble` 실패 · `normal`→경고+검수 대상 · `bridge`→리포트 표시만 | `IMPLEMENTATION.md:32-34` |
| **V16** | 경고 | `profile_rev` / `frame_rev` 불일치 → 무효화 표 출력. 어느 그룹이 바뀌었는지에 따라 사람 판단 | `SCOPES.md` §4 |
| **V17a** | 실패 | `validate` — 같은 `asset_kind` 샷끼리 시간 중첩이 `tracks.allowed_overlap_sec` 초과 | — |
| **V18** | 실패 | **사진 촬영모션** — `asset_kind="image"` 샷에 `photo_motion` 없으면 실패 (정지 사진 그대로 삽입 차단, 기본 parallax) | — |
| **V18b** | 경고 | **사진 남용** — `image` 샷이 비강조 비트에 있거나 15분당 개수가 `sources.still_image_max_per_15min` 초과 → 경고. 영상 우선 원칙 | — |

> **V15를 "하나라도 있으면 실패"로 하면 안 된다.** 200~400샷에서 문장 하나 수정으로 그 문장 샷 전부가 `orphaned`가 되면 조립이 전면 중단된다. `critical`만 중단, `normal`은 검수로 올리고, `bridge`는 표시만 한다.
> V17의 짝 — 비트 재분할 시 `plan`은 **보존 샷이 덮는 시간대에 새 `need` 샷을 생성하지 않는다.** 커버리지 미달은 임의로 채우지 않고 `coverage_gap[]`로 보고한다.

---

## 4. CLI

```text
pipeline validate --project <dir> [--human]
```

```json
{
  "ok": false,
  "beats": 214,
  "shots": 362,
  "duration": 879.2,
  "distribution": { "evidence": 88, "literal": 62, "emotion": 31, "explain": 18, "context": 9, "reset": 4, "caption_card": 2 },
  "ratios": { "a_roll": 0.16, "motion": 0.08, "stock": 0.04 },
  "errors":   [{ "rule": "V7", "beat_id": "b042", "message": "critical beat has no approved shot" }],
  "warnings": [{ "rule": "W3", "range": "04:12-04:24", "message": "same source 12.4s" }]
}
```

---

## 5. 엣지 케이스

- **비트 1개짜리 파일** — 통과해야 한다. 테스트용으로 자주 만든다
- **`selection_status: need`가 남은 파일** — 검수 전 상태. V7만 실패하고 나머지는 통과
- **알 수 없는 필드** — 통과시킨다. zod 기본 동작(strip)을 쓰고 `.strict()`를 걸지 않는다. 에이전트가 실험적으로 필드를 추가할 여지를 남긴다
- **`edit-profile.json`이 프로젝트에 없음** — `config/`의 것을 복사하고 경고를 출력한다

---

## 6. 완료 조건

1. `schema/pipeline.ts`가 rev5 추가 필드를 반영한다 — `anchor`(`sentence_key`·`offset_sec`) · `timing_rev` · `locked_selection` · `revision` · `writers`(`plan_rev`·`review_rev`·`reanchor_rev`·`seal`) · `photo_motion`(Z2) · `coverage_gap[]` · `word_timing` · `score_source`
2. 예시 프로젝트가 통과한다
3. 의도적으로 망친 8종이 **각각 지정된 규칙에서만** 실패한다
   V1 중복 · V4 공백 0.5초 · V5 시간 역전 · V6 evidence에 스톡만 · V7 critical 미승인 · V10 in>out · V11 fallback 승인 · V12 막 역전
4. **수치 하드코딩 0건.** `grep -rn "0\.75\|2\.1\|12\b" src/` 로 확인
5. `--human`이 표를 출력하고 기본 실행은 JSON만 출력한다

## 7. 먼저 확인할 것

- `zod` 버전. v4에서 `discriminatedUnion`과 `record` 시그니처가 바뀌었다
