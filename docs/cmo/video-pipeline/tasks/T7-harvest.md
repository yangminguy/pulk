# T7 — 소스 어댑터 + 인덱스 + 프록시 (700~950줄) · T7b `ingest` (~120줄)

**선행**: T2 · **T0b**(hit@5) · **T3 + plan 1회 실행** · T9a
**읽을 것**: [CONTRACTS.md](../CONTRACTS.md) · `~/brandboy-pipeline/spec/04-harvest.md` · `docs/craft/SOURCE-PLAYBOOK.md`(수급 판단 시에만)
**파일**: `src/commands/{harvest,ingest}.ts` · `src/harvest/adapters/{youtube,web,page}.ts` · `src/harvest/{index,rerank,proxy,fetch}.ts`

> **T7의 실질 선행은 T3다.** T7이 `beat.search_intent`로 검색하는데 비트는 `plan`이 만들고 `plan`의 입력은 `timeline.json`이다(`spec/03-plan.md:14`). *구현*은 T3와 병렬 가능하나 *완료 판정*은 비트가 있어야 가능하다.

## 먼저 확인할 것

- [ ] T0b의 `hit@5` 값과 선택 경로(A / A′ / 재검토). **≤ 0.3이면 T7 착수 금지**
- [ ] `eval/search-hit5.json`이 존재하고 홀드아웃 3건이 봉인돼 있는가
- [ ] `plan --apply`가 1회 실행되어 `shot-plan.json`에 비트가 있는가
- [ ] `yt-dlp --version` · Playwright 설치 확인

---

## 목적

원고보다 **먼저** 원본 저장소를 만들고(자막 확보), 비트가 확정된 뒤 **자막 검색으로 구간 후보**를 만든다. 승인된 구간만 고화질로 받는다.

**긴 원본을 배제하지 않는다.** 90분 인터뷰에서 필요한 건 12초이고, 그 12초는 자막 검색으로만 찾는다.

## 화질 2단 스코프

| 단계 | 대상 | 시점 |
|---|---|---|
| **프록시** | **전 비트** 후보 (720p 부분) | 스토리보드(T4) 전 |
| **고화질** | **승인된 샷만** (원본 화질) | **스토리보드 승인 후** |

`spec/04-harvest.md:124`: **"스토리보드 승인 전에는 승인분 고화질 수급을 진행하지 않는다."** 프록시는 전 비트를 덮어야 사장님이 모든 구간을 판단할 수 있다.

처리 순서는 `prompts/harvest-sources.md:44` — 훅 전체 → reveal 전체 → 숫자·인용·제품 → build → bridge.

---

## 1. 어댑터 3종 (고정. 플러그인 아키텍처 금지)

| 어댑터 | 담당 | 도구 |
|---|---|---|
| `youtube.ts` | 공식 채널·SNS·인터뷰·광고·UGC | `yt-dlp` (`--extractor-args youtube:player_client=android`로 403 우회) |
| `web.ts` | 뉴스·방송·아카이브 페이지 본문 + 임베드 미디어 URL | fetch + 본문 추출 |
| `page.ts` | 제품·가격·결제·공시/IR 페이지 캡처 | Playwright (factory `footage-runner/recordedUi.ts` 참고) |

A-roll(진행자 촬영분)은 **수급이 아니라 로컬 등록**이므로 `ingest`(T7b)가 담당한다.

## 2. 1단계 — 자막·메타 전량 수집

**영상 파일은 받지 않는다.** 자막 확보가 목적이다.

**영상 우선.** 검색·수급 대상은 영상 소스(공식영상·인터뷰·B-roll)를 최대한 모은다(`sources.prefer_kind`). **사진(정지 아카이브)은 핵심 강조 비트에만** 소수 확보하고 `sources.still_image_max_per_15min`(15분당 3~6장) 상한을 둔다 — 사진은 영상에서 그대로 쓰기 어렵고 촬영 모션(§4b)이 필수다.

`sources/catalog.json` 항목:
```
source_id · title · publisher · original_url · published_at · duration
language · kind · rights_status · visual_topics · usable_ranges
```
`sources/transcripts/<source_id>.json` — 전체 자막 + 타임코드.

최소 기준(`RUNBOOK.md:36`): 공식 영상 10편 이상 · 인터뷰 3편 이상 · 광고 5편 이상 · 제품/가격/퍼널 화면 · 뉴스/독립 검증 · 소비자 반응.

## 3. 2단계 — 구간 검색 + 랭킹

