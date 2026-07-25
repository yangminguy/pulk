# TASKS — 태스크 보드

> 착수 전 [CLAUDE.md](./CLAUDE.md) → [CONTRACTS.md](./CONTRACTS.md) → [SCOPES.md](./SCOPES.md) 순으로 읽는다.
> **한 번에 한 태스크만 넘긴다.** 저장소 전체를 컨텍스트에 올리지 않는다.
> `docs/craft/`(편집 기준 4종)는 **어떤 코딩 태스크에도 포함하지 않는다.** 필요한 수치는 전부 `config/edit-profile.json`에 있다.

## 착수 프롬프트 형식

```
아래 문서를 읽어라:
- docs/cmo/video-pipeline/CONTRACTS.md
- docs/cmo/video-pipeline/SCOPES.md
- docs/cmo/video-pipeline/tasks/<해당 태스크>.md
- ~/brandboy-pipeline/spec/<해당 spec>.md
- ~/brandboy-pipeline/schema/pipeline.ts
- ~/brandboy-pipeline/config/edit-profile.json

<태스크 ID와 이름>을 구현해라.

작업 전:
- 태스크 문서의 "먼저 확인할 것"을 실제로 확인하고 결과를 보고해라
- 확인 결과가 문서와 다르면 구현을 시작하지 말고 먼저 알려라

작업 후:
- "완료 조건"을 검증하는 scripts/verify-<모듈>.ts 를 함께 만들고 실행 결과를 보여라
```

---

## 의존 그래프

```text
T0a ─→ T10 ─┬─→ T9b ─→ T1 ─→ T2 ─→ T3 ─→ T3b ─→ [plan 1회] ─→ T7(프록시 전량)
            ├─→ T9a                                                   │
            ├─→ T9c ─→ T8 (모션, 병행)                                 ↓
            └─→ T7b (ingest, 병행)                          T4 · 스토리보드 ★ ── 사장님 반복 승인 ②
T0b ──(T7 착수 조건)                                                   ↓
                                     review --apply → T7 고화질 → T5(assemble) → T6(qc) → T9d → T11
```

**실제 임계경로** (여기가 일정을 결정한다):

```
T0a → T10 → T1 → T2 → T3(850~1150줄, 최대) → plan 1회 → T7(프록시) → T4(스토리보드 ★ 승인 ②) → T5 → T6
```

T7·T8의 **구현**은 T3와 병렬 가능하나 **완료 판정**은 직렬이다. T7이 `beat.search_intent`로 검색하는데 비트는 `plan`이 만들고 `plan`의 입력은 `timeline.json`이기 때문(`spec/03-plan.md:14`). **T4(스토리보드)는 재생 검증에 T7의 프록시 클립 전량이 필요하고, 승인 후에야 T7 고화질·T5 전체 조립으로 넘어간다.**

---

## 보드

