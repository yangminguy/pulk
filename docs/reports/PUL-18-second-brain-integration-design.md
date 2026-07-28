# PUL-18 B·C — 세컨브레인 기획 점검 + RAG→Paperclip 통합 설계 (CTO)

작성: 2026-07-28 · 근거: 세컨브레인 코드 직접 조사 3팀(한글 브레인 / Paperclip 주입면 / 영문 corpus+pulk 소비경로).
CEO 지시: (B) "그 RAG를 Paperclip에 붙여 **모든 에이전트가 회사 맥락 공유** + **개발 오류/시행착오 축적**해 반복 방지, researcher 기반 활용법 확인 후 task화" / (C) "세컨브레인 **기획 먼저 점검**".

---

## A. 세컨브레인 기획 점검 결론 (C 답변)

### A-1. 한글 `~/세컨 브레인` = 정본. CEO 비전과 이미 정합.
- PRD flagship 유스케이스(`PRD.md:18`)가 **"CTO 세컨브레인 = 개발방법·최신지식·피드백 이력을 축적해 에이전트를 점점 똑똑하게"** — CEO의 "개발 오류/시행착오 축적" 요청과 **문장 그대로 일치**. 새 시스템 불필요.
- 이미 **멀티브레인 네임스페이스**(`personal`/`biz`/`dev`) 존재. **`dev` 브레인 771 cards** = 개발 맥락 축적의 정본 후보.
- 거버넌스 불변식(`CLAUDE.md:13-20`): 카드=markdown 1정본, 쓰기=git 커밋 1회, 에이전트 쓰기는 **사람 리뷰 후 정본화**.

### A-2. 영문 `~/second-brain`은 "두 번째 브레인"이 아니다 — pulk research-engine의 출력 저장소.
- `services/research-engine/src/config.ts:53` → `~/second-brain/research`가 research-engine의 `RESEARCH_STORE_DIR`. 유튜브→원자 707→book 합성 **파이프라인 산출물**이지 조회 브레인이 아님(retriever 없음 = 조회상 dead corpus).
- 이미 **한글 브레인과 연결**됨: `services/research-engine/src/adapters/brain-cards.ts`가 합성 원칙을 한글 브레인에 `add_card`로 push.
- 임베딩 모델 **양쪽 동일**(fastembed `paraphrase-multilingual-MiniLM-L12-v2`, 384d) → 이관 시 재벡터화 불필요, 스키마 변환만.
- **결론: "브레인 2개 수렴"은 재정의된다.** 경쟁 시스템이 아니므로 통합 급하지 않음. 707 raw atoms의 dev/biz 브레인 이관은 저위험·저우선 후속. 지금은 **한글 브레인 단일 정본화**만 확정.

### A-3. 쿼리 경로 — 맥락주입엔 `brain_search`, `brain_ask` 아님.
- `brain_search`(`server.py:37`) / `tempr.search()` = **게이트 없음**, 항상 raw top-k 인용(slug/claim/score/url) 반환 → 에이전트 맥락주입에 적합.
- `brain_ask`(`ask.py:61`)는 LLM 심판 게이트(SEM_FLOOR 0.40, judge band 0.40–0.78). 거절 시 **인용을 통째로 버리고 빈손** → PUL-17/PUL-18이 지적한 "조용한 무효화"의 원인. 맥락주입엔 부적합.

### A-4. 쓰기 경로 함정 — MCP `brain_add`는 staging(사람 승인 필요).
- `store.py:72-89`: `created_by != "user"`면 카드를 `memory_candidates`에 **pending으로 적재, 검색 불가**. `review.py` 사람 승인 필요. 현재 backlog **biz 1,577 / personal 45** 미승인.
- 즉 개발오류를 MCP로 자동 축적하면 **조용히 pending 큐에 쌓이고 검색 안 됨**. → 신뢰 내부 에이전트용 `bypass_staging`/`created_by="user"` 경로 필요(거버넌스 결정, §C-3).

