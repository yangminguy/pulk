# DIVERGENCE — rev5 개정 추적

> brandboy-pipeline 원본 문서를 video-pipeline **rev5 계약**(`CONTRACTS.md`·`SCOPES.md`, Planner→Architect→Critic 2라운드 합의)에 맞춰 개정한 내역.
> 원본을 다시 받았을 때 어느 것이 rev5 개정분인지 구분하기 위한 기록이다. 줄번호는 **개정 전** 원본 기준.
> 계약 정본: video-pipeline 개발 문서 `CONTRACTS.md`(필드 구역·재고정·검증 V13~V18) · `SCOPES.md`(화질 2단·무효화).

## T10 — spec / docs / TASKS.md

| 파일:줄 | 원본 원문 (인용) | rev5 변경 | 사유 |
|---|---|---|---|
| spec/01-schema.md:17 | "`Shot.locked` — 사람이 확정한 샷. `--force` 없이 덮어쓰지 않는다" | `Shot.locked_selection`으로 개명 + `anchor:{sentence_key,offset_sec}` 항목 추가 | 시각 재고정과 선택 보존을 분리해야 하므로 `locked` 단일 플래그로는 불충분. `locked_timing`은 두지 않는다 (CONTRACTS §2) |
| spec/01-schema.md:29 | "`shot-plan.json` … 쓰는 주체 `plan` → `review`" | 필드 구역 소유권 표(Z1 plan / Z2 review / Z3 reanchor / Z0 메타)로 대체 | shot-plan.json은 세 작성자가 서로 다른 필드를 쓴다. 파일 단위 "작성자 하나"가 성립하지 않아 구역으로 나눔 (CONTRACTS §1) |
| spec/01-schema.md:31 | "`sources/usage.json` … 쓰는 주체 `assemble`" | 작성자 = **`review --apply`** | 사용 구간(`source_in`/`source_out`)은 승인 시점에 정해진다. assemble은 읽어서 출처만 생성. 원본이 IMPLEMENTATION.md:112와 모순했다 |
| spec/01-schema.md:33 | "한 파일을 여러 모듈이 덮어쓰지 않는다. `shot-plan.json`만 예외이며, `review`는 `locked` 규칙을 지켜 갱신한다" | 삭제. "필드마다 작성자 하나, 모든 작성자는 CLI를 지난다"로 대체 | 에이전트·브라우저가 shot-plan.json을 직접 쓰는 모델을 폐기. `<cmd> --apply`가 writeScoped로 병합 |
| spec/01-schema.md:37-76 (§3) | 치명 12종 + 품질 경고 13종만 존재 | V13·V14·V14b·V15·V16·V17a·V18·V18b 표 추가 | 재고정(V13)·봉인 해시(V14)·구역 정합(V14b)·중요도별 고아 판정(V15)·사진 촬영모션(V18)이 스키마 레벨 안전장치 |
| spec/01-schema.md:112 | "`schema/pipeline.ts`가 **수정 없이** 동작한다" | rev5 추가 필드 명시(`anchor`/`sentence_key`/`timing_rev`/`locked_selection`/`revision`/`writers`/`seal`/`photo_motion`/`coverage_gap`/`word_timing`/`score_source`) | rev5는 스키마를 확장한다. "수정 없이 동작"은 rev5를 되돌리는 지시가 된다 |
| spec/02-align.md:186 | "원고 상 문장 인덱스로 매칭하므로 자연히 구별된다" | `sentence_key`(최초 등재 시 부여하는 불변 8자 ID, 사람 부여, 텍스트 수정에도 유지, 내용 해시 금지)로 매칭 | 가변 인덱스로 매칭하면 원고 수정 시 승인 샷이 전부 고아가 된다. 재고정 계약의 근간 (CONTRACTS §2) |
| spec/03-plan.md:20-21 (§2) | "`shot-plan.json`의 `beats`와 `need` 상태의 `shots`" | 산출물 = **`beat-plan.json` 하나**. `pipeline plan --apply`가 `writeScoped(Z1)`로 병합 | plan 에이전트가 shot-plan.json을 직접 쓰면 Z2/Z3 판단이 깨진다. 재바인딩·coverage_gap 규약 추가 |
| spec/04-harvest.md:122-130 | "### 파일럿용 선행 수급 … **G3 파일럿을 통과하지 못하면 전체 수급을 진행하지 않는다**" | 화질 2단(프록시 전량 720p → 스토리보드 승인 후 승인분 고화질). "게이트는 60초 파일럿이 아니라 **스토리보드**" 명시 | D6/SCOPES §5: 60초 파일럿 게이트 제거, 스토리보드가 게이트. 프록시 전량이 모든 구간 재생 판단을 가능케 함 |
| spec/05-review.md:95 | "`[` `]`로 조정한 인·아웃은 `shot-plan.json`에 반영되고 `locked: true`가 된다" | 결정 로그(`review-decisions-<ISO8601>.json`)에 append → `review --apply` 병합, `locked_selection: true` 확정 | 브라우저는 shot-plan.json을 직접 쓰지 않는다. Z2 구역만 병합 (CONTRACTS §1) |
| spec/05-review.md:101 | "`shot-plan.json`을 **직접 갱신한다.**" | 결정 로그(append-only 증분) 다운로드 → `pipeline review --apply` (Z2 writeScoped). revision 대조·10건 자동 다운로드 규약 추가 | 직접 갱신은 소유권 계약 위반. 결정 로그 병합으로 가드가 걸린다 |
| spec/05-review.md:111,115 | 결정 JSON에 `"locked": true` | `"locked_selection": true` + `photo_motion:{type:"parallax"}` 기본값 | 필드 개명 + 사진 촬영모션은 Z2 확정 (CONTRACTS §1) |
| spec/05-review.md:129 | "`locked: true` 인 기존 선택은 `--force` 없이 덮어쓰지 않는다" | `locked_selection: true` | 필드 개명 |
| spec/05-review.md:184,188 (완료 조건) | "…`locked: true`가 된다" / "`locked` 선택이 재실행에서 보존" | `locked_selection` | 필드 개명 |
| spec/06-motion.md:96-110 (§7) | 렌더 경로 표만 존재, 버전·툴체인 미명시 | hyperframes 툴체인 실측 추가 — 버전 핀 `0.7.71`(핀 위치 **`package.json`**, `edit-profile.json` 아님), `lint`(실재) → `check`(inspect 후속, deprecated) → `render --format mov`(투명/알파), `--strict`로 lint 연동. `@latest` 금지 | P2c 실측 반영. edit-profile.json은 편집 수치 단일 출처이지 의존성 매니페스트가 아니다 |
| spec/07-assemble.md:13 (§1) | "## 1. 트랙" (V1~A4 목록만) | "## 1. 트랙 — **10트랙** (V1~V6 · A1~A4)" 명시 | 본문 트랙 목록이 이미 10개인데 개수가 명시되지 않아 TASKS.md에서 "9개 트랙" 오기 발생 |
| spec/08-quality.md:31,56 | `"verdict": "human_required"` | **변경 없음 — 유지 확인.** `manual_required` 오기 흔적 없음 | 계획 rev3의 `manual_required`가 오기였다. 원본이 이미 올바르므로 정정 불필요 |
| docs/IMPLEMENTATION.md:112 | "`candidates/ + sources/usage.json`   에이전트 — 구간 검색·후보 수집" | 데이터 흐름 분리 — `usage.json` 작성자 = **`review --apply`**, `[CODE: review]` → `[CODE: review --apply]`, beat-plan/manifest 경로 반영 | usage.json 작성자를 review --apply로 확정 (spec/01:31과 정합) |
| docs/IMPLEMENTATION.md:192 (§7.3) | "`locked: true` 인 샷과 사람이 조정한 인·아웃은 `--force` 없이…" | `locked_selection: true` | 필드 개명 (gate 문자열 제거) |
| TASKS.md 전체 | T0~T7 (T0 2시간 · T3 ~450줄 · T7=프롬프트 검수 · "9개 트랙") | rev5 번호 체계(T0a/T0b/T1/T2/T3/T3b/T4/T5/T6/T7/T7b/T8/T9a~d/T10/T11)·규모·의존으로 덮어쓰기. "9개 트랙"→"10트랙" | 태스크 담당자가 받는 문서가 정본. pulk `docs/cmo/video-pipeline/TASKS.md` 보드와 일치 |

