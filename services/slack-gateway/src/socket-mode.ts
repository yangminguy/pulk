// Socket Mode client — raw WebSocket, no SDK dependency.
//
// Flow (per Slack Socket Mode):
//   1. POST apps.connections.open with the xapp app-level token → wss URL
//   2. connect the WebSocket
//   3. on an envelope with `envelope_id`, ACK immediately (within 3s) by
//      sending {envelope_id} back — THEN process (our jobs take minutes)
//   4. on `disconnect`, close and reconnect (open a fresh URL)
//
// Node 22 provides global `WebSocket` (WHATWG interface) and `fetch`, so this
// needs no extra packages.

import { setTimeout as delay } from 'node:timers/promises';

export interface SlackEvent {
  type: string;
  subtype?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  bot_id?: string;
  ts?: string;
  thread_ts?: string;
}

type EventHandler = (event: SlackEvent) => Promise<void> | void;
type Logger = (msg: string) => void;

export class SocketModeClient {
  private ws?: WebSocket;
  private stopped = false;

  constructor(
    private readonly appToken: string,
    private readonly onEvent: EventHandler,
    private readonly log: Logger,
    private readonly label: string,
  ) {}

  /** Run forever: connect, and reconnect on any drop, until stop() is called. */
  async start(): Promise<void> {
    while (!this.stopped) {
      try {
        const url = await this.openConnection();
        await this.connect(url);
      } catch (err) {
        this.log(`${this.label} socket error: ${errMsg(err)}`);
      }
      if (!this.stopped) await delay(5000);
    }
  }

  stop(): void {
    this.stopped = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }

  private async openConnection(): Promise<string> {
    const res = await fetch('https://slack.com/api/apps.connections.open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${this.appToken}`,
      },
    });
    const json = (await res.json()) as { ok: boolean; url?: string; error?: string };
    if (!json.ok || !json.url) {
      throw new Error(`apps.connections.open: ${json.error ?? 'no url'}`);
    }
    return json.url;
  }

  private connect(url: string): Promise<void> {
    return new Promise((resolve) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.addEventListener('open', () => this.log(`${this.label} socket connected`));
      ws.addEventListener('message', (ev: MessageEvent) =>
        this.handleMessage(typeof ev.data === 'string' ? ev.data : String(ev.data)),
      );
      ws.addEventListener('error', () => {
        // 'close' fires after 'error'; resolve there so start() reconnects.
      });
      ws.addEventListener('close', () => {
        this.log(`${this.label} socket closed`);
        resolve();
      });
    });
  }

  private handleMessage(data: string): void {
    let msg: {
      type?: string;
      envelope_id?: string;
      reason?: string;
      num_connections?: number;
      payload?: { event?: SlackEvent };
    };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.type === 'hello') {
      this.log(`${this.label} hello (connections=${msg.num_connections ?? '?'})`);
      return;
    }
    if (msg.type === 'disconnect') {
      this.log(`${this.label} disconnect (${msg.reason ?? '?'}) — reconnecting`);
      try {
        this.ws?.close();
      } catch {
        /* ignore */
      }
      return;
    }

    // ACK first (must be < 3s) so Slack doesn't redeliver while a job runs.
    if (msg.envelope_id) {
      try {
        this.ws?.send(JSON.stringify({ envelope_id: msg.envelope_id }));
      } catch {
        /* ignore */
      }
    }

    if (msg.type === 'events_api' && msg.payload?.event) {
      Promise.resolve(this.onEvent(msg.payload.event)).catch((e) =>
        this.log(`${this.label} handler error: ${errMsg(e)}`),
      );
    }
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
