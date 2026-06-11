// worktree.ts — Native Orchestrator의 phase별 격리 worktree.
// ACR lib/worktree/worktree-manager.ts 참고: execFile('git', [...], shell:false)로
// 실제 `git worktree` 커맨드를 호출. 에이전트가 main repo를 직접 건드리지 않게 격리한다.
//
// Layout:
//   branch:   l5/phase-{phaseId}
//   worktree: {repo부모}/.l5-worktrees/{repoName}-{phaseId}

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** shell 없이 git을 실행한다(injection/quoting 회피). repo는 -C로 지정. */
async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', repoPath, ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/** phaseId를 브랜치/디렉터리에 안전한 슬러그로 정규화. */
function slug(phaseId: string): string {
  return phaseId.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'phase';
}

export interface PhaseWorktree {
  path: string;
  branch: string;
}

/** repo 기준 phase worktree 경로/브랜치를 결정론적으로 계산. */
function phaseWorktreeLocation(repo: string, phaseId: string): PhaseWorktree {
  const repoName = path.basename(path.resolve(repo));
  const parent = path.dirname(path.resolve(repo));
  const s = slug(phaseId);
  return {
    path: path.join(parent, '.l5-worktrees', `${repoName}-${s}`),
    branch: `l5/phase-${s}`,
  };
}

/**
 * phase 전용 worktree를 새 브랜치(HEAD에서 분기)로 생성한다.
 * git 실패 시 throw — 호출부(orchestrator)가 graceful하게 잡아 해당 phase를 보류한다.
 */
export async function createPhaseWorktree(
  repo: string,
  phaseId: string,
): Promise<PhaseWorktree> {
  const loc = phaseWorktreeLocation(repo, phaseId);
  await fs.mkdir(path.dirname(loc.path), { recursive: true });

  // git worktree add -b l5/phase-{id} <path> HEAD
  await git(repo, ['worktree', 'add', '-b', loc.branch, loc.path, 'HEAD']);
  return loc;
}

/**
 * phase 브랜치를 현재 base 브랜치로 병합한다(--no-ff, fast-forward 가능 시 ff).
 * git 실패 시 throw.
 */
export async function mergePhaseWorktree(repo: string, branch: string): Promise<void> {
  await git(repo, ['merge', '--no-edit', branch]);
}

/**
 * worktree를 제거하고 phase 브랜치를 정리한다. 부분 상태에 관대(idempotent):
 * 이미 사라진 worktree/브랜치는 에러로 보지 않는다.
 */
export async function removePhaseWorktree(repo: string, worktreePath: string): Promise<void> {
  try {
    await git(repo, ['worktree', 'remove', '--force', worktreePath]);
  } catch {
    // 이미 제거됨 / 생성 안 됨 — prune으로 진행.
  }
  try {
    await git(repo, ['worktree', 'prune']);
  } catch {
    /* best-effort */
  }
}
