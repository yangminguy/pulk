// spawn-agent.ts — Native Orchestrator의 에이전트 CLI 실행기.
// ACR(별도 Next.js 앱) lib/runner/spawn-runner.ts(99~188행)를 이식: child_process.spawn +
// stdin 'ignore'(codex 블록 방지) + 타임아웃 SIGTERM→5s후 SIGKILL→exitCode 124.
// CliCommand는 @l5/core cto-native가 만든 순수 커맨드(buildAgentCommand 출력)를 그대로 받는다.

import { spawn } from 'node:child_process';
import type { CliCommand } from '@l5/core/dist/functions/cto-native';

export interface RunAgentResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunAgentOptions {
  /** Hard wall-clock 한계(ms). 만료 시 SIGTERM→5s후 SIGKILL, exitCode 124. */
  timeoutMs: number;
  /** 라이브 로그 콜백(라인 단위). */
  onLog?: (line: string) => void;
}

/**
 * CliCommand를 spawn으로 실행하고 종료 시 {exitCode, stdout, stderr}를 resolve한다.
 * 절대 reject하지 않는다(spawn 에러는 exitCode 1로 환원) — 호출부(orchestrator)는 graceful.
 *
 * ★stdinNull=true면 stdin을 'ignore'(즉시 EOF)로 연다. codex는 인자 prompt를 받고도
 *   non-tty stdin 입력을 추가로 기다려 무한 블록하므로, EOF를 줘야 진행한다.
 *   stdinNull=false(claude)는 'pipe'(claude 자체 3s stdin 타임아웃으로 진행).
 */
export function runAgentCommand(
  cmd: CliCommand,
  opts: RunAgentOptions,
): Promise<RunAgentResult> {
  const { timeoutMs, onLog } = opts;

  return new Promise<RunAgentResult>((resolve) => {
    const emit = (line: string) => {
      if (onLog) {
        try {
          onLog(line);
        } catch {
          // 로깅 실패는 무시(실행 흐름 보호).
        }
      }
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd.cmd, cmd.args, {
        cwd: cmd.cwd,
        shell: false,
        // stdinNull이면 'ignore'(즉시 EOF) — codex 무한 블록 방지. 아니면 'pipe'.
        stdio: [cmd.stdinNull ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      emit(`[ERROR] Failed to spawn process: ${msg}`);
      resolve({ exitCode: 1, stdout: '', stderr: msg });
      return;
    }

    let stdout = '';
    let stderr = '';

    // onComplete가 close/error/timeout 레이스에서 정확히 한 번만 settle되도록 가드.
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;
    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ exitCode, stdout, stderr });
    };

    // wall-clock 타임아웃: 행 걸린 child를 죽이고 124(conventional timeout code) 반환.
    const timer: NodeJS.Timeout = setTimeout(() => {
      emit(`[TIMEOUT] Agent exceeded ${timeoutMs}ms — terminating.`);
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      // 5s 내 종료 안 하면 SIGKILL로 격상.
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
      text.split('\n').forEach((line: string) => {
        if (line.trim()) emit(line);
      });
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      text.split('\n').forEach((line: string) => {
        if (line.trim()) emit(`[stderr] ${line}`);
      });
    });

    child.on('close', (code) => {
      const exitCode = code ?? 1;
      if (!settled) emit(`[DONE] Exit code: ${exitCode}`);
      finish(exitCode);
    });

    child.on('error', (error) => {
      if (!settled) emit(`[ERROR] Failed to spawn process: ${error.message}`);
      if (!stderr) stderr = error.message;
      finish(1);
    });
  });
}
