import { buildPhaseExecutionPrompt } from '../phase-prompt.js';
import type { CTOPhase } from '@l5/core';

function makePhase(overrides: Partial<CTOPhase> = {}): CTOPhase {
  return {
    name: 'implement',
    runtime: 'claude',
    prompt_packet: 'PROMPT_PACKET_BODY_MARKER',
    expected_output: 'code changes',
    risk_level: 'D1',
    release_gate_type: 'none',
    l5_approval_required: false,
    auto_execute: true,
    ...overrides,
  };
}

describe('buildPhaseExecutionPrompt', () => {
  it('includes the phase prompt_packet verbatim', () => {
    const out = buildPhaseExecutionPrompt(makePhase(), { cwd: '/tmp/wt' });
    expect(out).toContain('PROMPT_PACKET_BODY_MARKER');
  });

  it('injects the cwd into the header placeholder and the footer', () => {
    const out = buildPhaseExecutionPrompt(makePhase(), { cwd: '/repo/work/tree' });
    // header <cwd> placeholder replaced (no literal <cwd> left)
    expect(out).not.toContain('<cwd>');
    expect(out).toContain('codex exec --cd /repo/work/tree');
    expect(out).toContain('agy --sandbox --add-dir /repo/work/tree');
    // footer cwd line
    expect(out).toContain('cwd: /repo/work/tree');
  });

  it('renders allowedFiles as a bullet list when provided', () => {
    const out = buildPhaseExecutionPrompt(makePhase(), {
      cwd: '/tmp/wt',
      allowedFiles: ['src/a.ts', 'src/b.ts'],
    });
    expect(out).toContain('allowedFiles:');
    expect(out).toContain('  - src/a.ts');
    expect(out).toContain('  - src/b.ts');
  });

  it('renders an unrestricted marker when allowedFiles is empty/omitted', () => {
    const out = buildPhaseExecutionPrompt(makePhase(), { cwd: '/tmp/wt' });
    expect(out).toContain('allowedFiles: (제한 없음)');
    const outEmpty = buildPhaseExecutionPrompt(makePhase(), {
      cwd: '/tmp/wt',
      allowedFiles: [],
    });
    expect(outEmpty).toContain('allowedFiles: (제한 없음)');
  });

  it('includes the token-pool dispersion instruction', () => {
    const out = buildPhaseExecutionPrompt(makePhase(), { cwd: '/tmp/wt' });
    expect(out).toContain('토큰 풀을 분산하라');
    expect(out).toContain('allowedFiles 밖 파일 수정 금지');
  });

  it('instructs the agent to emit the full report body in the final output', () => {
    const out = buildPhaseExecutionPrompt(makePhase(), { cwd: '/tmp/wt' });
    expect(out).toContain('마지막 출력에 전체 작업 보고서 본문을 담아라');
    expect(out).toContain('참조 금지');
  });
});
