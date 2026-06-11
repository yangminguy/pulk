import { buildAgentCommand } from '../cli-command';

describe('buildAgentCommand', () => {
  const BASE = { prompt: 'do the thing', cwd: '/workspace/run-1' };

  // ── claude-code ────────────────────────────────────────────────────────────

  it('claude-code: minimal', () => {
    const result = buildAgentCommand({ agent: 'claude-code', ...BASE });
    expect(result).toEqual({
      cmd: 'claude',
      args: ['-p', 'do the thing'],
      cwd: '/workspace/run-1',
      stdinNull: false,
    });
  });

  it('claude-code: with model', () => {
    const result = buildAgentCommand({ agent: 'claude-code', ...BASE, model: 'claude-opus-4-8' });
    expect(result.args).toEqual(['-p', 'do the thing', '--model', 'claude-opus-4-8']);
    expect(result.stdinNull).toBe(false);
  });

  it('claude-code: first phase (--session-id)', () => {
    const result = buildAgentCommand({
      agent: 'claude-code', ...BASE,
      claudeSessionId: 'sess-abc', claudeResume: false,
    });
    expect(result.args).toContain('--session-id');
    expect(result.args).toContain('sess-abc');
    expect(result.args).not.toContain('--resume');
  });

  it('claude-code: resume phase (--resume)', () => {
    const result = buildAgentCommand({
      agent: 'claude-code', ...BASE,
      claudeSessionId: 'sess-abc', claudeResume: true,
    });
    expect(result.args).toContain('--resume');
    expect(result.args).toContain('sess-abc');
    expect(result.args).not.toContain('--session-id');
  });

  it('claude-code: session + model ordering', () => {
    const result = buildAgentCommand({
      agent: 'claude-code', ...BASE,
      claudeSessionId: 'sess-xyz', claudeResume: true, model: 'claude-sonnet-4-6',
    });
    expect(result.args).toEqual([
      '-p', 'do the thing',
      '--resume', 'sess-xyz',
      '--model', 'claude-sonnet-4-6',
    ]);
  });

  it('claude-code: no session flags when claudeSessionId is absent', () => {
    const result = buildAgentCommand({ agent: 'claude-code', ...BASE, claudeResume: true });
    expect(result.args).not.toContain('--resume');
    expect(result.args).not.toContain('--session-id');
  });

  // ── codex ─────────────────────────────────────────────────────────────────

  it('codex: minimal — stdinNull=true', () => {
    const result = buildAgentCommand({ agent: 'codex', ...BASE });
    expect(result).toEqual({
      cmd: 'codex',
      args: ['exec', '--cd', '/workspace/run-1', 'do the thing'],
      cwd: '/workspace/run-1',
      stdinNull: true,
    });
  });

  it('codex: with model', () => {
    const result = buildAgentCommand({ agent: 'codex', ...BASE, model: 'gpt-5.5' });
    expect(result.args).toEqual(['exec', '--cd', '/workspace/run-1', 'do the thing', '--model', 'gpt-5.5']);
    expect(result.stdinNull).toBe(true);
  });

  it('codex: ignores claudeSessionId', () => {
    const result = buildAgentCommand({ agent: 'codex', ...BASE, claudeSessionId: 'sess-abc' });
    expect(result.args.join(' ')).not.toContain('sess-abc');
  });

  // ── antigravity ───────────────────────────────────────────────────────────

  it('antigravity: minimal — cmd=agy, stdinNull=true', () => {
    const result = buildAgentCommand({ agent: 'antigravity', ...BASE });
    expect(result).toEqual({
      cmd: 'agy',
      args: ['--sandbox', '--add-dir', '/workspace/run-1', '-p', 'do the thing'],
      cwd: '/workspace/run-1',
      stdinNull: true,
    });
  });

  it('antigravity: with model', () => {
    const result = buildAgentCommand({
      agent: 'antigravity', ...BASE, model: 'gemini-3.5-flash-high',
    });
    expect(result.args).toEqual([
      '--sandbox', '--add-dir', '/workspace/run-1', '-p', 'do the thing',
      '--model', 'gemini-3.5-flash-high',
    ]);
    expect(result.stdinNull).toBe(true);
  });

  // ── invalid agent ─────────────────────────────────────────────────────────

  it('throws for unknown agent', () => {
    expect(() =>
      buildAgentCommand({ agent: 'unknown' as never, ...BASE })
    ).toThrow('Unsupported agent: unknown');
  });
});
