# SECURITY_DATA_GOVERNANCE — L5 Business OS

## Core Principle

Business insights and customer-identifiable data must be separated.

```text
Business insights can become reusable company memory.
Customer personal data must remain purpose-bound, access-controlled, and minimized.
```

## Source of Truth

Core data should live in:

- PostgreSQL
- NocoBase collections
- portable L5 schemas

Not source of truth:

- Langfuse
- Formbricks
- Activepieces
- LLM provider logs
- notification tools

## Data Categories

| Category | Example | Default Access | Usage |
|---|---|---|---|
| Founder Data | Founder DNA, decisions | Founder only/trusted admin | OS improvement |
| Company Data | Culture, rules, workflows | Founder + authorized agents | Operations |
| Business Insight | PMF learnings, message patterns | Founder + relevant agents | Reusable if anonymized |
| Customer PII | name, email, phone | Restricted | Consented purpose only |
| Customer Sensitive Context | revenue, pain points | Highly restricted | Minimized and purpose-bound |
| Agent Logs | outputs, tool calls | Founder + QA/admin | Debugging |
| External Automation Data | webhook payloads | Restricted | Delivery only |

## Required Fields

Every customer-related record must include:

- `pii_level`
- `consent_status` or `consent_scope`
- `allowed_usage`
- `source_ref`

Every external action must include:

- `risk_level`
- `approval_status`
- `approved_by`
- `approved_at`
- `audit_log_ref`

## PII Levels

```text
none: no identifiable information
low: public or low-risk identifier
medium: email/phone/company/contact context
high: sensitive consultation, revenue, legal, private context
```

## LLM Data Minimization

Before sending data to LLMs:

- mask names, emails, phones unless necessary
- use customer segment summaries by default
- send minimum necessary fields only
- avoid raw sensitive PII in Langfuse traces
- mark every LLM call with `pii_level`

## Agent Access Policy

### CEO Agent

- Can access summarized business context
- Can access anonymized customer segment insights
- Needs approval for raw customer PII

### Chief of Staff Agent

- Can access decision queue and summary data
- Should use anonymized summaries by default

### CMO/CRO Agents

- Can access PMF experiment summaries
- Can access contact data only for approved outreach tasks

### Risk/QA Agent

- Can audit PII usage
- Can block unsafe external actions

### External Automation

- Receives only fields required for delivery
- Must not receive broad customer records

## Consent Scope for PMF Experiments

Recommended consent scope:

```text
- Service and business idea validation
- Customer interview/contact
- Consultation or proposal follow-up
- Related service/product information
- Marketing, branding, automation, or AI solution development research
- Anonymized insight analysis and internal service improvement
```

Avoid:

```text
We can use your information for any future purpose.
```

## Export Requirement

Core records must be exportable as:

- JSON
- CSV
- Markdown

## Backup Requirement

MVP:

- manual database dump
- Git-tracked schema/config docs
- periodic export of key collections

Later:

- scheduled DB backup
- object storage backup
- encrypted retention

## Audit Log Requirement

Log:

- who accessed customer PII
- which agent used which data
- which LLM call included PII
- which external automation sent data out
- who approved external actions
- what was exported and by whom

---

# Risk Governance & Approval Gates

## Decision Risk Levels (Detailed)

### D1: Internal Draft Only

**Definition:** 완전히 내부용. 대외비. Founder도 보지 않아야 함.

**Examples:**
- Agent 스크래치 워크
- LLM input/output (trace에 저장된)
- internal brainstorm

**Approval:** 불필요
**PII Handling:** 마스킹 필수
**Action:** 없음

**Rule:**
```
If task outputs D1 content, store in logs only.
Never surface to Founder without sanitization.
```

---

### D2: Internal Execution Only

**Definition:** 내부 작업만 수행. 대외 발신 없음. Founder가 모니터링하면 좋음.

**Examples:**
- 내부 프로세스 설계 (COO)
- 제안서 초안 (CRO, 미발신)
- 콘텐츠 계획 (CMO, 미발행)
- 기술 검토 (CTO, 비승인)

**Approval:** 불필요 (단, 로그 필요)
**PII Handling:** 고객 segment 요약 사용
**Action:** CEO가 brief에 포함 가능

**Rule:**
```
If task outputs D2:
  1. Log the output
  2. Include in Daily Brief
  3. Founder can see but doesn't need to act
  4. If content leaks externally → immediately escalate to D4
```

---

### D3: Low-Risk External Draft

**Definition:** 대외 발신 예정이지만 고위험 아님. Founder 승인 권장.

**Examples:**
- 소개 이메일 초안 (CRO)
- 제1차 고객 설문 (CMO)
- 마케팅 콘텐츠 초안 (CMO)
- 비보도 기사 제안 (CMO)

**Approval:** Founder approval 권장 (blocking 아님)
**PII Handling:** email address 마스킹 권장
**Action:** Send after Founder approval. Asynchronous approval OK (24h).

