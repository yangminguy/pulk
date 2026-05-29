import { createTelegramClient } from '../telegram.js';
import type { TelegramMessage } from '../telegram.js';

function makeMsg(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    title: 'Test title',
    body: 'Test body',
    level: 'info',
    ...overrides,
  };
}

describe('createTelegramClient', () => {
  it('returns not configured when botToken missing', async () => {
    const client = createTelegramClient({ chatId: 'chat-123' });
    const result = await client.send(makeMsg());
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('telegram not configured');
  });

  it('returns not configured when chatId missing', async () => {
    const client = createTelegramClient({ botToken: 'token-abc' });
    const result = await client.send(makeMsg());
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('telegram not configured');
  });

  it('returns ok=true and calls fetch with correct payload on 200', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    });

    const client = createTelegramClient({
      botToken: 'tok',
      chatId: 'cid',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await client.send(makeMsg({ title: 'Hello', body: 'World', level: 'info' }));

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://api.telegram.org/bottok/sendMessage');
    const payload = JSON.parse(init.body as string);
    expect(payload.chat_id).toBe('cid');
    expect(payload.parse_mode).toBe('Markdown');
    expect(payload.text).toContain('ℹ️');
    expect(payload.text).toContain('Hello');
    expect(payload.text).toContain('World');
  });

  it('returns ok=false with reason on 500', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const client = createTelegramClient({
      botToken: 'tok',
      chatId: 'cid',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await client.send(makeMsg());

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('500');
    expect(result.reason).toContain('Internal Server Error');
  });

  it('deduplicates messages with the same dedupKey within TTL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    });

    const client = createTelegramClient({
      botToken: 'tok',
      chatId: 'cid',
      fetchImpl: fetchMock as unknown as typeof fetch,
      dedupTtlMs: 5000,
    });

    const first = await client.send(makeMsg({ dedupKey: 'approval:task-1' }));
    const second = await client.send(makeMsg({ dedupKey: 'approval:task-1' }));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.reason).toBe('deduped');
    // fetch only called once
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('includes 🔗 link in text when link is provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    });

    const client = createTelegramClient({
      botToken: 'tok',
      chatId: 'cid',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.send(makeMsg({ link: 'http://localhost:3002/approvals/123' }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(init.body as string);
    expect(payload.text).toContain('🔗');
    expect(payload.text).toContain('http://localhost:3002/approvals/123');
  });

  it('does not include 🔗 when no link provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    });

    const client = createTelegramClient({
      botToken: 'tok',
      chatId: 'cid',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.send(makeMsg());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(init.body as string);
    expect(payload.text).not.toContain('🔗');
  });

  it('uses warn icon for warn level', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    });

    const client = createTelegramClient({
      botToken: 'tok',
      chatId: 'cid',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.send(makeMsg({ level: 'warn' }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(init.body as string);
    expect(payload.text).toContain('⚠️');
  });

  it('uses urgent icon for urgent level', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    });

    const client = createTelegramClient({
      botToken: 'tok',
      chatId: 'cid',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.send(makeMsg({ level: 'urgent' }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(init.body as string);
    expect(payload.text).toContain('🚨');
  });
});
