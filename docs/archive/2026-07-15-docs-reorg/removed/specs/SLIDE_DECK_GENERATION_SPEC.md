# SlideDeckSpec Generation Logic Specification

## 1. 개요 (Overview)
본 문서는 사전 오픈소스 조사 결과(PptxGenJS 채택)를 바탕으로, LLM을 활용하여 구조화된 프레젠테이션 데이터(`SlideDeckSpec`)를 생성하고, 이를 실제 사용자 편집이 가능한 네이티브 `.pptx` 파일로 변환하는 로직의 요구사항과 설계 스펙을 정의합니다.

## 2. 요구사항 명세 (Requirement Specification)
1. **자료 구조 정의 (Schema Definition)**:
   - Zod 및 TypeScript를 사용하여 `SlideDeckSpec`의 엄격한 데이터 구조를 정의합니다.
   - 슬라이드 목록, 제목, 텍스트 본문, 레이아웃, 스피커 노트 등의 속성을 포함해야 합니다.
2. **LLM 파이프라인 구성 (Generation Pipeline)**:
   - LLM이 주어진 비즈니스/기획 컨텍스트를 바탕으로 정확한 `SlideDeckSpec` JSON 형식으로 응답하도록 프롬프트 템플릿과 파싱 로직을 구현합니다.
3. **PPTX 변환 모듈 구현 (PPTX Conversion)**:
   - `PptxGenJS` 라이브러리를 이용하여 `SlideDeckSpec` 객체를 순회하며, 실제 `.pptx` 슬라이드 객체 및 컴포넌트를 렌더링하는 컨버터(Converter) 함수/클래스를 구현합니다.
4. **환경 호환성 (Environment Compatibility)**:
   - Node.js 및 브라우저 환경 양쪽에서 실행될 수 있는 구조로 작성하거나, 백엔드에서 생성 후 클라이언트로 다운로드 스트림을 넘겨주는 명확한 인터페이스를 갖추어야 합니다.
5. **예외 처리 (Error Handling)**:
   - LLM의 환각(Hallucination) 또는 형식에 맞지 않는 JSON 반환 시의 재시도(Retry) 로직, 파싱 에러, 변환 에러에 대한 Fallback을 구현합니다.

## 3. 영향을 받는 파일 및 모듈 목록 (Affected Files & Modules)
- `packages/l5-core/src/schemas/slide-deck.ts` (신규): `SlideDeckSpec`에 대한 Zod 스키마 및 TypeScript 타입 정의.
- `packages/l5-core/src/prompts/slide-deck-prompt.ts` (신규): 프레젠테이션 생성을 위한 LLM 프롬프트 및 JSON 스키마 주입부.
- `packages/l5-core/src/services/slide-deck-generator.ts` (신규): LLM 호출, 응답 파싱, 스키마 검증 파이프라인.
- `packages/l5-core/src/converters/pptx-converter.ts` (신규): `SlideDeckSpec` -> `.pptx` (PptxGenJS) 변환 로직.
- `packages/l5-core/package.json` (수정): `pptxgenjs` 관련 의존성 추가.
- `packages/l5-core/src/__tests__/slide-deck.test.ts` (신규): 스키마 파싱 및 변환 로직에 대한 단위/통합 테스트.

## 4. 인수 조건 (Acceptance Criteria)
다음 조건들은 테스트 코드를 통해 객관적으로 측정 및 검증 가능해야 합니다.

- [ ] **스키마 단위 테스트**:
  - `SlideDeckSpec` 스키마에 대해, 최소 3가지 유효한 형태(기본형, 복합형 등)의 목업(Mock) 데이터가 성공적으로 검증(Zod parsing)된다.
  - 필수 필드가 누락된 최소 2가지의 유효하지 않은 데이터에 대해 예상된 Validation Error를 반환한다.
- [ ] **변환(Conversion) 기능 검증**:
  - `pptx-converter.ts` 모듈에 유효한 `SlideDeckSpec` 객체를 주입하여 실행했을 때 예외 발생 없이 성공한다.
  - 변환 결과로 생성된 파일(또는 Buffer, Blob)의 크기가 `0 byte`를 초과한다.
- [ ] **통합 파이프라인(E2E) 동작 검증**:
  - 모의(Mock) LLM 응답을 활용한 통합 테스트에서 파싱부터 PPTX 변환 파이프라인 전체가 에러 없이 성공 상태 코드로 반환된다.
- [ ] **의존성 충돌 제로**:
  - `package.json`에 `pptxgenjs` 추가 후 `pnpm install` 커맨드가 에러나 경고 없이 완료되며 프로젝트 전역 빌드가 성공한다.
