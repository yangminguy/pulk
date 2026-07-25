# T2 — CLI 뼈대 + `writeScoped` + magic-number lint (~400줄)

**선행**: T1
**읽을 것**: [CONTRACTS.md](../CONTRACTS.md) §1 · [SCOPES.md](../SCOPES.md) §6 · `~/brandboy-pipeline/docs/IMPLEMENTATION.md` §7
**파일**: `src/cli.ts` · `src/lib/{io,proc,cache,profile}.ts` · `scripts/verify-no-magic-numbers.ts`

## 먼저 확인할 것

- [ ] T1의 `profile.ts`가 동작하는가
- [ ] `preflight-report.md`의 P4(ffmpeg 필터)가 통과했는가 — `proc.ts` 타임아웃 테스트에 ffmpeg를 쓴다

## 목적

모든 명령이 공유하는 뼈대를 만든다. **여기서 만든 `writeScoped`가 소유권 계약의 실체**이므로 대충 만들면 뒤에서 전부 샌다.

---

## 1. CLI 규약

```text
pipeline <command> --project <dir> [--only …] [--pilot pilot.json] [--force] [--dry-run] [--human] [--eval] [--emit …]
```

서브커맨드 8종: `validate` · `ingest` · `align` · `reanchor` · `plan` · `review` · `harvest` · `assemble` · `qc`

- **stdout은 JSON 한 덩어리.** 사람용 표는 `--human`일 때만 stdout 뒤에 추가
- **진행 로그는 stderr.** stdout을 오염시키면 파이프가 깨진다
- 종료 코드 `0` 성공 / `1` 품질·처리 실패 / `2` 입력 오류

### 부분 실패 리포트 형식

```json
{
  "ok": true,
  "processed": 214,
  "skipped": 12,
  "failed":  [{ "beat_id": "b088", "importance": "normal", "reason": "no candidate above threshold" }],
  "blocked": [{ "beat_id": "b042", "importance": "critical", "reason": "no evidence-grade candidate", "action_required": true }],
  "deferred_blocked": [{ "beat_id": "b201", "importance": "critical", "reason": "out of --only scope" }]
}
```

- `blocked`가 비어 있지 않으면 **exit 1** (`IMPLEMENTATION.md:212`)
- `deferred_blocked`(부분 재처리 `--only` 범위 **밖**의 critical 미달)는 **exit 0 + stderr 경고**. 숨기지 않으므로 Principle 3 유지
- 한 비트가 실패해도 전체를 중단하지 않는다. 단 범위 안 `critical` 실패는 예외

---

## 2. `io.ts`

### 원자적 쓰기

```ts
writeAtomic(path, data)   // <path>.tmp 에 쓰고 rename. 중간에 죽어도 기존 파일이 남는다
```

### `writeScoped` — 소유권 가드 ★

```ts
writeScoped(file: string, zone: 'Z1'|'Z2'|'Z3', mutator: (doc) => void): void
```

```
1. 읽기 → 구역 밖 필드의 정규화 해시 계산
2. mutator 실행
3. 구역 밖 필드의 해시 재계산
4. 다르면 → abort. 파일 무변경. exit 1 + 어느 필드가 변했는지 diff 출력
5. 같으면 → Z0 메타 갱신(자기 rev +1, revision +1) 후 writeAtomic
```

**정규화 규칙 (반드시 지킨다)**

| 항목 | 규칙 |
|---|---|
| 비교 단위 | **`shot_id` / `beat_id` 키 기준.** 배열 위치 무관 — `plan`이 재정렬해도 오탐이 나면 안 된다 |
| 키 순서 | 정렬 후 직렬화 |
| 수치 | **소수 3자리 고정** (`134.2` == `134.200`) |
| 빈 값 | `undefined`와 필드 부재를 **동일 취급** |

구역별 필드 목록은 [CONTRACTS.md §1](../CONTRACTS.md)의 표를 **코드 상수 하나**(`ZONE_FIELDS`)로 옮긴다. 여러 곳에 흩어지면 반드시 어긋난다.

---

## 3. `proc.ts`

```ts
run(cmd: string, args: string[], opts: { timeoutSec, cwd?, input? }): { stdout, stderr, code }
```

- **`shell: true` 금지.** 인자를 배열로 넘긴다 — 파일명 공백·특수문자가 실제로 자주 나온다
- 타임아웃 필수 (`harvest.timeout_sec`). `yt-dlp`와 `ffmpeg`은 매달릴 수 있다
- 타임아웃 시 SIGTERM → 3초 후 SIGKILL
- stderr를 삼키지 않는다 (`silencedetect` 파싱이 stderr에 의존)

---

## 4. `cache.ts`

```ts
cacheGet(key: string, opts?: { ignoreTtl?: boolean }): T | null
cacheSet(key: string, value: T): void
```

- 경로 `.cache/<sha256(source+query)>.json`, TTL `harvest.cache_ttl_days`
- **`--eval` 플래그면 TTL 무시** — 평가셋 실행은 재현 가능해야 한다
- 캐시가 없으면 특정 비트만 재수집할 때 API를 다시 부른다. **검수 → 재수집 루프가 파이프라인의 기본 동작**이므로 필수다 (`IMPLEMENTATION.md:227`)

---

## 5. `--only` / `--pilot` 단위

[SCOPES §6](../SCOPES.md)의 표를 그대로 구현한다. 요점만:

