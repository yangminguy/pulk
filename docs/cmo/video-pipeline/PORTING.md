# PORTING — ai-slide-video-factory → brandboy-pipeline 이식 절차

> 이식 대상 6종의 **파일·줄번호·변환 규칙**. 두 리뷰 라운드에서 실측 검증됨.
> 원본: `~/ai-slide-video-factory` (브랜치 `feature/cmo-video-upgrade`)
> 대상: `~/brandboy-pipeline`

## 대원칙

1. **factory 코드를 `import` 하지 않는다.** 전부 **복사 이식**한다. 런타임 의존은 hyperframes 템플릿 폴백 한 곳뿐이며 그것도 파일 경로로만 연결한다.
2. 이식한 코드에 **상수 리터럴이 따라오면 안 된다.** 전부 `config/edit-profile.json`으로 이관한다.
3. 이식 직전 `git diff HEAD -- <파일>`로 미커밋 변경분을 확인한다.

## 이식 전 준비 (T0a와 병행)

factory는 현재 `feature/cmo-video-upgrade`에서 11개 수정 + untracked 다수 상태다.

```bash
cd ~/ai-slide-video-factory
git status --short
git add -A && git commit -m "wip: cmo-video-upgrade 진행분"   # WIP 커밋만. 브랜치 유지
```

`git stash` 금지(작업 손실 위험). `git reset` 금지.

**실측 결과 이식 대상 4파일(M1·M2·M4·M5)은 전부 clean**이다. 수정된 것은 `CaptionLayer.tsx`·`schema.ts`·`transitions.ts` 등으로 이식 대상이 아니다. 따라서 커밋 여부와 무관하게 이식은 안전하다.

---

## M1 — `src/lib/captions.ts` (308줄) → `src/lib/captions.ts` + `src/lib/similarity.ts`

**재사용률 ~30%**

### 가져올 것

| 원본 위치 | 심볼 | 대상 |
|---|---|---|
| `36-65` | `parseSRT` | `lib/captions.ts` |
| `191` | `normalizeForMatch` | `lib/similarity.ts` |
| `196-214` | `editDistance` | `lib/similarity.ts` |
| `215-225` | `isSimilar` | `lib/similarity.ts` |
| `235-278` | `alignWordsToScript` | `lib/similarity.ts` — **T3에서 신규로 만들려던 "whisper 표기 → 원고 표기 교정"과 목적이 같다. 이식하면 T3에서 100~150줄 절감.** 원고 토큰 1~3개 연결 + 5토큰 룩어헤드 순차 그리디 |

### 버릴 것

| 원본 위치 | 심볼 | 이유 |
|---|---|---|
| `101-145` | `groupWordsIntoPages` | 기본값 `maxChars??30` `maxGapMs??700` `maxWords??14`(102-104)가 brandboy 자막 규칙과 **완전히 다르다** — 2줄·16~20자(`spec/02:152`), 조사·어미 고립 금지(`:154`), `min_block_sec` 0.8초(`:155`). 규칙 자체가 달라 파라미터 교체로 해결되지 않는다. `align/captions-ko.ts`로 신규 작성 |

### 필수 변환

```ts
// factory (18-22)                      brandboy (schema/pipeline.ts:85-89)
Word { text, startMs, endMs }    →     Word { text, start, end }   // 밀리초 → 초
```

`parseSRT`가 ms를 반환하므로 경계에서 `/1000` 변환 후 소수 3자리로 반올림한다. 이 변환을 빠뜨리면 모든 시각이 1000배가 되고, 총 길이 ±0.2초 검사에서야 발견된다.

### 추가 구현

`parseSRT`는 파싱만 있다. **직렬화(`writeSRT`)를 새로 만들어야 한다** — `align`이 `captions.srt`를 출력하기 때문.

---

## M2 — `footage-runner/probe.ts` (64줄) → `src/lib/probe.ts`

**재사용률 ~95%. 가장 단순한 이식.**

| 원본 위치 | 심볼 |
|---|---|
| `24-56` | `probeMedia` — ffprobe 래퍼. `{durationSec, width, height, fps}` 반환 |
| `59-64` | `parseFrameRate` — `"30000/1001"` → `29.97` |

