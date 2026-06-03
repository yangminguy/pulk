import { createAskExecutiveTool } from '../tool';
import { validateDelegationRequest, type DelegationRequest } from '../index';
import type { ToolResult } from '../../executive-runtime/tools/types';

const ctx = { role: 'CMO' as const, task_id: 't-origin-1' };

function makeTool(proposeImpl?: (req: DelegationRequest) => Promise<ToolResult>) {
  const calls: DelegationRequest[] = [];
  const propose =
    proposeImpl ??
    (async (req: DelegationRequest) => {
      calls.push(req);
      return { ok: true, data: { delegation_opened: true, id: 'd-1' } };
    });
  const wrapped = async (req: DelegationRequest) => {
    calls.push(req);
    return propose(req);
  };
  return { tool: createAskExecutiveTool({ propose: proposeImpl ? wrapped : propose }), calls };
}

describe('validateDelegationRequest', () => {
  const base: DelegationRequest = {
    from_agent: 'CMO',
    to_agent: 'CTO',
    origin_task_id: 't1',
    objective: '영상 도구 수정',
    acceptance_criteria: ['9:16 출력'],
    max_rounds: 3,
  };

  it('accepts a well-formed request', () => {
    expect(validateDelegationRequest(base).ok).toBe(true);
  });

  it('rejects an invalid target role', () => {
    expect(validateDelegationRequest({ ...base, to_agent: 'CEO' as any }).ok).toBe(false);
    expect(validateDelegationRequest({ ...base, to_agent: 'Nobody' as any }).ok).toBe(false);
  });

  it('rejects self-delegation', () => {
    const r = validateDelegationRequest({ ...base, to_agent: 'CMO' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('자기 자신');
  });

  it('requires a non-empty objective', () => {
    expect(validateDelegationRequest({ ...base, objective: '  ' }).ok).toBe(false);
  });

  it('requires at least one acceptance criterion', () => {
    expect(validateDelegationRequest({ ...base, acceptance_criteria: [] }).ok).toBe(false);
  });

  it('clamps max_rounds to 1..5', () => {
    expect(validateDelegationRequest({ ...base, max_rounds: 0 }).ok).toBe(false);
    expect(validateDelegationRequest({ ...base, max_rounds: 6 }).ok).toBe(false);
    expect(validateDelegationRequest({ ...base, max_rounds: 2.5 }).ok).toBe(false);
  });
});

describe('createAskExecutiveTool', () => {
  it('has the expected shape', () => {
    const { tool } = makeTool();
    expect(tool.name).toBe('ask_executive');
    expect(tool.allowed_roles).toBe('all');
    expect(tool.permission).toBe('write');
  });

  it('proposes a valid delegation and returns delegation_opened', async () => {
    const { tool, calls } = makeTool();
    const res = await tool.run(
      {
        to_agent: 'CTO',
        objective: '영상 생성기를 이 프리셋대로 수정',
        acceptance_criteria: ['preset.json에 brand_color 반영', 'generate가 9:16 출력'],
        max_rounds: 2,
      },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect((res.data as any).delegation_opened).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].from_agent).toBe('CMO');
    expect(calls[0].to_agent).toBe('CTO');
    expect(calls[0].origin_task_id).toBe('t-origin-1');
    expect(calls[0].max_rounds).toBe(2);
  });

  it('defaults max_rounds to 3 when omitted', async () => {
    const { tool, calls } = makeTool();
    await tool.run(
      { to_agent: 'CTO', objective: 'x', acceptance_criteria: ['y'] },
      ctx,
    );
    expect(calls[0].max_rounds).toBe(3);
  });

  it('rejects without calling propose when validation fails', async () => {
    let proposeCalled = false;
    const tool = createAskExecutiveTool({
      propose: async () => {
        proposeCalled = true;
        return { ok: true };
      },
    });
    const res = await tool.run(
      { to_agent: 'CMO', objective: 'x', acceptance_criteria: ['y'] }, // self-delegation
      ctx,
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('자기 자신');
    expect(proposeCalled).toBe(false);
  });

  it('requires task_id context', async () => {
    const { tool } = makeTool();
    const res = await tool.run(
      { to_agent: 'CTO', objective: 'x', acceptance_criteria: ['y'] },
      { role: 'CMO' } as any,
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('task_id');
  });
});