| 명령 | `--only` | skip |
|---|---|---|
| `align` | **`session-NN`** | 세션 WAV의 mtime/해시가 새로우면 **자동 재처리(skip 금지)** |
| `assemble` · `qc` | **미지원 → exit 2** | `--force`로만 |
| `harvest` · `review` | `beat_id` (+`--pilot` 교집합) | TTL / 항상 |

> **`align`의 `--only`가 `beat_id`가 아닌 이유**: align은 비트 생성 **전**에 돌고 출력은 단일 연속 마스터다. 비트 하나만 재정렬한다는 개념이 없다.
> **`align`의 skip 규칙이 특수한 이유**: 세션 재녹음 후 재실행 시 "산출물 있으면 skip"이면 낡은 마스터가 유지된다. `--force`를 쓰면 전체 재생성되어 재고정 문제가 발동한다.

---

## 6. `scripts/verify-no-magic-numbers.ts` — AST 블랙리스트 lint

`src/` 내 **모든 숫자 리터럴**을 AST로 훑어 허용목록을 벗어나면 실패한다.

**허용목록**
- `0` · `1` · `-1`
- 배열 인덱스 위치의 정수
- `// @unit` 주석이 붙은 단위환산 (예: `ms / 1000 // @unit ms→sec`)

> 화이트리스트 grep(`0.75|2.5|-14|...`)은 **이미 아는 숫자만** 찾아 새로 생기는 상수를 원리적으로 못 잡는다. 그리고 이식 대상이 정확히 그런 상수를 실어 나른다 — `captions.ts:102-104`(`30`/`700`/`14`), `artifactQa.ts:55-65`(모듈 최상단 `export const` 11개).
> `2`·`100`·`1000`을 허용하면 안 된다 — `handle_sec 2.0` · `min_candidates 2` · `max_lines 2`가 통과한다.

---

## 7. `edit-profile.json` 신규 키

T2에서 아래를 `config/edit-profile.json`에 추가한다(코드에 쓰려던 상수 전부).

```json
"profile_rev": 1,
"align":    { "window_ratio": [0.7, 1.4] },
"audio":    { "session_lufs_deviation_max": 1.5,
              "session_noise_floor_deviation_db": 3.0,
              "session_boundary_discontinuity_db": 6.0 },
"captions": { "timing": { "group_max_chars": 20, "group_max_gap_ms": 700, "group_max_words": 14 },
              "impact_card": { "sync_tolerance_estimated_sec": 0.4 } },
"harvest":  { "proxy_budget_gb": 25, "proxy_max_candidates_per_beat": 3,
              "preview_context_sec": [20, 40], "proxy_height": 720 },
"sources":  { "prefer_kind": ["official_video", "interview", "video"],
              "still_only_on_emphasis": true, "still_image_max_per_15min": [3, 6] },
"photo_motion": { "default": "parallax", "zoom_range": [1.0, 1.18],
                  "pan_max_pct": 12, "min_move_sec": 2.5, "downgrade": "ken_burns" }
```

---

## 8. 완료 조건

- [ ] `npx tsx src/cli.ts --help` 및 **8개 서브커맨드 `--help`**
- [ ] `validate ... | jq .` 파싱 성공 — **stdout 오염 없음**
- [ ] 쓰기 중 SIGKILL 시뮬레이션 후 **기존 파일 보존**
- [ ] **`writeScoped` 위반 픽스처**: `reanchor`가 `source_in`을 건드리려 하면 **abort + 파일 무변경 + diff 출력**
- [ ] **`writeScoped` 오탐 픽스처**: `plan`이 `shots[]` 배열을 재정렬해도 **abort하지 않는다** (키 기준 해시 검증)
- [ ] **세션 2 WAV만 교체 → `align` 재실행 → 세션 2만 재처리, 나머지 `skipped` 보고**
- [ ] `qc --only x` → exit 2 · `assemble --only x` → exit 2
- [ ] `locked_selection: true` 샷이 `--force` 없이 보존됨
- [ ] `--eval` 플래그가 캐시 TTL을 무시함
- [ ] `verify-no-magic-numbers.ts`가 의도적으로 심은 상수 리터럴 3개를 잡아냄

## 검증 명령

```bash
cd ~/brandboy-pipeline
npx tsx src/cli.ts --help
npx tsx src/cli.ts validate --project projects/<slug> | jq . > /dev/null && echo "stdout clean"
npx tsx scripts/verify-scoped-write.ts       # 위반 abort + 재정렬 오탐 없음
npx tsx src/cli.ts qc --project projects/<slug> --only b001 ; echo "exit=$?"   # 기대: 2
npx tsx scripts/verify-no-magic-numbers.ts
```

## 흔한 함정

- **`writeScoped`의 구역 필드 목록을 여러 파일에 복사** → 반드시 어긋난다. `ZONE_FIELDS` 상수 하나로.
- **stdout에 `console.log`로 진행 로그** → `jq` 파이프가 깨진다. 진행 로그는 `console.error`.
- **`spawnSync`에 `shell: true`** → 한글 파일명·공백에서 터진다.
- **`--force`를 `align`의 세션 재처리 수단으로 쓰기** → 전체 재생성되어 [CONTRACTS §2](../CONTRACTS.md) 재고정이 발동한다. mtime/해시 기반 자동 재처리가 맞다.
