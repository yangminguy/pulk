# FOUNDER_BRIEF_SPEC — L5 Business OS

## Purpose

L5는 CEO Agent와 Chief of Staff Agent가 생성하는 structured briefs를 통해 Founder와 소통한다.

Founder는 매일 다음을 받는다:
- **Daily Brief**: 어제 무엇이 움직였는가 (status, moved, blocked, insights)
- **Decision Brief**: 지금 무엇을 결정해야 하는가 (approvals, blockers, next moves)
- **Weekly Summary**: 이번 주의 큰 그림

Founder는 매 brief에서 명확한 결정만 해야 한다.

---

## 1. Daily Brief

**생성자:** Chief of Staff Agent (매일 09:00, 또는 CEO 작업 완료 후)

**목적:** Founder가 어제 무엇이 움직였고, 오늘 뭐 할 건지 알기

**Template:**

```
─── 📊 DAILY BRIEF: [DATE]

Current Phase: [1-direction_alignment | 2-pmf_diagnosis | ... | 6-scale_automation]
Phase Progress: [0-100%] | Target Completion: [date]

─── ✅ MOVED YESTERDAY (What Completed)

[Agent]: [Task Title]
  → Output: [한 문장 결과]
  → Next: [CEO will call CMO next]

[Agent]: [Task Title]
  → Output: [한 문장 결과]
  → Next: [Waiting for Founder approval on pricing]

─── 🚫 BLOCKED (What's Stuck)

[Agent]: [Task Title]
  → Blocker: [무엇 때문에]
  → Since: [hours/days ago]
  → Action: [해결을 위해 누가 뭘 해야 함]

─── ⏰ DUE TODAY

[Task Title] — assigned to [Agent]
  → Expected completion: [time]
  → Owner: [Agent]

─── 📌 KEY METRIC UPDATE

PMF Score: [0.0-1.0] (target: 0.6) ⬆️ +0.1
Open Tasks: [N] | Blocked: [N] | Awaiting Approval: [N]

─── 🎯 RECOMMENDATION FOR TODAY

1. [Decision 1] — Founder action needed? Y/N
2. [Decision 2] — Founder action needed? Y/N
3. [Continue waiting for] [Blocker resolution]

─── 💾 MEMORY CANDIDATE

Insight: [발견된 재사용 가능한 인사이트]
  → Source: [task_id or agent_name]
  → Approval: [Not yet committed, needs review]

─── 
Scan time: 2m | Parallel agents: [3] | Ready for decision: Y
```

**Example:**

```
─── 📊 DAILY BRIEF: 2026-05-27

Current Phase: 2-pmf_diagnosis (65% complete)
Target Completion: 2026-06-05

─── ✅ MOVED YESTERDAY

CMO: "PMF Message Positioning"
  → Output: "Early customer messaging emphasizes problem-solution fit, not product features"
  → Next: Ready for customer interview validation

CRO: "Sales Workflow Draft"
  → Output: "Lead → Demo → Proposal → Contract flow designed"
  → Next: Blocked on CMO approval (messaging alignment)

─── 🚫 BLOCKED

CRO: Sales Workflow Draft
  → Blocker: Waiting for CMO message approval
  → Since: 4 hours
  → Action: Founder can accelerate by approving CMO's message positioning

─── ⏰ DUE TODAY

"Customer Interview Plan" — CPO
  → Expected: 3pm
  → Owner: Chief of Staff scheduling

─── 📌 KEY METRIC UPDATE

PMF Score: 0.58 (target: 0.60) ⬆️ +0.05
Open Tasks: 7 | Blocked: 1 | Awaiting Approval: 2

─── 🎯 RECOMMENDATION FOR TODAY

1. [APPROVE] CMO's "Problem-Solution Positioning" — unblocks CRO workflow
2. [WAIT] CPO interview results (due 3pm, then PMF score update)
3. [DECISION] If PMF Score hits 0.60 today: Move to Phase 3?

─── 💾 MEMORY CANDIDATE

Insight: "Early-stage customers care about pain-point validation over product completeness"
  → Source: CMO positioning research
  → Approval: Waiting for Founder review

────
Scan time: 1m | Parallel agents: 3 | Ready for decision: Y
```

---

## 2. Decision Brief

**생성자:** Chief of Staff Agent (승인 필요 항목이 있을 때)

**목적:** Founder가 "지금 뭘 승인/거절해야 하는가"를 명확히 알기

**Template:**

