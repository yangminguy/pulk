# VideoQA Result 자동 평가 명세 (VideoQA Evaluation Spec)

## 1. 개요 (Overview)
본 명세는 VideoQA (비디오 질의응답) 모델 및 파이프라인의 결과물에 대한 신뢰성과 품질을 보장하기 위해, 자동화된 평가 시스템을 구축하는 요구사항을 정의한다.
사전 연구를 통해 채택된 **LMMS-Eval** 프레임워크를 기반으로 하며, 도출된 VideoQAResult에 대해 7가지 핵심 품질 지표(7개 체크)를 자동 측정하고 검증한다.

## 2. 요구사항 명세 (Requirements)

VideoQAResult 검증을 위해 파이프라인은 다음의 **7개 체크(7 Checks)**를 자동 수행해야 한다.

1. **Format & Schema Validity (포맷 유효성)**
   - 모델 응답이 사전에 정의된 JSON 스키마(예: 답변, 타임스탬프, 신뢰도 점수 등)를 100% 준수하는지 검증한다.
2. **Temporal Grounding Accuracy (시간적 정확성)**
   - 모델이 참조한 비디오 내 타임스탬프가 실제 질문의 대상이 되는 사건의 타임스탬프와 일치하는지(오차 범위 내) 검증한다.
3. **Contextual Relevance (문맥 연관성)**
   - 모델의 답변이 비디오의 시각적/청각적 컨텍스트와 질문의 의도에 부합하는지 평가한다. (WUPS, Semantic Similarity 활용)
4. **Factual Consistency (사실 일관성)**
   - 환각(Hallucination) 현상 없이, 영상에 존재하는 사실만을 기반으로 답변했는지 LLM-as-a-judge 기법을 통해 검증한다.
5. **Completeness (완전성)**
   - 복합적인 질문(예: "누가 언제 무엇을 했는가?")에 대해 누락된 요소 없이 모두 답변했는지 확인한다.
6. **Robustness (강건성)**
   - 프롬프트에 약간의 노이즈나 변형이 들어가도 동일하거나 일관된 품질의 답변을 도출하는지 측정한다.
7. **Guardrail & Safety (가드레일 및 안전성)**
   - PII 노출, 부적절한 언어, 편향된 응답이 포함되지 않았는지 (OpenRedaction 등 오픈소스 보안 도구와 연계하여) 검증한다.

## 3. Acceptance Criteria (인수 조건)

이 기능이 완료된 것으로 간주하기 위해 다음의 측정 가능한 기준을 충족해야 한다.

- [ ] **평가 실행 자동화**: CI 환경에서 `pnpm run test:videoqa` 명령어 한 번으로 7개 체크가 모두 포함된 LMMS-Eval 기반 평가 파이프라인이 실행되어야 한다.
- [ ] **성공/실패 분기 (Threshold)**: 
  - 포맷 유효성(1) 및 가드레일/안전성(7) 체크는 **100% 통과(Pass)**해야 한다.
  - Contextual Relevance, Temporal Accuracy 등 정량적 지표의 총합 점수(Overall Score)가 **최소 80점 이상**이어야 CI 파이프라인을 최종 통과(Exit Code 0) 처리한다.
- [ ] **리포트 생성**: 평가 완료 후 `docs/reports/videoqa_eval_result.json` 및 `docs/reports/videoqa_eval_result.md` 형식의 평가 리포트가 생성되어야 한다. 리포트에는 7개 체크 항목별 점수와 실패 사유가 명시되어야 한다.
- [ ] **실행 시간**: 단일 벤치마크/비디오 샘플 세트(최소 50개 샘플 기준)에 대한 평가 파이프라인 실행이 **15분 이내**에 완료되어야 한다.

## 4. 영향을 받는 파일 및 모듈 목록 (Affected Files & Modules)

- **설정 및 구성 파일**
  - `package.json` (LMMS-Eval 및 관련 평가 스크립트 추가)
  - `.github/workflows/videoqa-eval.yml` (또는 해당 CI 파이프라인 설정 파일)
- **평가 모듈 (신규 생성)**
  - `packages/l5-core/src/evaluations/videoqa-evaluator.ts` (LMMS-Eval 연동 및 평가 실행 로직)
  - `packages/l5-core/src/evaluations/checks/*.ts` (7개 체크 항목별 커스텀 Validator 로직)
- **스키마 및 타입**
  - `packages/l5-core/src/schemas/videoqa-result.ts` (VideoQA 결과 포맷 검증을 위한 Zod 스키마)
- **테스트 파일**
  - `packages/l5-core/src/__tests__/videoqa-evaluator.test.ts` (평가자 모듈 단위 테스트)
