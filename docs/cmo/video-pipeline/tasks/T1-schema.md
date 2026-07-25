# T1 — 타입 + `validate` (~600줄)

**선행**: T0a · T10 · T9b
**읽을 것**: [CONTRACTS.md](../CONTRACTS.md) · `~/brandboy-pipeline/spec/01-schema.md` · `schema/pipeline.ts` · `config/edit-profile.json`
**파일**: `src/schema/pipeline.ts` · `src/commands/validate.ts` · `src/lib/profile.ts`

## 먼저 확인할 것

- [ ] `preflight-report.md`의 P1 경로(A/B)가 확정됐는가 — 경로 B면 `Word.timing`에 `"estimated"` 값이 필요
- [ ] T10이 `spec/01-schema.md:112`("`schema/pipeline.ts`가 수정 없이 동작")를 개정했는가 — rev5는 필드를 추가하므로 이 문장이 남아 있으면 충돌
- [ ] `config/edit-profile.json`이 `frame.md` + 기본값으로 확정되고 `profile_rev: 1`인가. `sources`·`photo_motion` 블록 존재 확인

## 목적

brandboy `schema/pipeline.ts`를 시작점으로 **rev5 계약을 코드로 표현**하고, 치명 12종 + V13·V14·V14b·V15·V17a + 품질 경고 13종(+V16)을 판정하는 `validate`를 만든다.

**수치는 하나도 코드에 쓰지 않는다.** 전부 `profile.ts`를 통해 `edit-profile.json`에서 읽는다.

---

## 1. 스키마 추가 필드

brandboy 원본(`schema/pipeline.ts:104-151`)에 다음을 더한다.

```ts
// ── 문장 (script-map.json + timeline.json) ─────────────────────────
Sentence = z.object({
  sentence_key: z.string().length(8),      // 사람 부여 불변 ID. 텍스트 수정에도 유지
  sentence_id:  z.string(),                // "sn042" 표시·정렬용 (가변)
  text: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  words: z.array(Word),
})

// ── 녹음 세션 ──────────────────────────────────────────────────────
RecordingSession = z.object({
  id: z.string().regex(/^session-\d{2}$/),
  wav_path: z.string(),
  from_sentence_key: z.string().length(8),
  to_sentence_key:   z.string().length(8),
})

// ── 앵커 (Beat / Shot 공통) ────────────────────────────────────────
Anchor = z.object({
  sentence_key: z.string().length(8),
  offset_sec: z.number().nonnegative(),
})

// Beat 에 추가
  anchor: Anchor,
  timing_rev: z.number().int().nonnegative(),

// ── 사진 촬영 모션 (Z2, asset_kind:"image" 전용) ───────────────────
PhotoMotion = z.object({
  type: z.enum(['parallax','ken_burns','zoom_in','zoom_out','pan_lr','pan_ud']).default('parallax'),
  focal: z.tuple([z.number(), z.number()]),        // 초점(피사체 중심, 0~1 정규화)
  zoom:  z.tuple([z.number(), z.number()]),        // from→to (예: 1.0→1.18)
  duration_sec: z.number().positive(),
})

// Shot 에 추가 / 변경
  anchor: Anchor,
  timing_rev: z.number().int().nonnegative(),
  locked_selection: z.boolean().default(false),   // ← 원본 `locked` 대체
  needs_review: z.boolean().optional(),
  orphaned: z.boolean().optional(),
  photo_motion: PhotoMotion.optional(),           // asset_kind:"image"면 필수(V18). 기본 parallax
  // 원본 `locked` 는 제거. `locked_timing` 은 만들지 않는다

// Candidate 에 추가
  score_source: z.enum(['lexical', 'agent_rerank']),

// ShotPlan 에 추가
  revision: z.number().int().nonnegative(),
  writers: z.object({
    plan_rev: z.number().int().nonnegative(),
    review_rev: z.number().int().nonnegative(),
    reanchor_rev: z.number().int().nonnegative(),
  }),
  profile_rev: z.number().int().positive(),
  frame_rev: z.number().int().positive(),
  seal: z.string().length(64),          // writers 내부. V14 봉인 해시
  coverage_gap: z.array(z.object({
    beat_id: z.string(), from: z.number(), to: z.number(), reason: z.string(),
  })).default([]),

// Timeline 에 추가
  align_rev: z.number().int().nonnegative(),
  profile_rev: z.number().int().positive(),
  word_timing: z.enum(['exact', 'estimated']),
```

