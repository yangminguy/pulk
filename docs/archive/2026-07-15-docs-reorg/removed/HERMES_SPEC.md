# HERMES_SPEC — L5 Business OS

## Purpose

Hermes is the operating nervous system of L5 Business OS.

It is responsible for monitoring workflow state, detecting stalled execution, triggering BPR, managing approval alerts, and restarting operating loops.

## Runtime

Primary runtime: Trigger.dev

Fallback runtime for early MVP:

- local cron
- simple queue worker
- scheduled script

## Hermes Responsibilities

- Morning Operating Loop
- Night BPR Loop
- Stalled Workflow Detector
- PMF Deadline Checker
- Founder Approval Queue Watcher
- Tool Request Candidate Detector
- Memory Update Suggestion Trigger
- Workflow Restart Trigger
- CEO / Chief of Staff / Founder message routing

## Core Tasks

### morning-operating-loop

Runs daily.

Inputs:

- active workflows
- open decisions
- open Hermes alerts
- today PMF experiments
- yesterday BPR logs

Outputs:

- Founder Brief
- CEO priorities
- Hermes alerts
- DecisionQueue updates

### night-bpr-loop

Runs daily.

Inputs:

- completed tasks
- stalled tasks
- PMF experiment results
- agent outputs
- unresolved issues

Outputs:

- BPRLog
- MemoryEntry suggestions
- WorkflowImprovementProposal

### stalled-workflow-detector

Detects workflows with no activity beyond threshold.

Default threshold:

```text
24 hours for active workflows
72 hours for low-priority workflows
```

Output:

- HermesAlert: `stalled_workflow`
- suggested next action

### pmf-deadline-checker

Detects PMF experiments past end date without metrics.

Output:

- HermesAlert: `pmf_deadline`
- CMO/CEO follow-up suggestion

### founder-approval-checker

Detects pending D3-D5 decisions.

Output:

- DecisionQueue digest
- Founder notification candidate

### tool-request-candidate-detector

Detects repeated work or workflow bottlenecks.

Trigger conditions:

- same work repeated 2+ times
- estimated 20+ minutes per run
- error/omission risk
- Founder or executive bottleneck
- PMF/revenue impact
- reusable across businesses

Output:

- ToolRequest candidate

### memory-update-suggestion-generator

Creates MemoryEntry suggestions from:

- approved decisions
- rejected decisions
- PMF results
- BPR logs
- Tool Request outcomes
- repeated Founder comments

## Hermes Alert Shape

```ts
type HermesAlert = {
  id: string;
  alert_type: 'stalled_workflow' | 'pmf_deadline' | 'approval_required' | 'tool_candidate' | 'memory_update' | 'bpr_required';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  related_workflow_id?: string;
  related_business_id?: string;
  suggested_action: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  created_at: string;
};
```

## Approval Rule

Hermes can create alerts automatically.

Hermes cannot send high-risk external messages without approval.

```text
D1/D2: internal execution allowed
D3: external draft requires approval before send
D4/D5: Founder approval required and logged
```

## First MVP Hermes Scope

Implement only:

1. stalled workflow detection
2. PMF deadline check
3. approval queue digest
4. daily Founder brief
5. BPR suggestion

Do not start with full automation across all channels.
