// Approval Gate Rules
// Determines which decisions require founder approval

import type { RiskLevel } from '../types/entities';
import { createTransitionValidator } from './state-machine/transitions';

export interface ApprovalGate {
  requires_approval: boolean;
  decision_type: string;
  approval_level: 'none' | 'cto_autonomous' | 'founder_only' | 'founder_and_legal';
  urgency: 'routine' | 'high' | 'critical';
  estimated_review_time_hours?: number;
}

export type ContentType = 'blog_post' | 'social_media' | 'ad_copy' | 'email_campaign' | 'press_release';
export type ContentChannel = 'internal' | 'owned_media' | 'paid_media' | 'earned_media';
export type ContentApprovalStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'published'
  | 'revision_requested'
  | 'killed';

export interface ContentApprovalGate extends ApprovalGate {
  content_type: ContentType;
  channel: ContentChannel;
  risk_level: RiskLevel;
  requires_brand_review: boolean;
  auto_approvable: boolean;
}

export function requiresFounderApproval(
  decisionType: string,
  riskLevel: RiskLevel
): ApprovalGate {
  // D1: Internal draft only → no approval
  // D2: Internal execution with logging → no approval
  // D3: Low-risk external draft → CTO autonomous
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
      approval_level: 'cto_autonomous',
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

export function routeContentApproval(
  contentType: ContentType,
  channel: ContentChannel,
): ContentApprovalGate {
  if (channel === 'internal') {
    return buildContentApprovalGate(contentType, channel, 'D1', 'none', true);
  }

  if (channel === 'owned_media' && (contentType === 'blog_post' || contentType === 'social_media')) {
    return buildContentApprovalGate(contentType, channel, 'D3', 'cto_autonomous', true);
  }

  if (channel === 'earned_media' && contentType === 'press_release') {
    return buildContentApprovalGate(contentType, channel, 'D5', 'founder_and_legal', false);
  }

  return buildContentApprovalGate(contentType, channel, 'D4', 'founder_only', false);
}

function buildContentApprovalGate(
  contentType: ContentType,
  channel: ContentChannel,
  riskLevel: RiskLevel,
  approvalLevel: ContentApprovalGate['approval_level'],
  autoApprovable: boolean,
): ContentApprovalGate {
  const gate = requiresFounderApproval(DECISION_TYPES.CONTENT_PUBLICATION, riskLevel);

  return {
    ...gate,
    approval_level: approvalLevel,
    content_type: contentType,
    channel,
    risk_level: riskLevel,
    requires_brand_review: channel !== 'internal',
    auto_approvable: autoApprovable,
  };
}

export const CONTENT_APPROVAL_TRANSITIONS = {
  draft: ['in_review', 'killed'],
  in_review: ['approved', 'revision_requested', 'killed'],
  approved: ['published', 'killed'],
  published: [],
  revision_requested: ['draft'],
  killed: [],
} as const satisfies Record<ContentApprovalStatus, readonly ContentApprovalStatus[]>;

export const validateContentApprovalTransition =
  createTransitionValidator(CONTENT_APPROVAL_TRANSITIONS);
