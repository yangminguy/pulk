# T8 — 모션 브릿지 + 사진 parallax (~250줄) · T9c `motion-scene.md` 개정

**선행**: T2 · **P2c**(hyperframes 계약) · T9c
**읽을 것**: [CONTRACTS.md](../CONTRACTS.md) · `~/brandboy-pipeline/spec/06-motion.md` · [PORTING.md](../PORTING.md) M6
**파일**: `src/motion/bridge.ts` · `prompts/motion-scene.md`

## 먼저 확인할 것

- [x] P2c 결과 — `lint`·`inspect`·`--non-interactive`가 실재하는가. **확정된 버전 번호**
- [ ] P3 결과 — 알파 인식(경로 A: 오버레이 V3) / 검은 배경(경로 D: 단색 배경 + 메인 트랙)
- [x] `package.json`에 hyperframes 버전이 고정돼 있는가

### P2c 실측 결과 (2026-07-25, preflight-report.md)

- 버전 핀 **0.7.71** (`~/brandboy-pipeline/package.json` devDependencies에 고정 완료)
- `lint` 실재 · **`inspect`는 deprecated → 후속 `check` 서브커맨드 사용** · `init --non-interactive` 실재
- 알파 출력: **`render --format mov|webm`이 투명 지원** (`.mp4` 기본값은 알파 불가) → 체인은 `lint → check → render --format mov`
- `render --strict`(lint 오류 시 렌더 실패) 존재 — 체인 단축에 활용 가능
- CapCut의 알파 mov 인식(P3 경로 A/D 확정)은 사람 확인 대기(preflight H2)

---

## 목적

`critical` 비트의 **원리 설명 화면**을 자체 제작한다. 사장님 결정(D5): **모션은 조금만 들어가도 되고, `critical` 비트만 스킬로 새로 제작한다.**

`ratios.motion`(5~10%) → 15분 영상이면 45~90초, 약 20~35 클립. **하한(5%) 지향.**

**또한 사진 촬영 모션을 렌더한다.** 사진(`asset_kind:"image"`)은 기본 `parallax`로 처리한다 — 전경/배경 레이어를 분리해 깊이감·라이트·그레인 같은 "영상적 요소"를 더한다(§6). 켄번즈로 다운그레이드된 사진은 hyperframes가 아니라 조립 단계 ffmpeg `zoompan`이 처리한다(T5 §3).

## 1. 두 경로

| 경로 | 대상 | 방식 | 품질 |
|---|---|---|---|
| **스킬 저작** | `critical` 비트의 원리 설명 | 에이전트가 `~/hyperframes/skills/hyperframes`로 HTML composition 저작 | 상한 없음 |
| **템플릿 렌더** | 반복 패턴 — 라벨 · 수치 · 출처 · 장절 카드 | factory `hyperframes-runner` 템플릿 | 상한 있음, 초 단위 |

## 2. 흐름

```
critical 비트의 모션 요구사항
   ↓
motion/requests/<beat_id>.json     { beat_id, visual_statement, duration, type, frame_rev }
   ↓
[에이전트] hyperframes 스킬로 HTML composition 저작
   ↓
npx hyperframes@<핀> lint          구조 검증 (data-composition-id, 트랙 겹침, 미등록 타임라인)
   ↓
npx hyperframes@<핀> inspect       헤드리스 크롬으로 타임라인 시크 → 텍스트 넘침·캔버스 이탈 검출
   ↓
npx hyperframes@<핀> render        → motion/<beat_id>.<확정형식>
```

**버전 핀은 `package.json`에 둔다.** `edit-profile.json`은 *편집 수치* 단일 출처이지 의존성 매니페스트가 아니다.

`rg 'hyperframes@latest' src/` → **0건**이어야 한다.

## 3. 캐시

`spec/06-motion.md:109`: **`visual_statement + type + 길이 + frame.md`의 해시가 같으면 재렌더하지 않는다.**

```
.cache/motion-<sha256(visual_statement + type + duration + frame_rev)>.json
```

`frame.md`가 바뀌면 `frame_rev`가 오르고 **전부 다시 렌더된다** (`spec/06-motion.md:110`). [SCOPES §4](../SCOPES.md) 무효화 표 참조.

## 4. 알파

| P3 결과 | 처리 |
|---|---|
| **경로 A** — ProRes 4444 또는 알파 WebM 인식 | 오버레이 트랙 **V3** 사용 |
| **경로 D** — 검은 배경 딸려옴 | `frame.md`의 **단색 배경**을 넣어 렌더하고 **메인 트랙**에 배치. 화면을 채우지만 품질 손실 없음 |

## 5. 실패 처리

**`fallback_text`로 자동 대체하지 않는다.**

