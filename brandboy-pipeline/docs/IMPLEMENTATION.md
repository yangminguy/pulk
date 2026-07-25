# IMPLEMENTATION — 아키텍처와 공통 규약

## 1. 성공의 정의

네 조건을 동시에 만족해야 한다.

1. 원고만 들어도 공감 → 정보 → 관점 → 결론이 선명하다
2. 중요한 명사·동사·숫자가 바뀔 때 화면도 정확하게 바뀐다
3. 사용한 모든 외부 화면은 원본과 사용 구간으로 역추적된다
4. 자막·진행자·원본음·음악이 하나의 리듬으로 움직인다

CapCut 초안이 열리거나 빈 화면이 없다는 것은 완료 조건이 아니다.

---

## 2. 품질 원칙

- 자동화가 실패하더라도 관련 없는 화면을 넣지 않는다
- 핵심 화면이 없으면 조사나 원고 단계로 돌아간다
- 공식 원본·인터뷰·광고·제품·공장·공시를 스톡보다 우선한다
- 긴 원본을 배제하지 않는다. 자막으로 필요한 구간을 찾는다
- 출처 표기는 사용 허가와 다르므로 권리 판단은 별도 상태로 보존한다
- **`critical` 비트는 맞는 화면이 나올 때까지 찾는다.** 후보 개수 상한을 두지 않는다
- 최종 컷은 사람이 실제 속도로 보고 승인한다

### 상한을 두지 않는다는 규칙의 구현

"시간 상한 없음"은 코드로 옮길 수 없다. 다음과 같이 구현한다.

| 중요도 | 자동 탐색 | 소진 후 |
|---|---|---|
| `critical` | 검색군 전체 순회 후에도 미달이면 **중단하고 사람에게 보고** | 사람이 추가 조사·원고 수정·직접 제작 중 결정 |
| `normal` | 검색군 순회 1회 | 미달 상태로 검수에 올림 |
| `bridge` | 우선순위 상위 2개 소스만 | 미달이면 그대로 진행 |

**`critical` 비트를 자동으로 강등하거나 숨기지 않는다.** 파이프라인이 멈추고 사람이 결정한다.

---

## 3. 역할 분담

### 코드 (4개)

영상이 바뀌어도 동일한 작업. 결정론적이어야 하는 것.

| 명령 | spec | 하는 일 |
|---|---|---|
| `pipeline validate` | 01 | 스키마 + 치명 오류 12종 + 품질 경고 13종 |
| `pipeline align` | 02 | 통녹음 → 재테이크 제거 → 연속 마스터 + 단어 시각 + 자막 |
| `pipeline review` | 05 | 후보 → 검수 HTML → `shot-plan.json` 갱신 |
| `pipeline assemble` | 07 | 샷 플랜 → CapCut 초안 + 큐 파일 |
| `pipeline qc` | 08 | 정량 리포트 + 수정 목록 |

### 에이전트

브랜드마다 달라지는 탐색과 판단. CLI로 굳히면 예외 처리만 늘어난다.

| 작업 | spec | 프롬프트 |
|---|---|---|
| 원본 조사·카탈로그·자막 확보 | 04 | `prompts/harvest-sources.md` |
| 비트 분할·샷 요구사항 생성 | 03 | `prompts/plan-beats.md` |
| 구간 검색·후보 수집 | 04 | `prompts/harvest-sources.md` |
| 모션그래픽 제작 | 06 | `prompts/motion-scene.md` |

**에이전트 산출물은 전부 `pipeline validate`를 통과해야 한다.** 이게 품질 게이트다.

### 사람 — 승인 3지점

- 원고 작성과 잠금 + 시각 파라미터 세팅 (**승인 ①**)
- 내레이션 녹음, A-roll 촬영
- **스토리보드 반복 검수 · 화면 선택과 인·아웃 확정 (승인 ②)**
- 마감과 4회 시청 (**승인 ③**)

---

## 4. 데이터 구조

