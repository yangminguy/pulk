# TRD 하위 — 보안 / 데이터 거버넌스

> [TRD.md](../TRD.md)로 돌아가기.

## 데이터 카테고리별 접근권한

Founder Data / Company Data / Business Insight / Customer PII / Customer Sensitive / Agent Logs / External Automation Data 각각 별도 접근권한 매트릭스를 따른다(세부 매트릭스는 archive된 `SECURITY_DATA_GOVERNANCE.md` 원본 참고, 필요 시 이 문서에 재작성).

## 필수 필드

- 고객 관련 레코드: `pii_level`, `consent_status`, `allowed_usage`, `source_ref`
- 외부로 나가는 액션(D3 이상): `risk_level`, `approval_status`, `approved_by`, `approved_at`, `audit_log_ref`

## 규칙

- LLM에 데이터를 보내기 전 PII 마스킹은 의무다.
- 트레이스/로그(Langfuse 등)에 raw PII를 남기지 않는다.
- RiskQA는 D3~D5 작업을 창업자 승인 이후에도 override로 차단할 수 있다.
- 고객 PII와 재사용 가능한 Business Insight는 반드시 분리된 저장 경로를 쓴다.

## 알려진 보안 정리 필요 항목

- `services/youtube/.credentials.json` — 평문 자격증명 파일이 서비스 루트에 남아있음. `.gitignore` 등록 및 로테이션 필요([TASK.md](../TASK.md) 참고). 이 문서 재정리 과정에서 파일 내용은 열람/이동하지 않았다.

## 관련 문서

- 에이전트 위험도(D1-D5): [agent-protocol.md](./agent-protocol.md)
- 코딩 규칙: [../CODING_CONVENTION.md](../CODING_CONVENTION.md)
