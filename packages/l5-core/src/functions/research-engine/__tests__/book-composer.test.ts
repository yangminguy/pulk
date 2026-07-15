import {
  assembleBook,
  buildChapterWritePrompt,
  buildOutlinePrompt,
  composeOutline,
  fallbackOutline,
  gatherChapterExcerpts,
  mmss,
  parseChapterMarkdown,
  parseOutlineResponse,
  renderChapterFallback,
  renderPreface,
  stripCodeFences,
  writeChapter,
} from '../book-composer';
import { renderAppendixMarkdown } from '../report';
import { synthesizePrinciples } from '../synthesis';
import {
  ResearchParseError,
  type BookChapterSpec,
  type BookOutline,
  type KnowledgeAtom,
  type SynthesisReport,
  type Transcript,
} from '../types';
import { buildTranscript, genLargeTexts, makeAtom, makeMockLLM, makeRequest } from '../__fixtures__';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const LONG_PROSE = '이 장에서는 개념을 단계적으로 심화하며 실전 적용까지 안내한다. '.repeat(40); // > 800 chars

function principlesFrom(atoms: KnowledgeAtom[], relation: 'common' | 'conflict' = 'common') {
  return synthesizePrinciples(
    [{ clusterId: 'k1', label: '핵심 원칙 문장', atomIds: atoms.map((a) => a.claimId), relation }],
    atoms,
  );
}

// ---------------------------------------------------------------------------
// OUTLINE — prompt
// ---------------------------------------------------------------------------

describe('buildOutlinePrompt', () => {
  it('pins the 8-chapter skeleton and lists atom index + principle ids', () => {
    const atoms = [makeAtom({ claimId: 'a1', claimType: 'framework' })];
    const principles = principlesFrom(atoms);
    const { system, user } = buildOutlinePrompt({
      request: makeRequest(),
      principles,
      atoms,
    });
    expect(system).toMatch(/8개 골격/);
    expect(user).toContain('a1');
    expect(user).toContain(principles[0].id);
    // all 8 skeleton kinds are named in the prompt
    for (const kind of ['overview', 'concepts', 'methodology', 'howto', 'cases', 'conflicts', 'apply', 'glossary']) {
      expect(user).toContain(kind);
    }
  });

  it('emphasizes a content-planning worksheet for CONTENT_PLANNING (purpose 강조)', () => {
    const { user } = buildOutlinePrompt({
      request: makeRequest({ researchPurpose: 'CONTENT_PLANNING' }),
      principles: [],
      atoms: [],
    });
    expect(user).toContain('콘텐츠 기획 워크시트');
  });

  it('does not add the worksheet emphasis for LEARNING', () => {
    const { user } = buildOutlinePrompt({
      request: makeRequest({ researchPurpose: 'LEARNING' }),
      principles: [],
      atoms: [],
    });
    expect(user).not.toContain('콘텐츠 기획 워크시트');
  });

  it('writes the instruction language per outputLanguage', () => {
    const en = buildOutlinePrompt({ request: makeRequest({ outputLanguage: 'en' }), principles: [], atoms: [] });
    expect(en.system).toMatch(/영어\(English\)/);
    const ko = buildOutlinePrompt({ request: makeRequest({ outputLanguage: 'ko' }), principles: [], atoms: [] });
    expect(ko.system).toMatch(/한국어/);
  });
});

// ---------------------------------------------------------------------------
// OUTLINE — parser
// ---------------------------------------------------------------------------

