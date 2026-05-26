import { Plugin } from '@nocobase/server';
import { 
  scoreFounderFit, 
  generateBusinessBrief, 
  calculatePmfScore, 
  decideToolCandidate, 
  requiresFounderApproval 
} from '@l5/core';
import collections from './collections';

export class PluginBusinessPortfolioServer extends Plugin {
  async afterAdd() {}

  async beforeLoad() {
    await this.db.import({
      directory: require('path').resolve(__dirname, 'collections'),
    });
  }

  async load() {
    this.app.logger.info('PluginBusinessPortfolioServer loaded');

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

export default PluginBusinessPortfolioServer;