## T9a — prompts/harvest-sources.md

| 파일:줄 | 원본 원문 (인용) | rev5 변경 | 사유 |
|---|---|---|---|
| prompts/harvest-sources.md:34 | "`shot-plan.json` 의 `selection_status: "need"` 인 샷을 채워라." | shot-plan.json을 **읽되 직접 쓰지 않는다.** 후보는 `candidates/<beat_id>/`, 승인 구간은 `assets/selected/manifest.json`. shot-plan.json은 `review --apply`가 Z2 병합 | 첫 실행에서 소유권 규약이 깨지는 지점 (CONTRACTS §1) |
| prompts/harvest-sources.md:40-42 | 후보 정렬·기록에 `score_source` 없음 | 모든 후보에 `rights_status`와 `score_source` 기록 명시 | 점수 출처 추적 + 권리 배지 |
| prompts/harvest-sources.md:51-55 | "프록시 720p, 선택 클립은 원해상도" (사진/영상 우선 규칙 없음) | 화질 2단(프록시 전량 → 승인분 고화질) + 영상 우선, 사진은 critical 비트에만(15분당 상한 `sources.still_image_max_per_15min` 3~6장) | D4/D5 영상 우선·사진 상한 |
| prompts/harvest-sources.md:46-49 | critical 미달 시 "중단하고 보고" | `blocked`로 보고하고 중단. 자동 강등 금지 (기존 유지·명시화) | IMPLEMENTATION §2 |