describe('parseOutlineResponse', () => {
  it('parses a well-formed outline, tolerating a code fence', () => {
    const raw =
      '```json\n' +
      JSON.stringify({
        chapters: [
          { chapterId: 'c1', kind: 'overview', title: '개요', goal: '지도', principleIds: ['p1'], atomIds: ['a1'] },
          { chapterId: 'c2', kind: 'apply', title: '적용', goal: '실전', principleIds: [], atomIds: ['a2'] },
        ],
      }) +
      '\n```';
    const outline = parseOutlineResponse(raw);
    expect(outline.chapters).toHaveLength(2);
    expect(outline.chapters[0].kind).toBe('overview');
    expect(outline.chapters[0].atomIds).toEqual(['a1']);
  });

  it('coerces an unknown kind to the positional skeleton kind', () => {
    const raw = JSON.stringify({ chapters: [{ kind: 'weird', title: 'T', goal: 'G' }] });
    const outline = parseOutlineResponse(raw);
    expect(outline.chapters[0].kind).toBe('overview'); // index 0
    expect(outline.chapters[0].chapterId).toBe('ch1'); // generated
  });

  it('throws on non-JSON', () => {
    expect(() => parseOutlineResponse('not json')).toThrow(ResearchParseError);
  });

  it('throws when chapters is empty', () => {
    expect(() => parseOutlineResponse('{"chapters":[]}')).toThrow(ResearchParseError);
  });
});

// ---------------------------------------------------------------------------
// OUTLINE — deterministic fallback
// ---------------------------------------------------------------------------

describe('fallbackOutline', () => {
  const frameworkAtom = makeAtom({ claimId: 'fw1', claimType: 'framework' });
  const caseAtom = makeAtom({ claimId: 'cs1', claimType: 'case_study' });
  const howAtom = makeAtom({ claimId: 'hw1', claimType: 'instruction' });
  const atoms = [frameworkAtom, caseAtom, howAtom];

  it('produces the 8 skeleton chapters in order', () => {
    const outline = fallbackOutline(makeRequest(), principlesFrom(atoms), atoms);
    expect(outline.chapters.map((c) => c.kind)).toEqual([
      'overview',
      'concepts',
      'methodology',
      'howto',
      'cases',
      'conflicts',
      'apply',
      'glossary',
    ]);
  });

  it('routes atoms into chapters by claimType', () => {
    const outline = fallbackOutline(makeRequest(), principlesFrom(atoms), atoms);
    const byKind = Object.fromEntries(outline.chapters.map((c) => [c.kind, c]));
    expect(byKind.concepts.atomIds).toContain('fw1');
    expect(byKind.cases.atomIds).toContain('cs1');
    expect(byKind.howto.atomIds).toContain('hw1');
  });

  it('routes conflict principles + their atoms into the conflicts chapter', () => {
    const conflictAtoms = [
      makeAtom({ claimId: 'x1', videoId: 'v1', channelId: 'c1', market: 'KR' }),
      makeAtom({ claimId: 'x2', videoId: 'v2', channelId: 'c2', market: 'US' }),
    ];
    const conflictPrinciples = principlesFrom(conflictAtoms, 'conflict');
    const outline = fallbackOutline(makeRequest(), conflictPrinciples, conflictAtoms);
    const conflicts = outline.chapters.find((c) => c.kind === 'conflicts')!;
    expect(conflicts.principleIds).toEqual(conflictPrinciples.map((p) => p.id));
  });

  it('titles the apply chapter as a worksheet for CONTENT_PLANNING', () => {
    const outline = fallbackOutline(makeRequest({ researchPurpose: 'CONTENT_PLANNING' }), [], []);
    const apply = outline.chapters.find((c) => c.kind === 'apply')!;
    expect(apply.title).toContain('워크시트');
  });
});

// ---------------------------------------------------------------------------
// OUTLINE — composeOutline (LLM + sanitize + fallback)
// ---------------------------------------------------------------------------