### 하지 말 것

- `Shot`에 `importance`를 넣지 않는다 — **`Beat` 필드다** (`schema/pipeline.ts:111`)
- `Shot.beat_id`(단수) 만들지 않는다 — **`beat_ids: string[]`** 이다 (`:124`. `:123`은 `shot_id`)
- `locked_timing` 만들지 않는다 — 소비자가 없고 V13과 충돌한다

---

## 2. `profile.ts` — 수치 단일 출처 로더

```ts
loadProfile(projectDir): Profile      // projects/<slug>/edit-profile.json, 없으면 config/에서 복사 + 경고
loadFrame(projectDir): FrameTokens    // frame.md + frame_rev
```

- 모든 키를 zod로 검증. 누락 키는 즉시 실패(런타임에 `undefined`가 흘러가면 안 된다)
- `profile_rev` · `frame_rev`를 반환해 산출물에 기록할 수 있게 한다

---

## 3. `validate` 검증 규칙

### 치명 (exit 1)

brandboy `spec/01-schema.md:41-56`의 V1~V12 + rev5 신설 6종.

| 규칙 | 내용 |
|---|---|
| V1~V12 | brandboy 원본 (스키마 위반 · 비트 커버리지 갭 · 비트 겹침 · 승인 없는 소스 · 권리 미기록 등) |
| **V13** | `shot.timing_rev != timeline.align_rev` → 실패 |
| **V14** | **봉인 해시** — 파일 실제 해시 ≠ `writers.seal` → "CLI 외부 쓰기 발생" 실패 + 마지막 CLI 쓰기 이후 diff 출력 |
| **V14b** | 구역 정합 — ① `selection_status="approved"`인데 `source_id` 없음 ② `locked_selection=true`인데 `source_in` 없음 ③ `writers.reanchor_rev < writers.plan_rev` |
| **V15** | `needs_review`/`orphaned` 샷의 **앵커 비트 `importance`** 기준 — `critical` → **실패** · `normal` → 경고 + 검수 대상 표시 · `bridge` → 리포트 표시만 |
| **V17a** | 같은 **`asset_kind`** 샷끼리 시간 중첩이 `tracks.allowed_overlap_sec` 초과 → 실패 |
| **V18** | `asset_kind="image"` 샷에 `photo_motion` 없음 → 실패 (정지 사진 차단, 기본 parallax). 비강조 비트 사진·15분당 상한 초과는 **경고**(V18b) |

### 경고 (exit 0, 리포트)

brandboy 품질 경고 13종 + **V16**(`profile_rev`/`frame_rev` 불일치 → [SCOPES §4](../SCOPES.md) 무효화 표 출력).

### V14 — 봉인 해시

```ts
// writeScoped 마지막 단계에서 CLI가 갱신
writers.seal = sha256(canonicalJSON(shotPlan without writers.seal))

// validate
if (sha256(canonicalJSON(현재파일 without writers.seal)) !== writers.seal) fail(...)
```

**`plan_rev`가 증가했는지로 우회를 검출하면 안 된다.** 에이전트가 `shot-plan.json`을 통째로 덮어쓸 때는 그 필드를 건드리지 않으므로 탐지되지 않는다. "rev가 오르지 않았는데 내용이 변했다"를 봐야 성립한다. `spec/03-plan.md:3`이 "CLI로 구현하지 않는다"고 못박은 `plan` 에이전트에 대한 **유일한 사후 검출 장치**다.

### V17a — 레인이 아니라 `asset_kind`로 판정한다

