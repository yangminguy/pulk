// Slack Web API client — raw fetch, no SDK dependency (mirrors telegram-api.ts).
// One instance per bot (bound to that bot's xoxb token).

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

interface SlackOk {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
}

export interface AuthTestResult {
  user_id: string;
  user: string;
  team: string;
  team_id: string;
}

export class SlackApi {
  constructor(private botToken: string) {}

  private async callJson<T extends SlackOk>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${this.botToken}`,
      },
      body: JSON.stringify(params),
    });
    const json = (await res.json()) as T;
    if (!json.ok) throw new Error(`slack ${method}: ${json.error ?? 'unknown_error'}`);
    return json;
  }

  private async callForm<T extends SlackOk>(
    method: string,
    params: Record<string, string>,
  ): Promise<T> {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${this.botToken}`,
      },
      body: new URLSearchParams(params).toString(),
    });
    const json = (await res.json()) as T;
    if (!json.ok) throw new Error(`slack ${method}: ${json.error ?? 'unknown_error'}`);
    return json;
  }

  async authTest(): Promise<AuthTestResult> {
    const r = await this.callJson<SlackOk & AuthTestResult>('auth.test', {});
    return { user_id: r.user_id, user: r.user, team: r.team, team_id: r.team_id };
  }

  async postMessage(args: {
    channel: string;
    text: string;
    thread_ts?: string;
  }): Promise<{ ts: string }> {
    const r = await this.callJson<SlackOk & { ts: string }>('chat.postMessage', {
      channel: args.channel,
      text: args.text,
      thread_ts: args.thread_ts,
      unfurl_links: false,
      unfurl_media: false,
    });
    return { ts: r.ts };
  }

  /** Best-effort join of a public channel. Requires channels:join scope; caller may ignore failure. */
  async joinChannel(channel: string): Promise<void> {
    await this.callForm('conversations.join', { channel });
  }

  /**
   * Upload a local file into a channel thread using Slack's external upload flow:
   *   files.getUploadURLExternal → PUT bytes → files.completeUploadExternal.
   */
  async uploadFile(
    filePath: string,
    channel: string,
    threadTs: string | undefined,
    title: string,
  ): Promise<void> {
    const bytes = await readFile(filePath);
    const filename = basename(filePath);

    const urlRes = await this.callForm<
      SlackOk & { upload_url: string; file_id: string }
    >('files.getUploadURLExternal', {
      filename,
      length: String(bytes.byteLength),
    });

    const put = await fetch(urlRes.upload_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(bytes),
    });
    if (!put.ok) throw new Error(`upload PUT failed: ${put.status}`);

    await this.callJson('files.completeUploadExternal', {
      files: [{ id: urlRes.file_id, title }],
      channel_id: channel,
      thread_ts: threadTs,
    });
  }
}
