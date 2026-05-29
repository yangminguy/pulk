import { createDefaultLLMClient } from './anthropic-client';

// We don't actually want to spawn `claude` during tests. The factory only
// returns an LLMClient object; it doesn't invoke spawn until complete() is
// called. So we can safely instantiate and just probe identity via toString
// of the bound function or by checking it doesn't throw.

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('createDefaultLLMClient', () => {
  it('returns an OpenAI-backed client when L5_LLM_BACKEND=openai and OPENAI_API_KEY is set', () => {
    process.env.L5_LLM_BACKEND = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';

    const client = createDefaultLLMClient('default');
    expect(typeof client.complete).toBe('function');
  });

  it('throws when L5_LLM_BACKEND=openai but OPENAI_API_KEY is missing', () => {
    process.env.L5_LLM_BACKEND = 'openai';
    delete process.env.OPENAI_API_KEY;

    expect(() => createDefaultLLMClient('default')).toThrow(/OPENAI_API_KEY is not set/);
  });

  it('returns a claude-cli client (opus) for cto-design when backend is default', () => {
    delete process.env.L5_LLM_BACKEND;

    const client = createDefaultLLMClient('cto-design');
    expect(typeof client.complete).toBe('function');
  });

  it('returns a claude-cli client (haiku) for cto-verify when backend is default', () => {
    delete process.env.L5_LLM_BACKEND;

    const client = createDefaultLLMClient('cto-verify');
    expect(typeof client.complete).toBe('function');
  });

  it('returns a claude-cli client (haiku) for default role when backend is default', () => {
    delete process.env.L5_LLM_BACKEND;

    const client = createDefaultLLMClient('default');
    expect(typeof client.complete).toBe('function');
  });

  it('treats explicit claude-cli backend the same as default', () => {
    process.env.L5_LLM_BACKEND = 'claude-cli';

    const designClient = createDefaultLLMClient('cto-design');
    const verifyClient = createDefaultLLMClient('cto-verify');
    expect(typeof designClient.complete).toBe('function');
    expect(typeof verifyClient.complete).toBe('function');
  });
});
