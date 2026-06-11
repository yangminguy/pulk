import { recommendFallbackAgent, getFallbackChain } from '../fallback';

describe('recommendFallbackAgent', () => {
  it('claude-code → codex', () => {
    expect(recommendFallbackAgent('claude-code')).toBe('codex');
  });

  it('codex → antigravity (3-풀 로테이션)', () => {
    expect(recommendFallbackAgent('codex')).toBe('antigravity');
  });

  it('antigravity → claude-code', () => {
    expect(recommendFallbackAgent('antigravity')).toBe('claude-code');
  });
});

describe('getFallbackChain (3-풀 로테이션 — 나머지 둘을 모두 커버)', () => {
  it('claude-code 체인: [codex, antigravity]', () => {
    // claude-code → codex → antigravity → claude-code(visited, stop)
    expect(getFallbackChain('claude-code')).toEqual(['codex', 'antigravity']);
  });

  it('codex 체인: [antigravity, claude-code]', () => {
    expect(getFallbackChain('codex')).toEqual(['antigravity', 'claude-code']);
  });

  it('antigravity 체인: [claude-code, codex]', () => {
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
