# Video Room E2E 모니터링 로그 — 2026-06-12

> 프로젝트: "인스타그램 마케팅 자동화 — AI 마케팅팀 (E2E 풀 워크플로우)"
> 상품 기준: `마케팅자동화_상품정보_정리.md` (작은 브랜드용 AI 마케팅팀)
> 모니터: Claude (제어 탭에서 console/network/타이밍 계측)
> 프론트 :3002 / 백엔드 NocoBase :13000 / 도메인로직 `packages/l5-core/functions/video-room`

## 워크플로우 (25 status / 5 phase)
전략(9) → 리서치(3) → 원고(3) → 제작(5) → 발행(3)

---

## 단계별 관찰

### 1. 프로젝트 생성
- 소요: <2초. console 오류 0. ✅ 정상.

### 2. 전략 대화 → 상품 정의 (strategy_chat → product_defined)
- 클릭 1회로 `전략 대화 ✓ + PT 컨텍스트 로딩 ✓` 2단계 동시 통과.
- `상품 정의 완료` 단계 진입 → UI 안내 "상품 정의 분석 중... (Step 1~7, 보통 2~3분)".
- **관찰(병목 후보)**: 단일 단계가 2~3분 + 내부 7스텝. 진행률/스텝 표시 없이 단일 스피너 → 긴 대기 UX 리스크.
- **실측**: 클릭→완료 약 135초 (≈2:15). 추정치 "2~3분" 부합. console 오류 0. ✅ 출력 품질 우수(USP·타깃·문제정의 상품파일과 일치).
- **이상 징후(저위험)**: 이 단계 완료 시점에 `호랑이`(회고 루프) 토글이 내 클릭 없이 OFF→ON 자동 전환됨. 의도된 동작인지 확인 필요.
- **병목 분석**: 7스텝이 순차 LLM 호출로 보임 → 병렬화 또는 스트리밍 진행표시로 체감 단축 여지.

---

### 3. 상품 정의 승인 → 키 콘텐츠 기획 (product_defined → key_content_ideation)
- 승인 클릭 즉시 다음 LLM 작업 시작. UI 안내 "키 콘텐츠 기획 보고서 작성 중... (YouTube 시장성 분석 → 성과도/기여도 크롬 → 자막 판매논리 분석, **보통 5~15분**)".
- **최대 병목**: 단일 단계 5~15분. 동기 진행, 중간 진행률 없음.
- 동시에 `Viewtrap 리서치 수동 입력` 폼 노출(영상 URL/제목/조회수/선택이유 + 저장). **휴먼 게이트**: viewtrap 실검색은 코드 트리거 불가(rule 50), 사장님 수동 입력 필요.

---

## 발견 사항 (running)

### F1. 키 콘텐츠 보고서 — 불필요한 순차 처리 2곳 (속도 최대 병목)
`packages/l5-core/src/functions/video-room/key-content-report.ts`
- **L396~412 (1단계 키워드 루프)**: `for` 안에서 `await discover(keyword)` → `await getDurations(...)`를 키워드(최대 6개)마다 순차 실행. 각 키워드 독립 → 직렬 6회 = 30~90초 낭비 추정.
- **L545~562 (4단계 후보별 판매논리)**: `for` 안에서 `await fetchTranscript` → `await llmComplete(salesLogicPrompt)`를 후보(≈3개)마다 순차. **독립적인 LLM 호출 3회가 직렬** → 가장 큰 시간 손실(LLM 1회 20~40s × 3 직렬).
- 이미 L481(댓글 수집)은 `Promise.all`로 병렬화돼 있음 → **동일 패턴 적용이 안전·일관**.
- LLM 호출 총량(최악): judge1 + select1 + salesLogic3(직렬) + synthesis1 = 6회. 4단계만 병렬화해도 체감 5~15분 → 3~8분 수준 단축 기대.

## 적용한 수정 (2026-06-12, 사장님 피드백 반영)

