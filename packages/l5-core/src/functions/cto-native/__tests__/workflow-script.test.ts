// workflow-script 생성기 테스트. 순수 생성물의 구조(meta 리터럴/레벨/verify/이스케이프)와
// warnings 전파를 검사하고, 실제 `node --check`로 산출 스크립트가 유효한 ESM인지 왕복 확인한다.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildWorkflowScript,
  escapeForTemplateLiteral,
} from '../workflow-script';
import type { ACRIntent, CTOPhase } from '../../../types/acr-intent';

function phase(name: string, over: Partial<CTOPhase> = {}): CTOPhase {
  return {
    name,
    runtime: 'claude',
    prompt_packet: `implement ${name}`,
    expected_output: `${name} done`,
    risk_level: 'D1',
    release_gate_type: 'none',
    l5_approval_required: false,
    auto_execute: true,
    ...over,
  };
}

function intent(phases: CTOPhase[], over: Partial<ACRIntent> = {}): ACRIntent {
  return {
    l5_task_id: 't1',
    task_title: 'Sample Task',
    phases,
    created_at: '2026-07-09T00:00:00.000Z',
    project_path: '/abs/repo/packages/l5-core',
    l5_approved: true,
    ...over,
  };
}

/** 산출 스크립트를 임시파일로 써서 `node --check`로 ESM 문법 유효성을 왕복 검사. */
function assertNodeCheckPasses(script: string): void {
  const dir = mkdtempSync(join(tmpdir(), 'wf-script-'));
  const file = join(dir, 'gen.mjs');
  try {
    writeFileSync(file, script, 'utf8');
    // 문법 오류면 execFileSync가 throw → 테스트 실패.
    execFileSync('node', ['--check', file], { stdio: 'pipe' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('escapeForTemplateLiteral', () => {
  it('백틱·${·백슬래시를 이스케이프하고 개행은 보존', () => {
    const out = escapeForTemplateLiteral('a`b${c}\\d\nline');
    expect(out).toBe('a\\`b\\${c}\\\\d\nline');
  });
});

describe('buildWorkflowScript', () => {
  it('단일 phase — meta 리터럴로 시작하고 node --check 통과', () => {
    const { script, warnings } = buildWorkflowScript(intent([phase('A')]));
    expect(script.startsWith('export const meta = {')).toBe(true);
    expect(warnings).toEqual([]);
    assertNodeCheckPasses(script);
  });

  it('meta에 name·description·phases가 리터럴로 구워짐', () => {
    const { script } = buildWorkflowScript(intent([phase('A'), phase('B', { depends_on: ['A'] })]));
    const line = script.split('\n')[0];
    expect(line).toMatch(/^export const meta = \{/);
    const parsed = JSON.parse(line.replace(/^export const meta = /, '').replace(/;$/, ''));
    expect(parsed.name).toBe('Sample Task');
    expect(parsed.phases).toEqual(['A', 'B']);
    expect(typeof parsed.description).toBe('string');
  });

  it('병렬 레벨 — depends_on 공유 phase는 한 parallel() 안에 함께', () => {
    const { script } = buildWorkflowScript(
      intent([phase('root'), phase('B', { depends_on: ['root'] }), phase('C', { depends_on: ['root'] })]),
    );
    // parallel 블록이 2개(레벨 0: root, 레벨 1: B·C).
    const parallelCount = (script.match(/await parallel\(\[/g) ?? []).length;
    expect(parallelCount).toBe(2);
    // 레벨 1 블록에 B·C 두 phase 모두 등장.
    expect(script).toContain('phase: "B"');
    expect(script).toContain('phase: "C"');
    assertNodeCheckPasses(script);
  });

  it('depends_on 순차 — 각 phase가 독립 레벨(parallel 3개)', () => {
    const { script } = buildWorkflowScript(
      intent([phase('A'), phase('B', { depends_on: ['A'] }), phase('C', { depends_on: ['B'] })]),
    );
    const parallelCount = (script.match(/await parallel\(\[/g) ?? []).length;
    expect(parallelCount).toBe(3);
    assertNodeCheckPasses(script);
  });

  it('code-producing phase는 verify 스테이지를 뒤에 붙임', () => {
    const { script } = buildWorkflowScript(
      intent([phase('impl', { verify_command: 'cd /abs/repo && corepack pnpm exec tsc --noEmit' })]),
    );
    expect(script).toContain('label: "verify:impl"');
    expect(script).toContain('corepack pnpm exec tsc --noEmit');
    assertNodeCheckPasses(script);
  });

  it('verify_command 미지정 코드 phase는 buildVerifyCommand로 합성', () => {
    const { script } = buildWorkflowScript(intent([phase('impl')]));
    expect(script).toContain('label: "verify:impl"');
    // packageDir(project_path) 기준 tsc+jest 합성.
    expect(script).toContain('cd /abs/repo/packages/l5-core');
    expect(script).toContain('corepack pnpm exec jest');
  });

  it('문서 전용 phase는 verify 스테이지 생략', () => {
    const { script } = buildWorkflowScript(
      intent([phase('docs-update', { expected_output: 'update README.md handoff' })]),
    );
    expect(script).not.toContain('verify:docs-update');
    assertNodeCheckPasses(script);
  });

  it('백틱·${·개행 포함 프롬프트도 유효한 스크립트로 이스케이프', () => {
    const nasty = 'run `ls` and ${x} here\nnew line with `code`';
    const { script } = buildWorkflowScript(
      intent([phase('tricky', { prompt_packet: nasty, verify_command: 'echo `date` ${HOME}' })]),
    );
    // 원문 백틱이 이스케이프돼 스크립트를 깨지 않아야 함.
    expect(script).toContain('\\`ls\\`');
    expect(script).toContain('\\${x}');
    assertNodeCheckPasses(script);
  });

  it('project_path 없으면 warning + packageDir "." 폴백', () => {
    const { script, warnings } = buildWorkflowScript(intent([phase('impl')], { project_path: undefined }));
    expect(warnings.some((w) => w.includes('project_path 없음'))).toBe(true);
    expect(script).toContain('cd .');
    assertNodeCheckPasses(script);
  });

  it('미존재 depends_on은 planPhaseLevels warn을 warnings로 전파', () => {
    const { warnings } = buildWorkflowScript(
      intent([phase('A', { depends_on: ['ghost'] }), phase('B', { depends_on: ['A'] })]),
    );
    expect(warnings.some((w) => w.includes('미존재 의존'))).toBe(true);
  });

  it('순환 depends_on도 graceful — throw 없이 스크립트 생성 + warn 전파', () => {
    const { script, warnings } = buildWorkflowScript(
      intent([phase('A', { depends_on: ['B'] }), phase('B', { depends_on: ['A'] })]),
    );
    expect(warnings.some((w) => w.includes('순환 의존'))).toBe(true);
    assertNodeCheckPasses(script);
  });

  it('progressNoteDir 지정 시 meta에 실림', () => {
    const { script } = buildWorkflowScript(intent([phase('A')]), { progressNoteDir: '/notes' });
    const parsed = JSON.parse(
      script.split('\n')[0].replace(/^export const meta = /, '').replace(/;$/, ''),
    );
    expect(parsed.progressNoteDir).toBe('/notes');
  });

  it('빈 phases — throw 없이 최소 스크립트 + node --check 통과', () => {
    const { script } = buildWorkflowScript(intent([]));
    expect(script).toContain('return { phases: results }');
    assertNodeCheckPasses(script);
  });
});
