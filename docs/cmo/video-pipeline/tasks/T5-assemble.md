# T5 — `assemble` (900~1350줄)

**선행**: T3b · **T4(스토리보드 승인 ②)** · T7(고화질) · T7b · T8
**읽을 것**: [CONTRACTS.md](../CONTRACTS.md) §3 · [SCOPES.md](../SCOPES.md) §5 · `~/brandboy-pipeline/spec/07-assemble.md` · `docs/craft/EDITING-BIBLE.md`(편집 판단 시에만)
**파일**: `src/commands/assemble.ts` · `src/assemble/{model,checks,emit-capcut,emit-numbered}.ts`

## 먼저 확인할 것

- [ ] P2 결과 — 경로 A(CapCut 초안) / 경로 C(순번 파일 세트)
- [ ] P3 결과 — 알파 인식(오버레이 V3) / 경로 D(단색 배경 + 메인 트랙)
- [ ] P2b의 CapCut 서브커맨드 전문 · 세그먼트 복제 동작 · 텍스트 프리셋 방법
- [ ] 스토리보드 승인이 끝나 `shot-plan.json`에 `approved` 샷이 있는가 (`--pilot`은 선택적 룩체크)

---

## 목적

씬 하나를 한 파일로 채우지 않는다. `shot-plan.json`의 인·아웃과 의도대로 **내레이션 위에 샷을 조립**한다.

## 1. 구조 — 모델 + 검사 + 이미터 2

```
model.ts          shot-plan + timeline + usage + manifest → TimelineModel(10트랙)   ← 출력 경로와 무관
checks.ts         자동검사. TimelineModel만 입력.                                   ← T6가 import
emit-capcut.ts    TimelineModel → CapCut 초안        (경로 A)
emit-numbered.ts  TimelineModel → 순번 파일 세트     (경로 C)
```

`spec/07-assemble.md:156`이 "경로 C에서도 자동 검사와 큐 파일 생성은 동일하게 수행한다"고 요구한다. **단일 파일에 if/else로 만들면 13종 검사가 CapCut JSON 구조와 파일 세트 구조 양쪽에 두 벌이 된다.**

`checks.ts`는 **T6가 import한다.** 두 벌 구현하면 임계값이 어긋난다.

## 2. 트랙 10개

| 트랙 | 내용 |
|---|---|
| V1 | 메인 B-roll · 공식 영상 · 인터뷰 |
| V2 | 진행자 A-roll · 합성 |
| V3 | 모션 · 문서 강조 · 제품 오버레이 |
| V4 | 기본 자막 |
| V5 | 강조 키워드 · 전체 화면 caption card |
| V6 | 출처 표기 |
| A1 | **연속 내레이션 마스터** |
| A2 | 선택한 원본음 |
| A3 | BGM (비워 둠 — 곡 선택은 사람) |
| A4 | 효과음 · 앰비언스 |

(brandboy `TASKS.md:83`의 "9개 트랙"은 오기. `spec/07-assemble.md:14-25`가 10개다 — T10이 정정)

## 3. 타임라인

`shot.start`/`shot.end`를 **그대로 사용한다. 재계산하지 않는다** (`anchor`에서 이미 유도됨).

### 동영상
- `source_in`/`source_out`으로 절단, 앞뒤 `shots.handle_sec`(2초) 핸들을 작업 파일에 보존
- **루프 금지** (`shots.loop_allowed: false`). 부족하면 **조립을 실패시키고 보고**한다
- 정지 프레임으로 늘리지 않는다

### 이미지 — 촬영 모션 필수
- **모든 사진은 `photo_motion`대로 움직인다** (정지 사진 금지 — V18). 기본 `parallax`는 T8이 렌더한 `motion/<shot_id>` 파일을 얹고, **켄번즈** 등 다운그레이드는 여기서 ffmpeg `zoompan`으로 렌더한다
- `photo_motion.focal`(초점)·`zoom`·방향을 따른다. 초점은 사진 속 피사체(얼굴·제품·간판·텍스트)
- 문서·가격은 확대와 하이라이트로 읽을 위치를 명시

## 4. 편집 문법

