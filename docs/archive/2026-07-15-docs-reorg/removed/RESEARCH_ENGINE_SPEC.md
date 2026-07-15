# RESEARCH_ENGINE_SPEC — 범용 YouTube 리서치 엔진

Status: DESIGN (Fable 작성, 2026-07-14). 구현은 Opus 에이전트가 이 문서를 정본으로 수행한다.

## 0. 목적

사용자가 하나의 주제/질문을 입력하면 한·미 YouTube 영상 100개 이상을 후보로 수집하고,
자막이 있는 15개를 선정해 전체 자막·타임스탬프 기반으로 주장(Knowledge Atom)을 추출,
공통점·충돌·통합 이론을 합성하고, Second Brain·Notion·Slack으로 내보내는 엔진.

CMO는 이 엔진의 **클라이언트 중 하나**일 뿐이다. 엔진 핵심 로직은 CMO(video-room)에 종속시키지 않는다.

## 1. 기존 구조 진단 (2026-07-14 실측)

| 영역 | 현황 | 재사용 결정 |
|---|---|---|
| youtube-research 스킬 | `~/.claude/skills/youtube-research/youtube.mjs`. search/stats/transcript(s)/comments/channel-*/ingest CLI. 전체 자막 보존(`truncated:false`), 수동→자동 fallback, Whisper 없음, 세그먼트 타임스탬프+`sourceUrl` 딥링크, 청크(기본 8000자, 세그먼트 경계 보존), SHA-256, 자막없음=`{available:false,skipped:true,note}`. **선정 오케스트레이션은 SKILL.md 가이드만 존재(코드 없음)** | 데이터 수집 어댑터로 그대로 spawn. 레포에 vendor 사본 설치(§7.1). `EMBEDDED_API_KEY` 평문 키는 사본에서 제거 |
| Slack | `services/slack-gateway/` Socket Mode. CMO 봇은 분류기 없이 전부 `runExecutive()`. 아웃바운드 `slack-api.ts SlackApi.postMessage`. `cleanInstruction()`의 "sent via" 트레일러 제거 공통 경로 | CMO 리서치 intent 분기 추가(§8). 발신은 엔진 자체 SlackPort 어댑터(raw fetch) |
| Second Brain | 외부 Python `/Users/wonminyang/세컨 브레인/`(fastembed multilingual-MiniLM, TEMPR 검색, sha256+코사인 dedup, `lib/store.py add_card`). pulk 브리지 `secondbrain-transport.ts`(spawn, `SECONDBRAIN_DIR`). **기존 CMO 키콘텐츠 보고서는 raw 자막을 영속화하지 않음(읽기 전용)** | raw 계층은 엔진 자체 파일 스토어(§6). 합성 원칙만 brain 카드로 push(기존 transport 패턴 재사용, graceful disable) |
| Notion | `services/notion-gateway/src/notion-client.ts` `NotionClient`(raw fetch, ~3req/s). `createPage`는 children 블록 100개 캡, 본문은 CREATE 1회. 토큰 `NOTION_TOKEN ?? notionintegrationtoken`(정본 `.env.local`) | NotionClient 재사용 + blocks append 배치(§7.4). markdown→blocks 변환기 신규 |
| LLM | 정책 정본: 키 없음→CLI. `packages/l5-core/src/llm/claude-cli-client.ts` `createClaudeCLIClient`(@l5/core export) | 엔진의 모든 LLM 호출에 사용. 합성/검증은 opus, 추출은 sonnet 기본 |
| 테스트 | l5-core는 Jest(ts-jest), `__tests__/*.test.ts`, 커버리지 70%. 인라인 팩토리 fixture 관례 | 동일 관례 준수. 서비스는 notion-gateway처럼 자체 jest config |
| 작업 상태 | CTO=`agent_tasks`, CMO=`video_room_*`. 엔진 run은 별도 파일 상태(§5.3)로 관리(NocoBase 비종속) | run state JSON + 재개(resume) |

