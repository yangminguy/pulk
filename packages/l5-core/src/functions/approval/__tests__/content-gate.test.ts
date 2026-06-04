import {
  CONTENT_APPROVAL_TRANSITIONS,
  DECISION_TYPES,
  routeContentApproval,
  validateContentApprovalTransition,
} from '../index';

const countEdges = <T extends string>(transitions: Record<T, readonly T[]>): number =>
  Object.values(transitions).flat().length;

describe('routeContentApproval', () => {
  it.each([
    ['internal', 'blog_post', 'D1', 'none', true],
    ['owned_media', 'blog_post', 'D3', 'cto_autonomous', true],
    ['owned_media', 'social_media', 'D3', 'cto_autonomous', true],
    ['owned_media', 'email_campaign', 'D4', 'founder_only', false],
    ['paid_media', 'ad_copy', 'D4', 'founder_only', false],
    ['earned_media', 'press_release', 'D5', 'founder_and_legal', false],
    ['earned_media', 'social_media', 'D4', 'founder_only', false],
  ] as const)(
    'routes %s/%s to %s %s',
    (channel, contentType, riskLevel, approvalLevel, autoApprovable) => {
      const gate = routeContentApproval(contentType, channel);

      expect(gate.decision_type).toBe(DECISION_TYPES.CONTENT_PUBLICATION);
      expect(gate.content_type).toBe(contentType);
      expect(gate.channel).toBe(channel);
      expect(gate.risk_level).toBe(riskLevel);
      expect(gate.approval_level).toBe(approvalLevel);
      expect(gate.auto_approvable).toBe(autoApprovable);
      expect(gate.requires_brand_review).toBe(channel !== 'internal');
    },
  );
});

describe('ContentApprovalStatus transitions', () => {
  it('defines the spec state count and transition count', () => {
    expect(Object.keys(CONTENT_APPROVAL_TRANSITIONS)).toEqual([
      'draft',
      'in_review',
      'approved',
      'published',
      'revision_requested',
      'killed',
    ]);
    expect(countEdges(CONTENT_APPROVAL_TRANSITIONS)).toBe(8);
  });

  it.each([
    ['draft', 'in_review'],
    ['in_review', 'approved'],
    ['approved', 'published'],
    ['in_review', 'revision_requested'],
    ['revision_requested', 'draft'],
    ['draft', 'killed'],
    ['in_review', 'killed'],
    ['approved', 'killed'],
  ] as const)('accepts %s -> %s', (from, to) => {
    expect(validateContentApprovalTransition(from, to)).toEqual({
      valid: true,
      reason: 'Transition is valid',
    });
  });

  it.each([
    ['draft', 'published'],
    ['published', 'draft'],
    ['revision_requested', 'published'],
  ] as const)('rejects %s -> %s', (from, to) => {
    expect(validateContentApprovalTransition(from, to)).toEqual({
      valid: false,
      reason: `Invalid transition: ${from} -> ${to}`,
    });
  });
});
