// 호랑이 실시간 watcher 어댑터 단위테스트.
// 소스 조회·영속화·텔레그램은 전부 주입(파일시스템은 임시 stateDir 격리).

import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  runLivenessWatcher,
  type LivenessWatcherDeps,
  type NativePhaseRunRow,
  type AgentTaskRow,
  type TigerIncidentRecord,
} from '../liveness-watcher.js';
import type { WatchTarget } from '@l5/core';
import type { TelegramClient } from '../../notifier/telegram.js';

const NOW = '2026-06-11T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);

const CTO_TARGET: WatchTarget = {
  id: 'cto_phase_run',
  label: 'CTO phase 실행',
  owner: 'CTO',
  heartbeat: 'native_phase_run',
  expectedMaxMs: 40 * 60 * 1000,
  heartbeatStaleMs: 10 * 60 * 1000,
  repo_path_kind: 'pulk-relative',
  repo_path: 'services/agent-runtime',
};
const CMO_TARGET: WatchTarget = {
  id: 'cmo_workflow',
  label: 'CMO 마케팅 워크플로우',
  owner: 'CMO',
  heartbeat: 'agent_task',
  expectedMaxMs: 25 * 60 * 1000,
  heartbeatStaleMs: 6 * 60 * 1000,
  repo_path_kind: 'pulk-relative',
  repo_path: 'packages/l5-core',
};
const REGISTRY = [CTO_TARGET, CMO_TARGET];

function minsAgo(n: number): string {
  return new Date(NOW_MS - n * 60_000).toISOString();
}

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

async function mkStateDir(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), 'tiger-watch-'));
}

function phaseRun(over: Partial<NativePhaseRunRow> = {}): NativePhaseRunRow {
  return {
    id: 'pr1',
    l5_task_id: 'task-1',
    task_title: 'CTO 코딩 phase',
    phase_name: 'code',
    status: 'started',
    started_at: minsAgo(5),
    updatedAt: minsAgo(1),
    ended_at: null,
    ...over,
  };
}

function baseDeps(over: Partial<LivenessWatcherDeps> = {}): {
  deps: LivenessWatcherDeps;
  persisted: TigerIncidentRecord[];
  tg: ReturnType<typeof fakeTelegram>;
  stateDir: string;
} {
  const persisted: TigerIncidentRecord[] = [];
  const tg = fakeTelegram();
  const stateDir = (over as any).__stateDir as string;
  const deps: LivenessWatcherDeps = {
    fetchNativePhaseRuns: async () => [],
    fetchAgentTasks: async () => [],
    persistIncident: async (rec) => {
      persisted.push(rec);
    },
    telegram: tg.client,
    stateDir,
    registry: REGISTRY,
    now: NOW,
    ...over,
  };
  return { deps, persisted, tg, stateDir };
}