describe('composeOutline', () => {
  const atoms = [makeAtom({ claimId: 'a1' }), makeAtom({ claimId: 'a2' })];
  const principles = principlesFrom(atoms);

  it('uses the LLM outline and drops hallucinated ids', async () => {
    const llm = makeMockLLM({
      'research.book.outline': () =>
        JSON.stringify({
          chapters: [
            { chapterId: 'c1', kind: 'overview', title: '개요', goal: 'g', principleIds: [principles[0].id, 'ghost'], atomIds: ['a1', 'nope'] },
          ],
        }),
    });
    const outline = await composeOutline({ request: makeRequest(), principles, atoms, llm });
    expect(outline.chapters[0].atomIds).toEqual(['a1']); // 'nope' removed
    expect(outline.chapters[0].principleIds).toEqual([principles[0].id]); // 'ghost' removed
  });

  it('falls back to the deterministic outline when the LLM fails', async () => {
    const llm = makeMockLLM({}, { throwAll: true });
    const outline = await composeOutline({ request: makeRequest(), principles, atoms, llm });
    expect(outline.chapters).toHaveLength(8); // full skeleton
  });
});

// ---------------------------------------------------------------------------
// EXCERPT (pure)
// ---------------------------------------------------------------------------

describe('gatherChapterExcerpts', () => {
  // 40 segments, 5s each (index i spans [5i, 5i+5]); distinctive per-segment text.
  const texts = Array.from({ length: 40 }, (_, i) => `구간${i}내용`);
  const transcript = buildTranscript({ texts, videoId: 'vid1', chunkChars: 7000 });
  const transcripts = new Map<string, Transcript>([['vid1', transcript]]);
  const titles = new Map<string, string>([['vid1', '영상 제목']]);

  it('pulls only segments inside the ±window (boundary correctness)', () => {
    // atom at 100..105s, window ±10 → [90, 115] → segments index 17..23.
    const atom = makeAtom({ claimId: 'a1', videoId: 'vid1', startSeconds: 100, endSeconds: 105 });
    const [ex] = gatherChapterExcerpts({ atoms: [atom], transcripts, videoTitles: titles, windowSeconds: 10 });
    expect(ex.text).toContain('구간20내용'); // the atom's own segment
    expect(ex.text).toContain('구간17내용'); // lower boundary (85..90, endSeconds 90>=90)
    expect(ex.text).toContain('구간23내용'); // upper boundary (115..120, startSeconds 115<=115)
    expect(ex.text).not.toContain('구간16내용'); // just below the window
    expect(ex.text).not.toContain('구간24내용'); // just above the window
    expect(ex.timestamp).toBe('1:40'); // mm:ss of 100s
    expect(ex.sourceUrl).toBe(atom.sourceUrl);
  });

  it('keeps the whole chapter under the 8k budget, split evenly per atom', () => {
    const big = buildTranscript({ texts: genLargeTexts(30_000), videoId: 'big', chunkChars: 7000 });
    const bigMap = new Map<string, Transcript>([['big', big]]);
    const bigTitles = new Map<string, string>([['big', 'B']]);
    const atoms = [200, 400, 600, 700].map((s, i) =>
      makeAtom({ claimId: `a${i}`, videoId: 'big', startSeconds: s, endSeconds: s + 5 }),
    );
    const excerpts = gatherChapterExcerpts({ atoms, transcripts: bigMap, videoTitles: bigTitles });
    const perAtom = Math.floor(8000 / atoms.length); // 2000
    const total = excerpts.reduce((n, e) => n + e.text.length, 0);
    expect(total).toBeLessThanOrEqual(8000);
    for (const e of excerpts) expect(e.text.length).toBeLessThanOrEqual(perAtom);
    // large windows actually hit the cap (truncation happened)
    expect(excerpts.some((e) => e.text.endsWith('…'))).toBe(true);
  });

  it('returns nothing for a chapter with no atoms', () => {
    expect(gatherChapterExcerpts({ atoms: [], transcripts, videoTitles: titles })).toEqual([]);
  });

  it('skips atoms whose transcript is absent', () => {
    const atom = makeAtom({ claimId: 'a1', videoId: 'missing', startSeconds: 10, endSeconds: 15 });
    expect(gatherChapterExcerpts({ atoms: [atom], transcripts, videoTitles: titles })).toEqual([]);
  });
});

describe('mmss', () => {
  it('formats seconds as m:ss', () => {
    expect(mmss(0)).toBe('0:00');
    expect(mmss(5)).toBe('0:05');
    expect(mmss(100)).toBe('1:40');
    expect(mmss(3661)).toBe('61:01');
  });
});