### C1. key-content 타깃팅 — 대표(사장) 콘텐츠가 선별되도록 (코드 수정 완료)
근본 원인: identity 프롬프트 자체는 옳았으나, verdict/qualified의 **롱폼 편향**이 고수요·대표향 키워드(카페 마케팅 아이디어 1.27M, 높음/높음)를 selection 이전에 제거 → 풀이 실무자/자동화러 콘텐츠만 남아 "MAKE로 SNS 글쓰기 자동화"가 #1로 뽑힘.
`packages/l5-core/src/functions/video-room/key-content-report.ts`:
- `decideVerdict`: `longformRatio<0.2 → 제외` **삭제**. 진행추천 조건에서 `videoCount≥8`·`longformRatio≥0.4` 제거 → 수요(상위5만+&평균2만+)+타깃높음+판매≠낮음 기준. 형식은 사유에 라벨(롱폼/쇼츠/혼합)로만.
- `isQualifiedCandidate`: 쇼츠 하드제외 삭제 → 쇼츠는 성과도/기여도 **Good+ 면 후보**(등급없는 쇼츠만 제외). 롱폼은 종전과 동일.
- 프롬프트(marketJudge/select/synthesis): **대표가 보는 콘텐츠 예시**(매출 결과·"우리 가게 인스타 이렇게"·"인스타 잘 모르는 대표님 운영법") vs **실무자/자동화러 예시**(MAKE/n8n 툴 구축·작업법) 명시. synthesis의 content_topic을 대표 눈높이 결과·운영법 프레이밍으로 강제, 툴 구축법 프레이밍 금지.
- 검증: `jest key-content-report` 20/20 PASS, `tsc --noEmit` 0 err. dist 재빌드 완료. (테스트 2건 의도적 갱신 + 회귀가드 2건 추가)

### C2. 같은 프로젝트 키 콘텐츠만 코드 재실행 (도구 추가)
`apps/founder-ui/e2e/rerun-key-content.mjs` — UI 클릭 없이 `cmo:proposeKeyContentReport`만 재호출(보고서 카드 upsert, 라이브 CDP/LLM/DB 재사용). 결과(키워드 판정·후보·주제)를 콘솔에 요약 출력. 제목 자동매칭 지원.
- ⚠️ **선행조건**: l5-core 빌드는 끝났으나, 플러그인이 dist를 모듈 로드 시 require하므로 **백엔드 1회 재시작** 후 재실행해야 새 로직 반영.
- 실행: `cd apps/founder-ui && node e2e/rerun-key-content.mjs`

### C3. 보고서 추천 사유 — 데이터 근거 기반 논리화 (synthesisPrompt)
사장님 피드백: 보고서가 "최종 주제 + 선정 이유(논리적 근거) + 우리 상품 판매논리"로 나와야 함.
- `synthesisPrompt`에 키워드 시장성 근거(진행·보류 + 조회수/성과도/기여도)와 후보 정체성(match)·현상을 주입.
- `recommendation_reason`을 4요소(①수요 근거 ②타깃 정합 근거 ③다른 후보 대비 우위 ④판매논리 연결)로 각 주장에 수치·정체성 근거를 붙여 서술하도록 강제. UI는 "추천 콘텐츠 선정 이유" 섹션에 그대로 렌더(KeyContentReportBoard §6).
- 검증: jest 20/20, tsc 0, dist 재빌드 완료.

### F5. 워크플로우 순서 — viewtrap_key_research는 보고서 흐름에서 사실상 잉여(중복 아님)
- 상태흐름: `key_content_ideation → viewtrap_key_research → key_content_approval` (state-machine.ts:13~15).
- **실측 동작**: 보고서 흐름에서 "이대로 확정"(KeyContentReportBoard.approve L107~119)이 `viewtrap_key_research`를 advanceStatus로 **자동 통과**(약 1초, 실작업 0)하고 `key_content_approval` 게이트까지 한 번에 전진. 즉 보고서(=리서치 산출물)가 이미 최종 산출물이고, viewtrap_key_research는 **구 수동 플로우 잔재 라벨**.
- 사장님이 본 "중복"은 (a) 좌측 레일이 viewtrap_key_research를 별도 단계로 표시 + (b) key_content_ideation 화면에 구 수동 입력폼(Viewtrap 리서치 수동 입력)이 떠서 생긴 **표시상 중복**. 실제 재계산 중복은 없음.
- 키 콘텐츠는 "뷰트랩 아니고 유튜브"라는 사장님 확정과도 일치 → viewtrap_key_research를 키 콘텐츠 구간 레일에서 접고 수동폼을 숨기는 게 정합.
- **제안 P5(미적용·확인 필요)**: state-machine 상태는 유지(구 플로우·기존 프로젝트 보호)하되, 레일/폼 표시만 정리(`phases.ts` + `StepProgressRail` + 수동폼 게이트). UI 변경이라 Playwright smoke 필요(rule 50). 공유 컴포넌트라 적용 전 사장님 확인.

