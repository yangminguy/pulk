import {
  verifyCTOPhase,
  verifyCTOPhaseDeterministic,
  verifyIntegratePhase,
  isIntegratePhaseName,
} from '../verifier';
import type { LLMClient } from '../../ceo-orchestration/types';

describe('verifyCTOPhaseDeterministic', () => {
  it('returns fail on non-zero exit code', () => {
    const r = verifyCTOPhaseDeterministic({
      task_title: 'build',
      expected_output: 'binary produced',
      exit_code: 1,
      log_tail: '',
    });
    expect(r.verdict).toBe('fail');
    expect(r.retry_recommended).toBe(true);
    expect(r.confidence).toBe('high');
  });

  it('returns fail on [ERROR] in log tail', () => {
    const r = verifyCTOPhaseDeterministic({
      task_title: 'migrate',
      expected_output: 'schema updated',
      exit_code: 0,
      log_tail: 'doing things\n[ERROR] cannot connect',
    });
    expect(r.verdict).toBe('fail');
    expect(r.retry_recommended).toBe(true);
  });

  it('fails a code phase that changed nothing (no diff)', () => {
    const r = verifyCTOPhaseDeterministic({
      task_title: 'add tests',
      expected_output: 'implement new tests for auth flow',
      exit_code: 0,
      log_tail: 'OK',
      diff_summary: '',
    });
    expect(r.verdict).toBe('fail');
    expect(r.retry_recommended).toBe(true);
    expect(r.confidence).toBe('high');
  });

  it('fails a code phase when changed_files=0 even if diff_summary has noise', () => {
    const r = verifyCTOPhaseDeterministic({
      task_title: 'implement login',
      expected_output: '구현: login endpoint',
      exit_code: 0,
      log_tail: 'done',
      diff_summary: 'Already up to date.', // noise, no real change
      changed_files: 0,
    });
    expect(r.verdict).toBe('fail');
    expect(r.retry_recommended).toBe(true);
  });

  it('returns inconclusive when a NON-code phase has no diff', () => {
    const r = verifyCTOPhaseDeterministic({
      task_title: 'compare options',
      expected_output: 'comparison table of state libraries',
      exit_code: 0,
      log_tail: 'OK',
      diff_summary: '',
    });
    expect(r.verdict).toBe('inconclusive');
    expect(r.retry_recommended).toBe(false);
  });

  it('passes a code phase that actually changed files', () => {
    const r = verifyCTOPhaseDeterministic({
      task_title: 'implement login',
      expected_output: 'implement login endpoint',
      exit_code: 0,
      log_tail: 'done',
      diff_summary: 'src/login.ts | 30 +++\n1 file changed',
      changed_files: 1,
    });
    expect(r.verdict).toBe('pass');
  });

  it('returns pass when diff present and exit 0', () => {
    const r = verifyCTOPhaseDeterministic({
      task_title: 'add feature',
      expected_output: 'login endpoint',
      exit_code: 0,
      log_tail: 'done',
      diff_summary: 'src/login.ts | 30 +++\n1 file changed',
    });
    expect(r.verdict).toBe('pass');
    expect(r.confidence).toBe('high');
  });

  it('passes read-only task with no diff', () => {
    const r = verifyCTOPhaseDeterministic({
      task_title: 'audit',
      expected_output: 'review auth config and report',
      exit_code: 0,
      log_tail: 'reviewed 3 files',
      diff_summary: '',
    });
    expect(r.verdict).toBe('pass');
    expect(r.confidence).toBe('medium');
  });

  // E1 regression (execution-logs.json): a worker skipped the implement phase,
  // ticked every acceptance criterion ✅, and declared "이미 완료" — but changed
  // nothing. The verifier must fail this disguised skip, not pass it.
  it('E1 regression: skip disguised as done (AC ✅ but changed_files=0) fails', () => {
    const r = verifyCTOPhaseDeterministic({
      task_title: 'Key Content Agent 구현',
      expected_output: 'key-content-agent.ts 구현',
      exit_code: 0,
      log_tail:
        '| AC-5 | key-content.ts 미수정 | 변경 없음 (clean branch) ✅ |\n이 phase는 이전 커밋에서 이미 완료된 상태입니다.',
      changed_files: 0,
    });
    expect(r.verdict).toBe('fail');
    expect(r.retry_recommended).toBe(true);
  });

  it('fails an integrate phase that changed nothing (unwired)', () => {
    const r = verifyCTOPhaseDeterministic({
      task_title: 'wire key-content agent',
      expected_output: '신규 산출물을 orchestrator에 등록·연결한다',
      exit_code: 0,
      log_tail: '이미 충분함',
      changed_files: 0,
    });
    expect(r.verdict).toBe('fail');
    expect(r.reason).toMatch(/unwired/);
    expect(r.retry_recommended).toBe(true);
  });

  it('fails an integrate phase that only added new files (orphaned)', () => {
    const r = verifyCTOPhaseDeterministic({
      task_title: 'integrate skill into registry',
      expected_output: '신규 스킬을 registry에 등록하고 진입점에 배선한다',
      exit_code: 0,
      log_tail: 'created new file',
      diff_summary: 'src/skills/new-skill.ts | 80 +++\n1 file changed',
      changed_files: 1,
      modified_existing_files: 0,
    });
    expect(r.verdict).toBe('fail');
    expect(r.reason).toMatch(/orphaned/);
    expect(r.retry_recommended).toBe(true);
  });

  it('passes an integrate phase that modified an existing entry point', () => {
    const r = verifyCTOPhaseDeterministic({
      task_title: 'integrate skill into registry',
      expected_output: '신규 스킬을 registry에 등록하고 진입점에 배선한다',
      exit_code: 0,
      log_tail: 'registered',
      diff_summary: 'src/skills/new-skill.ts | 80 +++\nsrc/registry.ts | 4 ++\n2 files changed',
      changed_files: 2,
      modified_existing_files: 1,
    });
    expect(r.verdict).toBe('pass');
  });
});

