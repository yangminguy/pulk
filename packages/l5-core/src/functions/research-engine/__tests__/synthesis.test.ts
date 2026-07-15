import {
  buildClusterPrompt,
  fallbackClusters,
  parseClusterResponse,
  parseUnifiedTheoryResponse,
  partitionPrinciples,
  runSynthesis,
  synthesizePrinciples,
} from '../synthesis';
import { ResearchParseError } from '../types';
import type { AtomCluster } from '../types';
import { makeAtom, makeMockLLM } from '../__fixtures__';

describe('parseClusterResponse (strict)', () => {
  it('parses valid clusters, defaulting an unknown relation to common', () => {
    const raw = '{"clusters":[{"clusterId":"c1","label":"L","atomIds":["a1"],"relation":"weird"}]}';
    const clusters = parseClusterResponse(raw);
    expect(clusters[0].relation).toBe('common');
  });
  it('throws on non-JSON and on empty clusters', () => {
    expect(() => parseClusterResponse('nope')).toThrow(ResearchParseError);
    expect(() => parseClusterResponse('{"clusters":[]}')).toThrow(ResearchParseError);
  });
});

describe('synthesizePrinciples — common claim detection', () => {
  it('counts distinct videoIds as mentionVideoCount and marks common', () => {
    const atoms = [
      makeAtom({ claimId: 'a1', videoId: 'v1', channelId: 'c1' }),
      makeAtom({ claimId: 'a2', videoId: 'v2', channelId: 'c2' }),
      makeAtom({ claimId: 'a3', videoId: 'v3', channelId: 'c3' }),
    ];
    const clusters: AtomCluster[] = [
      { clusterId: 'k1', label: '섬네일이 중요하다', atomIds: ['a1', 'a2', 'a3'], relation: 'common' },
    ];
    const [p] = synthesizePrinciples(clusters, atoms);
    expect(p.kind).toBe('common');
    expect(p.mentionVideoCount).toBe(3);
    expect(p.independentChannelCount).toBe(3);
    expect(p.evidenceQuality).toBe('strong');
  });
});

describe('synthesizePrinciples — independent channel counting', () => {
  it('counts two videos from the same channel as ONE independent channel', () => {
    const atoms = [
      makeAtom({ claimId: 'a1', videoId: 'v1', channelId: 'sameCh' }),
      makeAtom({ claimId: 'a2', videoId: 'v2', channelId: 'sameCh' }),
    ];
    const clusters: AtomCluster[] = [
      { clusterId: 'k1', label: 'X', atomIds: ['a1', 'a2'], relation: 'common' },
    ];
    const [p] = synthesizePrinciples(clusters, atoms);
    expect(p.mentionVideoCount).toBe(2);
    expect(p.independentChannelCount).toBe(1);
    expect(p.evidenceQuality).toBe('weak');
  });
});

describe('synthesizePrinciples — conflict detection', () => {
  it('marks a conflict cluster (single market) as kind=conflict → CONTESTED', () => {
    const atoms = [
      makeAtom({ claimId: 'a1', videoId: 'v1', channelId: 'c1', market: 'KR' }),
      makeAtom({ claimId: 'a2', videoId: 'v2', channelId: 'c2', market: 'KR' }),
    ];
    const clusters: AtomCluster[] = [
      { clusterId: 'k1', label: '주 3회 vs 매일 업로드', atomIds: ['a1', 'a2'], relation: 'conflict' },
    ];
    const [p] = synthesizePrinciples(clusters, atoms);
    expect(p.kind).toBe('conflict');
    expect(p.verificationStatus).toBe('CONTESTED');
  });

  it('marks a cross-market conflict as kind=kr_us_diff', () => {
    const atoms = [
      makeAtom({ claimId: 'a1', videoId: 'v1', channelId: 'c1', market: 'KR' }),
      makeAtom({ claimId: 'a2', videoId: 'v2', channelId: 'c2', market: 'US' }),
    ];
    const clusters: AtomCluster[] = [
      { clusterId: 'k1', label: 'KR vs US 전략', atomIds: ['a1', 'a2'], relation: 'conflict' },
    ];
    const [p] = synthesizePrinciples(clusters, atoms);
    expect(p.kind).toBe('kr_us_diff');
  });

  it('skips clusters whose atomIds resolve to nothing', () => {
    const out = synthesizePrinciples(
      [{ clusterId: 'x', label: 'y', atomIds: ['ghost'], relation: 'common' }],
      [makeAtom({ claimId: 'real' })],
    );
    expect(out).toHaveLength(0);
  });
});

describe('partitionPrinciples', () => {
  it('routes principles into common / conflict / kr_us buckets', () => {
    const atoms = [makeAtom({ claimId: 'a1', videoId: 'v1', channelId: 'c1', market: 'KR' })];
    const common = synthesizePrinciples([{ clusterId: 'c', label: 'x', atomIds: ['a1'], relation: 'common' }], atoms);
    const parts = partitionPrinciples(common);
    expect(parts.common).toHaveLength(1);
    expect(parts.conflict).toHaveLength(0);
  });
});

describe('parseUnifiedTheoryResponse', () => {
  it('extracts the string field', () => {
    expect(parseUnifiedTheoryResponse('{"unifiedTheory":"핵심은 클릭률이다"}')).toBe('핵심은 클릭률이다');
  });
  it('throws when missing', () => {
    expect(() => parseUnifiedTheoryResponse('{}')).toThrow(ResearchParseError);
  });
});

describe('fallbackClusters', () => {
  it('groups atoms by normalized claim head', () => {
    const atoms = [
      makeAtom({ claimId: 'a1', claim: '섬네일이 중요' }),
      makeAtom({ claimId: 'a2', claim: '섬네일이 중요' }),
      makeAtom({ claimId: 'a3', claim: '제목이 중요' }),
    ];
    const clusters = fallbackClusters(atoms);
    expect(clusters).toHaveLength(2);
  });
});

describe('buildClusterPrompt', () => {
  it('lists atom ids with market tags', () => {
    const { user } = buildClusterPrompt([makeAtom({ claimId: 'a1', market: 'KR' })]);
    expect(user).toMatch(/a1 \[KR\]/);
  });
});

describe('runSynthesis (orchestrator)', () => {
  const atoms = [
    makeAtom({ claimId: 'a1', videoId: 'v1', channelId: 'c1' }),
    makeAtom({ claimId: 'a2', videoId: 'v2', channelId: 'c2' }),
  ];

  it('uses LLM clusters + unified theory when both succeed', async () => {
    const llm = makeMockLLM({
      'research.cluster': () => '{"clusters":[{"clusterId":"k1","label":"핵심","atomIds":["a1","a2"],"relation":"common"}]}',
      'research.unifiedTheory': () => '{"unifiedTheory":"통합"}',
    });
    const out = await runSynthesis('주제', atoms, llm);
    expect(out.principles).toHaveLength(1);
    expect(out.unifiedTheory).toBe('통합');
  });

  it('falls back to deterministic clusters when clustering fails', async () => {
    const llm = makeMockLLM({}, { throwAll: true });
    const out = await runSynthesis('주제', atoms, llm);
    expect(out.principles.length).toBeGreaterThan(0);
    expect(out.unifiedTheory).toBeNull();
  });
});
