import { recommendFallbackAgent, getFallbackChain } from '../fallback';

describe('recommendFallbackAgent', () => {
  it('claude-code → codex', () => {
    expect(recommendFallbackAgent('claude-code')).toBe('codex');
  });

  it('codex → claude-code', () => {
    expect(recommendFallbackAgent('codex')).toBe('claude-code');
  });

  it('antigravity → claude-code', () => {
    expect(recommendFallbackAgent('antigravity')).toBe('claude-code');
  });
});

describe('getFallbackChain', () => {
  it('claude-code 체인: [codex] — codex→claude-code는 시작점 재방문이므로 중단', () => {
    // claude-code(visited) → codex → claude-code(visited, stop)
    expect(getFallbackChain('claude-code')).toEqual(['codex']);
  });

  it('codex 체인: [claude-code] — claude-code→codex는 시작점 재방문이므로 중단', () => {
    expect(getFallbackChain('codex')).toEqual(['claude-code']);
  });

  it('antigravity 체인: [claude-code, codex] — antigravity→claude-code→codex→claude-code(visited)', () => {
    expect(getFallbackChain('antigravity')).toEqual(['claude-code', 'codex']);
  });

  it('체인 길이는 최대 3', () => {
    const chain = getFallbackChain('claude-code');
    expect(chain.length).toBeLessThanOrEqual(3);
  });

  it('체인에 중복 에이전트 없음', () => {
    for (const agent of ['claude-code', 'codex', 'antigravity'] as const) {
      const chain = getFallbackChain(agent);
      expect(new Set(chain).size).toBe(chain.length);
    }
  });

  it('시작 에이전트 자신은 체인에 포함되지 않음', () => {
    expect(getFallbackChain('claude-code')).not.toContain('claude-code');
    expect(getFallbackChain('codex')).not.toContain('codex');
    expect(getFallbackChain('antigravity')).not.toContain('antigravity');
  });
});
