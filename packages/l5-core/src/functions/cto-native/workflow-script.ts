// workflow-script.ts — CTO phase DAG를 Claude Code "Workflow 스크립트"(ESM JS 문자열)로
// 굽는 순수 생성기. I/O·네트워크·Date.now 금지(호출자가 필요한 값 주입).
//
// 산출 스크립트는 Workflow 도구(runtime)가 로드해 실행하는 ESM 모듈이다:
//   export const meta = {name, description, phases:[...]}   // 순수 리터럴
//   export default async function run({ agent, parallel }) { ... }
// 본문은 planPhaseLevels로 계산한 레벨을 순차로, 레벨 내 phase는 parallel(thunks)로 병렬
// 실행한다. code-producing phase는 실행 직후 같은 thunk에서 verify_command를 돌리는 verify
// 스테이지를 잇는다(레벨 병렬성은 유지하면서 verify는 해당 phase 뒤에 온다).
//
// 이스케이프: phase 프롬프트/커맨드는 생성 스크립트 안에서 template-literal로 들어가므로
// 백틱·`${`·백슬래시를 안전하게 이스케이프한다. meta 문자열은 JSON.stringify로 굽는다.

import type { ACRIntent, CTOPhase } from '../../types/acr-intent';
import { planPhaseLevels } from './parallelize';
import { buildVerifyCommand } from './verify-command';

export interface BuildWorkflowScriptOptions {
  /** 각 phase 진행 노트를 남길 디렉토리(절대경로). 지정 시 meta에 실려 runtime이 사용. */
  progressNoteDir?: string;
}

export interface BuildWorkflowScriptResult {
  /** node --check 가능한 ESM 스크립트 문자열. */
  script: string;
  /** 생성 중 감지한 비치명 문제(미존재/순환 depends_on, project_path 없음 등). */
  warnings: string[];
}

/**
 * template-literal 안에 문자열을 안전하게 넣기 위한 이스케이프.
 * 순서 중요: 백슬래시 → 백틱 → `${`. 개행은 template-literal에서 그대로 허용되므로 보존한다.
 */
export function escapeForTemplateLiteral(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

/** phase가 코드 산출(verify 대상)인지 휴리스틱 판단(순수). 문서/기획 전용 phase는 verify 생략. */
function isCodeProducing(phase: CTOPhase): boolean {
  // CTO가 verify_command를 직접 지정했다면 명백히 코드 phase.
  if (phase.verify_command && phase.verify_command.trim()) return true;
  // 이름/기대산출이 문서류로 보이면 비코드(typecheck/jest 대상 아님).
  const hay = `${phase.name} ${phase.expected_output}`.toLowerCase();
  const docLike =
    /\b(doc|docs|readme|markdown|\.md\b|handoff|prd|스펙\s*문서|문서|기획서|보고서)\b/.test(hay);
  return !docLike;
}

/**
 * phase의 verify 커맨드를 결정한다. CTO가 명시한 verify_command가 있으면 그대로,
 * 없으면 buildVerifyCommand로 packageDir 기준 `tsc && jest`를 합성한다.
 */
function resolveVerifyCommand(phase: CTOPhase, packageDir: string): string {
  if (phase.verify_command && phase.verify_command.trim()) {
    return phase.verify_command.trim();
  }
  return buildVerifyCommand({ packageDir });
}

/** phase 실행 프롬프트(생성 스크립트에 template-literal로 베이크될 원문). */
function buildPhasePrompt(phase: CTOPhase, intent: ACRIntent): string {
  const lines: string[] = [
    `# Phase: ${phase.name}`,
    '',
    phase.prompt_packet,
    '',
    `## 기대 산출(expected_output)`,
    phase.expected_output,
  ];
  if (intent.allowed_files && intent.allowed_files.length > 0) {
    lines.push('', '## 수정 허용 파일(allowed_files)', intent.allowed_files.join('\n'));
  }
  if (intent.blocked_files && intent.blocked_files.length > 0) {
    lines.push('', '## 수정 금지 파일(blocked_files)', intent.blocked_files.join('\n'));
  }
  return lines.join('\n');
}

/**
 * ACRIntent를 Claude Code Workflow 스크립트(ESM 문자열)로 굽는다.
 * planPhaseLevels로 병렬 레벨을 계산하고, 각 레벨을 parallel(thunks)로, 레벨 간은 순차로 낸다.
 * 순환/미존재 depends_on은 planPhaseLevels가 graceful 처리하며, 그 warn은 warnings로 수집된다.
 */
export function buildWorkflowScript(
  intent: ACRIntent,
  opts?: BuildWorkflowScriptOptions,
): BuildWorkflowScriptResult {
  const warnings: string[] = [];

  // planPhaseLevels는 순환/미존재 의존을 console.warn으로 알린다. 그 메시지를 warnings로 회수.
  const originalWarn = console.warn;
  const captured: string[] = [];
  console.warn = (...args: unknown[]) => {
    captured.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
  };
  let levels: CTOPhase[][];
  try {
    levels = planPhaseLevels(intent.phases);
  } finally {
    console.warn = originalWarn;
  }
  for (const msg of captured) warnings.push(msg);

  const packageDir = intent.project_path ?? '.';
  if (!intent.project_path) {
    warnings.push(
      '[workflow-script] intent.project_path 없음 — verify_command packageDir을 "."로 폴백.',
    );
  }

  const meta = {
    name: intent.task_title,
    description: `CTO Native Workflow — ${intent.phases.length} phase, ${levels.length} 레벨`,
    phases: intent.phases.map((p) => p.name),
    ...(opts?.progressNoteDir ? { progressNoteDir: opts.progressNoteDir } : {}),
  };

  const body: string[] = [];
  body.push(`export const meta = ${JSON.stringify(meta)};`);
  body.push('');
  body.push('// buildWorkflowScript가 자동 생성한 Workflow 스크립트 — 직접 수정 금지.');
  body.push('export default async function run({ agent, parallel }) {');
  body.push('  const results = {};');

  levels.forEach((level, li) => {
    body.push('');
    body.push(`  // ── level ${li} (${level.length} phase 병렬) ──`);
    body.push('  await parallel([');
    for (const phase of level) {
      const label = escapeForTemplateLiteral(phase.name);
      const prompt = escapeForTemplateLiteral(buildPhasePrompt(phase, intent));
      body.push('    async () => {');
      body.push(
        `      results[${JSON.stringify(phase.name)}] = await agent(\`${prompt}\`, ` +
          `{ label: ${JSON.stringify(phase.name)}, phase: ${JSON.stringify(phase.name)}, isolation: 'worktree' });`,
      );
      if (isCodeProducing(phase)) {
        const vcmd = escapeForTemplateLiteral(resolveVerifyCommand(phase, packageDir));
        const verifyLabel = `verify:${label}`;
        const verifyPrompt =
          `다음 verify_command를 실행하고 그 출력 원문을 그대로 반환하라(요약 금지):\n${vcmd}`;
        body.push(
          `      results[${JSON.stringify(`verify:${phase.name}`)}] = await agent(\`${verifyPrompt}\`, ` +
            `{ label: ${JSON.stringify(verifyLabel)}, phase: ${JSON.stringify(phase.name)}, isolation: 'worktree' });`,
        );
      }
      body.push('    },');
    }
    body.push('  ]);');
  });

  body.push('');
  body.push('  return { phases: results };');
  body.push('}');
  body.push('');

  return { script: body.join('\n'), warnings };
}
