import { transformToFounderVoice, type VoiceSource, type FounderVoiceProfile } from '../founder-voice';
import type { IntegratedScript } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeScript = (overrides: Partial<IntegratedScript> = {}): IntegratedScript => ({
  full_script: '이것은 테스트 스크립트입니다. 고객이 문제를 겪고 있습니다. 따라서 해결책이 필요합니다.',
  section_map: ['block_intro', 'block_problem', 'block_solution'],
  removed_repetition: [],
  added_transitions: [],
  strategy_alignment_notes: [],
  ...overrides,
});

const voiceSource: VoiceSource = {
  source_id: 'src_001',
  title: '파운더 원고 샘플',
  sample_phrases: ['짧게 말해요.', '핵심만 전달해요.'],
  style_traits: ['짧은 문장', '직설적'],
};

// ── Case 1: preserved_logic is always true ─────────────────────────────────

describe('preserved_logic', () => {
  it('is always true regardless of input', () => {
    const result = transformToFounderVoice({
      script: makeScript(),
      voiceSources: [voiceSource],
    });
    expect(result.preserved_logic).toBe(true);
  });

  it('is true even when voiceSources is empty', () => {
    const result = transformToFounderVoice({
      script: makeScript(),
      voiceSources: [],
    });
    expect(result.preserved_logic).toBe(true);
  });
});

// ── Case 2: changed_phrases records before/after ───────────────────────────

describe('changed_phrases', () => {
  it('records changed sentences as "before → after" strings', () => {
    const script = makeScript({
      full_script: '이것은 테스트 스크립트입니다. 따라서 중요합니다.',
    });
    const result = transformToFounderVoice({ script, voiceSources: [voiceSource] });

    // At least one phrase should be recorded
    expect(result.changed_phrases.length).toBeGreaterThan(0);

    // Each entry should be in the "X → Y" format
    for (const entry of result.changed_phrases) {
      expect(entry).toMatch(/→/);
    }
  });

  it('contains the original and transformed phrase text', () => {
    const script = makeScript({ full_script: '핵심 내용입니다.' });
    const result = transformToFounderVoice({ script, voiceSources: [voiceSource] });

    // "입니다" → "예요" should appear
    const hasChange = result.changed_phrases.some(
      (p) => p.includes('입니다') && p.includes('예요'),
    );
    expect(hasChange).toBe(true);
  });
});

// ── Case 3: graceful fallback when no voice sources ───────────────────────

describe('graceful fallback (no voice sources)', () => {
  it('returns full_script unchanged when voiceSources is empty and no voiceProfile given', () => {
    const originalScript = '이것은 원문 스크립트입니다. 변경되지 않아야 합니다.';
    const result = transformToFounderVoice({
      script: makeScript({ full_script: originalScript }),
      voiceSources: [],
    });
    expect(result.full_script).toBe(originalScript);
    expect(result.changed_phrases).toEqual([]);
  });

  it('still sets voice_profile_used even with no sources', () => {
    const result = transformToFounderVoice({
      script: makeScript(),
      voiceSources: [],
    });
    expect(result.voice_profile_used).toBeDefined();
  });
});

// ── Case 4: logic block (section_map) order is preserved ──────────────────

describe('section_map / logic block order preserved', () => {
  it('section_map in output script has same block order as input', () => {
    const blockOrder = ['block_intro', 'block_problem', 'block_solution', 'block_cta'];

    // Embed block markers into the full_script so we can verify sequence
    const full_script = blockOrder
      .map((id) => `[${id}] 이 블록은 중요합니다.`)
      .join('\n');

    const script = makeScript({ full_script, section_map: blockOrder });

    const result = transformToFounderVoice({ script, voiceSources: [voiceSource] });

    // The section_map is not mutated — it is a structural contract
    // (transformToFounderVoice works on full_script only, never reorders blocks)
    const indices = blockOrder.map((id) => result.full_script.indexOf(`[${id}]`));
    for (let i = 0; i < indices.length - 1; i++) {
      expect(indices[i]).toBeLessThan(indices[i + 1]);
    }
  });

  it('does not drop any logic block marker from full_script', () => {
    const blockOrder = ['block_hook', 'block_evidence', 'block_close'];
    const full_script = blockOrder.map((id) => `[${id}] 설명입니다.`).join('\n');
    const script = makeScript({ full_script, section_map: blockOrder });

    const result = transformToFounderVoice({ script, voiceSources: [voiceSource] });

    for (const id of blockOrder) {
      expect(result.full_script).toContain(`[${id}]`);
    }
  });
});

// ── Case 5: caller-provided voiceProfile takes precedence ─────────────────

describe('caller-provided voiceProfile', () => {
  it('uses the caller profile over derived one from voiceSources', () => {
    const callerProfile: FounderVoiceProfile = {
      style_traits: ['직설적'],
      sample_phrases: ['바로 말해요.'],
      source_ids: ['custom_src'],
    };

    const result = transformToFounderVoice({
      script: makeScript({ full_script: '이것은 예시입니다.' }),
      voiceSources: [],          // no sources — profile must come from caller
      voiceProfile: callerProfile,
    });

    const used = result.voice_profile_used as unknown as FounderVoiceProfile;
    expect(used.source_ids).toContain('custom_src');
    // Style was applied (입니다 → 예요)
    expect(result.full_script).toContain('예요');
  });
});
