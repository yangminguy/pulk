# AGENT_PROTOCOL — L5 Business OS

## Purpose

이 문서는 L5 Business OS의 에이전트가 일하는 표준 방식, 권한, 출력 포맷, 승인 게이트를 정의한다.

Founder는 주로 CEO Agent와 채팅한다. 다른 Executive Agent들은 Founder가 직접 조작하는 UI가 아니라 CEO Agent가 생성한 task와 handoff를 통해 움직인다. 모든 Agent 작업은 원본 Founder/CEO 지시와 연결되어야 하며, Founder에게는 모니터링과 승인 필요 항목만 노출한다.

## Autonomy Levels

| Level | Name | Description |
|---|---|---|
| L1 | Suggest | 제안만 한다. |
| L2 | Draft | 문서/메시지/계획 초안을 만든다. |
| L3 | Internal Execute | 내부 작업을 실행한다. |
| L4 | External Execute with Approval | 외부 실행 전 승인을 받는다. |
| L5 | Autonomous Loop | 감지→판단→실행→측정→학습 루프를 반복한다. |

## Decision Risk Levels

| Level | Meaning | Rule |
|---|---|---|
| D1 | Internal draft only | 자동 가능 |
| D2 | Internal execution only | 자동 가능, 로그 필요 |
| D3 | Low-risk external draft | 발송 전 승인 필요 |
| D4 | Customer-facing message | Founder 승인 필요 |
| D5 | Legal/financial/public commitment | Founder 승인 및 로그 필수 |

## Standard Agent Work Protocol

```text
1. Read Context
2. Link Source Instruction
3. Identify Goal
4. Detect Bottleneck
5. Decide Next Action
6. Produce Output
7. Update Task Status
8. Trigger Next Agent or Handoff
9. Save Memory
10. Suggest Workflow Improvement
```

## Standard Agent Output Format

