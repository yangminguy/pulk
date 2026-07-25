# HANDOFF — 현재 상태

**최종 갱신**: 2026-07-25

## 한 줄

브랜드 다큐 롱폼 편집 파이프라인(`pipeline` CLI). **코드 구현 완료 — 레포 `~/brandboy-pipeline`.** 자동 게이트(verify 14종)는 전부 그린. 남은 것은 **사람 판정 대기 항목 소진 + 첫 실전 프로젝트**다.

## 지금 어디에 있나 (2026-07-24 설계완료 → 07-25 구현완료)

- 레포: **생성됨** `~/brandboy-pipeline`. 커밋은 오케스트레이터 소유(에이전트 미커밋 WIP).
- 코드 규모: `src/` **8,825줄** + `scripts/`·`fixtures/` **3,480줄** = 약 **12,300줄**(TS).
- 원본 문서 rev5 개정(T10) + 프롬프트 3종(T9a~c) + 실주행 검증(T9d) + `docs/DIVERGENCE.md` 완료.
- 환경 실측: ffmpeg 8.1.1 · yt-dlp 2026.07.04 · faster_whisper 1.2.1 · capcut-cli 0.15.0 · hyperframes **0.7.71 핀** · node 24.14.1.

## 구현 완료 — 태스크 → 정본 파일 → verify

| 태스크 | 무엇 | 정본 파일(`~/brandboy-pipeline`) | verify |
|---|---|---|---|
| **T0a** | 도구 사전검증 (P1~P6) | `preflight-report.md` · `.preflight/` | 계약 첨부 |
| **T0b** | 검색 품질 게이트 하네스 (`hit@5`) | `scripts/t0b/*` · `eval/` | `verify-t0b` 8/8 (합성 hit@5=1.0, **실측 대기**) |
| **T10·T9a~d** | 원본 문서 rev5 개정 + 프롬프트 3종 | `spec/*` · `prompts/*` · `docs/DIVERGENCE.md` | `verify-t9d` 9/9 |
| **T1** | 타입 + `validate` (V1~V18) | `src/schema/pipeline.ts` · `src/commands/validate.ts` | `verify-schema` 23/23 |
| **T2** | CLI 뼈대 + `writeScoped`(Z1/Z2/Z3) + magic lint | `src/cli.ts` · `src/lib/io.ts` · `src/lib/canonical.ts` | `verify-scoped-write` 8/8 · magic **0** |
| **T3** | `align` + `reanchor` (단어 시각·시각 재고정) | `src/align/*` · `src/commands/{align,reanchor}.ts` | `verify-align` 5/5 · `verify-reanchor` 6/6 |
| **T3b** | 세션 접합 정합 | `src/align/sessions.ts` | `verify-sessions` 3/3 |
| **T7b** | `ingest` (A-roll 등록) | `src/commands/ingest.ts` | `verify-ingest` 13/13 |
| **T8** | 모션 브릿지 + 사진 parallax | `src/motion/bridge.ts` | `verify-motion` 7/7 (실렌더) |
| **T7 (+plan --apply)** | 소스 어댑터·인덱스·프록시 + `beat-plan` 병합 | `src/harvest/*` · `src/commands/{harvest,plan}.ts` | `verify-harvest` 10/10 · `verify-plan` 5/5 |
| **T4** | `review` 스토리보드 HTML + `review --apply` | `src/review/*` | `verify-review` 15/15 |
| **T5** | `assemble` (CapCut 초안 + 순번 세트) | `src/assemble/*` · `src/commands/assemble.ts` | `verify-assemble` 15/15 |
| **T6** | `qc` (정량 리포트) | `src/commands/qc.ts` | `verify-qc` 9/9 |

> `plan --apply`(beat-plan → shot-plan Z1 병합)는 T7에 편입돼 구현됐다(`src/commands/plan.ts` · `verify-plan`).

## 검증 게이트 (14종 전부 그린 — 2026-07-25 실측)

