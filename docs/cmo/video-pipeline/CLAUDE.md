# Video Pipeline — 영역 라우터

> 브랜드 다큐 롱폼 편집 파이프라인(`pipeline` CLI)의 개발 문서 인덱스.
> 새 세션은 이 파일부터 읽고 필요한 문서로 분기한다. 문서 1개는 250~300줄 이내.

## 한 줄

원고와 사람 녹음에서 출발해 **외부 원본의 정확한 구간을 자막 검색으로 찾아내고**, 사람이 검수한 샷을 **CapCut 초안**으로 조립해, 정량 QC를 통과시킨 **12~20분 브랜드 다큐**를 반복 생산하는 독립 CLI 파이프라인.

**기존 `ai-slide-video-factory`와 다르다.** 그쪽은 *AI가 슬라이드 화면을 생성하는* Remotion 렌더 엔진이고, 이쪽은 *AI가 실제 원본에서 화면을 찾아오는* 편집 조립 파이프라인이다. 최소 단위부터 다르다 — 씬(3~20초) vs **의미 비트(1.5~5초)**.

## 지금 어디에 있나

- **코드 구현 완료 (2026-07-25).** 레포 **`~/brandboy-pipeline`** — GitHub: **[yangminguy/brandboy-pipeline](https://github.com/yangminguy/brandboy-pipeline)** (private, 독립 npm 레포. pnpm 워크스페이스와 별개 — ARCHITECTURE.md 결정). `pipeline` CLI 전 명령(`validate`·`ingest`·`align`·`reanchor`·`plan --apply`·`harvest`·`review --apply`·`assemble`·`qc`) + 모션 브릿지 + **Resolve OTIO 이미터(경로 R, 미디어 자동 스테이징)**. `src/` 8,800줄+ · `scripts/`·`fixtures/` 3,900줄+. **verify 16종 전부 그린 · `tsc --noEmit` clean · no-magic-numbers 위반 0 · architect APPROVED · ultraqa 2사이클.**
- 현재 상태·검증 게이트·**사람 판정 대기 항목**·다음 액션: [HANDOFF](./HANDOFF.md).
- 원본 문서(`~/Downloads/brandboy-pipeline/` 시작점)의 rev5 개정 추적: `~/brandboy-pipeline/docs/DIVERGENCE.md`.
- (참고) 합의 실행 계획 `.omc/plans/brandboy-editing-pipeline-consensus-plan.md`(**rev5**) · 요구사항 명세 `.omc/specs/deep-interview-brandboy-editing-workflow.md`(ambiguity 17.1%).

## 문서 맵

| 문서 | 무엇 | 언제 본다 |
|---|---|---|
| [WORKFLOW.html](./WORKFLOW.html) | **제작 워크플로우 시각 설명(스토리보드 중심)** · 승인 지점 · Claude Code 기능 활용 | 흐름을 한눈에 볼 때 |
| [HANDOFF](./HANDOFF.md) | 현재 상태 · 다음 액션 | 세션 시작 시 |
| [TASKS](./TASKS.md) | T0~T11 태스크 보드 · 의존 그래프 · 착수 순서 | "다음 뭐 할까" |
| [ARCHITECTURE](./ARCHITECTURE.md) | 레포 구조 · 외부 경계 · 데이터 흐름 · 제작 워크플로우 11단계 | 구조를 알아야 할 때 |
| [CONTRACTS](./CONTRACTS.md) | **필드 구역 소유권 · writeScoped · 시각 재고정 · 검증 규칙 V13~V17** | **코드 쓰기 전 필수** |
| [SCOPES](./SCOPES.md) | **화질 2단 스코프(프록시→고화질) · 프로필 무효화 표 · `--only`/`--pilot` 단위** | **코드 쓰기 전 필수** |
| [PORTING](./PORTING.md) | factory 이식 6종 (파일·줄번호·변환 규칙) | M1~M6 이식 시 |
| [tasks/](./tasks/) | 태스크별 실행 계약(입출력·절차·완료조건·검증 명령) | 그 태스크 착수 시 |

## 변경 불가 결정 (Founder 확정, 2026-07-24)

| # | 결정 |
|---|---|
| D1 | **새 독립 `pipeline` CLI 신규 구축.** `~/ai-slide-video-factory`는 모션그래픽 공급 서브시스템으로 강등 |
| D2 | 조립은 P2(capcut-cli) 검증 후 **CapCut 초안(경로 A)**, 실패 시 **순번 파일 세트(경로 C)** |
| D3 | 내레이션은 **사람이 세션 분할·무재테이크 녹음 후 접합** (TTS 아님). 코드는 빈 공백 정리 + 세션 접합 + 연속 마스터만. **테이크 선택 없음** |
| D4 | 소스 수급은 **자막·메타 전량 → 인덱스 → 승인 구간만 고화질**. **영상 우선, 사진은 핵심 강조 비트에만.** 어댑터 다중, 플러그인 아키텍처 금지 |
| D5 | 모션은 **critical 비트만** hyperframes로 신규 저작(총량 낮게). **사진 촬영모션은 parallax 기본**으로 다 생성 → 사장님이 스토리보드에서 확정(다운그레이드=켄번즈) |
| D6 | 순서: 사전검증 → **시각 파라미터 1회 세팅** → 스키마/CLI → **녹음→align** → harvest/motion → **스토리보드 승인(★)** → assemble → qc. **캘리브레이션·60초 파일럿 게이트 제거** |
| D7 | 시각 파라미터는 전달한 **디자인 파일 `frame.md`**에서 1회 세팅, 부족분만 brandboy `edit-profile.json` 기본값으로 보충. **매 영상 재측정 없음** |

## 핵심 원칙 (5개 — 코드 쓰기 전 읽는다)

1. **결정론적인 것만 코드로 만든다.** 타임코드·클릭 UI·CapCut JSON·정량 판정은 코드. 탐색·판단은 에이전트. 말맛·최종 컷은 사람.
2. **수치는 `config/edit-profile.json`(+`frame.md`) 한 곳에만 존재한다.** 코드에 상수 리터럴이 남으면 그 자체가 결함이다. `scripts/verify-no-magic-numbers.ts`가 강제한다.
3. **실패를 숨기지 않는다.** 단 중요도별로 다르게 멈춘다 — `critical`은 중단하고 사람에게, `normal`은 검수로 올림, `bridge`는 그대로 진행.
4. **필드마다 작성자는 하나고, 모든 작성자는 CLI를 지난다.** 에이전트도 브라우저도 자기 전용 파일에만 쓰고 `<cmd> --apply`가 병합한다. → [CONTRACTS](./CONTRACTS.md)
5. **스토리보드가 전체 조립보다 먼저다.** 스토리보드 승인(★) 전에는 승인 구간 **고화질 수급도 전체 조립도** 하지 않는다.

## 하지 않을 것

- 슬라이드덱 파이프라인 확장 (유지만, 모션 공급기로 사용)
- Remotion 풀렌더로 mp4 자동 완성 (최종 컷은 사람이 실제 속도로 보고 승인)
- 웹 UI 서버 — `review`는 정적 HTML 파일 **하나**
- DB / ORM — 파일 시스템으로 충분 (`TASKS.md:102`)
- 플러그인 아키텍처 · 추상 기반 클래스 · 자체 로거 · 재시도 정책 엔진
- AI 이미지·영상 생성 · YouTube 자동 업로드
- 스톡 의존 (`ratios.stock_max = 0.1`)
- `fallback_text`로 빈 화면 자동 완료 처리

## 환경 실측 (2026-07-24)

| 도구 | 상태 |
|---|---|
| `ffmpeg` | **8.1.1** (시스템). Remotion 번들 ffmpeg는 필터 제약 있어 사용 금지 |
| `yt-dlp` | **2026.07.04** |
| `faster_whisper` | OK (`/usr/bin/python3`). `whisper` CLI는 미설치 |
| `capcut-cli` | **0.15.0** 설치·검증 완료 (T0a/P2, doctor ok) |
| CapCut.app | 설치됨. 초안 폴더 `~/Movies/CapCut` |
| `npx hyperframes` | **0.7.71 핀 확정**(`package.json`, T0a/P2c). `@latest` 금지 |
| `~/ai-slide-video-factory` | `feature/cmo-video-upgrade`, 11 modified + untracked. **이식 대상 4파일은 clean** |

## 작업 완료 시

- 이 디렉토리의 `HANDOFF.md`·`TASKS.md`를 갱신 (전역 `docs/` 아님)
- 구조 결정은 전역 `docs/DECISIONS.md`에 한 줄
- brandboy 원본 문서를 고쳤으면 `~/brandboy-pipeline/docs/DIVERGENCE.md`에 기록
- 문서가 300줄 넘으면 쪼개고 이 문서 맵에 링크 추가
