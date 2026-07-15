// slack adapter — SlackNotifyPort via raw fetch chat.postMessage (mrkdwn).
//
// Token: RESEARCH_SLACK_BOT_TOKEN ?? SLACK_CMO_BOT_TOKEN. Channel/thread come
// from the CLI (--slack-channel/--slack-thread). Summary text only — NO file
// upload (founder policy B). A failed post is logged and swallowed: publishing
// the notification is never allowed to fail the research run (spec §7.5).

import type { SlackNotifyInput, SlackNotifyPort } from '@l5/core';

const CHAT_POST_MESSAGE = 'https://slack.com/api/chat.postMessage';

export type FetchFn = typeof fetch;

export interface SlackNotifierOptions {
  token: string;
  defaultChannel?: string;
  fetchImpl?: FetchFn;
  log?: (msg: string) => void;
}

export class SlackNotifier implements SlackNotifyPort {
  private readonly token: string;
  private readonly defaultChannel?: string;
  private readonly fetchImpl: FetchFn;
  private readonly log: (msg: string) => void;

  constructor(opts: SlackNotifierOptions) {
    this.token = opts.token;
    this.defaultChannel = opts.defaultChannel;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.log = opts.log ?? ((m) => process.stderr.write(`${m}\n`));
  }

  async notify(input: SlackNotifyInput): Promise<void> {
    const channel = input.channel ?? this.defaultChannel;
    if (!this.token) {
      this.log('[slack] disabled — no RESEARCH_SLACK_BOT_TOKEN/SLACK_CMO_BOT_TOKEN');
      return;
    }
    if (!channel) {
      this.log('[slack] no channel supplied — skipping notify');
      return;
    }
    const body: Record<string, unknown> = { channel, text: input.text, mrkdwn: true };
    if (input.threadTs) body.thread_ts = input.threadTs;

    try {
      const res = await this.fetchImpl(CHAT_POST_MESSAGE, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        this.log(`[slack] postMessage failed (non-fatal): ${data.error ?? res.status}`);
      }
    } catch (err) {
      this.log(`[slack] postMessage error (non-fatal): ${(err as Error).message}`);
    }
  }
}
