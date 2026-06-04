import {
  VIDEO_ROOM_FLOW,
  pageForStatus,
  requiresApproval,
  nextStatus,
  advanceStatus,
  buildMiniRoadmap,
  GATE_BY_STATUS,
} from '../state-machine';

describe('Video Room state machine', () => {
  it('flow covers all 24 happy-path statuses ending at completed', () => {
    expect(VIDEO_ROOM_FLOW[0]).toBe('strategy_chat');
    expect(VIDEO_ROOM_FLOW[VIDEO_ROOM_FLOW.length - 1]).toBe('completed');
    expect(new Set(VIDEO_ROOM_FLOW).size).toBe(VIDEO_ROOM_FLOW.length);
  });

  it('maps statuses to the owning page (PRD §11)', () => {
    expect(pageForStatus('strategy_chat')).toBe('strategy');
    expect(pageForStatus('hook_draft_approval')).toBe('strategy');
    expect(pageForStatus('script_planning')).toBe('production');
    expect(pageForStatus('rendering')).toBe('production');
    expect(pageForStatus('qa')).toBe('review_publish');
    expect(pageForStatus('completed')).toBe('review_publish');
  });

  it('flags the six approval gates', () => {
    const gates = Object.keys(GATE_BY_STATUS);
    expect(gates).toHaveLength(6);
    expect(requiresApproval('key_content_approval')).toBe(true);
    expect(requiresApproval('upload_approval')).toBe(true);
    expect(requiresApproval('strategy_chat')).toBe(false);
  });

  it('nextStatus walks the flow and stops at completed', () => {
    expect(nextStatus('strategy_chat')).toBe('business_pt_context_loading');
    expect(nextStatus('completed')).toBeNull();
  });

  it('advanceStatus blocks on an unapproved gate but allows it once approved', () => {
    expect(() => advanceStatus('key_content_approval')).toThrow(/approval/);
    expect(advanceStatus('key_content_approval', { gateApproved: true })).toBe(
      'viewtrap_pulling_research',
    );
    expect(advanceStatus('product_defined')).toBe('key_content_ideation');
  });

  it('mini roadmap marks done/active/pending around the current status', () => {
    const road = buildMiniRoadmap('viewtrap_key_research');
    const byKey = Object.fromEntries(road.map((n) => [n.key, n.state]));
    expect(byKey.pt_context).toBe('done');
    expect(byKey.product).toBe('done');
    expect(byKey.viewtrap_key).toBe('active');
    expect(byKey.upload).toBe('pending');

    const done = buildMiniRoadmap('completed');
    expect(done.every((n) => n.state === 'done')).toBe(true);
  });
});