### C4. P5 적용 — 레일 접기 + 수동폼 숨김 (UI, 상태머신 불변)
- `StepProgressRail.tsx`: `RAIL_HIDDEN_STATUSES`(viewtrap_key_research)로 레일에서만 접음. statusOrder/state-machine 불변 → 기존 프로젝트·게이팅 안전.
- `StrategyBoard.tsx`: Viewtrap 수동 입력폼을 `key_content_report` 카드 존재 시(보고서 흐름) 숨김 — 구 수동 플로우엔 영향 없음.
- `phases.ts`: key_content_ideation 라벨 → "키 콘텐츠 기획서 (리서치+분석)" (보고서가 최종 산출물임을 명시).
- Next.js dev는 핫리로드 → 백엔드 재시작 불필요. tsc --noEmit 0 err. 시각 검증은 재실행 후 페이지 새로고침으로.

### V1. 재실행 검증 (백엔드 재시작 후, 04:03 런) — 새 로직 라이브 확인 + 진짜 병목 노출
- **새 로직 반영 확인 ✅**: "인스타 자동화 도구"(영상 11개·롱폼 0%)가 제외 사유 **"타깃 아님"**으로 탈락 — 옛 로직이면 longform 0%라 "롱폼 부적합"이 먼저 떴어야 함. 그 사유가 사라짐 = 롱폼 하드제외 제거가 라이브. 타깃팅도 정상(자동화러 키워드 올바르게 제외).
- **단, 빈 보고서(후보 0)**: 키워드별 영상 수 — 카페 2, 소상공인 3, 미용실 1, 인스타자동화 11, 마케팅성과 2, 음식점 2. 직전 런 카페 9개 → 이번 2개.
- 원인: **타깃팅 아님 → 크롤 편차**. videoCount<3 "시장성 미달"로 대부분 제외.

#### F6. discover/CDP 크롤 — 키워드당 영상 수 런 편차 큼 (현재 최상위 병목·신뢰도)
- 같은 키워드가 런마다 9↔2개로 출렁(카페). CDP "라이브" 노트는 뜨지만 결과 행을 1~2개만 스크랩하는 런 존재 → videoCount<3 floor에 걸려 전부 제외 → 빈/얇은 보고서.
- 추정: 검색 결과 페이지 lazy-load 미완 / 성과도·기여도 오버레이 렌더 전에 스크랩 / 스크롤로 추가 로딩 안 함.
- **제안 P6(다음 과제)**: services/youtube CDP 스크래퍼 — (a) 결과 그리드+오버레이 렌더 대기(셀렉터 기반), (b) 목표 N개까지 스크롤 로드, (c) 반환 수 < 임계치면 재시도, (d) provenance.notes에 키워드별 스크랩 수 기록(신뢰도 가시화). longform 수정으론 못 고침 — 크롤 안정화가 핵심.
- 보조: 크롤이 불안정한 동안 videoCount<3 floor가 과도하게 작동 → 강한 소표본(성과도/기여도 Good+ & 고조회수)은 살리는 보완 고려(F3/P3).

### V2. 런 편차(비결정성) 자체가 신뢰도 이슈
- 동일 project를 3회 재실행: ①후보3·대표향(구로직·크롤운) ②(중간) ③후보0(신로직·크롤빈약). 크롤+LLM판정 모두 비결정 → 같은 입력에 보고서 품질이 크게 흔들림. P6(크롤 안정화)+판정 안정화(샘플 확대/시드)로 완화 필요.