```
─── 🔴 DECISION BRIEF: [DATE]

You have [N] decisions to make.
Recommended time: [3min | 15min | 1hour]

─── 📋 DECISION 1/[N]

Task: [Task Title]
Agent: [Agent Name]
Risk Level: D[1-5]

WHAT: [무엇을 승인하는가]
  [구체적인 내용 - 2-3 문장]

WHY NOW: [왜 지금 결정해야 하는가]
  • [이유 1]
  • [이유 2]

IMPACT IF APPROVED:
  ✓ [긍정적 결과 1]
  ✓ [긍정적 결과 2]

IMPACT IF REJECTED:
  ✗ [부정적 결과: 다음 단계가 blocked됨]

ALTERNATIVES:
  • Option A: [대안 1]
  • Option B: [대안 2]

RECOMMENDATION: [Agent의 추천]
Confidence: [High | Medium | Low]

PII IMPACT: [none | low | medium | high] — [설명]

YOUR DECISION:
  ☐ APPROVE
  ☐ REJECT
  ☐ MODIFY → [What changes?]

─── 📋 DECISION 2/[N]

[동일 구조 반복]

─── 
Decisions needed: [N] | Time required: [time]
After decisions, next brief arrives: [time]
```

**Example:**

```
─── 🔴 DECISION BRIEF: 2026-05-27

You have 2 decisions to make.
Recommended time: 8 min

─── 📋 DECISION 1/2: APPROVE CMO Message Positioning

Task: "PMF Message Validation"
Agent: CMO
Risk Level: D3

WHAT: Use this positioning for customer outreach emails
  "Does the customer have [PROBLEM]? We help you [SOLUTION] in [TIME]."
  Target: 50 beta customers

WHY NOW: CRO's sales workflow is blocked. PMF diagnosis stuck at 0.58.

IMPACT IF APPROVED:
  ✓ Unblocks CRO sales workflow
  ✓ Moves PMF diagnosis forward (target 0.60)
  ✓ First customer validation loop in 3 days

IMPACT IF REJECTED:
  ✗ CRO cannot draft proposals
  ✗ PMF diagnosis delayed 1 week
  ✗ May miss market window

RECOMMENDATION: APPROVE
Confidence: High (validated internally with advisors)

PII IMPACT: medium — 50 customer emails will be sent (all with explicit opt-in consent)

YOUR DECISION:
  ☑ APPROVE
  ☐ REJECT
  ☐ MODIFY → [What changes?]

─── 📋 DECISION 2/2: APPROVE CPO's Feature Roadmap (Phase 3 only)

Task: "Product Roadmap (conditional)"
Agent: CPO
Risk Level: D2

WHAT: If PMF score ≥ 0.60 today, proceed with Phase 3 build
  Build roadmap: messaging → onboarding → core feature [week 1-4]

WHY NOW: PMF results arriving at 3pm today. Need to decide Phase 3 timing.

IMPACT IF APPROVED:
  ✓ Execution build starts week of June 1
  ✓ Demo ready for sales validation (Phase 4)

IMPACT IF REJECTED:
  ✗ Delays execution 1-2 weeks
  ✗ Sales workflow stalls

RECOMMENDATION: CONDITIONAL APPROVE (only if PMF ≥ 0.60)
Confidence: Medium (depends on CPO's PMF evidence)

PII IMPACT: none

YOUR DECISION:
  ☐ APPROVE
  ☐ APPROVE IF PMF ≥ 0.60
  ☐ REJECT
  ☑ WAIT FOR DATA (PMF results due 3pm)

────
Decisions needed: 1 (1 waiting for data) | Time required: 5 min
Next brief arrives: After PMF data ready (6pm today)
```

---

## 3. Approval Request

**생성자:** CEO Agent or specific agent needing Founder sign-off

**목적:** D4/D5 승인을 구체적으로 요청할 때

**Template:**

```
─── 🔐 APPROVAL REQUEST: [DATE]

Level: D[4-5]
Agent: [Agent Name]
Urgency: [Routine | Soon (24h) | Urgent (6h)]

─── ACTION REQUESTED

Title: [명확한 제목]

Details:
[구체적인 내용]

Legal/Financial/Customer Facing: [해당되는 것]

─── JUSTIFICATION

Why this is D4/D5:
  • [이유 1]
  • [이유 2]

How it aligns with Founder DNA:
  • [Founder의 가치관과의 일치]

─── DECISION

  ☐ APPROVE
  ☐ APPROVE WITH CHANGES: [changes]
  ☐ REJECT: [reason]
  ☐ DELEGATE TO: [team member]

─── AUDIT

Approved by: [Founder name]
Approved at: [timestamp]
Record ID: [approval_record_uuid]
```

---

## 4. Blocked Task Alert

**생성자:** Hermes stalled-task detector (1시간마다)

