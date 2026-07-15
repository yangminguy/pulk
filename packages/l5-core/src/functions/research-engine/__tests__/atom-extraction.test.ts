import {
  buildAtom,
  buildAtomExtractionPrompt,
  extractAtomsForVideo,
  parseAtomsResponse,
  segmentsInRange,
  verifyAtomAnchor,
  verifyChunkIntegrity,
} from '../atom-extraction';
import { ResearchParseError, type Transcript } from '../types';
import { buildTranscript, genLargeTexts, makeMockLLM } from '../__fixtures__';
import type { AtomExtractionContext as Ctx } from '../atom-extraction';

const CTX: Ctx = {
  videoId: 'vid1',
  channelId: 'ch1',
  market: 'KR',
  transcriptSource: 'manual',
  runId: 'r1',
};

describe('verifyChunkIntegrity — full preservation on 12k and 50k transcripts', () => {
  for (const total of [12_000, 50_000]) {
    it(`preserves the full transcript across chunks (${total} chars)`, () => {
      const texts = genLargeTexts(total);
      const t = buildTranscript({ texts, chunkChars: 7000, videoId: 'big' });
      // sanity: fixture actually exceeds the target size
      expect(t.charCount).toBeGreaterThanOrEqual(total);
      expect(t.chunks.length).toBeGreaterThan(1);

      const report = verifyChunkIntegrity(t);
      expect(report.issues).toEqual([]);
      expect(report.ok).toBe(true);

      // chunk text concatenation == original transcript text (no loss/gap)
      const rejoined = t.chunks.map((c) => c.text).join('');
      expect(rejoined).toBe(t.text);

      // contiguous segment coverage, boundaries preserved
      expect(t.chunks[0].segmentStartIndex).toBe(0);
      expect(t.chunks[t.chunks.length - 1].segmentEndIndex).toBe(t.segments.length - 1);
      for (let i = 1; i < t.chunks.length; i++) {
        expect(t.chunks[i].segmentStartIndex).toBe(t.chunks[i - 1].segmentEndIndex + 1);
      }
    });
  }

  it('flags a chunk whose text no longer matches its segment range', () => {
    const t = buildTranscript();
    t.chunks[0].text = t.chunks[0].text + 'TAMPERED';
    const report = verifyChunkIntegrity(t);
    expect(report.ok).toBe(false);
    expect(report.issues.join(' ')).toMatch(/text != joined segments/);
  });

  it('flags a gap between chunks', () => {
    const texts = genLargeTexts(20_000);
    const t = buildTranscript({ texts, chunkChars: 4000 });
    // introduce a gap: skip a segment between chunk 0 and 1
    t.chunks[1].segmentStartIndex = t.chunks[0].segmentEndIndex + 2;
    const report = verifyChunkIntegrity(t);
    expect(report.ok).toBe(false);
    expect(report.issues.join(' ')).toMatch(/gap\/overlap/);
  });
});

