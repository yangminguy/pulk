# Voice Recording Upload & 상태 추적 명세 (Voice Recording Upload Spec)

## 1. 개요 (Overview)
본 명세는 사용자의 음성을 녹음(Capture)하고 이를 안정적으로 서버에 업로드(Upload)하며, 그 진행 상태를 시각적으로 추적(Status Tracking)할 수 있는 기능에 대한 요구사항을 정의한다.
사전 조사를 통해 채택된 **Uppy (+ `@uppy/audio` 플러그인)** 및 **Tus 프로토콜**을 활용하여 모바일 네트워크 환경에서도 중단 없는 이어올리기(Resumable Upload)를 지원하는 올인원(All-in-one) 솔루션을 구축하는 것을 목표로 한다.

## 2. 요구사항 명세 (Requirements)

1. **오디오 녹음 제어 (Audio Capture Control)**
   - 브라우저의 마이크 접근 권한을 안전하게 요청하고 예외 상황(권한 거부, 기기 없음)을 처리한다.
   - 녹음 시작, 일시 정지, 녹음 완료, 재생, 다시 녹음 등 기본적인 오디오 캡처 UI/UX를 제공한다.
2. **업로드 및 이어올리기 (Resumable Upload)**
   - Tus 프로토콜 기반의 클라이언트를 활용하여 대용량 음성 파일 업로드 시 네트워크 단절에 대비한 이어올리기를 지원한다.
   - 자동 재시도(Auto-retry) 로직을 포함하여 일시적인 연결 해제 시 업로드 실패율을 최소화한다.
3. **상태 추적 및 피드백 (Status Tracking)**
   - 업로드 진행률(0% ~ 100%)을 정교하게 추적할 수 있는 Progress Bar 컴포넌트를 UI에 제공한다.
   - 업로드 시작, 진행 중, 완료, 에러(실패) 등 각 단계별로 사용자에게 명확한 상태 시각적/텍스트 피드백을 제공한다.
4. **브라우저 호환성 (Cross-browser Compatibility)**
   - 데스크톱(Chrome, Edge 등) 및 모바일(iOS Safari, Android Chrome) 환경에서 Web Audio/MediaRecorder API와 Uppy 솔루션이 원활하게 동작하도록 호환성 처리를 적용한다.

## 3. Acceptance Criteria (인수 조건)

이 기능이 완료된 것으로 간주하기 위해 다음의 측정 가능한 기준을 충족해야 한다.

- [ ] **오디오 녹음 및 파일 생성**: 녹음 완료 후 유효한 오디오 포맷(예: WebM, MP3 등)의 Blob/File 객체가 정상적으로 생성되고 프리뷰(재생)가 가능해야 한다.
- [ ] **업로드 진행률 표시**: 업로드 시 네트워크 요청이 발생하며, UI 상의 Progress Bar 진행률이 0%에서 100%까지 오차 없이 실시간으로 반영되어야 한다.
- [ ] **네트워크 단절 및 이어올리기 검증**: 파일 업로드 진행 중 인위적으로 네트워크를 오프라인으로 변경 시 업로드가 일시 중지(에러 처리 없이 보류)되고, 온라인 복구 시 중단된 지점부터 남은 용량이 성공적으로 업로드 완료되어야 한다.
- [ ] **에러 핸들링**: 마이크 권한 거부 또는 지속적인 네트워크 장애 발생 시, 사용자 친화적인 에러 메시지가 화면에 노출되어야 한다.

## 4. 영향을 받는 파일 및 모듈 목록 (Affected Files & Modules)

- **설정 및 구성 파일**
  - `packages/l5-ui/package.json` (Uppy, `@uppy/audio`, `@uppy/tus` 등 패키지 종속성 추가)
- **UI 컴포넌트 (신규 생성)**
  - `packages/l5-ui/src/components/voice-recorder/VoiceRecorder.tsx` (오디오 캡처 및 진행률 표시 UI 컴포넌트)
  - `packages/l5-ui/src/components/voice-recorder/VoiceRecorder.stories.tsx` (스토리북용 컴포넌트 뷰)
- **커스텀 훅 및 로직 (신규 생성)**
  - `packages/l5-ui/src/hooks/useVoiceRecorder.ts` (Uppy 인스턴스 초기화 및 상태 관리 커스텀 훅)
  - `packages/l5-ui/src/utils/uppy-tus-client.ts` (Tus 프로토콜 기반 통신 및 리트라이 설정 래퍼)
- **테스트 파일**
  - `packages/l5-ui/src/components/voice-recorder/__tests__/VoiceRecorder.test.tsx` (컴포넌트 렌더링 및 모킹 기반 단위 테스트)
  - `packages/l5-ui/src/hooks/__tests__/useVoiceRecorder.test.ts` (훅 상태 변화 단위 테스트)
