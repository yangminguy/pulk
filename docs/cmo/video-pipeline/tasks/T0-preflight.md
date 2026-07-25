# T0 — 사전 검증 (T0a 도구 · T0b 검색품질 · 시각 파라미터 세팅)

> **하나라도 미판정이면 해당 후속 태스크 착수 금지.** 여기서 정해지는 경로가 T3·T4·T5·T7·T8의 설계 절반을 좌우한다.
> 산출물: `~/brandboy-pipeline/preflight-report.md`

---

## 레포 부트스트랩 (T0a 착수 직전 1회)

```bash
cp -R ~/Downloads/brandboy-pipeline ~/brandboy-pipeline
cd ~/brandboy-pipeline
npm init -y
npm i -D typescript tsx @types/node
npm i zod
node -v          # >= 22 확인 (hyperframes 요구)
mkdir -p src/{lib,schema,commands,align,assemble,harvest/adapters,motion,review} \
         eval scripts fixtures projects
git init && git add -A && git commit -m "chore: bootstrap from brandboy-pipeline docs"
```

### factory WIP 정리 (병행)

```bash
cd ~/ai-slide-video-factory
git status --short
git add -A && git commit -m "wip: cmo-video-upgrade 진행분"
```

`git stash` · `git reset` 금지. 이식 대상 M1·M2·M4·M5 4파일은 실측상 clean이므로 안전하다.

---

## T0a — 도구 사전검증 (4~6시간)

### P1 — Whisper 단어 타임스탬프 ★ 가장 중요

`align` 전체와 비트 타임라인이 여기 의존한다.

```bash
# 한국어 실녹음 30초를 sample.wav로 준비
/usr/bin/python3 - <<'PY'
from faster_whisper import WhisperModel
m = WhisperModel("medium", device="cpu", compute_type="int8")
segs, info = m.transcribe("sample.wav", language="ko", word_timestamps=True)
for s in segs:
    print(s.start, s.end, s.text)
    for w in (s.words or []):
        print("   WORD", w.word, w.start, w.end)
PY
```

| 결과 | 경로 |
|---|---|
| 단어별 `start`/`end` 존재 | **경로 A** — 계획대로 |
| 문장 단위만 | **경로 B** — 비트 시각을 문장 안에서 글자 수 비례로 추정. `align-report.json`에 `"word_timing": "estimated"` 기록. `caption_card` 싱크만 CapCut에서 수동 보정. **정밀도만 떨어지고 구조는 유지** |

### P1b — 유사도 분포

같은 30초 녹음의 원고 vs 전사를 문장별로 비교해 similarity 히스토그램을 만든다. 이 값으로 `edit-profile.json`의 `align.similarity_threshold`(기본 0.75)를 조정한다.

```
similarity = 1 - levenshtein(normalize(a), normalize(b)) / max(len(a), len(b))
normalize: 구두점 제거 + 공백 전량 제거 + 소문자화
```

> **공백 전량 제거가 중요하다.** 한국어 ASR은 띄어쓰기를 자주 틀리는데 이건 내용 오류가 아니다.

### P2 — CapCut 초안이 맥에서 열리는가

```bash
npm i -g capcut-cli
capcut doctor
capcut quickstart smoke --video sample.mp4
```

CapCut을 껐다 켜고 `smoke` 초안이 목록에 보이는지, 열리는지 확인한다.

| 결과 | 경로 |
|---|---|
| 열림 | **경로 A** — `assemble`이 CapCut 초안 직접 생성 |
| 안 열림 | **경로 C** — `0001_sh0042.mp4` 순번 파일 세트 + SRT + 큐 파일 + `ASSEMBLY.md`. 마감 +20분, 구조 유지 |

### P2b — CapCut 계약 전문 기록

- `capcut --help` 및 **각 서브커맨드의 `--help` 전문**
- CapCut 전역 설정 → 초안 위치 경로 (`~/Movies/CapCut` 예상)
- **세그먼트 복제 명령의 동작** (`caption_card` 배경 처리에 사용)
- **텍스트 스타일 프리셋 생성·적용 방법**
- **SRT 임포트 시 스타일 적용 방식** (`spec/00-preflight.md:54`) — 경로 C의 자막 품질에 직결

### P2c — hyperframes 계약 확인

```bash
npx hyperframes --help
npx hyperframes lint --help
npx hyperframes inspect --help
npx hyperframes render --help
npx hyperframes --version
```

