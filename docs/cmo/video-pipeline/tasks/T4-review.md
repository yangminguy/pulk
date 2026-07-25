# T4 — `review` HTML (750~1050줄)

**선행**: T2 · **P6**(브라우저 재생·저장) · **T7(프록시 전량)**(재생 검증에 후보 프록시 필요)
**읽을 것**: [CONTRACTS.md](../CONTRACTS.md) §1 · `~/brandboy-pipeline/spec/05-review.md` · [PORTING.md](../PORTING.md) M4
**파일**: `src/commands/review.ts` · `src/review/render.ts`

## 먼저 확인할 것

- [ ] P6 결과 — `file://`에서 `<video>` `#t=a,b` 구간 재생과 다운로드 저장이 Chrome·Safari에서 되는가. 실패면 `--watch` 로컬 서버
- [ ] T7이 **전 비트**의 프록시 클립을 `candidates/<beat_id>/`에 만들었는가
- [ ] `shot-plan.json`에 `revision`과 `writers`가 있는가 (T1)

---

## 목적 — 스토리보드 (승인 ②, 이 파이프라인의 핵심 게이트)

**녹음 후 타이밍이 붙은** 스토리보드다. 원고의 각 비트에 어떤 화면(영상·사진+촬영모션·모션)이 몇 초에 붙는지를 한 화면에 펼쳐 **후보를 실제 인·아웃 구간으로 재생**시키고, 사장님이 반복 피드백으로 선택·사진모션·편집을 확정한다. 결정은 `shot-plan.json` Z2에 반영한다. **전체 고화질 수급·조립은 이 승인 이후에만** 일어난다.

> `spec/05-review.md:73` — **동영상은 반드시 실제 구간을 재생해서 확인한다.** 포스터만 보고 고른 구간은 마감에서 절반이 교체된다.

## 스코프 — 전 비트

스토리보드는 **전 비트를 프록시로** 덮는다(파일럿 서브셋 없음). 사장님이 모든 구간을 실제 재생으로 판단해야 게이트가 성립한다. 특정 비트만 다시 볼 때는 `--only <beat_id>`. `--pilot`은 첫 구간 룩체크용 선택 옵션일 뿐이다([SCOPES §5](../SCOPES.md)).

---

## 1. 출력 구조

**정적 HTML 파일 하나.** 서버 불필요(P6 실패 시에만 `--watch`). 웹 UI 서버를 만들지 않는다.

```
review.html          ← 생성 시점의 shot-plan.json revision을 HTML에 박아둔다
```

## 2. 저장 — 브라우저는 `shot-plan.json`을 쓰지 않는다

```
브라우저 → review-decisions-<ISO8601>.json  (append-only 증분, 다운로드)
        → pipeline review --apply <file...>  → writeScoped(Z2) + usage.json
```

- **File System Access API를 쓰지 않는다.** `showSaveFilePicker`는 `file://`이 opaque origin(`null`)이라 SecurityError를 던지고 Safari는 미지원이다. Blob + `<a download>`로 충분하다
- `spec/05-review.md:176`이 `localStorage`를 금지하므로 상태는 JS 변수에만 둔다. **결정 10건마다 자동 다운로드를 제안**해 크래시 손실 창을 10건으로 제한한다
- `--apply`는 여러 파일을 **타임스탬프 순차 적용**. 같은 `shot_id` 중복은 **나중 것 승리**
- 적용 전 `revision` 대조 → 불일치 시 **거부 + diff 출력**(`--force`로만 강행)

> **`reanchor` 실행 후에는 `review.html`을 재생성해야 한다.** `reanchor`가 `revision`을 올리므로 브라우저가 들고 있던 값이 낡아 `--apply`가 정당하게 거부된다.

## 3. 화면 구성

### 필수 요소 (비트당)

- 비트 내레이션 텍스트 + **타임코드(start–end)** + `visual_function` + `importance` + `search_intent`
- `must_show` / `avoid`
- 후보 카드 N개: 썸네일 · **`<video src="…#t=in,out">`** · 소스 제목/게시자/URL · 점수 · `rights_status` **배지** · `score_source`
- **사진 후보엔 촬영 모션 표시** — 기본 `parallax`, 켄번즈 등으로 바꿀 수 있는 셀렉터(초점·줌·방향)
- 현재 선택 상태 (`need` / `candidate` / `approved`)

### 단축키 (15키 / 11행 — `spec/05-review.md:79-91`)

`spec/05-review.md`의 표를 그대로 구현한다. 주요 키:
- `1`~`5` 후보 선택 · `[` `]` 인·아웃 조정 · `A` 진행자 화면 지정 · `C` 강조 카드 선택·문구 편집 · **`M` 사진 촬영모션 변경(parallax↔켄번즈·초점)** · `X` 원고 수정 필요 표시
- **선택 후 자동으로 다음 비트로 넘어가지 않는다.** 사람이 확인하고 넘긴다

