import { buildWorkOrder, validateWorkOrder } from '../work-order';
import type { CTOExecutionWorkOrder } from '../types';

// 검증용 헬퍼: 정상 Work Order를 만든 뒤 일부 필드만 덮어쓴다.
function baseOrder(): CTOExecutionWorkOrder {
  return buildWorkOrder({
    taskId: 'T-1',
    feature: 'sample feature',
    spec: ['do a thing'],
    targetFiles: ['a.ts'],
    riskLevel: 'D1',
  });
}

describe('buildWorkOrder', () => {
  it('단일 파일 + D1이면 가벼운 복잡도와 승인 불필요', () => {
    const order = buildWorkOrder({
      taskId: 'T-1',
      feature: 'small change',
      spec: ['change one line'],
      targetFiles: ['one.ts'],
      riskLevel: 'D1',
    });

    expect(order.taskId).toBe('T-1');
    expect(order.feature).toBe('small change');
    expect(order.risk.level).toBe('D1');
    expect(order.risk.requiresApproval).toBe(false);
    // 작은 작업은 C3 미만이어야 하고 boundary 검증이 강제되지 않음.
    expect(['C0', 'C1', 'C2']).toContain(order.execution.complexity);
  });

  it('파일 수가 많을수록 복잡도가 단조 증가(또는 동일)', () => {
    const few = buildWorkOrder({
      taskId: 'T-few',
      feature: 'f',
      spec: ['s'],
      targetFiles: ['a.ts'],
      riskLevel: 'D1',
    });
    const many = buildWorkOrder({
      taskId: 'T-many',
      feature: 'f',
      spec: ['s'],
      targetFiles: Array.from({ length: 12 }, (_, i) => `f${i}.ts`),
      riskLevel: 'D1',
    });

    const order = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'];
    expect(order.indexOf(many.execution.complexity)).toBeGreaterThanOrEqual(
      order.indexOf(few.execution.complexity),
    );
  });

  it('D3이면 requiresApproval=true', () => {
    const order = buildWorkOrder({
      taskId: 'T-3',
      feature: 'risky',
      spec: ['s'],
      targetFiles: ['a.ts'],
      riskLevel: 'D3',
    });
    expect(order.risk.requiresApproval).toBe(true);
  });

  it('D4이면 requiresApproval=true 이고 복잡도는 최소 C4 보장', () => {
    const order = buildWorkOrder({
      taskId: 'T-4',
      feature: 'very risky',
      spec: ['s'],
      // 파일 1개라 자연 분류는 낮지만 D4 하한으로 C4 이상이어야 한다.
      targetFiles: ['a.ts'],
      riskLevel: 'D4',
    });
    expect(order.risk.requiresApproval).toBe(true);

    const rank = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'];
    expect(rank.indexOf(order.execution.complexity)).toBeGreaterThanOrEqual(
      rank.indexOf('C4'),
    );
    // C4는 고위험이므로 boundary 검증이 포함되어야 한다.
    expect(order.execution.verification).toContain('boundary');
  });

  it('D0~D2는 requiresApproval=false', () => {
    for (const level of ['D0', 'D1', 'D2'] as const) {
      const order = buildWorkOrder({
        taskId: `T-${level}`,
        feature: 'f',
        spec: ['s'],
        targetFiles: ['a.ts'],
        riskLevel: level,
      });
      expect(order.risk.requiresApproval).toBe(false);
    }
  });

  it('agent 기본값은 claude-code, 지정 시 그대로 사용', () => {
    const def = buildWorkOrder({
      taskId: 'T-a',
      feature: 'f',
      spec: ['s'],
      targetFiles: ['a.ts'],
      riskLevel: 'D1',
    });
    expect(def.execution.agent).toBe('claude-code');

    const explicit = buildWorkOrder({
      taskId: 'T-b',
      feature: 'f',
      spec: ['s'],
      targetFiles: ['a.ts'],
      riskLevel: 'D1',
      agent: 'codex',
    });
    expect(explicit.execution.agent).toBe('codex');
  });

  it('verification은 검증 프로파일에서 true인 check 이름 배열', () => {
    const order = buildWorkOrder({
      taskId: 'T-v',
      feature: 'f',
      spec: ['s'],
      targetFiles: Array.from({ length: 12 }, (_, i) => `f${i}.ts`),
      riskLevel: 'D4',
    });
    // typecheck는 거의 모든 작업에서 켜져 있어야 함.
    expect(order.execution.verification).toContain('typecheck');
    // 모두 CheckName 집합에 속해야 함(결정적, 중복 없음).
    const allowed = [
      'typecheck',
      'lint',
      'test',
      'build',
      'playwright',
      'boundary',
    ];
    for (const c of order.execution.verification) {
      expect(allowed).toContain(c);
    }
    expect(new Set(order.execution.verification).size).toBe(
      order.execution.verification.length,
    );
  });

  it('선택 필드는 빈 배열/기본값으로 채워진다', () => {
    const order = buildWorkOrder({
      taskId: 'T-d',
      feature: 'f',
      spec: ['s'],
      targetFiles: ['a.ts'],
      riskLevel: 'D1',
    });
    expect(order.design.expectedModules).toEqual([]);
    expect(order.design.dependencies).toEqual([]);
    expect(order.contextPack.globalRules).toEqual([]);
    expect(order.contextPack.pathRules).toEqual([]);
    expect(order.contextPack.docsIndex).toEqual([]);
    expect(order.risk.reason).toBe('');
  });
});