## 2. 배치 (ARCHITECTURE 준수: 판단 로직은 l5-core)

```text
packages/l5-core/src/functions/research-engine/   # 순수 도메인 (NocoBase/IO 무의존, Jest)
  types.ts               # ResearchRequest, KnowledgeAtom, SynthesisReport, RunState, enum들
  ports.ts               # YouTubePort, TranscriptPort, LLM(기존 LLMClient), SecondBrainStorePort,
                         # EmbeddingPort, NotionPublishPort, SlackNotifyPort, DocsVerifyPort
  query-expansion.ts     # 주제 → KR/EN 검색어 8~14개 (LLM + 결정론 fallback)
  market-classifier.ts   # KR/US 판정: channel.country + defaultLanguage/audioLanguage + 한글비율
  candidate-selection.ts # 필터(조회수/길이/live 제외), 중복·재업로드 제거, 채널 상한 2,
                         # 랭킹, shortlist, 자막확보 실패 시 refill 계획 (전부 순수 함수)
  atom-extraction.ts     # 청크 → Knowledge Atom[] (LLM 프롬프트 + strict JSON 파서 + 타임스탬프 앵커 검증)
  synthesis.ts           # 아톰 클러스터링 → principles/conflicts/KR-US diff/통합이론 (LLM + 파서)
  verification.ts        # fresh-context 검증 프롬프트/판정 + 기술주제 공식문서 검증 규칙
  concept-graph.ts       # SUPPORTS|CONTRADICTS|EXPLAINS|EXAMPLE_OF|REQUIRES|PRECEDES|SIMILAR_TO|DERIVED_FROM
  report.ts              # canonical SynthesisReport → 목적별 markdown 렌더링
  pipeline.ts            # 단계 실행기(ports 주입, resume 지원). 순수: IO는 전부 port 통해서만
  index.ts               # 배럴 export
  __tests__/             # 단위 테스트 (fixture 기반)

services/research-engine/                          # I/O 어댑터 + CLI 러너
  src/adapters/youtube-cli.ts    # vendor youtube.mjs spawn (search/stats/channel-stats/transcripts)
  src/adapters/store-fs.ts       # Second Brain raw/atom/graph/synthesis 파일 스토어 + sha256 dedup
  src/adapters/embeddings.ts     # 세컨브레인 venv fastembed 브리지(stdin/stdout) + sqlite 캐시, 없으면 disable
  src/adapters/brain-cards.ts    # 합성 원칙 → 외부 brain add_card push (graceful disable)
  src/adapters/notion.ts         # notion-gateway NotionClient 재사용 + markdown→blocks + 100개 배치 append
  src/adapters/slack.ts          # chat.postMessage raw fetch (SLACK_CMO_BOT_TOKEN 등 주입)
  src/adapters/docs-verify.ts    # claude CLI + WebSearch/WebFetch 허용 spawn으로 공식문서 검증
  src/cli.ts                     # node dist/cli.js --request '<json>' [--resume <runId>] [--slack-channel C --slack-thread TS]
  src/config.ts                  # loadConfig() 패턴 (notion-gateway와 동일)
  vendor/youtube-research/       # 스킬 사본 (youtube.mjs + youtube.test.mjs + SKILL.md)
  __tests__/                     # 어댑터 단위(fixture) + e2e/ 실통합 스크립트

services/slack-gateway/src/research-bridge.ts      # CMO 리서치 intent → 엔진 CLI spawn (§8)
.claude/skills/youtube-research/                   # 프로젝트 스킬 설치본 (vendor와 동일 소스)
```

금지: 엔진 로직을 `plugin-orchestration/plugin.ts`나 UI에 넣지 않는다. video-room 파일(미커밋 WIP)은 수정 금지.

## 3. 요청 인터페이스

