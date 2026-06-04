import {
  createBusinessPTContextSnapshot,
  assertContextLoadingComplete,
  isContextFresh,
} from '../business-pt-context';
import type { BusinessPTSourceRef } from '../types';

const makeRef = (n: number): BusinessPTSourceRef => ({
  source_id: `src-${n}`,
  title: `Source ${n}`,
  source_type: 'notion',
});

const BASE_INPUT = {
  id: 'snap-1',
  video_project_id: 'proj-1',
  loaded_at: '2026-06-05T00:00:00.000Z',
  source_refs: [makeRef(1), makeRef(2), makeRef(3)],
  key_content_rules: ['rule A'],
  pulling_content_rules: ['rule B'],
  freshness_status: 'fresh' as const,
};

describe('createBusinessPTContextSnapshot', () => {
  it('creates a snapshot with all required fields', () => {
    const snap = createBusinessPTContextSnapshot(BASE_INPUT);
    expect(snap.id).toBe('snap-1');
    expect(snap.video_project_id).toBe('proj-1');
    expect(snap.loaded_at).toBe('2026-06-05T00:00:00.000Z');
    expect(snap.source_refs).toHaveLength(3);
    expect(snap.key_content_rules).toEqual(['rule A']);
    expect(snap.pulling_content_rules).toEqual(['rule B']);
    expect(snap.freshness_status).toBe('fresh');
  });

  it('defaults optional arrays to empty arrays', () => {
    const snap = createBusinessPTContextSnapshot(BASE_INPUT);
    expect(snap.key_principles).toEqual([]);
    expect(snap.thumbnail_intro_rules).toEqual([]);
    expect(snap.script_structure_rules).toEqual([]);
    expect(snap.caution_notes).toEqual([]);
  });

  it('preserves provided optional arrays', () => {
    const snap = createBusinessPTContextSnapshot({
      ...BASE_INPUT,
      key_principles: ['p1'],
      thumbnail_intro_rules: ['t1'],
      script_structure_rules: ['s1'],
      caution_notes: ['c1'],
    });
    expect(snap.key_principles).toEqual(['p1']);
    expect(snap.thumbnail_intro_rules).toEqual(['t1']);
    expect(snap.script_structure_rules).toEqual(['s1']);
    expect(snap.caution_notes).toEqual(['c1']);
  });

  it('throws when id is empty', () => {
    expect(() => createBusinessPTContextSnapshot({ ...BASE_INPUT, id: '' })).toThrow(
      'id must not be empty',
    );
  });

  it('throws when video_project_id is empty', () => {
    expect(() =>
      createBusinessPTContextSnapshot({ ...BASE_INPUT, video_project_id: '' }),
    ).toThrow('video_project_id must not be empty');
  });

  it('throws when loaded_at is empty', () => {
    expect(() => createBusinessPTContextSnapshot({ ...BASE_INPUT, loaded_at: '  ' })).toThrow(
      'loaded_at must not be empty',
    );
  });
});

describe('assertContextLoadingComplete', () => {
  it('does not throw for a complete snapshot', () => {
    const snap = createBusinessPTContextSnapshot(BASE_INPUT);
    expect(() => assertContextLoadingComplete(snap)).not.toThrow();
  });

  it('throws when source_refs has fewer than 3 entries', () => {
    const snap = createBusinessPTContextSnapshot({
      ...BASE_INPUT,
      source_refs: [makeRef(1), makeRef(2)],
    });
    expect(() => assertContextLoadingComplete(snap)).toThrow(
      'at least 3 source_refs required (got 2)',
    );
  });

  it('throws when source_refs is empty', () => {
    const snap = createBusinessPTContextSnapshot({ ...BASE_INPUT, source_refs: [] });
    expect(() => assertContextLoadingComplete(snap)).toThrow(
      'at least 3 source_refs required (got 0)',
    );
  });

  it('throws when key_content_rules is empty', () => {
    const snap = createBusinessPTContextSnapshot({ ...BASE_INPUT, key_content_rules: [] });
    expect(() => assertContextLoadingComplete(snap)).toThrow(
      'key_content_rules must not be empty',
    );
  });

  it('throws when pulling_content_rules is empty', () => {
    const snap = createBusinessPTContextSnapshot({ ...BASE_INPUT, pulling_content_rules: [] });
    expect(() => assertContextLoadingComplete(snap)).toThrow(
      'pulling_content_rules must not be empty',
    );
  });
});

describe('isContextFresh', () => {
  it('returns true for fresh status', () => {
    const snap = createBusinessPTContextSnapshot({ ...BASE_INPUT, freshness_status: 'fresh' });
    expect(isContextFresh(snap)).toBe(true);
  });

  it('returns false for stale status', () => {
    const snap = createBusinessPTContextSnapshot({ ...BASE_INPUT, freshness_status: 'stale' });
    expect(isContextFresh(snap)).toBe(false);
  });

  it('returns false for needs_refresh status', () => {
    const snap = createBusinessPTContextSnapshot({
      ...BASE_INPUT,
      freshness_status: 'needs_refresh',
    });
    expect(isContextFresh(snap)).toBe(false);
  });
});
