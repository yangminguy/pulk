# ARCHITECTURE — 구조 · 경계 · 흐름

> 계약(소유권·재고정·검증)은 [CONTRACTS.md](./CONTRACTS.md), 스코프(파일럿·무효화·부분 재처리)는 [SCOPES.md](./SCOPES.md)에 있다.
> 이 문서는 **어디에 무엇이 있고 어떻게 흐르는가**만 다룬다.

## 1. 레포 구조

```text
~/brandboy-pipeline/                    ← 신규. Downloads 문서 복사 + npm init
├── package.json                        npm · tsx · zod · typescript · Node >= 22
│                                       hyperframes 버전 고정(devDependencies)
├── src/
│   ├── cli.ts                          엔트리. 서브커맨드 라우팅
│   ├── lib/
│   │   ├── profile.ts                  edit-profile 로더 + profile_rev / frame_rev
│   │   ├── io.ts                       원자적 쓰기(tmp→rename) + writeScoped
│   │   ├── proc.ts                     외부 프로세스 (배열 인자 · 타임아웃)
│   │   ├── cache.ts                    .cache/<sha256>.json TTL + --eval TTL무시
│   │   ├── captions.ts                 ← M1 이식 (parseSRT + writeSRT)
│   │   ├── probe.ts                    ← M2 이식 (ffprobe)
│   │   └── similarity.ts               정규화 · 편집거리 · 숫자↔한글 (M1 일부 흡수)
│   ├── schema/pipeline.ts              zod 데이터 계약
│   ├── commands/
│   │   ├── validate.ts   ingest.ts   align.ts    reanchor.ts
│   │   ├── plan.ts       (--apply 전용)
│   │   ├── review.ts     (--apply 가 Z2·usage.json 유일 작성자)
│   │   ├── harvest.ts    assemble.ts  qc.ts
│   ├── align/
│   │   ├── transcribe.ts               faster-whisper subprocess
│   │   ├── match.ts                    슬라이딩 윈도우 정렬 (테이크 선택 없음)
│   │   ├── edit.ts                     ffmpeg 단일 필터그래프 절단
│   │   ├── captions-ko.ts              원고 기반 한국어 자막 생성
│   │   └── sessions.ts                 세션 접합 정합 (T3b)
│   ├── assemble/
│   │   ├── model.ts                    → TimelineModel(10트랙). 출력 경로와 무관
│   │   ├── checks.ts                   자동검사. TimelineModel만 입력. **T6가 import**
│   │   ├── emit-capcut.ts              경로 A
│   │   └── emit-numbered.ts            경로 C
│   ├── harvest/
│   │   ├── adapters/ youtube.ts · web.ts · page.ts     ← 고정 3종
│   │   ├── index.ts                    인메모리 자막 인덱스 + 구간 검색
│   │   ├── rerank.ts                   Option A′ 전용 (T0b 결과에 따라 활성)
│   │   ├── proxy.ts                    2.5단계 프록시 클립
│   │   └── fetch.ts                    승인 구간 고화질 다운로드
│   ├── motion/bridge.ts                hyperframes 호출
│   └── review/render.ts                검수 HTML 생성
├── config/
│   ├── edit-profile.json               모든 수치의 단일 출처 (+ profile_rev)
│   └── frame.md                        디자인 토큰 (+ frame_rev)
├── eval/search-hit5.json               T0b 평가셋 (7건 공개 + 3건 홀드아웃 봉인)
├── prompts/                            harvest-sources · plan-beats · motion-scene
├── spec/  docs/                        brandboy 문서 (T10이 rev5 계약으로 개정)
│   └── docs/DIVERGENCE.md              원본 대비 변경 추적
├── scripts/
│   ├── verify-<module>.ts              태스크별 완료조건 검증기 (11종)
│   └── verify-no-magic-numbers.ts      AST 상수 리터럴 lint
├── fixtures/                           파손 케이스 · 경고 케이스 · reanchor 시나리오
└── projects/<slug>/                    실제 작업 디렉토리 (gitignore)
```

### 왜 별도 레포인가

`ai-slide-video-factory`의 `VideoJob`은 **씬 단위**, brandboy의 `Beat`/`Shot`은 **비트 단위**로 1:1 대응이 불가능하다. 한 레포에 두면 `validate` 경로가 이중화되고 스키마 혼선이 상시 비용이 된다. 또 pulk는 `pnpm` 강제(`.claude/rules/00-global.md`)인데 factory·hyperframes는 npm/npx 생태계다.

pulk 연동은 나중에 **파일 기반 핸드오프**로 붙인다 — 지금 `packages/l5-core/src/functions/video-room/render-pipeline.ts`가 factory를 부르는 것과 동일한 패턴.

## 2. 프로젝트 디렉토리 (`projects/<slug>/`)

