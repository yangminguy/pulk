import type { MainAgent, RecommendFallbackAgent, GetFallbackChain } from './types';

const FALLBACKS: Record<MainAgent, MainAgent | null> = {
  'claude-code': 'codex',
  'codex': 'claude-code',
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
