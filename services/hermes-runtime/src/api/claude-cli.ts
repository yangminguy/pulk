// claude-cli.ts — 헤드리스 Claude CLI 실행기 (hermes 이식본).
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (§4 Claude 호출).
//
// agent-runtime spawn-agent.ts의 runAgentCommand를 hermes로 이식(cross-package dist 의존 회피,
// cto-native가 ACR spawn-runner를 이식한 선례와 동일). child_process만 쓰는 순수 spawn.
//
// ★ OpenAI 절대 미사용 — 두뇌는 Claude CLI 단일.
// ★ MCP off / 헤드리스: `claude -p`는 비대화형 단발. spawn env에 MCP 비활성을 주입.
// ★ never-throw: reject 안 함. spawn 실패=exitCode 1, 타임아웃=124(SIGTERM→5s→SIGKILL).

import { spawn } from 'node:child_process';

/** spawn으로 바로 넘길 수 있는 실행 커맨드(@l5/core cto-native CliCommand와 동형). */
export interface ClaudeCliCommand {
  cmd: string;
  args: string[];
  cwd: string;
  /** claude는 false(자체 3s stdin 타임아웃). codex류는 true(EOF 필요). */
  stdinNull: boolean;
}

export interface RunClaudeResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunClaudeOptions {
  /** Hard wall-clock 한계(ms). 만료 시 SIGTERM→5s후 SIGKILL, exitCode 124. */
  timeoutMs: number;
  /** 라이브 로그 콜백(라인 단위). */
  onLog?: (line: string) => void;
}

/**
 * ClaudeCliCommand를 spawn으로 실행하고 종료 시 {exitCode, stdout, stderr}를 resolve한다.
 * 절대 reject하지 않는다(spawn 에러는 exitCode 1로 환원). MCP는 env로 비활성화한다.
 */
export function runClaudeCommand(
  cmd: ClaudeCliCommand,
  opts: RunClaudeOptions,
): Promise<RunClaudeResult> {
  const { timeoutMs, onLog } = opts;

  return new Promise<RunClaudeResult>((resolve) => {
    const emit = (line: string) => {
      if (!onLog) return;
      try {
        onLog(line);
      } catch {
        // 로깅 실패는 무시(실행 흐름 보호).
      }
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd.cmd, cmd.args, {
        cwd: cmd.cwd,
        shell: false,
        stdio: [cmd.stdinNull ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // MCP off — 헤드리스 단발 분석엔 불필요(콜드스타트·팝업 방지).
          CLAUDE_DISABLE_MCP: '1',
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      emit(`[ERROR] spawn 실패: ${msg}`);
      resolve({ exitCode: 1, stdout: '', stderr: msg });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ exitCode, stdout, stderr });
    };

    const timer: NodeJS.Timeout = setTimeout(() => {
      emit(`[TIMEOUT] ${timeoutMs}ms 초과 — 종료.`);
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      killTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 5000);
      finish(124);
    }, timeoutMs);

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
    });
    child.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
    });
    child.on('close', (code) => finish(code ?? 1));
    child.on('error', (error) => {
      if (!stderr) stderr = error.message;
      finish(1);
    });
  });
}