// The real vendor skill joins segments with a single space for `transcript.text`
// AND for each `chunk.text`, so concatenating chunk texts drops the inter-segment
// space at every chunk boundary. That is an equivalence, not corruption — the
// integrity check must not flag it (it did on every live video before the fix).
describe('verifyChunkIntegrity — real skill shape (boundary space lost on concat)', () => {
  /** Rebuild a transcript the way the vendor skill emits it: space-joined text
   * and space-joined chunk text, with segments that carry no trailing space. */
  function skillShaped(texts: string[], chunkChars: number): Transcript {
    const base = buildTranscript({ texts, chunkChars, videoId: 'skill' });
    const segs = base.segments; // segment.text === raw text (no trailing space)
    const text = segs.map((s) => s.text).join(' ');
    const chunks = base.chunks.map((c) => {
      const range = segs.slice(c.segmentStartIndex, c.segmentEndIndex + 1);
      const joined = range.map((s) => s.text).join(' ');
      return { ...c, text: joined, charCount: joined.length };
    });
    return { ...base, text, chunks, charCount: text.length };
  }

  it('accepts a multi-chunk skill transcript whose chunk concat is 1 space/boundary short', () => {
    // No trailing spaces → the skill shape. Small chunk target → several chunks.
    const texts = Array.from({ length: 30 }, (_, i) => `세그먼트${i} 핵심 내용입니다`);
    const t = skillShaped(texts, 40);
    expect(t.chunks.length).toBeGreaterThan(1);

    // Reproduce the live symptom: concatenating chunk texts is exactly
    // (chunkCount - 1) chars shorter than transcript.text (one lost boundary space).
    const concat = t.chunks.map((c) => c.text).join('');
    expect(concat.length).toBe(t.text.length - (t.chunks.length - 1));
    expect(concat).not.toBe(t.text);

    // ...yet nothing is actually lost, so integrity must pass.
    const report = verifyChunkIntegrity(t);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('still catches genuine middle-content loss (not just boundary whitespace)', () => {
    const texts = Array.from({ length: 20 }, (_, i) => `세그먼트${i} 핵심 내용입니다`);
    const t = skillShaped(texts, 40);
    // Drop a whole word out of the middle of transcript.text — real content loss.
    t.text = t.text.replace('핵심 내용입니다', '');
    const report = verifyChunkIntegrity(t);
    expect(report.ok).toBe(false);
    expect(report.issues).toContain('segment concatenation does not equal transcript.text');
  });

  it('still catches middle-content loss inside a chunk', () => {
    const texts = Array.from({ length: 20 }, (_, i) => `세그먼트${i} 핵심 내용입니다`);
    const t = skillShaped(texts, 40);
    // Remove real words from a chunk's text (a dropped segment would look like this).
    t.chunks[1].text = t.chunks[1].text.replace(/세그먼트\d+/, '');
    const report = verifyChunkIntegrity(t);
    expect(report.ok).toBe(false);
    expect(report.issues.join(' ')).toMatch(/text != joined segments/);
  });
});

describe('verifyAtomAnchor', () => {
  const segments = buildTranscript({
    texts: ['섬네일 클릭률이 조회수를 좌우한다는 점이 핵심이다. ', '제목 키워드도 노출에 영향을 준다. '],
  }).segments;

  it('passes when claim vocabulary appears in the cited segment range', () => {
    expect(verifyAtomAnchor('섬네일 클릭률이 조회수를 결정', '섬네일 클릭률', segments, 0, 5)).toBe(true);
  });

  it('fails (TRANSCRIPT_AMBIGUOUS) when the claim vocabulary is absent', () => {
    expect(verifyAtomAnchor('구독 전환율이 매출을 좌우한다', '결제 퍼널', segments, 0, 5)).toBe(false);
  });

  it('fails when no segment overlaps the range', () => {
    expect(verifyAtomAnchor('섬네일', '섬네일', segments, 999, 1000)).toBe(false);
  });
});

describe('segmentsInRange', () => {
  it('returns segments overlapping the window', () => {
    const t = buildTranscript({ texts: ['a. ', 'b. ', 'c. '] });
    // segment 1 spans 5..10s; window 6..9 overlaps only it
    const inRange = segmentsInRange(t.segments, 6, 9);
    expect(inRange.map((s) => s.index)).toEqual([1]);
  });
});

describe('parseAtomsResponse (strict, LLM-free)', () => {
  it('parses a well-formed object, tolerating a code fence', () => {
    const raw = '```json\n{"atoms":[{"claim":"c","claimType":"framework","evidence":"e","startSeconds":1,"endSeconds":3,"confidence":0.9}]}\n```';
    const atoms = parseAtomsResponse(raw);
    expect(atoms).toHaveLength(1);
    expect(atoms[0].claimType).toBe('framework');
  });

  it('throws ResearchParseError on non-JSON', () => {
    expect(() => parseAtomsResponse('not json at all')).toThrow(ResearchParseError);
  });

  it('throws when "atoms" is not an array', () => {
    expect(() => parseAtomsResponse('{"atoms":"nope"}')).toThrow(ResearchParseError);
  });

  it('throws when an atom has invalid timestamps', () => {
    expect(() =>
      parseAtomsResponse('{"atoms":[{"claim":"c","startSeconds":10,"endSeconds":2}]}'),
    ).toThrow(/startSeconds\/endSeconds/);
  });

  it('normalizes an unknown claimType to "opinion" and a 0-100 confidence to 0-1', () => {
    const atoms = parseAtomsResponse('{"atoms":[{"claim":"c","claimType":"weird","startSeconds":0,"endSeconds":1,"confidence":80}]}');
    expect(atoms[0].claimType).toBe('opinion');
    expect(atoms[0].confidence).toBeCloseTo(0.8, 5);
  });
});

describe('buildAtom', () => {
  const t = buildTranscript({ texts: ['섬네일 클릭률이 조회수를 결정한다. '] });
  it('anchors a supported atom (UNVERIFIED) and builds a t= deep link', () => {
    const atom = buildAtom(
      { claim: '섬네일 클릭률이 조회수를 결정', claimType: 'causal_claim', explanation: '', evidence: '섬네일 클릭률', startSeconds: 0, endSeconds: 5, confidence: 0.8 },
      t.segments,
      CTX,
      0,
    );
    expect(atom.verificationStatus).toBe('UNVERIFIED');
    expect(atom.claimId).toBe('run-r1-vid1-0');
    expect(atom.sourceUrl).toBe('https://www.youtube.com/watch?v=vid1&t=0s');
  });

  it('downgrades an unanchored atom to TRANSCRIPT_AMBIGUOUS', () => {
    const atom = buildAtom(
      { claim: '전혀 다른 주제 매출 전환', claimType: 'opinion', explanation: '', evidence: '결제', startSeconds: 0, endSeconds: 5, confidence: 0.5 },
      t.segments,
      CTX,
      1,
    );
    expect(atom.verificationStatus).toBe('TRANSCRIPT_AMBIGUOUS');
  });
});

describe('buildAtomExtractionPrompt', () => {
  it('includes the chunk text and segment index hint', () => {
    const t = buildTranscript();
    const { system, user } = buildAtomExtractionPrompt(t.chunks[0], CTX);
    expect(system).toMatch(/Knowledge Atom/);
    expect(user).toContain(t.chunks[0].text);
    expect(user).toMatch(/index 0/);
  });

  it('forces claim/explanation into outputLanguage while keeping evidence 원어 (§12-A)', () => {
    const t = buildTranscript();
    const ko = buildAtomExtractionPrompt(t.chunks[0], { ...CTX, outputLanguage: 'ko' });
    expect(ko.system).toMatch(/claim과 explanation은 반드시 한국어로 작성/);
    expect(ko.system).toMatch(/evidence는 원문 그대로 인용/);

    const en = buildAtomExtractionPrompt(t.chunks[0], { ...CTX, outputLanguage: 'en' });
    expect(en.system).toMatch(/영어\(English\)로 작성/);
  });

  it('defaults the claim/explanation language to Korean when unset', () => {
    const t = buildTranscript();
    const { system } = buildAtomExtractionPrompt(t.chunks[0], CTX);
    expect(system).toMatch(/한국어로 작성/);
  });
});

describe('extractAtomsForVideo', () => {
  // 4 segments + a small chunk target → 2 chunks (exercises multi-chunk paths).
  const transcript = buildTranscript({
    texts: ['섬네일이 조회수를 결정한다. ', '제목이 클릭률을 좌우한다. ', '업로드 주기가 중요하다. ', '길이도 유지율에 영향. '],
    chunkChars: 10,
  });

  it('assigns per-chunk chunkIndex and sequential claimIds', async () => {
    const llm = makeMockLLM({
      'research.extractAtoms': () =>
        '{"atoms":[{"claim":"섬네일이 조회수를 결정","claimType":"causal_claim","evidence":"섬네일","startSeconds":0,"endSeconds":5,"confidence":0.7}]}',
    });
    const atoms = await extractAtomsForVideo({ transcript, llm, ctx: CTX });
    expect(atoms.length).toBe(transcript.chunks.length);
    expect(atoms[0].claimId).toBe('run-r1-vid1-0');
    expect(atoms[0].chunkIndex).toBe(0);
  });

  it('skips a chunk whose output is malformed but keeps the video going', async () => {
    let call = 0;
    const llm = makeMockLLM({
      'research.extractAtoms': () => {
        call += 1;
        return call === 1
          ? 'garbage'
          : '{"atoms":[{"claim":"제목이 클릭률을 좌우","claimType":"causal_claim","evidence":"제목","startSeconds":5,"endSeconds":10,"confidence":0.6}]}';
      },
    });
    const atoms = await extractAtomsForVideo({ transcript, llm, ctx: CTX });
    // first chunk skipped (garbage), later chunk(s) produce atoms
    expect(atoms.length).toBeGreaterThan(0);
  });

  it('propagates an LLM transport error (resume checkpoint)', async () => {
    const llm = makeMockLLM({}, { throwAll: true });
    await expect(extractAtomsForVideo({ transcript, llm, ctx: CTX })).rejects.toThrow();
  });
});
