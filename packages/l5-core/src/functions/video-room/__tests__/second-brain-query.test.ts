import { secondBrainQueryForStatus } from '../second-brain-query';
import { VIDEO_ROOM_FLOW } from '../state-machine';

describe('secondBrainQueryForStatus', () => {
  it('returns a non-empty query for the first conversational status (strategy_chat)', () => {
    const q = secondBrainQueryForStatus('strategy_chat');
    expect(q).toBeTruthy();
    expect(q).toContain('비즈니스 PT');
  });

  it('covers every workflow status except the terminal completed', () => {
    for (const status of VIDEO_ROOM_FLOW) {
      const q = secondBrainQueryForStatus(status);
      if (status === 'completed') {
        expect(q).toBeNull();
      } else {
        expect(typeof q).toBe('string');
        expect((q as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('queries the previously-uncovered script / production / publish stages', () => {
    for (const status of ['script_planning', 'script_draft', 'voice_recording', 'rendering', 'upload_draft']) {
      expect(secondBrainQueryForStatus(status)).toBeTruthy();
    }
  });

  it('returns null for unknown statuses', () => {
    expect(secondBrainQueryForStatus('does_not_exist')).toBeNull();
    expect(secondBrainQueryForStatus('')).toBeNull();
  });
});