| verify | 결과 | | verify | 결과 |
|---|---|---|---|---|
| schema | **23/23** | | plan | **5/5** |
| scoped-write | **8/8** | | harvest | **10/10** |
| align | **5/5** | | review | **15/15** |
| reanchor | **6/6** | | assemble | **15/15** |
| sessions | **3/3** | | qc | **9/9** |
| ingest | **13/13** | | t0b | **8/8** (hit@5=1.0, path A) |
| motion | **7/7** | | **t9d** | **9/9** |
| no-magic-numbers | **위반 0** (src 43파일 스캔) | | `tsc --noEmit` | **clean** |

## 사람 판정 대기 (자동 통과 처리 금지 — 판정자·서명 필요)

자동 게이트는 통과했지만 **사람만 판정할 수 있는** 항목이다. 첫 실전 영상 진행 중 소진한다.

| # | 항목 | 게이트 | 방법 | 근거 |
|---|---|---|---|---|
| H1 | CapCut.app에서 `smoke` 초안 열림 육안 | T0a/T5 | CapCut 재시작 → "smoke" 초안 열기 | preflight P2 |
| H2 | CapCut 알파(mov) 오버레이 인식 | T0a/T8 | T8 렌더물을 V3 트랙에 얹어 확인. 실패 시 경로 D(단색 배경) | preflight P3 |
| H3 | 실 Safari `file://` 재생·다운로드 | T0a/T4 | `.preflight/p6.html` 열기 (위험 낮음) | preflight P6 |
| H4 | `similarity_threshold` 실녹음 재확인 | T3 | 첫 세션 녹음 후 `align-report` low_confidence 분포 확인 (현재 0.75 잠정) | preflight P1b |
| L1 | 연속 마스터 청취 — 클릭·펌핑·룸톤 급변 없음 | T3 | 직접 청취 | spec/02-align §7-2 |
| L2 | 30초 단위 청취 샘플 + 전체 파형 검사 | T3 | 직접 청취 | spec/02-align §7-7 |
| B1 | **`hit@5` 실측** — 참조 브랜드 선정 + 사장님 판정 | T0b(→T7 착수 조건) | 참조 브랜드로 의도 10건 판정. `hit@5 ≤ 0.3`이면 검색 경로 재설계 | preflight §T0b |
| ★② | **스토리보드 승인** (반복) | T4 | 전 비트 프록시 재생 반복 검수 → 화면 선택·인아웃 확정 | spec/05 §6 |
| C1 | CapCut 초안 육안 | T5 | 조립된 초안을 CapCut에서 열어 확인 | D2 |
| ★③ | **최종 4회 시청 승인** | 마감 | 실제 속도로 4회 시청 후 발행 승인 | D6 승인③ |

## 다음 액션 — 첫 실전 프로젝트

```text
0. (오케스트레이터) ~/brandboy-pipeline 커밋/브랜치 확정
1. 시각 파라미터 세팅 — 전달 frame.md 기준 + 부족분 edit-profile 기본값 → profile_rev 고정
2. B1: 참조 브랜드 선정 → T0b hit@5 실측 (≤0.3 이면 검색 경로 재설계 후 재개)
3. 원고 잠금(sentence_key 부여) → 세션 분할 녹음 → pipeline align → L1·L2 청취
4. pipeline plan --apply → reanchor → T7 프록시 전량 수급 · T8 critical 모션
5. pipeline review (스토리보드 HTML) → ★② 반복 승인 → review --apply
6. T7 승인분 고화질 → pipeline assemble(CapCut 초안) → C1 육안 → pipeline qc
7. ★③ 4회 시청 승인 → 발행
```

## 주의

- **자동 게이트 그린 ≠ 완료.** 위 사람 판정 대기 10건은 자동 통과 처리 금지(`TASKS.md` 공통 완료 규칙).
- **B1 `hit@5` 실측 전 T7 실운영 금지.** 자막 검색이 파이프라인 가치의 절반이고 폴백이 없다.
- **스토리보드 승인(★②) 전에 고화질 수급도 전체 조립도 하지 않는다** (`spec/04-harvest.md`).
- factory(`~/ai-slide-video-factory`)는 모션 공급 서브시스템으로 강등. pulk `render-pipeline.ts`(슬라이드덱 렌더) 소비자는 **무영향**.
- 원본 문서 개정 추적은 `~/brandboy-pipeline/docs/DIVERGENCE.md`.