describe('validateWorkOrder', () => {
  it('정상 Work Order는 valid=true', () => {
    const result = validateWorkOrder(baseOrder());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('taskId 누락을 잡는다', () => {
    const order = baseOrder();
    order.taskId = '';
    const result = validateWorkOrder(order);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('taskId is required');
  });

  it('feature 누락을 잡는다', () => {
    const order = baseOrder();
    order.feature = '   ';
    const result = validateWorkOrder(order);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('feature is required');
  });

  it('spec 비어있음을 잡는다', () => {
    const order = baseOrder();
    order.spec = [];
    const result = validateWorkOrder(order);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('spec must have at least one item');
  });

  it('targetFiles 비어있음을 잡는다', () => {
    const order = baseOrder();
    order.design.targetFiles = [];
    const result = validateWorkOrder(order);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'design.targetFiles must have at least one item',
    );
  });

  it('유효하지 않은 risk.level을 잡는다', () => {
    const order = baseOrder();
    // 의도적으로 잘못된 값 주입.
    (order.risk as { level: string }).level = 'D9';
    const result = validateWorkOrder(order);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('risk.level is invalid'))).toBe(
      true,
    );
  });

  it('D3/D4인데 requiresApproval=false면 불일치 error', () => {
    const order = baseOrder();
    order.risk.level = 'D4';
    order.risk.requiresApproval = false;
    const result = validateWorkOrder(order);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('requiresApproval must be true')),
    ).toBe(true);
  });

  it('D0~D2인데 requiresApproval=true면 불일치 error', () => {
    const order = baseOrder();
    order.risk.level = 'D1';
    order.risk.requiresApproval = true;
    const result = validateWorkOrder(order);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('requiresApproval must be false')),
    ).toBe(true);
  });

  it('고위험 복잡도(C3+)인데 verification에 boundary 빠지면 error', () => {
    const order = baseOrder();
    order.execution.complexity = 'C4';
    order.execution.verification = ['typecheck', 'test'];
    const result = validateWorkOrder(order);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("must include 'boundary'")),
    ).toBe(true);
  });

  it('저위험 복잡도(C2)는 boundary 없어도 통과', () => {
    const order = baseOrder();
    order.execution.complexity = 'C2';
    order.execution.verification = ['typecheck'];
    const result = validateWorkOrder(order);
    expect(
      result.errors.some((e) => e.includes("must include 'boundary'")),
    ).toBe(false);
  });

  it('여러 문제를 동시에 모아서 보고한다', () => {
    const order = baseOrder();
    order.taskId = '';
    order.spec = [];
    const result = validateWorkOrder(order);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
