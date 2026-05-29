import { Plugin } from '@nocobase/server';
import {
  scoreFounderFit,
  generateBusinessBrief,
  calculatePmfScore,
  decideToolCandidate,
  requiresFounderApproval
} from '@l5/core';
import collections from './collections';
import { ensureWorkspaceRepo, getRepoPath } from './workspace-init';

export class PluginBusinessPortfolioServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {
    await this.db.import({
      directory: require('path').resolve(__dirname, 'collections'),
    });
  }

  async load() {
    this.app.logger.info('PluginBusinessPortfolioServer loaded');

    await ensureBusinessColumns(this.db);

    // --- Phase 3a: afterCreate hook — auto-assign repo_path and git-init workspace ---
    this.db.on('businesses.afterCreate', async (model: any) => {
      if (model.get('repo_path')) return; // already set by caller
      const id = model.get('id');
      const repoPath = getRepoPath(id);
      try {
        await ensureWorkspaceRepo(repoPath);
        await model.update({ repo_path: repoPath });
        this.app.logger.info(`[workspace-init] Initialised repo for business ${id}: ${repoPath}`);
      } catch (err: any) {
        this.app.logger.warn(`[workspace-init] Failed to init repo for business ${id}: ${err?.message ?? err}`);
      }
    });

    // --- Phase 3c: backfill on boot — assign repo_path to existing businesses that lack it ---
    this.app.on('afterStart', async () => {
      try {
        const db: any = this.db;
        const [rows] = await db.sequelize.query(
          `SELECT id FROM businesses WHERE (repo_path IS NULL OR repo_path = '') AND status != 'deleted'`
        ) as [Record<string, any>[], unknown];

        if (rows.length === 0) {
          this.app.logger.info('[workspace-init] Backfill: no businesses need repo_path assignment.');
          return;
        }

        let succeeded = 0;
        let skipped = 0;
        for (const row of rows) {
          const id = row['id'];
          const repoPath = getRepoPath(id);
          try {
            await ensureWorkspaceRepo(repoPath);
            await db.sequelize.query(
              `UPDATE businesses SET repo_path = :repoPath WHERE id = :id AND (repo_path IS NULL OR repo_path = '')`,
              { replacements: { repoPath, id } }
            );
            this.app.logger.info(`[workspace-init] Backfilled business ${id}: ${repoPath}`);
            succeeded++;
          } catch (err: any) {
            this.app.logger.warn(`[workspace-init] Backfill skipped business ${id}: ${err?.message ?? err}`);
            skipped++;
          }
        }
        this.app.logger.info(`[workspace-init] Backfill complete — ${succeeded} initialised, ${skipped} skipped.`);
      } catch (err: any) {
        this.app.logger.warn(`[workspace-init] Backfill error: ${err?.message ?? err}`);
      }
    });

    this.app.resourcer.define({
      name: 'l5',
      actions: {
        scoreFounderFit: async (ctx, next) => {
          const { business_idea_id } = ctx.action.params.values || {};
          if (!business_idea_id) {
            ctx.throw(400, 'business_idea_id is required');
          }
          const businessIdeaId = String(business_idea_id);

          const IdeaRepo = this.db.getRepository('business_ideas');
          const idea = await IdeaRepo.findOne({ filterByTk: businessIdeaId });
          if (!idea) {
            ctx.throw(404, 'Idea not found');
          }

          const DnaRepo = this.db.getRepository('founder_dna');
          const dnaList = await DnaRepo.find();

          const fitScore = scoreFounderFit(idea, dnaList);

          await IdeaRepo.update({
            filterByTk: businessIdeaId,
            values: {
              founder_fit_score: fitScore.score
            }
          });

          ctx.body = { success: true, fitScore };
          await next();
        },

        generateBusinessBrief: async (ctx, next) => {
          const { business_idea_id } = ctx.action.params.values || {};
          if (!business_idea_id) {
            ctx.throw(400, 'business_idea_id is required');
          }
          const businessIdeaId = String(business_idea_id);

          const IdeaRepo = this.db.getRepository('business_ideas');
          const idea = await IdeaRepo.findOne({ filterByTk: businessIdeaId });
          if (!idea) {
            ctx.throw(404, 'Idea not found');
          }

          const DnaRepo = this.db.getRepository('founder_dna');
          const dnaList = await DnaRepo.find();

          const fitScore = scoreFounderFit(idea, dnaList);

          const relevant_memory = [];

          const briefContent = generateBusinessBrief({
            idea,
            founder_fit: fitScore,
            relevant_memory,
            founder_dna: dnaList
          });

          const BriefRepo = this.db.getRepository('business_briefs');
          
          let brief = await BriefRepo.findOne({ filter: { business_id: businessIdeaId } });
          if (brief) {
            brief = await BriefRepo.update({
              filterByTk: brief.id,
              values: {
                title: `Brief: ${idea.title}`,
                summary: briefContent
              }
            });
          } else {
            brief = await BriefRepo.create({
              values: {
                business_id: businessIdeaId,
                title: `Brief: ${idea.title}`,
                summary: briefContent,
                key_decisions_required: [],
                today_priority: 'Review new idea',
                alert_highlights: [],
                memory_lessons_applied: []
              }
            });
          }

          ctx.body = { success: true, briefContent, brief };
          await next();
        },

        calculatePmfScore: async (ctx, next) => {
          const { experiment_id } = ctx.action.params.values || {};
          if (!experiment_id) {
            ctx.throw(400, 'experiment_id is required');
          }
          const experimentId = String(experiment_id);

          const MetricsRepo = this.db.getRepository('pmf_experiment_metrics');
          const metrics = await MetricsRepo.find({ filter: { experiment_id: experimentId } });

          const pmfResult = calculatePmfScore(metrics);

          const ExperimentRepo = this.db.getRepository('pmf_experiments');
          await ExperimentRepo.update({
            filterByTk: experimentId,
            values: {
              pmf_score: pmfResult.pmf_score
            }
          });

          ctx.body = { success: true, pmfResult };
          await next();
        },

        decideToolCandidate: async (ctx, next) => {
          const input = ctx.action.params.values;
          if (!input || input.pmf_score === undefined) {
            ctx.throw(400, 'ToolRequestInput is required');
          }

          const decision = decideToolCandidate(input);

          ctx.body = { success: true, decision };
          await next();
        },

        acrRegister: async (ctx, next) => {
          const { business_id, title, one_liner } = ctx.action.params.values || {};
          if (!business_id || !title) {
            ctx.throw(400, 'business_id and title are required');
          }
          const acrBaseUrl = process.env.ACR_BASE_URL || 'http://localhost:3001';
          const fallbackPath = process.env.L5_DEFAULT_PROJECT_PATH;

          // Phase 3b: look up repo_path from DB so the client never needs to pass it
          let resolvedPath: string | undefined;
          try {
            const BusinessRepo = this.db.getRepository('businesses');
            const biz = await BusinessRepo.findOne({ filterByTk: String(business_id) });
            resolvedPath = biz?.get('repo_path') || undefined;
          } catch {
            // non-fatal — fall through to fallback
          }
          const project_path = resolvedPath || fallbackPath;

          const payload = {
            project_id: `business-${business_id}`,
            title,
            one_liner: one_liner || '',
            l5_business_id: String(business_id),
            ...(project_path ? { project_path } : {}),
          };
          try {
            const response = await fetch(`${acrBaseUrl}/api/projects`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (!response.ok) {
              this.app.logger.warn(`[acrRegister] ACR returned ${response.status}`);
              ctx.body = { success: false, status: response.status };
            } else {
              const data = await response.json().catch(() => ({}));
              ctx.body = { success: true, acr_project_id: data?.id ?? null };
            }
          } catch (err: any) {
            this.app.logger.warn(`[acrRegister] ACR fetch failed: ${err?.message ?? err}`);
            ctx.body = { success: false, error: String(err?.message ?? err) };
          }
          await next();
        },

        requiresFounderApproval: async (ctx, next) => {
          const { decisionType, riskLevel, title, description, related_business_id } = ctx.action.params.values || {};

          if (!decisionType || !riskLevel) {
            ctx.throw(400, 'decisionType and riskLevel are required');
          }

          const approvalGate = requiresFounderApproval(decisionType, riskLevel);
          if (!approvalGate) {
            ctx.throw(400, 'riskLevel must be one of D1, D2, D3, D4, D5');
          }

          let decisionRecord = null;
          if (approvalGate.requires_approval) {
            const QueueRepo = this.db.getRepository('decision_queue');
            decisionRecord = await QueueRepo.create({
              values: {
                decision_type: decisionType,
                title: title || `Decision for ${decisionType}`,
                description: description || `Approval needed: ${approvalGate.approval_level}`,
                related_business_id,
                status: 'open',
                approval_notes: `Urgency: ${approvalGate.urgency}`
              }
            });
          }

          ctx.body = { success: true, approvalGate, decisionRecord };
          await next();
        },
      }
    });
    this.app.acl.allow('l5', '*', 'loggedIn');

    // business resource
    this.app.resourcer.define({
      name: 'business',
      actions: {
        listActive: async (ctx: any, next: () => Promise<void>) => {
          const db: any = this.db;
          const [rows] = await db.sequelize.query(
            `SELECT id, title, one_liner, status, "createdAt", "updatedAt"
             FROM businesses
             WHERE status != 'deleted'
             ORDER BY "updatedAt" DESC`
          ) as [Record<string, any>[], unknown];
          ctx.body = {
            ok: true,
            data: rows.map((r) => ({
              id: String(r['id']),
              name: r['title'] ?? '',
              one_liner: r['one_liner'] ?? null,
              current_phase: null,
              lifecycle_stage: r['status'] ?? null,
              updated_at: r['updatedAt'] ?? r['createdAt'] ?? null,
            })),
          };
          await next();
        },
      },
    });
    this.app.acl.allow('business', ['listActive'], 'loggedIn');

    this.app.on('afterStart', async () => {
      const FounderDnaRepo = this.db.getRepository('founder_dna');
      if (FounderDnaRepo) {
        const count = await FounderDnaRepo.count();
        if (count === 0) {
          await FounderDnaRepo.create({
            values: [
              {
                category: 'business_preference',
                statement: 'I prefer recurring revenue models over one-off sales.',
                evidence: 'Past startup had highly volatile one-off sales that caused stress.',
                confidence: 5
              },
              {
                category: 'risk_standard',
                statement: 'Avoid high capital expenditure upfront.',
                evidence: 'I want to remain bootstrapped and lean.',
                confidence: 4
              }
            ]
          });
          this.app.logger.info('Seeded founder_dna collection.');
        }
      }
    });
  }

  async install() {}

  async afterEnable() {}

  async afterDisable() {}

  async remove() {}
}

// Idempotent column add for the business→repo mapping. Mirrors the orchestration
// plugin's ensureOrchestrationColumns pattern so the field exists on the running
// postgres without a dedicated migration file. sqlite/meta handled by defineCollection.
async function ensureBusinessColumns(db: any) {
  const dialect = db.sequelize?.getDialect?.();
  if (dialect === 'sqlite') return;
  try {
    await db.sequelize.query(`
      ALTER TABLE IF EXISTS businesses
        ADD COLUMN IF NOT EXISTS repo_path text;
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure businesses.repo_path column: ${message}`);
  }
}

export default PluginBusinessPortfolioServer;
