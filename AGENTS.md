# AGENTS.md — L5 Business OS Agent Map

## Purpose

이 문서는 L5 Business OS에서 사용되는 에이전트의 역할, 책임, 권한, 산출물을 정의한다.

## Executive Agents

| Agent | Role | Primary Outputs | Approval Boundary |
|---|---|---|---|
| CEO Agent | 공동 CEO형 운영 책임자 | Business Brief, Priority, Decision Draft | D4/D5는 Founder 승인 필요 |
| Chief of Staff Agent | Founder 주의 보호 및 보고 | Founder Brief, Decision Digest | 보고/조율 중심 |
| CMO Agent | PMF 메시지와 콘텐츠 실험 | PMF Experiment Plan, Content Plan | 외부 발행 전 승인 |
| CRO/Sales Agent | 리드/제안/영업 흐름 | Sales Workflow, Proposal Draft | 고객 발신 전 승인 |
| CPO Agent | 제품화 판단 | Productization Plan | 툴 제작 전 PMF 검증 필요 |
| CTO Agent | 기술/도구 판단 | Tool Request Review, Build Plan | 유료 툴/대규모 개발 승인 필요 |
| COO Agent | 운영 프로세스 | Delivery Workflow, Ops Checklist | 내부 실행 중심 |
| CFO/Admin Agent | 비용/리스크/관리 | Cost Review, Admin Checklist | 재무 약속 Founder 승인 |
| Risk/QA Agent | 보안/품질/데이터 리스크 | Risk Report, QA Checklist | 고위험 실행 차단 가능 |
| Culture Agent | 회사 문화와 원칙 관리 | Culture Update Suggestion | Founder/CEO 검토 |

## Standard Agent Output

```text
현재 상황:
목표:
문제/병목:
원인:
선택지:
추천안:
실행 액션:
다음 담당자:
필요 도구:
승인 필요 여부:
기록할 인사이트:
워크플로우 개선 제안:
```

## Agent Work Protocol

1. Read Context
2. Identify Goal
3. Detect Bottleneck
4. Decide Next Action
5. Produce Output
6. Trigger Next Agent
7. Save Memory
8. Suggest Workflow Improvement

## Trigger Rule

모든 에이전트는 작업 완료 후 반드시 하나를 선택한다.

- 다음 에이전트 호출
- CEO에게 결정 요청
- Founder 승인 요청
- Hermes 알림 생성
- BPR 생성
- Tool Request 생성
- Memory 저장
- Workflow Improvement 제안

## Narration Video Postproduction Standard

내레이션 교체, 재녹음 정리, 자막 재동기화, BGM/SFX 믹싱 또는 영상 음량
수정 작업에는 개인 스킬 `$narration-video-postproduction`을 사용한다.

스킬 경로:
`/Users/wonminyang/.codex/skills/narration-video-postproduction/SKILL.md`

반드시 지킬 기준:

- 독립적으로 말한 “다시”는 앞의 실패한 테이크를 버리고 뒤의 완전한 테이크를
  선택하라는 신호로 처리한다.
- 자막은 원고의 정확한 표기와 실제 음성의 단어 타이밍을 결합한다.
- 내레이션은 항상 믹스의 중심이어야 하며 BGM과 효과음이 핵심 단어를 덮으면
  안 된다.
- BGM은 가벼운 유사 분위기의 두 곡을 약 3~4분 간격으로 바꾸고 6초 정도
  크로스페이드한다.
- 효과음은 앞부분에 몰지 않고 중반, 후반, 요약, 결론까지 고르게 분산한다.
- 오디오만 수정할 때는 승인된 비디오 스트림을 재인코딩하지 않고 복사한다.
- 최종 AAC 인코딩 이후 약 -15 LUFS, -1.5 dBFS 이하의 true peak를 검증하고
  전체 스트림을 디코딩 검사한다.
