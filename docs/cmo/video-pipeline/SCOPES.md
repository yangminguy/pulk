# SCOPES — 파일럿 스코프 · 무효화 · 부분 재처리

> 소유권·재고정·검증 계약은 [CONTRACTS.md](./CONTRACTS.md)에 있다. 이 문서는 **무엇을 얼마나 돌리는가**를 다룬다.

## 4. 프로필 · 프레임 무효화

`edit-profile.json`에 `profile_rev`, `config/frame.md`에 `frame_rev`(또는 파일 해시). 사람이 수정할 때 수동 증가.
`timeline.json` · `shot-plan.json` · `motion/*` 산출물 · `assemble` 리포트 · `qc-report.json`이 생성 시점 값을 기록한다.

| 변경 그룹 | 무효화 대상 | 조치 |
|---|---|---|
| `video` (`resolution` `fps`) | 프록시 · 모션 렌더 · CapCut 초안 **전부** | `harvest --force` + T8 재렌더 + `assemble --force` |
| **`align`** (`similarity_threshold` `window_ratio`) | 마스터 · 단어시각 · 타임라인 | `align --force` → `reanchor` → §2 전체 재고정 |
| `audio` | 마스터 | `align --force` → `reanchor` |
| `acts.*.shot_sec` · `beats`(`max_duration_sec` `coverage_gap_max_sec` `expected_count_per_15min`) | 비트 분할 · 샷 수 산정 | `plan` 재실행(Z1). **단 파일럿 구간은 `--force`로 Z1·Z2 동시 재생성** (아래 주석) |
| `beats.min_candidates` | 후보 충족 판정 | `harvest --force` (plan 아님) |
| `harvest` · `score_weights` | 후보 랭킹 | `harvest --force` (Z2 검수 판단은 보존) |
| `captions` · **`frame.md`** | 자막·강조·임팩트 카드 프리셋(`spec/07:106`) · **모션 캐시 키**(`spec/06:109`) | `align` 자막 재생성 + T8 재렌더 + `assemble --force` |
| `motion` · `ratios.motion` | 모션 저작·렌더 | T8 재저작 |
| `photo_motion` · `sources` | 사진 촬영모션 렌더 · 사진 후보 선별·상한 | `assemble --force`(사진 재렌더) · `sources.*` 변경 시 `harvest --force` |
| `shots` · `rhythm` · `ratios` · `counts_per_15min` | 검사 결과 · `plan`의 카드 후보 조절(`spec/03:88`) | `assemble --force` + `qc`. `counts_per_15min.impact_cards`는 `plan` 재실행 |
| `qc` (`blocking_rights_status`) | **V8 치명 기준** | `validate` + `qc` 재실행 — 경고가 아니라 **판정이 뒤집힌다** |

> **시각 파라미터는 초기 1회 세팅**(`frame.md` + brandboy 기본값)이므로 매 영상 재측정이 없다. 파라미터를 바꾸면 위 표대로 해당 산출물만 재생성한다. `frame.md` 변경은 사진 parallax(hyperframes) 캐시도 무효화한다(`frame_rev`).

---

## 5. 2단 수급 스코프 — 프록시 전량 → 승인분 고화질

과거의 60초 파일럿(spine+samples · 10요소 체크리스트)은 **캘리브레이션·G3 게이트 전용 장치였고 제거됐다.** 이제 게이트는 **스토리보드**다. 수급은 대신 **화질 2단**으로 나눈다.

| 단계 | 대상 | 화질 | 시점 |
|---|---|---|---|
| **프록시** | 전 비트 후보 | 720p 부분 다운로드 | 스토리보드 전 (싸다) |
| **고화질** | **승인된 샷만** | 원본 화질 | 스토리보드 승인 후 (`harvest 3단계`) |

- 스토리보드는 전 비트를 프록시로 덮으므로 사장님이 **모든 구간을 실제 재생으로** 판단한다. 파일럿 서브셋이 필요 없다.
- 디스크는 승인분만 쓴다. 비트 부분 재처리는 `--only <beat_id>`로 한다(§6).
- `spec/02-align.md:23`("씬별 WAV를 최종 조립 입력으로 쓰지 않는다")·`spec/07-assemble.md:22`("A1 = 연속 마스터")는 그대로 유지된다.

### `--pilot` — 선택적 첫 구간 룩체크 (게이트 아님)

전체 조립 전 **첫 연속 구간 하나**만 먼저 조립해 눈으로 확인하고 싶을 때 쓰는 스모크 체크다. 승인 게이트가 아니다.

```json
{ "spine": { "from_sentence_key": "a1b2c3d4", "to_sentence_key": "f6a7b8c9", "target_sec": [45, 90] } }
```

- spine은 **연속 구간 1개.** A1 마스터를 자르지 않고 해당 구간을 그대로 쓴다(연속 인상 판정 가능).
- **samples / 10요소 강제 없음.** 시각 파라미터가 `frame.md`로 이미 확정됐으므로 파일럿에서 프리셋을 승인할 필요가 없다.
- **캘리브레이션 재측정 없음.** 파일럿 후 `edit-profile` 실측 교정 단계는 삭제됐다.
- spine 총길이 검사: 해당 구간 마스터와 ±0.2초.

---

## 6. `--only` / `--pilot` / 멱등성 단위

| 명령 | `--only` | `--pilot` | skip 규칙 |
|---|---|---|---|
| `validate` · `ingest` | 미지원 | 미지원 | 읽기 전용 / 등록 |
| `align` | **`session-NN`** (비트 아님 — align은 비트 생성 **전**에 돌고 출력은 단일 마스터) | 미지원 | 세션 WAV의 mtime/해시가 마지막 실행보다 새로우면 **자동 재처리(skip 금지)**. 그 외 skip |
| `reanchor` | `beat_id` | 미지원 | 항상 재계산 |
| `plan --apply` | `beat_id` | 지원 | 항상 병합 |
| `harvest` | `beat_id` | 지원 (**둘 다 주면 교집합**) | `.cache/` TTL. `--eval`이면 TTL 무시 |
| `review` | `beat_id` | 지원 (교집합) | 재생성 항상 |
| `assemble` | **미지원 → exit 2** | 지원 | `--force`로만 재생성 |
| `qc` | 미지원 → exit 2 | 지원 | 항상 재실행 |

> 입력 명세 Constraint 9("`--only` 전 명령 지원")에서 **의도적으로 이탈**한다. 부분 재처리의 의미가 명령마다 다르고, 일괄 지원은 "파싱만 하면 통과"하는 무의미한 요구가 되기 때문이다.
> `--pilot`은 이제 **첫 연속 구간(spine) 룩체크**만 의미한다(§5). `harvest`/`review`의 `--pilot`은 spine 구간의 비트를 대상으로 하고, 10요소·samples 판정은 없다.
