// skill-executor-node.ts — createSkillExecutor의 실제 IO 배선(경계).
//
// 순수 코어(skill-executor.ts)에 node fs/crypto/path + 기존 spawn 인프라(runAgentCommand +
// buildAgentCommand)를 주입한다. 이 파일은 IO 경계라 단위 테스트 대상이 아니며, 라이브
// 스모크로 검증한다. headless claude가 파일을 쓰려면 도구 승인이 필요하므로 acceptEdits +
// --add-dir(run 디렉토리)를 부여한다.

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// 값 import는 ESM 런타임에서 디렉토리 import 불가 → 명시적 /index.js (dir import ERR 방지).
import { buildAgentCommand } from '@l5/core/dist/functions/cto-native/index.js';
import type { ClaudeModel } from '@l5/core/dist/functions/cto-native/types.js';
import { runAgentCommand } from '../orchestrator/spawn-agent.js';
import { createSkillExecutor, type CreateSkillExecutorOptions, type SkillExecutorIO } from './skill-executor.js';

// headless claude가 호스트 MCP 서버(oh-my-claudecode 등)를 로드하지 않도록 빈 MCP config.
// claude-cli-client.ts와 동일 전략 — 콜드스타트/팝업 방지, 라운드 ~8.8s→~4.2s.
const EMPTY_MCP_CONFIG_PATH = (() => {
  try {
    const p = join(tmpdir(), 'l5-skill-executor-empty-mcp.json');
    writeFileSync(p, '{"mcpServers":{}}');
    return p;
  } catch {
    return null;
  }
})();

export interface DefaultSkillExecutorOptions {
  skillsRoot: string;
  runsRoot: string;
  /** claude 모델(생략 시 CLI 기본). */
  model?: ClaudeModel;
  /** 스킬 1회 실행 wall-clock 한계(ms). 기본 10분. */
  timeoutMs?: number;
  onLog?: (line: string) => void;
  /** 아티팩트 계약(기본 video_production_v1). content-planning 스킬은 content_planning_v1. */
  contract?: CreateSkillExecutorOptions['contract'];
}

export function createDefaultSkillExecutor(opts: DefaultSkillExecutorOptions) {
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  const io: SkillExecutorIO = {
    skillsRoot: opts.skillsRoot,
    runsRoot: opts.runsRoot,
    join,
    readFile: (path) => readFile(path, 'utf8'),
    writeFile: (path, data) => writeFile(path, data, 'utf8'),
    mkdirp: async (path) => {
      await mkdir(path, { recursive: true });
    },
    listJson: async (dir) => {
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        return [];
      }
      return entries
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => join(dir, name));
    },
    runClaude: async ({ prompt, cwd }) => {
      const cmd = buildAgentCommand({ agent: 'claude-code', prompt, cwd, model: opts.model });
      // headless에서 파일 쓰기 도구를 승인 없이 쓰도록 + run 디렉토리 접근 허용.
      cmd.args.push('--permission-mode', 'acceptEdits', '--add-dir', cwd);
      // 호스트 MCP 서버 로드 차단(콜드스타트/팝업 방지).
      if (EMPTY_MCP_CONFIG_PATH) {
        cmd.args.push('--strict-mcp-config', '--mcp-config', EMPTY_MCP_CONFIG_PATH);
      }
      const res = await runAgentCommand(cmd, { timeoutMs, onLog: opts.onLog });
      return { exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr };
    },
    checksum: (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  };
  return createSkillExecutor(io, { contract: opts.contract });
}
