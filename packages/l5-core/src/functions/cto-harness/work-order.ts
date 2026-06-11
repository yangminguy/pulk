// CTO Harness — Work Order 빌더/검증 (PRD §10).
//
// pulk CTO가 ACR Kernel에 넘길 CTOExecutionWorkOrder를 결정적으로 조립하고,
// 넘기기 전에 구조적 정합성을 검증한다. 복잡도/모드/검증 프로파일은
// complexity-router의 순수 함수를 재사용한다.
//
// 순수 함수만 포함한다. I/O·네트워크·git 실행 없음.

import type {
  CheckName,
  Complexity,
  CTOExecutionWorkOrder,
  ExecutionAgent,
  HarnessRiskLevel,
} from './types';
import {
  classifyComplexity,
  complexityToMode,
  buildVerificationProfile,
  type ComplexityInput,
} from './complexity-router';

/** buildWorkOrder 입력. PRD §10의 Work Order 원천 필드. */
export interface BuildWorkOrderInput {
  taskId: string;
  feature: string;
  spec: string[];
  targetFiles: string[];
  expectedModules?: string[];
  dependencies?: string[];
  riskLevel: HarnessRiskLevel;
  riskReason?: string;
  agent?: ExecutionAgent;
  globalRules?: string[];
  pathRules?: string[];
  docsIndex?: string[];
  isUI?: boolean;
  isDocOnly?: boolean;
  isLargeRefactor?: boolean;
}

/** 유효한 HarnessRiskLevel 집합 (검증용). */
const VALID_RISK_LEVELS: ReadonlySet<HarnessRiskLevel> = new Set<HarnessRiskLevel>([
  'D0',
  'D1',
  'D2',
  'D3',
  'D4',
]);

/** 위험작업으로 간주되는 복잡도(boundary 검증 필수) 임계값. C3 이상. */
const HIGH_RISK_COMPLEXITIES: ReadonlySet<Complexity> = new Set<Complexity>([
  'C3',
  'C4',
  'C5',
]);

/** 복잡도 순서 비교용 (C0 < C1 < ... < C5). */
const COMPLEXITY_ORDER: Complexity[] = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'];

function complexityRank(c: Complexity): number {
  return COMPLEXITY_ORDER.indexOf(c);
}

/** a가 b 이상이면 a를, 아니면 b를 반환(복잡도 하한 보장). */
function atLeast(a: Complexity, floor: Complexity): Complexity {
  return complexityRank(a) >= complexityRank(floor) ? a : floor;
}

/** VerificationProfile에서 true인 check 이름만 배열로 추린다(결정적 순서). */
function profileToCheckNames(profile: {
  typecheck: boolean;
  lint: boolean;
  test: boolean;
  build: boolean;
  playwright: boolean;
  boundary: boolean;
}): CheckName[] {
  const order: CheckName[] = [
    'typecheck',
    'lint',
    'test',
    'build',
    'playwright',
    'boundary',
  ];
  return order.filter((name) => profile[name]);
}

/**
 * PRD §10 Work Order를 결정적으로 조립한다.
 *
 * - 복잡도는 targetFiles.length + UI/doc/refactor 플래그로 classifyComplexity 호출.
 * - riskLevel이 'D4'면 최소 C4를 보장(위험도가 높은 작업의 복잡도 하한).
 * - requiresApproval = riskLevel이 D3 또는 D4.
 * - mode = complexityToMode(complexity).
 * - verification = buildVerificationProfile에서 true인 check 이름 배열.
 * - agent 기본값 'claude-code'.
 */
export function buildWorkOrder(
  input: BuildWorkOrderInput,
): CTOExecutionWorkOrder {
  const targetFiles = input.targetFiles ?? [];

  const classificationInput: ComplexityInput = {
    fileCount: targetFiles.length,
    isDocOnly: input.isDocOnly ?? false,
    isLargeRefactor: input.isLargeRefactor ?? false,
  };

  // 기본 복잡도 산출 후, riskLevel D4면 최소 C4 하한을 강제한다.
  let complexity = classifyComplexity(classificationInput);
  if (input.riskLevel === 'D4') {
    complexity = atLeast(complexity, 'C4');
  }

  const requiresApproval =
    input.riskLevel === 'D3' || input.riskLevel === 'D4';

  const mode = complexityToMode(complexity);

  const profile = buildVerificationProfile(complexity, {
    isUI: input.isUI ?? false,
  });
  const verification = profileToCheckNames(profile);

  return {
    taskId: input.taskId,
    feature: input.feature,
    spec: input.spec ?? [],
    design: {
      targetFiles,
      expectedModules: input.expectedModules ?? [],
      dependencies: input.dependencies ?? [],
    },
    risk: {
      level: input.riskLevel,
      reason: input.riskReason ?? '',
      requiresApproval,
    },
    contextPack: {
      globalRules: input.globalRules ?? [],
      pathRules: input.pathRules ?? [],
      docsIndex: input.docsIndex ?? [],
    },
    execution: {
      agent: input.agent ?? 'claude-code',
      complexity,
      mode,
      verification,
    },
  };
}

/**
 * Work Order를 ACR Kernel에 넘기기 전 구조 정합성을 검증한다.
 *
 * 검사 항목:
 * - taskId/feature 비어있지 않음.
 * - spec 1개 이상.
 * - design.targetFiles 1개 이상.
 * - risk.level 이 유효한 HarnessRiskLevel.
 * - requiresApproval ↔ level 일관성: D3/D4면 requiresApproval=true 권장(불일치 시 error),
 *   D0~D2인데 requiresApproval=true면 불일치 error.
 * - 위험작업(complexity C3 이상)인데 verification에 boundary가 빠지면 error.
 */
export function validateWorkOrder(order: CTOExecutionWorkOrder): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!order.taskId || order.taskId.trim() === '') {
    errors.push('taskId is required');
  }
  if (!order.feature || order.feature.trim() === '') {
    errors.push('feature is required');
  }
  if (!order.spec || order.spec.length === 0) {
    errors.push('spec must have at least one item');
  }
  if (!order.design || order.design.targetFiles.length === 0) {
    errors.push('design.targetFiles must have at least one item');
  }

  if (!VALID_RISK_LEVELS.has(order.risk.level)) {
    errors.push(`risk.level is invalid: ${order.risk.level}`);
  } else {
    const shouldRequireApproval =
      order.risk.level === 'D3' || order.risk.level === 'D4';
    if (shouldRequireApproval && !order.risk.requiresApproval) {
      errors.push(
        `risk.requiresApproval must be true for level ${order.risk.level}`,
      );
    }
    if (!shouldRequireApproval && order.risk.requiresApproval) {
      errors.push(
        `risk.requiresApproval must be false for level ${order.risk.level}`,
      );
    }
  }

  if (
    HIGH_RISK_COMPLEXITIES.has(order.execution.complexity) &&
    !order.execution.verification.includes('boundary')
  ) {
    errors.push(
      `execution.verification must include 'boundary' for complexity ${order.execution.complexity}`,
    );
  }

  return { valid: errors.length === 0, errors };
}
