import { createApprovalGate, decideGate, isGateCleared } from '../approval-gates';
import type { VideoRoomGateType } from '../types';

const baseInput = {
  id: 'gate-1',
  video_project_id: 'vp-1',
  gate_type: 'key_content_approval' as VideoRoomGateType,
  title: '키 콘텐츠 확정',
  context: 'AI 마케팅팀 관련 키 콘텐츠 1개를 확정합니다.',
  options: ['승인', '수정 요청', '다른 후보 보기'],
  recommended_option: '승인',
};

// ── createApprovalGate ──────────────────────────────────────────────────────

describe('createApprovalGate', () => {
  it('creates a pending gate with correct defaults', () => {
    const gate = createApprovalGate(baseInput);
    expect(gate.id).toBe('gate-1');
    expect(gate.status).toBe('pending');
    expect(gate.page).toBe('strategy');
    expect(gate.gate_type).toBe('key_content_approval');
    expect(gate.decided_by).toBeUndefined();
    expect(gate.decided_at).toBeUndefined();
  });

  it.each([
    ['key_content_approval', 'strategy'],
    ['pulling_content_set_approval', 'strategy'],
    ['hook_draft_approval', 'strategy'],
    ['script_approval', 'production'],
    ['video_qa_approval', 'review_publish'],
    ['upload_approval', 'review_publish'],
  ] as [VideoRoomGateType, string][])(
    'maps gate_type=%s to page=%s',
    (gate_type, expectedPage) => {
      const gate = createApprovalGate({ ...baseInput, gate_type });
      expect(gate.page).toBe(expectedPage);
    },
  );

  it('throws when options is empty', () => {
    expect(() => createApprovalGate({ ...baseInput, options: [] })).toThrow('options');
  });

  it('throws when id is empty', () => {
    expect(() => createApprovalGate({ ...baseInput, id: '' })).toThrow('id');
  });

  it('throws when title is empty', () => {
    expect(() => createApprovalGate({ ...baseInput, title: '  ' })).toThrow('title');
  });

  it('throws when context is empty', () => {
    expect(() => createApprovalGate({ ...baseInput, context: '' })).toThrow('context');
  });

  it('allows omitting recommended_option', () => {
    const { recommended_option: _, ...withoutRecommended } = baseInput;
    const gate = createApprovalGate(withoutRecommended);
    expect(gate.recommended_option).toBeUndefined();
  });
});

// ── decideGate ──────────────────────────────────────────────────────────────

describe('decideGate', () => {
  function pendingGate() {
    return createApprovalGate(baseInput);
  }

  it('approves a pending gate', () => {
    const decided = decideGate(pendingGate(), 'approved', 'founder', '2026-06-05T00:00:00Z');
    expect(decided.status).toBe('approved');
    expect(decided.decided_by).toBe('founder');
    expect(decided.decided_at).toBe('2026-06-05T00:00:00Z');
  });

  it('rejects a pending gate', () => {
    const decided = decideGate(pendingGate(), 'rejected', 'ceo', '2026-06-05T00:00:00Z');
    expect(decided.status).toBe('rejected');
    expect(decided.decided_by).toBe('ceo');
  });

  it('sets needs_revision on a pending gate', () => {
    const decided = decideGate(pendingGate(), 'needs_revision', 'founder', '2026-06-05T00:00:00Z');
    expect(decided.status).toBe('needs_revision');
  });

  it('throws when gate has already been decided', () => {
    const decided = decideGate(pendingGate(), 'approved', 'founder', '2026-06-05T00:00:00Z');
    expect(() =>
      decideGate(decided, 'rejected', 'founder', '2026-06-05T01:00:00Z'),
    ).toThrow('already been decided');
  });

  it('throws on re-decide from needs_revision state', () => {
    const revised = decideGate(pendingGate(), 'needs_revision', 'founder', '2026-06-05T00:00:00Z');
    expect(() =>
      decideGate(revised, 'approved', 'founder', '2026-06-05T02:00:00Z'),
    ).toThrow('already been decided');
  });
});

// ── isGateCleared ───────────────────────────────────────────────────────────

describe('isGateCleared', () => {
  it('returns false for pending gate', () => {
    expect(isGateCleared(createApprovalGate(baseInput))).toBe(false);
  });

  it('returns true for approved gate', () => {
    const approved = decideGate(
      createApprovalGate(baseInput),
      'approved',
      'founder',
      '2026-06-05T00:00:00Z',
    );
    expect(isGateCleared(approved)).toBe(true);
  });

  it('returns false for rejected gate', () => {
    const rejected = decideGate(
      createApprovalGate(baseInput),
      'rejected',
      'founder',
      '2026-06-05T00:00:00Z',
    );
    expect(isGateCleared(rejected)).toBe(false);
  });

  it('returns false for needs_revision gate', () => {
    const revised = decideGate(
      createApprovalGate(baseInput),
      'needs_revision',
      'founder',
      '2026-06-05T00:00:00Z',
    );
    expect(isGateCleared(revised)).toBe(false);
  });
});
