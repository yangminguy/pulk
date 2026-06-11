// Minimal Telegram Bot API client for the inbound gateway.
// Inbound: getUpdates (long polling). Outbound: sendMessage, sendDocument.
// Dependency-free — uses Node 18+ global fetch / FormData / Blob.
// Never throws on network errors; returns {ok:false} so the poll loop survives.

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const API_BASE = 'https://api.telegram.org';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: { id: number; username?: string; first_name?: string };
  };
}

export interface TelegramApiOptions {
  botToken: string;
  /** Long-poll timeout seconds passed to getUpdates. */
  pollTimeoutSec?: number;
}

export class TelegramApi {
  private readonly botToken: string;
  private readonly pollTimeoutSec: number;

  constructor(opts: TelegramApiOptions) {
    if (!opts.botToken) throw new Error('TELEGRAM_BOT_TOKEN is required');
    this.botToken = opts.botToken;
    this.pollTimeoutSec = opts.pollTimeoutSec ?? 30;
  }

  private url(method: string): string {
    return `${API_BASE}/bot${this.botToken}/${method}`;
  }

  /** Long-poll for updates. `offset` = last_update_id + 1. */
  async getUpdates(offset: number): Promise<TelegramUpdate[]> {
    try {
      const res = await fetch(this.url('getUpdates'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset,
          timeout: this.pollTimeoutSec,
          allowed_updates: ['message'],
        }),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
      return data.ok && data.result ? data.result : [];
    } catch {
      return [];
    }
  }

  async sendMessage(chatId: number, text: string): Promise<{ ok: boolean }> {
    // Telegram hard-caps messages at 4096 chars; truncate defensively.
    const safe = text.length > 4000 ? `${text.slice(0, 3990)}\n…(생략)` : text;
    try {
      const res = await fetch(this.url('sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: safe, disable_web_page_preview: true }),
      });
      return { ok: res.ok };
    } catch {
      return { ok: false };
    }
  }

  /** Upload a local file as a Telegram document (deliverable handoff). */
  async sendDocument(chatId: number, filePath: string, caption?: string): Promise<{ ok: boolean }> {
    try {
      const buf = await readFile(filePath);
      const form = new FormData();
      form.append('chat_id', String(chatId));
      if (caption) form.append('caption', caption.slice(0, 1000));
      // Uint8Array view keeps the Blob ctor happy under strict TS lib types.
      form.append('document', new Blob([new Uint8Array(buf)]), basename(filePath));
      const res = await fetch(this.url('sendDocument'), { method: 'POST', body: form });
      return { ok: res.ok };
    } catch {
      return { ok: false };
    }
  }
}