**확인할 것**: `lint`·`inspect`·`--non-interactive`가 실재하는가, 알파 출력 형식(`.mov`/webm)을 지원하는가.

factory의 실제 호출은 `hyperframes-runner/render.ts:71`의 `["--yes","hyperframes@latest","render","--output",outAbs]`로 **lint·inspect·`--non-interactive`가 없고 `.mp4`(알파 불가)이며 버전이 안 고정돼 있다.** CLI에는 있으나 factory 러너가 안 쓰고 있을 가능성이 높다.

**버전을 확정해 `package.json`에 고정한다.** `@latest` 금지.

### P3 — 알파 영상을 CapCut이 읽는가

hyperframes로 5초짜리 투명 배경 그래픽을 렌더해 CapCut 오버레이 트랙에 얹는다.

| 결과 | 경로 |
|---|---|
| 알파 인식 (ProRes 4444 또는 알파 WebM) | **경로 A** — 오버레이 트랙(V3) 사용 |
| 검은 배경 딸려옴 | **경로 D** — `frame.md`의 단색 배경을 넣어 렌더하고 메인 트랙에 배치. 화면을 채우지만 품질 손실 없음 |

### P4 — ffmpeg 필터

```bash
ffmpeg -filters | grep -E 'aselect|silencedetect|acrossfade|loudnorm|astats'
```

`aselect` · `silencedetect` · `acrossfade` **셋 다 있어야** T3 진행. 빌드에 따라 없을 수 있다.

### P6 — 브라우저 저장·재생 (T4 착수 조건)

`spec/05-review.md:193`이 명시적으로 요구한 확인이다.

```bash
# 테스트용 HTML을 file://로 열어 확인
```

**확인할 것**
1. `file://`에서 `<video src="clip.mp4#t=12.4,18.9">`가 **지정 구간으로 재생**되는가 — Chrome · Safari 각각
2. 결정 JSON을 **다운로드로 저장**할 수 있는가 (Blob + `<a download>`)

> File System Access API(`showSaveFilePicker`)는 `file://`이 opaque origin(`null`)이라 SecurityError를 던지고 Safari는 미지원이다. **다운로드 방식만 검증하면 된다.**

| 결과 | 경로 |
|---|---|
| 둘 다 OK | 정적 HTML 유지 |
| 실패 | **`review --watch`** 로컬 서버 (`spec/05-review.md:126`이 원래 권장 1순위) |

### T0a 완료 조건

- [ ] `preflight-report.md`에 아래 표가 채워짐

```markdown
| 항목 | 결과 | 선택 경로 | 비고 |
|---|---|---|---|
| P1 whisper 단어 시각 | O/X | A/B | 유사도 분포: |
| P1b similarity_threshold | — | — | 확정값: |
| P2 CapCut 초안 열림 | O/X | A/C | CLI 버전: |
| P2b CapCut 계약 | — | — | 전문 첨부 |
| P2c hyperframes 계약 | O/X | — | 버전 핀: · lint/inspect 유무: |
| P3 알파 렌더 인식 | O/X | A/D | 형식: |
| P4 ffmpeg 필터 | O/X | — | 누락: |
| P6 브라우저 재생·저장 | O/X | 정적/watch | Chrome: · Safari: |
```

- [ ] `~/brandboy-pipeline` 레포가 생성되고 첫 커밋이 있음
- [ ] factory WIP 커밋 완료

---

## T0b — 검색 품질 게이트 `hit@5` (반나절~1일, T1·T2와 병행)

### 왜 이게 T0인가

파이프라인 가치를 지탱하는 명제는 하나다 — `IMPLEMENTATION.md:21` *"긴 원본을 배제하지 않는다. **자막으로 필요한 구간을 찾는다**"*. 그리고 **이 가정에는 폴백이 없다.** 실패하면 `critical` 비트가 `blocked`로 쌓이고 사람이 90분 원본을 손으로 훑는다 — 자동화가 하려던 일 전부가 되돌아온다.

capcut·whisper·알파는 실패해도 경로 C/B/D가 있다. 이건 없다.

### 지표 정의

```
hit@5 = (상위 5개 후보 중 판정자가 "쓸 만함"으로 표시한 것이 1개 이상인 검색의도 수) / 10
```

