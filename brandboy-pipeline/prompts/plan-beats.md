# PROMPT — 비트 분할과 샷 요구사항

```
docs/IMPLEMENTATION.md 의 "데이터 구조" 절과 spec/03-plan.md 를 읽어라.
config/edit-profile.json 의 beats 와 acts 값을 사용해라.

입력:
- timeline.json
- script-map.json  (sentence_key 불변 ID 포함)
- research/evidence.json

산출물: beat-plan.json 하나. **shot-plan.json 을 쓰지 마라.**
pipeline plan --apply 가 beat-plan.json 을 읽어 shot-plan.json 의 Z1 구역에 병합한다.

작업:
1. timeline.json 의 단어 시각 위에 의미 비트를 얹어라.
   문장부호가 아니라 의미 변화로 나눈다.
   인물·제품·장소·행동·숫자·사실→해석·문제→결과 중 하나가 바뀌면 새 비트다.
2. 비트의 start/end 는 timeline.json 의 단어 시각에 맞춘다. 임의로 계산하지 마라.
3. 각 비트에 anchor: { sentence_key, offset_sec } 를 반드시 채워라.
   sentence_key 는 script-map.json 의 불변 ID 다. start/end 는 anchor 에서 유도되는 캐시다.
4. 각 비트에 visual_function, importance, search_intent 를 붙여라.
5. critical 비트에는 must_show 와 avoid 를 반드시 채워라.
6. 비트 길이를 막별 acts.<act>.shot_sec 중앙값으로 나눠 필요한 샷 수를 정하고,
   selection_status: "need" 상태의 샷 요구사항을 만들어라.
7. purpose 에 "관련 영상" 같은 문구를 쓰지 마라.
   인물·행동·제품·숫자 중 무엇을 왜 보여줄지 적어라.
8. emphasis_caption 은 후보로만 제시해라. 전체 화면 카드 확정은 검수(Z2)에서 한다.

비트 재분할 시:
- selection_status != "need" 샷(승인·잠금 등)을 삭제·갱신하지 마라. 새 비트에 재바인딩만 해라.
- 보존 샷이 덮는 시간대에 새 need 샷을 생성하지 마라.
  커버리지 미달은 임의로 채우지 말고 coverage_gap[] 으로 보고해라.

제약:
- 비트가 내레이션 전 구간을 덮어야 한다 (공백 0.2초 이하)
- 6초를 넘는 비트는 쪼갠다
- 15분 원고는 150~300개 비트가 된다
- 비트 수를 일정하게 맞추지 마라

출력 후:
pipeline plan --apply --project . 로 병합하고
pipeline validate --project . --human 을 실행해 결과를 보고해라.
errors 나 writeScoped abort 가 있으면 고치고 다시 검증해라.

먼저 앞의 3개 세그먼트만 처리해서 보여주고 확인을 받아라.
```