| ID | 이름 | 선행 | 규모 | 상태 | 문서 |
|---|---|---|---|---|---|
| **T0a** | 도구 사전검증 (P1·P1b·P2·P2b·P2c·P3·P4·P6) | — | 4~6h | ✅ 완료 (`preflight-report.md`) | [T0-preflight](./tasks/T0-preflight.md) |
| **T0b** | 검색 품질 게이트 `hit@5` | — (T1·T2와 병행) | 반나절~1일 | ✅ 하네스 완료 · **실측 대기(B1)** | [T0-preflight](./tasks/T0-preflight.md) |
| **T10** | brandboy 문서 rev5 개정 + `DIVERGENCE.md` | T0a | 반나절 | ✅ 완료 | [T10-docs](./tasks/T10-docs.md) |
| **T9a** | `harvest-sources.md` 개정 | T10 | 문서 | ✅ 완료 | [T10-docs](./tasks/T10-docs.md) |
| **T9b** | `plan-beats.md` 개정 (Z1 규약) | T10 | 문서 | ✅ 완료 | [T10-docs](./tasks/T10-docs.md) |
| **T9c** | `motion-scene.md` 개정 | T10·P2c | 문서 | ✅ 완료 | [T8-motion](./tasks/T8-motion.md) |
| **T1** | 타입 + `validate` (V13·V14·V14b·V15·V17a) | T0a·T10·T9b | ~600줄 | ✅ 완료 (verify-schema 23/23) | [T1-schema](./tasks/T1-schema.md) |
| **T2** | CLI 뼈대 + `writeScoped` + magic-number lint | T1 | ~400줄 | ✅ 완료 (scoped 8/8 · magic 0) | [T2-cli](./tasks/T2-cli.md) |
| **T3** | `align` + `reanchor` | T2 | 850~1150줄 | ✅ 완료 (align 5/5 · reanchor 6/6) | [T3-align](./tasks/T3-align.md) |
| **T3b** | 세션 접합 정합 | T3 | 150~200줄 | ✅ 완료 (sessions 3/3) | [T3-align](./tasks/T3-align.md) |
| **T7b** | `ingest` (A-roll 등록) | T2 | ~120줄 | ✅ 완료 (ingest 13/13) | [T7-harvest](./tasks/T7-harvest.md) |
| **T7** | 소스 어댑터 + 인덱스 + 프록시 + **`plan --apply` 편입** | T2·T0b·T3·plan1회·T9a | 700~950줄 | ✅ 완료 (harvest 10/10 · plan 5/5) | [T7-harvest](./tasks/T7-harvest.md) |
| **T4** | `review` HTML — **스토리보드 ★** (타이밍 부착·사진모션) | T2·P6·T7(프록시 전량) | 750~1050줄 | ✅ 완료 (review 15/15) | [T4-review](./tasks/T4-review.md) |
| **T8** | 모션 브릿지 + 사진 parallax | T2·P2c·T9c | ~200줄 | ✅ 완료 (motion 7/7, 실렌더) | [T8-motion](./tasks/T8-motion.md) |
| **T5** | `assemble` (사진 촬영모션 렌더) | T3b·T4(승인②)·T7·T7b·T8 | 900~1350줄 | ✅ 완료 (assemble 15/15) | [T5-assemble](./tasks/T5-assemble.md) |
| **★승인②** | 스토리보드 승인 (반복) | T4 | 사람 반복 | ⏳ 사람 대기 | [T4-review](./tasks/T4-review.md) |
| **T6** | `qc` | 승인②·T5 | ~350줄 | ✅ 완료 (qc 9/9) | [T6-qc](./tasks/T6-qc.md) |
| **T9d** | 프롬프트 3종 실주행 검증 | T5 | 문서/코드 | ✅ 완료 (t9d 9/9) | [T10-docs](./tasks/T10-docs.md) |
| **T11** | pulk `DECISIONS`/`TASKS`/`HANDOFF` 갱신 | 최종 | 문서 | ✅ 완료 (2026-07-25) | [T10-docs](./tasks/T10-docs.md) |

**실측 규모**: `src/` **8,825줄** + `scripts/`·`fixtures/` **3,480줄** = 약 **12,300줄**(TS). `tsc --noEmit` clean · no-magic-numbers 위반 0.

> **`plan --apply`는 T7에 편입돼 구현됐다** — `beat-plan.json` → `shot-plan.json`의 Z1 구역 `writeScoped` 병합(`src/commands/plan.ts`, `verify-plan` 5/5). 별도 태스크로 분리하지 않았다.

---

## 착수 순서 (권장)

### 1주차 — 사전검증 + 파라미터

1. **T0a** 도구 사전검증. 여기서 경로 A/B(whisper), A/C(capcut), A/D(알파)가 정해진다. **하나라도 미판정이면 다음 태스크 착수 금지.**
2. **시각 파라미터 세팅** (사람, T0a와 병행). 전달한 `frame.md` 기준, 부족분만 brandboy `edit-profile.json` 기본값으로 보충 → `profile_rev: 1`. **캘리브레이션 재측정 없음.**
3. **T0b** 검색 리콜 게이트 (T0a 이후, T1·T2와 병행 가능). **`hit@5`가 T7의 설계를 결정한다.**
4. **T10** brandboy 문서 개정. 이걸 안 하면 태스크 담당자가 받는 문서가 rev5 계약을 되돌린다.

