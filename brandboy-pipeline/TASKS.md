# TASKS — 태스크 보드 (rev5)

**한 번에 한 태스크만 넘긴다.** 저장소 전체를 컨텍스트에 올리지 않는다.

각 태스크에 넘길 문서는 `읽을 것` 열에 있다. `docs/craft/`는 어떤 코딩 태스크에도 포함되지 않는다.
계약 정본은 video-pipeline 개발 문서 `CONTRACTS.md`(소유권·재고정·검증 V13~V18) · `SCOPES.md`(화질 2단·무효화·`--only`/`--pilot`)다.

---

## 프롬프트 형식

```
아래 문서를 읽어라:
- CONTRACTS.md · SCOPES.md
- docs/IMPLEMENTATION.md 의 "공통 구현 규약" 절
- <해당 spec 파일>
- schema/pipeline.ts
- config/edit-profile.json

<태스크 ID와 이름>을 구현해라.

작업 전:
- spec의 "먼저 확인할 것" 항목을 실제로 확인하고 결과를 보고해라
- 확인 결과가 spec과 다르면 구현을 시작하지 말고 먼저 알려라

작업 후:
- spec의 "완료 조건"을 검증하는 scripts/verify-<모듈>.ts 를 함께 만들고
  실행 결과를 보여라
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

**임계경로**: T0a → T10 → T1 → T2 → T3(850~1150줄, 최대) → plan 1회 → T7(프록시) → T4(스토리보드 ★ 승인 ②) → T5 → T6

T7·T8의 **구현**은 T3와 병렬 가능하나 **완료 판정**은 직렬이다. T4(스토리보드)는 재생 검증에 T7의 프록시 클립 전량이 필요하고, 승인 후에야 T7 고화질·T5 전체 조립으로 넘어간다.

---

## 태스크

| ID | 이름 | 읽을 것 | 선행 | 규모 |
|---|---|---|---|---|
| **T0a** | 도구 사전검증 (P1·P1b·P2·P2b·P2c·P3·P4·P6) | `spec/00-preflight.md` | — | 4~6h |
| **T0b** | 검색 품질 게이트 `hit@5` | `spec/04-harvest.md` | — (T1·T2 병행) | 반나절~1일 |
| **T10** | brandboy 문서 rev5 개정 + `docs/DIVERGENCE.md` | 이 파일 · `CONTRACTS.md` | T0a | 반나절 |
| **T9a** | `harvest-sources.md` 개정 | `prompts/harvest-sources.md` | T10 | 문서 |
| **T9b** | `plan-beats.md` 개정 (Z1 규약) | `prompts/plan-beats.md` | T10 | 문서 |
| **T9c** | `motion-scene.md` 개정 | `prompts/motion-scene.md` | T10·P2c | 문서 |
| **T1** | 타입 + `validate` (V13·V14·V14b·V15·V17a·V18) | `spec/01-schema.md` | T0a·T10·T9b | ~600줄 |
| **T2** | CLI 뼈대 + `writeScoped` + magic-number lint | `docs/IMPLEMENTATION.md` | T1 | ~400줄 |
| **T3** | `align` + `reanchor` | `spec/02-align.md` | T2 | 850~1150줄 |
| **T3b** | 세션 접합 정합 | `spec/02-align.md` | T3 | 150~200줄 |
| **T7b** | `ingest` (A-roll 등록) | `spec/04-harvest.md` | T2 | ~120줄 |
| **T7** | 소스 어댑터 + 인덱스 + 프록시 (영상 우선·화질 2단) | `spec/04-harvest.md` | T2·T0b·T3·plan1회·T9a | 700~950줄 |
| **T4** | `review` HTML — **스토리보드 ★** (타이밍 부착·사진모션) | `spec/05-review.md` | T2·T7(프록시 전량) | 750~1050줄 |
| **T8** | 모션 브릿지 + 사진 parallax | `spec/06-motion.md` | T2·P2c·T9c | ~200줄 |
| **T5** | `assemble` (사진 촬영모션 렌더) | `spec/07-assemble.md` | T3b·T4(승인②)·T7·T7b·T8 | 900~1350줄 |
| **★승인②** | 스토리보드 승인 (반복) | `spec/05-review.md` | T4 | 사람 반복 |
| **T6** | `qc` | `spec/08-quality.md` | 승인②·T5 | ~350줄 |
| **T9d** | 프롬프트 3종 실주행 검증 | `prompts/*` | T5 | 문서 |
| **T11** | pulk `DECISIONS`/`TASKS`/`HANDOFF` 갱신 | — | 최종 | 문서 |

**합계 규모**: `src/` 5,020~6,370줄 + `scripts/verify-*` & `fixtures/` 500~1,000줄 = **5,520~7,370줄**

`spec/03-plan.md` `spec/04-harvest.md` `spec/06-motion.md`는 **코드 태스크가 아니다.** 에이전트가 수행하는 작업의 계약이며, 산출물 검증만 T1의 `validate`가 담당한다. 각 프롬프트 개정이 T9a(harvest)·T9b(plan)·T9c(motion)다.

---

## 태스크별 완료 조건 요약

전문은 각 spec의 "완료 조건" 절에 있다.

### T1 — 타입 + validate
- `schema/pipeline.ts`가 rev5 추가 필드를 반영한다 (`anchor`·`timing_rev`·`locked_selection`·`writers.seal`·`photo_motion`·`coverage_gap` 등)
- 예시 프로젝트가 검증을 통과한다
- 의도적으로 망친 케이스가 **각각 지정된 규칙에서만** 실패한다 (치명 12종 + V13·V14·V14b·V15·V17a·V18)
- 모든 수치가 `config/edit-profile.json`에서 로드된다. **하드코딩 0건**

### T2 — CLI 뼈대 + writeScoped
- `pipeline --help`, stdout은 JSON, 진행 로그는 stderr
- 원자적 쓰기 (임시 파일 → rename)
- `writeScoped(zone)`가 구역 밖 필드 변경 시 abort + `writers.seal` 갱신
- `locked_selection: true` 인 샷을 `--force` 없이 덮어쓰지 않는다

### T3 — align + reanchor
- NG 3회 포함 녹음에서 마지막 테이크만 남는다
- 연속 마스터에 클릭·음량 펌핑이 없다
- `timeline.json`의 모든 문장에 단어 시각이 있다
- 자막 텍스트가 **원고와 완전히 일치**한다 (ASR 결과 아님)
- `reanchor`가 `sentence_key`와 `align-remap.json` status 6종을 규칙대로 처리한다
- `--dry-run`이 파일을 만들지 않는다

### T4 — review (스토리보드)
- 정적 HTML 하나로 동작한다 (서버 불필요)
- **동영상 후보가 실제 인·아웃 구간으로 재생된다** (전 비트 프록시)
- `[` `]` 조정이 결정 로그에 append되고 `review --apply` 병합 시 `locked_selection: true`가 된다
- 선택이 자동으로 다음 비트로 넘어가지 않는다
- 결과가 결정 로그 파일로 저장된다 (클립보드·`localStorage` 의존 없음)

### T5 — assemble
- CapCut 초안이 열리고 **10트랙**이 배치된다 (V1~V6 · A1~A4)
- 루프 0건, 승인되지 않은 샷 0건
- 총 길이가 내레이션 마스터와 ±0.2초
- 출처 표기가 `sources/usage.json`에서 자동 생성된다
- 사진 촬영모션(parallax/켄번즈)이 렌더된다
- `music-cues.json` `sound-cues.json`이 출력된다

### T6 — qc
- `qc-report.json`의 모든 수치가 `edit-profile.json` 기준과 대조된다
- 치명 오류를 데이터로 판정 가능한 것만 자동 검사한다
- `fix-list.json`이 P0/P1/P2로 분류돼 나온다
- **사람 검수가 필요한 항목은 `"verdict": "human_required"`로 명시한다.** 통과 처리하지 않는다

---

## 공통 완료 규칙

모든 태스크는 다음을 만족해야 완료다.

- [ ] `npx tsc --noEmit` clean
- [ ] `npx tsx scripts/verify-no-magic-numbers.ts` 통과 (수치 하드코딩 0건)
- [ ] `scripts/verify-<모듈>.ts`가 존재하고 실행 결과가 첨부됨
- [ ] spec의 완료 조건 체크박스가 전부 채워짐
- [ ] 사람 판정 항목은 **판정자와 서명 기록**이 남음 (자동 통과 처리 금지)

## 하지 않을 것

에이전트가 자주 과하게 만드는 영역이라 명시한다.

- 웹 UI 서버 — `review`는 정적 HTML 파일 하나다
- DB / ORM — 파일 시스템으로 충분하다
- 플러그인 아키텍처 — 소스 어댑터는 고정이다
- 추상 기반 클래스 — 함수 시그니처만 맞추면 된다
- 자체 로거 라이브러리 — `console.error`로 충분하다
- 재시도 백오프 정책 엔진 — `edit-profile.json`의 고정 배열이면 된다
- **수치 하드코딩** — 전부 `edit-profile.json`에서 읽는다
