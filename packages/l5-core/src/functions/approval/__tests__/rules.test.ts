import { requiresFounderApproval, getApprovalDeadline, isApprovalExpired } from '../index';

describe('requiresFounderApproval', () => {
  it('D1 should not require approval', () => {
    const result = requiresFounderApproval('test_decision', 'D1');
    expect(result.requires_approval).toBe(false);
    expect(result.approval_level).toBe('none');
  });

  it('D2 should not require approval', () => {
    const result = requiresFounderApproval('test_decision', 'D2');
    expect(result.requires_approval).toBe(false);
  });

  it('D3 should require CEO approval', () => {
    const result = requiresFounderApproval('test_decision', 'D3');
    expect(result.requires_approval).toBe(true);
    expect(result.approval_level).toBe('cto_autonomous');
  });

  it('D4 should require Founder approval', () => {
    const result = requiresFounderApproval('customer_message', 'D4');
    expect(result.requires_approval).toBe(true);
    expect(result.approval_level).toBe('founder_only');
    expect(result.urgency).toBe('high');
  });

  it('D5 should require Founder and Legal approval', () => {
    const result = requiresFounderApproval('contract_signature', 'D5');
    expect(result.requires_approval).toBe(true);
    expect(result.approval_level).toBe('founder_and_legal');
    expect(result.urgency).toBe('critical');
  });
});

describe('getApprovalDeadline', () => {
  const now = new Date('2026-05-26T12:00:00Z');

  it('routine should have 48-hour deadline', () => {
    const deadline = getApprovalDeadline(now, 'routine');
    const diff = deadline.getTime() - now.getTime();
    const hours = diff / (1000 * 60 * 60);
    expect(hours).toBe(48);
  });

  it('high should have 4-hour deadline', () => {
    const deadline = getApprovalDeadline(now, 'high');
    const diff = deadline.getTime() - now.getTime();
    const hours = diff / (1000 * 60 * 60);
    expect(hours).toBe(4);
  });

  it('critical should have 1-hour deadline', () => {
    const deadline = getApprovalDeadline(now, 'critical');
    const diff = deadline.getTime() - now.getTime();
    const hours = diff / (1000 * 60 * 60);
    expect(hours).toBe(1);
  });
});

describe('isApprovalExpired', () => {
  it('should return false for recent request within deadline', () => {
    const now = new Date();
    const result = isApprovalExpired(now, 'routine');
    expect(result).toBe(false);
  });

  it('should return true for very old request', () => {
    const oldDate = new Date();
    oldDate.setHours(oldDate.getHours() - 72);
    const result = isApprovalExpired(oldDate, 'routine');
    expect(result).toBe(true);
  });
});