```text
막 act
  └─ 세그먼트 segment      30~90초. 하나의 질문 또는 주장
       └─ 의미 비트 beat   1.5~5초. 의미가 바뀌는 최소 단위
            └─ 샷 shot     타임라인에 실제로 놓이는 것
```

한 비트에 샷이 1~2개 들어갈 수 있고, 한 샷이 인접 비트 두 개를 덮을 수도 있다.

전체 타입 정의는 `schema/pipeline.ts`에 있다.

---

## 5. 데이터 흐름

```text
brief.md                       사람
   ↓
sources/catalog.json           에이전트 — 원고 전에 원본 저장소 구축
sources/transcripts/           (자막 확보가 핵심)
research/evidence.json
   ↓
script.md + script-map.json    사람 — 원고 잠금
   ↓
audio/raw/narration.wav        사람 — 연속 녹음
   ↓ [ CODE: align ]
audio/narration-master.wav
audio/words.json
audio/captions.srt
timeline.json
   ↓
beat-plan.json → shot-plan.json (need) Z1   plan 에이전트 → plan --apply 병합
   ↓
candidates/<beat_id>/          harvest 에이전트 — 구간 검색·후보 수집
review-decisions-*.json        검수 브라우저 — 결정 로그 (append-only)
   ↓ [ CODE: review --apply ]
shot-plan.json (approved) Z2   review --apply — 검수 결정 병합
sources/usage.json             review --apply — 승인 구간의 사용 출처 (assemble이 읽어 출처 생성)
assets/selected/manifest.json  harvest 3단계 — 승인분 고화질
   ↓
motion/*.mov                   에이전트 — 모션그래픽
   ↓ [ CODE: assemble ]
CapCut 초안 + music-cues.json + sound-cues.json
   ↓ [ CODE: qc ]
qc-report.json + fix-list.json
   ↓
사람 마감 → 4회 시청 → 발행
```

**파일 하나를 여러 모듈이 덮어쓰지 않는다.** 사실·원고·타이밍·샷 선택이 서로 다른 파일에 있어 이전 단계의 판단이 보존된다.

---

## 6. 프로젝트 구조

```text
project/
├── brief.md
├── script.md
├── script-map.json
├── frame.md                    ← config/frame.md 복사
├── edit-profile.json           ← config/edit-profile.json 복사 후 실측값 반영
├── research/
│   ├── questions.json
│   └── evidence.json
├── sources/
│   ├── catalog.json
│   ├── usage.json
│   ├── transcripts/            원본별 자막 — 구간 검색의 핵심
│   ├── previews/
│   ├── originals/              프로젝트 종료까지 보존
│   └── page-captures/
├── audio/
│   ├── raw/narration.wav
│   ├── narration-master.wav
│   ├── words.json
│   └── captions.srt
├── timeline.json
├── shot-plan.json              비트 + 샷. 검수가 직접 갱신
├── candidates/<beat_id>/
├── assets/selected/
├── motion/
├── pilot/
├── music-cues.json
├── sound-cues.json
├── review.html
├── qc-report.json
└── fix-list.json
```

---

## 7. 공통 구현 규약

**모든 모듈이 지킨다. 코딩 태스크마다 이 절을 함께 넘긴다.**

### 7.1 CLI

```text
pipeline <command> --project <dir> [--only b012,b013] [--force] [--dry-run] [--human]
```

- stdout은 **JSON 한 덩어리**. 사람용 표는 `--human`일 때만
- 진행 로그는 **stderr**. stdout을 오염시키면 파이프가 깨진다
- 종료 코드 `0` 성공 / `1` 품질 또는 처리 실패 / `2` 입력 오류

### 7.2 수치

**하드코딩 금지.** 전부 `edit-profile.json`에서 읽는다. 프로젝트에 파일이 없으면 `config/`의 것을 복사하고 경고한다.

### 7.3 멱등성

- 산출물이 있으면 건너뛰고 `skipped`로 보고
- `--force`가 있을 때만 재생성
- `--only`로 특정 비트·샷만 재처리
- **`locked_selection: true` 인 샷과 사람이 조정한 인·아웃은 `--force` 없이 덮어쓰지 않는다**