- **선행 컷** — 새 인물·제품·장소는 내레이션보다 0.2~0.5초 먼저 (`tracks.allowed_overlap_sec` 예외)
- **J/L 컷** — 목소리 먼저 → 얼굴 / 화면 끝난 뒤 발언 유지 / 다음 장면 환경음 선행
- **크기 변화** — `wide → person → product → detail → proof` 교차. 같은 크기 `shots.same_framing_run_max_shots`(4) 연속이면 경고
- **전체 화면 강조 카드** — `caption_card` 비트에서만. 배경은 단색·텍스처·직전 화면의 어두운 정지 중 하나. `captions.impact_card.hold_sec` 유지 후 **다음 증거 화면으로 연결**. 같은 스타일 연속 사용 금지

## 5. 원본음

`source_audio`가 `moment` 또는 `quote`인 샷만 A2에 올린다.

- 외국어 발언은 원문 자막과 한국어 번역 구분
- 원본음 진입 전 BGM을 낮춤
- **내레이션과 원본 발언이 겹치지 않게 한다**
- 광고 음악을 통째로 살리지 않는다. 발언 의미를 바꾸는 짜깁기 금지
- 길이는 `shots.source_audio_sec`(2~9초)

## 6. 큐 파일

BGM 트랙을 비워 두는 것에서 끝내지 않는다.

```json
// music-cues.json
[{ "start": 0, "end": 32.4, "role": "hook-tension", "energy": 3, "note": "가격 공개 직전 잠깐 멈춤" }]
// sound-cues.json
[{ "at": 137.2, "role": "emphasis-soft", "linked_beat": "b042", "required": false }]
```

**막 경계마다 음악 큐가 있어야 한다.** SFX는 모든 강조 자막에 넣지 않는다 — 막 전환·결정적 숫자·반전만. `counts_per_15min.sfx`(10~25)로 시작.

## 7. 자막 · 출처

- 프리셋은 **`frame.md` + `edit-profile.json`의 `captions`**에서 생성 (`spec/07:106`). 기본 자막 / 키워드 강조 / 전체 화면 카드는 **서로 다른 프리셋**
- 숫자·고유명사·반전어만 색 강조. `captions.keyword.usage_ratio`(15~30%)
- 출처는 `sources/usage.json`에서 **자동 생성**. 화면 내 간단 표기 + 최종 자료표(원본 URL · 게시자 · 원본 구간 · 영상 내 구간 · 권리 상태)
- **모든 외부 자료가 역추적 가능해야 한다** (고위험만 표기하는 규칙은 폐기됨)

## 8. 자동 검사 14종 (`checks.ts`)

| 항목 | 기준 |
|---|---|
| 샷 없는 핵심 비트 | 0개 |
| 승인되지 않은 샷 | 0개 |
| **V15 위반** | `critical` 앵커의 `needs_review`/`orphaned` 0건 |
| **V17b 레인 중첩** | `tracks.allowed_overlap_sec` 초과 0건 |
| **V18 정지 사진** | `asset_kind="image"` 샷에 `photo_motion` 없음 0건 |
| 비디오 루프 | 0개 |
| 깨진 소스 파일 | 0개 |
| 총 길이 vs 내레이션 마스터 | ±0.2초 |
| 훅 30초 시각 변화 | `rhythm.intro_30s_visual_changes_min` 미만이면 **실패** |
| 8초 이상 시각 정체 | 구간 표시 |
| 동일 원본 10초 이상 연속 | 구간 표시 |
| 같은 화면 크기 4샷 연속 | 구간 표시 |
| 원본음과 내레이션 충돌 | 구간 표시 |
| 자막 안전 영역 위반 | 구간 표시 |
| 강조 카드와 발화 오차 0.2초 초과 | 구간 표시 |
| 막 경계에 음악 큐 없음 | 구간 표시 |

## 9. 출력 경로

```bash
--emit capcut|numbered|both     # 기본 both (마감 보험). 파일럿 루프는 capcut
```

```json
{ "outputs": {
    "capcut":   { "status": "ok",     "path": "~/Movies/CapCut/…" },
    "numbered": { "status": "failed", "error": "…" } } }
```

경로 C 출력: `0001_sh0042.mp4` 순번 파일 세트 + SRT + 큐 파일 + 배치 안내 `ASSEMBLY.md`.

**샷 400개 초과 시 CLI 호출을 배치로 나눈다** (인자 길이 제한).

## 10. `--pilot` — 선택적 첫 구간 룩체크 (게이트 아님)

[SCOPES §5](../SCOPES.md). 스토리보드 승인(T4/승인 ②)이 게이트이므로 파일럿은 **의무가 아니다.** 전체 조립 전 첫 연속 구간(spine) 하나만 먼저 조립해 눈으로 확인하고 싶을 때 쓴다.