```ts
type ResearchPurpose = 'LEARNING' | 'TECHNICAL_RESEARCH' | 'CONTENT_PLANNING' | 'BUSINESS_RESEARCH' | 'DECISION_SUPPORT';

interface ResearchRequest {
  topic: string;
  researchPurpose: ResearchPurpose;
  researchQuestion?: string;
  targetAudience?: string;
  markets?: ('KR' | 'US')[];        // 기본 ['KR','US']
  outputLanguage?: 'ko' | 'en';     // 기본 'ko'
  requiredVideoCount?: number;      // 기본 15
  minimumViewCount?: number;        // 기본 50_000
  minimumDurationSeconds?: number;  // 기본 240
  maxPerChannel?: number;           // 기본 2
  candidateTarget?: number;         // 기본 100 (미달 시 검색어 추가 확장 1회, 그래도 미달이면 실측치로 진행하되 report.limitations에 기록)
}
```

## 4. 파이프라인 (RunState 단계)

`EXPAND → COLLECT → SELECT → TRANSCRIPT → ANALYZE → SYNTHESIZE → VERIFY → STORE → PUBLISH`

1. **EXPAND**: 주제를 하위질문·동의어·방법론·사례·실패사례·반론·최신흐름으로 분해해 KR/EN 검색어 8~14개 생성(LLM). LLM 실패 시 결정론 fallback(주제 + 고정 수식어 조합). 산출: `queries[]{q, lang, angle}`.
2. **COLLECT**: 검색어별 `search --max=25~50`(KR 검색어는 `--region=KR --lang=ko`, EN은 US/en) → videoId 합집합 ≥ `candidateTarget`. `stats`(50개 배치)와 `channel-stats`로 조회수·길이·자막가능성·채널 국가/구독자 보강.
3. **SELECT** (전부 순수 함수, 단위테스트 필수):
   - 필터: `viewCount ≥ minimumViewCount`, `durationSeconds ≥ 240`, live/upcoming 제외.
   - 중복·재업로드: videoId 동일 제거 → 정규화 제목 유사도(Jaccard ≥ 0.85) && 길이 차 ≤ 5초 → 재업로드로 판정, 조회수 높은 쪽 유지.
   - 시장 분류(market-classifier): `channel.country`(KR/US) > `defaultAudioLanguage/defaultLanguage`(ko/en) > 제목+설명 한글 비율(≥0.3 → KR). regionCode 단독 사용 금지.
   - 랭킹 점수: 관련성(검색어-제목/설명 토큰 겹침 + LLM 배치 관련성 0~5 선택적) · 최신성(publishedAt 지수감쇠) · log10(viewCount) · log10(subscriberCount). 결정론 부분만으로도 완전 순서가 나오게 구현.
   - shortlist: 랭킹순으로 채널당 ≤ `maxPerChannel`, KR·US 각 최소 4개(가능한 범위) 보장하며 `requiredVideoCount + 10`개 선발. 나머지는 정렬된 refill 대기열.