**Rule:**
```
If task outputs D3:
  1. Add to Approval Queue
  2. Set approval_required = true
  3. Founder can auto-approve (default: YES unless changed)
  4. If Founder rejects → task blocked until changes
  5. Send 24h after auto-approval if no rejection
```

---

### D4: Customer-Facing Message (Approval Required)

**Definition:** 고객에게 직접 전달. 법적/브랜드 영향. Founder 승인 필수.

**Examples:**
- 고객 메일 발송 (CRO)
- 제안서 제시 (CRO)
- 고객 면접 초청 (CMO)
- 가격 제시 (CFO)
- 계약/결제 정책 (CFO)

**Approval:** Founder approval 필수 (blocking)
**PII Handling:** Founder가 고객명 등 민감 정보 최소 확인
**Action:** Never send without explicit Founder "APPROVE" marker.

**Rule:**
```
If task outputs D4:
  1. Add to Approval Queue with flag "REQUIRES_FOUNDER_APPROVAL"
  2. Set approval_required = true, approval_type = "founder"
  3. Agent must WAIT for explicit Founder decision
  4. RiskQA must review before Founder sees (if PII involved)
  5. Only send after Founder clicks "APPROVE"
  6. Audit log: who approved, when, what content
  7. If RiskQA finds violation → block (don't show to Founder)
```

---

### D5: Legal/Financial/Public Commitment

**Definition:** 회사를 법적/재정적으로 구속. 취소 불가능. Founder + RiskQA 모두 승인 필수.

**Examples:**
- 고객 계약 체결 (CRO)
- 유료 도구 구독 (CFO)
- 법적 약속 (Founder)
- 공개 声明 (CMO)
- 임금/보너스 약속 (CFO)

**Approval:** Founder 승인 + RiskQA 승인 (모두 필수)
**PII Handling:** 모든 민감 정보 명시
**Action:** Founder approval 후에도 RiskQA가 BLOCK 가능 (safety override).

**Rule:**
```
If task outputs D5:
  1. Add to Approval Queue with flag "D5_DOUBLE_APPROVAL"
  2. RiskQA reviews first (can block unsafe items)
  3. If RiskQA blocks → doesn't reach Founder
  4. If RiskQA passes → show to Founder for approval
  5. Only execute after BOTH approve
  6. Full audit trail mandatory
  7. Founder approval timestamp on record
  8. If regret later → trace back to decision
```

---

## Phase-Based Approval Gates

Different phases require different approval rigor.

| Phase | Focus | Approval Rule | Example |
|-------|-------|---------------|---------|
| 1. Direction Alignment | Strategy | Founder only | Strategy shift: Founder approve |
| 2. PMF Diagnosis | Customer validation | Founder + RiskQA (D4 only) | Customer outreach: Founder approve |
| 3. Execution Build | Internal process | CEO can approve D1-D2 | Internal workflow: CEO decide |
| 4. Sales/Distribution Test | Revenue signals | Founder approval on contracts | Sales proposal: Founder approve (D4) |
| 5. Productization Review | Product decision | CPO + CTO + Founder | Build decision: CPO+CTO advise, Founder approve |
| 6. Scale/Automation | Growth plan | Founder + CFO | Investment/hiring: CFO advise, Founder approve (D5) |

---

## Agent Approval Authority Matrix

| Agent | Can Approve | Cannot Approve | Blocked By |
|-------|-------------|---|---|
| CEO | D2 task start | D3-D5 | None (can recommend) |
| Chief of Staff | None (only summarizes) | All | None (no authority) |
| CMO | D2 content draft | D3-D5 customer sends | Founder (for sends) |
| CRO | D2 proposal draft | D3-D5 customer sends | Founder (for sends) |
| CPO | D2 product design | D3-D5 build decision | CTO (feasibility) + Founder (PMF) |
| CTO | D2 design review | D3-D5 tool build | PMF evidence (must exist) |
| COO | D2 process design | D3-D5 external exec | Founder (if policy change) |
| CFO | D2 budget planning | D4-D5 financial commit | Founder (for commits) |
| RiskQA | BLOCK unsafe items | APPROVE anything | Can override all D3-D5 |
| Founder | All D3-D5 | None | Can decide everything |

---

## External Action Safety Rules

Before any external action (email, API call, customer contact, spending):

### Step 1: Risk Level Assignment

Agent must assign risk_level to every task.

```json
{
  "task_id": "...",
  "external_action": true,
  "risk_level": "D1 | D2 | D3 | D4 | D5",
  "action_type": "email | call | api_send | payment | contract",
  "pii_level": "none | low | medium | high",
  "pii_fields": ["email", "name", "company"]
}
```

### Step 2: Approval Gate Routing

