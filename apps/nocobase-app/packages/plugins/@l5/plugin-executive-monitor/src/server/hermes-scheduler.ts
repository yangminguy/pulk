// Hermes Scheduler — node-cron 기반 자동 실행기
// NocoBase 플러그인 내에서 실행되어 DB에 직접 접근한다.
// 외부 서비스(Trigger.dev, HTTP 클라이언트) 없이 동작한다.

import { randomUUID } from 'crypto';
import path from 'path';

const {
  analyzeRepetitionPattern,
  detectRepeatingTasks,
  generateToolRequestTask,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/repetition-detection'));

const {
  derivePhaseFromTasks,
  BPR_PHASE_ORDER,
  BPR_PHASE_LABELS,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/bpr'));

// P3-2 — knowledge auto-curation (pure l5-core).
const { curateInsight } =
  require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/memory'));

const CURATION_PURGE_GRACE_DAYS = 30;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const D3_AUTO_APPROVE_MS = 24 * 60 * 60 * 1000;
const STALLED_HOURS = 48;

let activeCronJobs: any[] = [];

function loadCron() {
  // Keep node-cron as an app-level runtime dependency. NocoBase's plugin
  // builder bundles static require() calls from source files.
  const moduleName = ['node', 'cron'].join('-');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(moduleName);
}

export function startHermesScheduler(db: any, logger: any) {
  const log = (msg: string) => logger?.info?.(`[Hermes] ${msg}`) ?? console.log(`[Hermes] ${msg}`);
  const cron = loadCron();

  // 기존 등록된 잡이 있다면 먼저 클리어
  stopHermesScheduler(logger);

  // 반복 태스크 감지 — 2시간마다
  const job1 = cron.schedule('0 */2 * * *', async () => {
    try {
      log('반복 분석 시작');
      await runRepetitionAnalyzer(db, log);
    } catch (err) {
      logger?.error?.('[Hermes] 반복 분석 실패:', err);
    }
  });
  activeCronJobs.push(job1);

  // D3 자동 승인 + 승인 대기 브리핑 — 매일 09:00
  const job2 = cron.schedule('0 9 * * *', async () => {
    try {
      log('승인 체크 시작');
      await runApprovalChecker(db, log);
    } catch (err) {
      logger?.error?.('[Hermes] 승인 체크 실패:', err);
    }
  });
  activeCronJobs.push(job2);

  // CTO 단계 검토 — 매주 월요일 10:00
  const job3 = cron.schedule('0 10 * * 1', async () => {
    try {
      log('CTO 단계 검토 시작');
      await runCTOPhaseReview(db, log);
    } catch (err) {
      logger?.error?.('[Hermes] CTO 단계 검토 실패:', err);
    }
  });
  activeCronJobs.push(job3);

  // 정체 태스크 감지 — 매시간
  const job4 = cron.schedule('0 * * * *', async () => {
    try {
      log('정체 감지 시작');
      await runStalledTaskDetector(db, log);
    } catch (err) {
      logger?.error?.('[Hermes] 정체 감지 실패:', err);
    }
  });
  activeCronJobs.push(job4);

  // P3-2 — 지식 큐레이션 sweep + 폐기 purge — 매일 04:00
  const job5 = cron.schedule('0 4 * * *', async () => {
    try {
      log('지식 큐레이션 시작');
      await runCurationSweepAndPurge(db, log);
    } catch (err) {
      logger?.error?.('[Hermes] 지식 큐레이션 실패:', err);
    }
  });
  activeCronJobs.push(job5);

  log('스케줄러 등록 완료 (반복감지 2h, 승인체크 09:00, CTO검토 월10:00, 정체감지 1h, 지식큐레이션 04:00)');
}

export function stopHermesScheduler(logger?: any) {
  if (activeCronJobs.length > 0) {
    logger?.info?.(`[Hermes] ${activeCronJobs.length}개의 cron job 중지 중...`) ?? console.log(`[Hermes] ${activeCronJobs.length}개의 cron job 중지 중...`);
    for (const job of activeCronJobs) {
      try {
        job.stop();
        if (typeof job.destroy === 'function') {
          job.destroy();
        }
      } catch (err) {
        // 무시
      }
    }
    activeCronJobs = [];
  }
}

async function runRepetitionAnalyzer(db: any, log: (m: string) => void) {
  const taskRepo = db.getRepository('agent_tasks');
  const windowStart = new Date(Date.now() - SEVEN_DAYS_MS);

  const tasks = await taskRepo.find({
    filter: { created_at: { $gte: windowStart.toISOString() } },
  });

  const repeating: Map<string, any[]> = detectRepeatingTasks(tasks, 3);
  let created = 0;

  for (const [, group] of repeating) {
    const sorted = [...group].sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const pattern = {
      task_title: sorted[0].title,
      occurrences: group.length,
      task_ids: group.map((t: any) => t.id),
      agents_involved: [...new Set(group.map((t: any) => t.assigned_agent))],
      first_occurrence_at: sorted[0].created_at,
      last_occurrence_at: sorted[sorted.length - 1].created_at,
    };

    // 이미 동일한 Tool Request가 있는지 확인
    const existing = await taskRepo.findOne({
      filter: { title: `Tool Request: ${pattern.task_title}`, assigned_agent: 'CTO' },
    });
    if (existing) continue;

    const analyzed = analyzeRepetitionPattern(pattern);
    const toolTask = generateToolRequestTask(analyzed, '반복 패턴 감지 — Hermes 자동 분석');

    await taskRepo.create({
      values: {
        id: randomUUID(),
        instruction_id: randomUUID(),
        ...toolTask,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    created++;
  }

  log(`반복 분석 완료: ${repeating.size}개 패턴 감지, ${created}개 Tool Request 생성`);
}

async function runApprovalChecker(db: any, log: (m: string) => void) {
  const taskRepo = db.getRepository('agent_tasks');
  const now = new Date();

  const pendingTasks = await taskRepo.find({
    filter: {
      approval_required: true,
      status: 'needs_review',
      risk_level: 'D3',
    },
  });

  let autoApproved = 0;
  for (const task of pendingTasks) {
    const expiry = new Date(task.created_at).getTime() + D3_AUTO_APPROVE_MS;
    if (now.getTime() >= expiry) {
      await taskRepo.update({
        filterByTk: task.id,
        values: { status: 'done', approval_required: false, updated_at: now.toISOString() },
      });
      autoApproved++;
    }
  }

  const stillPending = await taskRepo.find({
    filter: { approval_required: true, status: { $notIn: ['done', 'killed'] } },
  });

  log(`승인 체크 완료: D3 자동승인 ${autoApproved}개, 대기 중 ${stillPending.length}개`);
}

async function runCTOPhaseReview(db: any, log: (m: string) => void) {
  const taskRepo = db.getRepository('agent_tasks');
  const allTasks = await taskRepo.find({});

  const activeTasks = allTasks.filter((t: any) => !['done', 'killed'].includes(t.status));
  const currentPhase: string = derivePhaseFromTasks(activeTasks);
  const phaseIdx: number = BPR_PHASE_ORDER.indexOf(currentPhase);
  const nextPhase: string | null = phaseIdx < BPR_PHASE_ORDER.length - 1 ? BPR_PHASE_ORDER[phaseIdx + 1] : null;

  const DONE_THRESHOLD = 3;
  const doneInPhase = allTasks.filter((t: any) => t.status === 'done' && t.phase === currentPhase).length;

  if (nextPhase && doneInPhase >= DONE_THRESHOLD) {
    const phaseLabel = BPR_PHASE_LABELS[currentPhase] ?? currentPhase;
    const nextLabel = BPR_PHASE_LABELS[nextPhase] ?? nextPhase;

    await taskRepo.create({
      values: {
        id: randomUUID(),
        instruction_id: randomUUID(),
        assigned_agent: 'CEO',
        title: `BPR 단계 전환 요청: ${phaseLabel} → ${nextLabel}`,
        rationale: `완료 태스크 ${doneInPhase}개 — ${phaseLabel} 단계 전환 조건 충족`,
        expected_output: `${nextLabel} 단계 전환 승인 및 실행`,
        status: 'needs_review',
        approval_required: true,
        risk_level: 'D5',
        phase: nextPhase,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    log(`단계 전환 요청 생성: ${phaseLabel} → ${nextLabel}`);
  } else {
    log(`단계 유지: ${BPR_PHASE_LABELS[currentPhase] ?? currentPhase} (완료 ${doneInPhase}/${DONE_THRESHOLD})`);
  }
}

// P3-2 — re-curate stragglers left 'pending', then purge expired discards.
async function runCurationSweepAndPurge(db: any, log: (m: string) => void) {
  let repo: any;
  try {
    repo = db.getRepository('founder_memory');
  } catch {
    log('지식 큐레이션 건너뜀: founder_memory 미준비');
    return;
  }

  // Sweep pending rows (rules only; no LLM / no similarity in cron).
  let saved = 0;
  let discarded = 0;
  let needsReview = 0;
  try {
    const pending = await repo.find({ filter: { approval_status: 'pending' }, limit: 200 });
    for (const row of pending) {
      const result = curateInsight({
        insight: String(row.insight ?? ''),
        pii_level: (row.pii_level ?? 'none'),
        workflow_improvement: row.workflow_improvement ?? undefined,
        phase: row.phase ?? undefined,
        source_agent: row.source_agent ?? undefined,
        maxSimilarity: undefined, // fail-open: never auto-discard as duplicate in cron
      });
      if (result.decision === 'auto_save') {
        await repo.update({
          filter: { id: row.id },
          values: { approval_status: 'saved', curation_decision: 'auto_save' },
        });
        saved++;
      } else if (result.decision === 'auto_discard') {
        const now = new Date();
        const purgeAt = new Date(now.getTime() + CURATION_PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);
        await repo.update({
          filter: { id: row.id },
          values: {
            approval_status: 'discarded',
            curation_decision: 'auto_discard',
            discard_reason: result.reason ?? null,
            discarded_at: now,
            purge_at: purgeAt,
          },
        });
        discarded++;
      } else {
        await repo.update({
          filter: { id: row.id },
          values: { curation_decision: 'needs_review' },
        });
        needsReview++;
      }
    }
  } catch (err) {
    log(`지식 sweep 일부 실패: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Purge: only discarded rows whose purge_at has passed. Fetch + JS-filter +
  // destroy by id (avoids shaky operator support on date columns).
  let purged = 0;
  try {
    const discardedRows = await repo.find({ filter: { approval_status: 'discarded' }, limit: 500 });
    const now = Date.now();
    const expiredIds = discardedRows
      .filter((r: any) => {
        const p = r.purge_at ?? r.purgeAt;
        if (!p) return false;
        const t = new Date(p).getTime();
        return Number.isFinite(t) && t < now;
      })
      .map((r: any) => r.id);
    if (expiredIds.length) {
      await repo.destroy({ filter: { id: { $in: expiredIds } } });
      purged = expiredIds.length;
    }
  } catch (err) {
    log(`지식 purge 실패: ${err instanceof Error ? err.message : String(err)}`);
  }

  log(`지식 큐레이션 완료: 저장 ${saved}, 폐기 ${discarded}, 검토필요 ${needsReview}, 영구삭제 ${purged}`);
}

async function runStalledTaskDetector(db: any, log: (m: string) => void) {
  const taskRepo = db.getRepository('agent_tasks');
  const threshold = new Date(Date.now() - STALLED_HOURS * 60 * 60 * 1000);

  const stalledTasks = await taskRepo.find({
    filter: {
      status: 'running',
      updated_at: { $lt: threshold.toISOString() },
    },
  });

  for (const task of stalledTasks) {
    await taskRepo.update({
      filterByTk: task.id,
      values: {
        status: 'blocked',
        blocker: `${STALLED_HOURS}시간 이상 진행 없음 — Hermes 자동 감지`,
        updated_at: new Date().toISOString(),
      },
    });
  }

  log(`정체 감지 완료: ${stalledTasks.length}개 → blocked 처리`);
}
