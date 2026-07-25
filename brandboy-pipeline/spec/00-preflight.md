# SPEC 00 — 사전 검증

구현 전에 반드시 실행한다. 세 항목은 파이프라인의 절반이 딛고 선 가정이다.

각 항목에 **대안 경로가 준비돼 있으므로 실패해도 멈추지 않는다.** 확인하는 이유는 어느 경로로 갈지 지금 정하기 위해서다. 확인하지 않고 진행하면 T5쯤에서 발견하고 되돌아와야 한다.

---

## P1 — Whisper 단어 타임스탬프

### 확인

한국어 실제 녹음 30초로 실행한다.

```bash
whisper sample.wav --model medium --language ko \
        --word_timestamps True --output_format json
```

출력 JSON에 단어별 `word` / `start` / `end`가 있는지 본다.
`faster-whisper`, `whisper.cpp`, `stable-ts` 중 설치된 것으로 대체 가능하다. **단어 단위가 나오는지만 본다.**

### 함께 기록

원고 문장과 전사 결과의 유사도 분포. `edit-profile.json`의 `align.similarity_threshold`(기본 0.75)를 이 실측값으로 조정한다.

### 결과에 따른 경로

| 결과 | 경로 | 영향 |
|---|---|---|
| 단어 단위 O | **A** — 계획대로 | — |
| 문장 단위만 | **B** | 비트 시각을 문장 안에서 글자 수 비례로 추정. `caption_card`와 키워드 강조 싱크만 CapCut에서 수동 보정. 구조는 유지, 정밀도만 하락 |

---

## P2 — CapCut 초안이 맥에서 열리는가

### 확인

```bash
npm i -g capcut-cli
capcut doctor
capcut quickstart smoke --video sample.mp4
```

CapCut을 재시작하고 `smoke` 초안이 목록에 보이는지, 열리는지 확인한다.

### 함께 기록

- `capcut --help`와 각 서브커맨드 `--help` 전문
- CapCut `전역 설정 → 초안 위치` 경로
- **세그먼트 복제 명령의 동작** — 강조 카드 배경 처리에 사용
- 텍스트 스타일 프리셋 생성·적용 방법
- SRT 임포트 시 스타일 적용 방식

문서에 적힌 명령 이름은 추정이다. **실제 CLI 출력이 우선한다.**

### 결과에 따른 경로

| 결과 | 경로 | 영향 |
|---|---|---|
| 열림 | **A** — `assemble` 계획대로 | — |
| 안 열림 | **C** | 초안 생성 대신 **정렬된 파일 세트 출력**. `0001_sh0042.mp4` 형식 순번 파일을 만들어 CapCut에 통째로 드래그. 자막은 SRT 임포트. 마감 +20분, 구조 유지 |

---

## P3 — 알파 영상을 CapCut이 읽는가

### 확인

HyperFrames로 5초짜리 투명 배경 그래픽을 렌더해 CapCut 오버레이 트랙에 얹는다.
ProRes 4444와 알파 WebM 중 어느 쪽이 인식되는지 본다.

### 결과에 따른 경로

| 결과 | 경로 | 영향 |
|---|---|---|
| 알파 인식 | **A** — 오버레이 트랙(V3) 사용 | — |
| 검은 배경 딸려옴 | **D** | `frame.md`의 단색 배경을 넣어 렌더하고 메인 트랙 배치. 화면을 채우게 되지만 품질 손실 없음 |

---

## 산출물

`preflight-report.md`

```markdown
| 항목 | 결과 | 선택 경로 | 비고 |
|---|---|---|---|
| P1 Whisper 단어 타임스탬프 | O / X | A / B | 유사도 분포: |
| P2 CapCut 초안 열림 | O / X | A / C | CLI 버전: |
| P3 알파 렌더 인식 | O / X | A / D | 형식: |
```

이후 모든 spec이 이 결과를 참조한다. `spec/02-align.md`와 `spec/07-assemble.md`는 경로에 따라 구현이 달라진다.
