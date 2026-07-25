# T6 — `qc` (~350줄)

**선행**: 승인② (스토리보드) · T5
**읽을 것**: [CONTRACTS.md](../CONTRACTS.md) §3 · [SCOPES.md](../SCOPES.md) §4 · `~/brandboy-pipeline/spec/08-quality.md` · [PORTING.md](../PORTING.md) M5
**파일**: `src/commands/qc.ts` (`src/assemble/checks.ts`를 **import**)

## 먼저 확인할 것

- [ ] T5 완료 조건이 전부 통과했는가
- [ ] `edit-profile.json`이 `frame.md` + 기본값 확정본인가 (`profile_rev` 확인)
- [ ] `assemble/checks.ts`가 존재하는가 — **여기서 새로 만들지 않는다**

---

## 목적

정량 리포트와 수정 목록을 만든다. **사람이 봐야 하는 것은 자동으로 통과 처리하지 않는다.**

## 1. `checks.ts` 재사용

```ts
import { runChecks } from '../assemble/checks'
```

T5의 자동검사 14종(V18 사진 촬영모션 포함)과 **같은 코드·같은 임계값**을 쓴다. 복사하면 반드시 어긋난다.

`qc`는 여기에 **렌더 후에만 알 수 있는 검사**를 더한다 — 최종 라우드니스, 실제 파일 존재, 총 길이 실측.

## 2. 치명 오류 12종 — 자동 / 수동 분리

`spec/08-quality.md:12`의 치명 12종 중 **데이터로 판정 가능한 것만** 자동 검사한다.

| 판정 | 처리 |
|---|---|
| 자동 가능 | `"verdict": "pass"` 또는 `"fail"` |
| 자동 불가 | **`"verdict": "human_required"`** (`spec/08-quality.md:34`의 문자열) |

> **`human_required`를 통과로 처리하면 안 된다.** "자동 검사가 안 잡았다"와 "문제가 없다"는 다르다.

## 3. `qc-report.json`

```json
{
  "profile_rev": 1,
  "frame_rev": 1,
  "metrics": {
    "duration_sec":            { "value": 879.2, "range": [720, 1200], "verdict": "pass" },
    "visual_change_avg_sec":   { "value": 2.6,   "range": [2.1, 2.8],  "verdict": "pass" },
    "intro_30s_changes":       { "value": 14,    "min": 12,            "verdict": "pass" },
    "a_roll_ratio":            { "value": 0.08,  "range": [0.1, 0.2],  "verdict": "fail" },
    "stock_ratio":             { "value": 0.04,  "max": 0.1,           "verdict": "pass" },
    "same_source_max_ratio":   { "value": 0.31,  "max": 0.35,          "verdict": "pass" },
    "impact_cards_per_15min":  { "value": 6,     "range": [4, 10],     "verdict": "pass" },
    "program_lufs":            { "value": -14.2, "target": -14,        "verdict": "pass" },
    "true_peak_dbtp":          { "value": -1.3,  "max": -1,            "verdict": "pass" },
    "narrative_clarity":       { "verdict": "human_required" },
    "rights_final_check":      { "verdict": "human_required" }
  },
  "fatal": [],
  "warnings": []
}
```

**모든 수치에 기준값을 병기한다.** 기준값 없는 수치는 판정이 아니라 정보다.

## 4. `fix-list.json` — P0/P1/P2

| 등급 | 정의 | 발행 |
|---|---|---|
| **P0** | 사실·권리·논지 오류 | **0개가 되어야 출고** |
| P1 | 리듬·가독성·사운드 결함 | 가능하면 수정 |
| P2 | 개선 제안 | 다음 편에 반영 |

```json
[{ "priority": "P0", "rule": "V8", "shot_id": "sh0142",
   "detail": "rights_status=unknown 인 외부 원본이 사용됨",
   "action": "권리 확인 또는 대체 화면" }]
```

## 5. 사람 검수 — 4회 시청 (`spec/08-quality.md:87`)

`qc`가 통과해도 이게 끝이 아니다. 리포트에 체크리스트를 출력한다.

| 회차 | 방식 | 보는 것 |
|---|---|---|
| 1차 | **화면 없이 듣기** | 원고만으로 공감→정보→관점→결론이 선명한가 |
| 2차 | **소리 없이 보기** | 화면만으로 논지가 따라가지는가 |
| 3차 | **모바일 크기** | 자막 가독성 · 출처 표기 |
| 4차 | **전체 실시간** | 리듬 · 지루한 구간 |

편수가 쌓이면 "다음 날 첫 30초 재확인"을 추가한다.

---

## 완료 조건

- [ ] **모든 수치가 `edit-profile.json` 기준과 대조되고 리포트에 기준값이 병기됨**
- [ ] `fix-list.json`이 P0/P1/P2로 분류되어 출력됨
- [ ] **사람 검수 항목이 `"verdict": "human_required"`로 출력** (통과 처리 금지) — 픽스처로 검증
- [ ] 의도적 위반 픽스처가 **정확한 규칙에서** 잡힘 (치명 12종 중 자동 가능한 것 각각)
- [ ] **`assemble/checks.ts`를 import한다** — `rg -n "from.*assemble/checks" src/commands/qc.ts` 결과 존재
- [ ] T5와 임계값이 동일 — 같은 프로젝트에 `assemble`과 `qc`를 돌려 겹치는 검사 결과가 일치하는지 회귀 테스트
- [ ] `--only` / `--pilot` 인자에 대해 `--only`는 exit 2, `--pilot`은 범위 한정 동작
- [ ] `profile_rev`/`frame_rev` 불일치 시 V16 경고와 무효화 표가 출력됨

## 검증 명령

```bash
cd ~/brandboy-pipeline
npx tsx src/cli.ts qc --project projects/<slug> --human
npx tsx scripts/verify-qc.ts             # human_required 유지 · 픽스처 위반 검출 · checks 공유
rg -n "from.*assemble/checks" src/commands/qc.ts
npx tsx src/cli.ts qc --project projects/<slug> --only b001 ; echo "exit=$?"   # 기대: 2
```

## 흔한 함정

- **`checks.ts`를 복사** → 임계값이 어긋나고 T5는 통과인데 T6는 실패(또는 반대)가 된다.
- **`human_required`를 `pass`로 집계** → "P0 0개"가 거짓이 된다.
- **기준값 없이 수치만 출력** → 사람이 판단할 근거가 없다.
- **factory `artifactQa.ts:55-65`의 `export const` 11개를 함께 이식** → Principle 2 위반. `edit-profile.json`으로 이관한다.
