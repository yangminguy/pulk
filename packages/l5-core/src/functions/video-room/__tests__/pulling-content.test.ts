import {
  createPullingContentPlan,
  createPullingContentSet,
  approvePullingContentSet,
  requestPullingRevision,
  buildKeyContentSet,
} from '../pulling-content';
import type { PullingContentPlan } from '../types';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makePlan(order: 1 | 2 | 3 | 4 | 5): PullingContentPlan {
  const roles: PullingContentPlan['role'][] = [
    '문제 인식',
    '문제 심화',
    '욕구 형성',
    '계획 진입',
    '키 콘텐츠 브릿지',
  ];
  return createPullingContentPlan({
    id: `plan-${order}`,
    order,
    role: roles[order - 1],
    consumer_stage: '현상',
    title: `풀링 콘텐츠 ${order}`,
    purpose: `목적 ${order}`,
    bridge_to_key: `키 콘텐츠 연결 ${order}`,
  });
}

function makeAllFivePlans(): PullingContentPlan[] {
  return ([1, 2, 3, 4, 5] as const).map(makePlan);
}

// ── createPullingContentPlan ────────────────────────────────────────────────

describe('createPullingContentPlan', () => {
  it('creates a valid plan', () => {
    const plan = makePlan(1);
    expect(plan.id).toBe('plan-1');
    expect(plan.order).toBe(1);
    expect(plan.role).toBe('문제 인식');
    expect(plan.bridge_to_key).toBe('키 콘텐츠 연결 1');
  });

  it('throws when bridge_to_key is empty', () => {
    expect(() =>
      createPullingContentPlan({
        id: 'p1',
        order: 1,
        role: '문제 인식',
        consumer_stage: '현상',
        title: '제목',
        purpose: '목적',
        bridge_to_key: '',
      }),
    ).toThrow('bridge_to_key');
  });

  it('throws when title is empty', () => {
    expect(() =>
      createPullingContentPlan({
        id: 'p1',
        order: 1,
        role: '문제 인식',
        consumer_stage: '현상',
        title: '  ',
        purpose: '목적',
        bridge_to_key: '브릿지',
      }),
    ).toThrow('title');
  });
});

// ── createPullingContentSet ─────────────────────────────────────────────────

describe('createPullingContentSet', () => {
  const baseInput = {
    id: 'set-1',
    key_content_id: 'key-1',
    set_logic: '현상→욕구→계획 퍼널 구조',
    funnel_coverage: {
      phenomenon: ['p1', 'p2'],
      desire: ['d1'],
      plan: ['pl1'],
      action_bridge: 'bridge',
    },
  };

  it('creates a valid set with 5 plans, approval_status defaults to draft', () => {
    const set = createPullingContentSet({ ...baseInput, pulling_contents: makeAllFivePlans() });
    expect(set.id).toBe('set-1');
    expect(set.pulling_contents).toHaveLength(5);
    expect(set.approval_status).toBe('draft');
  });

  it('throws when pulling_contents length is not 5', () => {
    const fourPlans = makeAllFivePlans().slice(0, 4);
    expect(() =>
      createPullingContentSet({ ...baseInput, pulling_contents: fourPlans }),
    ).toThrow('exactly 5');
  });

  it('throws when orders are not 1–5 each once', () => {
    const badPlans = makeAllFivePlans();
    // duplicate order 1, skip 5
    const dup: PullingContentPlan = { ...badPlans[4], order: 1 };
    const plans = [...badPlans.slice(0, 4), dup];
    expect(() =>
      createPullingContentSet({ ...baseInput, pulling_contents: plans }),
    ).toThrow('orders');
  });

  it('throws when a plan has empty bridge_to_key', () => {
    const plans = makeAllFivePlans();
    const noBridge: PullingContentPlan = { ...plans[0], bridge_to_key: '' };
    const modified = [noBridge, ...plans.slice(1)];
    expect(() =>
      createPullingContentSet({ ...baseInput, pulling_contents: modified }),
    ).toThrow('bridge_to_key');
  });
});

// ── approvePullingContentSet / requestPullingRevision ───────────────────────

describe('approvePullingContentSet', () => {
  it('transitions to approved', () => {
    const set = createPullingContentSet({
      id: 's1',
      key_content_id: 'k1',
      pulling_contents: makeAllFivePlans(),
      set_logic: 'logic',
      funnel_coverage: { phenomenon: [], desire: [], plan: [], action_bridge: 'b' },
    });
    expect(approvePullingContentSet(set).approval_status).toBe('approved');
  });
});

describe('requestPullingRevision', () => {
  it('transitions to needs_revision', () => {
    const set = createPullingContentSet({
      id: 's1',
      key_content_id: 'k1',
      pulling_contents: makeAllFivePlans(),
      set_logic: 'logic',
      funnel_coverage: { phenomenon: [], desire: [], plan: [], action_bridge: 'b' },
    });
    expect(requestPullingRevision(set).approval_status).toBe('needs_revision');
  });
});

// ── buildKeyContentSet ──────────────────────────────────────────────────────

describe('buildKeyContentSet', () => {
  const baseInput = {
    id: 'kcs-1',
    video_project_id: 'vp-1',
    product: 'AI 마케팅팀',
    target_audience: '작은 브랜드 대표',
    selected_key_content_id: 'key-1',
    pulling_content_ids: ['p1', 'p2', 'p3', 'p4', 'p5'],
    funnel_logic: '현상→욕구→계획→키콘텐츠',
  };

  it('creates a valid KeyContentSet', () => {
    const kcs = buildKeyContentSet(baseInput);
    expect(kcs.id).toBe('kcs-1');
    expect(kcs.pulling_content_ids).toHaveLength(5);
    expect(kcs.approval_status).toBe('draft');
  });

  it('throws when pulling_content_ids length is not 5', () => {
    expect(() =>
      buildKeyContentSet({ ...baseInput, pulling_content_ids: ['p1', 'p2', 'p3'] }),
    ).toThrow('exactly 5');
  });

  it('throws when selected_key_content_id is empty', () => {
    expect(() =>
      buildKeyContentSet({ ...baseInput, selected_key_content_id: '' }),
    ).toThrow('selected_key_content_id');
  });
});
