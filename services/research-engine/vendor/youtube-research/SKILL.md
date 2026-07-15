---
name: youtube-research
description: YouTube 심층 리서치용 데이터 수집 스킬. 영상 검색, 조회수·좋아요·댓글·길이·채널 국가/구독자 분석, 수동/자동 자막 전체 추출, 타임스탬프 세그먼트와 분석 청크 생성, 자막 없는 영상 자동 건너뛰기, URL 단위 인제스트를 지원한다. 한국·미국 영상 비교, 콘텐츠 벤치마킹, 이론 합성, 출처 기반 보고서, 세컨드브레인 원문 저장에 사용한다.
---

# youtube-research — Deep Research Edition

YouTube Data API v3와 `yt-dlp`를 이용해 유튜브 영상을 **검색하는 데서 끝나지 않고, 전체 자막을 타임스탬프와 함께 확보해 심층 분석할 수 있도록 하는 스킬**이다.

- 스크립트: `~/.claude/skills/youtube-research/youtube.mjs`
- 런타임: Node.js 18+
- 자막 추출: `yt-dlp` 필수
- 반환 형식: stdout JSON
- 오류: stderr + non-zero exit
- 자격증명: `$YOUTUBE_API_KEY` → 상위 경로의 `services/youtube/.credentials.json`

## 핵심 원칙

1. **자막이 없는 영상은 분석 대상에서 제외한다.** Whisper·ASR fallback은 사용하지 않는다.
2. **자막은 글자 수 제한 없이 전체를 가져온다.** 12,000자 또는 15,000자를 넘더라도 절대 잘라내지 않는다.
3. **모든 자막 문장에 영상 타임스탬프와 딥링크를 보존한다.**
4. **긴 자막은 삭제하거나 요약하지 않고 분석용 청크로 나눈다.** 원문 `text`, `segments`, `chunks`를 모두 유지한다.
5. **자막 확보 여부를 확인하기 전에는 영상 내용을 분석했다고 표현하지 않는다.**
6. **15개 영상 분석이 목표라면 15개만 검색하지 않는다.** 자막 없는 영상과 중복 영상을 고려해 최소 25~40개의 우선 후보를 확보한 뒤, 자막이 있는 최종 15개를 선정한다.

## 설치 요구사항

```bash
brew install yt-dlp        # macOS
pipx install yt-dlp        # 기타 환경
```

`yt-dlp`가 없으면 자막 명령은 실패하지 않고 다음처럼 명확히 반환한다.

```json
{
  "videoId": "...",
  "available": false,
  "skipped": true,
  "note": "yt-dlp not installed ..."
}
```

## 커맨드

### search — 영상 후보 검색

```bash
node ~/.claude/skills/youtube-research/youtube.mjs search "인스타그램 콘텐츠 전략" \
  --max=25 --order=relevance --region=KR --lang=ko --published-after=2025-01-01
```

반환 필드:

```text
videoId, title, channelTitle, channelId, publishedAt,
description, thumbnail, liveBroadcastContent
```

권장 사용법:

- 동일 주제를 `relevance`, `viewCount`, `date` 기준으로 각각 검색한다.
- 한국 검색어와 영어 검색어를 별도로 사용한다.
- `regionCode`는 영상 제작 국가를 의미하지 않으므로 채널 국가와 언어를 추가 확인한다.

### stats — 영상 통계 및 자막 가능성 확인

```bash
node ~/.claude/skills/youtube-research/youtube.mjs stats "id1,id2,id3"
```

주요 반환 필드:

```text
viewCount, likeCount, commentCount, durationSeconds, isShort,
captionsAvailable, defaultLanguage, defaultAudioLanguage, tags
```

`captionsAvailable`는 YouTube API 메타데이터이며, 실제 자막 추출 가능 여부는 `transcript` 명령으로 최종 확인한다.

### transcript — 영상 1개의 전체 자막 추출

```bash
node ~/.claude/skills/youtube-research/youtube.mjs transcript "URL 또는 videoId" \
  --lang=ko,en --chunk-chars=8000
```

반환 구조:

```json
{
  "videoId": "...",
  "available": true,
  "text": "전체 자막 원문 — 절대 잘리지 않음",
  "segments": [
    {
      "index": 0,
      "startSeconds": 314.2,
      "endSeconds": 319.8,
      "startTimestamp": "00:05:14",
      "endTimestamp": "00:05:19",
      "text": "해당 구간 발화",
      "sourceUrl": "https://www.youtube.com/watch?v=...&t=314s"
    }
  ],
  "chunks": [
    {
      "index": 0,
      "segmentStartIndex": 0,
      "segmentEndIndex": 82,
      "startTimestamp": "00:00:00",
      "endTimestamp": "00:06:42",
      "text": "분석용 청크",
      "charCount": 7920,
      "sourceUrl": "https://www.youtube.com/watch?v=...&t=0s"
    }
  ],
  "languageCode": "ko",
  "source": "manual",
  "provenance": {
    "provider": "yt-dlp",
    "captionType": "manual",
    "captionFile": "...",
    "fetchedAt": "..."
  },
  "charCount": 48291,
  "wordCount": 10482,
  "segmentCount": 973,
  "chunkCount": 7,
  "sha256": "...",
  "truncated": false
}
```