4. **TRANSCRIPT**: shortlist 순서대로 `transcripts --output-dir=<store>/raw_sources --lang=ko,en --chunk-chars=7000`. 자막 없음 → 해당 영상 `status='SKIPPED_NO_TRANSCRIPT'` 기록 후 refill 대기열에서 같은 시장 우선으로 보충. 자막 sha256이 기확보 원문과 동일하면 중복(재업로드)으로 drop 후 보충. 15개 확보 또는 대기열 소진 시 종료(미달이면 limitations 기록, 실패 아님).
5. **ANALYZE**: 영상별로 청크 순회 → Knowledge Atom 추출(LLM, 청크당 3~10개). Atom 스키마는 §5.1. `startSeconds/endSeconds`는 반드시 실제 세그먼트 타임스탬프에서 취하고, 추출 후 앵커 검증(해당 구간 텍스트에 claim 근거 어휘가 실제 존재하는지 문자열 검사)을 통과 못 하면 `TRANSCRIPT_AMBIGUOUS`.
6. **SYNTHESIZE**: 아톰 클러스터링(LLM, 아톰 id 목록만 주고 클러스터 반환) → 클러스터별 원칙 생성: `mentionVideoCount, independentChannelCount, representativeSources[](videoId+timestamp), evidenceQuality, counterClaims, applicabilityConditions`. 공통/충돌/조건부/KR-US 차이/신구 방법 차이/통합 이론(또는 실행 프레임워크) 생성. "많이 언급됨 ≠ 검증됨" — 언급 수치와 verificationStatus를 분리 기록.
7. **VERIFY**:
   - fresh-context verifier: 합성에 쓰인 것과 **다른 LLM 세션**(새 CLI spawn)에, 원칙/아톰과 해당 원문 세그먼트만 제공(합성 결과 컨텍스트 미제공). 판정 항목: 자막에 실재, 타임스탬프 정확, 의견→사실 승격 없음, 동일 원본 중복 계산 없음, 자동자막 숫자/고유명사 의심 여부.
   - 기술 주제(TECHNICAL_RESEARCH 또는 LLM이 기술 주장으로 태깅): docs-verify 어댑터로 공식문서 대조. 우선순위 공식문서→GitHub 릴리스→논문→공식블로그→2차출처→YouTube. 충돌 시 공식문서 기준 + 충돌 사실을 report에 표시. 검증 날짜·버전·출처 URL 기록.
   - 상태: `VERIFIED | SUPPORTED | PRACTITIONER_CONSENSUS | CONTESTED | ANECDOTAL | UNVERIFIED | TRANSCRIPT_AMBIGUOUS | OUTDATED`.
8. **STORE**: §6 레이아웃으로 영속화 + 임베딩 + brain 카드 push.
9. **PUBLISH**: Notion 페이지 생성(canonical report §5.2 → markdown → blocks), Slack에는 `주제 · 분석 영상 수 · 핵심 발견 3 · 검증 상태 요약 · Notion 링크`만 전송(파일 업로드 금지 — 사장님 정책 B).

각 단계 완료 시 `state.json` 갱신. `--resume <runId>`는 완료 단계 산출물을 로드하고 미완 단계부터 재개. TRANSCRIPT/ANALYZE는 영상 단위 부분 재개(완료 videoId 스킵).

## 5. 데이터 계약

### 5.1 KnowledgeAtom (스펙 그대로 + 확장 필드)
```json
{
  "claimId": "run-<runId>-<videoId>-<n>",
  "claim": "", "claimType": "objective_fact|causal_claim|framework|instruction|case_study|practitioner_heuristic|opinion|prediction",
  "explanation": "", "evidence": "",
  "videoId": "", "channelId": "", "startSeconds": 0, "endSeconds": 0,
  "sourceUrl": "https://www.youtube.com/watch?v=<id>&t=<start>s",
  "transcriptSource": "manual|auto", "verificationStatus": "UNVERIFIED", "confidence": 0,
  "market": "KR|US", "chunkIndex": 0, "runId": ""
}
```

### 5.2 SynthesisReport (canonical, 목적별 렌더링은 report.ts)
공통 섹션: 한눈에 보는 결론 / 리서치 질문 / 조사 방법·선정 영상(스킵·보충 내역 포함) / 핵심 개념 / 통합 이론 / 공통 주장 / 충돌 주장 / KR·US 차이 / 검증 결과 / 영상별 출처·타임스탬프 / 한계·추가 질문.
LEARNING·TECHNICAL_RESEARCH 추가: 선수 지식, 용어 사전, 학습 로드맵, 실습 과제, 구현 패턴, 흔한 실수, 공식문서 검증 결과(버전·날짜·deprecated·현행 권장·영상 단독 미검증 주장).
CONTENT_PLANNING 추가: 타깃 문제, 핵심 메시지, 차별화 관점, 콘텐츠 아이디어, 재사용 가능한 주장·출처.
BUSINESS_RESEARCH / DECISION_SUPPORT: 스펙의 해당 목록.

