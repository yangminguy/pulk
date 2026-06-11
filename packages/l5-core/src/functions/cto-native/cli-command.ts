import type { BuildCommandInput, CliCommand } from './types';

/**
 * 에이전트 타입에 따라 spawn용 CliCommand를 생성한다. 순수 함수 — 부작용 없음.
 *
 * 규약:
 *  claude-code → cmd 'claude', args ['-p', prompt] (+ session 플래그) (+ model 플래그)
 *               stdinNull=false (claude 자체 3s stdin 타임아웃으로 진행)
 *  codex       → cmd 'codex', args ['exec','--cd',cwd, prompt] (+ model 플래그)
 *               stdinNull=TRUE (stdin EOF 없으면 블록)
 *  antigravity → cmd 'agy', args ['--sandbox','--add-dir',cwd,'-p',prompt] (+ model 플래그)
 *               stdinNull=true
 */
export function buildAgentCommand(input: BuildCommandInput): CliCommand {
  const { agent, prompt, cwd, model, claudeSessionId, claudeResume } = input;

  if (agent === 'claude-code') {
    const args: string[] = ['-p', prompt];
    if (claudeSessionId) {
      args.push(claudeResume ? '--resume' : '--session-id', claudeSessionId);
    }
    if (model) {
      args.push('--model', model);
    }
    return { cmd: 'claude', args, cwd, stdinNull: false };
  }

  if (agent === 'codex') {
    const args: string[] = ['exec', '--cd', cwd, prompt];
    if (model) {
      args.push('--model', model);
    }
    return { cmd: 'codex', args, cwd, stdinNull: true };
  }

  if (agent === 'antigravity') {
    const args: string[] = ['--sandbox', '--add-dir', cwd, '-p', prompt];
    if (model) {
      args.push('--model', model);
    }
    return { cmd: 'agy', args, cwd, stdinNull: true };
  }

  throw new Error(`Unsupported agent: ${agent}`);
}
