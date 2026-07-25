# T10 — brandboy 문서 개정 · T9a/T9b/T9d 프롬프트 · T11 pulk 문서

**선행**: T0a · **T1의 선행**
**파일**: `~/brandboy-pipeline/spec/*` · `docs/*` · `prompts/*` · `TASKS.md` · 신규 `docs/DIVERGENCE.md`

---

## T10 — brandboy 원본 문서를 rev5 계약으로 개정

### 왜 필요한가

`TASKS.md:3`이 "한 번에 한 태스크만 넘긴다. 저장소 전체를 컨텍스트에 올리지 않는다"고 지시하므로, **태스크 담당자가 받는 그 문서가 정본**이 된다. 원본을 그대로 두면 담당자는 rev5가 바꾼 계약을 되돌리는 문서를 읽게 된다.

### 개정 대상 (최소 12건)

| 파일:줄 | 현재 | rev5 |
|---|---|---|
| `spec/01-schema.md:29,31` | 작성자 `plan → review`, `usage.json`=assemble | **[CONTRACTS §1](../CONTRACTS.md) 필드 구역 표**로 대체. `usage.json` 작성자 = `review --apply` |
| `spec/01-schema.md:112` | "`schema/pipeline.ts`가 **수정 없이** 동작한다" | rev5 필드 추가 반영 (`anchor`/`sentence_key`/`timing_rev`/`locked_selection`/`revision`/`writers`/`seal`) |
| `spec/01-schema.md` 검증 절 | 치명 12종 | **+ V13 · V14 · V14b · V15 · V16 · V17a** |
| `spec/02-align.md:186` | "원고 상 문장 인덱스로 매칭" | **`sentence_key` 불변 ID** 규정 |
| `spec/03-plan.md` | `shot-plan.json` 직접 생성 | **`beat-plan.json` → `plan --apply`** |
| `spec/04-harvest.md:122-130` | 파일럿용 선행 수급 | **화질 2단**(프록시 전량 → 승인분 고화질) + "게이트는 60초 파일럿이 아니라 **스토리보드**" 명시 |
| `spec/05-review.md:95,101,129` | "`shot-plan.json`을 직접 갱신한다" | **결정 로그 다운로드 → `review --apply`** |
| `spec/05-review.md:183,187` | "`locked: true`가 된다" | **`locked_selection: true`** |
| `spec/06-motion.md` | — | 버전 핀 위치(`package.json`) 명시 |
| `spec/07-assemble.md:14-25` | 트랙 목록 | **"10트랙"** 명시 (본문은 이미 10개) |
| `spec/08-quality.md:34` | `"verdict": "human_required"` | **문자열 유지 확인** (계획 rev3의 `manual_required`가 오기였다) |
| `TASKS.md` 전체 | T0~T7 (T0 2시간 · T3 ~450줄 · T7=프롬프트 검수 · "9개 트랙") | **rev5 번호·규모·의존으로 덮어쓰기** |
| `IMPLEMENTATION.md:112` | `usage.json` 작성자 = 수집 에이전트 | **`review --apply`** |
| `prompts/harvest-sources.md:34` | "`shot-plan.json`의 `need` 샷을 채워라" | → **T9a** |

### `docs/DIVERGENCE.md` (신규)

개정만 하고 추적을 안 하면 나중에 원본을 다시 받았을 때 어느 것이 rev5 개정분인지 구분할 수 없다.

```markdown
| 파일:줄 | 원본 원문 | rev5 변경 | 사유 |
|---|---|---|---|
| spec/01-schema.md:29 | "작성자는 plan → review 둘뿐이다" | 필드 구역 표로 대체 | shot-plan은 3개 작성자가 서로 다른 필드를 쓴다 |
```

### T10 완료 조건