### C5. P6 적용 — discover 크롤 안정화 (런 편차 제거)
근본 원인: discover 검색이 `order=relevance`(YouTube 기본)라 최신·저조회 영상이 섞여, 키워드당 5만+ 통과 수가 런마다 9↔2로 출렁 → 빈/얇은 보고서. (CDP 스크랩은 등급만 추가, 영상 수에 영향 없음 — 영상 수는 search.list × 5만+ 필터에서 결정.)
- `services/youtube/src/discovery/deps.ts`: 발굴 검색을 **order='viewCount' + maxResults 50** 기본으로(searchOrder/searchMaxResults 옵션화). 상위 고조회 영상을 안정적으로 확보 → 5만+ 통과 수 안정.
- `plugin.ts`(key+pulling discover) + `dist/plugin.js`: searchMaxResults 25→50.
- `key-content-report.ts`: 영상 3개 미만 키워드를 provenance.notes에 기록(크롤 표본 부족 가시화).
- 검증: youtube jest 7/7(신규 2), l5-core jest 31/31, tsc 0. youtube/dist·l5-core/dist·plugin dist 재빌드/패치 완료.
- **선행조건**: 백엔드 1회 더 재시작(youtube/dist·l5-core/dist·plugin dist 모두 모듈 로드 시 require). 재시작 후 재실행 시 성공 신호 = 카페 등 인기 키워드가 매 런 다수 영상(≥수십개) 반환 → 빈 보고서 소멸.

### V3. P6 적용 후 재실행(04:42, 백엔드 DC 재시작) — 모든 수정 라이브 확인 + 잔여 레버
**전부 반영·동작 확인:**
- ✅ 대표향 선별: #1 = "대 충격… 매출 4000만원 상승 #식당마케팅"(identity match). content_topic = "마케터도 광고비도 없이 SNS 게시물 하나로 매출 올린 카페·식당 사장님들의 공통점".
- ✅ 논리적 근거(신 포맷 라이브): recommendation_reason이 "① 수요 근거(조회수 261,159 등 실수치) ② 타깃 정합 근거(identity match) ③ 다른 후보 대비 우위(조회수 3배·partial)…"로 데이터 기반 서술.
- ✅ 롱폼 편향 제거: 음식점 SNS 마케팅(롱폼 40%·높음/높음) → **진행 추천**. 형식으로 안 자름.
- ✅ P6 크롤 노트: "크롤 표본 부족(3개 미만): 소상공인, 미용실, 인스타 자동화" 보고서에 표시됨.
- ✅ 빈 보고서 해소: 직전 런(04:03) 후보 0 → 이번 후보 2·진행추천 1. order=viewCount가 안정화에 기여.

**잔여 레버(다음 후보):** 키워드별 영상 수가 여전히 0~7로 모뎀(카페7·음식점5·소상공인1·미용 0). 원인은 **니치 한국어 키워드는 조회수 5만+ 영상 자체가 적음** → order=viewCount는 상위 고조회를 안정 확보하지만 키워드에 5만+가 7개뿐이면 7개가 최대. `MIN_VIEWS=50,000` 임계치가 니치 키워드엔 높고, `videoCount<3` floor가 소상공인(1)·미용실(0)을 제외시킴.
- **제안 P7**: MIN_VIEWS를 니치 키워드에 적응(5만→2만 또는 키워드별 상대 임계치) + 소표본 강한 후보 살리기(P3). 이러면 보고서가 더 두툼해짐. (단 현재도 대표향·논리근거 보고서는 정상 산출 — 핵심 목표 달성.)

### V4. P5(레일/폼)는 코드 반영됐으나 미표시 — :3002가 프로덕션 빌드
- :3002는 `next-server`(next start, 프로덕션) — `next dev`(HMR) 아님. 소스 수정이 자동 반영 안 됨 → `next build` + 재시작 필요.
- 보고서 내용 수정(백엔드)은 전부 라이브 확인됨. P5(레일 접기·폼 숨김·라벨)만 프론트 재빌드 대기.
- 시작 스크립트는 3000 기본이나 실행 인스턴스는 `-p 3002`로 기동됨(PID 8615, next 14.2.29).

## 개선 제안 (running)

### P1. key-content-report 4단계·1단계 병렬화 (속도, 안전, 高 ROI)
- 4단계: `for (const c of finalCandidates)` → `await Promise.all(finalCandidates.map(async c => { ...transcript+salesLogic... }))`. 각 후보 독립이라 부수효과 없음. 단, llm rate-limit 있으면 동시성 cap(p-limit 등) 권장.
- 1단계: 키워드 루프도 동일하게 `Promise.all`. discover/getDurations는 외부 API라 동시성 3~4 cap 권장.
- 검증: `key-content-report.test.ts` 기존 테스트로 회귀 확인(rule 40 — scoring/순서 불변 검증).