// ---------------------------------------------------------------------------
// WRITE — prompt + parser
// ---------------------------------------------------------------------------

describe('buildChapterWritePrompt', () => {
  const chapter: BookChapterSpec = {
    chapterId: 'c-howto',
    kind: 'howto',
    title: '구체적 실행 방법',
    goal: '단계별로 실행한다',
    principleIds: [],
    atomIds: ['a1'],
  };
  const longClaim = '섬네일 클릭률을 높이려면 앞 2초 안에 핵심 메시지를 노출하고 얼굴 대비를 강조하며 텍스트를 최소화해야 한다는 실전 규칙';
  const atom = makeAtom({ claimId: 'a1', claim: longClaim, explanation: '자세한 설명', evidence: '원문 근거' });

  it('includes the full atom text without truncation + previous titles', () => {
    const { user } = buildChapterWritePrompt({
      chapter,
      atoms: [atom],
      excerpts: [],
      previousTitles: ['전체 개요', '핵심 개념'],
      request: makeRequest(),
      videoTitles: new Map([[atom.videoId, '영상']]),
    });
    expect(user).toContain(longClaim); // no substr
    expect(user).toContain('전체 개요');
    expect(user).toContain('핵심 개념');
  });

  it('requires numbered steps + checklist for actionable (howto/apply) chapters', () => {
    const { system } = buildChapterWritePrompt({
      chapter,
      atoms: [atom],
      excerpts: [],
      previousTitles: [],
      request: makeRequest(),
      videoTitles: new Map(),
    });
    expect(system).toMatch(/번호가 매겨진 단계/);
    expect(system).toMatch(/체크리스트/);
  });

  it('does not demand the actionable format for a non-actionable chapter', () => {
    const { system } = buildChapterWritePrompt({
      chapter: { ...chapter, kind: 'overview', chapterId: 'c-ov' },
      atoms: [atom],
      excerpts: [],
      previousTitles: [],
      request: makeRequest(),
      videoTitles: new Map(),
    });
    expect(system).not.toMatch(/번호가 매겨진 단계/);
  });

  it('enforces outputLanguage in the system rules', () => {
    const en = buildChapterWritePrompt({
      chapter,
      atoms: [atom],
      excerpts: [],
      previousTitles: [],
      request: makeRequest({ outputLanguage: 'en' }),
      videoTitles: new Map(),
    });
    expect(en.system).toMatch(/영어\(English\)/);
  });
});

describe('stripCodeFences + parseChapterMarkdown', () => {
  it('strips a ```markdown fence', () => {
    expect(stripCodeFences('```markdown\n본문 내용\n```')).toBe('본문 내용');
    expect(stripCodeFences('```\n본문\n```')).toBe('본문');
    expect(stripCodeFences('그냥 본문')).toBe('그냥 본문');
  });

  it('accepts prose over the 800-char floor (after fence stripping)', () => {
    const fenced = '```markdown\n' + LONG_PROSE + '\n```';
    expect(parseChapterMarkdown(fenced)).toBe(LONG_PROSE.trim());
  });

  it('throws ResearchParseError when the chapter is too short', () => {
    expect(() => parseChapterMarkdown('짧은 글')).toThrow(ResearchParseError);
    expect(() => parseChapterMarkdown('짧은 글')).toThrow(/too short/);
  });
});

// ---------------------------------------------------------------------------
// WRITE — writeChapter (LLM success + deterministic fallback)
// ---------------------------------------------------------------------------