## 4. 2패스

| 패스 | 무엇 | 판정 |
|---|---|---|
| **A 편집 적합성** | 화면이 문장과 맞는가 · 화면성 · 앞뒤 다양성 | 5점 척도 3축 |
| **B 근거·권리** | 인용/숫자의 원본 위치가 맞는가 · `rights_status` | 5점 척도 3축 |

`critical`을 먼저 꼼꼼히, `bridge`는 추천안 그대로.

## 5. 축소 타임라인 + 자동 경고 7종

전부 `edit-profile.json` 참조. `spec/05-review.md:139`의 목록:

1. 같은 원본이 `shots.same_source_run_max_sec`(10초) 이상 연속
2. 같은 화면 크기가 `shots.same_framing_run_max_shots`(4) 연속
3. 정지 이미지가 `shots.still_max_sec`(8초) 초과
4. 훅 30초 시각 변화가 `rhythm.intro_30s_visual_changes_min`(12) 미만
5. 강조 카드가 `counts_per_15min.impact_cards` 범위 밖
6. 원본음 간격이 `rhythm.source_audio_interval_sec` 범위 밖
7. **사진이 비강조 비트에 있거나 15분당 `sources.still_image_max_per_15min` 초과 (V18b)**

## 6. 성능

200+ 행을 한 번에 렌더하면 브라우저가 멈춘다. **lazy 렌더**(IntersectionObserver — M4에서 이식하는 클라이언트 JS 24줄이 이 패턴이다).

---

## 완료 조건

### T4 (승인 ② 게이트)

- [ ] `open review.html`로 동작 (또는 P6 결과에 따라 `--watch`)
- [ ] **전 비트 동영상 후보가 지정 구간으로 재생됨** — 판정: 사람 수동 확인 + **스크린샷 첨부**
- [ ] **각 비트에 타임코드(start–end)가 표시됨** (녹음 후 타이밍 부착)
- [ ] `[` `]` 조정이 `--apply` 후 **Z2에만** 반영 (Z1·Z3 해시 불변 — `writeScoped`가 보장)
- [ ] **`M` 키로 사진 촬영모션을 바꾸면 `photo_motion`이 Z2에 확정됨** (기본 parallax → 켄번즈 등)
- [ ] 선택 후 자동으로 다음 비트로 넘어가지 않음
- [ ] **자동 경고 7종이 픽스처에서 각각 발생** (사진 남용 V18b 포함)
- [ ] **검수 중 `harvest`를 실행하고 검수를 이어서 저장했을 때 harvest 결과가 소실되지 않는다**
- [ ] `revision` 불일치 시 `--apply`가 **거부 + diff 출력**
- [ ] 결정 로그 2개를 **순서를 바꿔** `--apply` 해도 타임스탬프 순 적용으로 결과 동일
- [ ] `A` 키로 지정한 샷이 `asset_kind: "a_roll"`로 기록됨
- [ ] `C` 키로 지정한 샷이 `asset_kind: "caption_card"` + `emphasis_caption` 확정으로 기록됨
- [ ] `usage.json`이 `--apply` 시 생성/갱신됨 (`source_id` · `source_in/out` · `video_in/out` · `rights_status`)
- [ ] `motion` · `caption_card` 비트 검수 제외 규칙 적용 (`spec/05-review.md` 완료조건 8)

## 검증 명령

```bash
cd ~/brandboy-pipeline
npx tsx src/cli.ts review --project projects/<slug>
open projects/<slug>/review.html
# 브라우저에서 결정 → 다운로드
npx tsx src/cli.ts review --project projects/<slug> --apply projects/<slug>/review-decisions-*.json
npx tsx scripts/verify-review.ts    # Z2 한정 반영 · 경고 6종 · revision 거부 · 로그 순서무관 · harvest 보존
```

## 흔한 함정

- **File System Access API 사용** → `file://`에서 SecurityError. 다운로드 방식으로.
- **`localStorage` 사용** → `spec/05:176` 금지. JS 변수 + 주기적 다운로드.
- **브라우저가 `shot-plan.json` 전체 스냅샷을 다시 씀** → 그 사이 `harvest`가 쓴 결과가 소실된다(잃어버린 갱신). **증분 결정 로그만** 내보낸다.
- **`--apply`가 Z1/Z3를 건드림** → `writeScoped`가 abort한다. 그게 정상이다. Z2 필드만 수정하도록 고친다.
- **factory `generate-storyboard-review.ts`를 골격 이상으로 재사용** → 재사용 가능한 건 argv 파싱·`esc`·`time`·자체완결 HTML 패턴 + 클라이언트 JS 24줄, **약 50~60줄뿐**이다. 나머지(CSS 덩어리·`pulkVisualHtml`·`previewHtml`)는 슬라이드덱 전용이라 폐기한다.