> **`recall@5`가 아니다.** recall은 분모(전체 정답 구간 수)를 알아야 하고, 5~10편 자막 전체의 정답 집합을 만드는 작업은 T0b 예산에 들어갈 수 없다. `hit@5`는 상위 5개만 보면 계산된다.

### 절차

1. **참조 브랜드**(첫 편 대상)로 소스 5~10편 자막 수집 (90분급 1편 이상 포함). yt-dlp 자막만, 영상 안 받음
2. 손으로 검색의도 **10건** 작성 (critical급 3건 포함). 예: `"창업자가 가격 결정 이유를 말하는 장면"`
3. 프로토타입 인메모리 인덱스로 각 의도의 상위 5개 구간 추출
4. **판정자(사장님 1인)** 가 각 후보를 "쓸 만함/아님"으로 표시
5. `eval/search-hit5.json`에 의도·후보·판정을 함께 저장해 재현 가능하게 함

### 홀드아웃

**10건 중 3건을 봉인한다.** T7 완료 판정 때 처음 공개한다. T7 구현자가 평가셋에 과적합하는 것을 막는다.

```json
{ "public": [ {…7건…} ], "holdout_sealed": "sha256:…" }
```

### 판정

| `hit@5` | 경로 |
|---|---|
| **≥ 0.7** | **Option A** — 어휘 인덱스 단독. `semantic_match: 35`는 코드가 부여, `score_source: "lexical"` |
| **0.4 ~ 0.6** | **Option A′** — 어휘 프리필터(상위 200) + 에이전트 리랭크(상위 8 선별 + `semantic_match` 부여). 결과는 `.cache/rerank-<sha256>.json`. `score_source: "agent_rerank"` |
| **≤ 0.3** | **T7 설계 재검토.** T7 착수 금지. T3·T4·T8은 무관하게 진행 |
| 경계값 (정확히 0.7 또는 0.4) | **보수적으로 A′** |

> n=10이면 1건 이동 = 0.1이다. 분산이 크므로 경계값은 보수적으로 판정한다.

### T0b 완료 조건

- [ ] `eval/search-hit5.json`에 10건(공개 7 + 홀드아웃 3 봉인)과 판정 결과가 저장됨
- [ ] `hit@5` 값과 선택 경로(A / A′ / 재검토)가 `preflight-report.md`에 기록됨
- [ ] 프로토타입 인덱스 코드가 남아 있음 — **T7 랭킹의 baseline이며 T7 완료조건이 이 점수를 밑돌면 회귀다**

---

## 시각 파라미터 세팅 (사람, T0a와 병행 — 캘리브레이션 대체)

기준 영상 실측(구 T0c 캘리브레이션)은 **제거**됐다. 대신 사장님이 전달한 **디자인 파일 `config/frame.md`**를 룩의 정본으로 쓰고, `frame.md`에 없는 정량 값만 brandboy `config/edit-profile.json` 기본값으로 채운다. 이후 그 데이터로 전 과정을 돌린다.

| `frame.md`이 정하는 것 (디자인 파일) | 기본값으로 채우는 것 (`edit-profile.json`) |
|---|---|
| 색(강조 노랑 `#FFD84D`·연두 `#B7F34A`·검정·흰색) · 폰트(Pretendard ExtraBold/Bold) · 기본 자막 52px · 키워드 강조 112% · 임팩트 카드 118px · 챕터/인물/출처 스타일 · 안전영역 | 컷 속도(`acts.*.shot_sec`) · 리듬(`rhythm`) · 비율(`ratios`) · 카드 개수(`counts_per_15min`) · 오디오 라우드니스 · 검색 가중치 |

### 완료 조건

- [ ] `config/edit-profile.json`에 `profile_rev: 1`, `config/frame.md`에 `frame_rev: 1` 설정
- [ ] `frame.md`(색·크기)와 `edit-profile.json`(정량 수치)이 충돌하지 않음 — 색·크기는 `frame.md` 우선
- [ ] `sources`(영상 우선·사진 상한)·`photo_motion`(parallax 기본) 블록이 채워짐 ([T2 §7](./T2-cli.md) 참조)

> **매 영상 재측정이 없다.** 브랜드보이 톤을 목표로 하는 한 이 값은 1회 세팅으로 고정한다. 시각 톤 미세 조정은 스토리보드(승인 ②)에서 사장님이 `edit-profile.json`을 고쳐 반영한다.