describe('runLivenessWatcher', () => {
  it('진행 중 phase(heartbeat 신선) → 장애 0, 알림 0', async () => {
    const stateDir = await mkStateDir();
    const { deps, persisted, tg } = baseDeps({
      __stateDir: stateDir,
      fetchNativePhaseRuns: async () => [phaseRun({ updatedAt: minsAgo(1) })],
    } as any);

    const r = await runLivenessWatcher(deps);
    expect(r.snapshots_built).toBe(1);
    expect(r.healthy).toBe(1);
    expect(r.incidents_total).toBe(0);
    expect(r.notified).toBe(0);
    expect(persisted).toHaveLength(0);
    expect(tg.sent).toHaveLength(0);
  });

  it('멈춘 phase(heartbeat stale) → stall 장애 감지 + 텔레그램 + 영속화', async () => {
    const stateDir = await mkStateDir();
    const { deps, persisted, tg } = baseDeps({
      __stateDir: stateDir,
      fetchNativePhaseRuns: async () => [phaseRun({ updatedAt: minsAgo(15) })], // 15분 > 10분 허용
    } as any);

    const r = await runLivenessWatcher(deps);
    expect(r.incidents_total).toBe(1);
    expect(r.new_incidents).toBe(1);
    expect(r.notified).toBe(1);
    expect(r.persisted).toBe(1);
    expect(persisted[0].incident_type).toBe('stalled');
    expect(persisted[0].source_ref).toBe('cto_phase_run:pr1');
    expect(persisted[0].status).toBe('detected');
    expect(tg.sent[0].title).toContain('🔔');
    expect(tg.sent[0].dedupKey).toBe('tiger-incident:cto_phase_run:pr1');
  });

  it('failed phase → 즉시 장애 + urgent 레벨', async () => {
    const stateDir = await mkStateDir();
    const { deps, tg } = baseDeps({
      __stateDir: stateDir,
      fetchNativePhaseRuns: async () => [
        phaseRun({ status: 'failed', output: 'Error: build broke\nstack...', updatedAt: minsAgo(0) }),
      ],
    } as any);

    const r = await runLivenessWatcher(deps);
    expect(r.incidents_total).toBe(1);
    expect(tg.sent[0].level).toBe('urgent');
    expect(tg.sent[0].body).toContain('Error: build broke');
  });

  it('종료된 phase(ended_at 있음)는 스냅샷에서 제외', async () => {
    const stateDir = await mkStateDir();
    const { deps } = baseDeps({
      __stateDir: stateDir,
      fetchNativePhaseRuns: async () => [
        phaseRun({ ended_at: minsAgo(1), status: 'failed' }),
      ],
    } as any);
    const r = await runLivenessWatcher(deps);
    expect(r.snapshots_built).toBe(0);
    expect(r.incidents_total).toBe(0);
  });

  it('dedup: 같은 incident_key 두 번째 실행은 재알림 안 함', async () => {
    const stateDir = await mkStateDir();
    const mk = () =>
      baseDeps({
        __stateDir: stateDir,
        fetchNativePhaseRuns: async () => [phaseRun({ updatedAt: minsAgo(15) })],
      } as any);

    const first = mk();
    const r1 = await runLivenessWatcher(first.deps);
    expect(r1.new_incidents).toBe(1);
    expect(first.tg.sent).toHaveLength(1);

    // 같은 stateDir 재사용 → alerted에 키 남아있음.
    const second = mk();
    const r2 = await runLivenessWatcher(second.deps);
    expect(r2.incidents_total).toBe(1); // 여전히 감지는 됨
    expect(r2.new_incidents).toBe(0); // 그러나 새 알림 아님
    expect(second.tg.sent).toHaveLength(0);
    expect(second.persisted).toHaveLength(0);
  });

  it('CMO agent_task(blocked, heartbeat stale) → cmo_workflow stall 감지', async () => {
    const stateDir = await mkStateDir();
    const tasks: AgentTaskRow[] = [
      {
        id: 'at1',
        title: '키워드 분석',
        assigned_agent: 'CMO',
        status: 'blocked',
        created_at: minsAgo(20),
        updated_at: minsAgo(10), // 10분 > 6분 허용
        blocker: '입력 대기',
      },
    ];
    const { deps, persisted } = baseDeps({
      __stateDir: stateDir,
      fetchAgentTasks: async () => tasks as any,
    } as any);

    const r = await runLivenessWatcher(deps);
    expect(r.incidents_total).toBe(1);
    expect(persisted[0].source_ref).toContain('cmo_workflow');
    expect(persisted[0].error_summary).toBe('입력 대기');
  });

  it('CTO assigned agent_task는 cmo_workflow로 안 잡힘(CMO 전용 매핑)', async () => {
    const stateDir = await mkStateDir();
    const { deps } = baseDeps({
      __stateDir: stateDir,
      fetchAgentTasks: async () =>
        [{ id: 'x', assigned_agent: 'CTO', status: 'blocked', updated_at: minsAgo(30) }] as any,
    } as any);
    const r = await runLivenessWatcher(deps);
    expect(r.snapshots_built).toBe(0);
  });

  it('소스 조회가 throw해도 never-throw + errors 누적', async () => {
    const stateDir = await mkStateDir();
    const { deps } = baseDeps({
      __stateDir: stateDir,
      fetchNativePhaseRuns: async () => {
        throw new Error('nocobase down');
      },
    } as any);
    const r = await runLivenessWatcher(deps);
    expect(r.errors.some((e) => e.includes('fetchNativePhaseRuns'))).toBe(true);
    expect(r.incidents_total).toBe(0);
  });

  it('overrun: 시작 50분 전(>max 40분), heartbeat 신선 → overrun 장애', async () => {
    const stateDir = await mkStateDir();
    const { deps, persisted } = baseDeps({
      __stateDir: stateDir,
      fetchNativePhaseRuns: async () => [
        phaseRun({ started_at: minsAgo(50), updatedAt: minsAgo(0) }),
      ],
    } as any);
    const r = await runLivenessWatcher(deps);
    expect(r.incidents_total).toBe(1);
    expect(persisted[0].incident_type).toBe('error');
  });
});