자막 우선순위:

1. 수동 자막
2. 자동 생성 자막
3. 둘 다 없으면 `available:false`, `skipped:true`

`--chunk-chars`는 원문 제한이 아니라 **분석 청크의 목표 크기**다. 청크는 세그먼트 경계를 유지하므로 정확히 같은 글자 수로 나뉘지는 않는다.

기존 `--max-chars` 옵션이 전달되더라도 더 이상 자막을 자르지 않으며, 청크 크기 별칭으로만 처리된다.

### transcripts — 여러 영상의 전체 자막 일괄 수집

```bash
node ~/.claude/skills/youtube-research/youtube.mjs transcripts "id1,id2,id3" \
  --lang=ko,en --chunk-chars=8000
```

자막 있는 영상만 `transcripts`에 포함하고, 자막 없는 영상은 `skipped`에 기록한다.

```json
{
  "requestedCount": 3,
  "availableCount": 2,
  "skippedCount": 1,
  "transcripts": ["전체 transcript 객체"],
  "skipped": [
    {
      "videoId": "...",
      "note": "no captions available for this video"
    }
  ]
}
```

15개 이상 긴 자막을 stdout으로 한 번에 넘기지 않으려면 파일 저장 모드를 사용한다.

```bash
node ~/.claude/skills/youtube-research/youtube.mjs transcripts "id1,id2,id3,..." \
  --lang=ko,en --chunk-chars=8000 \
  --output-dir=./research/transcripts
```

생성 결과:

```text
research/transcripts/<videoId>.transcript.json
research/transcripts/manifest.json
```

stdout에는 전체 원문 대신 파일 경로, 글자 수, 세그먼트 수, 청크 수, 언어, 자막 유형, SHA-256만 반환한다.

### comments — 상위 댓글

```bash
node ~/.claude/skills/youtube-research/youtube.mjs comments "videoId" --max=15
```

댓글은 영상 내용의 사실 근거가 아니라 시청자 반응·불만·표현·질문을 분석하는 보조 자료로만 사용한다.

### channel-search — 채널 탐색

```bash
node ~/.claude/skills/youtube-research/youtube.mjs channel-search "Instagram marketing" --max=10
```

### channel-stats — 채널 규모·국가 확인

```bash
node ~/.claude/skills/youtube-research/youtube.mjs channel-stats "channelId1,channelId2"
```

반환 필드:

```text
channelTitle, description, country, customUrl, subscriberCount,
hiddenSubscriberCount, viewCount, videoCount, avgViewsPerVideo
```

채널 국가가 비어 있을 수 있으므로 국가 판정은 다음 신호를 함께 사용한다.

- `channel.country`
- 영상의 `defaultAudioLanguage`
- 제목·설명·자막 언어
- 채널 설명과 주요 업로드 언어

### channel-top — 채널 대표 영상

```bash
node ~/.claude/skills/youtube-research/youtube.mjs channel-top "channelId" --max=10
```

### ingest — 영상 1개의 메타데이터·댓글·전체 자막 통합

```bash
node ~/.claude/skills/youtube-research/youtube.mjs ingest "URL 또는 videoId" \
  --comments=15 --lang=ko,en --chunk-chars=8000
```

반환:

```json
{
  "videoId": "...",
  "url": "https://youtu.be/...",
  "meta": {},
  "comments": [],
  "transcript": {},
  "researchEligible": true,
  "fetchedAt": "..."
}
```

자막이 없으면 `researchEligible:false`다. 이 경우 영상은 심층 내용 분석 대상에서 제외한다.

긴 결과를 파일로 저장하려면:

```bash
node ~/.claude/skills/youtube-research/youtube.mjs ingest "URL" \
  --output=./research/raw/<videoId>.json
```

## 깊은 리서치 표준 워크플로우

### 1. 질문 분해

입력 주제를 그대로 한 번만 검색하지 않는다. 다음 검색군을 만든다.

- 핵심 개념
- 방법론
- 단계별 실행법
- 사례 연구
- 실패 원인
- 반론과 논쟁
- 최신 변화
- 한국어 표현
- 영어 표현

### 2. 후보 풀 확보