트랙 배정은 `assemble/model.ts`가 하고 `shot-plan.json`에는 track 필드가 없다(`schema/pipeline.ts:122-144`). **매핑 로직을 validate에 복제하면 `checks.ts` 공유로 없앤 문제가 재발한다.**

- **V17a (여기, T1)**: `asset_kind` **직접 비교**. 매핑 불필요. 비트 재분할이 만든 중첩을 조기에 잡는다
- **V17b (T5, `assemble/checks.ts`)**: `edit-profile.json`의 `tracks.lane_by_asset_kind` 매핑 적용 후 실제 레인 검사

**허용 중첩** — `spec/07-assemble.md:51`의 선행 컷은 새 인물·제품·장소를 내레이션보다 **0.2~0.5초 먼저** 보여준다. J/L 컷도 의도적 중첩이다. `tracks.allowed_overlap_sec`(0.5) 이내는 통과, 초과하면 실패. **예외 없이 실패시키면 정상 편집 문법을 차단한다.**

---

## 4. 출력 형식

```json
{
  "ok": true,
  "profile_rev": 1,
  "frame_rev": 1,
  "fatal": [],
  "warnings": [
    { "rule": "W07", "beat_id": "b088", "detail": "같은 화면 크기 5샷 연속(기준 4)" }
  ],
  "blocked": [],
  "invalidation": null
}
```

`fatal`이 비어 있지 않으면 exit 1. 입력 오류(파일 없음·파싱 실패)는 exit 2.
`--human`일 때만 사람용 표를 stdout에 추가한다.

---

## 5. 완료 조건

- [ ] **의도적 파손 13종 픽스처**가 각각 **지정된 규칙에서만** 실패한다
  - 기존 8종(brandboy `TASKS.md` T1 기준) + V13 + V14(봉인 해시) + V14b + V15(critical) + V17a + `profile_rev` 불일치(경고)
  - `fixtures/invalid-*.json`, 각 파일에 기대 규칙 ID를 주석으로 명시
- [ ] **V15 중요도별 분기 픽스처** — 같은 `orphaned` 상황에서 `critical`은 실패, `normal`은 경고, `bridge`는 표시만
- [ ] **`plan` 재실행 픽스처** — 승인 샷 3개 + `need` 샷 5개인 shot-plan에 비트 재분할을 적용해도
  - 승인 샷 3개의 **Z2 필드가 문자 단위로 보존**되고
  - **V17a 위반 0건**이며
  - 미충족 구간이 `coverage_gap[]`에 보고된다
- [ ] **사진 촬영모션 픽스처** — `asset_kind:"image"`인데 `photo_motion` 없는 샷이 **V18에서 실패**, parallax가 붙은 샷은 통과. 비강조 비트 사진은 V18b 경고
- [ ] 정상 예시 프로젝트가 통과한다
- [ ] `npx tsx scripts/verify-no-magic-numbers.ts` 통과 — **수치 하드코딩 0건**
- [ ] `npx tsc --noEmit` clean

## 검증 명령

```bash
cd ~/brandboy-pipeline
npx tsc --noEmit
npx tsx scripts/verify-schema.ts            # 파손 13종 + V15 분기 + plan 재실행
npx tsx src/cli.ts validate --project projects/<slug> --human
npx tsx scripts/verify-no-magic-numbers.ts
```

## 흔한 함정

- **ms/초 혼동** — factory `captions.ts`는 밀리초, brandboy 스키마는 **초**다. M1 이식 시 경계에서 변환한다.
- **`profile.ts`를 거치지 않고 JSON을 직접 읽는 코드** — 누락 키가 `undefined`로 흘러가 나중에 `NaN` 비교가 조용히 false가 된다. 로더를 반드시 통과시킨다.
- **경로 B(문장 단위 whisper)** — `Word.timing`이 `"estimated"`면 `captions.impact_card.sync_tolerance_estimated_sec`를 적용해야 한다. 스키마에 필드를 미리 넣어둔다.