describe('writeChapter', () => {
  const chapter: BookChapterSpec = {
    chapterId: 'c1',
    kind: 'concepts',
    title: '핵심 개념',
    goal: '개념을 익힌다',
    principleIds: [],
    atomIds: ['a1'],
  };
  const atom = makeAtom({ claimId: 'a1', claim: '핵심 개념 주장', explanation: '설명입니다', evidence: '근거입니다' });
  const titles = new Map([[atom.videoId, '영상 제목']]);

  it('returns LLM prose on success (fallback=false)', async () => {
    const llm = makeMockLLM({ 'research.book.write': () => LONG_PROSE });
    const res = await writeChapter({
      chapter,
      atoms: [atom],
      excerpts: [],
      previousTitles: [],
      request: makeRequest(),
      videoTitles: titles,
      llm,
    });
    expect(res.fallback).toBe(false);
    expect(res.markdown).toBe(LONG_PROSE.trim());
  });

  it('falls back to a deterministic atom render when the LLM throws', async () => {
    const llm = makeMockLLM({}, { throwAll: true });
    const res = await writeChapter({
      chapter,
      atoms: [atom],
      excerpts: [],
      previousTitles: [],
      request: makeRequest(),
      videoTitles: titles,
      llm,
    });
    expect(res.fallback).toBe(true);
    expect(res.markdown).toContain('핵심 개념 주장');
    expect(res.markdown).toContain('설명입니다');
  });

  it('falls back when the LLM returns prose under the length floor', async () => {
    const llm = makeMockLLM({ 'research.book.write': () => '너무 짧음' });
    const res = await writeChapter({
      chapter,
      atoms: [atom],
      excerpts: [],
      previousTitles: [],
      request: makeRequest(),
      videoTitles: titles,
      llm,
    });
    expect(res.fallback).toBe(true);
  });
});

describe('renderChapterFallback', () => {
  it('renders every atom with a sourced link and no truncation', () => {
    const longClaim = '이 주장은 60자를 훌쩍 넘겨 원형이 유지되는지 확인하기 위한 긴 문장으로 절대로 잘려서는 안 된다는 회귀 케이스';
    const atom = makeAtom({ claimId: 'a1', claim: longClaim, startSeconds: 100 });
    const md = renderChapterFallback(
      { chapterId: 'c', kind: 'cases', title: '사례', goal: '배운다', principleIds: [], atomIds: ['a1'] },
      [atom],
      new Map([[atom.videoId, '영상']]),
    );
    expect(md).toContain(longClaim);
    expect(md).toContain('[영상 (1:40)]');
  });

  it('renders a graceful note when a chapter has no atoms', () => {
    const md = renderChapterFallback(
      { chapterId: 'c', kind: 'overview', title: '개요', goal: '지도', principleIds: [], atomIds: [] },
      [],
      new Map(),
    );
    expect(md).toMatch(/부록의 주장 표/);
  });
});

// ---------------------------------------------------------------------------
// ASSEMBLE (pure)
// ---------------------------------------------------------------------------

describe('renderPreface', () => {
  it('emits the topic H1, a "read me" section, and the chapter map', () => {
    const outline: BookOutline = {
      chapters: [
        { chapterId: 'c1', kind: 'overview', title: '전체 개요', goal: '지도', principleIds: [], atomIds: [] },
        { chapterId: 'c2', kind: 'apply', title: '실전 적용', goal: '실행', principleIds: [], atomIds: [] },
      ],
    };
    const md = renderPreface(outline, makeRequest());
    expect(md.startsWith('# 유튜브 콘텐츠 전략')).toBe(true);
    expect(md).toContain('서문 — 이 책을 읽는 법');
    expect(md).toContain('전체 지도');
    expect(md).toContain('전체 개요');
    expect(md).toContain('실전 적용');
  });
});