- [ ] 위 표의 14개 항목이 개정됨
- [ ] `docs/DIVERGENCE.md`에 각 항목의 원본 원문·변경·사유가 기록됨
- [ ] `rg -n "shot-plan.json을 직접|locked: true|9개 트랙|manual_required" spec/ docs/ prompts/` → **0건**
- [ ] `TASKS.md`의 태스크 번호가 이 계획과 일치 (T0a/T0b/T1/T2/T3/T3b/T4/T5/T6/T7/T7b/T8/T9a~d/T10/T11)
- [ ] 개정 후 `spec/*`만 읽고도 rev5 계약대로 구현 가능한지 1인 리뷰

---

## T9a — `harvest-sources.md` 개정 (**T7 선행**)

현재 `:34`가 "`shot-plan.json`의 `selection_status: "need"` 인 샷을 채워라"라고 지시한다. **개정하지 않으면 첫 실행에서 소유권 규약이 깨진다.**

**개정 후 지시**
- 후보는 `candidates/<beat_id>/`에 쓴다
- 승인 구간 다운로드 결과는 `assets/selected/manifest.json`에 쓴다
- **`shot-plan.json`을 쓰지 않는다**
- `rights_status`와 `score_source`를 모든 후보에 기록한다
- 처리 순서: 훅 전체 → reveal 전체 → 숫자·인용·제품 → build → bridge (`:44` 유지)
- `critical` 후보 미달 시 `blocked`로 보고. **자동 강등 금지**

## T9b — `plan-beats.md` 개정 (**T1 선행**)

**개정 후 지시**
- 산출물은 **`beat-plan.json`** 하나. `shot-plan.json`을 쓰지 않는다
- 비트의 `start`/`end`는 `timeline.json`의 **단어 시각에 맞춘다**. 임의 계산 금지 (`spec/03:47`)
- `anchor: { sentence_key, offset_sec }`를 반드시 채운다
- **비트 재분할 시 `selection_status != "need"` 샷을 삭제·갱신하지 않는다.** 새 비트에 재바인딩만
- **보존 샷이 덮는 시간대에 새 `need` 샷을 생성하지 않는다.** 커버리지 미달은 `coverage_gap[]`로 보고 ([CONTRACTS §3](../CONTRACTS.md))
- `emphasis_caption`은 **후보로만** 표시. 확정은 검수 단계 (`spec/03:81-88`)

> **강제 주체는 `plan --apply`다.** 프롬프트는 1차 통제이고, `writeScoped(Z1)` + V14 봉인 해시가 2차 통제다. 위반 시 `plan --apply`는 **abort**한다(`coverage_gap` 보고 후 통과가 아니다).

## T9c — `motion-scene.md` 개정

→ [T8-motion.md](./T8-motion.md) 참조.

## T9d — 프롬프트 3종 실주행 검증 (**T5 이후**)

- [ ] `harvest-sources.md` 실주행 → 산출물이 `pipeline validate` 통과
- [ ] `plan-beats.md` 실주행 → `beat-plan.json`이 `plan --apply` 통과, `writeScoped` abort 없음
- [ ] `motion-scene.md` 실주행 → lint·inspect·render 체인 통과
- [ ] 3종 모두 **재실행 시 같은 결과**(결정론 또는 캐시 히트)

---

## T11 — pulk 문서 갱신 (최종)

pulk `CLAUDE.md`("No large refactor without updating `docs/DECISIONS.md`")와 `.claude/rules/00-global.md`(완료 시 `TASKS.md`·`HANDOFF.md` 갱신 필수)에 따른다.

- [ ] `docs/DECISIONS.md` — factory 강등 + 신규 `pipeline` 레포 결정을 한 줄로 기록
- [ ] `docs/cmo/video-pipeline/HANDOFF.md` — 현재 상태 갱신
- [ ] `docs/cmo/video-pipeline/TASKS.md` — 진행 기록 갱신
- [ ] `docs/cmo/HANDOFF.md` · `docs/cmo/CLAUDE.md` 문서 맵에 `video-pipeline/` 링크 추가
- [ ] **factory 강등이 `packages/l5-core/src/functions/video-room/render-pipeline.ts` 소비자에 미치는 영향**을 명시 — 슬라이드덱 렌더 경로는 그대로 살아 있고, 다큐 파이프라인은 별도 CLI라는 점