**목적:** Blocked task를 Founder에게 알리고, 해결 옵션을 제시

**Template:**

```
─── ⚠️ BLOCKED TASK ALERT: [DATE] [TIME]

Task: [Task Title]
Agent: [Agent Name]
Blocked Since: [hours/minutes ago]
Target: [원래 완료 예정 시간]

─── BLOCKER

What: [무엇이 차단하고 있는가]
Why: [왜 해결하지 못했는가]
Impact: [다음 task들이 이것을 기다리는 중]

─── HOW TO UNBLOCK

Option 1: [Founder decides X] → Task resumes in [time]
Option 2: [CEO calls Y agent] → Task resumes in [time]
Option 3: [Founder provides data Z] → Task resumes in [time]

Recommended: [Agent의 추천 옵션]

─── ACTION

Choose one:
  ☐ [Option 1]
  ☐ [Option 2]
  ☐ [Option 3]
  ☐ ESCALATE: [more information needed]
  ☐ KILL TASK: [reason]

─── 
Repeat alert in: [30min | 1h | manually checked]
```

---

## 5. Phase Transition Summary

**생성자:** CEO Agent (phase 이동 시)

**목적:** 새로운 phase로 이동할 때, Founder가 무엇이 바뀌는지 명확히 알기

**Template:**

```
─── 🎯 PHASE TRANSITION SUMMARY

From: [Phase Name] (completed)
To: [New Phase Name]
Effective: [Date]

─── PHASE [N] RESULTS

Success Criteria Met:
  ✓ [Criteria 1] — [결과]
  ✓ [Criteria 2] — [결과]
  ✓ [Criteria 3] — [결과]

Key Learnings:
  • [Learning 1]
  • [Learning 2]

Metrics:
  • [Metric 1]: [value] → [improvement]
  • [Metric 2]: [value] → [improvement]

─── PHASE [N+1] PLAN

Duration: [weeks]
Primary Focus: [CMO | CRO | CPO | CTO | COO]
Success Criteria: [새로운 단계의 성공 기준]

New Agents/Resources:
  • [Who/What]

Different from last phase:
  • [차이점 1]
  • [차이점 2]

Expected Outcome:
  → [무엇을 배울 것인가 | 무엇이 ready될 것인가]

─── FOUNDER DECISION

Proceed to Phase [N+1]?
  ☐ YES
  ☐ NO (stay in Phase [N])
  ☐ MODIFY PLAN: [changes]

─── 
Next phase checkpoint: [date]
Estimated completion: [date]
```

---

## 6. Memory Candidate Review

**생성자:** Chief of Staff Agent (주 1회, 또는 주요 인사이트 발생 시)

**목적:** 회사 기억에 저장할 재사용 가능한 인사이트를 Founder가 검토

**현재 구현 상태:** `insight_to_record` 필드로 단순화됨
- 각 agent output이 `insight_to_record: string` 포함
- Chief of Staff가 주간 리뷰 때 여러 insights를 aggregate
- Founder 승인 시 저장 (구현 예정)

**Template:**

```
─── 💾 MEMORY CANDIDATE REVIEW

Period: [Week of XX]
Total Candidates: [N]

─── MEMORY 1/[N]

Category: [PMF | Culture | Process | Customer | Market]
Insight: [핵심 인사이트]

Details:
[구체적인 내용]

Where Found:
  Source Task: [task_id]
  Source Agent: [Agent Name]
  Date: [Date]

Why Reusable:
  • [이유 1 — 다시 만날 패턴]
  • [이유 2 — 다른 workstream에도 적용 가능]

Recommendation: [SAVE | DISCARD]

YOUR DECISION:
  ☐ SAVE TO MEMORY
  ☐ DISCARD
  ☐ MODIFY: [modified content]

─── MEMORY 2/[N]

[동일 구조]

─── 
Action: Save approved memories to founder_memory table
Next review: [date]
```

**Implementation Note:**
Each agent output includes `insight_to_record: string` field. Chief of Staff collects these during weekly review and presents for Founder approval. Implementation of memory persistence and retrieval is Planned (Phase 6+).

**Example:**

