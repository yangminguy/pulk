import { SlackNotifier } from '../adapters/slack';

describe('SlackNotifier.notify', () => {
  it('posts an mrkdwn message with channel + thread_ts', async () => {
    const calls: { url: string; body: any }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }) as unknown as typeof fetch;
    const slack = new SlackNotifier({ token: 'xoxb-1', fetchImpl, log: () => {} });
    await slack.notify({ channel: 'C1', threadTs: '123.456', text: 'hello' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://slack.com/api/chat.postMessage');
    expect(calls[0].body).toEqual({ channel: 'C1', text: 'hello', mrkdwn: true, thread_ts: '123.456' });
  });

  it('falls back to the default channel', async () => {
    const calls: any[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)));
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }) as unknown as typeof fetch;
    const slack = new SlackNotifier({ token: 'xoxb-1', defaultChannel: 'CDEF', fetchImpl, log: () => {} });
    await slack.notify({ text: 'hi' });
    expect(calls[0].channel).toBe('CDEF');
  });

  it('skips (no fetch) when token missing', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }) as unknown as typeof fetch;
    const slack = new SlackNotifier({ token: '', fetchImpl, log: () => {} });
    await slack.notify({ channel: 'C1', text: 'x' });
    expect(called).toBe(false);
  });

  it('swallows a failed post (never throws)', async () => {
    const fetchImpl = (async () => {
      return { ok: false, status: 500, json: async () => ({ ok: false, error: 'boom' }) } as Response;
    }) as unknown as typeof fetch;
    const slack = new SlackNotifier({ token: 'xoxb-1', fetchImpl, log: () => {} });
    await expect(slack.notify({ channel: 'C1', text: 'x' })).resolves.toBeUndefined();
  });
});
