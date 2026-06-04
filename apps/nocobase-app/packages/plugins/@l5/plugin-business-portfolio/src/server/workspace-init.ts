import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

/**
 * Returns the workspace root directory. Controlled by L5_WORKSPACE_ROOT env var;
 * defaults to ~/l5-workspace.
 */
export function getWorkspaceRoot(): string {
  return process.env.L5_WORKSPACE_ROOT ?? path.join(os.homedir(), 'l5-workspace');
}

/**
 * Returns the canonical repo path for a given business id.
 */
export function getRepoPath(businessId: string | number): string {
  return path.join(getWorkspaceRoot(), `business-${businessId}`);
}

/**
 * Guard: returns true if the path is safe to git-init.
 * Rejects /, home root, project root, and anything that isn't an absolute path
 * inside the workspace root.
 */
function isSafePath(repoPath: string): boolean {
  const home = os.homedir();
  const projectRoot = path.resolve('/Users/wonminyang/Desktop/pulk');
  const workspaceRoot = getWorkspaceRoot();

  // Must be absolute
  if (!path.isAbsolute(repoPath)) return false;

  // Must not be dangerous top-level paths
  const dangerous = ['/', home, projectRoot, workspaceRoot];
  if (dangerous.includes(repoPath)) return false;

  // Must be a direct child of workspace root (one level deep), e.g. ~/l5-workspace/business-1
  const parent = path.dirname(repoPath);
  if (parent !== workspaceRoot) return false;

  // Must match the expected naming convention
  if (!/^business-\d+$/.test(path.basename(repoPath))) return false;

  return true;
}

/**
 * Ensures the directory at repoPath exists and is a git repo with at least one commit.
 * Idempotent: safe to call on an already-initialised repo.
 *
 * Throws if:
 *  - repoPath fails the safety guard
 *  - repoPath exists and is not empty AND does not contain a .git directory
 *    (we never overwrite a pre-existing non-git directory we didn't create)
 */
export async function ensureWorkspaceRepo(repoPath: string): Promise<void> {
  if (!isSafePath(repoPath)) {
    throw new Error(`[workspace-init] Rejected unsafe repo path: ${repoPath}`);
  }

  const gitDir = path.join(repoPath, '.git');
  const dirExists = fs.existsSync(repoPath);
  const isGitRepo = fs.existsSync(gitDir);

  // If the directory exists but is not a git repo and is non-empty, skip conservatively
  if (dirExists && !isGitRepo) {
    const entries = fs.readdirSync(repoPath);
    if (entries.length > 0) {
      throw new Error(
        `[workspace-init] ${repoPath} exists, is non-empty, and is not a git repo — skipping to avoid data loss`
      );
    }
  }

  // Create directory if missing
  if (!dirExists) {
    fs.mkdirSync(repoPath, { recursive: true });
  }

  // git init (idempotent — safe to re-run on an existing repo)
  if (!isGitRepo) {
    execFileSync('git', ['init', repoPath], { stdio: 'pipe' });
  }

  // Check if the repo already has commits
  try {
    execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], { stdio: 'pipe' });
    // Has commits — nothing more to do
    return;
  } catch {
    // No commits yet — create an initial empty commit
  }

  execFileSync(
    'git',
    [
      '-c', 'user.email=l5-system@local',
      '-c', 'user.name=L5 System',
      '-C', repoPath,
      'commit',
      '--allow-empty',
      '-m', 'chore: initial workspace commit',
    ],
    { stdio: 'pipe' }
  );
}
