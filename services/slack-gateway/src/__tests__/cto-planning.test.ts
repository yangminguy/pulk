// CTO structured-planning: classifier + bridge (fake pulk port, no network).

import { classifyCtoIntent } from '../router';
import {
  handleCtoPlanning,
  resolveCtoIntent,
  isPlanningThread,
  slackThreadId,
} from '../cto-planning-bridge';
import type { PulkPlanningPort, PlanMessageResult, ApprovePlanResult } from '../pulk-api';

describe('classifyCtoIntent', () => {
  it('routes explicit planning requests to plan', () => {
    expect(classifyCtoIntent('신규 결제 기능 PRD 만들어줘')).toBe('plan');
    expect(classifyCtoIntent('회원가입 개선 개발 기획 시작하자')).toBe('plan');
    expect(classifyCtoIntent('이 아이디어 로드맵 짜고 task로 나눠줘')).toBe('plan');
    expect(classifyCtoIntent('구현 계획 세워줘')).toBe('plan');
  });

  it('routes short approval commands to approve', () => {
    expect(classifyCtoIntent('승인')).toBe('approve');
    expect(classifyCtoIntent('approve')).toBe('approve');
    expect(classifyCtoIntent('실행')).toBe('approve');
    expect(classifyCtoIntent('진행해')).toBe('approve');
    expect(classifyCtoIntent('이 계획 실행해')).toBe('approve');
  });

  it('keeps plain questions and status asks generic', () => {
    expect(classifyCtoIntent('지금 뭐 진행 중이야?')).toBe('generic');
    expect(classifyCtoIntent('어제 배포 오류 원인 알려줘')).toBe('generic');
    expect(classifyCtoIntent('')).toBe('generic');
  });

  it('does not treat a long sentence containing 실행 as approval', () => {
    expect(classifyCtoIntent('테스트 실행 결과가 어떻게 나왔는지 자세히 보고해줘')).toBe('generic');
  });

  it('handles DM/mention-stripped text the same way', () => {
    expect(classifyCtoIntent(' PRD 부터 정리해줘 ')).toBe('plan');
  });
});

function fakePulk(overrides: Partial<PulkPlanningPort> = {}): PulkPlanningPort {
  return {
    planMessage: async (): Promise<PlanMessageResult> => ({
      reply: '조금 더 알려주세요.',
      plan: null,
      cto_message_id: 'msg-a',
    }),
    approvePlan: async (): Promise<ApprovePlanResult> => ({
      project_id: 'p1',
      instruction_id: 'inst-1',
      roadmap_item_ids: ['r1', 'r2'],
      task_ids: ['t1', 't2', 't3'],
    }),
    latestProposedPlan: async () => ({ cto_message_id: 'msg-a' }),
    threadHasMessages: async () => true,
    ...overrides,
  };
}

describe('handleCtoPlanning', () => {
  it('builds a deterministic thread id from the Slack thread', () => {
    expect(slackThreadId('C01', '1720.100')).toBe('slack-C01-1720.100');
  });

  it('plan turn without a plan yet → conversational reply', async () => {
    const out = await handleCtoPlanning('plan', 'PRD 만들어줘', 'slack-C01-1', fakePulk());
    expect(out).toContain('조금 더 알려주세요');
  });

  it('plan turn with a proposed plan → summary + approval instruction', async () => {
    const pulk = fakePulk({
      planMessage: async () => ({
        reply: '계획입니다',
        cto_message_id: 'msg-9',
        plan: {
          prd: '# 결제 개선\n요약',
          roadmap_items: [{ title: 'R1', sequence: 1 }],
          tasks: [{ title: 'T1' }, { title: 'T2' }],
          project_proposal: null,
        },
      }),
    });
    const out = await handleCtoPlanning('plan', 'PRD 만들어줘', 'slack-C01-1', pulk);
    expect(out).toContain('결제 개선');
    expect(out).toContain('로드맵* 1개');
    expect(out).toContain('태스크* 2개');
    expect(out).toContain('승인');
    expect(out).toContain('msg-9');
  });

  it('approve resolves the thread-latest proposed plan and reports counts', async () => {
    const calls: string[] = [];
    const pulk = fakePulk({
      approvePlan: async (id) => {
        calls.push(id);
        return { project_id: 'p1', roadmap_item_ids: ['r1', 'r2'], task_ids: ['t1', 't2', 't3'] };
      },
    });
    const out = await handleCtoPlanning('approve', '승인', 'slack-C01-1', pulk);
    expect(calls).toEqual(['msg-a']);
    expect(out).toContain('로드맵 2개');
    expect(out).toContain('태스크 3개');
  });

  it('approve with no pending plan → guidance, no crash', async () => {
    const pulk = fakePulk({ latestProposedPlan: async () => null });
    const out = await handleCtoPlanning('approve', '승인', 'slack-C01-1', pulk);
    expect(out).toContain('승인 대기 중인 계획이');
  });

  it('NocoBase failure → clear operational error (no silent fallback)', async () => {
    const pulk = fakePulk({
      planMessage: async () => {
        throw new Error('NocoBase 503 /api/cto:planMessage');
      },
    });
    const out = await handleCtoPlanning('plan', 'PRD 만들어줘', 'slack-C01-1', pulk);
    expect(out).toContain('pulk 기획 API 호출 실패');
    expect(out).toContain('NOCOBASE_URL');
  });
});

describe('resolveCtoIntent (sticky planning)', () => {
  it('promotes a generic follow-up inside an existing planning thread to plan', async () => {
    const pulk = fakePulk({ threadHasMessages: async () => true });
    const r = await resolveCtoIntent('generic', true, 'slack-C01-1', pulk);
    expect(r).toEqual({ intent: 'plan', sticky: true });
  });

  it('keeps a generic follow-up generic when the thread has no planning record', async () => {
    const pulk = fakePulk({ threadHasMessages: async () => false });
    const r = await resolveCtoIntent('generic', true, 'slack-C01-1', pulk);
    expect(r).toEqual({ intent: 'generic', sticky: false });
  });

  it('never promotes a new (non-thread) message — no pulk lookup', async () => {
    let called = false;
    const pulk = fakePulk({
      threadHasMessages: async () => {
        called = true;
        return true;
      },
    });
    const r = await resolveCtoIntent('generic', false, 'slack-C01-1', pulk);
    expect(r).toEqual({ intent: 'generic', sticky: false });
    expect(called).toBe(false);
  });

  it('leaves an already-classified plan/approve intent untouched', async () => {
    const pulk = fakePulk();
    expect(await resolveCtoIntent('plan', true, 'slack-C01-1', pulk)).toEqual({
      intent: 'plan',
      sticky: false,
    });
    expect(await resolveCtoIntent('approve', true, 'slack-C01-1', pulk)).toEqual({
      intent: 'approve',
      sticky: false,
    });
  });

  it('pulk lookup throwing → no promotion (fail-open)', async () => {
    const pulk = fakePulk({
      threadHasMessages: async () => {
        throw new Error('NocoBase 503');
      },
    });
    expect(await isPlanningThread('slack-C01-1', pulk)).toBe(false);
    const r = await resolveCtoIntent('generic', true, 'slack-C01-1', pulk);
    expect(r).toEqual({ intent: 'generic', sticky: false });
  });
});
