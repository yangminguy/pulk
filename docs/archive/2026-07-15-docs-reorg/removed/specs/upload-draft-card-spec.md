# SPEC: UploadDraft Card & 메타데이터 입력

> 상태: draft | 작성: 2026-06-04
> OSS 조사 결과 연계: 파일 업로드(`react-dropzone`), 메타데이터 폼(`react-hook-form` + `zod`), 태그 입력(직접 구현) 채택

## 1. 배경 및 문제

Founder 또는 에이전트(CMO 등)가 외부 자료, 콘텐츠 초안(Draft), 멀티미디어(이미지/동영상/문서)를 시스템에 업로드할 때, 단순 파일 업로드뿐만 아니라 **구조화된 메타데이터(제목, 설명, 태그, 카테고리, Risk Level 등)를 함께 입력**해야 하는 요구사항이 발생한다.
현재 `founder-ui`에는 이를 통합적으로 처리할 수 있는 전용 카드(UploadDraft Card) 컴포넌트가 부재하여, 다음과 같은 문제가 있다.
- 메타데이터 검증 로직 부재로 잘못된 데이터 입력 가능성
- 드래그 앤 드롭 등 직관적인 파일 업로드 UX 부족
- 태그 배열과 같은 복잡한 폼 상태 관리의 어려움

## 2. 목표

`founder-ui` 내에 파일 업로드와 메타데이터 입력을 동시에 처리하는 **UploadDraft Card**를 구현한다.
조사 단계에서 채택된 라이브러리(`react-dropzone`, `react-hook-form`, `zod`)를 활용하여 가볍고, 타입 안전(Type-safe)하며, 렌더링 성능이 최적화된 폼을 구축한다.

## 3. 데이터 모델

### 3.1 `UploadDraftFormData` 스키마 정의 (zod)

메타데이터 폼 검증을 위한 스키마 구조.

```typescript
// apps/founder-ui/src/schemas/upload-draft.schema.ts
import { z } from 'zod';

export const UploadDraftSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요.'),
  description: z.string().optional(),
  category: z.string().min(1, '카테고리를 선택해주세요.'),
  tags: z.array(z.string()).default([]),
  risk_level: z.enum(['D1', 'D2', 'D3', 'D4', 'D5']).default('D1'),
  fileId: z.string().optional(), // NocoBase 업로드 후 반환된 ID
});

export type UploadDraftFormData = z.infer<typeof UploadDraftSchema>;
```

### 3.2 저장 경로

- **파일 업로드**: 기존 NocoBase REST API의 파일 업로드 엔드포인트(`POST /api/attachments:create` 등) 사용
- **데이터 저장**: 업로드된 파일의 ID(`fileId`)와 입력된 메타데이터 폼 데이터를 합쳐서 NocoBase 데이터 컬렉션에 저장 (`POST /api/drafts:create` 등)

## 4. 요구사항

### 4.1 파일 업로드 (react-dropzone)

| 기능 | 설명 |
|------|------|
| 드래그 앤 드롭 | `react-dropzone`의 `useDropzone` 훅을 사용해 Headless UI 구현 |
| 미리보기 | 이미지 파일의 경우 `URL.createObjectURL`을 사용해 업로드 전 로컬 미리보기 제공 |
| 진행 상태 | fetch API를 활용해 NocoBase 서버로 파일 전송 시 프로그레스(업로드 중 상태) 표시 |

### 4.2 메타데이터 폼 (react-hook-form + zod)

| 필드 | 입력 컨트롤 |
|------|-------------|
| 제목 | 일반 텍스트 입력 (`<input type="text">`) |
| 설명 | 다중 줄 텍스트 입력 (`<textarea>`) |
| 카테고리 | 셀렉트 박스 (`<select>`) |
| Risk Level | 라디오 버튼 또는 셀렉트 박스 (D1 ~ D5) |
| 태그 | **직접 구현 (4.3 참고)** |

- `react-hook-form`의 Uncontrolled 방식을 사용하여 매 키 입력 시 발생하는 리렌더링을 방지한다.
- `@hookform/resolvers/zod`를 연결해 제출(Submit) 시 또는 입력 시 `zod` 기반 유효성 검사를 수행한다.

