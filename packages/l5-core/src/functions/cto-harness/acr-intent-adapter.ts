// CTO Harness — Work Order ↔ ACRIntent 어댑터.
//
// pulk CTO가 만든 판단(WorkOrder / 복잡도 / 경계)을 ACR Kernel이 받는 실행 지시
// (ACRIntent)로 변환·부가한다. 핵심 원칙: ACR은 "무엇을 할지" 판단하지 않는다
// (PRD §5.2). 복잡도·실행모드·허용/금지 파일은 전부 CTO 측에서 결정해 실어 보낸다.
//
// 순수 함수만 둔다 — I/O·네트워크·git 실행 없음.

import type { ACRIntent, CTOPhase } from '../../types/acr-intent';
import type { Complexity, CTOExecutionWorkOrder, ExecutionMode } from './types';
import { DEFAULT_BLOCKED } from './boundary-check';

/** ACR 측 TaskClass 문자열 → Harness 복잡도(C0~C5).
 *
 * cto-design/dev-workflow-spec 의 TaskClass(TINY/SMALL_FIX/FEATURE/BIG_CHANGE/
 * OPS/RESEARCH/REFACTOR)를 PRD §6.1 복잡도 척도로 사상한다. 알 수 없는 값은 C2.
 */
export function taskClassToComplexity(taskClass: string | null | undefined): Complexity {
  switch ((taskClass ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')) {
    case 'RESEARCH':
      return 'C0'; // 조사/문서 중심
    case 'TINY':
    case 'SMALL_FIX':
      return 'C1';
    case 'FEATURE':
      return 'C2';
    case 'BIG_CHANGE':
      return 'C3';
    case 'OPS':
      return 'C4'; // env/deploy/runner 등 위험 운영
    case 'REFACTOR':
      return 'C5'; // 구조 개편
    default:
      return 'C2';
  }
}

/** 복잡도 → ExecutionMode (complexity-router 와 동일 규칙, 어댑터 자족용 사본). */
function complexityToExecutionMode(c: Complexity): ExecutionMode {
  switch (c) {
    case 'C0':
    case 'C1':
      return 'safe_solo';
    case 'C2':
      return 'implement_verify';
    case 'C3':
    case 'C4':
      return 'strict_sandbox';
    case 'C5':
      return 'parallel_patch_queue';
  }
}

/** 중복 제거하며 DEFAULT_BLOCKED 를 항상 포함시킨다. */
function withDefaultBlocked(blocked: string[] | undefined): string[] {
  return Array.from(new Set([...(blocked ?? []), ...DEFAULT_BLOCKED]));
}

export interface HarnessIntentMetadata {
  complexity?: Complexity;
  mode?: ExecutionMode;
  allowedFiles?: string[];
  blockedFiles?: string[];
  requiresApproval?: boolean;
}

/**
 * 기존 ACRIntent 에 CTO Harness 판단 메타를 부가한다(additive, 비파괴).
 *
 * 필수 필드(l5_task_id/phases/...)는 건드리지 않는다. blocked_files 는 항상
 * DEFAULT_BLOCKED 를 합쳐 하드 블록(.env·lockfile·node_modules)을 보장한다.
 */
export function applyHarnessMetadata(
  intent: ACRIntent,
  meta: HarnessIntentMetadata,
): ACRIntent {
  return {
    ...intent,
    ...(meta.complexity ? { complexity: meta.complexity } : {}),
    ...(meta.mode ? { harness_mode: meta.mode } : {}),
    ...(meta.allowedFiles ? { allowed_files: meta.allowedFiles } : {}),
    blocked_files: withDefaultBlocked(meta.blockedFiles),
    ...(typeof meta.requiresApproval === 'boolean'
      ? { requires_approval: meta.requiresApproval }
      : {}),
  };
}

export interface WorkOrderToIntentOptions {
  /** ISO 타임스탬프. 호출부에서 주입(테스트 결정성). */
  createdAt: string;
  /** ACR 실행 cwd. 생략 시 ACR이 등록된 project에서 해석. */
  projectPath?: string;
  /** L5 승인 게이트 통과 여부(기본 true — dispatcher는 승인된 task만 전달). */
  l5Approved?: boolean;
}

/**
 * WorkOrder + phases → 완성된 ACRIntent (PRD §10 → §8/§9 어댑터).
 *
 * CTO가 산출한 WorkOrder의 복잡도·실행모드·경계를 그대로 ACRIntent에 싣는다.
 * phases 는 호출부(cto agent)가 SOP 템플릿/LLM 으로 생성해 전달한다.
 */
export function workOrderToACRIntent(
  order: CTOExecutionWorkOrder,
  phases: CTOPhase[],
  opts: WorkOrderToIntentOptions,
): ACRIntent {
  const complexity = order.execution.complexity;
  const intent: ACRIntent = {
    l5_task_id: order.taskId,
    task_title: order.feature,
    phases,
    created_at: opts.createdAt,
    l5_approved: opts.l5Approved ?? true,
  };
  if (opts.projectPath) intent.project_path = opts.projectPath;

  return applyHarnessMetadata(intent, {
    complexity,
    mode: order.execution.mode ?? complexityToExecutionMode(complexity),
    allowedFiles: order.design.targetFiles,
    requiresApproval: order.risk.requiresApproval,
  });
}
