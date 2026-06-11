import {
  buildBatchLearning,
  cardResultToMemoryEntry,
  cardResultToProposalPatch,
  type CardRunResult,
} from '../phase-result-to-memory';

function result(outcome: CardRunResult['outcome'], reason?: string): CardRunResult {
  return { proposal_id: `p-${outcome}`, target_id: 'cto_hermes_runtime', executive: 'CTO', outcome, reason };
}

describe('cardResultToMemoryEntry', () => {
  it('merged → category bpr, contains_pii=false', () => {
    const m = cardResultToMemoryEntry(result('merged'));
    expect(m.category).toBe('bpr');
    expect(m.contains_pii).toBe(false);
    expect(m.pii_level).toBe('none');
    expect(m.source_ref).toBe('tiger:cto_hermes_runtime');
    expect(m.searchable_tags).toContain('CTO');
  });

  it('failed → category failure, 사유를 reusable_context에 축적', () => {
    const m = cardResultToMemoryEntry(result('failed', 'tsc exit 2'));
    expect(m.category).toBe('failure');
    expect(m.reusable_context).toBe('tsc exit 2');
    expect(m.content).toContain('tsc exit 2');
  });

  it('held/waited → failure 카테고리', () => {
    expect(cardResultToMemoryEntry(result('held', 'merge conflict')).category).toBe('failure');
    expect(cardResultToMemoryEntry(result('waited', 'quota')).category).toBe('failure');
  });
});

describe('cardResultToProposalPatch', () => {
  it('merged → implemented, 비재시도', () => {
    expect(cardResultToProposalPatch(result('merged'))).toEqual({
      proposal_id: 'p-merged',
      status: 'implemented',
      retryable: false,
    });
  });

  it('failed → proposed 잔류, 비재시도', () => {
    expect(cardResultToProposalPatch(result('failed'))).toMatchObject({ status: 'proposed', retryable: false });
  });

  it('held/waited → proposed 잔류, 재시도 대상', () => {
    expect(cardResultToProposalPatch(result('held')).retryable).toBe(true);
    expect(cardResultToProposalPatch(result('waited')).retryable).toBe(true);
  });
});

describe('buildBatchLearning', () => {
  it('성공/실패 혼합 → memories+patches+lessons+summary 집계', () => {
    const out = buildBatchLearning([
      result('merged'),
      result('failed', 'build broke'),
      result('waited', 'no tokens'),
    ]);
    expect(out.summary).toEqual({ merged: 1, held: 0, failed: 1, waited: 1 });
    expect(out.memories).toHaveLength(3);
    expect(out.patches).toHaveLength(3);
    // lessons는 실패/보류만(merged 제외).
    expect(out.lessons).toHaveLength(2);
    expect(out.lessons[0]).toContain('build broke');
  });

  it('빈/깨진 입력 → graceful 빈 산출', () => {
    expect(buildBatchLearning([]).memories).toEqual([]);
    expect(buildBatchLearning(null as unknown as CardRunResult[]).summary).toEqual({
      merged: 0, held: 0, failed: 0, waited: 0,
    });
  });

  it('성공만 → lessons 비어있음', () => {
    const out = buildBatchLearning([result('merged'), result('merged')]);
    expect(out.lessons).toEqual([]);
    expect(out.summary.merged).toBe(2);
  });
});
