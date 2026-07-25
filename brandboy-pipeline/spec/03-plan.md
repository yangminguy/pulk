# SPEC 03 — 비트 분할과 샷 요구사항

> **에이전트 작업이다. CLI로 구현하지 않는다.**
> 산출물은 `pipeline validate`가 검증한다. 프롬프트는 `prompts/plan-beats.md`.

## 목적

`timeline.json`의 실제 발화 시각 위에 의미 비트를 얹고, 비트마다 필요한 화면을 명시한다.

---

## 1. 입력

- `timeline.json` — 문장·단어 시각 (align 산출물)
- `script-map.json` — 세그먼트, 막, 주장 연결
- `research/evidence.json`

## 2. 출력

**`beat-plan.json` 하나** — 비트와 `need` 상태의 샷 요구사항. plan 에이전트 전용 산출물이다.

`shot-plan.json`을 직접 쓰지 않는다. `pipeline plan --apply`가 `beat-plan.json`을 읽어 `shot-plan.json`의 **Z1 구역**으로 `writeScoped(Z1)` 병합한다. 구역 밖 필드(검수 선택 Z2 · 시각 Z3)가 바뀌면 abort한다. 비트 재분할 시 `selection_status != "need"` 샷은 삭제·갱신하지 않고 새 비트에 재바인딩만 하며, 보존 샷이 덮는 시간대에 새 `need` 샷을 만들지 않고 커버리지 미달은 `coverage_gap[]`로 보고한다.

---

## 3. 비트 분할 규칙

**문장부호로 자르지 않는다.** 다음 중 하나가 바뀌면 새 비트다.

- 핵심 인물·제품·장소
- 행동
- 숫자·연도·성과
- 사실에서 해석으로의 전환
- 문제에서 결과로의 전환
- 진행자 등장 의도

### 예

> "1988년 나이키는 광고를 공개했고 매출이 크게 늘었습니다."

**최소 세 비트다.**

1. `1988년` — 시대·과거 화면 · `context`
2. `광고를 공개했고` — 실제 광고 · `evidence`
3. `매출이 크게 늘었습니다` — 숫자 또는 차트 · `evidence`

### 제약

- 비트의 `start`/`end`는 `timeline.json`의 **단어 시각에 맞춘다.** 임의로 계산하지 않는다
- 비트 수를 일정하게 맞추지 않는다. 의미가 바뀌는 곳에서만 나눈다
- `beats.max_duration_sec`(6초)를 넘는 비트는 쪼갠다
- 내레이션 전 구간을 비트가 덮어야 한다. 허용 공백은 `beats.coverage_gap_max_sec`(0.2초)
- 15분 기준 `beats.expected_count_per_15min`(150~300) 범위를 벗어나면 분할 기준을 재검토한다

---

## 4. 샷 요구사항 생성

비트 길이를 막별 `acts.<act>.shot_sec` 중앙값으로 나눠 필요한 샷 수를 정한다.
`hook`은 0.8~2.2초이므로 같은 5초 비트라도 `build`보다 샷이 더 많이 필요하다.

초기 샷에는 **파일을 넣지 않고 요구사항만** 만든다.

```json
{
  "shot_id": "sh0042",
  "beat_ids": ["b042"],
  "start": 134.2,
  "end": 137.8,
  "asset_kind": "product_page",
  "purpose": "공식몰의 실제 제품 가격을 증명",
  "selection_status": "need",
  "rights_status": "unknown"
}
```

**`purpose`를 "관련 영상"처럼 쓰지 않는다.** 인물·행동·제품·숫자 중 무엇을 왜 보여줄지 적는다. 이 문장이 검수 화면에 그대로 표시되고, 검수자가 판단하는 기준이 된다.

---

## 5. 강조 카드 처리

`emphasis_caption`이 있는 비트가 반드시 전체 화면 카드가 되는 것은 아니다.

- **B-roll 위 키워드 강조** — 기본
- **전체 화면 `caption_card`** — 반전·숫자·한 줄 결론에만

둘 중 어느 쪽인지는 **검수 단계에서 선택**한다. plan은 후보로만 표시한다.

`counts_per_15min.impact_cards`(4~10회)를 넘지 않게 후보를 조절한다.

---

## 6. 사람 확인

`critical` 비트의 분할 결과는 사람이 확인해야 한다. 자동 분할은 초안이다.

---

## 7. 완료 조건

- 내레이션 전 구간이 비트로 덮인다 (공백 0.2초 이하)
- 모든 비트가 원고 텍스트와 단어 시각으로 역추적된다
- 비트 시간이 겹치거나 역전되지 않는다
- 15분 원고가 150~300개 비트가 된다
- 모든 `critical` 비트에 `must_show`가 있다
- `pipeline validate`가 통과한다
