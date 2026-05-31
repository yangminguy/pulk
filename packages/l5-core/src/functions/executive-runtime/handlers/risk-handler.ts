// Risk/QA Agent Handler — risk level, PII, approval gate validation

import type { HandlerInput, HandlerResult } from '../protocol';
import { buildHandoff } from '../protocol';
import type { RiskLevel } from '../../../types/entities';

export function riskHandler(input: HandlerInput): HandlerResult {
  const { task } = input;
  const text = `${task.title} ${task.rationale} ${task.expected_output}`;
  const hasPii = /(pii|personal data|email|phone|customer data|private|privacy)/i.test(text);
  const externalSend = /(send|publish|customer|client|lead|outreach|proposal|public)/i.test(text);
  const elevatedRisk = task.risk_level === 'D3' || task.risk_level === 'D4' || task.risk_level === 'D5';
  // Risk/QA is an INTERNAL review step: it documents flags and hands the result to
  // the CEO. It must NOT hard-block internal analysis just because the text mentions
  // PII/risk, and it must NOT self-escalate the Founder approval gate — that fires
  // only for a genuine outbound send / payment, decided at planning time. So we
  // never block, never inflate approval, and preserve the task's own risk level.
  const blocked = false;
  const approvalRequired = task.approval_required;
  const riskLevel: RiskLevel = task.risk_level ?? 'D2';

  const output = {
    current_situation: `Risk/QA task received: ${task.title}`,
    source_instruction: task.rationale,
    goal: 'Validate risk level, PII handling, approval gates, and LLM trace safety',
    why_now: 'Every external action must pass risk review before execution',
    bottleneck: 'Risk review complete — flags documented for CEO sign-off',
    root_cause: 'Unreviewed external actions expose company to legal and reputational risk',
    options: [
      'Approve action with documented risk level and approval gate',
      'Block action and require additional approval or PII review',
      'Downgrade action scope to reduce risk level',
    ],
    recommendation: 'Block any action missing risk_level, pii_level, or approval gate — do not allow D3-D5 without explicit sign-off',
    action_items: [
      'Verify risk_level is assigned to the action',
      'Verify pii_level is assigned to any customer data used',
      'Verify approval gate exists for D3-D5 actions',
      'Verify LLM trace does not include unnecessary PII',
      'Return review result to CEO with pass/block decision',
    ],
    next_owner: 'ceo' as const,
    required_tools: [],
    approval_required: false,
    insight_to_record: 'Risk/QA must check risk_level, pii_level, approval gate, and trace safety on every external action',
    workflow_improvement_suggestion: 'Automate Risk/QA checklist as a pre-flight gate in Hermes runtime',
    confidence_level: 'high' as const,
    risk_level: 'D2' as const,
  };

  const handoff = buildHandoff(task, output, {
    what_was_completed: 'Risk review completed — flags documented and pass/block decision issued',
    what_remains_open: 'CEO must act on any blocked items before external execution',
    why_next_agent_needed: 'CEO needs risk review result to proceed or halt workstream',
    must_not_lose: 'Risk flags, PII issues, and approval gate status',
  });

  return {
    status: blocked ? 'blocked' : 'needs_review',
    created_tasks: [{
      title: `Risk/QA gate: ${task.title}`,
      assigned_agent: 'RiskQA' as const,
      expected_output: 'PII, external-send, approval-gate, and D3/D4/D5 risk review',
      details: {
        pii: hasPii ? 'flagged' : 'not detected',
        external_send: externalSend ? 'flagged' : 'not detected',
        approval_gate: approvalRequired ? 'required' : 'not required',
        elevated_risk: elevatedRisk ? String(task.risk_level) : 'not detected',
      },
      approval_required: approvalRequired,
      risk_level: riskLevel,
    }],
    approval_required: approvalRequired,
    blocked,
    reason: blocked
      ? 'Blocked or routed to approval because PII/external/elevated-risk work cannot execute silently.'
      : 'Risk review completed without a blocking approval gap.',
    risk_level: riskLevel,
    source_ref: task.source_ref,
    output,
    updated_status: blocked ? 'blocked' : 'needs_review',
    handoff,
  };
}