```
─── 💾 MEMORY CANDIDATE REVIEW

Period: Week of May 20-27
Total Candidates: 3

─── MEMORY 1/3

Category: PMF
Insight: "Early customers prioritize problem validation over feature completeness"

Details:
During customer interviews (May 24-27), 8/10 early customers explicitly said:
"I want to know you deeply understand my problem before I care about your solution."
This validates our lean positioning strategy.

Where Found:
  Source Task: CMO - "Customer Interview Analysis"
  Source Agent: CMO
  Date: 2026-05-27

Why Reusable:
  • Informs all future positioning work
  • Validates decision to do PMF diagnosis before productization
  • Should be in founder DNA for messaging

Recommendation: SAVE

YOUR DECISION:
  ☑ SAVE TO MEMORY
  ☐ DISCARD
  ☐ MODIFY

─── MEMORY 2/3

Category: Process
Insight: "Daily 09:00 brief checkpoint unblocks 1.5h of CRO's day"

Details:
When brief timestamp moved from 14:00 to 09:00, CRO started work 5h earlier and unblocked 2 downstream tasks.

Where Found:
  Source Task: COO - "Operating Cadence Review"
  Source Agent: COO
  Date: 2026-05-26

Why Reusable:
  • Informs team rhythm and handoff timing
  • Should be standard for all future phases

Recommendation: SAVE

YOUR DECISION:
  ☑ SAVE TO MEMORY
  ☐ DISCARD

────
Action: Save 2 memories approved
Next review: May 31 (week of May 28)
```

---

## 7. Weekly Summary

**생성자:** Chief of Staff Agent (매주 금요일 17:00)

**목적:** Founder가 이번 주 전체 그림을 이해하고, 다음 주 계획을 수립

**Template:**

```
─── 📈 WEEKLY SUMMARY: Week of [DATES]

Phase: [Current Phase] ([Progress %])
Health: [🟢 Green | 🟡 Yellow | 🔴 Red]

─── THIS WEEK'S HIGHLIGHTS

Top Achievement:
  [무엇이 가장 크게 움직였는가]

Biggest Blocker:
  [무엇이 가장 크게 막혔는가]
  Status: [해결 중 | 대기 중 | 해결 불가]

─── METRIC SNAPSHOT

| Metric | Mon | Fri | Δ | Status |
|--------|-----|-----|---|--------|
| [Metric 1] | [val] | [val] | ↑/↓ | [Color] |
| [Metric 2] | [val] | [val] | ↑/↓ | [Color] |
| Open Tasks | [N] | [N] | ↑/↓ | [Color] |
| Blocked Tasks | [N] | [N] | ↑/↓ | [Color] |

─── AGENT SUMMARY

Agent | Tasks Completed | Status | Next Week
-------|-----------------|--------|----------
CEO | 1 | on track | brief generation
CMO | 2 | on track | messaging validation
CRO | 1 | blocked | waiting for CMO
CPO | 2 | on track | feature roadmap
CTO | 0 | idle | waiting for PMF ≥ 0.6
COO | 1 | on track | process SOP
CFO | 1 | on track | budget tracking
RiskQA | 5 reviews | passed | 1 D5 pending
Culture | 3 checks | aligned | keep monitoring

─── RECOMMENDATIONS FOR NEXT WEEK

Priority 1: [Unblock what?]
Priority 2: [Advance what?]
Priority 3: [Decide what?]

─── CALENDAR

Mon: [Event]
Wed: [Event]
Fri: [Event]

─── RISKS TO WATCH

🔴 High: [Risk description]
🟡 Medium: [Risk description]
🟢 Low: [Risk description]

─── FOUNDER TO-DO

Before Monday:
  • [Action 1]
  • [Action 2]

─── 
Week completed: [completion %]
Health trend: [improving | stable | declining]
Next weekly summary: [date]
```

---

## Distribution & Timing

| Brief Type | Frequency | Generated By | Founder Time |
|---|---|---|---|
| Daily Brief | Every 09:00 (or after task completion) | Chief of Staff | 2-3 min |
| Decision Brief | When D3-D5 items exist | Chief of Staff + CEO | 3-15 min |
| Approval Request | As needed (D4-D5 only) | Specific Agent | 2-5 min |
| Blocked Alert | Every 1h (if blocked > 1h) | Hermes detector | 2-3 min |
| Phase Transition | On phase change | CEO | 5 min |
| Memory Review | Weekly (Friday) | Chief of Staff | 5-10 min |
| Weekly Summary | Every Friday 17:00 | Chief of Staff | 10 min |

**Important:** Chief of Staff Agent는 Founder의 주의를 보호한다. 불필요한 brief는 생성하지 않는다.

---

## Brief Quality Checklist

Every brief must include:

- ✓ Clear headline (DAILY BRIEF | DECISION BRIEF | etc.)
- ✓ Context (current phase, progress %)
- ✓ Actionable items only (no noise)
- ✓ Time estimate for Founder
- ✓ Clear decision options (if needed)
- ✓ One recommended path
- ✓ Timestamp and scan time
- ✓ Next brief expected

**Golden Rule:** If Founder can't decide in < 15 minutes, the brief failed.