### 인메모리 인덱스

`sources/transcripts/*.json`을 전량 로드해 정규화·n-gram 스코어링. 5~10편 90분급이어도 5MB 수준이라 수백 ms에 끝난다. `.cache/index-<hash>.json`으로 메모이즈.

**DB를 만들지 않는다** (`TASKS.md:102`).

### 검색 절차 (`SOURCE-PLAYBOOK.md:104`)

1. 전체 자막 확보
2. 비트의 인물·행동·숫자·핵심 동의어로 검색
3. 일치 지점 앞뒤 20~40초를 본다
4. 발언 맥락 확인
5. 사용할 3~9초와 앞뒤 `shots.handle_sec`(2초) 핸들 저장
6. 얼굴·행동·제품·공장 등 프레임 태그 추가

### 랭킹 (`score_weights`)

```
의미 일치 35 · 증거 강도 25 · 움직임/화면성 15 · 원본성 10 · 앞뒤 다양성 10 · 해상도 5
```

**`semantic_match: 35`의 주인은 T0b가 정한다.**

| T0b 결과 | 부여 주체 | `score_source` |
|---|---|---|
| `hit@5 ≥ 0.7` | 코드(어휘 점수) | `"lexical"` |
| `hit@5 0.4~0.6` | **에이전트 리랭크**(`rerank.ts`) — 어휘로 상위 200 → 자막 텍스트만 보고 상위 8 선별 | `"agent_rerank"` |

리랭크 결과는 `.cache/rerank-<sha256(beat_id + search_intent + source_set_hash)>.json`에 고정한다. **일상 실행은 메모이제이션이지 결정론이 아니다**(TTL 7일). 평가셋 실행(`--eval`)만 TTL을 무시한다.

**권리 위험은 랭킹에서 숨기지 않고 별도 배지로 표시한다.** 관련 없는 저위험 스톡이 관련 있는 공식 영상을 밀어내면 안 된다.

## 4. 2.5단계 — 프록시 클립 ★

**검수 전에 재생 가능한 파일이 있어야 한다.** `spec/05-review.md:73`이 "이 모듈에서 가장 중요한 요구사항"으로 지정한다.

- 상위 `harvest.proxy_max_candidates_per_beat`(3) 후보를
- `harvest.preview_context_sec`(20~40초) 범위만
- `proxy_height`(720)으로 부분 다운로드
- → `candidates/<beat_id>/<cand_id>.mp4`

**용량 산정**: 20분 영상 × `beats.expected_count_per_15min` 상한 = 최대 400비트 × 3후보 = **1200클립**. 720p·30초 ≈ 15MB → **약 18GB**. `harvest.proxy_budget_gb`(25) 초과 시 후보 수를 줄이고 **경고**한다(무단 절단 금지).

## 4b. 사진 후보 — 촬영 모션 기본 parallax

사진 후보(`asset_kind: "image"`)는 **핵심 강조(`importance: critical`) 비트에만** 제안한다. 원본 스틸 + **`photo_motion` 초기값 `parallax`**를 후보에 붙인다(T8이 parallax 저작·렌더). 사장님이 스토리보드에서 켄번즈 등으로 다운그레이드하면 그 값으로 확정(Z2). 촬영 모션 없는 정지 사진은 조립에서 **V18**로 막힌다.

## 5. 3단계 — 승인 구간 고화질

검수에서 `approved`된 샷의 `source_in`/`source_out` 구간만 고화질 다운로드.

- `sources/originals/` — 프로젝트 종료까지 보존 (마감에서 인·아웃을 바꿀 일이 반드시 생긴다)
- `assets/selected/` + **`manifest.json`**
- **`shot-plan.json`을 쓰지 않는다.** `assemble`이 `shot_id`로 조인한다

## 6. `blocked` / `deferred_blocked`

| 상황 | 처리 |
|---|---|
| `critical` 후보 0개 | `blocked[]` + **exit 1**. 파이프라인 정지 (`IMPLEMENTATION.md:212`) |
| `normal` 미달 | `failed[]`, 미달 상태로 스토리보드에 올림 |
| `bridge` 미달 | 그대로 진행 |
| 부분 재처리(`--only`) 범위 밖 `critical` 미달 | `deferred_blocked[]` + **exit 0** + stderr 경고 |