### 유일한 변경

`spawnSync` 직접 호출을 `src/lib/proc.ts`의 타임아웃 래퍼로 교체한다. `proc.ts`는 인자를 배열로 넘기고(`shell: true` 금지) `harvest.timeout_sec`를 적용한다.

---

## M3 — `scripts/generate-narration.ts` (240줄) → `src/align/transcribe.ts`

**재사용률 ~8% (≈20줄)**

### 가져올 것

| 원본 위치 | 내용 |
|---|---|
| `71-90` | `transcribe()` — faster-whisper python 스니펫 호출부. `/usr/bin/python3` 사용 |

### 버릴 것

- TTS(`say -v Yuna --data-format=LEI16@44100`) 전부 — 사람 녹음으로 전환했으므로 불필요
- `measureSceneDurations`(`99-125`) — 씬 duration 비례 배분. 비트 모델과 무관

### 필수 변경

원본은 **문장 단위** 타임스탬프를 받는다. brandboy는 **단어 단위**가 필요하다.

```python
# 변경: word_timestamps=True 추가
segments, info = model.transcribe(wav, language="ko", word_timestamps=True)
```

반환 스키마가 달라지므로(`segment.words[]`가 생김) **파서는 신규 작성**한다. T0a/P1에서 이 출력이 실제로 단어별 `start`/`end`를 담는지 먼저 확인한다 — 문장 단위만 나오면 경로 B(글자 수 비례 추정)로 간다.

---

## M4 — `scripts/generate-storyboard-review.ts` (481줄) → `src/review/render.ts`

**재사용률 ~12% (≈50~60줄).** "골격 재사용"이라는 표현이 오해를 부르기 쉬우니 실측치를 그대로 적는다.

### 가져올 것

| 원본 위치 | 내용 |
|---|---|
| 상단 | argv 파싱 패턴, `esc()` HTML 이스케이프, `time()` 포맷터 |
| 전반 | **"자체완결 HTML 문자열을 생성해 파일로 쓴다"는 구조 자체** — 서버 없이 열리는 단일 파일 |
| `453-476` | 클라이언트 JS **전체가 24줄**. IntersectionObserver(뷰포트 진입 시 자동 재생) + replay 버튼 |

### 버릴 것 (전부 슬라이드덱 전용)

| 원본 위치 | 내용 |
|---|---|
| `161-241` | `pulkVisualHtml` — pulk 덱 레이아웃 (80줄) |
| `243-282` | `previewHtml` — Remotion 씬 프리뷰 (40줄) |
| `308-341` | `sceneTraceHtml` / `workflowHtml` — 스킬 트레이스 |
| `383-435` | CSS 문자열 덩어리 (~53줄, 초장문 한 줄들) — 슬라이드덱 브랜드 전용 |

### 신규 작성해야 하는 것 (대부분)

- 후보 `<video>` + `#t=in,out` 구간 재생
- `[` `]` 실시간 인·아웃 시크
- 단축키 15키 / 11행 (`spec/05-review.md:79-91`)
- 2패스(편집적합성 / 근거·권리) 5점 척도 3축
- 200+ 행 lazy 렌더
- 축소 타임라인 + 자동 경고 6종
- 결정 로그 append-only 다운로드 (10건마다 자동 제안)

> **T0a/P6를 먼저 통과해야 한다.** `file://`에서 `<video>` `#t=a,b` 재생과 다운로드 저장이 Chrome·Safari에서 되는지 확인. 실패하면 `review --watch` 로컬 서버로 간다 (`spec/05-review.md:126`이 원래 권장 1순위).

---

## M5 — `src/lib/autoGate.ts`(146줄) + `src/lib/artifactQa.ts`(383줄) → `src/assemble/checks.ts` + `src/commands/qc.ts`

**판정 골격만 재사용**

### 가져올 것

| 원본 위치 | 내용 |
|---|---|
| `autoGate.ts:6-24` | `AutoGateCheck { id, label, status, detail, blocking }` 타입 |
| `autoGate.ts:140-145` | 집계 → `verdict` 산출 패턴 |

