import {
  taskClassToComplexity,
  applyHarnessMetadata,
  workOrderToACRIntent,
} from '../acr-intent-adapter';
import { DEFAULT_BLOCKED } from '../boundary-check';
import type { ACRIntent, CTOPhase } from '../../../types/acr-intent';
import type { CTOExecutionWorkOrder } from '../types';

const phase: CTOPhase = {
  name: '구현',
  runtime: 'claude',
  prompt_packet: 'do it',
  expected_output: 'code',
  risk_level: 'D2',
  release_gate_type: 'none',
  l5_approval_required: false,
  auto_execute: true,
};

const baseIntent: ACRIntent = {
  l5_task_id: 'task_1',
  task_title: '제목',
  phases: [phase],
  created_at: '2026-06-06T00:00:00.000Z',
  l5_approved: true,
};

describe('taskClassToComplexity', () => {
  it('TaskClass 를 C0~C5 로 사상한다', () => {
    expect(taskClassToComplexity('RESEARCH')).toBe('C0');
    expect(taskClassToComplexity('TINY')).toBe('C1');
    expect(taskClassToComplexity('SMALL_FIX')).toBe('C1');
    expect(taskClassToComplexity('FEATURE')).toBe('C2');
    expect(taskClassToComplexity('BIG_CHANGE')).toBe('C3');
    expect(taskClassToComplexity('OPS')).toBe('C4');
    expect(taskClassToComplexity('REFACTOR')).toBe('C5');
  });

  it('구분자 변형/대소문자를 정규화한다', () => {
    expect(taskClassToComplexity('small fix')).toBe('C1');
    expect(taskClassToComplexity('big-change')).toBe('C3');
  });

  it('알 수 없는/빈 값은 C2 기본', () => {
    expect(taskClassToComplexity(undefined)).toBe('C2');
    expect(taskClassToComplexity('')).toBe('C2');
    expect(taskClassToComplexity('NONSENSE')).toBe('C2');
  });
});

describe('applyHarnessMetadata', () => {
  it('필수 필드는 보존하고 메타만 부가한다(비파괴)', () => {
    const out = applyHarnessMetadata(baseIntent, { complexity: 'C3', mode: 'strict_sandbox' });
    expect(out.l5_task_id).toBe('task_1');
    expect(out.phases).toHaveLength(1);
    expect(out.l5_approved).toBe(true);
    expect(out.complexity).toBe('C3');
    expect(out.harness_mode).toBe('strict_sandbox');
  });

  it('blocked_files 는 항상 DEFAULT_BLOCKED 를 포함한다', () => {
    const out = applyHarnessMetadata(baseIntent, { blockedFiles: ['custom/secret.ts'] });
    for (const p of DEFAULT_BLOCKED) expect(out.blocked_files).toContain(p);
    expect(out.blocked_files).toContain('custom/secret.ts');
  });

  it('blocked_files 는 중복을 제거한다', () => {
    const out = applyHarnessMetadata(baseIntent, { blockedFiles: ['.env', '.env'] });
    const envCount = out.blocked_files!.filter((f) => f === '.env').length;
    expect(envCount).toBe(1);
  });

  it('requiresApproval=false 도 명시적으로 반영한다', () => {
    const out = applyHarnessMetadata(baseIntent, { requiresApproval: false });
    expect(out.requires_approval).toBe(false);
  });

  it('원본 intent 를 변형하지 않는다', () => {
    applyHarnessMetadata(baseIntent, { complexity: 'C4' });
    expect((baseIntent as ACRIntent).complexity).toBeUndefined();
  });
});

describe('workOrderToACRIntent', () => {
  const order: CTOExecutionWorkOrder = {
    taskId: 'task_42',
    feature: '로그 패널',
    spec: ['표시한다'],
    design: { targetFiles: ['apps/web/src/**'], expectedModules: [], dependencies: [] },
    risk: { level: 'D3', reason: '상태 영향', requiresApproval: true },
    contextPack: { globalRules: [], pathRules: [], docsIndex: [] },
    execution: { agent: 'claude-code', complexity: 'C3', mode: 'strict_sandbox', verification: ['typecheck', 'boundary'] },
  };

  it('WorkOrder 를 ACRIntent 로 변환하고 판단 메타를 싣는다', () => {
    const out = workOrderToACRIntent(order, [phase], {
      createdAt: '2026-06-06T00:00:00.000Z',
      projectPath: '/repo',
    });
    expect(out.l5_task_id).toBe('task_42');
    expect(out.task_title).toBe('로그 패널');
    expect(out.phases).toHaveLength(1);
    expect(out.project_path).toBe('/repo');
    expect(out.complexity).toBe('C3');
    expect(out.harness_mode).toBe('strict_sandbox');
    expect(out.allowed_files).toEqual(['apps/web/src/**']);
    expect(out.requires_approval).toBe(true);
    expect(out.blocked_files).toContain('.env');
  });

  it('l5Approved 기본값은 true', () => {
    const out = workOrderToACRIntent(order, [phase], { createdAt: 'x' });
    expect(out.l5_approved).toBe(true);
  });
});
