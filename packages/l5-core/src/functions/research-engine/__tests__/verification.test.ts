import {
  applyVerifierVerdict,
  buildVerifierPrompt,
  deriveVerificationStatus,
  indexDocsResults,
  parseVerifierResponse,
  verifyPrincipleFreshContext,
} from '../verification';
import { ResearchParseError } from '../types';
import type { StatusSignals } from '../verification';
import type { SynthesizedPrinciple } from '../types';
import { makeAtom, makeMockLLM, buildTranscript } from '../__fixtures__';

function signals(over: Partial<StatusSignals> = {}): StatusSignals {
  return {
    kind: 'common',
    mentionVideoCount: 3,
    independentChannelCount: 3,
    hasCounter: false,
    allAmbiguous: false,
    ...over,
  };
}

describe('deriveVerificationStatus', () => {
  it('TRANSCRIPT_AMBIGUOUS wins when all atoms failed their anchor', () => {
    expect(deriveVerificationStatus(signals({ allAmbiguous: true }))).toBe('TRANSCRIPT_AMBIGUOUS');
  });
  it('only official-docs confirmation yields VERIFIED (mentions never do)', () => {
    expect(deriveVerificationStatus(signals({ docsVerified: true }))).toBe('VERIFIED');
    expect(deriveVerificationStatus(signals({ mentionVideoCount: 99, independentChannelCount: 9 }))).toBe('SUPPORTED');
  });
  it('docs conflict / outdated map to CONTESTED / OUTDATED', () => {
    expect(deriveVerificationStatus(signals({ docsConflict: true }))).toBe('CONTESTED');
    expect(deriveVerificationStatus(signals({ docsOutdated: true }))).toBe('OUTDATED');
  });
  it('conflict / counter-claims → CONTESTED', () => {
    expect(deriveVerificationStatus(signals({ kind: 'conflict' }))).toBe('CONTESTED');
    expect(deriveVerificationStatus(signals({ hasCounter: true }))).toBe('CONTESTED');
  });
  it('channel-count tiers: 3+ SUPPORTED, 2 PRACTITIONER_CONSENSUS, 1 ANECDOTAL', () => {
    expect(deriveVerificationStatus(signals({ independentChannelCount: 3 }))).toBe('SUPPORTED');
    expect(deriveVerificationStatus(signals({ independentChannelCount: 2 }))).toBe('PRACTITIONER_CONSENSUS');
    expect(deriveVerificationStatus(signals({ independentChannelCount: 1 }))).toBe('ANECDOTAL');
  });
});

describe('parseVerifierResponse (strict)', () => {
  it('parses a well-formed verdict', () => {
    const v = parseVerifierResponse('{"presentInTranscript":true,"timestampAccurate":true,"opinionAsFact":false,"doubleCounted":false,"suspectAutoCaption":false,"note":"ok"}');
    expect(v.presentInTranscript).toBe(true);
    expect(v.note).toBe('ok');
  });
  it('throws when the presence flag is missing', () => {
    expect(() => parseVerifierResponse('{"note":"x"}')).toThrow(ResearchParseError);
  });
});

describe('applyVerifierVerdict', () => {
  const base = 'SUPPORTED' as const;
  it('downgrades to TRANSCRIPT_AMBIGUOUS when the claim is absent', () => {
    expect(
      applyVerifierVerdict(base, {
        presentInTranscript: false,
        timestampAccurate: false,
        opinionAsFact: false,
        doubleCounted: false,
        suspectAutoCaption: false,
        note: '',
      }),
    ).toBe('TRANSCRIPT_AMBIGUOUS');
  });
  it('downgrades to CONTESTED on opinion-as-fact or double counting', () => {
    expect(
      applyVerifierVerdict(base, {
        presentInTranscript: true,
        timestampAccurate: true,
        opinionAsFact: true,
        doubleCounted: false,
        suspectAutoCaption: false,
        note: '',
      }),
    ).toBe('CONTESTED');
  });
  it('keeps the base status when the verdict is clean', () => {
    expect(
      applyVerifierVerdict(base, {
        presentInTranscript: true,
        timestampAccurate: true,
        opinionAsFact: false,
        doubleCounted: false,
        suspectAutoCaption: false,
        note: '',
      }),
    ).toBe('SUPPORTED');
  });
});

describe('indexDocsResults', () => {
  it('keys by trimmed claim text', () => {
    const m = indexDocsResults([{ claim: ' React 18 ', status: 'VERIFIED' }]);
    expect(m.get('React 18')?.status).toBe('VERIFIED');
  });
});

describe('buildVerifierPrompt', () => {
  it('includes atoms and raw segments but not synthesis reasoning', () => {
    const principle: SynthesizedPrinciple = {
      id: 'p1',
      statement: '섬네일이 중요',
      kind: 'common',
      mentionVideoCount: 1,
      independentChannelCount: 1,
      representativeSources: [],
      evidenceQuality: 'weak',
      counterClaims: [],
      applicabilityConditions: [],
      verificationStatus: 'ANECDOTAL',
      atomIds: ['a1'],
    };
    const t = buildTranscript();
    const { user } = buildVerifierPrompt(principle, [makeAtom({ claimId: 'a1' })], t.segments);
    expect(user).toMatch(/\[아톰\]/);
    expect(user).toMatch(/\[원문 세그먼트\]/);
  });
});

describe('verifyPrincipleFreshContext', () => {
  const principle: SynthesizedPrinciple = {
    id: 'p1',
    statement: '섬네일이 중요',
    kind: 'common',
    mentionVideoCount: 2,
    independentChannelCount: 2,
    representativeSources: [],
    evidenceQuality: 'moderate',
    counterClaims: [],
    applicabilityConditions: [],
    verificationStatus: 'PRACTITIONER_CONSENSUS',
    atomIds: ['a1'],
  };
  const t = buildTranscript();

  it('applies the verifier verdict', async () => {
    const llm = makeMockLLM({
      'research.verify': () => '{"presentInTranscript":false}',
    });
    const status = await verifyPrincipleFreshContext({ principle, atoms: [makeAtom({ claimId: 'a1' })], segments: t.segments, llm });
    expect(status).toBe('TRANSCRIPT_AMBIGUOUS');
  });

  it('keeps the base status when the LLM is unavailable', async () => {
    const llm = makeMockLLM({}, { throwAll: true });
    const status = await verifyPrincipleFreshContext({ principle, atoms: [makeAtom({ claimId: 'a1' })], segments: t.segments, llm });
    expect(status).toBe('PRACTITIONER_CONSENSUS');
  });
});