## T9b — prompts/plan-beats.md

| 파일:줄 | 원본 원문 (인용) | rev5 변경 | 사유 |
|---|---|---|---|
| prompts/plan-beats.md:12-19 | "작업: 1. …의미 비트를 얹어라 … 4. `selection_status: "need"` 상태의 샷 요구사항을 만들어라" (산출물 미명시, shot-plan 직접) | 산출물 = `beat-plan.json` 하나. shot-plan.json 금지. `plan --apply`가 Z1 병합 | 소유권 규약 (CONTRACTS §1) |
| prompts/plan-beats.md (신규) | `anchor` 지시 없음 | `anchor:{sentence_key,offset_sec}` 필수. start/end는 anchor에서 유도되는 캐시 | 재고정 계약 (CONTRACTS §2) |
| prompts/plan-beats.md (신규) | 재분할·커버리지 규칙 없음 | 재분할 시 `selection_status != "need"` 샷 삭제·갱신 금지(재바인딩만), 보존 샷 시간대에 새 need 금지 → `coverage_gap[]` 보고 | V17의 짝, Z1 사후조건 (CONTRACTS §3) |
| prompts/plan-beats.md (신규) | emphasis_caption 확정 여부 불명 | emphasis_caption은 후보로만 제시. 확정은 검수(Z2) | spec/03:81-88 |
| prompts/plan-beats.md:30 | "`pipeline validate`… 실행하고 결과를 보고" | `pipeline plan --apply` 병합 후 `validate`. writeScoped abort도 수정 대상 | 병합 강제 주체는 plan --apply |

## T9c — prompts/motion-scene.md

| 파일:줄 | 원본 원문 (인용) | rev5 변경 | 사유 |
|---|---|---|---|
| prompts/motion-scene.md:7 | "대상: `shot-plan.json` 에서 `asset_kind: "motion"` 인 샷" | `motion/requests/<beat_id>.json`을 읽고 HTML composition 저작 | 모션 요청은 요청 파일로 분리 (T8 흐름) |
| prompts/motion-scene.md:3-13 | frame.md "함께 넣어라" | frame.md 디자인 토큰(색·타이포·여백) 준수 명시 | 톤 일관성 |
| prompts/motion-scene.md:14 (신규) | 타이밍 지시 없음 | 등장 0.25~0.6초, 설명 동작 0.6~1.5초. 무한 루프는 루프 자체가 개념일 때만 | 모션은 인과·비교·필터링·진행·시점 변화 설명만, 장식 금지 |
| prompts/motion-scene.md:29-33 | "경로 A: 투명 배경 / 경로 D: frame.md 단색 배경" (버전·서브커맨드 없음) | 버전 핀 `0.7.71`(@latest 금지) + `lint` → `check`(inspect 후속) → `render --format mov`(알파). lint/check 통과 필수, 실패 시 실패 보고(fallback_text 금지) | P2c 실측. inspect deprecated, mov가 알파 지원 |

## T10 (후속) — 60초 파일럿 게이트 제거 (D6, 게이트=스토리보드)

> rev5 계약(D6: 캘리브레이션·60초 파일럿 게이트 제거)이 정본이므로 같은 레포 내 잔재를 스토리보드 게이트(승인 ②)로 통일. 승인 지점 3개(① 원고+시각 파라미터 / ② 스토리보드 ★ / ③ 최종 마감).