---

### 4. 키 콘텐츠 보고서 완료 — 자동화는 동작, 필터 로직이 "부족함"의 원인
- **소요**: 약 5~7분(추정). console 오류 0.
- **자동화 검증 ✅**: CDP YouTube 확장 라이브로 성과도/기여도 등급 실제 수집됨(`plugin.ts:4199~4218`). 시장성 표에 실수치 표시. 사장님 의도(노출확률 미사용, 성과도/기여도 기반)와 아키텍처 일치 — `isQualifiedCandidate`가 성과도/기여도만 사용(L218~227), 노출확률은 풀링용 viewtrap-tools에만 존재.
- **결과 빈약**: `키워드 6개 분석 · 진행 0개 · 후보 1개 · 자막 0개`.

#### F2. verdict 로직의 롱폼 편향 → 高수요 키워드 제외 (핵심 갭)
`key-content-report.ts:198~215 decideVerdict`
- L205 `longformRatio < 0.2 → 제외`. 실데이터: "카페 마케팅 아이디어"는 **평균 1.27M·상위 5.56M·타깃높음·판매높음**인데 롱폼 11% 한 줄로 **제외**. 최고 수요 주제를 형식 비율만으로 버림.
- L210~211 `진행 추천`은 `longformRatio≥0.4 && videoCount≥8 && avgViews≥20K && targetFit=높음 && salesLink≠낮음` — 매우 빡셈. 롱폼 우세 키워드(미용실 100%·음식점 100%)는 영상 1~2개라 `videoCount<3`(L203)에 걸려 제외 → **진행 0개**.
- **상품 불일치**: 상품정보 파일상 채널 확장에 릴스·**쇼츠** 포함. 그런데 로직은 출력=롱폼 전제("롱폼 주제로 부적합"). 쇼츠 우세 키워드를 하드 제외하면 안 됨.
- **제안 P2**: (a) 롱폼/쇼츠를 키워드별로 **판정**(format 결정)하되 하드 제외하지 말 것, 또는 (b) 프로젝트 format에 따라 longform 임계치 파라미터화. 쇼츠 파이프라인이 있으니 "쇼츠 추천" verdict 추가가 자연스러움.

#### F3. 소표본 제외 + 얇은 후보 풀
- `videoCount<3 → 제외`(L203)가 강한 소표본 키워드(음식점·미용실)를 버림. discover가 searchMaxResults=25인데 적격 1~3개만 남음 → 발굴 필터가 과도하거나 키워드당 적격 영상이 적음. 후보 1개로 보고서가 얇아짐.
- **제안 P3**: 소표본이라도 성과도/기여도 Good+ & 조회수 高면 후보 유지(품질 우선). 또는 키워드 확장/유사어 보강.

#### F4. 자막 0개 — 판매논리 근거 약화 (신뢰도 갭)
`plugin.ts:4237~4246 fetchTranscript` (CDP "Show transcript" 스크랩 → 실패 시 서버 fetch 폴백)
- 최종 후보 전부 자막 미확보 → `salesLogicPrompt`가 자막 없이 메타데이터만으로 분석. 수익화/퍼널 분석 품질 저하.
- **제안 P4**: CDP 자막 스크랩 성공률 점검(패널 로딩 대기/재시도/언어 폴백). 자막 실패율을 보고서 notes에 노출(이미 notes 구조 있음)해 사장님이 신뢰도 가늠 가능하게.

### F6. 같은 입력 두 번 → 결과가 크게 다름 (런 비결정성, 신뢰도 갭)
- 동일 project_id로 `proposeKeyContentReport` 두 번 호출했는데 키워드 판정(보류↔진행)·후보 정체성(실무자↔대표)·자막 수(0→2)가 크게 흔들렸음. **결정론 보장 없음**.
- 가능한 원인 (다중):
  - **(a) discover 라이브 변동**: YouTube 검색 결과는 시간에 따라 바뀜 — pool에 들어오는 영상 자체가 달라짐. 가장 큰 비결정 소스.
  - **(b) CDP 등급 라이브 변동**: 성과도/기여도 라벨이 viewtrap 확장 측에서 시간에 따라 갱신되거나 일시 실패 시 빈 값으로 떨어짐 → isQualifiedCandidate 통과 영상이 달라짐.
  - **(c) LLM 비결정**: select/synthesis가 temperature>0이면 동일 풀이어도 후보 순위/주제가 달라짐 (확인 필요).
  - **(d) 자막 스크랩 재시도 성공률 변동**: CDP 패널 로딩 타이밍 의존.
