import { runSelfLearning, type SelfLearningOptions } from '../self-learning.js';
import type { TelegramClient } from '../../notifier/telegram.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Isolate all file writes to a fresh tmp dir per test so the real repo
// (docs/cto/cto-tool-catalog.md, .omc/state) is never touched.
let opts: SelfLearningOptions;
beforeEach(async () => {
  const base = await fs.mkdtemp(join(tmpdir(), 'self-learning-'));
  opts = { catalogPath: join(base, 'docs', 'cto-tool-catalog.md'), stateDir: join(base, 'state') };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTelegram(ok = true): { client: TelegramClient; calls: unknown[] } {
  const calls: unknown[] = [];
  const client: TelegramClient = {
    async send(msg) {
      calls.push(msg);
      return { ok, reason: ok ? undefined : 'mock-fail' };
    },
  };
  return { client, calls };
}

// ---------------------------------------------------------------------------
// Mock fetch to avoid real network calls in tests
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetch(responses: Record<string, { ok: boolean; text: string }>) {
  global.fetch = jest.fn(async (url: URL | string, _init?: RequestInit) => {
    const urlStr = url.toString();
    const matched = Object.entries(responses).find(([key]) => urlStr.includes(key));
    if (!matched) {
      throw new Error(`No mock for ${urlStr}`);
    }
    const [, resp] = matched;
    return {
      ok: resp.ok,
      status: resp.ok ? 200 : 500,
      text: async () => resp.text,
    } as Response;
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runSelfLearning', () => {
  it('returns a valid result structure', async () => {
    mockFetch({
      'anthropic': { ok: false, text: '' },
      'openai': { ok: false, text: '' },
      'antigravity': { ok: false, text: '' },
    });
    const { client } = makeTelegram();
    const result = await runSelfLearning(client, opts);

    expect(result.run_at).toBeTruthy();
    expect(typeof result.sources_checked).toBe('number');
    expect(typeof result.sources_changed).toBe('number');
    expect(typeof result.catalog_updated).toBe('boolean');
    expect(typeof result.notification_sent).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('is silent when all fetches fail (no changes detected)', async () => {
    mockFetch({
      'anthropic': { ok: false, text: '' },
      'openai': { ok: false, text: '' },
      'antigravity': { ok: false, text: '' },
    });
    const { client, calls } = makeTelegram();
    const result = await runSelfLearning(client, opts);

    expect(result.sources_changed).toBe(0);
    expect(result.notification_sent).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('is silent when all sources return same content as snapshot (no diff)', async () => {
    const content = 'stable content that never changes';
    mockFetch({
      'anthropic': { ok: true, text: content },
      'openai': { ok: true, text: content },
      'antigravity': { ok: true, text: content },
    });
    const { client: client1 } = makeTelegram();
    // First run — establishes snapshot
    await runSelfLearning(client1, opts);

    // Second run — same content, should be silent
    const { client: client2, calls } = makeTelegram();
    const result = await runSelfLearning(client2, opts);

    expect(result.sources_changed).toBe(0);
    expect(result.notification_sent).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('sends Telegram when new content is detected', async () => {
    // Use unique content per test run to guarantee a "new" diff
    const uniqueContent = `new changelog content ${Date.now()} ${Math.random()}`;
    mockFetch({
      'anthropic': { ok: true, text: uniqueContent },
      'openai': { ok: false, text: '' },
      'antigravity': { ok: false, text: '' },
    });
    const { client, calls } = makeTelegram();
    const result = await runSelfLearning(client, opts);

    expect(result.sources_changed).toBeGreaterThan(0);
    expect(calls.length).toBe(1);
    expect(result.notification_sent).toBe(true);
  });

  it('does not throw when all network calls fail', async () => {
    mockFetch({
      'anthropic': { ok: false, text: '' },
      'openai': { ok: false, text: '' },
      'antigravity': { ok: false, text: '' },
    });
    const { client } = makeTelegram();
    await expect(runSelfLearning(client, opts)).resolves.not.toThrow();
  });

  it('records fetch errors in result.errors', async () => {
    mockFetch({
      'anthropic': { ok: false, text: '' },
      'openai': { ok: false, text: '' },
      'antigravity': { ok: false, text: '' },
    });
    const { client } = makeTelegram();
    const result = await runSelfLearning(client, opts);

    // HTTP failures become errors
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('does not throw when telegram fails', async () => {
    const uniqueContent = `unique for telegram-fail test ${Date.now()} ${Math.random()}`;
    mockFetch({
      'anthropic': { ok: true, text: uniqueContent },
      'openai': { ok: false, text: '' },
      'antigravity': { ok: false, text: '' },
    });
    const { client } = makeTelegram(false); // telegram returns ok=false
    const result = await runSelfLearning(client, opts);

    expect(result).toBeDefined();
    if (result.sources_changed > 0) {
      expect(result.notification_sent).toBe(false);
    }
  });

  it('sources_checked equals total number of configured sources', async () => {
    mockFetch({
      'anthropic': { ok: false, text: '' },
      'openai': { ok: false, text: '' },
      'antigravity': { ok: false, text: '' },
    });
    const { client } = makeTelegram();
    const result = await runSelfLearning(client, opts);

    // 3 sources are configured
    expect(result.sources_checked).toBe(3);
  });
});