| 파일:줄 | 원본 원문 (인용) | rev5 변경 | 사유 |
|---|---|---|---|
| docs/RUNBOOK.md:103-111 (§7) | "## 7. 60초 파일럿 [나] · 40분 · G3 ★ … 전체 조립 전에 45~75초를 완성 수준으로 만든다" | "## 7. 스토리보드 승인 ② [나] · 40분 ★"로 개정. 전 비트 프록시 + 타이밍 부착 검수 HTML, 모든 구간 실제 재생 반복 승인, 승인분만 고화질. `--pilot`은 선택적 spine 룩체크(게이트 아님, A1 비절단·samples/10요소 없음·캘리브레이션 재측정 없음) | 60초 파일럿 게이트 제거, 게이트=스토리보드 (SCOPES §5) |
| docs/RUNBOOK.md:182 | "…`edit-profile.json`을 실측으로 정확히 맞추고, **G3 파일럿**에서 방향을 확실히 잡는 것뿐이다" | "…**스토리보드 승인 ②**에서 방향을 확실히 잡는 것뿐이다" | 라이브 게이트 서술 제거 |
| docs/RUNBOOK.md:173 (시간 예산) | "\| 7 파일럿 승인 \| 나 \| 40분 \|" | "\| 7 스토리보드 승인 ② \| 나 \| 40분 \|" | 라이브 게이트 서술 제거 |
| docs/IMPLEMENTATION.md:67-74 (§3 사람) | "### 사람 … - 60초 파일럿 승인 - 화면 선택과 인·아웃 확정 - 마감과 4회 시청" | "### 사람 — 승인 3지점": ① 원고 잠금+시각 파라미터 / ② **스토리보드 반복 검수·화면 선택** / ③ 마감과 4회 시청 | 승인 지점 3개 서술 통일 + 스토리보드 반복 검수(승인 ②) 명시 |
| docs/IMPLEMENTATION.md:235 (§8 인트로) | (없음) | "사장님 승인은 3지점 — ① 원고 잠금+시각 파라미터(G2) · ② 스토리보드 ★ · ③ 최종 마감·발행(G5). G0·G1·G4는 진행 체크포인트다." 추가 | 승인 지점 3개 서술 통일 |
| docs/IMPLEMENTATION.md:259-267 (§8 G3) | "### G3 — 60초 파일럿 ★ … 45~75초 구간을 완성 수준으로 먼저 만든다" | "### 스토리보드 — 승인 ② ★"로 개정. 전 비트 프록시 검수 HTML, 모든 구간 실제 재생 반복 승인, 승인분만 고화질, `--pilot`=선택 룩체크(게이트 아님). "구 60초 파일럿 게이트는 제거됐다"(역사) | 60초 파일럿 게이트 제거, G3 라벨 제거 |

## T4 — spec/05-review.md (검수 구현이 채택한 rev5 판단, T9d 시 반영)

> T4(`review` HTML + `review --apply`) 구현이 확정한 검수 키·잠금 의미론. 원본 spec/05-review.md 는 `[` `]` 조정 경로만 명시했고 `M`은 "자체 그래픽 필요"였다. 구현 정본: `src/review/render.ts`(키 핸들러)·`src/review/apply.ts`(Z2 병합).

| 파일:줄 | 원본 원문 (인용) | rev5 변경 | 사유 |
|---|---|---|---|
| spec/05-review.md:87 (키보드 표) | "\| `M` \| 자체 그래픽 필요 \|" | `M` = **사진 촬영모션 변경(parallax↔켄번즈 순환)**. 자체 그래픽(모션그래픽 신규 저작)은 검수 키가 아니라 `plan`(Z1)이 만드는 `asset_kind:"motion"` 요청 소관 | T4 구현(`render.ts` `cycleMotion` — image/still 샷의 `photo_motion.type` 순환, `apply.ts` §키→Z2 매핑). 검수는 기존 후보에서 고르는 단계라 신규 그래픽 저작 트리거를 두면 소유권(Z1 생성 vs Z2 확정)이 섞인다 |
| spec/05-review.md:95,116 | "`[` `]`로 조정한 인·아웃은 … `locked_selection: true`" (조정 경로만 명시, `Enter`/`A`/`C`/`M` 미규정) | `locked_selection`은 **사람 조정(`[` `]`·`A`·`C`·`M`)에만 `true`**, 단순 `Enter` 승인은 **`false`**. :116 예시에 "Enter=false" 주석 추가 | T4 구현(`render.ts`: `doSelect(false)`=Enter→`locked_selection:false` · `adjust`/`markARoll`/`markCaption`/`cycleMotion`→`true`). `Enter` 승인은 앞뒤 리듬이 바뀌면 재검수 대상으로 남겨야 하므로 잠그지 않는다(spec/05 §6) |

