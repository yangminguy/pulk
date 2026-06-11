import { cmoStrategyWatch, parsePTInventory, type PTSnapshot } from '../strategy-watch';

describe('cmoStrategyWatch', () => {
  it('reports added entries against an empty snapshot', () => {
    const r = cmoStrategyWatch({}, [
      { source_id: 'a', title: '비즈니스 PT 1', hash: 'h1' },
      { source_id: 'b', title: '비즈니스 PT 2', hash: 'h2' },
    ]);
    expect(r.added.map(e => e.source_id)).toEqual(['a', 'b']);
    expect(r.changed).toEqual([]);
    expect(r.hasChanges).toBe(true);
    expect(r.snapshot).toEqual({ a: 'h1', b: 'h2' });
    expect(r.summary).toContain('새 자료 2건');
  });

  it('detects changed hashes and ignores unchanged', () => {
    const prev: PTSnapshot = { a: 'h1', b: 'h2' };
    const r = cmoStrategyWatch(prev, [
      { source_id: 'a', hash: 'h1' },          // unchanged
      { source_id: 'b', hash: 'h2-NEW' },      // changed
    ]);
    expect(r.added).toEqual([]);
    expect(r.changed.map(e => e.source_id)).toEqual(['b']);
    expect(r.hasChanges).toBe(true);
    expect(r.summary).toContain('수정 1건');
  });

  it('returns hasChanges=false and empty summary when nothing changed', () => {
    const prev: PTSnapshot = { a: 'h1' };
    const r = cmoStrategyWatch(prev, [{ source_id: 'a', hash: 'h1' }]);
    expect(r.hasChanges).toBe(false);
    expect(r.summary).toBe('');
  });

  it('ignores removed entries (only surfaces new knowledge)', () => {
    const prev: PTSnapshot = { a: 'h1', gone: 'hx' };
    const r = cmoStrategyWatch(prev, [{ source_id: 'a', hash: 'h1' }]);
    expect(r.hasChanges).toBe(false);
    expect(r.snapshot).toEqual({ a: 'h1' });
  });

  it('does not double-count duplicate source_ids', () => {
    const r = cmoStrategyWatch({}, [
      { source_id: 'a', hash: 'h1' },
      { source_id: 'a', hash: 'h1b' },
    ]);
    expect(r.added.filter(e => e.source_id === 'a').length).toBe(1);
    expect(r.snapshot.a).toBe('h1b');
  });

  it('falls back to source_id when title is missing in the summary', () => {
    const r = cmoStrategyWatch({}, [{ source_id: 'src-xyz', hash: 'h' }]);
    expect(r.summary).toContain('src-xyz');
  });
});

describe('parsePTInventory', () => {
  it('parses one JSON object per line and skips malformed/blank lines', () => {
    const jsonl = [
      JSON.stringify({ source_id: 'a', title: 'T', hash: 'h1', platform: 'notion' }),
      '',
      'not-json',
      JSON.stringify({ title: 'no id' }),               // missing source_id → skipped
      JSON.stringify({ source_id: 'b', hash: 'h2' }),
    ].join('\n');
    const entries = parsePTInventory(jsonl);
    expect(entries.map(e => e.source_id)).toEqual(['a', 'b']);
    expect(entries[0].title).toBe('T');
    expect(entries[0].platform).toBe('notion');
  });

  it('returns [] for empty input', () => {
    expect(parsePTInventory('')).toEqual([]);
  });
});