### 5.3 RunState
```json
{ "runId": "", "request": {}, "phase": "EXPAND|...|DONE",
  "queries": [], "candidates": [], "selected": [], "skipped": [{"videoId":"","status":"SKIPPED_NO_TRANSCRIPT"}],
  "transcriptsDone": [], "atomsDone": [], "startedAt": "", "updatedAt": "", "errors": [] }
```

## 6. Second Brain 저장 레이아웃

루트: `RESEARCH_STORE_DIR` (기본 `~/second-brain/research/`).
```text
raw_sources/<videoId>.transcript.json   # 스킬 원본 그대로(text+segments+chunks+sha256+provenance). 동일 sha256 존재 시 재저장 생략
raw_sources/<videoId>.meta.json         # stats+channel(조회수·길이·국가·구독자)+market
knowledge_atoms/<runId>/<claimId>.json
graph/<runId>.edges.jsonl               # {from,to,type,confidence} — 아톰/개념 간 8종 관계
syntheses/<runId>.json                  # canonical SynthesisReport
reports/<runId>.md                      # 렌더링 결과 (Notion 업로드 원본)
runs/<runId>/{request.json,state.json}
embeddings.sqlite                       # emb(hash PK, kind 'segment'|'atom', runId, videoId, vec BLOB)
```
- 임베딩: 원문 청크와 아톰 claim을 각각 임베딩. 구현은 세컨브레인 venv의 fastembed를 stdin/stdout 브리지 스크립트로 호출(외부 레포 무수정), 콘텐츠 sha256 키로 캐시. python/venv 부재 시 임베딩만 skip(경고 로그) — 파이프라인은 계속.
- brain 카드 push: 통합 원칙 중 상위(대표 출처 포함)만 `add_card`(topics=[topic], origin='external', source_url=Notion 링크). `SECONDBRAIN_DIR` 부재 시 skip.
- 중복 방지: raw는 sha256, 카드는 brain 자체 dedup(0.85/0.70), run 산출물은 runId 네임스페이스.

## 7. 어댑터 상세

### 7.1 youtube-cli 어댑터 + 스킬 설치
- 스킬 원본(`~/.claude/skills/youtube-research/`)을 레포에 복사: `services/research-engine/vendor/youtube-research/` (실행 정본) 및 `.claude/skills/youtube-research/`(프로젝트 스킬 설치, 동일 내용). **사본에서 `EMBEDDED_API_KEY` 상수와 fallback 분기를 제거**(레포 규칙 9: 시크릿 하드코딩 금지). 키는 `YOUTUBE_API_KEY` env 또는 `services/youtube/.credentials.json`(기존 탐색 로직 유지)으로만.
- 어댑터는 `execFile('node', [vendorPath, cmd, ...])` + stdout JSON 파싱. 스킬 유닛테스트(youtube.test.mjs)도 함께 vendor하고 CI에서 실행.

### 7.2 store-fs / 7.3 embeddings / brain-cards — §6 대로.

### 7.4 notion 어댑터
- `services/notion-gateway`의 `NotionClient` import(워크스페이스 의존성) 또는 동일 패턴 최소 재구현(순환/배포 문제 시). `NOTION_RESEARCH_PARENT_PAGE_ID`(page 하위 생성) 또는 `NOTION_RESEARCH_DATABASE_ID` 중 설정된 쪽 사용, 둘 다 없으면 publish 단계에서 Notion skip + Slack 메시지에 로컬 report 경로 안내.
- markdown→Notion blocks 변환기 신규(heading1-3, paragraph, bulleted/numbered list, code, quote, divider, 링크 rich_text). CREATE 시 100블록, 초과분은 `PATCH /v1/blocks/{page_id}/children`으로 100개씩 append(rate limit ~3req/s 준수).

### 7.5 slack 어댑터
- raw fetch `chat.postMessage`(mrkdwn). 토큰: `RESEARCH_SLACK_BOT_TOKEN ?? SLACK_CMO_BOT_TOKEN`. 채널/스레드는 CLI 인자. 파일 업로드 금지(정책 B). 실패 시 로그만(발행 실패가 run 실패는 아님).