## T4b — 마우스 퍼스트 (Founder 실사용 피드백 2026-07-25)

> T4 검수 HTML 이 키보드 중심(선택=`Enter`만)이라 사장님이 **"장면을 선택하는 기능이 없는 것 같다 / 여러 단축키를 어떻게 쓰는지 어렵다"**고 피드백. 원하는 동선은 "여러 씬 설계 → AI가 베스트 추천 → 교체 대안 제시 → **나는 클릭으로 선택** → 선택이 반영되어 영상 제작". 클릭 선택·버튼 완주를 **1차 동선**으로 추가하되, 단축키 15키·결정 로그 JSON 형식·`review --apply`(Z2)·usage.json 계약은 **불변**(`apply.ts` 무수정으로 증명). 구현 정본: `src/review/render.ts`, 검증: `scripts/verify-review.ts`(기존 15 + UX2 신규 9케이스).

| 파일:줄 | 원본 원문 (인용) | 변경 | 사유 |
|---|---|---|---|
| spec/05-review.md §3 (키보드) | 선택=`Enter`, 조정=`[ ]`, 액션=`A`/`C`/`M`/`R`/`X`/`Q` — **키보드 전용 동선** | §3.5 «마우스 동등 지원» 추가. 카드 프레임/«이 장면 선택» 클릭=선택, «인−»/«아웃+»=`[ ]`, 촬영모션 드롭다운=`M`, 비트 헤더 A/C/X/R/Q 버튼. 단축키 표는 유지, **마우스가 1차 동선** | 2026-07-25 사장님 실사용 피드백: 클릭 선택 미발견·단축키 난해. 마우스만으로 완주 가능해야 함 |
| render.ts (신규 UI) | 상단 바 = 결정 카운트 + 다운로드 버튼, 헤더에 단축키 15키 상시 노출 | 상단 고정 바 = «선택 완료 x/y 비트» 진행 + «결정 저장(다운로드)» 상시 + «?» 도움말. 15키는 «?» 오버레이로 이동, 첫 로드 1줄 힌트 + «AI 추천»/«대안 N» 배지 추가 | 단축키 상시 노출이 "어렵다"는 인지 부하 → 클릭 안내·진행 표시 우선, 단축키는 온디맨드 |

### 클릭 ↔ 키보드 동선 매핑 (동일 결정 로그)

| 동작 | 마우스 (1차) | 키보드 | 결정 로그 | `locked_selection` |
|---|---|---|---|---|
| 후보 선택 | 카드 프레임/«이 장면 선택» 클릭 | `Enter` | `selection_status:"approved"` | `false` |
| 인·아웃 조정 | «인 −» / «아웃 +» 버튼 | `[` / `]` | `source_in`/`source_out` | `true` |
| 촬영모션 변경 | 촬영모션 드롭다운 | `M` | `photo_motion.type` | `true` |
| 진행자 지정 | 헤더 «A 진행자» | `A` | `asset_kind:"a_roll"` | `true` |
| 강조 카드·문구 | 헤더 «C 강조카드» + 인라인 입력 | `C` | `asset_kind:"caption_card"`,`emphasis_caption` | `true` |
| 원고 수정 표시 | 헤더 «X 원고수정» | `X` | `flag:"script_fix"` | — |
| 추가 조사 표시 | 헤더 «R 추가조사» | `R` | `flag:"research"` | — |
| 원본음 순환 | 헤더 «Q 원본음» | `Q` | `source_audio` | — |
| 재생·정지 | 영상 영역 클릭 | `Space` | (기록 없음) | — |
| 도움말 | «?» 버튼 | `?` / `Esc` | (기록 없음) | — |

## T5b — 경로 R: DaVinci Resolve OTIO 이미터 (Founder 결정 2026-07-25)

> 원본 spec/07-assemble.md §9는 출력 경로를 **A(CapCut 초안)·C(순번 파일)** 둘로만 두고 CapCut 초안 자동 생성을 경로 A의 기본 산출로 상정했다. 리서치 실측 결과 최신 CapCut은 암호화 신형 포맷이라 초안 자동 생성이 불가하고, 사장님 결정(2026-07-25 "Resolve 자동 + CapCut 병행")에 따라 **경로 R(Resolve OTIO)**을 추가하고 기본 이미터를 바꾼다. capcut 이미터는 보존(명시 `--emit capcut` 시만). 구현 정본: `src/assemble/emit-resolve.ts`, 파싱: `src/commands/assemble.ts`(`parseEmit`), 검증: `scripts/verify-resolve.ts`. `checks.ts`·`model.ts`는 소비만(무수정).

