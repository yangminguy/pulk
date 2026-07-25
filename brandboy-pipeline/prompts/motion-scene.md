# PROMPT — 모션그래픽 제작

```
spec/06-motion.md 와 config/frame.md 를 읽어라.
preflight-report.md 의 P3 결과를 확인하고 렌더 경로를 정해라.

대상: motion/requests/<beat_id>.json  (critical 비트의 모션 요청. { beat_id, visual_statement, duration, type, frame_rev })

작업:
1. motion/requests/<beat_id>.json 을 읽고 HTML composition 을 저작해라.
   워크플로우 스킬을 명시적으로 켜라 (/motion-graphics).
   범용 모드로 만들면 가운데 정렬 텍스트 + 아이콘 3개가 나온다.
2. frame.md 의 디자인 토큰(색·타이포·여백)을 준수해라.
   색·폰트·여백을 지정하지 않으면 영상마다 톤이 어긋난다.
3. visual_statement 를 구체적인 그림으로 지정해라.
   "충성도 축적" ✕
   "저수지에 물이 차오르다 임계선을 넘어 흘러넘침" ○
   움직임은 인과·비교·필터링·진행·시점 변화를 설명해야 한다. 장식적 움직임은 실패다.
4. 등장은 0.25~0.6초, 설명 동작은 0.6~1.5초 안에 끝내라.
   무한 루프는 그 루프 자체가 개념을 설명할 때만.
5. reveal 배열의 at_word 시각을 audio/words.json 에서 가져와라.
   나레이션의 그 단어에서 해당 요소가 나타나야 한다.
6. 숫자 그래픽은 evidence_id 없이 렌더하지 마라.

금지:
- 글머리표 목록
- 아이콘 나열
- 실제 광고·제품 화면이 있는데 아이콘으로 대체
- 후보 수급 실패를 숨기기 위한 자동 그래픽
- 큰 글자 한 줄이면 충분한 반전·숫자·펀치

툴체인 (버전 핀 0.7.71, @latest 금지):
- npx hyperframes@0.7.71 lint   <html>              # 구조 검증 (data-composition-id·트랙 겹침)
- npx hyperframes@0.7.71 check  <html>              # inspect 후속. 텍스트 넘침·캔버스 이탈 검출
- npx hyperframes@0.7.71 render <html> --format mov # 투명(알파) 산출
- 저작 후 반드시 lint → check 를 통과시켜라. 실패 시 fallback_text 로 대체하지 말고 실패로 보고해라.
- 샷 하나당 5~10초 조각만. 전체 영상을 렌더하지 마라.
- 수정 중에는 렌더하지 말고 브라우저 미리보기로 확인해라.
- 경로 A: 알파(mov/webm) 오버레이 V3 / 경로 D: frame.md 단색 배경 메인 트랙

확인:
- 숫자가 1.5초 이상 읽히는가
- 모바일 화면에서 읽히는가
- 같은 frame.md 로 만든 3개의 톤이 동일한가
- 모션 비중이 전체의 10%를 넘지 않는가
```
