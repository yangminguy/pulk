# Business PT Context Snapshot Card & Loader Specification

## 1. 개요 (Overview)
본 문서는 사전 오픈소스 조사 결과(Satori, shadcn/ui)를 바탕으로, Business PT Context를 시각적으로 요약해주는 Snapshot Card 컴포넌트와 데이터를 불러오거나 이미지를 생성하는 동안 노출될 Loader 컴포넌트의 아키텍처 및 요구사항 스펙을 정의합니다.

## 2. 요구사항 명세 (Requirement Specification)
1. **서버 사이드 스냅샷 생성 (Server-Side Snapshot Generation)**:
   - Satori를 활용하여 Next.js API 라우트(Edge/Server) 기반으로 Business Context 데이터를 SVG 또는 이미지로 변환하는 기능을 제공해야 합니다.
2. **클라이언트 부하 최소화 (Minimizing Client Load)**:
   - 무거운 DOM 렌더링 및 캡처 작업(html2canvas 등)을 서버로 위임하여 클라이언트 사이드의 메인 스레드 성능 부하를 방지합니다.
3. **통합 UI/UX 로더 (Integrated Loader UI)**:
   - 기존 디자인 시스템(TailwindCSS 및 shadcn/ui)과 일관성을 유지하는 Skeleton 기반의 SnapshotCardSkeleton(Loader) 컴포넌트를 구현해야 합니다.
4. **모듈화 및 재사용성 (Modularity & Reusability)**:
   - 스냅샷 레이아웃 컴포넌트, 로더 컴포넌트, 서버 사이드 이미지 렌더링 로직은 독립된 모듈로 구성되어 테스트 및 재사용이 용이해야 합니다.

## 3. 영향을 받는 파일 및 모듈 목록 (Affected Files & Modules)
- `packages/l5-core/package.json` (수정): `satori` 및 폰트/이미지 처리 관련 의존성 추가.
- `packages/l5-ui/package.json` (수정): UI 의존성 확인.
- `packages/l5-core/src/api/snapshot/generate-snapshot.ts` (신규): Satori를 이용하여 Business PT 데이터를 스냅샷 SVG로 변환하는 코어 로직.
- `packages/l5-ui/src/components/snapshot/SnapshotCard.tsx` (신규): 생성된 스냅샷 이미지 혹은 UI 형태의 데이터를 표시하는 리액트 컴포넌트.
- `packages/l5-ui/src/components/snapshot/SnapshotCardSkeleton.tsx` (신규): 스냅샷 로딩 중 노출되는 shadcn/ui Skeleton 기반의 로더 컴포넌트.
- `packages/l5-core/src/schemas/snapshot.ts` (신규): 스냅샷 생성 요청 시 필요한 Business PT Context 데이터 모델 Zod 스키마.

## 4. 인수 조건 (Acceptance Criteria)
다음 조건들은 테스트 코드를 통해 객관적으로 측정 및 검증 가능해야 합니다.

- [ ] **의존성 충돌 제로**:
  - `packages/l5-core/package.json`에 `satori` 관련 패키지 추가 후 `pnpm install` 수행 시 에러나 경고 없이 프로젝트 전역 빌드가 성공한다.
- [ ] **스냅샷 데이터 스키마 검증 (Validation)**:
  - `snapshot.ts`에 정의된 Zod 스키마에 대해 필수 Business PT Context 항목(예: 제목, 메인 내용 등)이 포함된 Mock 데이터를 주입했을 때 성공적으로 파싱된다. 잘못된 타입이나 필수값 누락 시 에러를 반환한다.
- [ ] **Satori 기반 SVG 생성 로직 테스트**:
  - `generate-snapshot.ts` 유틸리티 함수(또는 API 핸들러 코어 부분)에 유효한 스냅샷 데이터를 전달하여 호출했을 때, SVG 형태의 문자열 결과값이 반환되는지 단위 테스트로 확인한다.
- [ ] **로더(Skeleton) UI 렌더링 테스트**:
  - `SnapshotCardSkeleton.tsx` 컴포넌트가 렌더링될 때, 내부에 Tailwind CSS 애니메이션(예: `animate-pulse`)과 접근성을 위한 요소가 포함되어 렌더링되는지 테스트로 확인한다.