- 한국·미국 각각 관련도순, 조회수순, 최신순 검색
- 후보 100개 이상 수집 권장
- videoId 기준 중복 제거
- 조회수 5만 미만 제외
- 4분 미만 영상 기본 제외
- 한 채널 최대 2개

### 3. 메타데이터 평가

`stats`와 `channel-stats`를 결합해 다음을 평가한다.

- 주제 관련성
- 조회수
- 게시 후 일평균 조회수
- 구독자 대비 조회수
- 최신성
- 영상 길이
- 채널 전문성
- 국가 및 언어
- 자막 가능성

### 4. 자막 확보

우선 후보 25~40개에 `transcripts`를 실행한다.

- 자막 없는 영상은 자동 건너뛴다.
- 자막 가능한 영상이 15개 미만이면 다음 후보를 추가한다.
- 최종적으로 자막 원문을 확보한 영상 15개를 선정한다.

### 5. 청크별 주장 추출

각 `chunks[]`를 독립적으로 분석하고 다음을 구조화한다.

- 핵심 주장
- 주장 유형: 사실 / 인과 / 실무 휴리스틱 / 사례 / 경험 / 의견 / 예측
- 설명
- 근거
- 사례
- 적용 조건
- 한계
- 원본 `segmentStartIndex`, `segmentEndIndex`
- `startTimestamp`, `endTimestamp`, `sourceUrl`

### 6. 영상별 통합

한 영상의 여러 청크 결과를 합쳐 다음을 만든다.

- 영상의 핵심 논지
- 방법론과 단계
- 핵심 사례
- 검증이 필요한 사실
- 다른 영상과 비교할 핵심 주장

### 7. 15개 영상 종합

영상 순서대로 요약을 나열하지 않는다.

- 의미가 같은 주장을 클러스터링한다.
- 언급 영상 수와 독립 채널 수를 분리한다.
- 합의, 충돌, 예외 조건을 표시한다.
- 모든 핵심 원칙에 영상 ID와 타임스탬프 링크를 연결한다.
- 한국과 미국의 공통점·차이점을 별도로 정리한다.

### 8. 검증

별도 검증 단계에서 다음을 확인한다.

- 보고서의 주장이 실제 자막에 존재하는가.
- 타임스탬프 링크가 정확한가.
- 의견을 사실로 바꾸지 않았는가.
- 동일 원출처를 여러 독립 근거로 계산하지 않았는가.
- 숫자·플랫폼 정책·연구 결과는 외부 원출처 확인이 필요한가.

## Second Brain 저장 권장 구조

원문과 해석을 분리한다.

```text
raw_sources/<videoId>.transcript.json
knowledge_atoms/<claimId>.json
syntheses/<researchRunId>.json
reports/<researchRunId>.html
```

원문 중복 방지는 transcript의 `sha256`을 사용한다.

Knowledge Atom은 최소한 다음 필드를 갖는다.

```json
{
  "claimId": "...",
  "claim": "...",
  "claimType": "practitioner_heuristic",
  "videoId": "...",
  "startSeconds": 314,
  "endSeconds": 382,
  "sourceUrl": "https://www.youtube.com/watch?v=...&t=314s",
  "evidence": "...",
  "verificationStatus": "SUPPORTED",
  "researchRunId": "..."
}
```

## 리서치 품질 규칙

- 조회수가 높다는 이유만으로 전문성이 높다고 판단하지 않는다.
- 구독자가 많다는 이유만으로 주장의 근거가 강하다고 판단하지 않는다.
- 반복 언급 횟수와 사실 검증 결과를 분리한다.
- 자동 자막은 고유명사·숫자·제품명 오류 가능성을 표시한다.
- 출처 없는 종합 문장을 만들지 않는다.
- 자막이 없는 영상은 제목·설명만으로 내용 분석하지 않는다.
- `sourceUrl`은 주장 출처 인용에 사용하고, 전체 영상 URL만 달아 출처를 뭉뚱그리지 않는다.
- 원문은 보존하고, 번역·요약·주장 추출은 별도 레이어에 저장한다.

## API 할당량

- `search.list`: 100 units
- `videos.list`, `channels.list`, `commentThreads.list`: 일반적으로 1 unit
- 기본 일일 할당량: 10,000 units

검색어별 무의미한 반복 호출을 피하고, 검색 결과를 캐시하고 videoId 기준으로 중복 제거한다.

## 자격증명 설정

```bash
echo 'export YOUTUBE_API_KEY="your-key"' >> ~/.zshrc
source ~/.zshrc
```

또는 현재 디렉터리나 상위 디렉터리에 다음 파일을 둔다.

```text
services/youtube/.credentials.json
```

```json
{
  "api_key": "..."
}
```

API 키를 public repository에 커밋하지 않는다.
