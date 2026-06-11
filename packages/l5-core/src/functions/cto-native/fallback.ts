import type { MainAgent, RecommendFallbackAgent, GetFallbackChain } from './types';

// 3-풀 로테이션: 한 풀이 소진되면 나머지 둘이 순서대로 끌어간다. claude+codex가 모두
// 소진돼도 antigravity로 넘어가 idle을 막는다(과거엔 claude↔codex만 돌아 agy가 놀았음).
// 코드 작업의 agy 위험(동명파일 오수정 등)은 실제 verify_command 게이트가 잡으므로 안전.
const FALLBACKS: Record<MainAgent, MainAgent | null> = {
  'claude-code': 'codex',
  'codex': 'antigravity',
  'antigravity': 'claude-code',
};

export const recommendFallbackAgent: RecommendFallbackAgent = (current) => {
  return FALLBACKS[current] ?? null;
};

export const getFallbackChain: GetFallbackChain = (current) => {
  const chain: MainAgent[] = [];
  const visited = new Set<MainAgent>();
  visited.add(current);

  let agent: MainAgent | null = current;
  for (let i = 0; i < 3; i++) {
    const fallback = recommendFallbackAgent(agent);
    if (!fallback || visited.has(fallback)) break;
    visited.add(fallback);
    chain.push(fallback);
    agent = fallback;
  }

  return chain;
};
