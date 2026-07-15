// CMO research bridge — request parsing + detached CLI launch.
// spawn/fs are injected as fakes (mirrors executor.test's GitExec pattern) so
// these tests never touch a real child process or filesystem.

import {
  parseResearchRequest,
  launchResearchRun,
  researchCliPath,
  type SpawnFn,
  type SpawnedChild,
} from '../research-bridge';
import { join } from 'node:path';

describe('parseResearchRequest', () => {
  it('extracts the topic from a "리서치:" prefix', () => {
    const r = parseResearchRequest('리서치: AI 코딩 에이전트 시장');
    expect(r.topic).toBe('AI 코딩 에이전트 시장');
  });

  it('extracts the topic from a whitespace "리서치 " prefix', () => {
    expect(parseResearchRequest('리서치 노코드 자동화 툴').topic).toBe('노코드 자동화 툴');
  });

  it('extracts the topic from an English "research:" prefix', () => {
    expect(parseResearchRequest('research: vector databases').topic).toBe('vector databases');
  });

  it('extracts the topic from a "…리서치해줘" / "…리서치 해줘" suffix', () => {
    expect(parseResearchRequest('숏폼 편집 트렌드 리서치해줘').topic).toBe('숏폼 편집 트렌드');
    expect(parseResearchRequest('숏폼 편집 트렌드 리서치 해줘').topic).toBe('숏폼 편집 트렌드');
  });

  it('infers CONTENT_PLANNING when 콘텐츠/기획 appear', () => {
    expect(parseResearchRequest('리서치: 유튜브 콘텐츠 아이디어').researchPurpose).toBe(
      'CONTENT_PLANNING',
    );
    expect(parseResearchRequest('리서치: 신규 채널 기획').researchPurpose).toBe('CONTENT_PLANNING');
  });

  it('infers TECHNICAL_RESEARCH on technical keywords', () => {
    expect(parseResearchRequest('리서치: RAG 아키텍처 프레임워크').researchPurpose).toBe(
      'TECHNICAL_RESEARCH',
    );
    expect(parseResearchRequest('리서치: LLM API 배포 전략').researchPurpose).toBe(
      'TECHNICAL_RESEARCH',
    );
  });

  it('defaults to LEARNING otherwise', () => {
    expect(parseResearchRequest('리서치: 스토아 철학 입문').researchPurpose).toBe('LEARNING');
  });

  it('content heuristic wins over technical when both present', () => {
    // "콘텐츠" + "코딩" → content-planning takes precedence (spec order)
    expect(parseResearchRequest('리서치: 코딩 유튜브 콘텐츠').researchPurpose).toBe(
      'CONTENT_PLANNING',
    );
  });

  it('honors an explicit 목적= override and strips it from the topic', () => {
    const r = parseResearchRequest('리서치: 스토아 철학 목적=TECHNICAL_RESEARCH');
    expect(r.researchPurpose).toBe('TECHNICAL_RESEARCH');
    expect(r.topic).toBe('스토아 철학');
  });

  it('ignores an invalid 목적= value and falls back to the heuristic', () => {
    const r = parseResearchRequest('리서치: 스토아 철학 목적=NONSENSE');
    expect(r.researchPurpose).toBe('LEARNING');
    // invalid override token is left out of the topic body
    expect(r.topic).toBe('스토아 철학');
  });

  it('captures a 질문= override into researchQuestion', () => {
    const r = parseResearchRequest('리서치: 숏폼 성장 질문=구독자 전환의 핵심 변수는?');
    expect(r.topic).toBe('숏폼 성장');
    expect(r.researchQuestion).toBe('구독자 전환의 핵심 변수는?');
  });

  it('parses 목적= and 질문= together regardless of position', () => {
    const r = parseResearchRequest(
      '리서치: 코딩 에이전트 목적=CONTENT_PLANNING 질문=어떤 데모가 가장 반응이 좋은가',
    );
    expect(r.researchPurpose).toBe('CONTENT_PLANNING');
    expect(r.topic).toBe('코딩 에이전트');
    expect(r.researchQuestion).toBe('어떤 데모가 가장 반응이 좋은가');
  });

  it('omits researchQuestion when not specified', () => {
    expect(parseResearchRequest('리서치: 스토아 철학').researchQuestion).toBeUndefined();
  });
});

// A fake spawn that records the call and returns a controllable child.
function fakeSpawn(pid = 4321): {
  fn: SpawnFn;
  calls: { command: string; args: string[]; options: unknown }[];
  unrefCount: () => number;
} {
  const calls: { command: string; args: string[]; options: unknown }[] = [];
  let unrefs = 0;
  const fn: SpawnFn = (command, args, options) => {
    calls.push({ command, args, options });
    const child: SpawnedChild = { pid, unref: () => (unrefs += 1) };
    return child;
  };
  return { fn, calls, unrefCount: () => unrefs };
}

describe('launchResearchRun', () => {
  const baseArgs = {
    request: { topic: 'AI 코딩 툴', researchPurpose: 'TECHNICAL_RESEARCH' as const },
    channel: 'C123',
    threadTs: '1700000000.000100',
    repoRoot: '/repo',
  };

  it('does NOT spawn and returns a clear error when the CLI file is absent', () => {
    const spawn = fakeSpawn();
    const r = launchResearchRun({
      ...baseArgs,
      fileExists: () => false,
      spawnProcess: spawn.fn,
      openLogFd: () => 'ignore',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain(researchCliPath('/repo'));
    expect(r.cliPath).toBe(researchCliPath('/repo'));
    expect(spawn.calls).toHaveLength(0);
  });

  it('detached-spawns the CLI with the exact argv contract and unrefs', () => {
    const spawn = fakeSpawn(9999);
    const r = launchResearchRun({
      ...baseArgs,
      fileExists: () => true,
      openLogFd: () => 7, // pretend fd
      spawnProcess: spawn.fn,
    });

    expect(r.ok).toBe(true);
    expect(r.pid).toBe(9999);
    expect(spawn.calls).toHaveLength(1);
    expect(spawn.unrefCount()).toBe(1);

    const call = spawn.calls[0];
    expect(call.command).toBe('node');
    expect(call.args).toEqual([
      researchCliPath('/repo'),
      '--request',
      JSON.stringify(baseArgs.request),
      '--slack-channel',
      'C123',
      '--slack-thread',
      '1700000000.000100',
    ]);
    expect(r.argv).toEqual(call.args);
    expect(call.options).toMatchObject({
      detached: true,
      stdio: ['ignore', 7, 7],
      cwd: '/repo',
    });
  });

  it('honors an explicit cliPath override', () => {
    const spawn = fakeSpawn();
    const custom = join('/somewhere', 'cli.js');
    const r = launchResearchRun({
      ...baseArgs,
      cliPath: custom,
      fileExists: (p) => p === custom,
      openLogFd: () => 'ignore',
      spawnProcess: spawn.fn,
    });
    expect(r.ok).toBe(true);
    expect(r.cliPath).toBe(custom);
    expect(spawn.calls[0].args[0]).toBe(custom);
  });

  it('returns ok:false (never throws) when spawn itself fails', () => {
    const throwing: SpawnFn = () => {
      throw new Error('EACCES');
    };
    const r = launchResearchRun({
      ...baseArgs,
      fileExists: () => true,
      openLogFd: () => 'ignore',
      spawnProcess: throwing,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('EACCES');
  });
});