- **영향**: 보고서를 한 번 보고 "납득 안 됨" 판단할 때 재실행이 안전망이지만, "이번 보고서가 우리 코드 기준 베스트"라는 신뢰가 흔들림. 키 콘텐츠는 사장님이 1주 단위로 보는 결과물이라 신뢰도 중요.
- **제안 P6**:
  - 보고서 notes에 **런 메타데이터**(discover seed/timestamp, 각 키워드 풀 size, CDP 등급 확보율, LLM temperature/model, 자막 확보율) 노출 → 사장님이 "이번 런은 풀이 얇았다"를 즉시 인지.
  - `proposeKeyContentReport`에 `cache_key`(project_id+동일일자) 옵션 추가 — 같은 날 재실행은 discover/등급 캐시 재사용(라이브 변동 차단).
  - LLM 호출 temperature 명시(현재 미확인) → 0 또는 낮은 고정값.
  - 회귀 가드(rule 40): 단위테스트는 결정론 보장 이미 있음(고정 fixture). 라이브 비결정은 운영 메타로 가시화하는 것이 현실적.

## 작업 로그 — 2026-06-12 11:33

### 백엔드 재기동 후 재검증
- 사장님 피드백: 첫 재실행(10:41)이 좋아진 결과를 냈으나 데이터에 옛 로직 지문 잔존(카페=보류, recommendation_reason 옛 포맷) → C1 코드가 실제 반영 안 된 의심.
- 원인 추정: dist는 10:32 빌드 정상이나 NocoBase 백엔드(:13000) 프로세스가 모듈 로드 시 require 캐시를 잡고 있어 dist 갱신이 반영되지 않음. 첫 재실행이 좋아 보인 건 라이브 discover/CDP 변동(F6)에 따른 우연.
- 조치: `launchctl kickstart -k gui/$UID/com.l5.nocobase` (KeepAlive 자동 재기동). 신 PID 23331 확인(11:33:20 기동).
- 재검증 트리거: `apps/founder-ui/e2e/rerun-key-content.mjs` (PID 23483, 11:33:52 시작). 로그 `/tmp/l5-rerun/run.log`.
- **새 로직 반영 시그널 (체크리스트)** — 11:40:40 회수 결과 전부 PASS:
  - [x] "카페 마케팅 아이디어" → verdict=`진행 추천` (롱폼 22%·타깃 높음·판매 높음, 형식: 쇼츠 우세). 옛 로직이면 longformRatio<0.4로 보류.
  - [x] `recommendation_reason` 4요소 포맷(①수요 근거 ②타깃 정합 ③다른 후보 대비 우위 ④판매논리 연결) — 각 주장에 수치(261262/155891/130019/81340) + 정체성 라벨(match/partial) 인용.
  - [x] verdictReason 끝에 `(형식: 쇼츠 우세/롱폼 우세)` 라벨만, 롱폼 비중 ≥0.4 요구 문구 부재. 쇼츠 우세 키워드(카페 22%)가 후보 풀에 정상 진입.
- **재실행 산출(요약, 11:40:40)**:
  - 최우선: "대 충격… 매출 4000만원 상승 #식당마케팅 #자영업" — identity=match(F&B 자영업 대표). 주제 "마케팅팀 없는 식당·카페 사장님이 SNS 하나로 매출 4000만 원 올린 실전 운영법" → 대표향 정확.
  - 시장성 판정 6/6 키워드 중 2개 진행 추천(카페·음식점), 4개 제외(타깃 낮음 or 표본 미달).
  - 후보 3개, 자막 수는 콘솔 요약에 없지만(스키마상 카드 raw에 있음) recommendation_reason 근거 풍부.
- **부수 관찰**: 폴링 중 02:38:53에 `fetch failed`(서버 응답 keep-alive 끊김) → 폴링이 02:40:40 카드 갱신을 회수. 운영상 timeout/disconnect는 정상 케이스이며 회수 경로 OK. F6 메타 노출 시 이런 끊김도 표기 후보.