describe('isIntegratePhaseName', () => {
  it('matches the SOP phase name and variants', () => {
    expect(isIntegratePhaseName('통합·배선')).toBe(true);
    expect(isIntegratePhaseName('integrate')).toBe(true);
    expect(isIntegratePhaseName('wiring into orchestrator')).toBe(true);
  });
  it('does not match other phases or empty input', () => {
    expect(isIntegratePhaseName('구현')).toBe(false);
    expect(isIntegratePhaseName('리뷰')).toBe(false);
    expect(isIntegratePhaseName(undefined)).toBe(false);
    expect(isIntegratePhaseName(null)).toBe(false);
  });
});

describe('verifyIntegratePhase (phase_complete orphan check, no expected needed)', () => {
  it('fails when only new files were added (orphaned), even with a non-integration expected', () => {
    const r = verifyIntegratePhase({
      task_title: 'wire key-content agent',
      expected_output: 'whatever the task says', // not an integration signal
      exit_code: 0,
      diff_summary: 'src/agents/new.ts | 90 +++\n1 file changed',
      changed_files: 1,
      modified_existing_files: 0,
    });
    expect(r.verdict).toBe('fail');
    expect(r.reason).toMatch(/orphaned/);
  });
  it('fails when nothing changed', () => {
    const r = verifyIntegratePhase({
      task_title: 'wire',
      expected_output: '',
      exit_code: 0,
      changed_files: 0,
    });
    expect(r.verdict).toBe('fail');
  });
  it('passes when an existing entry point was modified', () => {
    const r = verifyIntegratePhase({
      task_title: 'wire',
      expected_output: '',
      exit_code: 0,
      diff_summary: 'src/new.ts | 50 +\nsrc/index.ts | 3 +\n2 files changed',
      changed_files: 2,
      modified_existing_files: 1,
    });
    expect(r.verdict).toBe('pass');
  });
  it('fails on non-zero exit regardless of wiring', () => {
    const r = verifyIntegratePhase({
      task_title: 'wire',
      expected_output: '',
      exit_code: 1,
      changed_files: 2,
      modified_existing_files: 1,
    });
    expect(r.verdict).toBe('fail');
  });
});

describe('verifyCTOPhase (with LLM)', () => {
  it('skips LLM when deterministic returns high-confidence fail', async () => {
    let called = false;
    const llm: LLMClient = {
      complete: async () => {
        called = true;
        return '{"verdict":"pass","reason":"ok","confidence":"high"}';
      },
    };
    const r = await verifyCTOPhase(
      { task_title: 'x', expected_output: 'y', exit_code: 2 },
      llm,
    );
    expect(r.verdict).toBe('fail');
    expect(called).toBe(false);
  });

  it('uses LLM verdict when deterministic is inconclusive', async () => {
    const llm: LLMClient = {
      complete: async () =>
        '{"verdict":"pass","reason":"agent verified file unchanged intentionally","retry_recommended":false,"confidence":"medium"}',
    };
    const r = await verifyCTOPhase(
      {
        task_title: 'check',
        expected_output: 'modify config.yaml',
        exit_code: 0,
        log_tail: 'OK',
        diff_summary: '',
      },
      llm,
    );
    expect(r.verdict).toBe('pass');
    expect(r.reason).toMatch(/intentionally/);
  });

  it('falls back to deterministic on LLM parse failure', async () => {
    const llm: LLMClient = { complete: async () => 'garbage not json' };
    const r = await verifyCTOPhase(
      {
        task_title: 'x',
        expected_output: 'add file',
        exit_code: 0,
        diff_summary: 'foo.ts | 1 +',
        log_tail: 'done',
      },
      llm,
    );
    expect(r.verdict).toBe('pass');
  });

  it('falls back to deterministic on LLM throw', async () => {
    const llm: LLMClient = {
      complete: async () => {
        throw new Error('rate limit');
      },
    };
    const r = await verifyCTOPhase(
      {
        task_title: 'x',
        expected_output: 'add file',
        exit_code: 0,
        diff_summary: 'foo.ts | 1 +',
        log_tail: 'done',
      },
      llm,
    );
    expect(r.verdict).toBe('pass');
  });

  it('strips ```json fences from LLM output', async () => {
    const llm: LLMClient = {
      complete: async () =>
        '```json\n{"verdict":"fail","reason":"missing test","retry_recommended":true,"confidence":"high"}\n```',
    };
    const r = await verifyCTOPhase(
      {
        task_title: 'add test',
        expected_output: 'new test file',
        exit_code: 0,
        log_tail: 'wrote source only',
        diff_summary: 'src/foo.ts | 5 +',
      },
      llm,
    );
    expect(r.verdict).toBe('fail');
    expect(r.retry_recommended).toBe(true);
  });
});
