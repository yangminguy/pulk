import {
  verifyCTOPhase,
  verifyCTOPhaseDeterministic,
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

  it('returns inconclusive when no diff and not read-only', () => {
    const r = verifyCTOPhaseDeterministic({
      task_title: 'add tests',
      expected_output: 'new tests added for auth flow',
      exit_code: 0,
      log_tail: 'OK',
      diff_summary: '',
    });
    expect(r.verdict).toBe('inconclusive');
    expect(r.retry_recommended).toBe(false);
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
