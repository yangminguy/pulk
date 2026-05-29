// Telegram notifier for Hermes runtime.
// send() never throws — caller's fallback path is always protected.

export type NotifyLevel = 'info' | 'warn' | 'urgent';

export interface TelegramMessage {
  title: string;
  body: string;
  level: NotifyLevel;
  link?: string;
  dedupKey?: string;
}

export interface TelegramClient {
  send(msg: TelegramMessage): Promise<{ ok: boolean; reason?: string }>;
}

const LEVEL_ICON: Record<NotifyLevel, string> = {
  info: 'ℹ️',
  warn: '⚠️',
  urgent: '🚨',
};

// Masks email/phone patterns to avoid PII leakage in notifications.
function maskPii(text: string): string {
  return text
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[email]')
    .replace(/(\+?[\d\s\-().]{7,})/g, (m) => (m.replace(/\D/g, '').length >= 7 ? '[phone]' : m));
}

export function createTelegramClient(opts?: {
  botToken?: string;
  chatId?: string;
  founderUIBaseUrl?: string;
  fetchImpl?: typeof fetch;
  dedupTtlMs?: number;
}): TelegramClient {
  const botToken = opts?.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = opts?.chatId ?? process.env.TELEGRAM_CHAT_ID;
  const fetchFn: typeof fetch = opts?.fetchImpl ?? fetch;
  const dedupTtlMs = opts?.dedupTtlMs ?? 30_000;

  const dedupSet = new Set<string>();

  return {
    async send(msg: TelegramMessage): Promise<{ ok: boolean; reason?: string }> {
      if (!botToken || !chatId) {
        return { ok: false, reason: 'telegram not configured' };
      }

      if (msg.dedupKey) {
        if (dedupSet.has(msg.dedupKey)) {
          return { ok: true, reason: 'deduped' };
        }
        dedupSet.add(msg.dedupKey);
        setTimeout(() => dedupSet.delete(msg.dedupKey!), dedupTtlMs);
      }

      const icon = LEVEL_ICON[msg.level];
      const safeTitle = maskPii(msg.title);
      const safeBody = maskPii(msg.body);

      let text = `${icon} *${safeTitle}*\n\n${safeBody}`;
      if (msg.link) {
        text += `\n\n🔗 ${msg.link}`;
      }

      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

      let response: Response;
      try {
        response = await fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
            disable_web_page_preview: false,
          }),
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return { ok: false, reason: `telegram fetch error: ${reason}` };
      }

      if (!response.ok) {
        let body = '';
        try { body = await response.text(); } catch { /* ignore */ }
        return { ok: false, reason: `telegram api ${response.status}: ${body}` };
      }

      return { ok: true };
    },
  };
}