| 파일:줄 | 원본 원문 (인용) | 변경 | 사유 |
|---|---|---|---|
| spec/07-assemble.md:147-156 (§9 출력 경로) | "\| **A** \| CapCut 초안 직접 생성 + 큐 파일 \| … \| **C** \| 순번 파일 세트 …\|" (경로 2개) | 경로 **R**(Resolve OTIO `resolve/<slug>.otio` + `RESOLVE.md`) 행 추가. "경로 C·R에서도 자동 검사·큐 파일 동일" + `--emit` 콤마 목록(`capcut\|numbered\|resolve`, 별칭 `both`/`all`) + 트랙 매핑 표(V1→Video 1 … 마커) 절 추가 | Resolve 18.5+ OTIO 네이티브 임포트로 타임라인 전배치 오픈. CapCut 신형 포맷 초안 자동 생성 불가(실측) → capcut은 명시 시만 |
| src/commands/assemble.ts (`--emit` 기본값) | `getOpt(argv,'emit') ?? 'both'` (기본 `both`=capcut,numbered) | 기본값 **`numbered,resolve`**(`EMIT_DEFAULT`). `EmitMode` 단일값 → `EmitTarget[]` 콤마 목록. `both`/`all` 별칭 유지 | 사장님 결정: Resolve 자동 + 순번 병행, CapCut 초안은 명시 시만 |
| spec/07-assemble.md §6 (자막) | 기본 자막은 이미터가 프리셋으로 생성 | 경로 R에서 기본 자막(V4)은 OTIO에 넣지 않고 `RESOLVE.md`가 `File>Import>Subtitle`로 `captions.srt` 안내 | Resolve는 SRT 별도 임포트가 정석. V6 출처 화면 title 생성은 스코프 밖(마커로 역추적) |

## T5c — 경로 R: 미디어 스테이징 (Founder 실사용 2026-07-25)

> 사장님 실사용 검증에서 OTIO 자동 배치·재연결은 실제 Resolve 에서 동작 확인. 다만 소스 미디어가 `audio/`·`motion/`·`sources/{a-roll,originals,stills}`·`assemble/work/`에 흩어져 폴더마다 가져와야 하는 번거로움 발견(Resolve 는 OTIO 임포트 시 외부 미디어를 자동 링크하지 못함). → 참조 미디어 전부를 `resolve/media/` 한 폴더로 모으고 OTIO 가 그 폴더를 가리키게 해서 **단일 임포트로 전 클립 자동 연결**. 구현 정본: `src/assemble/emit-resolve.ts`(스테이징+매니페스트), 호출부 `src/commands/assemble.ts`(`--force` 전달), 검증 `scripts/verify-resolve.ts`(기존 9 + 스테이징 6케이스). `model.ts`·`checks.ts` 무수정.

| 파일:줄 | 원본(T5b) | 변경 | 사유 |
|---|---|---|---|
| src/assemble/emit-resolve.ts (target_url) | 각 clip `target_url` = 원본 흩어진 절대경로(`sources/…`, `motion/…`, `audio/…`, `assemble/work/…`) | 참조 미디어를 `resolve/media/`로 스테이징(심링크 기본, 실패 시 복사) 후 `target_url` = 스테이지 절대경로. 공유 파일 1회 스테이징·클립 공유, 다른 폴더 동일 basename 은 `<hash>_<basename>` 유일화, 멱등(force 시 재생성) | 사용자가 여러 폴더를 돌지 않고 `resolve/media/` 한 번 임포트로 전 클립 자동 연결 |
| src/assemble/emit-resolve.ts (산출물) | `resolve/<slug>.otio` + `RESOLVE.md` + `captions.srt` | `resolve/media/`(스테이지 미디어) + `resolve/media-manifest.json`(원본→스테이지 매핑) 추가 | 추적·재실행 멱등 기록 |
| RESOLVE.md (임포트 순서) | 새 프로젝트 → `Import > Timeline`(.otio) → `Import > Subtitle` | **미디어 먼저**: 새 프로젝트 → `Import > Media`(`resolve/media/`) → `Import > Timeline`(.otio, 미디어 풀로 자동 연결) → `Import > Subtitle`. "미디어 먼저, 타임라인 나중"(반대면 offline) 강조 | Resolve 는 미디어 풀에 파일이 먼저 있어야 OTIO 클립이 relink 됨 |