### 2주차 — 기반

5. **T9b** → **T1** 스키마 + validate (+ `photo_motion`·V18). 여기가 모든 계약의 코드 표현이다.
6. **T2** CLI 뼈대 + `writeScoped`. 소유권 가드의 실체.

### 3~4주차 — 코어

7. **T3** align (최대 규모, **테이크 선택 없음**). **T3b** 세션 접합.
8. 병행: **T7b** ingest · **T9a**/**T9c** 프롬프트 개정 · **T8** 모션 브릿지 + 사진 parallax
9. T3 완료 후 **plan 1회 실행** → **T7 프록시 전량 수급**

### 5주차 — 스토리보드 승인

10. **T4 스토리보드**(타이밍 부착) 생성 → **★ 사장님 반복 승인 ②**
11. 승인 반영 `review --apply` → **T7 승인분 고화질 수급**

### 6주차 이후 — 조립·발행

12. **T5**(assemble) → **T6**(qc) → **T9d** → **T11**

---

## 공통 완료 규칙

모든 태스크는 다음을 만족해야 완료다.

- [ ] `npx tsc --noEmit` clean
- [ ] `npx tsx scripts/verify-no-magic-numbers.ts` 통과 (수치 하드코딩 0건)
- [ ] `scripts/verify-<모듈>.ts`가 존재하고 실행 결과가 첨부됨
- [ ] 태스크 문서의 완료 조건 체크박스가 전부 채워짐
- [ ] 사람 판정이 필요한 항목은 **판정자와 서명 기록**이 남음 (자동 통과 처리 금지)

## 하지 않을 것 (에이전트가 자주 과하게 만드는 영역)

- 웹 UI 서버 — `review`는 정적 HTML 파일 하나
- DB / ORM — 파일 시스템으로 충분
- 플러그인 아키텍처 — 소스 어댑터는 **고정 3종**
- 추상 기반 클래스 — 함수 시그니처만 맞추면 된다
- 자체 로거 라이브러리 — `console.error`로 충분
- 재시도 백오프 정책 엔진 — `edit-profile.json`의 고정 배열
- **수치 하드코딩** — 전부 `edit-profile.json`에서 읽는다

---

## 진행 기록

| 날짜 | 태스크 | 결과 |
|---|---|---|
| 2026-07-24 | 계획 수립 | deep-interview(ambiguity 17.1%) → consensus **rev5** (Architect·Critic 2라운드 완료) |
| 2026-07-24 | 개발 문서 작성 | 라우터·ARCHITECTURE·CONTRACTS·SCOPES·PORTING·TASKS·HANDOFF + tasks/ 8종 |
| 2026-07-25 | 워크플로우 개정 | 스토리보드 중심 전환 — 캘리브레이션·60초 파일럿 게이트 제거, 녹음→스토리보드 순서, 영상 우선·사진 parallax. 전 문서 반영 + `WORKFLOW.html` |
| 2026-07-25 | **레포 구현 완료** | `~/brandboy-pipeline` 신규 CLI 구축 — T0a/T0b하네스/T10/T9a~c/T1/T2/T3/T3b/T7b/T7(+plan --apply)/T4/T8/T5/T6 코드 완료(src 8,825줄 + scripts·fixtures 3,480줄). `plan --apply`는 T7에 편입. |
| 2026-07-25 | **T9d 실주행 검증** | 프롬프트 3종(plan-beats·harvest-sources·motion-scene) 실주행 → `scripts/t9d/verify-t9d.ts` 9/9. verify 14종 전부 그린(schema 23·scoped 8·align 5·reanchor 6·sessions 3·ingest 13·motion 7·plan 5·harvest 10·review 15·assemble 15·qc 9·t0b 8·t9d 9 · magic 0). `tsc --noEmit` clean. |
| 2026-07-25 | **T11 pulk 문서 갱신** | `DECISIONS`(factory 강등·신규 pipeline) + video-pipeline `HANDOFF`/`TASKS`/`CLAUDE` + `docs/cmo/CLAUDE` 갱신. DIVERGENCE에 T4 판단 2건(M키·locked_selection) 추가. |