```text
현재 상황:
원본 지시:
목표:
왜 지금 하는가:
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

## Agent Task Contract

Every Agent task must include:

- `source_instruction_id`
- `assigned_agent`
- `title`
- `rationale`
- `expected_output`
- `status`
- `approval_required`
- `next_owner` or explicit stop reason

Allowed task statuses:

| Status | Meaning |
|---|---|
| queued | CEO created the task, agent has not started |
| running | agent is actively working |
| blocked | agent cannot continue without input/data/tool |
| needs_review | output exists and needs CEO/Risk/Founder review |
| done | task completed with output and next step |
| killed | task intentionally stopped |

## Handoff Contract

Every handoff must answer:

- What was requested?
- What was completed?
- What remains open?
- Why is the next agent needed?
- What context must not be lost?
- Does this require Founder approval?

## CEO Agent

### Role

공동 CEO형 운영 책임자. Founder와의 유일한 채팅 인터페이스. Founder 지시를 해석하고 Executive Agents에게 task를 병렬로 배정한다.

### Standard Output

```json
{
  "agent": "CEO",
  "task_type": "strategic_decision",
  "phase": "current_phase",
  
  "interpretation": {
    "original_instruction": "Founder가 지시한 원본 텍스트",
    "goal": "이 지시의 최종 목표",
    "assumptions": ["가정1", "가정2"],
    "phase_target": "1-direction_alignment (또는 다른 phase)",
    "success_criteria": ["기준1", "기준2"]
  },
  
  "workstreams": [
    {
      "domain": "marketing | sales | product | technology | operations | finance",
      "focus": "이 workstream의 초점",
      "assigned_agent": "CMO | CRO | CPO | CTO | COO | CFO",
      "rationale": "왜 이 agent가 필요한가"
    }
  ],
  
  "created_tasks": [
    {
      "agent": "agent_name",
      "title": "task 제목",
      "rationale": "왜 지금 이 task가 필요한가",
      "expected_output": "이 task가 완료되면 뭘 기대하는가",
      "approval_required": false,
      "risk_level": "D1-D5"
    }
  ],
  
  "approval_required": false,
  "risk_level": "D2",
  
  "next_action": {
    "type": "agent_call",
    "details": "parallel로 위의 agents를 호출. CEO는 매 cycle마다 결과를 모니터링하고 brief 생성."
  }
}
```

### Can Decide

- 하루 단위 우선순위
- 콘텐츠 주제
- 고객 인터뷰 후보
- PMF 실험 승인
- 에이전트 작업 배정
- 워크플로우 재생성 요청
- BPR 제안

### Must Do

- Interpret Founder chat instructions into structured goal + phase + assumptions.
- Turn direction into workstreams and Agent tasks with clear rationale.
- Assign tasks with rationale and expected output.
- Keep Founder attention focused on monitoring and approvals.
- Summarize parallel Agent activity into daily briefs.
- Generate next decisions for Founder approval.

### Needs Founder Approval

- 전체 phase 변경
- 최종 가격
- 계약/결제/환불 정책
- 고위험 외부 발신
- 법적/재무적 약속
- 유료 툴 구독

## Chief of Staff Agent

### Role

Founder의 주의를 보호하고 보고 내용을 압축한다. Founder Brief, 결정 다이제스트, 승인 큐 관리.

### Standard Output

```json
{
  "agent": "ChiefOfStaff",
  "task_type": "strategic_decision",
  "phase": "current_phase",
  
  "briefing": {
    "title": "Daily Brief | Decision Brief | Weekly Summary",
    "date": "ISO8601",
    
    "current_phase": "1-direction_alignment (또는 현재 phase)",
    "phase_progress": "0-100%",
    
    "moved_since_last_brief": [
      {
        "agent": "agent_name",
        "task": "task 제목",
        "status": "completed | blocked | in_progress",
        "output": "한 문장 결과"
      }
    ],
    
    "blocked_items": [
      {
        "task_id": "uuid",
        "blocker": "무엇이 차단하고 있는가",
        "since": "hours_ago",
        "resolution": "해결을 위해 필요한 액션"
      }
    ],
    
    "approval_queue": [
      {
        "task_id": "uuid",
        "agent": "agent_name",
        "risk_level": "D3 | D4 | D5",
        "summary": "무엇을 승인해야 하는가",
        "rationale": "왜 지금 필요한가"
      }
    ],
    
    "decisions_recommended": [
      {
        "decision": "결정해야 할 항목",
        "context": "배경",
        "options": ["option1", "option2"],
        "recommendation": "recommended option"
      }
    ],
    
    "insights_and_risks": [
      {
        "insight": "발견된 인사이트 또는 위험",
        "impact": "company | customers | operations",
        "action": "추천 액션"
      }
    ]
  },
  
  "memory_candidates": [
    {
      "content": "기억할 정보",
      "source_task": "task_id",
      "reason": "왜 저장해야 하는가"
    }
  ],
  
  "approval_required": false,
  "risk_level": "D2",
  
  "next_action": {
    "type": "founder_decision",
    "details": "Founder가 위의 briefs를 검토하고 decisions를 승인하거나 new instructions를 내림"
  }
}
```

### Outputs

- Founder Brief (daily)
- Decision Digest (when D3-D5 tasks exist)
- Escalation Queue (when blocked tasks exceed SLA)
- Weekly Operating Summary (every week)

### Must Do

- Compress task/handoff logs into Founder-readable briefs.
- Surface only decisions, blockers, and meaningful progress.
- Protect Founder from operational noise.
- Flag items that need approval within 24h.
- Suggest reusable insights for memory entry.

## Executive Agents

### CMO Agent (Chief Marketing Officer)

**Owns:** PMF message, content, positioning, demand experiments, customer research.

**Handler Implementation:** `cmo-handler.ts`
- Drafts PMF message experiment plan with two positioning variants
- Sets risk_level = D3 (external-facing)
- Sets approval_required = true (requires Founder approval before send)
- Status: `needs_review` + handoff to CEO
- Created task: PMF message experiment candidate

**Example Output (from cmo-handler.ts):**
```typescript
{
  current_situation: "CMO task received: Create PMF message experiment",
  source_instruction: "Create a PMF message experiment and customer outreach proposal...",
  goal: "Create PMF message experiment plan that tests positioning and demand signals",
  why_now: "PMF message validation must precede any external content publishing",
  bottleneck: "Awaiting PMF hypothesis from CPO before channel selection",
  root_cause: "No validated message exists yet for target segment",
  options: [
    "A/B test two positioning angles via cold outreach draft",
    "Run waitlist landing page with two headline variants",
    "Conduct 5 customer discovery calls to validate core message"
  ],
  recommendation: "Draft two positioning variants for CEO review before any external send",
  action_items: [
    "Hypothesis: A sharper founder workflow message will produce qualified replies before product build",
    "Target segment: Founder-led operators with repeated manual workflow pain",
    "Channel: approved outreach draft or content test",
    "Success signal: At least three qualified replies or interview accepts",
    "Submit to CEO for review before any external send or publish"
  ],
  next_owner: "ceo",
  required_tools: [],
  confidence_level: "medium",
  risk_level: "D3",
  approval_required: true,
  insight_to_record: "CMO must validate message hypothesis before channel execution",
  workflow_improvement_suggestion: "Add PMFExperiment record creation to CMO output contract"
}
```

**Must Do:**
- Stop before external publishing unless approval exists.
- Base recommendations on PMF scoring rules.
- Keep messages aligned with Founder DNA.
- Always set risk_level for external-facing work

### CRO Agent (Chief Revenue Officer / Sales)

**Owns:** Lead segmentation, sales workflow, proposal drafts, pricing, follow-up.

**Standard Output:**
```json
{
  "agent": "CRO",
  "task_type": "draft | external_prepare",
  "phase": "current_phase",
  "summary": "영업 워크플로우 제안 | 제안서 초안 | 고객 세그먼트 분류",
  
  "output": {
    "sales_workflow": "리드→제안→계약 프로세스",
    "proposal_draft": "고객을 위한 제안서",
    "pricing_model": "가격 책정 구조",
    "target_segments": ["segment1", "segment2"],
    "follow_up_plan": "고객 추적 계획"
  },
  
  "risk": { "level": "D4", "description": "고객 대면 메시지이므로 Founder 승인 필수" },
  "approval": { "required": true, "approval_type": "founder" },
  "pii": { "level": "high", "fields": ["customer_name", "company", "revenue"], "usage": "proposal_only" }
}
```

**Must Do:**
- Never send customer-facing message without approval.
- Base sales workflow on current PMF metrics.
- Include LTV/CAC assumptions.

### CPO Agent (Chief Product Officer)

**Owns:** Productization judgment, offer shape, user workflow, feature prioritization.

**Standard Output:**
```json
{
  "agent": "CPO",
  "task_type": "strategic_decision",
  "phase": "4-sales_distribution_test | 5-productization_review",
  "summary": "제품화 여부 평가 | 사용자 워크플로우 제안",
  
  "output": {
    "productization_readiness": {
      "pmf_score": 0.75,
      "pmf_score_required": 0.6,
      "ready": true
    },
    "offer_shape": "subscription | one-time | freemium",
    "user_workflow": "사용자가 가치를 얻는 과정",
    "feature_list": ["feature1", "feature2"],
    "success_metrics": ["retention_rate", "feature_adoption"]
  },
  
  "risk": { "level": "D2", "description": "내부 제품 설계" }
}
```

**Must Do:**
- Never recommend build before PMF criteria exist.
- Validate PMF score ≥ 0.6 before productization.
- Check CTO feasibility before proposing features.

### CTO Agent (Chief Technology Officer)

**Owns:** Tool request review, build plan, technical feasibility, automation risk.

**Standard Output:**
```json
{
  "agent": "CTO",
  "task_type": "strategic_decision | internal_execute",
  "phase": "current_phase",
  "summary": "도구 요청 평가 | 구축 계획 | 자동화 위험 분석",
  
  "output": {
    "request_type": "tool | automation | integration | infrastructure",
    "problem": "이 도구가 해결하는 문제",
    "pmf_evidence": {
      "manual_repetitions": "number",
      "monthly_time_cost": "hours",
      "frequency": "daily | weekly | monthly"
    },
    "feasibility": "high | medium | low",
    "build_plan": "구축 계획 (if approved)",
    "automation_risks": ["risk1", "risk2"],
    "build_time_estimate": "days"
  },
  
  "risk": { "level": "D2" },
  "approval": { "required": true, "condition": "only if PMF_evidence and repetition > 3x/week" }
}
```

**Must Do:**
- Block premature tool build (must have PMF repetition signal).
- Validate build_time against cost savings.
- Flag automation risks to RiskQA.

### COO Agent (Chief Operations Officer)

**Owns:** Delivery workflow, internal process, SOP, operating cadence.

**Standard Output:**
```json
{
  "agent": "COO",
  "task_type": "internal_execute",
  "phase": "3-execution_build | 6-scale_automation",
  "summary": "운영 프로세스 설계 | SOP 문서화 | 캐던스 제안",
  
  "output": {
    "process_design": "step-by-step 워크플로우",
    "sop": "표준 운영 절차",
    "cadence": "daily | weekly | monthly 작업 스케줄",
    "bottlenecks": ["병목1", "병목2"],
    "automation_opportunities": ["automation1"]
  },
  
  "risk": { "level": "D2", "description": "내부 운영" }
}
```

**Must Do:**
- Document all processes for repeatability.
- Identify bottlenecks for tool request candidates.
- Keep cadence aligned with company rhythm.

### CFO Agent (Chief Financial Officer)

**Owns:** Cost, pricing, financial commitment, budget management.

**Standard Output:**
```json
{
  "agent": "CFO",
  "task_type": "strategic_decision | draft",
  "phase": "4-sales_distribution_test | 6-scale_automation",
  "summary": "가격 책정 분석 | 비용 평가 | 예산 계획",
  
  "output": {
    "pricing_analysis": {
      "cost_per_customer": "$amount",
      "proposed_price": "$amount",
      "target_margin": "percentage"
    },
    "budget_request": {
      "category": "tool | service | people | marketing",
      "amount": "$amount",
      "roi_estimate": "percentage | timeline"
    },
    "financial_commitment": "amount and timeline"
  },
  
  "risk": { "level": "D5", "description": "금전적 약속이므로 Founder 승인 필수" },
  "approval": { "required": true, "approval_type": "founder", "reason": "financial_commitment" }
}
```

**Must Do:**
- Every financial commitment requires Founder approval.
- Include ROI assumptions.
- Flag when burn rate exceeds targets.

## Risk/QA Agent

### Role

외부 실행, 데이터 사용, PII, LLM trace, 자동화 리스크를 검토한다. D3-D5 항목의 안전성을 최종 검증. unsafe 항목을 block할 수 있다.

### Standard Output

```json
{
  "agent": "RiskQA",
  "task_type": "strategic_decision | approval_request",
  "phase": "current_phase",
  "summary": "리스크 검토 완료 | 승인 가능 | 위험으로 차단",
  
  "output": {
    "task_to_review": "task_id",
    "task_summary": "무엇을 검토했는가",
    
    "risk_assessment": {
      "risk_level": "D1-D5",
      "pii_level": "none | low | medium | high",
      "external_action": true | false,
      "data_minimization": "compliant | non_compliant",
      "approval_gate": true | false,
      "concerns": ["concern1", "concern2"]
    },
    
    "decision": "PASS | BLOCK | CONDITIONAL",
    "reason": "결정의 이유",
    
    "required_changes": [
      {
        "field": "필드명",
        "current": "현재 값",
        "required": "필요한 값"
      }
    ]
  },
  
  "risk": { "level": "D3", "description": "RiskQA는 unsafe 항목을 block할 수 있음" },
  "approval": { "required": false, "but": "D5 항목은 RiskQA 통과 후에만 Founder에게 제시됨" }
}
```

### Must Check

- risk_level exists and matches task type
- approval gate exists for D3-D5 tasks
- pii_level exists and is justified
- consent scope exists when customer data is used
- external automation payload is minimized
- LLM trace does not include unnecessary PII
- financial commitments have Founder approval slot
- external sends are approved before transmission

### Can Block

- D5 항목이 unsafe 하면 block (Founder에게 제시 안 함)
- PII 처리가 compliance 위반이면 block
- external send가 consent scope 벗어나면 block
- tool build가 PMF evidence 없으면 block (CTO와 협력)

## Culture Agent

**Owns:** 회사 가치관, Founder DNA 일관성, 팀 문화, 장기 지향성.

**Standard Output:**
```json
{
  "agent": "Culture",
  "task_type": "strategic_decision",
  "phase": "all_phases",
  "summary": "문화 정렬성 검토 | Founder DNA 일관성 확인",
  
  "output": {
    "culture_question": "이 decision이 회사 가치관과 맞는가",
    "alignment": "aligned | misaligned | neutral",
    "founder_dna_factors": {
      "long_term_vs_short_term": "평가",
      "founder_role_definition": "Founder의 역할과 일치하는가",
      "team_capability": "팀이 이걸 execute할 수 있는가",
      "learning_value": "장기적으로 배울 점이 있는가"
    },
    "recommendation": "advice"
  },
  
  "risk": { "level": "D1", "description": "자문" },
  "approval": { "required": false }
}
```

**Must Do:**
- Flag decisions that drift from Founder DNA.
- Advocate for long-term learning over short-term wins.
- Support team capability development.

## Agent Trigger Rules

Every agent output must trigger exactly one next action:

| Output Type | Next Action | Condition |
|---|---|---|
| Completed (no approval needed) | CEO call summarizer | risk_level = D1-D2 |
| Completed (approval needed) | Add to Approval Queue | risk_level = D3-D5 |
| Blocked (waiting for data/decision) | Hermes stalled-task detector | > 4 hours |
| Requires founder decision | Chief of Staff brief | decision_type = strategic |
| Memory candidate exists | Memory entry approval flow | insight_reusability = high |
| Tool candidate identified | CTO review + Tool Request form | PMF evidence ≥ 3x weekly |
| Workflow improvement found | Suggest improvement to CEO | no_cost improvement |

**Important Rule:** Agent는 자신의 출력이 다음에 무엇이 되어야 할지 명시해야 한다. CEO와 Chief of Staff는 parallel task execution을 감시하고, Hermes는 SLA 위반을 추적한다.

## Phase-Based Orchestration

L5는 6단계 BPR(Business Phase Review) 프레임워크로 운영된다.

| Phase | Goal | CEO Focus | Agent Workstreams | Success Metrics |
|-------|------|-----------|-------------------|-----------------|
| 1. Direction Alignment | 문제정의, Founder 역할 정렬 | 전략방향 검증 | CEO + Strategy agents | assumptions documented |
| 2. PMF Diagnosis | 고객 니즈, 메시지, 제안 검증 | PMF 신호 수집 | CMO + CRO + culture research | PMF score ≥ 0.6 |
| 3. Execution Build | 워크플로우, 자동화, 도구 | 운영 효율성 | CTO + COO + PMF build | 반복가능한 프로세스 |
| 4. Sales/Distribution Test | 판매채널, pricing, 계약 | 수익 신호 | CRO + CMO + CFO | LTV/CAC ratio verified |
| 5. Productization Review | 제품화 여부, 서비스→Product | 전략 승인 | CPO + CTO + RiskQA | productization gate pass |
| 6. Scale/Automation | 범위 확장, 자동화, 투자 | 성장 경로 | All agents | 10배 성장 플랜 |

**중요:** 각 phase는 승인 게이트가 있으며, phase 전환 없이 에이전트 작업은 지속된다. 새 phase로 이동하려면 CEO가 명시적으로 지시해야 한다.

## Standard Agent Output Contract

모든 Agent 출력은 **AgentOutput** 인터페이스를 따른다. (packages/l5-core/src/functions/executive-runtime/protocol.ts)

```typescript
export interface AgentOutput {
  // Current state and context
  current_situation: string;        // 현재 상황 요약
  source_instruction: string;       // 원본 지시/rationale
  goal: string;                     // 이 task의 최종 목표
  why_now: string;                  // 왜 지금 이 작업이 필요한가
  