### 7.6 docs-verify 어댑터
- `claude -p <검증 프롬프트> --model <opus> --output-format json --allowedTools WebSearch WebFetch` spawn(l5-core claude-cli-client 확장 또는 유사 spawn). 반환: 주장별 `{status, sourceUrl, checkedVersion, checkedAt, conflict?: string}`. CLI/네트워크 불가 시 전부 `UNVERIFIED` + limitations 기록.

## 8. Slack 진입 (CMO 클라이언트 배선)

- `router.ts`에 `classifyCmoIntent(instruction): 'research' | 'generic'` 추가. `research` 판정: `/^리서치[:\s]/`, `리서치해줘`, `research:` 프리픽스 등 명시 트리거만(과탐 금지). 반드시 `cleanInstruction()` 통과 텍스트로 분류.
- `index.ts` handler: `bot.id === 'cmo' && intent === 'research'` → `research-bridge.ts`:
  1. 즉시 스레드 ACK("리서치 시작: <topic> — 완료 시 Notion 링크 회신").
  2. 주제·목적 파싱(기본 purpose: 문구에 '콘텐츠' 포함 시 CONTENT_PLANNING, 기술 키워드 시 TECHNICAL_RESEARCH, 그 외 LEARNING. `목적=XXX` 명시 오버라이드).
  3. `services/research-engine/dist/cli.js --request '<json>' --slack-channel <ch> --slack-thread <ts>`를 detached spawn(로그 `~/.l5/logs/research-engine.log`). 게이트웨이는 블로킹하지 않는다.
- CEO/CTO 봇 또는 수동 CLI 호출로도 동일 엔진 사용 가능(범용성 완료조건 11).

## 9. 테스트 매트릭스

**fixture 단위테스트(Jest, 네트워크 무접속)** — l5-core `__tests__/`:
선정 필터(5만 미만 제외/4분 미만 제외/채널 상한 2/중복·재업로드 제거/최종 15 선정/refill 보충), market-classifier(국가·언어·한글비율 케이스), 청크 무결성(12k·50k자 fixture: 전체 보존, 청크 합집합=원문, 타임스탬프 경계 보존), atom 앵커 검증, 클러스터 파서·공통/충돌 탐지(합성 fixture), report 렌더링(목적별 섹션 존재), RunState resume(중간 실패 후 재개), Whisper 미호출(어댑터 spawn 인자 검증), store dedup(sha256 재저장 생략), notion blocks 변환·100개 분할, slack payload.

**실통합(e2e, env 필요, `test:integration` 별도 스크립트)** — services/research-engine/e2e/:
실제 YouTube API 소량 검색+자막 1건, Notion 페이지 실생성, Slack 실전송, 그리고 풀 파이프라인 1회 실행 증거. fixture 결과를 실통합 결과로 보고하지 않는다.

## 10. 환경변수

`YOUTUBE_API_KEY`(또는 services/youtube/.credentials.json), `RESEARCH_STORE_DIR`, `SECONDBRAIN_DIR`, `SECONDBRAIN_BRAIN`, `SECONDBRAIN_PY`, `NOTION_TOKEN|notionintegrationtoken`, `NOTION_RESEARCH_PARENT_PAGE_ID` 또는 `NOTION_RESEARCH_DATABASE_ID`, `RESEARCH_SLACK_BOT_TOKEN|SLACK_CMO_BOT_TOKEN`, `ANTHROPIC_API_KEY`(없으면 CLI). 시크릿 하드코딩 금지, 정본 `.env.local`.

## 11. 구현 작업 분해 (Opus 에이전트)

- **WO-A (l5-core 도메인)**: §2의 research-engine 모듈 전체 + __tests__ (§9 fixture 테스트). NocoBase/fs/network import 금지(ports만). `pnpm --filter @l5/core typecheck && test` 통과.
- **WO-B (서비스+어댑터)**: services/research-engine 신설(§7), vendor 설치+키 제거, CLI, resume, 자체 jest. WO-A 타입에 의존.
- **WO-C (Slack 배선)**: slack-gateway research intent+bridge(§8) + 테스트. 기존 CTO 분기 회귀 금지.
- 이후 통합 검증: `pnpm -r typecheck/test/build` + 실통합 e2e + 라이브 풀 런 1회.

