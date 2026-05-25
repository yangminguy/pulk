// Approval Gate Rules
// Determines which decisions require founder approval

import type { RiskLevel } from '../types/entities';

export interface ApprovalGate {
  requires_approval: boolean;
  decision_type: string;
  approval_level: 'none' | 'ceo_only' | 'founder_only' | 'founder_and_legal';
  urgency: 'routine' | 'high' | 'critical';
  estimated_review_time_hours?: number;
}

export function requiresFounderApproval(
  decisionType: string,
  riskLevel: RiskLevel
): ApprovalGate {
  // D1: Internal draft only → no approval
  // D2: Internal execution with logging → no approval
  // D3: Low-risk external draft → CEO approval
  // D4: Customer-facing message → Founder approval
  // D5: Legal/financial commitment → Founder + Legal approval

  const riskMap: Record<RiskLevel, ApprovalGate> = {
    D1: {
      requires_approval: false,
      decision_type: decisionType,
      approval_level: 'none',
      urgency: 'routine'
    },
    D2: {
      requires_approval: false,
      decision_type: decisionType,
      approval_level: 'none',
      urgency: 'routine'
    },
    D3: {
      requires_approval: true,
      decision_type: decisionType,
      approval_level: 'ceo_only',
      urgency: 'routine',
      estimated_review_time_hours: 24
    },
    D4: {
      requires_approval: true,
      decision_type: decisionType,
      approval_level: 'founder_only',
      urgency: 'high',
      estimated_review_time_hours: 4
    },
    D5: {
      requires_approval: true,
      decision_type: decisionType,
      approval_level: 'founder_and_legal',
      urgency: 'critical',
      estimated_review_time_hours: 2
    }
  };

  return riskMap[riskLevel];
}

export function getApprovalDeadline(
  requestedAt: Date,
  urgency: 'routine' | 'high' | 'critical'
): Date {
  const deadline = new Date(requestedAt);

  switch (urgency) {
    case 'routine':
      deadline.setHours(deadline.getHours() + 48);
      break;
    case 'high':
      deadline.setHours(deadline.getHours() + 4);
      break;
    case 'critical':
      deadline.setHours(deadline.getHours() + 1);
      break;
  }

  return deadline;
}

export function isApprovalExpired(
  requestedAt: Date,
  urgency: 'routine' | 'high' | 'critical'
): boolean {
  const deadline = getApprovalDeadline(requestedAt, urgency);
  return new Date() > deadline;
}

export const DECISION_TYPES = {
  BUSINESS_PIVOT: 'business_pivot',
  CUSTOMER_OUTREACH: 'customer_outreach',
  PRICING_CHANGE: 'pricing_change',
  PARTNERSHIP: 'partnership',
  TOOL_SUBSCRIPTION: 'tool_subscription',
  CONTENT_PUBLICATION: 'content_publication',
  WORKFLOW_CHANGE: 'workflow_change',
  AGENT_AUTONOMY: 'agent_autonomy',
  FINANCIAL_COMMITMENT: 'financial_commitment',
  LEGAL_COMMITMENT: 'legal_commitment'
};
