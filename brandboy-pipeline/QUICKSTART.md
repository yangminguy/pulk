# QUICKSTART

**구현을 시작하기 전에 이 문서의 세 가지를 반드시 확인한다.** 각각 30분이면 판명되고, 결과에 따라 두 모듈의 설계가 달라진다.

에이전트에게 이렇게 지시한다.

```
spec/00-preflight.md를 읽고 P1, P2, P3를 순서대로 실행해라.
각 결과를 preflight-report.md에 기록해라.
하나라도 실패하면 해당 항목의 대안 경로를 확인하고,
어느 경로로 갈지 판단할 근거를 정리해서 보고해라.
구현은 시작하지 마라.
```

---

## P1 — Whisper 단어 타임스탬프

**가장 중요하다.** `align` 전체와 비트 타임라인이 여기 의존한다.

```bash
whisper sample.wav --model medium --language ko \
        --word_timestamps True --output_format json
```

**확인할 것** — 출력 JSON에 단어별 `word` / `start` / `end`가 있는가.

| 결과 | 경로 |
|---|---|
| 단어 단위 O | 계획대로 진행 |
| 문장 단위만 | **경로 B** — 비트 시각을 문장 안에서 글자 수 비례로 추정. `caption_card` 싱크만 CapCut에서 수동 보정. 정밀도만 떨어지고 구조는 유지 |

한국어 실제 녹음 30초로 테스트하고, **문장별 유사도 분포를 함께 기록한다.** `config/edit-profile.json`의 `align.similarity_threshold`(기본 0.75)를 이 값으로 조정한다.

---

## P2 — CapCut 초안이 맥에서 열리는가

```bash
npm i -g capcut-cli
capcut doctor
capcut quickstart smoke --video sample.mp4
```

CapCut을 껐다 켜고 `smoke` 초안이 목록에 보이는지, 열리는지 확인한다.

**함께 확인할 것**
- `capcut --help`와 각 서브커맨드의 `--help` 전문을 기록
- CapCut `전역 설정 → 초안 위치` 경로
- 세그먼트 복제 명령의 동작 (`caption_card` 배경 처리에 사용)
- 텍스트 스타일 프리셋 생성·적용 방법

| 결과 | 경로 |
|---|---|
| 열림 | `assemble`을 계획대로 구현 |
| 안 열림 | **경로 C** — 초안 생성 대신 **정렬된 파일 세트 출력**. `0001_sh0042.mp4` 형식으로 순번을 박아 내보내고 CapCut에 통째로 드래그. 자막은 SRT 임포트. 마감 시간 +20분, 구조는 유지 |

---

## P3 — 알파 영상을 CapCut이 읽는가

HyperFrames로 5초짜리 투명 배경 그래픽을 렌더해 CapCut 오버레이 트랙에 얹는다.

**확인할 것** — ProRes 4444 / 알파 WebM 중 어느 쪽이 인식되는가.

| 결과 | 경로 |
|---|---|
| 알파 인식 | 오버레이 트랙(V3) 사용 |
| 검은 배경 딸려옴 | **경로 D** — `frame.md`의 단색 배경을 넣어 렌더하고 메인 트랙에 배치. 그래픽이 화면을 채우게 되지만 품질 손실 없음 |

---

## 결과 기록

`preflight-report.md`에 이 표를 채워서 남긴다. 이후 모든 spec이 이 결과를 참조한다.

```markdown
| 항목 | 결과 | 선택 경로 | 비고 |
|---|---|---|---|
| P1 Whisper 단어 타임스탬프 | O / X | A / B | 유사도 분포: |
| P2 CapCut 초안 열림 | O / X | A / C | CLI 버전: |
| P3 알파 렌더 인식 | O / X | A / D | 형식: |
```

---

## 그다음

`TASKS.md`의 T1부터 순서대로 진행한다.