```text
brief.md · script.md · script-map.json     사람
frame.md · edit-profile.json               config/에서 복사 후 실측 반영
research/{questions,evidence}.json
sources/
  ├── catalog.json                         원본 카탈로그 (kind: youtube|web|page|a_roll)
  ├── usage.json                           사용 구간 + 권리 (review --apply가 작성)
  ├── transcripts/<source_id>.json         **구간 검색의 핵심**
  ├── previews/  originals/  page-captures/  a-roll/
audio/
  ├── raw/session-01.wav …                 세션 분할 녹음
  ├── narration-master.wav                 연속 마스터
  ├── words.json  captions.srt  captions.meta.json
timeline.json  align-remap.json  align-report.json
beat-plan.json                             plan 에이전트 전용 (→ plan --apply)
shot-plan.json                             Z1/Z2/Z3 구역 소유
candidates/<beat_id>/                      프록시 클립
assets/selected/ + manifest.json
motion/requests/ + motion/<beat_id>.<fmt>
pilot.json                                 (선택) 룩체크용 spine 구간
review-decisions-<ts>.json                 브라우저 다운로드 (append-only)
review.html
music-cues.json  sound-cues.json
qc-report.json  fix-list.json
```

**파일 하나를 여러 모듈이 덮어쓰지 않는다.** 사실·원고·타이밍·샷 선택이 서로 다른 파일에 있어 이전 단계의 판단이 보존된다.

## 3. 외부 경계

```text
pipeline ─┬─ faster-whisper   /usr/bin/python3 subprocess          T3
          ├─ ffmpeg 8.1.1     시스템. Remotion 번들 사용 금지        T3 · T5 · T7
          ├─ yt-dlp 2026.07   subprocess                            T7
          ├─ Playwright       page 어댑터                            T7
          ├─ capcut-cli       subprocess (경로 A)                    T5
          └─ npx hyperframes@<핀>                                    T8
                └─ ~/ai-slide-video-factory  (템플릿 모션 폴백만)
```

**factory 코드를 `import` 하지 않는다.** 6개 모듈은 복사 이식([PORTING.md](./PORTING.md)). 런타임 의존은 hyperframes 템플릿 폴백 한 곳뿐이고 그것도 파일 경로로만 연결한다.

### CLI 규약

```text
pipeline <command> --project <dir> [--only …] [--pilot pilot.json] [--force] [--dry-run] [--human] [--eval]
```
- stdout은 **JSON 한 덩어리**. 사람용 표는 `--human`일 때만
- 진행 로그는 **stderr**. stdout을 오염시키면 파이프가 깨진다
- 종료 코드 `0` 성공 / `1` 품질·처리 실패 / `2` 입력 오류
- 원자적 쓰기: 임시 파일 → `rename`
- 외부 프로세스는 `shell: true` 금지(인자 배열), 타임아웃 필수(`harvest.timeout_sec`)
- API 키는 `.env`에서만. 로그·산출물·HTML·매니페스트에 절대 기록 금지

## 4. 데이터 흐름

```text
script.md + script-map.json                  사람 — 원고 잠금 + sentence_key + 세션 정의
config/frame.md + edit-profile.json          사람 — 시각 파라미터 1회 세팅(디자인 파일 + 기본값)
   ↓
sources/catalog.json + transcripts/          [AI] 소스 수급 — 영상 우선, 자막 확보가 목적(영상 안 받음)
research/evidence.json                            사진은 핵심 강조 비트에만
   ↓ (녹음과 병행 가능)
audio/raw/session-*.wav                      사람 — 세션 분할·무재테이크 녹음
   ↓ [CODE: align]  테이크 선택 없음 — 공백 정리 + 세션 접합 + 연속 마스터
narration-master.wav · words.json · captions.srt · timeline.json · align-remap.json
   ↓
beat-plan.json                               [AI] 비트 분할 + 샷 요구사항 (사진 parallax 기본)
   ↓ [CODE: plan --apply]  → shot-plan.json (Z1, need)
   ↓ [CODE: validate]
candidates/ + proxy                          [AI] 구간 검색 → 후보 → 프록시 (전 비트, 저화질)
motion/<beat_id>.<fmt>                       [AI] critical 비트만 hyperframes 저작
   ↓
★ 스토리보드 (review.html)                    [CODE: review] 타이밍 부착 · 모든 소스+사진모션+모션
   ↓ 사장님 반복 피드백 (승인 ②) ─ 확정될 때까지 루프
review-decisions-*.json                      사람 — 선택·사진모션·편집 결정 (브라우저)
   ↓ [CODE: review --apply] → shot-plan.json (Z2, approved) + usage.json
assets/selected/manifest.json                [CODE: harvest 3단계] 승인 구간만 고화질
   ↓ [CODE: assemble]  사진 = parallax / 켄번즈 렌더
CapCut 초안 / 순번 파일 세트 + music-cues.json + sound-cues.json
   ↓ [CODE: qc]
qc-report.json + fix-list.json
   ↓
사람 마감 → 4회 시청 → 발행 (승인 ③)
```