describe('assembleBook', () => {
  const outline: BookOutline = {
    chapters: [
      { chapterId: 'c1', kind: 'overview', title: '전체 개요', goal: '지도', principleIds: [], atomIds: [] },
      { chapterId: 'c2', kind: 'concepts', title: '핵심 개념', goal: '개념', principleIds: [], atomIds: [] },
      { chapterId: 'c3', kind: 'glossary', title: '용어집', goal: '정리', principleIds: [], atomIds: [] },
    ],
  };

  it('orders preface → chapters (in outline order) → appendix', () => {
    const chapters = new Map<string, string>([
      ['c1', '개요 본문'],
      ['c2', '개념 본문'],
      ['c3', '용어 본문'],
    ]);
    const book = assembleBook({
      outline,
      request: makeRequest(),
      chapters,
      appendixMarkdown: '## 부록 — 신뢰성 근거\n내용',
    });
    const iPreface = book.indexOf('서문 — 이 책을 읽는 법');
    const iC1 = book.indexOf('## 1. 전체 개요');
    const iC2 = book.indexOf('## 2. 핵심 개념');
    const iC3 = book.indexOf('## 3. 용어집');
    const iAppendix = book.indexOf('부록 — 신뢰성 근거');
    expect(iPreface).toBeGreaterThanOrEqual(0);
    expect(iPreface).toBeLessThan(iC1);
    expect(iC1).toBeLessThan(iC2);
    expect(iC2).toBeLessThan(iC3);
    expect(iC3).toBeLessThan(iAppendix);
    expect(book).toContain('개요 본문');
    expect(book).toContain('용어 본문');
  });

  it('renders a placeholder for a chapter missing from the map', () => {
    const chapters = new Map<string, string>([['c1', '개요 본문']]);
    const book = assembleBook({ outline, request: makeRequest(), chapters, appendixMarkdown: '' });
    expect(book).toContain('이 챕터는 생성되지 않았습니다');
  });

  it('embeds a failed chapter\'s deterministic fallback body verbatim', () => {
    const atom = makeAtom({ claimId: 'a1', claim: '폴백된 주장 문장' });
    const fallbackBody = renderChapterFallback(outline.chapters[1], [atom], new Map([[atom.videoId, 'V']]));
    const chapters = new Map<string, string>([
      ['c1', '개요 본문'],
      ['c2', fallbackBody],
      ['c3', '용어 본문'],
    ]);
    const book = assembleBook({ outline, request: makeRequest(), chapters, appendixMarkdown: '' });
    expect(book).toContain('폴백된 주장 문장');
  });
});

// ---------------------------------------------------------------------------
// Appendix no-truncation regression (§12-A: 60자 초과 주장 원형 유지)
// ---------------------------------------------------------------------------

describe('renderAppendixMarkdown — no truncation', () => {
  it('keeps a >60-char principle statement intact in the claims table', () => {
    const longStatement =
      '에이전트 프레임워크는 사전 정의된 아키텍처와 도구 통합과 상태 관리 레이어를 한데 묶어 개발을 크게 단순화한다는 공통 원칙';
    expect(longStatement.length).toBeGreaterThan(60);
    const report = {
      runId: 'r1',
      topic: 't',
      researchPurpose: 'LEARNING',
      researchQuestion: null,
      outputLanguage: 'ko',
      generatedAt: '2025-07-01T00:00:00Z',
      executiveSummary: [],
      methodology: {
        candidateCount: 100,
        analyzedCount: 12,
        skippedNoTranscript: [],
        refillUsed: 0,
        marketBreakdown: { KR: 6, US: 6 },
        queriesUsed: 12,
      },
      keyConcepts: [],
      unifiedTheory: null,
      commonClaims: [
        {
          id: 'p1',
          statement: longStatement,
          kind: 'common',
          mentionVideoCount: 3,
          independentChannelCount: 3,
          representativeSources: [],
          evidenceQuality: 'strong',
          counterClaims: [],
          applicabilityConditions: [],
          verificationStatus: 'SUPPORTED',
          atomIds: ['a1'],
        },
      ],
      conflictClaims: [],
      krUsDifferences: [],
      verification: { byStatus: { SUPPORTED: 1 }, notes: [] },
      videoSources: [],
      limitations: [],
      furtherQuestions: [],
    } as unknown as SynthesisReport;
    const md = renderAppendixMarkdown(report);
    expect(md).toContain('부록 — 신뢰성 근거');
    expect(md).toContain(longStatement); // full statement, not cut at 60
  });
});
