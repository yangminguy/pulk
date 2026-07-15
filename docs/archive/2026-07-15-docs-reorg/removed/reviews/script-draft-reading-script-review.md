# ScriptDraft & ReadingScript Card Review

## 총평 (Overall)
**조건부 LGTM (LGTM with minor changes)** 
새로운 UI 컴포넌트(`ScriptDraft`, `ReadingScriptCard`)와 Fountain 파싱 로직이 전반적으로 잘 구현되었으며, 의도한 목적에 부합합니다. 다만 Lexical 에디터의 텍스트 추출 방식과 자동 스크롤 로직에 약간의 개선이 필요합니다. 아래 수정 사항을 반영해 주시기 바랍니다.

## 수정 요청 사항 (Action Items)

### 1. `apps/founder-ui/src/components/ScriptDraft/ScriptDraft.tsx`
- **문제점**: Lexical 상태를 `JSON.stringify(editorState.toJSON())`로 반환하고 있습니다. 이 경우 PlainText 형태의 Fountain 스크립트 문자열이 아니라, Lexical 내부의 AST JSON 구조가 반환됩니다.
- **해결 방안**: `$getRoot().getTextContent()`를 사용하여 순수 텍스트를 추출하도록 수정해야 합니다.
```tsx
import { $getRoot } from 'lexical'

const handleChange = (editorState: EditorState) => {
  editorState.read(() => {
    onChange?.($getRoot().getTextContent())
  })
}
```

### 2. `apps/founder-ui/src/components/ReadingScriptCard/ReadingScriptCard.tsx`
- **문제점**: `tick` 함수가 스크롤이 맨 아래에 도달한 후에도 `requestAnimationFrame`을 통해 무한히 호출되며 멈추지 않습니다.
- **해결 방안**: 컨테이너가 바닥에 도달하면 재생을 자동 일시정지하거나, 불필요한 프레임 호출을 멈추도록 예외 처리를 추가하면 더 완성도가 높아집니다.
```tsx
const tick = useCallback(() => {
  const el = containerRef.current
  if (!el) return
  
  // 스크롤이 맨 아래에 도달했는지 체크
  if (el.scrollTop + el.clientHeight >= el.scrollHeight) {
    setIsPlaying(false) // 재생 멈춤
    return
  }
  
  el.scrollTop += speedRef.current
  rafRef.current = requestAnimationFrame(tick)
}, [])
```

### 3. `apps/founder-ui/src/app/chat/page.tsx` 및 `apps/founder-ui/src/app/video-room/page.tsx` 연동
- 두 페이지에 각각 `ScriptDraft`와 `ReadingScriptCard`가 컴포넌트로 잘 배치되어 있습니다.
- `video-room/page.tsx`에 `blocks={[]}`처럼 빈 배열이 하드코딩 되어 있는데, UI 레이아웃 확인용으로는 문제가 없습니다. (이후 상태 바인딩 필요)

## 기타 코멘트 (Notes)
- `packages/l5-core/src/functions/script-parsing/fountain.ts`: 기초적인 Fountain 구문 파서(Scene, Character, Parenthetical, Dialogue, Action)가 정규식을 사용하여 깔끔하게 작성되었습니다. 
- `__tests__/fountain.test.ts`: 블록 길이 검증이 `5 -> 6`으로 적절히 수정되어 테스트가 잘 통과되었습니다.