- **D1-D2:** Store log, proceed automatically
- **D3:** Add to queue, Founder auto-approves in 24h unless overridden
- **D4:** Add to queue, Founder must explicitly click APPROVE
- **D5:** RiskQA reviews first, blocks if unsafe. Then Founder approves.

### Step 3: Payload Minimization

Before sending to external systems:

```
✓ Send only fields necessary for action
✗ Never send: customer revenue, sensitive context, phone numbers (unless required)
✓ Mask: names → initials (if safe), emails → domain only (if safe)
✓ Include: consent_scope_id (which consent covers this?)
```

### Step 4: Execution

```
For D3: Execute 24h after Founder approval (asynchronous)
For D4: Execute immediately after Founder "APPROVE" click
For D5: Execute immediately after both RiskQA + Founder approve
```

### Step 5: Audit Log

```json
{
  "action_id": "uuid",
  "external_action": true,
  "action_type": "email_send | api_call | payment",
  "risk_level": "D4",
  "approved_by": "founder_name",
  "approved_at": "2026-05-27T14:30:00Z",
  "executed_at": "2026-05-27T14:30:05Z",
  "payload_summary": "1 email to [email_domain] with [field1, field2]",
  "pii_fields_sent": ["email"],
  "consent_scope_id": "survey_distribution_may2026",
  "record_id": "execution_audit_uuid"
}
```

---

## PMF-Gate Rules

**Rule:** Tool build or Productization is blocked until PMF evidence exists.

### Tool Build Gate

```
Before CTO can recommend tool build:
  1. Task must show PMF signal (> 3x weekly repetition)
  2. Manual time cost must be > 2h/week
  3. CPO or CMO or CRO must confirm "repeated customer pain"
  4. CFO must calculate ROI (build_cost < annual_savings)
  
If missing any of above: CTO outputs
  {
    "task_type": "blocked",
    "reason": "Missing PMF evidence",
    "next_step": "Collect [signal type] first"
  }
```

### Productization Gate

```
Before CPO can recommend build/productize:
  1. PMF Score must be ≥ 0.6 (per l5-core scoring)
  2. Must have >= 3 repeat customer validation signals
  3. CRO must confirm sales process is repeatable
  4. CTO must confirm technical feasibility

If missing any of above: CPO outputs
  {
    "task_type": "blocked",
    "blocker": "PMF score ${pmf_score} < 0.6",
    "next_step": "Continue Phase 2 PMF diagnosis"
  }
```

---

## Memory Entry Approval

**Rule:** Memory entry는 Founder 승인 후에만 committed.

### Memory Workflow

```
1. Agent finds reusable insight during task
2. Chief of Staff surfaces in Memory Candidate Review
3. Founder decides: SAVE | DISCARD | MODIFY
4. If APPROVED → insert to founder_memory table
5. If REJECTED → discard
6. All memory entries have approval_by, approved_at fields
```

### Memory Safeguards

```
Memory entries must NOT include:
  - Customer PII (names, emails, revenue)
  - Specific contract terms
  - Founder personal secrets

Memory entries CAN include:
  - Anonymized customer segments
  - Market patterns
  - Process improvements
  - Decision rules learned
  - Long-term insights
```

---

## RiskQA Override Authority

**Rule:** RiskQA Agent can BLOCK any D3-D5 item, even after Founder approval slot is visible.

### RiskQA Blocking Triggers

```
RiskQA blocks if:

1. PII Handling Violation
   - Field being sent violates pii_level contract
   - No consent_scope for customer data usage
   - Data masked improperly (e.g., first name still visible)
   
2. Compliance Violation
   - Action violates consent scope
   - Action sends data to unauthorized external system
   - Action breaks audit trail requirement
   
3. External Automation Risk
   - Payload includes sensitive context unnecessarily
   - Retry logic could send duplicates
   - Error handling could leak data

4. D5 Unsafe Execution
   - Financial commitment has no CEO/RiskQA review
   - Contract language differs from summary shown Founder
   - Payment to unauthorized recipient

How blocking works:
  1. RiskQA marks item as BLOCKED
  2. Item does NOT appear in Founder approval queue
  3. CEO is notified: "RiskQA blocked [task_id]: [reason]"
  4. Founder can query why it's hidden (optional transparency)
  5. Agent must fix issue → RiskQA re-reviews
```

---

## Summary: Safe External Action Checklist

Every external action must pass:

```
☐ Risk level assigned (D1-D5)
☐ PII level assigned (none-high)
☐ Consent scope documented (if PII sent)
☐ Payload minimized (only necessary fields)
☐ Approval gate passed (auto/Founder/RiskQA)
☐ RiskQA review passed (if D3-D5)
☐ Founder approval obtained (if D4-D5)
☐ Audit log created with decision + timestamp
☐ External system integration is safe (no cert issues, no open ports)
☐ Rollback plan exists (if action can be reversed)
```

If any checkbox is ☐ (empty): **BLOCK and surface to Founder/RiskQA.**