## 12-A. BookReport — 서적형 심층 원고 (v2, 2026-07-14 사장님 피드백 반영)

첫 라이브 런 결과 보고서가 "메타데이터 덤프"(원칙 제목+카운트+URL 나열, 60자 잘림, 영어 혼입, 1.3만 자)로 판정됨.
요구: **한 권의 책처럼** — 전체 개요→핵심 개념 점진 심화→구체적 방법론→실전 적용까지 읽히고,
읽고 나면 실제 기획/실행에 바로 적용 가능한 깊이. Second Brain에 저장해 재사용.

### 구조 (l5-core `book-composer.ts` 신설, 3단계 LLM 집필)
1. **OUTLINE(목차 설계)**: synthesis(원칙/충돌/KR-US)+아톰 인덱스를 주고 책 목차를 설계.
   고정 골격: ①전체 개요(이 주제의 지형) ②핵심 개념(점진 심화) ③아키텍처/방법론(원칙별 심화)
   ④구체적 실행 방법(단계별 how-to) ⑤사례·실패담 ⑥충돌 지점과 판단 기준 ⑦실전 적용 가이드
   (체크리스트·템플릿·바로 쓰는 시나리오) ⑧용어집·출처. purpose별 강조 조정(CONTENT_PLANNING이면
   ⑦이 콘텐츠 기획 워크시트). 각 챕터에 관련 principle/atom id 매핑.
2. **WRITE(챕터별 집필)**: 챕터당 LLM 1콜. 입력 = 챕터 목표 + 매핑된 아톰 전문(claim/explanation/evidence)
   + **해당 타임스탬프 주변 원문 세그먼트 발췌**(транscript에서 startSeconds±90s 창, 챕터당 총 8k자 한도)
   — 원문의 디테일이 원고에 살아나게 한다. 출력 = 챕터당 1,500~3,500자 한국어 산문(outputLanguage 강제),
   교육적 어조, 인라인 출처 링크 `[영상제목 (mm:ss)](url)`, 실행 방법 챕터는 번호 단계+예시 필수.
3. **ASSEMBLE(조립)**: 서문(누가 왜 읽어야 하는가)+챕터들+실전 체크리스트+용어집+
   부록(기존 canonical 구조화 섹션: 조사 방법·공통/충돌 주장 표·검증 결과·영상별 출처 — 신뢰성 근거로 유지).

### 규칙
- 아톰/원칙 텍스트 잘림(truncation) 금지 — 렌더링에서 substr 제거.
- 모든 산문은 `outputLanguage`(기본 ko)로. 아톰 추출 프롬프트에도 claim/explanation을 outputLanguage로 쓰도록 강제(원문 인용 evidence는 원어 유지).
- 챕터 집필 실패(파싱/타임아웃) 시 해당 챕터는 아톰 기반 결정론 폴백 렌더(전체 실패 아님) + limitations 기록.
- 최종 원고 목표 분량: 25,000~60,000자(원문 볼륨에 비례). Notion append 배치는 기존 §7.4로 충분.
- reports/<runId>.md = 북 원고(정본). canonical SynthesisReport JSON은 syntheses/에 그대로(구조화 재사용용).
- RunState에 `bookDone: chapterId[]` 추가 — 챕터 단위 resume.

## 12. 완료 조건 매핑

스펙 완료조건 1~12 ↔ 본 문서: 1→§7.1, 2→스킬 보존+§9 청크 테스트, 3·4→§4.3-4, 5→§5.1, 6→§4.6, 7→§4.7, 8→§6, 9→§7.4, 10→§7.5, 11→§8(CLI 직접 호출), 12→§9. 전부 충족 전 COMPLETE 선언 금지.
