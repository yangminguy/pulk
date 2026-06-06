import { runCmoStrategyWatch, type CmoStrategyWatchDeps } from '../cmo-strategy-watch.js';
import type { TelegramClient } from '../../notifier/telegram.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Isolate all file writes (snapshot/discovery) to a fresh tmp dir per test and
// point the inventory at a tmp file, so the real Second Brain is never touched.
let base: string;
let inventoryPath: string;
let stateDir: string;

beforeEach(async () => {
  base = await fs.mkdtemp(join(tmpdir(), 'cmo-strategy-watch-'));
  inventoryPath = join(base, 'inventory.jsonl');
  stateDir = join(base, 'state');
});

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

function makeCardRecorder(): {
  createToolRequest: CmoStrategyWatchDeps['createToolRequest'];
  cards: unknown[];
} {
  const cards: unknown[] = [];
  return {
    cards,
    createToolRequest: async (payload) => {
      cards.push(payload);
      return `card-${cards.length}`;
    },
  };
}

function row(source_id: string, hash: string, title?: string): string {
  return JSON.stringify({ source_id, hash, title: title ?? source_id, platform: 'notion' });
}

async function writeInventory(lines: string[]): Promise<void> {
  await fs.writeFile(inventoryPath, lines.join('\n') + '\n', 'utf-8');
}

describe('runCmoStrategyWatch', () => {
  it('first run establishes a silent baseline (no card, no alert)', async () => {
    await writeInventory([row('a', 'h1'), row('b', 'h2')]);
    const { client, calls } = makeTelegram();
    const { createToolRequest, cards } = makeCardRecorder();

    const result = await runCmoStrategyWatch({ createToolRequest, telegram: client, inventoryPath, stateDir });

    expect(result.baseline).toBe(true);
    expect(result.entries_scanned).toBe(2);
    expect(result.card_created).toBeNull();
    expect(cards).toHaveLength(0);
    expect(calls).toHaveLength(0);
    // snapshot must be persisted so the next run can diff against it.
    const snap = JSON.parse(await fs.readFile(join(stateDir, 'cmo-strategy-snapshot.json'), 'utf-8'));
    expect(snap).toEqual({ a: 'h1', b: 'h2' });
  });

  it('creates a card and alert when new/changed PT material appears', async () => {
    // 1st run = baseline
    await writeInventory([row('a', 'h1')]);
    const dep1 = makeCardRecorder();
    await runCmoStrategyWatch({ createToolRequest: dep1.createToolRequest, telegram: makeTelegram().client, inventoryPath, stateDir });

    // 2nd run: 'a' edited + 'b' added
    await writeInventory([row('a', 'h1-edited', '전략 자료 A'), row('b', 'h9', '신규 자료 B')]);
    const { client, calls } = makeTelegram();
    const { createToolRequest, cards } = makeCardRecorder();
    const result = await runCmoStrategyWatch({ createToolRequest, telegram: client, inventoryPath, stateDir });

    expect(result.baseline).toBe(false);
    expect(result.added).toBe(1);
    expect(result.changed).toBe(1);
    expect(result.card_created).toBe('card-1');
    expect(result.notification_sent).toBe(true);
    expect(cards).toHaveLength(1);

    const card = cards[0] as Record<string, unknown>;
    expect(card.assigned_agent).toBe('CTO');
    expect(String(card.source_ref)).toMatch(/^secondbrain-watch:\d{4}-\d{2}-\d{2}$/);
    expect(card.status).toBe('queued');
    expect(card.approval_required).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('stays silent when nothing changed', async () => {
    await writeInventory([row('a', 'h1'), row('b', 'h2')]);
    await runCmoStrategyWatch({ createToolRequest: makeCardRecorder().createToolRequest, telegram: makeTelegram().client, inventoryPath, stateDir });

    // identical inventory on the next run
    const { client, calls } = makeTelegram();
    const { createToolRequest, cards } = makeCardRecorder();
    const result = await runCmoStrategyWatch({ createToolRequest, telegram: client, inventoryPath, stateDir });

    expect(result.baseline).toBe(false);
    expect(result.added).toBe(0);
    expect(result.changed).toBe(0);
    expect(result.card_created).toBeNull();
    expect(cards).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('never throws when the inventory file is missing', async () => {
    const { createToolRequest, cards } = makeCardRecorder();
    const result = await runCmoStrategyWatch({ createToolRequest, telegram: makeTelegram().client, inventoryPath, stateDir });

    expect(result.card_created).toBeNull();
    expect(cards).toHaveLength(0);
    expect(result.errors.some((e) => e.includes('inventory read failed'))).toBe(true);
  });
});