## 5. 제작 워크플로우 10단계 (사람이 따라가는 순서)

담당 — **[나]** 사람 · **[AI]** 에이전트 · **[C]** 코드

| # | 단계 | 담당 | 시간 | 승인 |
|---|---|---|---|---|
| 1 | 원고 잠금(`sentence_key`·세션 정의) + **시각 파라미터 세팅** | 나 | 30분 | **①** |
| 2 | 소스 수급 — 영상 우선, 자막·메타 전량 (사진 핵심 강조만) | AI | 90분 | — |
| 3 | 세션 분할·무재테이크 녹음 → `pipeline align` | 나 + C | 30분 | — |
| 4 | 의미 비트 분할 → `plan --apply` → `validate` | AI + C | 40분 | — |
| 5 | 편집 수급 (구간 검색 + 프록시 + 모션 + 사진 parallax) | AI | 90분 | — |
| 6 | **스토리보드** (`review.html`, 타이밍 부착) — 반복 피드백 | 나 + C | 60분 | **② ★ 핵심** |
| 7 | 승인 반영 → `review --apply` + 승인 구간 고화질 수급 | C | 20분 | — |
| 8 | `pipeline assemble` (사진 촬영모션 렌더) | C | 5분 | — |
| 9 | 편집 패스 5종 (의미→리듬→자막→사운드→근거) | 나 | 60분 | — |
| 10 | `pipeline qc` → 4회 시청 → P0 0개 → 발행 | 나 + C | 35분 | **③** |

합계 약 **4시간 20분** (첫 편은 더 걸린다). 2·3은 병행 가능.

### 핵심 설계 결정 3개

1. **수급이 두 번 일어난다.** [2]는 *자막 확보*가 목적(영상 안 받음), [5]는 *프록시 후보 확정*이 목적, 고화질은 [7]에서 승인분만. 원고만으로 "화면이 있는가"를 알 수 있고 디스크는 승인분만 쓴다.
2. **스토리보드([6])가 게이트인 이유.** 전체 고화질 수급([7])과 조립([8]) 전에, 타이밍이 붙은 스토리보드에서 모든 소스·사진모션·편집을 확정한다. 300개 샷을 붙인 뒤 되돌리는 일을 막는다 — 창작 결정이 가장 싼 지점에 모인다.
3. **align이 씬 파일을 만들지 않는다.** 무재테이크라 테이크 선택도 없다. A1 트랙은 언제나 하나의 연속 마스터. 분할 WAV는 미리듣기용.

## 6. 조립 트랙 (10개)

| 트랙 | 내용 |
|---|---|
| V1 | 메인 B-roll · 공식 영상 · 인터뷰 |
| V2 | 진행자 A-roll · 합성 |
| V3 | 모션 · 사진 촬영모션(parallax/켄번즈) · 문서 강조 · 제품 오버레이 |
| V4 | 기본 자막 |
| V5 | 강조 키워드 · 전체 화면 caption card |
| V6 | 출처 표기 |
| A1 | **연속 내레이션 마스터** |
| A2 | 선택한 원본음 |
| A3 | BGM (비워 둠 — 곡 선택은 사람) |
| A4 | 효과음 · 앰비언스 |

중요한 것은 트랙 개수가 아니라 **역할 분리**다. (brandboy `TASKS.md:83`의 "9개 트랙"은 오기 — `spec/07-assemble.md:14-25`가 10개다. T10이 정정)

## 7. 승인 지점 (3개)

과거 G0~G5 게이트는 아래 3개 승인으로 흡수됐다. 캘리브레이션·60초 파일럿(구 G3)은 제거.

| 승인 | 시점 | 통과 조건 |
|---|---|---|
| **① 원고 + 시각 파라미터** | 원고 잠금 | 첫 15초에 질문·역설·결과 / 첫 30초에 클릭 약속 회수 / `build`·`reveal` 구분 / 마지막 문장이 한 줄로 (구 G2). **시각 파라미터**(`frame.md` + 기본값) 1회 확정 |
| **② 스토리보드 ★** | 전체 고화질 수급·조립 전 | 핵심 주장마다 검증 자료 + 원본 타임코드 + 반론(구 G1) · 공식영상·제품·인물 화면 충분(구 G0) · 샷이 문장과 맞고 반복 없음(구 G4) · 사진마다 촬영모션 확정. **사장님 반복 피드백으로 확정** |
| **③ 최종 마감** | 발행 | P0 사실·권리·논지 오류 0개 · 4회 시청(모바일+스피커/이어폰) · 출처 자료표 완성 (구 G5) |
