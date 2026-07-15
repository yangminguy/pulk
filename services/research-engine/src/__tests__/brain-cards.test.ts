import { makeBrainCards } from '../adapters/brain-cards';
import type { SynthesizedPrinciple } from '@l5/core';

function principle(id: string, statement: string): SynthesizedPrinciple {
  return { id, statement } as unknown as SynthesizedPrinciple;
}

describe('makeBrainCards (graceful disable)', () => {
  it('returns null when the Second Brain dir/python is absent', () => {
    const writer = makeBrainCards({
      dir: '/nope',
      py: '/nope/python',
      fileExists: () => false,
      log: () => {},
    });
    expect(writer).toBeNull();
  });

  it('returns a writer when present and pushes one card per principle', async () => {
    const calls: string[][] = [];
    const writer = makeBrainCards({
      dir: '/sb',
      brain: 'biz',
      py: '/sb/.venv/bin/python',
      createdBy: 'research-engine',
      fileExists: () => true,
      runPython: async (_py, args) => {
        calls.push(args);
        return '[]';
      },
      log: () => {},
    });
    expect(writer).not.toBeNull();
    await writer!.push({
      topic: '콘텐츠',
      notionUrl: 'https://notion.so/p',
      principles: [principle('p1', 's1'), principle('p2', 's2')],
    });
    expect(calls).toHaveLength(1);
    const args = calls[0];
    // ['-c', SCRIPT, brain, topic, source_url, created_by, claimsJson]
    expect(args[2]).toBe('biz');
    expect(args[3]).toBe('콘텐츠');
    expect(args[4]).toBe('https://notion.so/p');
    expect(args[5]).toBe('research-engine');
    expect(JSON.parse(args[6])).toEqual(['s1', 's2']);
  });

  it('does not spawn when there are no non-empty statements', async () => {
    let ran = false;
    const writer = makeBrainCards({
      dir: '/sb',
      py: '/sb/.venv/bin/python',
      fileExists: () => true,
      runPython: async () => {
        ran = true;
        return '[]';
      },
      log: () => {},
    });
    await writer!.push({ topic: 't', notionUrl: null, principles: [] });
    expect(ran).toBe(false);
  });
});
