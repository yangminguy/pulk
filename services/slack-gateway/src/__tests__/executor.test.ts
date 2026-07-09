// Executor — worktree isolation (rule 30). Git is injected as a fake GitExec so
// these tests assert the command sequence + fail-closed behavior without touching
// a real repo.

import {
  slackWorktreeDir,
  createSlackWorktree,
  cleanupSlackWorktree,
  type GitExec,
  type WorktreeHandle,
} from '../executor';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Call = { args: string[]; cwd: string };

/** A fake git that records calls and returns scripted results per subcommand. */
function fakeGit(
  script: (call: Call) => { code: number; stdout?: string; stderr?: string },
): { git: GitExec; calls: Call[] } {
  const calls: Call[] = [];
  const git: GitExec = async (args, cwd) => {
    calls.push({ args, cwd });
    const r = script({ args, cwd });
    return { code: r.code, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
  return { git, calls };
}

describe('slackWorktreeDir', () => {
  it('lives off-repo under the tmp dir, keyed by runId', () => {
    expect(slackWorktreeDir('r1')).toBe(join(tmpdir(), 'l5-slack-worktrees', 'r1'));
  });
});

describe('createSlackWorktree', () => {
  it('creates branch agent/slack-<runId> at an off-repo path', async () => {
    const { git, calls } = fakeGit(() => ({ code: 0 }));
    const wt = await createSlackWorktree(git, '/repo', 'r1');
    expect(wt).toEqual({ dir: slackWorktreeDir('r1'), branch: 'agent/slack-r1' });
    expect(calls[0].args).toEqual([
      '-C',
      '/repo',
      'worktree',
      'add',
      '-b',
      'agent/slack-r1',
      slackWorktreeDir('r1'),
      'HEAD',
    ]);
  });

  it('git failure → null (fail-closed, caller must not use main repo)', async () => {
    const { git } = fakeGit(() => ({ code: 128, stderr: 'fatal: already exists' }));
    const wt = await createSlackWorktree(git, '/repo', 'r1');
    expect(wt).toBeNull();
  });
});

describe('cleanupSlackWorktree', () => {
  const wt: WorktreeHandle = { dir: slackWorktreeDir('r1'), branch: 'agent/slack-r1' };

  it('no changes → removes worktree and deletes branch', async () => {
    const { git, calls } = fakeGit(({ args }) => {
      if (args.includes('status')) return { code: 0, stdout: '' }; // clean
      return { code: 0 };
    });
    const r = await cleanupSlackWorktree(git, '/repo', wt);
    expect(r).toEqual({ changed: false });
    const cmds = calls.map((c) => c.args.join(' '));
    expect(cmds).toContainEqual(`-C ${wt.dir} status --porcelain`);
    expect(cmds).toContainEqual(`-C /repo worktree remove ${wt.dir} --force`);
    expect(cmds).toContainEqual('-C /repo branch -D agent/slack-r1');
  });

  it('changes present → keeps the worktree (no remove/branch delete)', async () => {
    const { git, calls } = fakeGit(({ args }) => {
      if (args.includes('status')) return { code: 0, stdout: ' M src/foo.ts\n?? new.ts\n' };
      return { code: 0 };
    });
    const r = await cleanupSlackWorktree(git, '/repo', wt);
    expect(r).toEqual({ changed: true });
    const cmds = calls.map((c) => c.args.join(' '));
    expect(cmds.some((c) => c.includes('worktree remove'))).toBe(false);
    expect(cmds.some((c) => c.includes('branch -D'))).toBe(false);
  });

  it('status check failure → treated as changed (never removes a possibly-dirty tree)', async () => {
    const { git, calls } = fakeGit(({ args }) => {
      if (args.includes('status')) return { code: 1, stderr: 'not a git repo' };
      return { code: 0 };
    });
    const r = await cleanupSlackWorktree(git, '/repo', wt);
    expect(r).toEqual({ changed: true });
    expect(calls.map((c) => c.args.join(' ')).some((c) => c.includes('remove'))).toBe(false);
  });
});