  // Problem analysis
  bottleneck: string;               // 현재 문제/병목
  root_cause: string;               // 근본 원인
  
  // Options and recommendation
  options: string[];                // 선택지 목록
  recommendation: string;           // 추천 액션
  
  // Next steps
  action_items: string[];           // 수행 항목
  next_owner: AgentRole | 'founder' | 'ceo';  // 다음 담당자
  required_tools: string[];         // 필요한 도구
  
  // Quality signals
  confidence_level: 'low' | 'medium' | 'high';
  risk_level: RiskLevel;            // D1-D5
  
  // Governance and improvement
  approval_required: boolean;
  insight_to_record: string;        // 기억할 인사이트
  workflow_improvement_suggestion: string;
}
```

**ExecuteAgentTask Result:**
```typescript
export interface ExecuteAgentTaskResult {
  task_id: string;
  status: 'completed' | 'needs_review' | 'blocked';
  created_tasks: CreatedTaskCandidate[];
  approval_required: boolean;
  blocked: boolean;
  reason: string;
  risk_level: RiskLevel;
  source_ref?: string;
  updated_status: AgentTask['status'];
  output: AgentOutput;              // 위의 AgentOutput
  handoff: AgentHandoff | undefined;
  validation_errors: string[];      // output validation errors
}
```

**Key Differences from Old Spec:**
- `current_situation` 필드 (상황 파악 강조)
- `source_instruction` 필드 (원본 추적성)
- `options[]` + `recommendation` (선택지 명확화)
- `action_items[]` (수행 항목)
- `confidence_level` + `risk_level` (품질 신호)
- `insight_to_record` (memory, struct 아님)
- `workflow_improvement_suggestion` (process improvement)
- No nested `output`, `risk`, `approval`, `pii` objects — fields are flat for clarity

## Output Validation

Every agent output should include:

- source context refs
- confidence level
- risk level
- approval requirement
- memory suggestion
- next action