### 필수 변경

1. **체크 목록 전면 교체** — factory의 15체크를 버리고 brandboy 치명 12종(`spec/01-schema.md`) + 조립 검사 13종(`spec/07-assemble.md` §8)으로.
2. **`"자동 판정 불가"` 상태 추가** — factory는 `pass`/`fail`만 있다. brandboy는 사람 검수 항목을 `"verdict": "human_required"`로 남겨야 한다(`spec/08-quality.md:34`). 통과 처리하면 안 된다.
3. **`artifactQa.ts:55-65`의 모듈 최상단 `export const` 11개를 절대 함께 옮기지 않는다.** 이게 Principle 2(수치 단일 출처) 위반의 최대 유입 경로다. 전부 `config/edit-profile.json`으로 이관하고 `profile.ts`를 통해 읽는다.

### 배치

`checks.ts`는 `TimelineModel`만 입력으로 받고, **`qc.ts`가 이것을 `import`한다.** 두 벌 구현하면 임계값이 어긋난다.

---

## M6 — hyperframes (외부 호출, 복사 아님)

### 현재 factory의 실제 호출

`hyperframes-runner/render.ts:71`

```js
["--yes", "hyperframes@latest", "render", "--output", outAbs]   // cwd = temp dir
```

### 계약 불일치 (T0a/P2c에서 반드시 확인)

| 계획이 전제한 것 | factory의 실제 |
|---|---|
| `lint` 서브커맨드 | **없음** |
| `inspect` 서브커맨드 | **없음** |
| `--non-interactive` | **없음** |
| 출력 `.mov` (알파 가능) | `.mp4` (알파 불가) |
| 버전 고정 | **`@latest`** — 매 실행 버전이 바뀔 수 있음 |

`~/hyperframes/skills/hyperframes-cli/SKILL.md`는 `init/lint/inspect/preview/render`와 `--non-interactive`를 문서화하고 있다. 즉 **CLI에는 있으나 factory 러너가 안 쓰고 있을** 가능성이 높다. P2c에서 `npx hyperframes --help` 및 각 서브커맨드 전문을 기록해 확정한다.

### 이식 방식

복사하지 않는다. `src/motion/bridge.ts`가 subprocess로 호출한다.

- **버전 핀은 `package.json`에** 기록한다. `edit-profile.json`은 *편집 수치* 단일 출처이지 의존성 매니페스트가 아니다.
- 호출: `npx hyperframes@<package.json의 핀> ...`
- 검증: `rg 'hyperframes@latest' src/` → 0건

### 폴백

반복 패턴(라벨·수치·출처·장절 카드)은 factory `hyperframes-runner`의 템플릿 렌더를 그대로 부른다. `critical` 비트만 스킬로 신규 저작한다.

---

## 이식 후 공통 검증

```bash
cd ~/brandboy-pipeline
npx tsc --noEmit
npx tsx scripts/verify-no-magic-numbers.ts    # 이식으로 딸려온 상수 리터럴 검출
rg -n 'startMs|endMs' src/                    # M1 ms→초 변환 누락 검출. 기대: 0건
rg -n 'hyperframes@latest' src/               # M6 버전 핀 누락. 기대: 0건
```

## 재사용 불가 확정 (참고용 — 이식하지 말 것)

| factory 자산 | 이유 |
|---|---|
| Remotion 씬 22종 · 컴포지션 · `SceneFrame` | 슬라이드덱 전용. 다큐 러프컷과 무관 |
| `src/theme/` 테마·포맷 프로파일 | 위와 동일 |
| `media-runner/pexels.ts` | 스톡은 `ratios.stock_max = 0.1` 상한. 주 공급원이 아님 |
| `src/lib/schema.ts`의 `VideoJob` | **씬 단위** 모델. `Beat`/`Shot` 비트 단위 모델과 1:1 대응 불가 |
| `src/lib/duration.ts` `computeTimeline` | 씬 duration 누적. 내레이션 실발화 시각 기반 타임라인과 전제가 다름 |