- spine은 **연속 구간 1개.** A1 마스터를 자르지 않고 그대로 사용
- samples·10요소 강제 없음(시각 파라미터는 `frame.md`로 확정됨)
- spine 총길이 = 해당 구간 마스터와 ±0.2초

---

## 완료 조건

### T5 (T6 착수 조건)

- [ ] **10트랙 전부가 `TimelineModel`에 존재**하고 각 트랙 항목 수가 `render_report`에 출력됨 — 자동 판정
- [ ] 경로 A: CapCut 초안이 열림 — **사람 1회 확인 + 스크린샷** / 경로 C: 파일 수·순번 연속성 자동 검사
- [ ] 루프 0건 · 미승인 샷 0건 · 깨진 소스 0건 · **V15 위반 0건** · **V17b 위반 0건** · **V18(정지 사진) 0건**
- [ ] **모든 사진이 `photo_motion`대로 렌더됨** — parallax는 T8 산출 얹기, 켄번즈는 zoompan. 정지 사진 0건
- [ ] 총 길이가 `narration-master.wav`와 ±0.2초
- [ ] 훅 30초 시각 변화 ≥ `rhythm.intro_30s_visual_changes_min`(12), 미만이면 실패
- [ ] 출처가 `sources/usage.json`에서 자동 생성
- [ ] `music-cues.json`에 **막 경계마다** 큐, `sound-cues.json` 출력
- [ ] 샷 400개 초과 시 배치 분할 동작
- [ ] `--emit both`에서 경로별 상태가 각각 리포트됨

### `--pilot` 룩체크 (선택)

- [ ] spine 길이가 해당 구간 마스터와 **±0.2초**
- [ ] **A1이 spine 구간에서 잘리지 않았음** — 마스터에서 추출한 구간의 파형이 원본과 샘플 단위 일치

---

## 승인은 T4 스토리보드에서 끝났다

60초 파일럿 G3 게이트는 **제거**됐다. 소스·사진모션·편집 확정은 [T4 스토리보드(승인 ②)](./T4-review.md)에서 반복 피드백으로 이뤄지고, 시각 파라미터는 `frame.md`로 초기 확정된다. **따라서 조립 후 `edit-profile` 실측 교정 단계는 없다.** 조립 결과의 최종 판단은 [T6](./T6-qc.md) 후 사람 4회 시청(승인 ③)이다.

> 재작업을 막는 가장 큰 장치는 **스토리보드**다. 300개 샷을 붙인 뒤 소스·사진모션을 바꾸는 대신, 타이밍이 붙은 스토리보드에서 미리 확정한다(`IMPLEMENTATION.md:267`).

## 검증 명령

```bash
cd ~/brandboy-pipeline
npx tsx src/cli.ts assemble --project projects/<slug> --emit both
npx tsx src/cli.ts assemble --project projects/<slug> --pilot pilot.json --emit capcut   # 선택: 첫 구간 룩체크
npx tsx scripts/verify-assemble.ts     # 10트랙 · 루프 · 미승인 · V15/V17b · V18 사진모션 · 길이
```

## 흔한 함정

- **`--pilot`에서 마스터를 잘라 이어붙이기** → A1 연속 마스터 불변식 위반. spine은 **자르지 않고 구간을 그대로** 쓴다.
- **정지 사진을 그대로 조립** → V18로 막힌다. 모든 사진에 `photo_motion`(기본 parallax)을 붙이고, 켄번즈는 `zoompan`으로 렌더한다.
- **`checks.ts`를 T6에 복사** → 임계값이 어긋난다. import한다.
- **루프로 부족한 영상 메우기** → 금지. 실패 보고.
- **모션 렌더 실패 시 `fallback_text`로 대체** → 금지. 해당 샷을 실패로 보고.
- **`selection_status != approved` 샷 조립** → 중단. 물음표 클립보다 낫다.
- **선행 컷을 중첩 위반으로 실패 처리** → `tracks.allowed_overlap_sec` 예외를 적용한다.

## 규모 근거 (900~1350줄)

`model.ts` 200 · `checks.ts` 210(+V18 사진모션) · `emit-capcut.ts` 250 · `emit-numbered.ts` 250(실제 transcode 오케스트레이션·400샷 배치) · 큐/usage/크레딧 150 · **사진 촬영모션 렌더(parallax 얹기·zoompan) + `--pilot` spine 룩체크 100~150**.
