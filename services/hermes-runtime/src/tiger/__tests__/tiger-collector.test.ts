import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runTigerCollector, type TigerCollectorDeps } from '../tiger-collector.js';
import { readManualReports } from '../manual-reports.js';
import { collectToolLogs } from '../log-adapter.js';
import type { AgentTask } from '@l5/core';
import type { TelegramClient } from '../../notifier/telegram.js';

const NOW = '2026-06-11T03:00:00.000Z';

// 파일시스템 격리: 실제 repo 로그를 읽지 않도록 빈 수집기를 주입한다.
const NO_LOGS = async () => ({ signals: [], errors: [], toolsScanned: 0 });

function fakeTelegram(): { client: TelegramClient; sent: any[] } {
  const sent: any[] = [];
  return {
    sent,
    client: {
      async send(msg) {
        sent.push(msg);
        return { ok: true };
      },
    },
  };
}

function task(over: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 't1',
    instruction_id: 'i1',
    assigned_agent: 'CTO',
    title: 'deploy',
    rationale: 'r',
    expected_output: 'o',
    status: 'queued',
    approval_required: false,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

async function mkStateDir(): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'tiger-test-'));
  return dir;
}

describe('runTigerCollector', () => {
  it('blocked task → 후보 생성 + 상태파일 영속화 + 텔레그램 1건', async () => {
    const stateDir = await mkStateDir();
    const tg = fakeTelegram();
    const deps: TigerCollectorDeps = {
      fetchAgentTasks: async () => [task({ status: 'blocked', blocker: 'waiting api key' })],
      telegram: tg.client,
      stateDir,
      pulkRoot: '/nonexistent-root', // 로그 glob은 매칭 0 → graceful
      now: NOW,
      collectLogs: NO_LOGS,
    };

    const r = await runTigerCollector(deps);

    expect(r.candidate_count).toBe(1);
    expect(r.notification_sent).toBe(true);
    expect(tg.sent.length).toBe(1);
    expect(tg.sent[0].dedupKey).toBe('tiger-collector:2026-06-11');

    // tiger-candidates.json이 적재됐다.
    const raw = await fs.readFile(join(stateDir, 'tiger-candidates.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.candidates[0].title).toBe('waiting api key');
    expect(parsed.candidates[0].kind).toBe('stall');

    // 스냅샷 last_run_at 진행.
    const snap = JSON.parse(
      await fs.readFile(join(stateDir, 'tiger-collector-snapshot.json'), 'utf-8'),
    );
    expect(snap.last_run_at).toBe(NOW);
  });

  it('후보 0건이면 텔레그램 미발송, 그래도 상태파일은 쓴다', async () => {
    const stateDir = await mkStateDir();
    const tg = fakeTelegram();
    const r = await runTigerCollector({
      fetchAgentTasks: async () => [task({ status: 'done' })], // done은 제외
      telegram: tg.client,
      stateDir,
      pulkRoot: '/nonexistent-root',
      now: NOW,
      collectLogs: NO_LOGS,
    });
    expect(r.candidate_count).toBe(0);
    expect(r.notification_sent).toBe(false);
    expect(tg.sent.length).toBe(0);
    await expect(
      fs.readFile(join(stateDir, 'tiger-candidates.json'), 'utf-8'),
    ).resolves.toBeTruthy();
  });

  it('fetchAgentTasks가 throw해도 never-throw + errors 누적', async () => {
    const stateDir = await mkStateDir();
    const tg = fakeTelegram();
    const r = await runTigerCollector({
      fetchAgentTasks: async () => {
        throw new Error('nocobase down');
      },
      telegram: tg.client,
      stateDir,
      pulkRoot: '/nonexistent-root',
      now: NOW,
      collectLogs: NO_LOGS,
    });
    expect(r.errors.some((e) => e.includes('fetchAgentTasks failed'))).toBe(true);
    expect(r.candidate_count).toBe(0);
  });

  it('수동 제보 jsonl을 후보로 흡수한다', async () => {
    const stateDir = await mkStateDir();
    const tg = fakeTelegram();
    const report = {
      tool_id: 'cmo_slide_video_factory',
      executive: 'CMO',
      message: '영상 렌더가 자꾸 멈춥니다',
      occurred_at: NOW,
    };
    await fs.writeFile(
      join(stateDir, 'tiger-manual-reports.jsonl'),
      JSON.stringify(report) + '\n',
      'utf-8',
    );

    const r = await runTigerCollector({
      fetchAgentTasks: async () => [],
      telegram: tg.client,
      stateDir,
      pulkRoot: '/nonexistent-root',
      now: NOW,
      collectLogs: NO_LOGS,
    });
    expect(r.candidate_count).toBe(1);
    const parsed = JSON.parse(
      await fs.readFile(join(stateDir, 'tiger-candidates.json'), 'utf-8'),
    );
    expect(parsed.candidates[0].kind).toBe('manual');
    expect(parsed.candidates[0].executive).toBe('CMO');
  });
});

describe('collectToolLogs (실제 glob 경로)', () => {
  it('pulk-relative repo의 error_sources glob을 읽어 RawSignal로 변환', async () => {
    // 임시 pulkRoot에 cto_hermes_runtime의 error_sources(logs/hermes-*.log)를 심는다.
    const root = await fs.mkdtemp(join(tmpdir(), 'tiger-pulk-'));
    const logDir = join(root, 'services', 'hermes-runtime', 'logs');
    await fs.mkdir(logDir, { recursive: true });
    await fs.writeFile(
      join(logDir, 'hermes-2026-06-11.log'),
      [
        JSON.stringify({ level: 'error', message: 'task dispatch failed', time: NOW }),
        JSON.stringify({ level: 'info', message: 'all good' }), // info → 신호 아님
        'plain line with Exception thrown', // 평문 에러 키워드 → 신호
      ].join('\n'),
      'utf-8',
    );

    const out = await collectToolLogs({ sinceMs: 0, pulkRoot: root });
    const hermesSignals = out.signals.filter((s) => s.tool_id === 'cto_hermes_runtime');
    expect(hermesSignals.length).toBe(2); // error jsonl + 평문 에러줄, info 제외
    expect(hermesSignals.some((s) => s.message.includes('task dispatch failed'))).toBe(true);
    expect(hermesSignals.every((s) => s.source === 'tool_log')).toBe(true);
    expect(out.toolsScanned).toBeGreaterThan(0);
  });

  it('경로 부재 시 throw하지 않고 빈 신호', async () => {
    const out = await collectToolLogs({ sinceMs: 0, pulkRoot: '/definitely-not-a-real-root-xyz' });
    expect(Array.isArray(out.signals)).toBe(true);
    // 절대경로 repo가 실재하면 그쪽 신호가 섞일 수 있으나, throw하지 않는 것이 핵심.
  });
});

describe('readManualReports', () => {
  it('파일 없으면 빈 배열', async () => {
    const stateDir = await mkStateDir();
    const r = await readManualReports({ stateDir, sinceMs: 0 });
    expect(r).toEqual([]);
  });

  it('깨진 줄/유효하지 않은 executive는 건너뛴다', async () => {
    const stateDir = await mkStateDir();
    await fs.writeFile(
      join(stateDir, 'tiger-manual-reports.jsonl'),
      [
        'NOT JSON',
        JSON.stringify({ tool_id: 'a', executive: 'INVALID', message: 'x' }),
        JSON.stringify({ tool_id: 'a', message: 'no exec' }),
        JSON.stringify({ tool_id: 'a', executive: 'CTO', message: 'valid one', occurred_at: NOW }),
      ].join('\n'),
      'utf-8',
    );
    const r = await readManualReports({ stateDir, sinceMs: 0 });
    expect(r.length).toBe(1);
    expect(r[0].message).toBe('valid one');
    expect(r[0].source).toBe('manual_report');
  });
});