`blocked` 리포트에는 `SOURCE-PLAYBOOK.md:158~`의 **7단계 대안**을 동봉한다: 검색어·언어·인물명 변경 → 인터뷰 자막/설명란 원출처 추적 → 웹 아카이브·공시·보도자료 → 직접 웹 화면 녹화 → 직접 촬영 → 근거 기반 자체 그래픽 → 원고를 보여줄 수 있는 문장으로 수정.

**`critical` 비트를 자동으로 강등하거나 숨기지 않는다.**

## 7. 비밀값

API 키는 `.env`에서만 읽는다. **로그·산출물·HTML·매니페스트에 절대 기록하지 않는다.**

---

## T7b — `ingest` (A-roll 등록, ~120줄)

`ratios.a_roll`(0.10~0.20) → 12~20분 중 **1.2~4분이 진행자 화면**이다. 스토리보드 승인 항목에 "진행자 합성"이 있고 `spec/05-review.md:85`에 `A` 키("진행자 화면으로 지정")가 있는데, 어댑터 3종 어디에도 촬영분 등록 경로가 없다.

```bash
pipeline ingest --project <dir> --a-roll <촬영폴더>
```

- 파일을 `sources/a-roll/`로 등록
- `catalog.json`에 `kind: "a_roll"`로 기입 (`AssetKind`에 `a_roll` 실재)
- `probe`로 해상도·fps·길이 확인
- **원본 가로 프레이밍 유지.** 세로 블러 금지

---

## 완료 조건

### T7 프록시 (T4 스토리보드 착수 조건)

- [ ] **`hit@5` ≥ T0b 확정값** — `eval/search-hit5.json` 공개 7건, `--eval`(TTL 무시)로 측정. `verify-harvest.ts`가 리포트
- [ ] **홀드아웃 3건 개봉 후에도 기준 유지** — 전체 10건 기준으로 재측정하고 공개 7건 대비 하락 폭을 리포트
- [ ] critical급 검색의도 3건에서 각각 "쓸 만함" 후보 ≥ 1개
- [ ] **전 비트** 프록시 후보가 `review.html`에서 **재생 가능**(파일 존재 + `probe` 통과)
- [ ] **사진 후보는 critical 비트에만, `photo_motion` 초기값 `parallax`** 부여 · 15분당 상한 준수
- [ ] 프록시 총 용량 ≤ `harvest.proxy_budget_gb`, 초과 시 경고 발생 확인
- [ ] 모든 후보에 `rights_status` + `score_source` 기록
- [ ] critical 후보 0개 시 `blocked` + **exit 1** + 7단계 대안 동봉
- [ ] 캐시 히트 시 API 재호출 없음
- [ ] `rg -i 'api[_-]?key|Bearer ' projects/ *.html` → **0건**
- [ ] 검색 응답 < 1초(50편 인덱스) — 부차 기준

### T7 고화질 (스토리보드 승인 후)

- [ ] 승인된 샷의 `source_in/out` 구간만 고화질 다운로드 → `assets/selected/manifest.json`
- [ ] `sources/originals/`에 원본 보존(마감에서 인·아웃 변경 대비)

### T7b

- [ ] A-roll 3개 등록 후 `review.html`에서 `A` 키로 지정 가능
- [ ] `assemble`이 V2 트랙에 배치하고 `rhythm.presenter_reset_interval_sec` 검사가 동작
- [ ] 원본 가로 프레이밍 유지(세로 블러 없음) — `probe` 종횡비 확인

## 검증 명령

```bash
cd ~/brandboy-pipeline
npx tsx src/cli.ts harvest --project projects/<slug> --eval
npx tsx scripts/verify-harvest.ts     # hit@5 · 홀드아웃 · critical 3건 · 프록시 재생 · 용량 · blocked exit
rg -i 'api[_-]?key|Bearer ' projects/ *.html
npx tsx src/cli.ts ingest --project projects/<slug> --a-roll ~/footage/aroll
```

## 흔한 함정

- **프록시를 안 만들고 T4로 넘어가기** → `review.html`에서 재생할 파일이 없어 검수가 성립하지 않는다.
- **`shot-plan.json`에 다운로드 경로를 직접 쓰기** → 소유권 위반. `manifest.json`에 쓰고 `assemble`이 조인한다.
- **`critical` 미달을 `normal`로 강등** → 금지. 파이프라인이 멈추고 사람이 결정한다.
- **`--eval` 없이 평가셋 측정** → 캐시 TTL 때문에 재현이 안 된다.
- **yt-dlp 403** → `--extractor-args youtube:player_client=android`.
