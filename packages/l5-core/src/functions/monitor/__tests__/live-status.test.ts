import {
  deriveLiveStatus,
  blockerTail,
  LiveStatusTask,
} from '../live-status';

// Build a task row with sane defaults; override per case.
function task(over: Partial<LiveStatusTask>): LiveStatusTask {
  return {
    status: 'queued',
    blocker: null,
    assigned_agent: 'CMO',
    approval_required: false,
    ...over,
  };
}

describe('blockerTail', () => {
  it('strips a prefix before the first colon', () => {
    expect(blockerTail('awaiting_founder: 어떤 톤으로?')).toBe('어떤 톤으로?');
  });
  it('returns the whole string when there is no colon', () => {
    expect(blockerTail('plain blocker')).toBe('plain blocker');
  });
  it('handles null/undefined', () => {
    expect(blockerTail(null)).toBe('');
    expect(blockerTail(undefined)).toBe('');
  });
  it('keeps the tail when value contains multiple colons', () => {
    expect(blockerTail('awaiting_delegation: do x: now')).toBe('do x: now');
  });
});

describe('deriveLiveStatus — spec §2 derivation table', () => {
  // Row 1 — done
  it('row 1: done', () => {
    const r = deriveLiveStatus(task({ status: 'done' }));
    expect(r.live_status).toBe('done');
    expect(r.status).toBe('done');
    expect(r.counterpart).toBeNull();
    expect(r.current_action).toBe('완료');
    expect(r.hidden).toBe(false);
  });

  it('row 1: done with merge note in blocker', () => {
    const r = deriveLiveStatus(
      task({ status: 'done', blocker: 'done: merged phase=execution' }),
    );
    expect(r.live_status).toBe('done');
    expect(r.current_action).toContain('완료 —');
    expect(r.current_action).toContain('merged phase=execution');
  });

  // Row 2 — killed (hidden)
  it('row 2: killed → done + hidden', () => {
    const r = deriveLiveStatus(task({ status: 'killed' }));
    expect(r.live_status).toBe('done');
    expect(r.hidden).toBe(true);
    expect(r.counterpart).toBeNull();
  });

  // Row 3 — blocked
  it('row 3: blocked surfaces blocker text (clipped)', () => {
    const long = 'x'.repeat(200);
    const r = deriveLiveStatus(task({ status: 'blocked', blocker: long }));
    expect(r.live_status).toBe('blocked');
    expect(r.counterpart).toBeNull();
    expect(r.current_action.length).toBe(120);
  });

  it('row 3: blocked with empty blocker falls back to label', () => {
    const r = deriveLiveStatus(task({ status: 'blocked', blocker: '' }));
    expect(r.live_status).toBe('blocked');
    expect(r.current_action).toBe('차단됨');
  });

  // Row 4 — awaiting_founder via blocker prefix
  it('row 4: needs_review + awaiting_founder blocker → Founder', () => {
    const r = deriveLiveStatus(
      task({ status: 'needs_review', blocker: 'awaiting_founder: 어떤 톤으로 보낼까요?' }),
    );
    expect(r.live_status).toBe('awaiting_founder');
    expect(r.counterpart).toBe('Founder');
    expect(r.current_action).toBe('창업자 답변 대기: 어떤 톤으로 보낼까요?');
  });

  // Row 4 — awaiting_founder via consult row (no blocker prefix), question enrichment
  it('row 4: needs_review + consult row enriches one-liner with question', () => {
    const r = deriveLiveStatus(
      task({ status: 'needs_review', blocker: null }),
      { consult: { question: '예산은 얼마인가요?', from_agent: 'CMO' } },
    );
    expect(r.live_status).toBe('awaiting_founder');
    expect(r.counterpart).toBe('Founder');
    expect(r.current_action).toContain('예산은 얼마인가요?');
  });

  it('row 4: blocker prefix present but consult row missing → falls back to blocker tail', () => {
    const r = deriveLiveStatus(
      task({ status: 'needs_review', blocker: 'awaiting_founder: tail-q' }),
      { consult: null },
    );
    expect(r.live_status).toBe('awaiting_founder');
    expect(r.current_action).toContain('tail-q');
  });

  // Row 5 — talking (delegate out) via blocker prefix + delegOut enrichment
  it('row 5: needs_review + awaiting_delegation → talking → to_agent with round', () => {
    const r = deriveLiveStatus(
      task({ status: 'needs_review', blocker: 'awaiting_delegation: deleg-123' }),
      {
        delegOut: {
          to_agent: 'CTO',
          objective: '랜딩 페이지 카피 작성',
          round: 2,
          max_rounds: 3,
        },
      },
    );
    expect(r.live_status).toBe('talking');
    expect(r.counterpart).toBe('CTO');
    expect(r.current_action).toBe('CTO에게 위임 — 랜딩 페이지 카피 작성 (round 2/3)');
  });

  it('row 5: delegOut present without blocker prefix still resolves talking', () => {
    const r = deriveLiveStatus(
      task({ status: 'needs_review', blocker: null }),
      { delegOut: { to_agent: 'COO', objective: 'x' } },
    );
    expect(r.live_status).toBe('talking');
    expect(r.counterpart).toBe('COO');
    expect(r.current_action).toBe('COO에게 위임 — x');
  });

  it('row 5: blocker prefix present but delegOut missing → fallback to blocker tail, null counterpart', () => {
    const r = deriveLiveStatus(
      task({ status: 'needs_review', blocker: 'awaiting_delegation: do-the-thing' }),
      { delegOut: null },
    );
    expect(r.live_status).toBe('talking');
    expect(r.counterpart).toBeNull();
    expect(r.current_action).toContain('do-the-thing');
  });

  it('row 5: objective clipped to 60 chars', () => {
    const r = deriveLiveStatus(
      task({ status: 'needs_review', blocker: 'awaiting_delegation: x' }),
      { delegOut: { to_agent: 'CTO', objective: 'o'.repeat(100), round: 1, max_rounds: 2 } },
    );
    expect(r.current_action).toContain('o'.repeat(60));
    expect(r.current_action).not.toContain('o'.repeat(61));
  });

  // Row 6 — under_review (other blocker reasons)
  it('row 6: needs_review + verifier blocker → under_review → CEO', () => {
    const r = deriveLiveStatus(
      task({ status: 'needs_review', blocker: 'verifier:fail 수용 기준 미충족' }),
    );
    expect(r.live_status).toBe('under_review');
    expect(r.counterpart).toBe('CEO');
    expect(r.current_action).toContain('CEO 검토 중:');
    expect(r.current_action).toContain('수용 기준 미충족');
  });

  it('row 6: needs_review + merge_conflict blocker → under_review', () => {
    const r = deriveLiveStatus(
      task({ status: 'needs_review', blocker: 'merge_conflict on section 2' }),
    );
    expect(r.live_status).toBe('under_review');
    expect(r.counterpart).toBe('CEO');
  });

  it('row 6: under_review reason clipped to 80 chars', () => {
    const r = deriveLiveStatus(
      task({ status: 'needs_review', blocker: 'empty_output: ' + 'z'.repeat(200) }),
    );
    // "CEO 검토 중: " prefix + 80 clipped chars
    expect(r.current_action.startsWith('CEO 검토 중: ')).toBe(true);
    expect(r.current_action).toContain('z'.repeat(80));
    expect(r.current_action).not.toContain('z'.repeat(81));
  });

  // Row 7 — talking (delegated worker)
  it('row 7: running + delegIn → talking → from_agent', () => {
    const r = deriveLiveStatus(
      task({ status: 'running' }),
      { delegIn: { from_agent: 'CMO', objective: '카피 검수' } },
    );
    expect(r.live_status).toBe('talking');
    expect(r.counterpart).toBe('CMO');
    expect(r.current_action).toBe('CMO의 위임 수행 중 — 카피 검수');
  });

  it('row 7: delegIn with missing from_agent → null counterpart, 동료 fallback', () => {
    const r = deriveLiveStatus(
      task({ status: 'running' }),
      { delegIn: { objective: 'work' } },
    );
    expect(r.live_status).toBe('talking');
    expect(r.counterpart).toBeNull();
    expect(r.current_action).toContain('동료의 위임 수행 중');
  });

  // Row 8 — investigating
  it('row 8: running without delegIn → investigating', () => {
    const r = deriveLiveStatus(task({ status: 'running' }));
    expect(r.live_status).toBe('investigating');
    expect(r.counterpart).toBeNull();
    expect(r.current_action).toBe('작업 수행 중…');
  });

  // Row 9 — queued + approval_required → awaiting_founder
  it('row 9: queued + approval_required → awaiting_founder', () => {
    const r = deriveLiveStatus(task({ status: 'queued', approval_required: true }));
    expect(r.live_status).toBe('awaiting_founder');
    expect(r.counterpart).toBe('Founder');
    expect(r.current_action).toBe('승인 대기 중');
  });

  // Row 10 — queued
  it('row 10: plain queued', () => {
    const r = deriveLiveStatus(task({ status: 'queued', approval_required: false }));
    expect(r.live_status).toBe('queued');
    expect(r.counterpart).toBeNull();
    expect(r.current_action).toBe('대기열');
  });

  // Ordering / precedence checks
  it('precedence: done wins even if a delegation row is present', () => {
    const r = deriveLiveStatus(
      task({ status: 'done' }),
      { delegOut: { to_agent: 'CTO', objective: 'x' } },
    );
    expect(r.live_status).toBe('done');
  });

  it('precedence: row 4 (founder) wins over row 5 (delegation) when both signals present', () => {
    const r = deriveLiveStatus(
      task({ status: 'needs_review', blocker: 'awaiting_founder: q' }),
      {
        consult: { question: 'q' },
        delegOut: { to_agent: 'CTO', objective: 'x' },
      },
    );
    expect(r.live_status).toBe('awaiting_founder');
    expect(r.counterpart).toBe('Founder');
  });

  it('every result carries a non-empty label and current_action', () => {
    const statuses: LiveStatusTask['status'][] = [
      'queued', 'running', 'blocked', 'needs_review', 'done', 'killed',
    ];
    for (const s of statuses) {
      const r = deriveLiveStatus(task({ status: s }));
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.current_action.length).toBeGreaterThan(0);
    }
  });
});