### A-5. pulk 소비경로 결함(참고 — PUL-21 이후 정리 대상).
- `secondbrain-transport.ts:24` 하드코딩 경로 `/Users/wonminyang/세컨 브레인`, 기본 브레인 `biz`, **기존 MCP 서버 우회하고 spawn**.
- 경로/venv 없으면 **null=graceful disable**(`:27`), 쿼리 오류도 `catch{return []}`(`:102`). **health/도달성 표면 전혀 없음**.
- empty 인사이트면 `second-brain-merge.ts:36`가 **hard-throw**(원고 구조 확정 차단). `business-pt-context.ts`는 무인용 기본값으로 fallback.

---

## B. 주입 표면 — 어디에 붙이나 (B 답변)

Paperclip 에이전트 시스템 프롬프트 = **스킬 프리앰블 + 그 에이전트의 `AGENTS.md` 전문 + wake payload**. **공유 지시 파일이 없다.** 회사 맥락이 지금은 각 `AGENTS.md`의 inline `회사 맥락 (pulk)` 블록(:9/:11)에 **복붙되어 에이전트마다 drift** 중.

**가장 깨끗한 주입면 = `company-context` 회사 스킬 1개를 전 에이전트에 sync** (또는 `paperclip`/`para-memory-files`처럼 adapter-default로 승격). 이 스킬이 담을 것:
1. **회사 맥락 1정본**(현 drift하는 inline 블록 대체).
2. **세컨브레인 read/write 호출법**(Bash CLI): 읽기=`brain_search --brain dev/biz`, 쓰기=`brain_add`(dev, 개발오류/결정).

> 온디스크 `.mcp.json` 없음 · MCP는 Paperclip 제어면에서 게이팅. 따라서 1차는 **에이전트가 Bash로 세컨브레인 venv CLI를 직접 호출**하는 방식(스킬이 명령을 문서화)이 가장 견고. MCP 제어면 배선은 후속.

---

## C. 실행 분해 (child issues)

| # | 목적 | 소유 | 선행 | 비고 |
|---|---|---|---|---|
| **B1** | `company-context` 스킬 + 세컨브레인 read/write CLI 계약. **CTO+Researcher 파일럿** + 라이브 검증(조회가 인용 반환, 쓰기가 dev 브레인에 안착) | Founding Eng | — | 전 에이전트 rollout 아님 |
| **B2** | pulk RAG 소비 정직화: health 표면화 + `brain_search`(게이트 없는) 사용 + empty hard-throw 완화 + (가능시)MCP 전환 | Founding Eng | PUL-21(D) | P2 "조용한 무효화" 해소 |
| **B3** | `dev` 브레인 **개발오류/시행착오 축적 경로** + staging 정책 구현 | Founding Eng | B1 | §C-3 거버넌스 결정 반영 |
| **R** | Researcher: **세컨브레인을 개발에 어떻게 활용하는지** 조사 + dev 브레인 시드 카드 작성 | Researcher | — | CEO 명시 요청 |
| **B4** | 파일럿 검증 후 **전 에이전트 rollout**(company-context sync, inline 블록 대체) | Founding Eng | B1 + **CEO 승인** | 전 에이전트 config 변경 → 승인 게이트 |

### C-3. CEO 결정 필요 2건
1. **개발오류 자동 축적 거버넌스**: 신뢰 내부 에이전트(CTO/Researcher/Founding Eng)의 `dev` 브레인 쓰기를 (a) **bypass_staging=즉시 검색가능**(세컨브레인 human-review 불변식을 `dev`에 한해 완화) vs (b) staging+주기 리뷰. **CTO 권고 (a)** — 매 개발로그를 사람이 승인하면 "반복방지" 목적이 무력화, biz 1,577 backlog가 그 증거. `biz`/canonical은 (b) 유지.
2. **전 에이전트 rollout(B4) 시점**: 파일럿(B1) 검증 후 전 에이전트에 company-context를 sync해 inline 맥락 블록을 대체 — 승인?

### 보류(재확인): 영문 corpus 707 atoms 이관·pulk MCP 전면전환은 저우선 후속. 지금은 한글 dev 브레인 정본화 + 파일럿 + pulk 정직화까지.