### 4.3 태그 입력 (직접 구현)

라이브러리(tagify 등) 없이 Tailwind 기반으로 직접 구현한다.
- **입력**: 텍스트 입력 후 Enter 키를 누르면 태그 배열에 추가됨.
- **표시**: 추가된 태그는 둥근 배지 형태로 나열됨.
- **삭제**: 각 태그 배지의 'x' 버튼을 클릭해 삭제.
- `react-hook-form`의 `useFieldArray`를 쓰거나, `setValue`/`watch`를 통해 단순 배열 상태로 관리한다.

## 5. 스타일 규격

프로젝트 정책에 따라 **Tailwind CSS**를 사용하여 자유롭게 스타일링하며, 무거운 외부 UI 컴포넌트 프레임워크는 배제한다.

| 요소 | 스타일 예시 |
|------|-------------|
| 드롭존 영역 | `border-2 border-dashed border-gray-300 rounded-lg p-6 flex items-center justify-center` |
| 드롭 활성화 시 | `border-blue-500 bg-blue-50` (드래그 호버 상태 표시) |
| 입력 폼 필드 | `border border-gray-300 rounded px-3 py-2 w-full focus:outline-none focus:border-blue-500` |
| 에러 메시지 | `text-red-500 text-sm mt-1` |
| 태그 배지 | `bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full flex items-center gap-1` |

## 6. Acceptance Criteria (인수 조건)

| # | 기준 | 검증 방법 |
|---|------|----------|
| AC1 | 요구된 라이브러리(`react-dropzone`, `react-hook-form`, `zod` 등)가 설치되어 있다. | `package.json` 의존성 확인 |
| AC2 | 드래그 앤 드롭 영역에 파일을 올리면 선택된 파일로 상태가 업데이트되며, 이미지일 경우 미리보기가 노출된다. | UI 수동 테스트 (파일 드래그 앤 드롭) |
| AC3 | 제목, 카테고리 등의 필수 메타데이터를 누락하고 폼 제출 시 폼 아래에 Zod 기반 에러 메시지가 표시된다. | UI 수동 테스트 (빈 값으로 Submit 클릭) |
| AC4 | 태그 입력란에 텍스트를 적고 Enter를 누르면 태그 배지가 생성되고, 배지의 삭제 버튼을 누르면 제거된다. | UI 수동 테스트 (태그 추가/삭제) |
| AC5 | 메타데이터 폼 입력 중 리렌더링이 카드 전체에서 발생하지 않고 최소화된다. | React DevTools Profiler로 타이핑 시 리렌더링 범위 확인 |
| AC6 | `pnpm --filter @l5/founder-ui typecheck` 실행 시 타입 에러가 발생하지 않는다. | CLI 실행 결과 `exit 0` 확인 |

## 7. 영향 파일 목록

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `apps/founder-ui/package.json` | 수정 | `react-dropzone`, `react-hook-form`, `@hookform/resolvers`, `zod` 의존성 추가 |
| `apps/founder-ui/src/schemas/upload-draft.schema.ts` | 신규 | 폼 검증을 위한 Zod 스키마 정의 |
| `apps/founder-ui/src/components/UploadDraftCard.tsx` | 신규 | 카드 컴포넌트(드롭존, 폼, 태그 인풋 포함) 레이아웃 및 렌더링 로직 구현 |
| `apps/founder-ui/src/lib/api.ts` | 수정 | NocoBase 파일 업로드 및 Draft 메타데이터 전송 관련 API 래핑 함수 추가 |

## 8. 범위 밖 (Out of Scope)

- 여러 파일을 동시에 업로드하는 다중 파일(Multi-file) 청크 업로드 기능은 이번 스펙에서 제외한다 (단일 파일 우선).
- 고급 이미지 편집 (크롭, 회전 등) 기능 제외.
- 백엔드(NocoBase)의 구체적인 컬렉션 스키마 세팅은 본 프론트엔드 UI 스펙 문서에서는 깊게 다루지 않는다 (해당 API 엔드포인트가 열려있다고 가정).