### 7.4 부분 실패

한 비트가 실패해도 전체를 중단하지 않는다. 단 **`critical` 비트 실패는 예외** — 중단하고 보고한다.

```json
{
  "ok": true,
  "processed": 214,
  "skipped": 12,
  "failed": [
    { "beat_id": "b088", "importance": "normal", "reason": "no candidate above threshold" }
  ],
  "blocked": [
    { "beat_id": "b042", "importance": "critical", "reason": "no evidence-grade candidate", "action_required": true }
  ]
}
```

`blocked`가 비어 있지 않으면 종료 코드 `1`.

### 7.5 파일 쓰기

임시 파일에 쓰고 `rename`으로 교체. 중간에 죽어도 기존 파일이 남아야 한다.

### 7.6 외부 프로세스

- `shell: true` 금지. 인자를 배열로 넘긴다 (파일명 공백·특수문자가 실제로 자주 나온다)
- 타임아웃 필수 (`edit-profile.json`의 `harvest.timeout_sec`). `yt-dlp`와 `ffmpeg`은 매달릴 수 있다

### 7.7 캐시

`.cache/<sha256(source+query)>.json`, TTL은 `harvest.cache_ttl_days`.

**캐시가 없으면 특정 비트만 재수집할 때 API를 다시 부른다.** 검수 → 재수집 루프가 파이프라인의 기본 동작이므로 필수다.

### 7.8 비밀값

API 키는 `.env`에서만 읽는다. 로그와 산출물에 기록하지 않는다.

---

## 8. 승인 게이트

사장님 승인은 3지점이다 — **① 원고 잠금 + 시각 파라미터(G2)** · **② 스토리보드 ★** · **③ 최종 마감·발행(G5)**. G0·G1·G4는 진행 체크포인트다.

### G0 — 시각 자료 가능성 (제작 전)

- 공식 영상·제품·인물 화면이 충분한가
- 전후 변화와 핵심 결과를 보여줄 수 있는가
- 부족분을 자체 촬영·화면 녹화·그래픽으로 해결할 수 있는가

부족하면 브랜드를 바꾸거나 각도를 수정한다.

### G1 — 근거

- 핵심 주장마다 1차 또는 독립 검증 자료가 있다
- 인용과 숫자의 정확한 위치(원본 타임코드)가 있다
- 반론과 작동 조건을 확인했다

### G2 — 원고 잠금

- 첫 15초에 질문·역설·결과가 있다
- 첫 30초에 클릭 약속을 회수한다
- `build`와 `reveal`이 구분된다
- 사실·타인 주장·자체 해석이 표시돼 있다
- 마지막 문장이 한 줄로 떨어진다

### 스토리보드 — 승인 ② ★

전체 조립 전에 **스토리보드**에서 방향을 확정한다. 스토리보드는 전 비트를 프록시(720p)로 덮고 타이밍이 부착된 검수 HTML이다(`review`가 생성). 구 60초 파일럿 게이트는 rev5에서 제거됐다 — 게이트는 스토리보드다.

사장님이 **모든 구간을 실제 재생으로** 보고 반복 승인한다.

**승인 항목** — 말맛, 컷 속도, 자막 크기, 강조 색, 진행자 합성, 음악 에너지, 출처 가독성

승인된 샷만 고화질로 수급한다(화질 2단). `--pilot`은 선택적 첫 구간(spine) 룩체크이며 게이트가 아니다.

> 이 게이트가 재작업을 막는 가장 큰 장치다. 전체를 조립한 뒤 자막 크기를 고치면 300개 이상의 샷을 다시 손대야 한다.

### G4 — 러프컷

- 샷이 문장과 맞는다
- 같은 원본·같은 화면 크기가 반복되지 않는다
- 자막이 말맛과 맞는다
- 원본음이 내레이션을 방해하지 않는다

### G5 — 발행

- P0 사실·권리·논지 오류 0개
- 모바일과 스피커·이어폰에서 모두 확인
- 출처 및 화면 자료표 완성
