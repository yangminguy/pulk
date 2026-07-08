// 영상룸 회고(video-room-retro) 룰 단위테스트.
import {
  buildVideoRoomRetroCards,
  VIDEO_ROOM_RETRO_TARGET_ID,
  VIDEO_ROOM_RETRO_REPO_PATH,
} from '../video-room-retro';

const NOW = '2026-06-12T12:00:00.000Z';

function baseInput() {
  return {
    project: { id: 'proj-1', title: '테스트 영상', status: 'completed' },
    gates: [],
    messages: [],
    cards: [],
  };
}

describe('buildVideoRoomRetroCards', () => {
  it('빈/깨진 입력이면 빈 배열 (never-throw)', () => {
    expect(buildVideoRoomRetroCards(null)).toEqual([]);
    expect(buildVideoRoomRetroCards(undefined)).toEqual([]);
    expect(buildVideoRoomRetroCards({ project: { id: '' }, gates: [], messages: [], cards: [] })).toEqual([]);
    expect(buildVideoRoomRetroCards(baseInput(), { now: NOW })).toEqual([]);
  });

  it('rejected/needs_revision 게이트 → gate-rework 카드 (gate_type별 1장, 2회 이상이면 high)', () => {
    const input = {
      ...baseInput(),
      gates: [
        { gate_type: 'script_approval', status: 'needs_revision', createdAt: NOW, decided_at: NOW },
        { gate_type: 'script_approval', status: 'rejected', createdAt: NOW, decided_at: NOW },
        { gate_type: 'upload_approval', status: 'approved', createdAt: NOW, decided_at: NOW },
      ],
    };
    const cards = buildVideoRoomRetroCards(input, { now: NOW });
    expect(cards).toHaveLength(1);
    expect(cards[0].candidate_id).toBe('videoroom-retro:proj-1:gate-rework:script_approval');
    expect(cards[0].impact).toBe('high');
    expect(cards[0].executive).toBe('CTO');
    expect(cards[0].target_id).toBe(VIDEO_ROOM_RETRO_TARGET_ID);
    expect(cards[0].repo_path).toBe(VIDEO_ROOM_RETRO_REPO_PATH);
    expect(cards[0].risk_level).toBe('D1');
  });

  it('게이트 결정까지 stallHours 초과 → gate-stall 카드', () => {
    const input = {
      ...baseInput(),
      gates: [
        {
          gate_type: 'video_qa_approval',
          status: 'approved',
          createdAt: '2026-06-10T00:00:00.000Z',
          decided_at: '2026-06-11T12:00:00.000Z', // 36h
        },
      ],
    };
    const cards = buildVideoRoomRetroCards(input, { now: NOW, stallHours: 24 });
    expect(cards).toHaveLength(1);
    expect(cards[0].candidate_id).toBe('videoroom-retro:proj-1:gate-stall:video_qa_approval');
    expect(cards[0].problem).toContain('36시간');
  });

  it('미결정 pending 게이트도 now 기준으로 병목 판정', () => {
    const input = {
      ...baseInput(),
      gates: [
        { gate_type: 'hook_draft_approval', status: 'pending', createdAt: '2026-06-10T00:00:00.000Z', decided_at: null },
      ],
    };
    const cards = buildVideoRoomRetroCards(input, { now: NOW, stallHours: 24 });
    expect(cards.map(c => c.candidate_id)).toContain('videoroom-retro:proj-1:gate-stall:hook_draft_approval');
  });

  it('QA 카드 checks 중 pass가 아닌 항목 → qa-fail 카드 (high impact)', () => {
    const input = {
      ...baseInput(),
      cards: [
        {
          stage: 'qa',
          data: { checks: { audio_sync: 'pass', slide_readability: 'fail' }, overall_status: 'fail' },
        },
      ],
    };
    const cards = buildVideoRoomRetroCards(input, { now: NOW });
    expect(cards).toHaveLength(1);
    expect(cards[0].candidate_id).toBe('videoroom-retro:proj-1:qa-fail:slide_readability');
    expect(cards[0].impact).toBe('high');
  });

  it('QA 카드 data가 JSON 문자열이어도 파싱한다', () => {
    const input = {
      ...baseInput(),
      cards: [{ stage: 'qa', data: JSON.stringify({ checks: { render: 'error' } }) }],
    };
    const cards = buildVideoRoomRetroCards(input, { now: NOW });
    expect(cards).toHaveLength(1);
    expect(cards[0].candidate_id).toBe('videoroom-retro:proj-1:qa-fail:render');
  });

  it('cmo 메시지의 오류 키워드 → message-error 카드 (키워드별 1장, founder 발화는 무시)', () => {
    const input = {
      ...baseInput(),
      messages: [
        { role: 'cmo', text: '렌더 작업이 실패했습니다. 재시도합니다.' },
        { role: 'cmo', text: '또 실패했어요.' },
        { role: 'founder', text: '이거 오류 아니야?' }, // founder 발화는 신호 아님
      ],
    };
    const cards = buildVideoRoomRetroCards(input, { now: NOW });
    const ids = cards.map(c => c.candidate_id);
    expect(ids).toContain('videoroom-retro:proj-1:message-error:실패');
    expect(ids.filter(id => id.includes('message-error:실패'))).toHaveLength(1);
    expect(ids.some(id => id.includes('founder'))).toBe(false);
  });

  it('정렬(impact desc→confidence desc)과 maxCards 상한을 지킨다', () => {
    const input = {
      ...baseInput(),
      gates: [
        { gate_type: 'a', status: 'rejected', createdAt: NOW, decided_at: NOW },
        { gate_type: 'b', status: 'needs_revision', createdAt: NOW, decided_at: NOW },
      ],
      cards: [{ stage: 'qa', data: { checks: { c1: 'fail', c2: 'fail', c3: 'fail' } } }],
      messages: [{ role: 'cmo', text: 'timeout 발생' }],
    };
    const cards = buildVideoRoomRetroCards(input, { now: NOW, maxCards: 3 });
    expect(cards).toHaveLength(3);
    // high(qa-fail)들이 medium(gate-rework 1회, message-error)보다 앞.
    expect(cards.every(c => c.impact === 'high')).toBe(true);
  });
});