| 실패 지점 | 처리 |
|---|---|
| `lint` 실패 | 해당 샷을 `failed[]`로 보고. 저작 재시도 대상 |
| `inspect`가 텍스트 넘침/이탈 검출 | 동일 |
| `render` 종료코드 ≠ 0 | 동일 |
| 산출 파일이 `probe` 실패 | 동일 |

`assemble`은 모션 파일이 없으면 **해당 샷을 실패로 보고**한다(`spec/07-assemble.md:164`). 물음표 클립보다 낫다.

## 6. 사진 parallax 렌더

- 입력: `shot.photo_motion.type == "parallax"`인 `image` 샷 + 원본 스틸
- hyperframes composition으로 **레이어 분리(피사체/배경) + 느린 카메라 이동 + 라이트/그레인**
- `photo_motion.focal`(초점)·`zoom`(줌 범위)·`duration_sec`를 따른다
- lint → inspect → render 체인은 모션 그래픽과 동일. 산출은 `motion/<shot_id>.<확정형식>`
- **캐시 키**: `sha256(source_still + focal + zoom + duration + frame_rev)`
- 켄번즈(다운그레이드)는 여기가 아니라 **T5 조립의 ffmpeg `zoompan`**이 처리한다

---

## T9c — `motion-scene.md` 개정

P2c에서 확정된 실제 서브커맨드·플래그·출력 형식으로 프롬프트를 고친다. 현재 factory 러너(`hyperframes-runner/render.ts:71`)는 `["--yes","hyperframes@latest","render","--output",outAbs]`로 **lint·inspect·`--non-interactive`가 없고 `.mp4`(알파 불가)이며 버전이 안 고정**돼 있다.

프롬프트가 지시해야 할 것:
- `motion/requests/<beat_id>.json`을 읽고 HTML composition을 저작할 것
- `frame.md`의 디자인 토큰을 따를 것 (색·타이포·여백)
- 모션이 **인과·비교·필터링·진행·시점 변화**를 설명할 것. 장식적 움직임 금지
- 대부분의 등장은 0.25~0.6초, 설명 동작은 0.6~1.5초 안에 끝낼 것
- 무한 루프는 그 루프 자체가 개념을 설명할 때만
- 완료 후 반드시 `lint` → `inspect`를 통과시킬 것

---

## 완료 조건

- [ ] 요청 1건이 **저작 → lint → inspect → render까지 자동 진행**한다. 성공 기준:
  - `motion/requests/<beat_id>.json` 존재
  - 저작된 HTML이 `lint` 통과 (종료코드 0)
  - `inspect`가 텍스트 넘침·캔버스 이탈 **0건** 보고
  - `render` 종료코드 0
  - 산출 파일이 `probe` 통과하고 길이가 요청 `duration ± 0.1초`
- [ ] lint/inspect 실패 시 해당 샷을 `failed[]`로 보고 (**`fallback_text` 대체 금지**) — 의도적 파손 HTML 픽스처로 검증
- [ ] 산출 형식이 **P3 확정 형식과 일치**
- [ ] `rg 'hyperframes@latest' src/` → **0건**
- [ ] 캐시 키에 `frame_rev`가 포함되고, `frame_rev` 증가 시 재렌더가 발생
- [ ] 모션 총 길이가 `ratios.motion` 범위 내
- [ ] 템플릿 폴백이 `critical`이 아닌 비트에서만 동작
- [ ] **사진 parallax 픽스처** — `photo_motion.type="parallax"` 샷 1건이 저작→lint→inspect→render 통과, 산출 길이 `duration_sec ± 0.1초`, 캐시 키에 `frame_rev`·`focal`·`zoom` 포함

## 검증 명령

```bash
cd ~/brandboy-pipeline
npx tsx src/cli.ts assemble --project projects/<slug> --pilot pilot.json   # 모션 요청 생성
# 에이전트가 저작
npx tsx scripts/verify-motion.ts     # lint/inspect/render 체인 · 실패 시 failed 보고 · 캐시 키
rg 'hyperframes@latest' src/
```

## 흔한 함정

- **`@latest` 사용** → 매 실행 버전이 바뀌어 결정론이 깨진다. `package.json` 핀.
- **`lint`/`inspect` 건너뛰기** → 한글 텍스트 넘침이 렌더 후에야 드러난다. `inspect`가 헤드리스 크롬으로 타임라인을 시크하며 잡아준다.
- **모션 실패를 텍스트로 대체** → 금지. 실패로 보고한다.
- **모든 비트에 모션 저작** → D5 위반. `critical`만. 총량은 `ratios.motion` 하한 지향.
- **`frame.md`를 캐시 키에서 누락** → 디자인 토큰을 고쳐도 옛 모션이 남는다.
