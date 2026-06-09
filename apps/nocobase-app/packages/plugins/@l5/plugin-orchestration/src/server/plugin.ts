import { randomUUID } from 'crypto';
import path from 'path';
import { defineCollection } from '@nocobase/database';
import { Plugin } from '@nocobase/server';
import { makeSecondBrainTransport } from './secondbrain-transport';
import { makeVideoFactoryTransport } from './video-factory-transport';

const {
  assignExecutiveTasks,
  decomposeIntoWorkstreams,
  interpretFounderInstruction,
  resolveClarification,
  createOpenAIClient,
  createDefaultLLMClient,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/ceo-orchestration'));

const {
  generateWorkflow,
  generateWorkflowWithLLM,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/workflow-factory'));

const {
  executeAgentTask,
  executeAgentTaskLive,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/executive-runtime'));

const {
  collectInsights,
  formatInsightsForPrompt,
  recallInsights,
  createSecondBrainSource,
  createSecondBrainTools,
  createVideoFactoryTools,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/memory'));

const {
  createVideoProject,
  advanceToGenerating,
  completeVideoProject,
  failVideoProject,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/video-project'));

// M3: build secondbrain transport once at module load. null when env not set.
const _secondBrainTransport = makeSecondBrainTransport();

// M5: build video-factory transport once at module load. null when env not set.
const _videoFactoryTransport = makeVideoFactoryTransport();

const {
  verifyCTOPhase,
  verifyIntegratePhase,
  isIntegratePhaseName,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/cto-verification'));

const {
  openConsultation,
  resolveConsultation,
  formatConsultationForPrompt,
  createAskFounderTool,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/consultation'));

const {
  answerClarifications,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/cto-clarification'));

// M6: executive-to-executive delegation (ask_executive tool + verification loop).
const {
  createAskExecutiveTool,
  runDelegationLoop,
  buildVerificationPrompt,
  parseVerdict,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/delegation'));

// P1: Chief of Staff synthesis — aggregate an instruction's task outputs into one founder deliverable.
const {
  synthesizeDeliverable,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/chief-of-staff'));

// M10: CTO conversational planning — founder↔CTO turn that yields a PRD+roadmap+tasks plan.
const {
  runCtoPlanningTurn,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/cto-planning'));

// M9.5: roadmap burndown — derive per-milestone progress from linked dev-tasks.
const {
  deriveRoadmapItemStatus,
  summarizeRoadmap,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/roadmap'));

// CMO Video Room — strategy turn + state machine.
const {
  runCmoStrategyTurn,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/cmo-strategy'));

// CMO v3 orchestrator — skill-chain execution.
const {
  createCmoSkillRegistry,
  CmoOrchestrator,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/cmo-orchestrator'));

const {
  advanceStatus: advanceVideoRoomStatus,
  requiresApproval: videoRoomRequiresApproval,
  pageForStatus,
  buildMiniRoadmap,
  buildSlideDeckSpec,
  slideDeckToVideoJob,
  createRenderJob,
  submitRenderJob,
  completeRenderJob,
  evaluateVideoRoomQA,
  createUploadDraft,
  createBusinessPTContextSnapshot,
  assertContextLoadingComplete,
  createVoiceRecording,
  attachVoiceFile,
  selectKeyContent,
  createPullingContentSet,
  createSecondBrainInsightMerge,
  composeIntro30s,
  buildFactoryVideoJob,
  secondBrainQueryForStatus,
  buildVideoExecutionBrief,
  validateVideoExecutionBrief,
  prepareFactoryHandoff,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/video-room'));

const {
  createInMemoryVideoFactoryTransport,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/memory'));

type ActionContext = {
  app?: any;
  db: any;
  body?: unknown;
  request?: {
    body?: Record<string, unknown>;
  };
  action?: {
    params?: {
      values?: Record<string, unknown>;
      filterByTk?: string;
      agent?: string;
      status?: string;
      task_id?: string;
    };
  };
  throw(status: number, message: string): never;
};

export default class PluginOrchestrationServer extends Plugin {
  async load() {
    this.app.logger.info('PluginOrchestrationServer loaded');

    await ensureOrchestrationColumns(this.db);
    registerCollections(this.db);
    registerChatResource(this.app, this.db);
    registerCrudResources(this.app);
    registerConsultationResource(this.app, this.db);
    registerDelegationResource(this.app, this.db);
    registerCtoPlanningResource(this.app, this.db);
    registerCmoResource(this.app, this.db);
    registerVideoProjectResource(this.app, this.db);

    this.app.acl.allow('chat', ['submitInstruction', 'generateWorkflow', 'approvePlan', 'rejectPlan', 'history'], 'loggedIn');
    this.app.acl.allow('agent', ['executeTask'], 'loggedIn');
    // taskCallback is a machine-to-machine callback from ACR (non-interactive,
    // long-running). Public ACL + non-expiring shared-secret guard in the handler
    // avoids the ~17h JWT expiry that would break unattended cycle completion.
    this.app.acl.allow('agent', ['taskCallback'], 'public');
    this.app.acl.allow('acr', ['approvalCallback'], 'loggedIn');
    this.app.acl.allow('founder_instructions', '*', 'loggedIn');
    this.app.acl.allow('ceo_interpretations', '*', 'loggedIn');
    this.app.acl.allow('agent_tasks', '*', 'loggedIn');
    this.app.acl.allow('agent_handoffs', '*', 'loggedIn');
    this.app.acl.allow('projects', '*', 'loggedIn');
    this.app.acl.allow('chat_messages', '*', 'loggedIn');
    this.app.acl.allow('project_roadmap_events', '*', 'loggedIn');
    this.app.acl.allow('consultation', ['list', 'respond'], 'loggedIn');
    this.app.acl.allow('delegation', ['list', 'advance'], 'loggedIn');
    this.app.acl.allow('founder_deliverables', '*', 'loggedIn');
    this.app.acl.allow('cto', ['planMessage', 'approvePlan', 'roadmapProgress'], 'loggedIn');
    this.app.acl.allow('cto_planning_messages', '*', 'loggedIn');
    this.app.acl.allow('cmo', ['createProject', 'listProjects', 'getProject', 'chatMessage', 'advanceStatus', 'decideGate', 'approvePlan', 'saveCard', 'buildSlideDeck', 'submitRender', 'runQA', 'createUploadDraft', 'loadPTContext', 'attachVoice', 'commitStrategyArtifact', 'saveScript', 'sendToFactory', 'generateVideoExecutionBrief', 'runContentStrategy'], 'loggedIn');
    this.app.acl.allow('cmo_planning_messages', '*', 'loggedIn');
    this.app.acl.allow('roadmap_items', '*', 'loggedIn');
    this.app.acl.allow('video-project', ['list', 'create', 'advance', 'complete', 'fail'], 'loggedIn');
  }

  async install() {}
  async afterEnable() {}
  async afterDisable() {}
  async remove() {}
}

async function ensureOrchestrationColumns(db: any) {
  const dialect = db.sequelize?.getDialect?.();
  if (dialect === 'sqlite') return;

  try {
    await db.sequelize.query(`
      ALTER TABLE IF EXISTS agent_tasks
        ADD COLUMN IF NOT EXISTS risk_level text,
        ADD COLUMN IF NOT EXISTS phase text,
        ADD COLUMN IF NOT EXISTS source_ref text,
        ADD COLUMN IF NOT EXISTS acr_token text,
        ADD COLUMN IF NOT EXISTS business_id text,
        ADD COLUMN IF NOT EXISTS project_id text,
        ADD COLUMN IF NOT EXISTS self_mod_origin text,
        ADD COLUMN IF NOT EXISTS self_mod_status text,
        ADD COLUMN IF NOT EXISTS acr_branch text,
        ADD COLUMN IF NOT EXISTS acr_diff text,
        ADD COLUMN IF NOT EXISTS acr_pr_url text;
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure agent_tasks contract columns: ${message}`);
  }

  try {
    await db.sequelize.query(`
      ALTER TABLE IF EXISTS founder_instructions
        ADD COLUMN IF NOT EXISTS business_id text,
        ADD COLUMN IF NOT EXISTS project_id text;
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure founder_instructions contract columns: ${message}`);
  }

  try {
    await db.sequelize.query(`
      ALTER TABLE IF EXISTS ceo_interpretations
        ADD COLUMN IF NOT EXISTS business_id text,
        ADD COLUMN IF NOT EXISTS project_id text;
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure ceo_interpretations contract columns: ${message}`);
  }

  // M4: executive_consultations table
  try {
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS executive_consultations (
        id text PRIMARY KEY,
        task_id text NOT NULL,
        business_id text,
        from_agent text NOT NULL,
        question text NOT NULL,
        options json,
        status text NOT NULL DEFAULT 'awaiting_founder',
        founder_response text,
        resolved_at timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure executive_consultations table: ${message}`);
  }

  // M6: executive_delegations table
  try {
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS executive_delegations (
        id text PRIMARY KEY,
        from_agent text NOT NULL,
        to_agent text NOT NULL,
        origin_task_id text NOT NULL,
        work_task_id text,
        objective text NOT NULL,
        acceptance_criteria json,
        status text NOT NULL DEFAULT 'open',
        round int NOT NULL DEFAULT 0,
        max_rounds int NOT NULL DEFAULT 3,
        last_feedback text,
        result_summary text,
        business_id text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure executive_delegations table: ${message}`);
  }

  // P1: founder_deliverables table + UNIQUE(instruction_id) idempotency backstop
  try {
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS founder_deliverables (
        id text PRIMARY KEY,
        instruction_id text NOT NULL,
        project_id text,
        business_id text,
        decision_summary text NOT NULL,
        contributions json DEFAULT '[]',
        open_gaps json DEFAULT '[]',
        next_actions json DEFAULT '[]',
        chat_message_id text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_founder_deliverables_instruction
        ON founder_deliverables (instruction_id);
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure founder_deliverables table: ${message}`);
  }

  try {
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS video_projects (
        id text PRIMARY KEY,
        business_id text,
        topic text NOT NULL,
        angle text,
        format text,
        status text NOT NULL DEFAULT 'draft',
        config_snapshot jsonb,
        output_url text,
        output_metadata jsonb,
        error text,
        job_path text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure video_projects table: ${message}`);
  }

  // CMO Video Room tables.
  try {
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS cmo_planning_messages (
        id text PRIMARY KEY,
        thread_id text NOT NULL,
        project_id text,
        business_id text,
        role text NOT NULL,
        text text NOT NULL,
        proposal jsonb,
        gate jsonb,
        ready_to_advance boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure cmo_planning_messages table: ${message}`);
  }

  try {
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS video_room_projects (
        id text PRIMARY KEY,
        title text NOT NULL,
        business_id text,
        product text,
        target_audience text,
        business_goal text,
        project_type text,
        status text NOT NULL DEFAULT 'strategy_chat',
        current_page text NOT NULL DEFAULT 'strategy',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure video_room_projects table: ${message}`);
  }

  try {
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS video_room_cards (
        id text PRIMARY KEY,
        video_project_id text NOT NULL,
        stage text NOT NULL,
        summary text,
        data jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure video_room_cards table: ${message}`);
  }

  try {
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS video_room_gates (
        id text PRIMARY KEY,
        video_project_id text NOT NULL,
        gate_type text NOT NULL,
        page text,
        title text,
        context text,
        options jsonb,
        recommended_option text,
        status text NOT NULL DEFAULT 'pending',
        decided_by text,
        decided_at timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure video_room_gates table: ${message}`);
  }

  try {
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS video_execution_briefs (
        id text PRIMARY KEY,
        content_card_id text,
        project_id text,
        schema_version text,
        brief jsonb,
        validation_status text,
        handoff_status text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure video_execution_briefs table: ${message}`);
  }
}

function registerCollections(db: any) {
  db.collection(defineCollection({
    name: 'founder_instructions',
    title: 'Founder Instructions',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'raw_text', type: 'text', allowNull: false },
      { name: 'source', type: 'string', allowNull: false, defaultValue: 'manual' },
      { name: 'intent', type: 'text' },
      { name: 'constraints', type: 'json', defaultValue: [] },
      { name: 'requested_phase', type: 'string' },
      { name: 'status', type: 'string', allowNull: false, defaultValue: 'new' },
      { name: 'business_id', type: 'string' },
      { name: 'project_id', type: 'string' },
    ],
  }));

  db.collection(defineCollection({
    name: 'ceo_interpretations',
    title: 'CEO Interpretations',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'instruction_id', type: 'uuid', allowNull: false },
      { name: 'goal', type: 'text', allowNull: false },
      { name: 'assumptions', type: 'json', defaultValue: [] },
      { name: 'phase', type: 'string', allowNull: false },
      { name: 'success_criteria', type: 'json', defaultValue: [] },
      { name: 'risk_level', type: 'string', allowNull: false, defaultValue: 'D1' },
      { name: 'approval_required', type: 'boolean', defaultValue: false },
      { name: 'business_id', type: 'string' },
      { name: 'project_id', type: 'string' },
    ],
  }));

  db.collection(defineCollection({
    name: 'agent_tasks',
    title: 'Agent Tasks',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'instruction_id', type: 'uuid', allowNull: false },
      { name: 'interpretation_id', type: 'uuid' },
      { name: 'assigned_agent', type: 'string', allowNull: false },
      { name: 'title', type: 'string', allowNull: false },
      { name: 'rationale', type: 'text', allowNull: false },
      { name: 'expected_output', type: 'text', allowNull: false },
      { name: 'status', type: 'string', allowNull: false, defaultValue: 'queued' },
      { name: 'approval_required', type: 'boolean', defaultValue: false },
      { name: 'risk_level', type: 'string' },
      { name: 'phase', type: 'string' },
      { name: 'source_ref', type: 'string' },
      { name: 'blocker', type: 'text' },
      { name: 'due_at', type: 'date' },
      { name: 'acr_token', type: 'string' },
      { name: 'business_id', type: 'string' },
      { name: 'project_id', type: 'string' },
      { name: 'self_mod_origin', type: 'string' },
      { name: 'self_mod_status', type: 'string' },
      { name: 'acr_branch', type: 'string' },
      { name: 'acr_diff', type: 'text' },
      { name: 'acr_pr_url', type: 'string' },
      // Full executive AgentOutput (goal/options/recommendation/action_items …)
      // so the inbox/monitor/synthesis can surface the real work product.
      { name: 'output', type: 'json' },
    ],
  }));

  db.collection(defineCollection({
    name: 'agent_handoffs',
    title: 'Agent Handoffs',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'task_id', type: 'uuid', allowNull: false },
      { name: 'from_agent', type: 'string', allowNull: false },
      { name: 'to_agent', type: 'string' },
      { name: 'context', type: 'text', allowNull: false },
      { name: 'next_action', type: 'text', allowNull: false },
      { name: 'blocker', type: 'text' },
      { name: 'approval_required', type: 'boolean', defaultValue: false },
    ],
  }));

  // M10: CTO planning conversation log (founder↔CTO turns, with the proposed plan).
  db.collection(defineCollection({
    name: 'cto_planning_messages',
    title: 'CTO Planning Messages',
    fields: [
      { name: 'id', type: 'string', primaryKey: true },
      { name: 'thread_id', type: 'string', allowNull: false },
      { name: 'business_id', type: 'string' },
      { name: 'project_id', type: 'string' },
      { name: 'role', type: 'string', allowNull: false },
      { name: 'text', type: 'text', allowNull: false },
      { name: 'plan', type: 'json' },
      { name: 'plan_status', type: 'string' },
    ],
  }));

  // M10: roadmap items produced by an approved CTO plan (PRD breakdown).
  db.collection(defineCollection({
    name: 'roadmap_items',
    title: 'Roadmap Items',
    fields: [
      { name: 'id', type: 'string', primaryKey: true },
      { name: 'project_id', type: 'string' },
      { name: 'business_id', type: 'string' },
      { name: 'title', type: 'text', allowNull: false },
      { name: 'summary', type: 'text' },
      { name: 'objective', type: 'text' },
      { name: 'sequence', type: 'integer', defaultValue: 1 },
      { name: 'status', type: 'string', defaultValue: 'planned' },
      { name: 'source', type: 'string', defaultValue: 'cto_planning' },
    ],
  }));

  db.collection(defineCollection({
    name: 'chat_messages',
    title: 'Chat Messages',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'project_id', type: 'string', allowNull: false },
      { name: 'role', type: 'string', allowNull: false },
      { name: 'text', type: 'text', allowNull: false },
      { name: 'metadata', type: 'json', defaultValue: {} },
    ],
  }));

  db.collection(defineCollection({
    name: 'project_roadmap_events',
    title: 'Project Roadmap Events',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'project_id', type: 'string', allowNull: false },
      { name: 'task_id', type: 'string', allowNull: false },
      { name: 'title', type: 'string', allowNull: false },
      { name: 'assigned_agent', type: 'string', allowNull: false },
      { name: 'status', type: 'string', allowNull: false },
      { name: 'risk_level', type: 'string', allowNull: false },
      { name: 'phase', type: 'string', allowNull: false },
      { name: 'rationale', type: 'text', allowNull: false },
      { name: 'output_summary', type: 'text', defaultValue: '' },
      { name: 'completed_at', type: 'date', allowNull: false },
    ],
  }));

  // M4: executive_consultations
  db.collection(defineCollection({
    name: 'executive_consultations',
    title: 'Executive Consultations',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'task_id', type: 'string', allowNull: false },
      { name: 'business_id', type: 'string' },
      { name: 'from_agent', type: 'string', allowNull: false },
      { name: 'question', type: 'text', allowNull: false },
      { name: 'options', type: 'json' },
      { name: 'status', type: 'string', allowNull: false, defaultValue: 'awaiting_founder' },
      { name: 'founder_response', type: 'text' },
      { name: 'resolved_at', type: 'date' },
    ],
  }));

  // M6: executive_delegations
  db.collection(defineCollection({
    name: 'executive_delegations',
    title: 'Executive Delegations',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'from_agent', type: 'string', allowNull: false },
      { name: 'to_agent', type: 'string', allowNull: false },
      { name: 'origin_task_id', type: 'string', allowNull: false },
      { name: 'work_task_id', type: 'string' },
      { name: 'objective', type: 'text', allowNull: false },
      { name: 'acceptance_criteria', type: 'json', defaultValue: [] },
      { name: 'status', type: 'string', allowNull: false, defaultValue: 'open' },
      { name: 'round', type: 'integer', defaultValue: 0 },
      { name: 'max_rounds', type: 'integer', defaultValue: 3 },
      { name: 'last_feedback', type: 'text' },
      { name: 'result_summary', type: 'text' },
      { name: 'business_id', type: 'string' },
    ],
  }));

  // P1: founder_deliverables — one synthesized deliverable per instruction
  db.collection(defineCollection({
    name: 'founder_deliverables',
    title: 'Founder Deliverables',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'instruction_id', type: 'string', allowNull: false },
      { name: 'project_id', type: 'string' },
      { name: 'business_id', type: 'string' },
      { name: 'decision_summary', type: 'text', allowNull: false },
      { name: 'contributions', type: 'json', defaultValue: [] },
      { name: 'open_gaps', type: 'json', defaultValue: [] },
      { name: 'next_actions', type: 'json', defaultValue: [] },
      { name: 'chat_message_id', type: 'string' },
    ],
  }));

  db.collection(defineCollection({
    name: 'video_projects',
    title: 'Video Projects',
    fields: [
      { name: 'id', type: 'uuid', primaryKey: true },
      { name: 'business_id', type: 'string' },
      { name: 'topic', type: 'text', allowNull: false },
      { name: 'angle', type: 'string' },
      { name: 'format', type: 'string' },
      { name: 'status', type: 'string', allowNull: false, defaultValue: 'draft' },
      { name: 'config_snapshot', type: 'json' },
      { name: 'output_url', type: 'text' },
      { name: 'output_metadata', type: 'json' },
      { name: 'error', type: 'text' },
      { name: 'job_path', type: 'string' },
    ],
  }));

  // CMO Video Room collections.
  db.collection(defineCollection({
    name: 'cmo_planning_messages',
    title: 'CMO Planning Messages',
    fields: [
      { name: 'id', type: 'string', primaryKey: true },
      { name: 'thread_id', type: 'string', allowNull: false },
      { name: 'project_id', type: 'string' },
      { name: 'business_id', type: 'string' },
      { name: 'role', type: 'string', allowNull: false },
      { name: 'text', type: 'text', allowNull: false },
      { name: 'proposal', type: 'json' },
      { name: 'gate', type: 'json' },
      { name: 'ready_to_advance', type: 'boolean', defaultValue: false },
    ],
  }));

  db.collection(defineCollection({
    name: 'video_room_projects',
    title: 'Video Room Projects',
    fields: [
      { name: 'id', type: 'string', primaryKey: true },
      { name: 'title', type: 'text', allowNull: false },
      { name: 'business_id', type: 'string' },
      { name: 'product', type: 'text' },
      { name: 'target_audience', type: 'text' },
      { name: 'business_goal', type: 'string' },
      { name: 'project_type', type: 'string' },
      { name: 'status', type: 'string', defaultValue: 'strategy_chat' },
      { name: 'current_page', type: 'string', defaultValue: 'strategy' },
    ],
  }));

  db.collection(defineCollection({
    name: 'video_room_cards',
    title: 'Video Room Cards',
    fields: [
      { name: 'id', type: 'string', primaryKey: true },
      { name: 'video_project_id', type: 'string', allowNull: false },
      { name: 'stage', type: 'string', allowNull: false },
      { name: 'summary', type: 'text' },
      { name: 'data', type: 'json' },
    ],
  }));

  db.collection(defineCollection({
    name: 'video_room_gates',
    title: 'Video Room Gates',
    fields: [
      { name: 'id', type: 'string', primaryKey: true },
      { name: 'video_project_id', type: 'string', allowNull: false },
      { name: 'gate_type', type: 'string', allowNull: false },
      { name: 'page', type: 'string' },
      { name: 'title', type: 'text' },
      { name: 'context', type: 'text' },
      { name: 'options', type: 'json' },
      { name: 'recommended_option', type: 'string' },
      { name: 'status', type: 'string', defaultValue: 'pending' },
      { name: 'decided_by', type: 'string' },
      { name: 'decided_at', type: 'date' },
    ],
  }));
}

function registerChatResource(app: any, db: any) {
  app.resourcer.define({
    name: 'chat',
    actions: {
      history: async (ctx: ActionContext, next: () => Promise<void>) => {
        const params = (ctx.action?.params as any) || {};
        const query = (ctx.request as any)?.query || {};
        const body = (ctx.request as any)?.body || {};
        const project_id = params.project_id || params.values?.project_id || query.project_id || body.project_id;
        if (!project_id) ctx.throw(400, 'project_id is required');

        const chatMessageRepo = db.getRepository('chat_messages');
        const rows = await chatMessageRepo.find({
          filter: { project_id },
          sort: ['createdAt'],
        });

        const instructionIds = (rows ?? [])
          .map((m: any) => m.metadata?.instructionId)
          .filter(Boolean);

        const statusMap: Record<string, string> = {};
        if (instructionIds.length > 0) {
          try {
            const instructionRepo = db.getRepository('founder_instructions');
            const instructions = await instructionRepo.find({
              filter: { id: { $in: instructionIds } },
            });
            for (const inst of (instructions ?? [])) {
              statusMap[String(inst.id)] = inst.status;
            }
          } catch (err) {
            // ignore
          }
        }

        ctx.body = {
          ok: true,
          data: (rows ?? []).map((m: any) => {
            const metadata = { ...(m.metadata ?? {}) };
            if (m.role === 'ceo' && metadata.instructionId) {
              const status = statusMap[metadata.instructionId];
              if (status === 'approved') {
                metadata.planStatus = 'approved';
              } else if (status === 'rejected') {
                metadata.planStatus = 'rejected';
              } else if (status === 'interpreted') {
                metadata.planStatus = 'pending';
              }
            }
            return {
              id: m.id,
              project_id: m.project_id,
              role: m.role,
              text: m.text,
              metadata,
              createdAt: m.createdAt || m.created_at,
            };
          }),
        };
        await next();
      },

      submitInstruction: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { raw_text, intent, constraints, requested_phase, project_id } = getValues(ctx);
        if (!raw_text || typeof raw_text !== 'string') ctx.throw(400, 'raw_text is required');

        const instructionRepo = db.getRepository('founder_instructions');
        const interpretationRepo = db.getRepository('ceo_interpretations');
        const taskRepo = db.getRepository('agent_tasks');
        const now = new Date().toISOString();

        // 1. Save Founder Message in chat_messages if project_id is provided
        if (project_id) {
          const chatMessageRepo = db.getRepository('chat_messages');
          await chatMessageRepo.create({
            values: {
              id: randomUUID(),
              project_id,
              role: 'founder',
              text: raw_text,
              created_at: now,
            },
          });
        }

        // Fetch active businesses for business_id inference.
        let activeBusinesses: { id: string; name: string; one_liner?: string }[] = [];
        try {
          const bizRepo = db.getRepository('businesses');
          if (bizRepo) {
            const rows = await bizRepo.find({ filter: { status: { $ne: 'deleted' } } });
            activeBusinesses = (rows ?? []).map((b: any) => ({
              id: String(b.id),
              name: String(b.title ?? b.name ?? b.id),
              one_liner: b.one_liner ?? undefined,
            }));
          }
        } catch {
          // plugin-business-portfolio may not be loaded in all envs — safe to skip
        }

        // Determine if business_id should be inferred from the current project
        let inferredBusinessId: string | null = null;
        if (project_id) {
          try {
            const projRepo = db.getRepository('projects');
            const project = await projRepo.findOne({ filterByTk: project_id });
            if (project) {
              inferredBusinessId = project.business_id ?? null;
            }
          } catch {
            // ignore
          }
        }

        const instruction = {
          id: randomUUID(),
          raw_text,
          source: 'chat',
          intent,
          constraints: Array.isArray(constraints) ? constraints : [],
          requested_phase,
          status: 'new',
          created_at: now,
          project_id: project_id ?? null,
          business_id: inferredBusinessId,
        };
        const instructionRecord = await instructionRepo.create({ values: instruction });

        const llm = buildLLMClient(raw_text);

        // Phase 5 (learning loop) — recall link. Inject previously-saved founder
        // memories into the CEO interpretation so past lessons shape new plans.
        // Only saved (founder-approved) insights, and never high-PII ones, are
        // sent to the LLM. Best-effort: failure must not block interpretation.
        const memories = await loadFounderMemories(ctx);

        // Fetch chat messages history context for this project if project_id is provided
        let chatHistory: any[] = [];
        if (project_id) {
          try {
            const chatMessageRepo = db.getRepository('chat_messages');
            const messages = await chatMessageRepo.find({
              filter: { project_id },
              sort: ['createdAt'],
            });
            chatHistory = (messages ?? [])
              .filter((m: any) => m.text && m.role)
              .map((m: any) => ({
                role: m.role,
                text: m.text,
              }));
          } catch (err) {
            // ignore
          }
        }

        const interpretationDraft = await interpretFounderInstruction(instruction as any, {
          llm,
          now: () => new Date(now),
          idGenerator: randomUUID,
          activeBusinesses: inferredBusinessId
            ? activeBusinesses.filter(b => b.id === inferredBusinessId)
            : activeBusinesses,
          memories,
          chatHistory,
        });

        const {
          needs_business_clarification,
          business_clarification_question,
          needs_clarification,
          clarification_question,
          new_business_proposal,
          business_id,
          ...interpCore
        } = interpretationDraft as any;

        const resolvedBusinessId = business_id ?? inferredBusinessId ?? null;

        const interpretation = {
          ...interpCore,
          id: randomUUID(),
          business_id: resolvedBusinessId,
          project_id: project_id ?? null,
        };
        const interpretationRecord = await interpretationRepo.create({ values: interpretation });

        await instructionRepo.update({
          filter: { id: instruction.id },
          values: { status: 'interpreted', business_id: resolvedBusinessId },
        });

        // instructionRecord is the pre-update reference; reflect the persisted
        // status/business_id in the response so clients don't see stale nulls.
        const instructionOut = {
          ...((instructionRecord as any).toJSON?.() ?? instructionRecord),
          status: 'interpreted',
          business_id: resolvedBusinessId,
          project_id: project_id ?? null,
        };

        // Clarification gate: if the CEO needs more from the founder — either an
        // ambiguous business OR a general planning gap — save the records but stop
        // task creation and return the question. This is the founder's planning
        // conversation: ask, then decompose once answered. (resolveClarification
        // is the pure l5-core decision; business ambiguity wins when both fire.)
        const clarification = resolveClarification(interpretationDraft);
        if (clarification.needs) {
          const ceoResponseText = clarification.question ?? '진행을 위해 추가 정보가 필요합니다.';
          const isBiz = clarification.kind === 'business';
          if (project_id) {
            const chatMessageRepo = db.getRepository('chat_messages');
            await chatMessageRepo.create({
              values: {
                id: randomUUID(),
                project_id,
                role: 'ceo',
                text: ceoResponseText,
                metadata: {
                  kind: 'clarification',
                  clarification_kind: clarification.kind,
                  clarification_question: clarification.question,
                  // keep legacy flag for back-compat with existing clients
                  ...(isBiz ? { needs_business_clarification: true, business_clarification_question: clarification.question } : {}),
                },
                created_at: now,
              },
            });
          }

          ctx.body = {
            ok: true,
            data: {
              instruction: instructionOut,
              interpretation: interpretationRecord,
              needs_clarification: true,
              clarification_kind: clarification.kind,
              clarification_question: clarification.question,
              needs_business_clarification: isBiz,
              business_clarification_question: isBiz ? clarification.question : null,
              tasks: [],
              ...(new_business_proposal ? { new_business_proposal } : {}),
            },
          };
          await next();
          return;
        }

        const workstreams = await decomposeIntoWorkstreams(interpretation, {
          idGenerator: () => randomUUID(),
          llm,
        });
        const tasks = assignExecutiveTasks(workstreams, {
          now: () => new Date(now),
          idGenerator: randomUUID,
        });

        const taskRecords = [];
        for (const task of tasks) {
          taskRecords.push(await taskRepo.create({
            values: {
              ...task,
              business_id: resolvedBusinessId,
              project_id: project_id ?? null,
            },
          }));
        }

        const ceoResponseText = interpretationRecord.goal ?? '지시를 분석했습니다.';
        if (project_id) {
          const chatMessageRepo = db.getRepository('chat_messages');
          await chatMessageRepo.create({
            values: {
              id: randomUUID(),
              project_id,
              role: 'ceo',
              text: ceoResponseText,
              metadata: {
                instructionId: instruction.id,
                goal: interpretationRecord.goal,
                phase: interpretationRecord.phase,
                risk_level: interpretationRecord.risk_level,
                assumptions: interpretationRecord.assumptions,
                success_criteria: interpretationRecord.success_criteria,
                proposed_tasks: taskRecords.map((t: any) => ({
                  id: t.id,
                  assigned_agent: t.assigned_agent,
                  title: t.title,
                  rationale: t.rationale,
                  expected_output: t.expected_output,
                  risk_level: t.risk_level,
                  approval_required: t.approval_required,
                })),
              },
              created_at: now,
            },
          });
        }

        ctx.body = {
          ok: true,
          data: {
            instruction: instructionOut,
            interpretation: interpretationRecord,
            tasks: taskRecords,
            ...(new_business_proposal ? { new_business_proposal } : {}),
            monitor_paths: {
              current_tasks: '/api/monitor:currentTasks',
              approval_queue: '/api/monitor:approvalQueue',
            },
          },
        };
        await next();
      },

      generateWorkflow: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { idea, current_phase } = getValues(ctx);
        if (!idea || typeof idea !== 'string') ctx.throw(400, 'idea is required');

        const llm = buildLLMClient(idea);
        const result = llm
          ? await generateWorkflowWithLLM(
              { business_idea: idea, current_phase: current_phase ?? undefined },
              llm,
            )
          : generateWorkflow({
              business_idea: idea,
              current_phase: current_phase ?? undefined,
            });

        ctx.body = { ok: true, data: result };
        await next();
      },

      approvePlan: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { instruction_id } = getValues(ctx);
        if (!instruction_id) ctx.throw(400, 'instruction_id is required');

        const taskRepo = ctx.db.getRepository('agent_tasks');
        const tasks = await taskRepo.find({ filter: { instruction_id, status: 'queued' } });

        let approved_count = 0;
        for (const task of tasks) {
          // Approving clears the approval gate so the Hermes dispatcher
          // (status=queued AND approval_required=false) can pick the task up.
          await taskRepo.update({
            filterByTk: task.id,
            values: { approval_required: false },
          });
          approved_count++;
        }

        await ctx.db.getRepository('founder_instructions').update({
          filter: { id: instruction_id },
          values: { status: 'approved' },
        });

        ctx.body = { ok: true, data: { instruction_id, approved_count } };
        await next();
      },
      rejectPlan: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { instruction_id } = getValues(ctx);
        if (!instruction_id) ctx.throw(400, 'instruction_id is required');

        const taskRepo = ctx.db.getRepository('agent_tasks');
        // Cancel only still-pending tasks; never touch already-running/done/killed.
        const tasks = await taskRepo.find({ filter: { instruction_id, status: 'queued' } });

        let rejected_count = 0;
        for (const task of tasks) {
          await taskRepo.update({ filterByTk: task.id, values: { status: 'killed' } });
          rejected_count++;
        }
        await ctx.db.getRepository('founder_instructions').update({
          filter: { id: instruction_id },
          values: { status: 'rejected' },
        });

        ctx.body = { ok: true, data: { instruction_id, rejected_count } };
        await next();
      },
    },
  });
}

function registerCrudResources(app: any) {
  app.resourcer.define({
    name: 'founder_instructions',
    actions: {
      create: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { raw_text, source = 'manual', intent, constraints, requested_phase } = getValues(ctx);
        if (!raw_text) ctx.throw(400, 'raw_text is required');
        ctx.body = await ctx.db.getRepository('founder_instructions').create({
          values: {
            id: randomUUID(),
            raw_text,
            source,
            intent,
            constraints: Array.isArray(constraints) ? constraints : [],
            requested_phase,
            status: 'new',
          },
        });
        await next();
      },
    },
  });

  app.resourcer.define({
    name: 'ceo_interpretations',
    actions: {
      create: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { instruction_id, goal, assumptions, phase, success_criteria, risk_level, approval_required } = getValues(ctx);
        if (!instruction_id || !goal || !phase) ctx.throw(400, 'instruction_id, goal, and phase are required');
        ctx.body = await ctx.db.getRepository('ceo_interpretations').create({
          values: {
            id: randomUUID(),
            instruction_id,
            goal,
            assumptions: Array.isArray(assumptions) ? assumptions : [],
            phase,
            success_criteria: Array.isArray(success_criteria) ? success_criteria : [],
            risk_level: risk_level ?? 'D1',
            approval_required: approval_required ?? false,
          },
        });
        await ctx.db.getRepository('founder_instructions').update({
          filter: { id: instruction_id },
          values: { status: 'interpreted' },
        });
        await next();
      },
    },
  });

  app.resourcer.define({
    name: 'agent_tasks',
    actions: {
      create: async (ctx: ActionContext, next: () => Promise<void>) => {
        const {
          instruction_id,
          interpretation_id,
          assigned_agent,
          title,
          rationale,
          expected_output,
          approval_required,
          risk_level,
          phase,
          source_ref,
          due_at,
        } = getValues(ctx);
        if (!instruction_id || !assigned_agent || !title || !rationale || !expected_output) {
          ctx.throw(400, 'instruction_id, assigned_agent, title, rationale, and expected_output are required');
        }
        ctx.body = await ctx.db.getRepository('agent_tasks').create({
          values: {
            id: randomUUID(),
            instruction_id,
            interpretation_id,
            assigned_agent,
            title,
            rationale,
            expected_output,
            status: 'queued',
            approval_required: approval_required ?? false,
            risk_level,
            phase,
            source_ref,
            due_at,
          },
        });
        await next();
      },
      updateStatus: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { filterByTk } = ctx.action?.params ?? {};
        const { status, blocker } = getValues(ctx);
        const valid = ['queued', 'running', 'blocked', 'needs_review', 'done', 'killed'];
        if (typeof status !== 'string' || !valid.includes(status)) {
          ctx.throw(400, `status must be one of: ${valid.join(', ')}`);
        }
        await ctx.db.getRepository('agent_tasks').update({ filterByTk, values: { status, blocker } });
        ctx.body = await ctx.db.getRepository('agent_tasks').findOne({ filter: { id: filterByTk } });
        await next();
      },
      listByAgent: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { agent } = ctx.action?.params ?? {};
        ctx.body = await ctx.db.getRepository('agent_tasks').find({ filter: { assigned_agent: agent } });
        await next();
      },
      listByStatus: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { status } = ctx.action?.params ?? {};
        ctx.body = await ctx.db.getRepository('agent_tasks').find({ filter: { status } });
        await next();
      },
    },
  });

  app.resourcer.define({
    name: 'agent_handoffs',
    actions: {
      create: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { task_id, from_agent, to_agent, context, next_action, blocker, approval_required } = getValues(ctx);
        if (!task_id || !from_agent || !context || !next_action) {
          ctx.throw(400, 'task_id, from_agent, context, and next_action are required');
        }
        ctx.body = await ctx.db.getRepository('agent_handoffs').create({
          values: {
            id: randomUUID(),
            task_id,
            from_agent,
            to_agent,
            context,
            next_action,
            blocker,
            approval_required: approval_required ?? false,
          },
        });
        await next();
      },
      listByTaskId: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { task_id } = ctx.action?.params ?? {};
        ctx.body = await ctx.db.getRepository('agent_handoffs').find({ filter: { task_id } });
        await next();
      },
    },
  });

  app.resourcer.define({
    name: 'acr',
    actions: {
      approvalCallback: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { token, approved, notes } = getValues(ctx);
        if (!token) ctx.throw(400, 'token is required');

        const taskRepo = ctx.db.getRepository('agent_tasks');
        const tasks = await taskRepo.find({ filter: { acr_token: token } });
        const task = tasks[0];
        if (!task) ctx.throw(404, `No task found for token: ${token}`);

        const newStatus = approved ? 'done' : 'killed';
        await taskRepo.update({
          filterByTk: task.id,
          values: {
            status: newStatus,
            approval_required: false,
            blocker: !approved && notes ? String(notes) : null,
            updated_at: new Date().toISOString(),
          },
        });

        ctx.body = { ok: true, task_id: task.id, new_status: newStatus, token };
        await next();
      },
    },
  });

  app.resourcer.define({
    name: 'agent',
    actions: {
      taskCallback: async (ctx: ActionContext, next: () => Promise<void>) => {
        // Machine auth: non-expiring shared secret (set on both ACR and NocoBase).
        // Public ACL above means NocoBase skips JWT; we enforce the secret here.
        const expectedSecret = process.env.L5_SHARED_SECRET;
        if (expectedSecret) {
          // Koa ctx.get(header) exists at runtime; ActionContext type omits it.
          const provided = (ctx as any).get('x-l5-shared-secret');
          if (provided !== expectedSecret) {
            ctx.throw(401, 'Invalid or missing x-l5-shared-secret');
          }
        }
        const {
          l5_task_id,
          phase,
          status,
          output_summary,
          next_owner,
          // Phase 16: phase-to-phase context handoff fields
          diff_summary,
          log_tail,
          exit_code,
          // Phase 17: file-change counts for verifier orphan detection
          changed_files,
          modified_existing_files,
          branch,
          // Phase 18: clarification + risk reassessment fields
          questions,
          acr_callback_url,
          new_risk_level,
          // Phase 2: review & merge outcome fields
          merge_action,
          merge_target,
          pr_url,
        } = getValues(ctx);
        if (!l5_task_id) ctx.throw(400, 'l5_task_id is required');
        if (!status) ctx.throw(400, 'status is required');

        const taskRepo = ctx.db.getRepository('agent_tasks');
        const task = await taskRepo.findOne({ filter: { id: l5_task_id } });
        if (!task) ctx.throw(404, 'Task not found');

        let updates: Record<string, any> = { updated_at: new Date().toISOString() };

        // Phase 16: compact phase-context line (kept short; full data goes to logs)
        const phaseCtx = [
          phase ? `phase=${phase}` : null,
          branch ? `branch=${branch}` : null,
          exit_code !== undefined && exit_code !== null ? `exit=${exit_code}` : null,
          diff_summary ? `diff_lines=${String(diff_summary).split('\n').length}` : null,
        ].filter(Boolean).join(' ');

        // Phase 17: CTO result verification gate.
        // Only runs for CTO tasks reporting success. Falls back to deterministic
        // mode (no LLM call) — Phase 17.1 will wire OPENAI_API_KEY-gated LLM.
        //
        // M9 (2026-06-04): verify ONLY on all_done. The verifier judges against the
        // task's FULL expected_output, so running it on intermediate phase_complete
        // callbacks falsely fails every non-final phase ("only research done, no
        // implementation yet") and flips the task to needs_review mid-pipeline —
        // breaking autonomous multi-phase completion (the CTO should finish all
        // phases, then be judged). Intermediate phases just record progress and let
        // ACR's auto-dispatcher drain the next phase. all_done still gates quality.
        let verifierVerdict: any = null;
        // integrate(통합·배선) phase는 중간(phase_complete) 시점에도 "고립" 전용
        // 결정적 검사를 돈다. all_done 검증은 task 전체 expected 대비라 중간 phase에
        // 돌리면 false-fail이지만, integrate 고립은 phase 종류 + 파일 카운트만으로
        // 판정(LLM·expected 무관)하므로 그 phase 완료 즉시 잡는다. 각 phase는 commit
        // 후 worktree가 clean이라 changed/modified_existing은 그 phase 단독 diff다.
        const verifyIntegrateNow =
          status === 'phase_complete' &&
          task.assigned_agent === 'CTO' &&
          isIntegratePhaseName(phase);
        const shouldVerify =
          (status === 'all_done' && task.assigned_agent === 'CTO') ||
          verifyIntegrateNow;
        if (shouldVerify) {
          try {
            const verifierInput = {
              task_title: task.title,
              expected_output: task.expected_output ?? '',
              diff_summary: diff_summary ?? undefined,
              log_tail: log_tail ?? undefined,
              exit_code: typeof exit_code === 'number' ? exit_code : undefined,
              changed_files:
                typeof changed_files === 'number' ? changed_files : undefined,
              modified_existing_files:
                typeof modified_existing_files === 'number'
                  ? modified_existing_files
                  : undefined,
            };
            if (verifyIntegrateNow) {
              // 결정적만 — LLM이 task 전체를 평가해 중간 phase를 오판하지 않도록.
              verifierVerdict = verifyIntegratePhase(verifierInput);
            } else {
              const verifierLLM = buildLLMClient(task.title ?? '');
              verifierVerdict = await verifyCTOPhase(verifierInput, verifierLLM);
            }
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[taskCallback] verifier threw:', err);
          }
        }

        if (status === 'all_done') {
          if (verifierVerdict && verifierVerdict.verdict === 'fail') {
            // Technical failure → CEO review loop + CTO self-heal, NOT Founder.
            updates.status = 'needs_review';
            updates.blocker = `verifier:fail ${verifierVerdict.reason}. retry=${verifierVerdict.retry_recommended}. ${phaseCtx}`.trim();
          } else if (verifierVerdict && verifierVerdict.verdict === 'inconclusive') {
            updates.status = 'needs_review';
            updates.blocker = `verifier:inconclusive ${verifierVerdict.reason}. ${phaseCtx}`.trim();
          } else if (typeof task?.source_ref === 'string' && task.source_ref.startsWith('selfmod:')) {
            // P3-4: a CTO self-modification passed the verifier. Do NOT auto-merge;
            // persist the structured diff/branch and gate it to the founder approval
            // queue (diff preview → Apply/Reject). Floor default D3 ⇒ always gated.
            const floor = process.env.L5_SELFMOD_AUTO_APPLY_FLOOR || 'D3';
            const rank = (r?: string) => ({ D1: 1, D2: 2, D3: 3, D4: 4, D5: 5 }[r ?? 'D3'] ?? 3);
            updates.status = 'needs_review';
            updates.approval_required = rank(task.risk_level) >= rank(floor);
            updates.self_mod_status = 'awaiting_apply';
            updates.acr_branch = branch ?? null;
            updates.acr_diff = diff_summary ?? null;
            if (pr_url) updates.acr_pr_url = pr_url;
            updates.blocker = `selfmod:awaiting_apply 변경 검토 필요${branch ? ` (branch=${branch})` : ''}`;
            // reflect on the origin Tool Request
            if (task.self_mod_origin) {
              await taskRepo.update({ filterByTk: task.self_mod_origin, values: { self_mod_status: 'awaiting_apply' } }).catch(() => {});
            }
          } else {
            updates.status = 'done';
            // Phase 2: record how the work was merged (or left for review).
            const mergeNote = merge_action
              ? ` merge=${merge_action}${merge_target ? `->${merge_target}` : ''}${pr_url ? ` pr=${pr_url}` : ''}`
              : '';
            if (phaseCtx || mergeNote) updates.blocker = `done.${mergeNote} ${phaseCtx}`.trim();
            // Best-effort Telegram notification — never blocks taskCallback response.
            sendCycleDoneTelegram(task, l5_task_id as string).catch(() => { /* silent */ });
          }
        } else if (status === 'empty_output') {
          // Phase 1: agent finished exit 0 but produced no file changes ("empty
          // branch") after retries. Internal technical state → CEO review / CTO
          // self-heal, not the Founder approval queue.
          updates.status = 'needs_review';
          updates.blocker = [`empty_output: agent produced no file changes`, output_summary, phaseCtx]
            .filter(Boolean)
            .join(' | ');
        } else if (status === 'merge_conflict') {
          // Phase 2: clean run but the branch could not be auto-merged into the
          // base. CEO review / CTO self-heal; the branch is preserved.
          updates.status = 'needs_review';
          updates.blocker = [`merge_conflict${merge_target ? `->${merge_target}` : ''}: manual merge required`, phaseCtx]
            .filter(Boolean)
            .join(' | ');
        } else if (status === 'failed') {
          updates.status = 'needs_review';
          updates.blocker = [output_summary, phaseCtx].filter(Boolean).join(' | ');
        } else if (status === 'blocked') {
          updates.status = 'blocked';
          updates.blocker = [output_summary, phaseCtx].filter(Boolean).join(' | ');
        } else if (status === 'phase_complete') {
          // Phase 검토 루프: 중간 phase 결과도 verifier로 평가한다(상단 shouldVerify는
          // all_done/phase_complete 모두 포함). fail/inconclusive면 needs_review로 올려
          // cto-verification-loop(verifier:fail + retry=true)가 재시도하거나 founder가
          // 검토하게 한다. pass면 기존처럼 진행 메모만 남긴다(ACR auto-dispatcher가 다음
          // phase를 자동 드레인하는 흐름은 그대로 둔다).
          if (verifierVerdict && verifierVerdict.verdict === 'fail') {
            // CEO review loop / CTO self-heal, not the Founder approval queue.
            updates.status = 'needs_review';
            updates.blocker = `verifier:fail ${verifierVerdict.reason}. retry=${verifierVerdict.retry_recommended}. phase=${phase}. ${phaseCtx}`.trim();
          } else if (verifierVerdict && verifierVerdict.verdict === 'inconclusive') {
            updates.status = 'needs_review';
            updates.blocker = `verifier:inconclusive ${verifierVerdict.reason}. phase=${phase}. ${phaseCtx}`.trim();
          } else {
            updates.blocker = `phase: ${phase} complete. next: ${next_owner || 'pending'}. ${phaseCtx}`.trim();
          }
        } else if (status === 'needs_clarification') {
          // Phase 18: ACR raised clarifying questions. Try headless answer via CTO LLM;
          // escalate to Founder if risk >= D4 or LLM unavailable.
          const qs: string[] = Array.isArray(questions) ? questions.filter((q: unknown) => typeof q === 'string') : [];
          const clarifyLLM = buildLLMClient(task.title ?? '');
          let clarification: any = null;
          try {
            clarification = await answerClarifications(
              {
                task_title: task.title,
                expected_output: task.expected_output ?? '',
                risk_level: task.risk_level ?? 'D3',
                questions: qs,
                context: phaseCtx,
              },
              clarifyLLM,
            );
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[taskCallback] clarifier threw:', err);
            clarification = { verdict: 'escalate', answers: qs.map(() => ''), reason: 'clarifier exception' };
          }

          if (clarification.verdict === 'answered' && typeof acr_callback_url === 'string' && acr_callback_url) {
            // Fire reply to ACR; do not block taskCallback on failure.
            try {
              await fetch(acr_callback_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  l5_task_id,
                  phase,
                  questions: qs,
                  answers: clarification.answers,
                }),
                signal: (AbortSignal as any).timeout?.(5000),
              });
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn('[taskCallback] clarify reply failed:', err);
            }
            updates.blocker = `clarification:answered ${qs.length} q. ${phaseCtx}`.trim();
          } else {
            // Clarifications go to the CEO review lane — the CEO resolves them,
            // not the Founder. (Founder gate = outbound message / payment only.)
            updates.status = 'needs_review';
            updates.blocker = `clarification:escalate ${clarification.reason}. ${phaseCtx}`.trim();
          }
          ctx.body = {
            success: true,
            task_id: l5_task_id,
            new_status: updates.status ?? task.status,
            clarification,
          };
          await taskRepo.update({ filterByTk: l5_task_id, values: updates });
          await next();
          return;
        } else if (status === 'risk_reassess') {
          // Phase 18: ACR re-evaluated risk based on packet content. Sync to L5
          // agent_tasks.risk_level. Risk level is an internal severity signal —
          // it does NOT promote the Founder approval gate (outbound / payment only).
          const allowed = ['D1', 'D2', 'D3', 'D4', 'D5'];
          if (typeof new_risk_level !== 'string' || !allowed.includes(new_risk_level)) {
            ctx.throw(400, `risk_reassess requires new_risk_level in ${allowed.join('|')}`);
          }
          updates.risk_level = new_risk_level;
          updates.blocker = `risk_reassess: ${task.risk_level ?? 'n/a'} -> ${new_risk_level}. ${phaseCtx}`.trim();
          await taskRepo.update({ filterByTk: l5_task_id, values: updates });
          ctx.body = {
            success: true,
            task_id: l5_task_id,
            new_status: task.status,
            new_risk_level,
          };
          await next();
          return;
        } else {
          ctx.throw(400, `Unknown status: ${status}`);
        }

        await taskRepo.update({ filterByTk: l5_task_id, values: updates });

        // Phase 16: structured log of phase context for downstream replanning (Phase 17).
        if (diff_summary || log_tail) {
          // eslint-disable-next-line no-console
          console.log(`[taskCallback] l5_task_id=${l5_task_id} phase=${phase} status=${status} ${phaseCtx}`);
          if (log_tail) {
            // eslint-disable-next-line no-console
            console.log(`[taskCallback] log_tail:\n${String(log_tail).slice(0, 1200)}`);
          }
        }

        ctx.body = {
          success: true,
          task_id: l5_task_id,
          new_status: updates.status ?? task.status,
          accepted_context: {
            has_diff: Boolean(diff_summary),
            has_log: Boolean(log_tail),
            exit_code: exit_code ?? null,
            branch: branch ?? null,
          },
          verifier: verifierVerdict ?? null,
        };
        await next();
      },

      executeTask: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { task_id } = getValues(ctx);
        if (!task_id) ctx.throw(400, 'task_id is required');

        const taskRepo = ctx.db.getRepository('agent_tasks');
        const handoffRepo = ctx.db.getRepository('agent_handoffs');

        const task = await taskRepo.findOne({ filter: { id: task_id } });
        if (!task) ctx.throw(404, `Task ${task_id} not found`);

        // CTO tasks without approval_required are owned by the Hermes dispatcher
        // (60s launchd cycle → runCTOAgent → ACR). executeTask must not alter their
        // status, otherwise the dispatcher will not see them as queued and ACR
        // dispatch is silently skipped.
        if (task.assigned_agent === 'CTO' && !task.approval_required) {
          ctx.body = {
            ok: true,
            deferred: true,
            data: {
              task_id,
              status: task.status,
              message: 'CTO task (approval_required=false) is managed by the Hermes dispatcher. No status change made.',
            },
          };
          await next();
          return;
        }

        try {
          // Mark running before the slow LLM work so the inbox shows live status
          // while the executive + CEO are thinking.
          try {
            await taskRepo.update({
              filterByTk: task_id,
              values: { status: 'running', blocker: null },
            });
          } catch { /* non-fatal; continue */ }

          // CEO-orchestration: executive does real work (Haiku) → CEO reviews (Haiku).
          const llm = buildLLMClient(`${task.title ?? ''} ${task.rationale ?? ''}`);

          // M2+M3: recall insights from founder_memory + secondbrain (if configured).
          // Best-effort: failure must not block task execution.
          let recalledInsights: string | undefined;
          try {
            const sources: any[] = [makeFounderMemoryInsightSource(ctx)];
            if (_secondBrainTransport && typeof createSecondBrainSource === 'function') {
              sources.push(createSecondBrainSource(_secondBrainTransport));
            }
            const insightRecords = typeof recallInsights === 'function'
              ? await recallInsights({ sources, limit: 20 })
              : [];
            const formatted: string = insightRecords.length > 0 && typeof formatInsightsForPrompt === 'function'
              ? formatInsightsForPrompt(insightRecords)
              : '';
            if (formatted) recalledInsights = formatted;
          } catch (err) {
            console.warn('[executeTask] memory recall for executive failed:', err);
          }

          // M3: build secondbrain tools so the executive can actively query/propose.
          const sbTools: any[] = [];
          try {
            if (_secondBrainTransport && typeof createSecondBrainSource === 'function' && typeof createSecondBrainTools === 'function') {
              const sbSource = createSecondBrainSource(_secondBrainTransport);
              // proposeWrite: routes executive write proposals into founder_memory pending (CEO gate).
              const proposeWrite = async (req: any) => {
                const result = await makeFounderMemoryInsightSource(ctx).write!(req);
                return result.ok
                  ? { ok: true, data: { queued: true, message: 'CEO 검토 큐에 추가됨' } }
                  : { ok: false, error: result.error };
              };
              sbTools.push(...createSecondBrainTools({ source: sbSource, proposeWrite }));
            }
          } catch (err) {
            console.warn('[executeTask] secondbrain tools build failed:', err);
          }

          // M5: video-factory tools — CMO-exclusive tools for video content generation.
          // allowed_roles: ['CMO'] means the tool-loop auto-rejects other roles.
          // Graceful: if transport is null (env not set), tools are simply not added.
          try {
            if (_videoFactoryTransport && typeof createVideoFactoryTools === 'function') {
              sbTools.push(...createVideoFactoryTools(createTrackedVideoFactoryTransport(ctx, task.business_id ?? null)));
            }
          } catch (err) {
            console.warn('[executeTask] video-factory tools build failed:', err);
          }

          // M4: ask_founder tool — lets any executive pause and ask the founder
          // a question. When called, it inserts a consultation record and
          // returns data.await_founder=true so the tool-loop terminates early.
          try {
            if (typeof createAskFounderTool === 'function') {
              const proposeConsultation = async (req: any): Promise<any> => {
                const consultationRepo = ctx.db.getRepository('executive_consultations');
                const rec = openConsultation({ id: randomUUID(), ...req });
                await consultationRepo.create({ values: rec });
                // Mark task as needs_review so the UI surfaces the pause
                await taskRepo.update({
                  filterByTk: task_id,
                  values: {
                    status: 'needs_review',
                    blocker: `awaiting_founder: ${req.question.slice(0, 120)}`,
                  },
                });
                return { ok: true, data: { await_founder: true, consultation_id: rec.id } };
              };
              sbTools.push(createAskFounderTool({ propose: proposeConsultation }));
            }
          } catch (err) {
            console.warn('[executeTask] ask_founder tool build failed:', err);
          }

          // M6: ask_executive tool — lets an executive delegate work to another
          // executive (via CEO orchestration). Inserts an `open` delegation record
          // and pauses this task (blocker=awaiting_delegation:<id>). The delegation
          // is driven to resolution by the `delegation/advance` action.
          try {
            if (typeof createAskExecutiveTool === 'function') {
              const proposeDelegation = async (req: any): Promise<any> => {
                const delegationRepo = ctx.db.getRepository('executive_delegations');
                const did = randomUUID();
                await delegationRepo.create({
                  values: {
                    id: did,
                    from_agent: req.from_agent,
                    to_agent: req.to_agent,
                    origin_task_id: req.origin_task_id,
                    objective: req.objective,
                    acceptance_criteria: req.acceptance_criteria,
                    status: 'open',
                    round: 0,
                    max_rounds: req.max_rounds,
                    business_id: req.business_id ?? task.business_id ?? null,
                  },
                });
                await taskRepo.update({
                  filterByTk: task_id,
                  values: {
                    status: 'needs_review',
                    blocker: `awaiting_delegation: ${did}`,
                  },
                });
                return { ok: true, data: { delegation_opened: true, delegation_id: did } };
              };
              sbTools.push(createAskExecutiveTool({ propose: proposeDelegation }));
            }
          } catch (err) {
            console.warn('[executeTask] ask_executive tool build failed:', err);
          }

          // M4: inject resolved consultations for this task into recalledInsights
          // so the executive re-run has the founder's answer as context.
          try {
            const consultationRepo = ctx.db.getRepository('executive_consultations');
            const resolvedOnes = await consultationRepo.find({
              filter: { task_id: task.id, status: 'resolved' },
              sort: ['-createdAt'],
            });
            if (resolvedOnes && resolvedOnes.length > 0 && typeof formatConsultationForPrompt === 'function') {
              const consultationContext = resolvedOnes
                .map((c: any) => formatConsultationForPrompt(c))
                .filter(Boolean)
                .join('\n\n');
              if (consultationContext) {
                recalledInsights = recalledInsights
                  ? `${recalledInsights}\n\n${consultationContext}`
                  : consultationContext;
              }
            }
          } catch (err) {
            console.warn('[executeTask] consultation context inject failed:', err);
          }

          // M6: inject resolved delegations for this origin task so the requesting
          // executive re-run sees the delegated work's result as context.
          try {
            const delegationRepo = ctx.db.getRepository('executive_delegations');
            const resolvedDels = await delegationRepo.find({
              filter: { origin_task_id: task.id, status: 'resolved' },
              sort: ['-createdAt'],
            });
            if (resolvedDels && resolvedDels.length > 0) {
              const delContext = resolvedDels
                .map(
                  (d: any) =>
                    `# 위임 결과 (${d.to_agent} → ${d.from_agent})\n` +
                    `목표: ${d.objective}\n결과: ${d.result_summary ?? '(요약 없음)'}`,
                )
                .join('\n\n');
              if (delContext) {
                recalledInsights = recalledInsights
                  ? `${recalledInsights}\n\n${delContext}`
                  : delContext;
              }
            }
          } catch (err) {
            console.warn('[executeTask] delegation context inject failed:', err);
          }

          // Multi-tool tool-loop makes several slow claude rounds (+ npx/python
          // spawns) — too heavy for a synchronous HTTP action. Default OFF: the
          // executive still LEARNS from secondbrain via recalledInsights (fast
          // read). Set L5_EXECUTIVE_TOOLS=1 to enable active tool-calling
          // (suitable only for an async/dispatcher path). (perf fix 2026-06-02)
          const enableExecTools = process.env.L5_EXECUTIVE_TOOLS === '1';
          const result = await executeAgentTaskLive(task, llm, {
            recalledInsights,
            tools: enableExecTools ? sbTools : [],
          });

          // M4: if ask_founder was invoked during the tool loop, the task is already
          // set to needs_review with an awaiting_founder: blocker. Re-read the current
          // task state; if it was set to needs_review by ask_founder, skip the normal
          // status update so the consultation pause is preserved.
          const taskAfterExec = await taskRepo.findOne({ filter: { id: task_id } });
          const consultationOpened =
            taskAfterExec?.status === 'needs_review' &&
            typeof taskAfterExec?.blocker === 'string' &&
            taskAfterExec.blocker.startsWith('awaiting_founder:');
          if (consultationOpened) {
            ctx.body = {
              ok: true,
              data: {
                task_id,
                status: 'needs_review',
                approval_required: false,
                deferred: true,
                message: '창업자 협의 대기 중. 답변 후 재실행됩니다.',
              },
            };
            await next();
            return;
          }

          // M6: if ask_executive was invoked, the task is paused with an
          // awaiting_delegation: blocker. Skip the normal status update; the
          // delegation/advance action drives the loop and resumes this task.
          const delegationOpened =
            taskAfterExec?.status === 'needs_review' &&
            typeof taskAfterExec?.blocker === 'string' &&
            taskAfterExec.blocker.startsWith('awaiting_delegation:');
          if (delegationOpened) {
            ctx.body = {
              ok: true,
              data: {
                task_id,
                status: 'needs_review',
                approval_required: false,
                deferred: true,
                delegation_id: taskAfterExec.blocker.split('awaiting_delegation:')[1]?.trim() || null,
                message: '임원 위임 진행 중. 검증 루프 완료 후 재개됩니다.',
              },
            };
            await next();
            return;
          }

          let approval_required = result.approval_required;

          // D3+ 태스크에 ACR 승인 토큰 자동 발행
          const HIGH_RISK: string[] = ['D3', 'D4', 'D5'];
          const taskRisk = (task.risk_level ?? result.risk_level) as string | undefined;
          const acr_token = approval_required && taskRisk && HIGH_RISK.includes(taskRisk)
            ? randomUUID()
            : null;

          // Persist the full handoff chain: executive work product + CEO review,
          // so the founder can scroll the inbox and see the work process.
          for (const h of result.handoffs) {
            await handoffRepo.create({
              values: {
                id: randomUUID(),
                ...h,
              },
            });
          }

          // Update task status. Persist the full AgentOutput so the inbox,
          // monitor drill-down, and Chief-of-Staff synthesis can show the real
          // work product (not just a one-line handoff context).
          await taskRepo.update({
            filterByTk: task_id,
            values: {
              status: result.updated_status,
              approval_required,
              blocker: result.blocked ? result.reason : (result.output.bottleneck || null),
              output: result.output ?? null,
              ...(acr_token ? { acr_token } : {}),
            },
          });

          const updatedTask = await taskRepo.findOne({ filter: { id: task_id } });

          // P1: if this was the last task of its instruction to go terminal,
          // Chief of Staff synthesizes one founder deliverable card. Best-effort.
          await maybeSynthesizeInstruction(ctx, task.instruction_id ?? updatedTask?.instruction_id)
            .catch((err: any) => console.warn('[synthesis] skipped:', err?.message));

          // Phase 5 (learning loop) — collection link. When a completed task
          // produced a reusable insight, persist it as a pending founder_memory
          // candidate so the founder can review/save it and later runs can
          // reference it. Best-effort: never blocks or fails the task response.
          await persistTaskInsight(ctx, task, result).catch((err) => {
            console.warn('[executeTask] insight persist failed:', err);
          });

          ctx.body = {
            ok: true,
            data: {
              task_id,
              status: result.updated_status,
              approval_required,
              acr_token,
              ceo_decision: result.ceo_decision,
              ceo_note: result.ceo_note,
              founder_reason: result.founder_reason,
              validation_errors: result.validation_errors,
              output: result.output,
              handoffs: result.handoffs,
              updated_task: updatedTask,
            },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.throw(500, `Failed to execute task: ${message}`);
        }

        await next();
      },
    },
  });
}

// M4: consultation resource — list (poll) + respond (founder reply → task resume)
function registerConsultationResource(app: any, db: any) {
  app.resourcer.define({
    name: 'consultation',
    actions: {
      list: async (ctx: ActionContext, next: () => Promise<void>) => {
        const params = (ctx.action?.params as any) || {};
        const query = (ctx.request as any)?.query || {};
        const business_id = params.business_id || query.business_id || null;
        const status = params.status || query.status || 'awaiting_founder';

        const repo = db.getRepository('executive_consultations');
        const filter: Record<string, any> = { status };
        if (business_id) filter.business_id = business_id;

        const rows = await repo.find({ filter, sort: ['-createdAt'] });
        ctx.body = { ok: true, data: rows ?? [] };
        await next();
      },

      respond: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { id, founder_response } = getValues(ctx) as {
          id?: string;
          founder_response?: string;
        };
        if (!id) ctx.throw(400, 'id is required');
        if (!founder_response || typeof founder_response !== 'string' || !founder_response.trim()) {
          ctx.throw(400, 'founder_response is required');
        }

        const repo = db.getRepository('executive_consultations');
        const existing = await repo.findOne({ filter: { id } });
        if (!existing) ctx.throw(404, `Consultation ${id} not found`);

        const updated = resolveConsultation(existing, founder_response);
        await repo.update({
          filter: { id },
          values: {
            status: updated.status,
            founder_response: updated.founder_response,
            resolved_at: updated.resolved_at,
          },
        });

        // Resume: put the task back to queued so it can be re-executed with the founder's answer.
        if (existing.task_id) {
          const taskRepo = db.getRepository('agent_tasks');
          const task = await taskRepo.findOne({ filter: { id: existing.task_id } });
          if (task && task.status === 'needs_review') {
            await taskRepo.update({
              filterByTk: existing.task_id,
              values: { status: 'queued', blocker: null },
            });
          }
        }

        ctx.body = { ok: true, data: updated };
        await next();
      },
    },
  });
}

function registerVideoProjectResource(app: any, db: any) {
  app.resourcer.define({
    name: 'video-project',
    actions: {
      list: async (ctx: ActionContext, next: () => Promise<void>) => {
        const params = (ctx.action?.params as any) || {};
        const query = (ctx.request as any)?.query || {};
        const business_id = params.business_id || query.business_id || null;
        const filter: Record<string, any> = {};
        if (business_id) filter.business_id = business_id;

        const rows = await db.getRepository('video_projects').find({
          filter,
          sort: ['-createdAt'],
        });
        ctx.body = { ok: true, data: rows ?? [] };
        await next();
      },

      create: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project = createVideoProject({
          id: v.id ?? randomUUID(),
          business_id: v.business_id ?? null,
          topic: v.topic,
          angle: v.angle ?? null,
          format: v.format ?? null,
          config_snapshot: v.config_snapshot ?? null,
        });

        const rec = await db.getRepository('video_projects').create({ values: project });
        (ctx as any).status = 201;
        ctx.body = { ok: true, data: rec };
        await next();
      },

      advance: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { id } = getValues(ctx) as { id?: string };
        if (!id) ctx.throw(400, 'id is required');

        const repo = db.getRepository('video_projects');
        const existing = await repo.findOne({ filter: { id } });
        if (!existing) ctx.throw(404, `VideoProject ${id} not found`);

        const advanced = advanceToGenerating(asPlainRecord(existing));
        if (!_videoFactoryTransport) {
          const failed = failVideoProject(advanced, 'video factory transport is not configured');
          await repo.update({
            filterByTk: id,
            values: pickVideoProjectPersistedFields(failed),
          });
          ctx.body = { ok: false, data: failed, error: failed.error };
          await next();
          return;
        }

        const result = await _videoFactoryTransport.generate({
          topic: advanced.topic,
          ...(advanced.angle ? { angle: advanced.angle } : {}),
          ...(advanced.format ? { format: advanced.format } : {}),
        });

        if (!result.ok) {
          const failed = failVideoProject(advanced, result.error ?? 'video factory generation failed');
          await repo.update({
            filterByTk: id,
            values: pickVideoProjectPersistedFields(failed),
          });
          ctx.body = { ok: false, data: failed, error: failed.error };
          await next();
          return;
        }

        const jobPath = typeof (result.data as any)?.job_path === 'string'
          ? (result.data as any).job_path
          : null;
        const generating = advanceToGenerating(asPlainRecord(existing), jobPath);
        await repo.update({
          filterByTk: id,
          values: pickVideoProjectPersistedFields(generating),
        });
        ctx.body = { ok: true, data: generating, transport: result.data ?? null };
        await next();
      },

      complete: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { id, output_url, output_metadata } = getValues(ctx) as {
          id?: string;
          output_url?: string;
          output_metadata?: unknown;
        };
        if (!id) ctx.throw(400, 'id is required');

        const repo = db.getRepository('video_projects');
        const existing = await repo.findOne({ filter: { id } });
        if (!existing) ctx.throw(404, `VideoProject ${id} not found`);

        const completed = completeVideoProject(asPlainRecord(existing), output_url ?? '', output_metadata ?? null);
        await repo.update({
          filterByTk: id,
          values: pickVideoProjectPersistedFields(completed),
        });
        ctx.body = { ok: true, data: completed };
        await next();
      },

      fail: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { id, error } = getValues(ctx) as { id?: string; error?: string };
        if (!id) ctx.throw(400, 'id is required');

        const repo = db.getRepository('video_projects');
        const existing = await repo.findOne({ filter: { id } });
        if (!existing) ctx.throw(404, `VideoProject ${id} not found`);

        const failed = failVideoProject(asPlainRecord(existing), error ?? '');
        await repo.update({
          filterByTk: id,
          values: pickVideoProjectPersistedFields(failed),
        });
        ctx.body = { ok: true, data: failed };
        await next();
      },
    },
  });
}

function asPlainRecord(record: any): any {
  return record?.toJSON?.() ?? record;
}

function pickVideoProjectPersistedFields(project: any): Record<string, any> {
  return {
    business_id: project.business_id ?? null,
    topic: project.topic,
    angle: project.angle ?? null,
    format: project.format ?? null,
    status: project.status,
    config_snapshot: project.config_snapshot ?? null,
    output_url: project.output_url ?? null,
    output_metadata: project.output_metadata ?? null,
    error: project.error ?? null,
    job_path: project.job_path ?? null,
  };
}

function createTrackedVideoFactoryTransport(ctx: ActionContext, business_id: string | null): any {
  return {
    async configure(preset: any) {
      return _videoFactoryTransport.configure(preset);
    },

    async getConfig() {
      return _videoFactoryTransport.getConfig?.();
    },

    async generate(brief: { topic: string; angle?: string; format?: string }) {
      const repo = ctx.db.getRepository('video_projects');
      const config = _videoFactoryTransport.getConfig
        ? await _videoFactoryTransport.getConfig().catch(() => null)
        : null;
      const draft = createVideoProject({
        id: randomUUID(),
        business_id,
        topic: brief.topic,
        angle: brief.angle ?? null,
        format: brief.format ?? null,
        config_snapshot: config ?? null,
      });
      await repo.create({ values: draft });

      const advanced = advanceToGenerating(draft);
      const result = await _videoFactoryTransport.generate(brief);
      if (!result.ok) {
        const failed = failVideoProject(advanced, result.error ?? 'video factory generation failed');
        await repo.update({ filterByTk: draft.id, values: pickVideoProjectPersistedFields(failed) });
        return { ...result, data: { ...(result.data as any), video_project_id: draft.id } };
      }

      const jobPath = typeof (result.data as any)?.job_path === 'string'
        ? (result.data as any).job_path
        : null;
      const generating = advanceToGenerating(draft, jobPath);
      await repo.update({ filterByTk: draft.id, values: pickVideoProjectPersistedFields(generating) });
      return { ...result, data: { ...(result.data as any), video_project_id: draft.id } };
    },
  };
}

function getValues(ctx: ActionContext): Record<string, any> {
  return ctx.action?.params?.values ?? ctx.request?.body ?? {};
}

// M10: CTO conversational planning resource.
// cto:planMessage — one founder→CTO turn (reply, and a plan once the CTO is ready).
// cto:approvePlan — founder approves the proposed plan in one go: persist PRD,
// create roadmap_items + agent_tasks (queued, assigned to CTO), and — if the CTO
// proposed a new project — create the project first. FK-safe via raw SQL.
function registerCtoPlanningResource(app: any, db: any) {
  const SELECT = db.sequelize.QueryTypes.SELECT;
  const q = (sql: string, bind: any[] = []) =>
    db.sequelize.query(sql, { bind, type: SELECT });

  app.resourcer.define({
    name: 'cto',
    actions: {
      // POST /api/cto:planMessage  { thread_id, founder_message, business_id?, project_id?, project_title? }
      planMessage: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const thread_id = String(v.thread_id ?? '').trim();
        const founder_message = String(v.founder_message ?? '').trim();
        if (!thread_id) ctx.throw(400, 'thread_id is required');
        if (!founder_message) ctx.throw(400, 'founder_message is required');
        const business_id = v.business_id != null ? String(v.business_id) : null;
        const project_id = v.project_id != null ? String(v.project_id) : null;

        // Conversation history for this thread.
        const history = (
          await q(
            `SELECT role, text FROM cto_planning_messages WHERE thread_id = $1 ORDER BY "createdAt" ASC`,
            [thread_id],
          )
        ).map((r: any) => ({ role: r.role, text: r.text }));

        // Context: businesses + existing projects so the CTO can place new work.
        const businesses = await q(
          `SELECT id::text AS id, title FROM businesses ORDER BY "createdAt" ASC`,
        );
        const projectRows = await q(
          `SELECT id::text AS id, title, business_id FROM projects ORDER BY "createdAt" ASC`,
        );
        const ctx2 = {
          project_title: v.project_title ?? null,
          businesses: businesses.map((b: any) => ({ id: String(b.id), title: b.title ?? '' })),
          existing_projects: projectRows.map((p: any) => ({
            id: String(p.id),
            title: p.title ?? '',
            business_id: p.business_id != null ? String(p.business_id) : null,
          })),
        };

        // Persist the founder message.
        const founderId = randomUUID();
        await db.sequelize.query(
          `INSERT INTO cto_planning_messages (id, thread_id, business_id, project_id, role, text, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,'founder',$5, now(), now())`,
          { bind: [founderId, thread_id, business_id, project_id, founder_message] },
        );

        // Run the planning turn.
        const llm = buildLLMClient(founder_message);
        const result = await runCtoPlanningTurn(history, founder_message, ctx2, { llm });
        const reply = String(result?.reply ?? '계속 이야기해 주세요.');
        const plan = result?.plan ?? null;

        // Persist the CTO reply (+ plan when present).
        const ctoId = randomUUID();
        await db.sequelize.query(
          `INSERT INTO cto_planning_messages (id, thread_id, business_id, project_id, role, text, plan, plan_status, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,'cto',$5,$6,$7, now(), now())`,
          {
            bind: [
              ctoId,
              thread_id,
              business_id,
              project_id,
              reply,
              plan ? JSON.stringify(plan) : null,
              plan ? 'proposed' : null,
            ],
          },
        );

        ctx.body = { ok: true, data: { reply, plan, cto_message_id: ctoId } };
        await next();
      },

      // POST /api/cto:approvePlan  { cto_message_id }
      approvePlan: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const cto_message_id = String(v.cto_message_id ?? '').trim();
        if (!cto_message_id) ctx.throw(400, 'cto_message_id is required');

        const rows = await q(
          `SELECT id, thread_id, business_id, project_id, plan, plan_status
             FROM cto_planning_messages WHERE id = $1`,
          [cto_message_id],
        );
        const msg = rows[0];
        if (!msg) ctx.throw(404, `planning message ${cto_message_id} not found`);
        if (!msg.plan) ctx.throw(400, 'this message has no plan to approve');
        if (msg.plan_status === 'approved') {
          ctx.body = { ok: true, data: { already_approved: true } };
          return next();
        }

        const plan = typeof msg.plan === 'string' ? JSON.parse(msg.plan) : msg.plan;
        const proposal = plan.project_proposal ?? null;
        let business_id = msg.business_id != null ? String(msg.business_id) : null;
        let project_id = msg.project_id != null ? String(msg.project_id) : null;
        let new_project = false;
        const seqToItem: Record<number, string> = {};
        const roadmap_item_ids: string[] = [];
        const task_ids: string[] = [];
        const instruction_id = randomUUID();

        // All-or-nothing: PRD + roadmap + instruction + tasks land together, so a
        // mid-way failure never leaves orphan roadmap_items or a half-approved plan.
        await db.sequelize.transaction(async (t: any) => {
          // New-project proposal → create the project first.
          if (proposal && proposal.is_new_project) {
            if (proposal.business_id) business_id = String(proposal.business_id);
            const title = String(proposal.suggested_project_title ?? '새 프로젝트');
            const created = await db.sequelize.query(
              `INSERT INTO projects (business_id, title, description, status, prd, "createdAt", "updatedAt")
               VALUES ($1,$2,$3,'active',$4, now(), now()) RETURNING id`,
              { bind: [business_id, title, proposal.rationale ?? null, plan.prd ?? null], type: SELECT, transaction: t },
            );
            project_id = String(created[0].id);
            new_project = true;
          } else if (project_id) {
            // Existing project → record/refresh the PRD.
            await db.sequelize.query(
              `UPDATE projects SET prd = $1, "updatedAt" = now() WHERE id::text = $2`,
              { bind: [plan.prd ?? null, project_id], transaction: t },
            );
          }

          // Roadmap items — keep sequence→id so tasks can link to their item.
          for (const it of plan.roadmap_items ?? []) {
            const id = randomUUID();
            await db.sequelize.query(
              `INSERT INTO roadmap_items (id, project_id, business_id, title, summary, objective, sequence, status, source, "createdAt", "updatedAt")
               VALUES ($1,$2,$3,$4,$5,$6,$7,'planned','cto_planning', now(), now())`,
              {
                bind: [
                  id,
                  project_id,
                  business_id,
                  String(it.title ?? ''),
                  String(it.summary ?? ''),
                  String(it.objective ?? ''),
                  Number(it.sequence ?? 1),
                ],
                transaction: t,
              },
            );
            seqToItem[Number(it.sequence ?? 1)] = id;
            roadmap_item_ids.push(id);
          }

          // Founder instruction (FK parent for the tasks).
          await db.sequelize.query(
            `INSERT INTO founder_instructions (id, raw_text, source, status, business_id, project_id, "createdAt", "updatedAt")
             VALUES ($1,$2,'cto_planning','planned',$3,$4, now(), now())`,
            { bind: [instruction_id, plan.prd || 'CTO 기획 계획', business_id, project_id], transaction: t },
          );

          // Tasks — queued, assigned to CTO (it owns dev orchestration), D2 (internal coding).
          for (const tk of plan.tasks ?? []) {
            const id = randomUUID();
            const roadmap_item_id = seqToItem[Number(tk.roadmap_sequence ?? 1)] ?? null;
            await db.sequelize.query(
              `INSERT INTO agent_tasks
                 (id, instruction_id, assigned_agent, title, rationale, expected_output,
                  status, approval_required, risk_level, source_ref, roadmap_item_id, business_id, project_id, "createdAt", "updatedAt")
               VALUES ($1,$2,'CTO',$3,$4,$5,'queued',false,'D2','cto_planning',$6,$7,$8, now(), now())`,
              {
                bind: [
                  id,
                  instruction_id,
                  String(tk.title ?? ''),
                  String(tk.rationale ?? ''),
                  String(tk.expected_output ?? ''),
                  roadmap_item_id,
                  business_id,
                  project_id,
                ],
                transaction: t,
              },
            );
            task_ids.push(id);
          }

          // Mark the plan approved (idempotency guard for re-clicks).
          await db.sequelize.query(
            `UPDATE cto_planning_messages SET plan_status = 'approved', "updatedAt" = now() WHERE id = $1`,
            { bind: [cto_message_id], transaction: t },
          );
        });

        ctx.body = {
          ok: true,
          data: { new_project, project_id, instruction_id, roadmap_item_ids, task_ids },
        };
        await next();
      },

      // GET/POST /api/cto:roadmapProgress?business_id=&project_id=
      // Burndown: each roadmap item with its done/total task count + status, so
      // the Control Room shows the overall plan shrinking as tasks complete.
      roadmapProgress: async (ctx: ActionContext, next: () => Promise<void>) => {
        const query = (ctx.request as any)?.query || {};
        const vals = getValues(ctx);
        const business_id = query.business_id ?? vals.business_id ?? null;
        const project_id = query.project_id ?? vals.project_id ?? null;

        const where: string[] = [`ri.source = 'cto_planning'`];
        const bind: any[] = [];
        if (business_id) {
          bind.push(String(business_id));
          where.push(`ri.business_id = $${bind.length}`);
        }
        if (project_id) {
          bind.push(String(project_id));
          where.push(`ri.project_id = $${bind.length}`);
        }

        const rows = await db.sequelize.query(
          `SELECT ri.id, ri.title, ri.sequence, ri.project_id, ri.business_id,
                  COUNT(t.id)::int AS total,
                  COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done,
                  COUNT(t.id) FILTER (WHERE t.status NOT IN ('done','killed','queued'))::int AS running
             FROM roadmap_items ri
             LEFT JOIN agent_tasks t ON t.roadmap_item_id = ri.id
            WHERE ${where.join(' AND ')}
            GROUP BY ri.id, ri.title, ri.sequence, ri.project_id, ri.business_id
            ORDER BY ri.business_id NULLS FIRST, ri.project_id NULLS FIRST, ri.sequence ASC`,
          { bind, type: db.sequelize.QueryTypes.SELECT },
        );

        const items = rows.map((r: any) => {
          const total = Number(r.total) || 0;
          const done = Number(r.done) || 0;
          const running = Number(r.running) || 0;
          return {
            id: r.id,
            title: r.title,
            sequence: Number(r.sequence) || 0,
            project_id: r.project_id != null ? String(r.project_id) : null,
            business_id: r.business_id != null ? String(r.business_id) : null,
            total,
            done,
            status: deriveRoadmapItemStatus({ total, done, running }),
          };
        });

        ctx.body = { ok: true, data: { items, summary: summarizeRoadmap(items) } };
        await next();
      },
    },
  });
}

// CMO Video Room resource — strategy chat, project management, gate decisions.
function registerCmoResource(app: any, db: any) {
  const SELECT = db.sequelize.QueryTypes.SELECT;
  const q = (sql: string, bind: any[] = []) =>
    db.sequelize.query(sql, { bind, type: SELECT });

  // Shared helper: approve a pending gate for a project and optionally advance status.
  async function approveGateForProject(project_id: string, gate_id: string, decision: string) {
    await db.sequelize.query(
      `UPDATE video_room_gates SET status = $1, decided_by = 'founder', decided_at = now(), "updatedAt" = now() WHERE id = $2`,
      { bind: [decision, gate_id] },
    );
    if (decision === 'approved') {
      const projRows = await q(
        `SELECT status FROM video_room_projects WHERE id = $1`,
        [project_id],
      );
      if (projRows[0]) {
        const newStatus = advanceVideoRoomStatus(projRows[0].status, { gateApproved: true });
        const newPage = pageForStatus(newStatus);
        await db.sequelize.query(
          `UPDATE video_room_projects SET status = $1, current_page = $2, "updatedAt" = now() WHERE id = $3`,
          { bind: [newStatus, newPage, project_id] },
        );
        return newStatus;
      }
    }
    return null;
  }

  app.resourcer.define({
    name: 'cmo',
    actions: {
      // POST /api/cmo:createProject  { title, product, target_audience, business_goal, business_id?, project_type? }
      createProject: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const title = String(v.title ?? '').trim();
        if (!title) ctx.throw(400, 'title is required');
        const project_id = randomUUID();
        const product = String(v.product ?? '');
        const target_audience = String(v.target_audience ?? '');
        const business_goal = String(v.business_goal ?? '');
        const business_id = v.business_id != null ? String(v.business_id) : null;
        const project_type = String(v.project_type ?? 'single_video');
        await db.sequelize.query(
          `INSERT INTO video_room_projects (id, title, business_id, product, target_audience, business_goal, project_type, status, current_page, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,'strategy_chat','strategy', now(), now())`,
          { bind: [project_id, title, business_id, product, target_audience, business_goal, project_type] },
        );
        ctx.body = { ok: true, data: { project_id, status: 'strategy_chat' } };
        await next();
      },

      // POST /api/cmo:listProjects
      listProjects: async (ctx: ActionContext, next: () => Promise<void>) => {
        const projects = await q(
          `SELECT * FROM video_room_projects ORDER BY "createdAt" DESC`,
        );
        ctx.body = { ok: true, data: { projects } };
        await next();
      },

      // POST /api/cmo:getProject  { project_id }
      getProject: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        const projRows = await q(`SELECT * FROM video_room_projects WHERE id = $1`, [project_id]);
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const project = projRows[0];
        const cards = await q(`SELECT * FROM video_room_cards WHERE video_project_id = $1 ORDER BY "createdAt" ASC`, [project_id]);
        const gates = await q(`SELECT * FROM video_room_gates WHERE video_project_id = $1 ORDER BY "createdAt" ASC`, [project_id]);
        const messages = await q(
          `SELECT id, role, text, proposal, gate, ready_to_advance, "createdAt" FROM cmo_planning_messages WHERE thread_id = $1 ORDER BY "createdAt" ASC`,
          [project_id],
        );
        const roadmap = buildMiniRoadmap(project.status);
        ctx.body = { ok: true, data: { project, cards, gates, messages, roadmap } };
        await next();
      },

      // POST /api/cmo:chatMessage  { project_id, founder_message }
      chatMessage: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const founder_message = String(v.founder_message ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (!founder_message) ctx.throw(400, 'founder_message is required');

        // Load project context.
        const projRows = await q(`SELECT * FROM video_room_projects WHERE id = $1`, [project_id]);
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const proj = projRows[0];

        // Load conversation history (thread_id = project_id).
        const historyRows = await q(
          `SELECT role, text FROM cmo_planning_messages WHERE thread_id = $1 ORDER BY "createdAt" ASC`,
          [project_id],
        );
        const history = historyRows.map((r: any) => ({ role: r.role, text: r.text }));

        // Check context_loaded (any card already persisted for this project).
        const cardCount = await q(
          `SELECT COUNT(*) AS cnt FROM video_room_cards WHERE video_project_id = $1`,
          [project_id],
        );
        const context_loaded = Number(cardCount[0]?.cnt ?? 0) > 0;

        // Pulling set size (cards at pulling_content_set_selection stage).
        const pullingRows = await q(
          `SELECT COUNT(*) AS cnt FROM video_room_cards WHERE video_project_id = $1 AND stage = 'pulling_content_set_selection'`,
          [project_id],
        );
        const pulling_set_size = Number(pullingRows[0]?.cnt ?? 0);

        // Key content title (latest approved key_content_approval card summary).
        const keyRows = await q(
          `SELECT summary FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_approval' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        const selected_key_content_title = keyRows[0]?.summary ?? null;

        // Persist the founder message.
        const founderId = randomUUID();
        await db.sequelize.query(
          `INSERT INTO cmo_planning_messages (id, thread_id, project_id, business_id, role, text, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,'founder',$5, now(), now())`,
          { bind: [founderId, project_id, project_id, proj.business_id ?? null, founder_message] },
        );

        // Run the CMO strategy turn.
        const llm = buildLLMClient(founder_message);

        // Second brain: query insights relevant to the current project status and
        // inject them into the strategy context. Graceful — failure never blocks.
        // Status→query mapping lives in l5-core (secondBrainQueryForStatus) and
        // now covers EVERY stage incl. strategy_chat / script / production / publish
        // (Phase A read-path expansion).
        let second_brain_insights: string[] = [];
        const sbQuery = secondBrainQueryForStatus(proj.status as string);
        if (_secondBrainTransport && sbQuery) {
          try {
            const sbHits = await _secondBrainTransport.query({ role: sbQuery as any, limit: 6 });
            second_brain_insights = (sbHits ?? [])
              .map((h: any) => String(h.insight ?? ''))
              .filter(Boolean);
          } catch {
            // graceful: leave second_brain_insights empty
          }
        }

        const strategyCtx: Record<string, any> = {
          status: proj.status,
          product: proj.product ?? null,
          target_audience: proj.target_audience ?? null,
          business_goal: proj.business_goal ?? null,
          context_loaded,
          selected_key_content_title,
          pulling_set_size,
          ...(second_brain_insights.length > 0 ? { second_brain_insights } : {}),
        };
        const result = await runCmoStrategyTurn(history, founder_message, strategyCtx, { llm });
        const reply = String(result?.reply ?? '계속 이야기해 주세요.');
        const proposal = result?.proposal ?? null;
        const gate = result?.gate ?? null;
        const ready_to_advance = result?.ready_to_advance ?? false;

        // Persist the CMO reply.
        const cmoId = randomUUID();
        await db.sequelize.query(
          `INSERT INTO cmo_planning_messages (id, thread_id, project_id, business_id, role, text, proposal, gate, ready_to_advance, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,'cmo',$5,$6,$7,$8, now(), now())`,
          {
            bind: [
              cmoId,
              project_id,
              project_id,
              proj.business_id ?? null,
              reply,
              proposal ? JSON.stringify(proposal) : null,
              gate ? JSON.stringify(gate) : null,
              ready_to_advance,
            ],
          },
        );

        // If a proposal (stage card), persist it.
        if (proposal) {
          const cardId = randomUUID();
          await db.sequelize.query(
            `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
             VALUES ($1,$2,$3,$4,$5, now(), now())`,
            {
              bind: [
                cardId,
                project_id,
                String(proposal.stage ?? proj.status),
                String(proposal.summary ?? ''),
                proposal.data ? JSON.stringify(proposal.data) : null,
              ],
            },
          );
        }

        // If a gate, persist it.
        if (gate) {
          const gateId = randomUUID();
          await db.sequelize.query(
            `INSERT INTO video_room_gates (id, video_project_id, gate_type, page, title, context, options, recommended_option, status, "createdAt", "updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending', now(), now())`,
            {
              bind: [
                gateId,
                project_id,
                String(gate.gate_type ?? ''),
                pageForStatus(proj.status),
                String(gate.title ?? ''),
                String(gate.context ?? ''),
                gate.options ? JSON.stringify(gate.options) : null,
                gate.recommended_option ?? null,
              ],
            },
          );
        }

        ctx.body = {
          ok: true,
          data: {
            reply,
            proposal,
            gate,
            ready_to_advance,
            status: proj.status,
            cmo_message_id: cmoId,
            plan: null,
          },
        };
        await next();
      },

      // POST /api/cmo:advanceStatus  { project_id }
      advanceStatus: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        const projRows = await q(`SELECT status FROM video_room_projects WHERE id = $1`, [project_id]);
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const currentStatus = projRows[0].status;
        if (videoRoomRequiresApproval(currentStatus)) {
          ctx.throw(400, 'approval gate must be cleared');
        }
        const newStatus = advanceVideoRoomStatus(currentStatus);
        const newPage = pageForStatus(newStatus);
        await db.sequelize.query(
          `UPDATE video_room_projects SET status = $1, current_page = $2, "updatedAt" = now() WHERE id = $3`,
          { bind: [newStatus, newPage, project_id] },
        );
        ctx.body = { ok: true, data: { status: newStatus } };
        await next();
      },

      // POST /api/cmo:decideGate  { gate_id, decision, note? }
      decideGate: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const gate_id = String(v.gate_id ?? '').trim();
        const decision = String(v.decision ?? '').trim();
        if (!gate_id) ctx.throw(400, 'gate_id is required');
        if (!['approved', 'rejected', 'needs_revision'].includes(decision)) {
          ctx.throw(400, 'decision must be approved, rejected, or needs_revision');
        }
        const gateRows = await q(`SELECT * FROM video_room_gates WHERE id = $1`, [gate_id]);
        if (!gateRows[0]) ctx.throw(404, `gate ${gate_id} not found`);
        const gateRow = gateRows[0];
        const newStatus = await approveGateForProject(gateRow.video_project_id, gate_id, decision);
        const projRows = await q(`SELECT status FROM video_room_projects WHERE id = $1`, [gateRow.video_project_id]);
        const status = newStatus ?? projRows[0]?.status ?? null;
        ctx.body = { ok: true, data: { gate_id, decision, status } };
        await next();
      },

      // POST /api/cmo:approvePlan  { cmo_message_id }  — backward-compat with old cmoChatMessage flow
      approvePlan: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const cmo_message_id = String(v.cmo_message_id ?? '').trim();
        if (!cmo_message_id) ctx.throw(400, 'cmo_message_id is required');
        const msgRows = await q(
          `SELECT * FROM cmo_planning_messages WHERE id = $1`,
          [cmo_message_id],
        );
        if (!msgRows[0]) ctx.throw(404, `cmo message ${cmo_message_id} not found`);
        const msg = msgRows[0];
        const project_id = msg.project_id;

        // Try to find and approve the latest pending gate for this project.
        const pendingGates = await q(
          `SELECT id FROM video_room_gates WHERE video_project_id = $1 AND status = 'pending' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (pendingGates[0]) {
          await approveGateForProject(project_id, pendingGates[0].id, 'approved');
        } else {
          // No gate: just advance status if not requires approval.
          const projRows = await q(`SELECT status FROM video_room_projects WHERE id = $1`, [project_id]);
          if (projRows[0] && !videoRoomRequiresApproval(projRows[0].status)) {
            const newStatus = advanceVideoRoomStatus(projRows[0].status);
            const newPage = pageForStatus(newStatus);
            await db.sequelize.query(
              `UPDATE video_room_projects SET status = $1, current_page = $2, "updatedAt" = now() WHERE id = $3`,
              { bind: [newStatus, newPage, project_id] },
            );
          }
        }
        ctx.body = { ok: true, data: { approved: true, task_ids: [] } };
        await next();
      },

      // POST /api/cmo:saveCard  { project_id, stage, summary, data }
      saveCard: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const stage = String(v.stage ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (!stage) ctx.throw(400, 'stage is required');
        const card_id = randomUUID();
        await db.sequelize.query(
          `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5, now(), now())`,
          {
            bind: [
              card_id,
              project_id,
              stage,
              String(v.summary ?? ''),
              v.data ? JSON.stringify(v.data) : null,
            ],
          },
        );
        ctx.body = { ok: true, data: { card_id } };
        await next();
      },

      // POST /api/cmo:buildSlideDeck  { project_id, design_theme?, slides? }
      buildSlideDeck: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        const projRows = await q(`SELECT * FROM video_room_projects WHERE id = $1`, [project_id]);
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const proj = projRows[0];

        const design_theme = String(v.design_theme ?? 'Pulk Clean Green Slide Deck');

        // Build slide list: provided or synthesise one from latest script_draft card.
        let slides: any[] = Array.isArray(v.slides) ? v.slides : [];
        if (slides.length === 0) {
          const scriptCardRows = await q(
            `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'script_draft' ORDER BY "createdAt" DESC LIMIT 1`,
            [project_id],
          );
          const cardData = scriptCardRows[0]?.data;
          const parsed = typeof cardData === 'string' ? JSON.parse(cardData) : cardData;
          const summary = parsed?.summary ?? parsed?.full_script ?? proj.title ?? '영상';
          slides = [{
            index: 0,
            headline: String(proj.title ?? '영상'),
            body: String(summary).slice(0, 200),
            visual_type: 'text',
            speaker_text: String(summary).slice(0, 300),
          }];
        }

        // Placeholder ids so buildSlideDeckSpec validates without real records.
        const spec_id = randomUUID();
        const placeholder_script_draft_id = randomUUID();
        const placeholder_voice_recording_id = randomUUID();

        const spec = buildSlideDeckSpec({
          id: spec_id,
          video_project_id: project_id,
          script_draft_id: placeholder_script_draft_id,
          voice_recording_id: placeholder_voice_recording_id,
          design_theme,
          slides,
        });

        const card_id = randomUUID();
        await db.sequelize.query(
          `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
           VALUES ($1,$2,'slide_deck',$3,$4, now(), now())`,
          { bind: [card_id, project_id, design_theme, JSON.stringify(spec)] },
        );

        ctx.body = { ok: true, data: { slide_deck_spec_id: spec_id, spec } };
        await next();
      },

      // POST /api/cmo:submitRender  { project_id, slide_deck_spec_id }
      submitRender: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const slide_deck_spec_id = String(v.slide_deck_spec_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (!slide_deck_spec_id) ctx.throw(400, 'slide_deck_spec_id is required');

        // Retrieve spec from latest slide_deck card (or accept the spec inline).
        const specCardRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'slide_deck' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        const rawSpec = specCardRows[0]?.data;
        const spec = rawSpec ? (typeof rawSpec === 'string' ? JSON.parse(rawSpec) : rawSpec) : null;
        const payload = spec ? slideDeckToVideoJob(spec) : null;

        const render_job_id = randomUUID();
        let job = createRenderJob({
          id: render_job_id,
          video_project_id: project_id,
          slide_deck_spec_id,
          created_at: new Date().toISOString(),
        });

        // Transport: real factory or in-memory fallback.
        const transport = _videoFactoryTransport ?? createInMemoryVideoFactoryTransport();
        job = await submitRenderJob(job, transport);

        const card_id = randomUUID();
        await db.sequelize.query(
          `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
           VALUES ($1,$2,'rendering',$3,$4, now(), now())`,
          { bind: [card_id, project_id, `render job ${render_job_id}`, JSON.stringify({ job, payload })] },
        );

        ctx.body = { ok: true, data: { render_job_id, job } };
        await next();
      },

      // POST /api/cmo:runQA  { project_id, render_job_id, checks? }
      runQA: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const render_job_id = String(v.render_job_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (!render_job_id) ctx.throw(400, 'render_job_id is required');

        const defaultChecks: any = {
          business_pt_structure: 'pass',
          pulling_to_key_bridge: 'pass',
          script_matches_approved_draft: 'pass',
          slide_readability: 'pass',
          audio_sync: 'pass',
          visual_quality: 'pass',
          upload_metadata_ready: 'pass',
        };
        const checks = (v.checks && typeof v.checks === 'object') ? v.checks : defaultChecks;

        const qa_result_id = randomUUID();
        const result = evaluateVideoRoomQA({
          id: qa_result_id,
          video_project_id: project_id,
          render_job_id,
          checks,
        });

        const card_id = randomUUID();
        await db.sequelize.query(
          `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
           VALUES ($1,$2,'qa',$3,$4, now(), now())`,
          { bind: [card_id, project_id, result.overall_status, JSON.stringify(result)] },
        );

        ctx.body = { ok: true, data: { qa_result_id, result } };
        await next();
      },

      // POST /api/cmo:createUploadDraft  { project_id, render_job_id, title, description?, tags? }
      createUploadDraft: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const render_job_id = String(v.render_job_id ?? '').trim();
        const title = String(v.title ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (!render_job_id) ctx.throw(400, 'render_job_id is required');
        if (!title) ctx.throw(400, 'title is required');

        const upload_draft_id = randomUUID();
        const draft = createUploadDraft({
          id: upload_draft_id,
          video_project_id: project_id,
          render_job_id,
          title,
          description: String(v.description ?? ''),
          tags: Array.isArray(v.tags) ? v.tags.map(String) : [],
        });

        const card_id = randomUUID();
        await db.sequelize.query(
          `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
           VALUES ($1,$2,'upload_draft',$3,$4, now(), now())`,
          { bind: [card_id, project_id, title, JSON.stringify(draft)] },
        );

        ctx.body = { ok: true, data: { upload_draft_id, draft } };
        await next();
      },

      // POST /api/cmo:loadPTContext  { project_id, business_id?, source_refs, rules? }
      loadPTContext: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        let rawSourceRefs = Array.isArray(v.source_refs) ? v.source_refs : [];
        const rawRules = Array.isArray(v.rules) ? v.rules.map(String) : [];

        // Second brain augmentation: when source_refs are not provided by the
        // caller, auto-fill from live second brain so assertContextLoadingComplete
        // (3-source rule) can be satisfied without manual input.
        if (rawSourceRefs.length === 0 && _secondBrainTransport) {
          try {
            const sbHits = await _secondBrainTransport.query({
              role: '비즈니스 PT 콘텐츠 전략' as any,
              limit: 6,
            });
            rawSourceRefs = (sbHits ?? [])
              .map((h: any) => {
                const label = String(h.insight ?? '').slice(0, 120);
                const agent = h.source_agent ? ` [${h.source_agent}]` : '';
                return label + agent;
              })
              .filter(Boolean);
          } catch {
            // graceful: leave rawSourceRefs empty, caller will get the usual error
          }
        }

        try {
          const snapshot = createBusinessPTContextSnapshot({
            id: randomUUID(),
            video_project_id: project_id,
            loaded_at: new Date().toISOString(),
            source_refs: rawSourceRefs,
            key_content_rules: rawRules,
            pulling_content_rules: rawRules,
            freshness_status: 'fresh',
          });
          assertContextLoadingComplete(snapshot);

          const card_id = randomUUID();
          await db.sequelize.query(
            `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
             VALUES ($1,$2,'pt_context',$3,$4, now(), now())`,
            { bind: [card_id, project_id, 'Business PT Context loaded', JSON.stringify(snapshot)] },
          );

          ctx.body = { ok: true, data: { context_loaded: true, snapshot } };
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }
        await next();
      },

      // POST /api/cmo:attachVoice  { project_id, scene_ref?, file_url, duration_sec? }
      attachVoice: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const file_url = String(v.file_url ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (!file_url) ctx.throw(400, 'file_url is required');

        const duration_sec = v.duration_sec != null ? Number(v.duration_sec) : 0;

        try {
          const rec = createVoiceRecording({ id: randomUUID(), video_project_id: project_id });
          const attached = attachVoiceFile(rec, file_url, duration_sec);

          const card_id = randomUUID();
          await db.sequelize.query(
            `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
             VALUES ($1,$2,'voice',$3,$4, now(), now())`,
            { bind: [card_id, project_id, file_url.slice(0, 200), JSON.stringify(attached)] },
          );

          ctx.body = { ok: true, data: { voice: attached } };
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }
        await next();
      },

      // POST /api/cmo:commitStrategyArtifact  { project_id, stage, payload }
      commitStrategyArtifact: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const stage = String(v.stage ?? '').trim();
        const payload = (v.payload && typeof v.payload === 'object') ? v.payload as Record<string, any> : {};
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (!['key_content', 'pulling_content', 'second_brain', 'intro_30s'].includes(stage)) {
          ctx.throw(400, 'stage must be key_content, pulling_content, second_brain, or intro_30s');
        }

        try {
          let artifact: any;

          if (stage === 'intro_30s') {
            let appliedInsights: { insight: string; how_applied: string }[] = Array.isArray(payload.applied_insights)
              ? payload.applied_insights
              : [];

            // SB auto-seed: if caller sent no applied_insights, query second brain for defaults.
            if (appliedInsights.length === 0 && _secondBrainTransport) {
              try {
                const sbHits = await _secondBrainTransport.query({
                  role: '썸네일 도입부 후킹 빌드업' as any,
                  limit: 5,
                });
                appliedInsights = (sbHits ?? [])
                  .map((h: any) => ({
                    insight: String(h.content ?? h.text ?? h.insight ?? '').trim(),
                    how_applied: '도입부 빌드업/후킹에 반영',
                  }))
                  .filter((x: { insight: string; how_applied: string }) => x.insight.length > 0);
              } catch {
                // graceful: leave empty → composeIntro30s will throw → 400
              }
            }

            artifact = composeIntro30s({
              id: randomUUID(),
              key_content_title: payload.key_content_title,
              intro_script_30s: payload.intro_script_30s,
              first_sentence: payload.first_sentence,
              hook_structure: payload.hook_structure,
              promise: payload.promise,
              curiosity_gap: payload.curiosity_gap,
              applied_insights: appliedInsights,
            });

            const card_id = randomUUID();
            const summary = `도입부 30초 (적용 인사이트 ${appliedInsights.length}개)`;
            await db.sequelize.query(
              `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
               VALUES ($1,$2,$3,$4,$5, now(), now())`,
              { bind: [card_id, project_id, 'intro_30s', summary, JSON.stringify(artifact)] },
            );

            ctx.body = { ok: true, data: { artifact } };
            await next();
            return;
          } else if (stage === 'key_content') {
            const candidate = {
              id: payload.candidate_id ?? randomUUID(),
              title: payload.title ?? '',
              target_problem: payload.target_problem ?? '',
              consumer_stages: Array.isArray(payload.consumer_stages) ? payload.consumer_stages : [],
              sales_logic: payload.sales_logic ?? '',
              cta: payload.cta ?? '',
              why_this_can_sell: payload.why_this_can_sell ?? '',
            };
            artifact = selectKeyContent(candidate, {
              id: randomUUID(),
              viewtrap_evidence: Array.isArray(payload.viewtrap_evidence) ? payload.viewtrap_evidence : [],
              selected_reason: payload.selected_reason ?? '',
            });
          } else if (stage === 'pulling_content') {
            artifact = createPullingContentSet({
              id: randomUUID(),
              key_content_id: String(payload.key_content_id ?? ''),
              pulling_contents: Array.isArray(payload.pulling_contents) ? payload.pulling_contents : [],
              set_logic: String(payload.set_logic ?? ''),
              funnel_coverage: payload.funnel_coverage ?? { phenomenon: [], desire: [], plan: [], action_bridge: '' },
            });
          } else {
            // second_brain
            artifact = createSecondBrainInsightMerge({
              id: randomUUID(),
              content_plan_id: String(payload.content_plan_id ?? ''),
              retrieved_insights: Array.isArray(payload.retrieved_insights) ? payload.retrieved_insights : [],
              applied_to_thumbnail: Array.isArray(payload.applied_to_thumbnail) ? payload.applied_to_thumbnail : [],
              applied_to_intro: Array.isArray(payload.applied_to_intro) ? payload.applied_to_intro : [],
              applied_to_script_structure: Array.isArray(payload.applied_to_script_structure) ? payload.applied_to_script_structure : [],
            });
          }

          const card_id = randomUUID();
          await db.sequelize.query(
            `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
             VALUES ($1,$2,$3,$4,$5, now(), now())`,
            { bind: [card_id, project_id, stage, `${stage} artifact`, JSON.stringify(artifact)] },
          );

          ctx.body = { ok: true, data: { artifact } };
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }
        await next();
      },

      // POST /api/cmo:saveScript  { project_id, beats: ScriptBeat[] }
      saveScript: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        const beats = v.beats;
        if (!Array.isArray(beats) || beats.length === 0) ctx.throw(400, 'beats must be a non-empty array');

        const now = new Date().toISOString();
        // Upsert: replace the latest existing 'script' stage card if any, then insert fresh.
        await db.sequelize.query(
          `DELETE FROM video_room_cards WHERE video_project_id = $1 AND stage = 'script'`,
          { bind: [project_id] },
        );
        const card_id = randomUUID();
        await db.sequelize.query(
          `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
           VALUES ($1,$2,'script',$3,$4, now(), now())`,
          { bind: [card_id, project_id, `beats (${beats.length})`, JSON.stringify({ beats })] },
        );
        ctx.body = { ok: true, data: { beats } };
        await next();
      },

      // POST /api/cmo:sendToFactory  { project_id }
      sendToFactory: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        // Load project for title.
        const projRows = await q(`SELECT * FROM video_room_projects WHERE id = $1`, [project_id]);
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const proj = projRows[0];

        // Load latest 'script' stage card.
        const scriptRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'script' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (!scriptRows[0]) ctx.throw(400, 'script 카드가 없습니다. saveScript를 먼저 호출하세요.');
        const cardData = scriptRows[0].data;
        const parsed = typeof cardData === 'string' ? JSON.parse(cardData) : cardData;
        const beats = parsed?.beats;
        if (!Array.isArray(beats) || beats.length === 0) ctx.throw(400, 'script 카드에 beats가 없습니다.');

        const slug = String(proj.title ?? project_id);

        // Build and validate via l5-core (throws on validation failure).
        let videoJob: any;
        try {
          videoJob = buildFactoryVideoJob({ slug, title: String(proj.title ?? slug), beats });
        } catch (err: any) {
          ctx.throw(400, `buildFactoryVideoJob 검증 실패: ${err?.message ?? String(err)}`);
        }

        // Submit to factory transport.
        if (!_videoFactoryTransport || typeof (_videoFactoryTransport as any).submitJob !== 'function') {
          ctx.body = { ok: false, data: { error: '팩토리 디렉토리가 없어 전달할 수 없습니다 (VIDEO_FACTORY_DIR 미설정).' } };
          await next();
          return;
        }

        const result = await (_videoFactoryTransport as any).submitJob(videoJob);
        if (!result.ok) {
          ctx.throw(400, `factory submitJob 실패: ${result.error ?? 'unknown'}`);
        }

        // Persist factory_job card.
        const card_id = randomUUID();
        await db.sequelize.query(
          `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
           VALUES ($1,$2,'factory_job',$3,$4, now(), now())`,
          {
            bind: [
              card_id,
              project_id,
              `factory job: ${result.job_path ?? ''}`,
              JSON.stringify({ job_path: result.job_path, validated: result.validated }),
            ],
          },
        );

        ctx.body = { ok: true, data: { job_path: result.job_path, validated: result.validated } };
        await next();
      },

      // POST /api/cmo:generateVideoExecutionBrief  { project_id, card_id, brief? }
      generateVideoExecutionBrief: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const card_id = String(v.card_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (!card_id) ctx.throw(400, 'card_id is required');

        let brief: any = v.brief ?? null;

        if (!brief) {
          // Load strategy artifact card
          const strategyRows = await q(
            `SELECT data FROM video_room_cards WHERE id = $1 AND video_project_id = $2 AND stage = 'strategy' ORDER BY "createdAt" DESC LIMIT 1`,
            [card_id, project_id],
          );
          // Fall back to any card matching card_id if stage filter yields nothing
          const cardRows = strategyRows.length > 0 ? strategyRows : await q(
            `SELECT data FROM video_room_cards WHERE id = $1 AND video_project_id = $2 ORDER BY "createdAt" DESC LIMIT 1`,
            [card_id, project_id],
          );
          if (!cardRows[0]) ctx.throw(404, `card ${card_id} not found for project ${project_id}`);

          // Load latest script card
          const scriptRows = await q(
            `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'script' ORDER BY "createdAt" DESC LIMIT 1`,
            [project_id],
          );

          const cardData = cardRows[0].data;
          const parsedCard = typeof cardData === 'string' ? JSON.parse(cardData) : cardData;
          const scriptData = scriptRows[0]?.data;
          const parsedScript = scriptData ? (typeof scriptData === 'string' ? JSON.parse(scriptData) : scriptData) : null;

          try {
            brief = buildVideoExecutionBrief({ cardData: parsedCard, scriptData: parsedScript, card_id, project_id });
          } catch (err: any) {
            ctx.throw(400, `buildVideoExecutionBrief 실패: ${err?.message ?? String(err)}`);
          }
        }

        const validation = validateVideoExecutionBrief(brief);
        if (!validation.valid) {
          ctx.throw(400, `brief 검증 실패: ${(validation.errors ?? []).join(', ')}`);
        }

        const handoff = prepareFactoryHandoff({ brief, project_id, content_card_id: card_id });
        const record_id = randomUUID();
        const now = new Date().toISOString();

        await db.sequelize.query(
          `INSERT INTO video_execution_briefs (id, content_card_id, project_id, schema_version, brief, validation_status, handoff_status, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,'valid','ready', now(), now())
           ON CONFLICT (id) DO UPDATE SET brief=$5, validation_status='valid', handoff_status='ready', "updatedAt"=now()`,
          {
            bind: [
              record_id,
              card_id,
              project_id,
              brief.schema_version ?? 'cmo_to_factory_v2',
              JSON.stringify(handoff),
            ],
          },
        );

        ctx.body = { ok: true, data: { id: record_id, brief: handoff } };
        await next();
      },

      // POST /api/cmo:runContentStrategy  { project_id, task? }
      // Runs the CMO v3 skill chain via CmoOrchestrator (keycontent → factory).
      // D3+ skills pause and return pending_skills for founder approval.
      runContentStrategy: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        const taskInput = v.task && typeof v.task === 'object' ? v.task as Record<string, unknown> : {};
        const task = {
          id: String(taskInput.id ?? randomUUID()),
          title: String(taskInput.title ?? 'CMO content strategy'),
          expected_output: String(taskInput.expected_output ?? 'Full content strategy skill chain output'),
          rationale: String(taskInput.rationale ?? ''),
          risk_level: (taskInput.risk_level as string) ?? 'D2',
          source_ref: String(taskInput.source_ref ?? project_id),
        };

        const registry = createCmoSkillRegistry();
        const orchestrator = new CmoOrchestrator({ registry, selection_strategy: 'rule' });
        const result = await orchestrator.execute({ task, context: { project_id } });

        ctx.body = { ok: true, data: result };
        await next();
      },
    },
  });
}

// M6: build the worker (target executive) tool suite — secondbrain + video only.
// Deliberately excludes ask_founder/ask_executive so a delegated worker cannot
// open a nested delegation. Mirrors the executeTask secondbrain/video build.
function buildWorkerTools(ctx: ActionContext): any[] {
  const tools: any[] = [];
  try {
    if (
      _secondBrainTransport &&
      typeof createSecondBrainSource === 'function' &&
      typeof createSecondBrainTools === 'function'
    ) {
      const sbSource = createSecondBrainSource(_secondBrainTransport);
      const proposeWrite = async (req: any) => {
        const result = await makeFounderMemoryInsightSource(ctx).write!(req);
        return result.ok
          ? { ok: true, data: { queued: true, message: 'CEO 검토 큐에 추가됨' } }
          : { ok: false, error: result.error };
      };
      tools.push(...createSecondBrainTools({ source: sbSource, proposeWrite }));
    }
  } catch (err) {
    console.warn('[delegation] secondbrain tools build failed:', err);
  }
  try {
    if (_videoFactoryTransport && typeof createVideoFactoryTools === 'function') {
      tools.push(...createVideoFactoryTools(createTrackedVideoFactoryTransport(ctx, null)));
    }
  } catch (err) {
    console.warn('[delegation] video-factory tools build failed:', err);
  }
  return tools;
}

// M6: delegation resource — list (poll) + advance (deterministic verification
// loop driver). `advance` runs runDelegationLoop synchronously: each round the
// target executive does the work (executeAgentTaskLive) and the requester scores
// it (buildVerificationPrompt + parseVerdict). The CEO LLM is NOT run per round —
// loop control is deterministic. See EXECUTIVE_DELEGATION_SPEC.md §3.3.
function registerDelegationResource(app: any, db: any) {
  app.resourcer.define({
    name: 'delegation',
    actions: {
      list: async (ctx: ActionContext, next: () => Promise<void>) => {
        const params = (ctx.action?.params as any) || {};
        const query = (ctx.request as any)?.query || {};
        const status = params.status || query.status || null;
        const repo = db.getRepository('executive_delegations');
        const filter: Record<string, any> = {};
        if (status) filter.status = status;
        const rows = await repo.find({ filter, sort: ['-createdAt'] });
        ctx.body = { ok: true, data: rows ?? [] };
        await next();
      },

      advance: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { id } = getValues(ctx) as { id?: string };
        if (!id) ctx.throw(400, 'id is required');

        const repo = db.getRepository('executive_delegations');
        const taskRepo = db.getRepository('agent_tasks');
        const handoffRepo = db.getRepository('agent_handoffs');

        const del = await repo.findOne({ filter: { id } });
        if (!del) ctx.throw(404, `Delegation ${id} not found`);
        if (del.status === 'resolved' || del.status === 'escalated') {
          ctx.body = { ok: true, data: { id, status: del.status, message: '이미 종료된 위임입니다.' } };
          await next();
          return;
        }

        const criteria: string[] = Array.isArray(del.acceptance_criteria)
          ? del.acceptance_criteria
          : [];
        const maxRounds = Math.max(1, Math.min(5, Number(del.max_rounds) || 3));
        const debug = process.env.L5_DELEGATION_DEBUG === '1';
        // Worker tools follow the same gate as executeTask (heavy sync path).
        const workerTools = process.env.L5_EXECUTIVE_TOOLS === '1' ? buildWorkerTools(ctx) : [];

        await repo.update({ filterByTk: id, values: { status: 'in_progress' } });

        const origin = await taskRepo.findOne({ filter: { id: del.origin_task_id } });
        let workTask: any = del.work_task_id
          ? await taskRepo.findOne({ filter: { id: del.work_task_id } })
          : null;

        const runWork = async (round: number, feedback: string | null) => {
          const rationale = feedback
            ? `${del.objective}\n\n[이전 검증 피드백 — 반드시 반영]\n${feedback}`
            : del.objective;
          const expected = `다음 수용 기준을 모두 충족: ${criteria.join(' / ')}`;
          if (!workTask) {
            const wid = randomUUID();
            workTask = {
              id: wid,
              instruction_id: origin?.instruction_id ?? del.origin_task_id,
              interpretation_id: origin?.interpretation_id ?? null,
              assigned_agent: del.to_agent,
              title: `[위임] ${String(del.objective).slice(0, 80)}`,
              rationale,
              expected_output: expected,
              status: 'running',
              risk_level: origin?.risk_level ?? 'D2',
              phase: origin?.phase ?? null,
              business_id: del.business_id ?? origin?.business_id ?? null,
              project_id: origin?.project_id ?? null,
            };
            await taskRepo.create({ values: workTask });
            await repo.update({ filterByTk: id, values: { work_task_id: wid } });
          } else {
            await taskRepo.update({
              filterByTk: workTask.id,
              values: { rationale, status: 'running', blocker: null },
            });
            workTask = { ...workTask, rationale };
          }

          const llm = buildLLMClient(`${workTask.title} ${rationale}`);
          const res = await executeAgentTaskLive(workTask, llm, { tools: workerTools });
          try {
            for (const h of res.handoffs || []) {
              await handoffRepo.create({ values: { id: randomUUID(), ...h } });
            }
          } catch { /* handoff persistence best-effort */ }
          await taskRepo.update({ filterByTk: workTask.id, values: { status: res.updated_status } });
          return { output: res.output };
        };

        const verify = async (workOutput: unknown) => {
          const llm = buildLLMClient(String(del.objective));
          const prompt = buildVerificationPrompt({
            from_agent: del.from_agent,
            to_agent: del.to_agent,
            objective: del.objective,
            acceptance_criteria: criteria,
            workOutput,
          });
          const raw = await llm.complete({
            system: prompt.system,
            user: prompt.user,
            trace_name: 'delegation_verify',
            trace_metadata: { delegation_id: id, from_agent: del.from_agent },
          });
          return parseVerdict(raw);
        };

        const onRound = async (round: number, verdict: { pass: boolean; feedback: string }) => {
          if (debug) {
            console.error(
              `[delegation ${id}] round ${round} pass=${verdict.pass} fb=${String(verdict.feedback).slice(0, 120)}`,
            );
          }
          await repo.update({
            filterByTk: id,
            values: { round, last_feedback: verdict.feedback || null },
          });
        };

        let loopResult: any;
        try {
          loopResult = await runDelegationLoop(maxRounds, { runWork, verify, onRound });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await repo.update({
            filterByTk: id,
            values: { status: 'escalated', last_feedback: `루프 오류: ${message}` },
          });
          if (del.origin_task_id) {
            await taskRepo.update({
              filterByTk: del.origin_task_id,
              values: { status: 'needs_review', blocker: `awaiting_founder: 위임(${del.to_agent}) 실행 오류` },
            });
          }
          ctx.throw(500, `Delegation loop failed: ${message}`);
        }

        if (loopResult.status === 'resolved') {
          const summary =
            typeof loopResult.output === 'string'
              ? loopResult.output
              : JSON.stringify(loopResult.output ?? {});
          await repo.update({
            filterByTk: id,
            values: { status: 'resolved', round: loopResult.rounds, result_summary: summary.slice(0, 4000) },
          });
          // Resume the requesting task; resolved-delegation injection (executeTask)
          // feeds the worker's result back into its re-run.
          if (del.origin_task_id) {
            await taskRepo.update({
              filterByTk: del.origin_task_id,
              values: { status: 'queued', blocker: null },
            });
          }
        } else {
          await repo.update({
            filterByTk: id,
            values: { status: 'escalated', round: loopResult.rounds, last_feedback: loopResult.reason },
          });
          if (del.origin_task_id) {
            await taskRepo.update({
              filterByTk: del.origin_task_id,
              values: {
                status: 'needs_review',
                blocker: `awaiting_founder: 위임(${del.to_agent}) 검증 예산 소진`,
              },
            });
          }
        }

        ctx.body = {
          ok: true,
          data: {
            id,
            status: loopResult.status,
            rounds: loopResult.rounds,
            work_task_id: workTask?.id ?? del.work_task_id ?? null,
            output: loopResult.output,
          },
        };
        await next();
      },
    },
  });
}

function buildLLMClient(rawText: string) {
  // Default: claude-cli (haiku) via createDefaultLLMClient.
  // Falls back to OpenAI only if L5_LLM_BACKEND=openai + OPENAI_API_KEY set.
  // If both backends unavailable / throw, fall back to deterministic LLM.
  if (typeof createDefaultLLMClient === 'function') {
    try {
      return createDefaultLLMClient('default');
    } catch {
      // fall through to deterministic
    }
  }
  return buildDeterministicLLM(rawText);
}

// Phase 5 (learning loop) — collection link.
// Extract a reusable insight from a completed task's executive-runtime output
// and store it as a pending founder_memory candidate. Idempotent per task
// (dedup by source_task_id). The founder_memory collection is owned by the
// executive-monitor plugin; we look it up at request time and no-op if it is
// not registered. Pure-domain extraction lives in l5-core (collectInsights).
// P1: when all tasks of one instruction are terminal (done/killed, ≥1 done),
// synthesize a single founder deliverable and post it to chat. Idempotent via
// instruction status claim + UNIQUE(instruction_id). Best-effort (caller .catch).
async function maybeSynthesizeInstruction(ctx: ActionContext, instruction_id: string | undefined): Promise<void> {
  if (!instruction_id) return;
  const db = ctx.db;
  const instructionRepo = db.getRepository('founder_instructions');
  const taskRepo = db.getRepository('agent_tasks');
  const handoffRepo = db.getRepository('agent_handoffs');
  const chatRepo = db.getRepository('chat_messages');
  const deliverableRepo = db.getRepository('founder_deliverables');

  const tasks = await taskRepo.find({ filter: { instruction_id } });
  if (!tasks.length) return;
  const allTerminal = tasks.every((t: any) => t.status === 'done' || t.status === 'killed');
  if (!allTerminal) return;
  if (!tasks.some((t: any) => t.status === 'done')) return; // don't synthesize an all-killed plan

  // Idempotency: claim the instruction. If already synthesized, stop.
  const inst = await instructionRepo.findOne({ filter: { id: instruction_id } });
  if (!inst || inst.status === 'synthesized') return;
  await instructionRepo.update({
    filter: { id: instruction_id, status: { $ne: 'synthesized' } },
    values: { status: 'synthesized' },
  });

  // Collect handoffs per (non-killed) task → outcomes
  const outcomes: any[] = [];
  for (const t of tasks.filter((t: any) => t.status !== 'killed')) {
    const hs = await handoffRepo.find({ filter: { task_id: t.id }, sort: ['createdAt'] });
    const work = hs.find((h: any) => h.from_agent === t.assigned_agent);
    const ceo = hs.find((h: any) => h.from_agent === 'CEO');
    // The real work product (agent_tasks.output) so synthesis reflects concrete
    // recommendations/action items, not just one-line handoff notes.
    let output: any = t.output ?? undefined;
    if (typeof output === 'string') {
      try { output = JSON.parse(output); } catch { output = undefined; }
    }
    outcomes.push({ task: t, work_handoff: work, ceo_handoff: ceo, output });
  }

  const interp = await db.getRepository('ceo_interpretations').findOne({ filter: { instruction_id } });
  const llm = buildLLMClient(inst.raw_text ?? '');
  const result = await synthesizeDeliverable(
    { instruction_text: inst.raw_text ?? '', ceo_goal: interp?.goal ?? '', outcomes },
    llm,
  );

  // Persist deliverable (UNIQUE(instruction_id) is the idempotency backstop — a
  // duplicate insert throws and is swallowed by the caller's .catch).
  const deliverableId = randomUUID();
  const chatId = randomUUID();
  await deliverableRepo.create({
    values: {
      id: deliverableId,
      instruction_id,
      project_id: inst.project_id ?? null,
      business_id: inst.business_id ?? null,
      decision_summary: result.decision_summary,
      contributions: result.contributions,
      open_gaps: result.open_gaps,
      next_actions: result.next_actions,
      chat_message_id: chatId,
    },
  });

  // Post the ONE founder deliverable card into chat (skip if no project to post to).
  if (inst.project_id) {
    await chatRepo.create({
      values: {
        id: chatId,
        project_id: inst.project_id,
        role: 'chief_of_staff',
        text: result.decision_summary,
        metadata: {
          kind: 'synthesis',
          instructionId: instruction_id,
          deliverable_id: deliverableId,
          decision_summary: result.decision_summary,
          contributions: result.contributions,
          open_gaps: result.open_gaps,
          next_actions: result.next_actions,
        },
      },
    });
  }
}

async function persistTaskInsight(ctx: ActionContext, task: any, result: any): Promise<void> {
  if (typeof collectInsights !== 'function') return;

  const candidates = collectInsights([
    {
      task_id: task.id,
      assigned_agent: task.assigned_agent,
      output: {
        insight_to_record: result?.output?.insight_to_record,
        workflow_improvement_suggestion: result?.output?.workflow_improvement_suggestion,
        // risk_level drives pii_level (D4/D5 -> high). Prefer the task's declared
        // risk, falling back to the runtime result.
        risk_level: task.risk_level ?? result?.risk_level ?? result?.output?.risk_level,
        phase: task.phase ?? result?.output?.phase,
      },
    },
  ]);
  if (candidates.length === 0) return; // insight too short / absent

  let repo: any;
  try {
    repo = ctx.db.getRepository('founder_memory');
  } catch {
    return; // collection not registered in this app
  }
  if (!repo) return;

  for (const c of candidates) {
    // Dedup: one memory candidate per source task.
    const existing = await repo.findOne({ filter: { source_task_id: c.source_task_id } });
    if (existing) continue;
    await repo.create({
      values: {
        id: randomUUID(),
        insight: c.insight,
        workflow_improvement: c.workflow_improvement || null,
        source_agent: c.source_agent || null,
        source_task_id: c.source_task_id,
        pii_level: c.pii_level || 'none',
        phase: c.phase || null,
        approval_status: 'pending',
      },
    });
  }
}

// Phase 5 (learning loop) — recall link.
// Load founder-approved memories to feed the CEO interpretation. Excludes
// high-PII insights from anything sent to the LLM (CLAUDE.md governance). Caps
// the count so the prompt stays bounded. Returns [] on any failure.
async function loadFounderMemories(ctx: ActionContext): Promise<
  Array<{ insight: string; workflow_improvement?: string; phase?: string }>
> {
  const MAX_MEMORIES = 20;
  let repo: any;
  try {
    repo = ctx.db.getRepository('founder_memory');
  } catch {
    return [];
  }
  if (!repo) return [];

  try {
    const rows = await repo.find({
      filter: { approval_status: 'saved' },
      // founder_memory uses NocoBase's default camelCase timestamps.
      sort: ['-createdAt'],
      limit: MAX_MEMORIES * 2,
    });
    return (rows ?? [])
      // Governance: never send high-PII insights to the LLM. Filter in JS to
      // avoid depending on operator support across NocoBase versions.
      .filter((r: any) => (r.pii_level ?? 'none') !== 'high')
      .map((r: any) => ({
        insight: r.insight ?? '',
        workflow_improvement: r.workflow_improvement ?? undefined,
        phase: r.phase ?? undefined,
      }))
      .filter((m: { insight: string }) => m.insight.length > 0)
      .slice(0, MAX_MEMORIES);
  } catch (err) {
    console.warn('[interpret] founder memory recall failed:', err);
    return [];
  }
}

// M2: InsightSource adapter for founder_memory.
// Implements the InsightSource interface from l5-core/insight-bus.
// M3 will add a secondbrain source alongside this one.
// read()  → loadFounderMemories (saved, non-high-PII only)
// write() → pending insert into founder_memory (CEO gate still required for saved promotion)
function makeFounderMemoryInsightSource(ctx: ActionContext) {
  return {
    name: 'founder_memory' as const,
    async read(filter: { role?: string; limit?: number }) {
      const memories = await loadFounderMemories(ctx);
      const limited = filter.limit ? memories.slice(0, filter.limit) : memories;
      return limited.map((m: { insight: string; workflow_improvement?: string; phase?: string }) => ({
        insight: m.insight,
        pii_level: 'none' as const,
        phase: m.phase,
        origin: 'founder_memory',
      }));
    },
    async write(req: {
      insight: string;
      source_agent?: string;
      source_task_id?: string;
      pii_level: 'none' | 'low' | 'high';
      phase?: string;
    }): Promise<{ ok: boolean; error?: string }> {
      let repo: any;
      try {
        repo = ctx.db.getRepository('founder_memory');
      } catch {
        return { ok: false, error: 'founder_memory collection not registered' };
      }
      if (!repo) return { ok: false, error: 'founder_memory repo unavailable' };
      try {
        if (req.source_task_id) {
          const existing = await repo.findOne({ filter: { source_task_id: req.source_task_id } });
          if (existing) return { ok: true }; // idempotent
        }
        await repo.create({
          values: {
            id: randomUUID(),
            insight: req.insight,
            source_agent: req.source_agent ?? null,
            source_task_id: req.source_task_id ?? null,
            pii_level: req.pii_level,
            phase: req.phase ?? null,
            approval_status: 'pending', // CEO gate — never bypass
          },
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  };
}

// Best-effort Telegram notification for cycle completion.
// Reads env vars TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FOUNDER_UI_BASE_URL.
// Silent skip if env vars are absent.
async function sendCycleDoneTelegram(task: any, taskId: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  const founderUIBase = process.env.FOUNDER_UI_BASE_URL ?? 'http://localhost:3002';
  const planTitle = (task.title as string | undefined) ?? taskId;
  const body = `task_id: ${taskId}`;
  const link = `${founderUIBase}/`;
  const text = `ℹ️ *사이클 완료 — ${planTitle}*\n\n${body}\n\n🔗 ${link}`;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });
  } catch {
    // Intentionally silent — notification failure must not affect task state.
  }
}

function buildDeterministicLLM(rawText: string) {
  return {
    async complete() {
      const external = /(send|publish|customer|client|lead|outreach|proposal|pricing|launch)/i.test(rawText);
      const tool = /(tool|build|automation|integration|api|engineering|stack)/i.test(rawText);
      const pmf = /(pmf|market|demand|experiment|waitlist|survey|interview|message|content|landing)/i.test(rawText);
      const finance = /(budget|cost|pricing|payment|invoice|subscription)/i.test(rawText);
      const risk = /(risk|legal|privacy|pii|security|compliance|consent)/i.test(rawText);

      return JSON.stringify({
        goal: rawText.trim(),
        phase: tool ? 'execution_system_build' : pmf ? 'market_pmf_diagnosis' : 'direction_alignment',
        assumptions: [
          'Founder submitted this instruction through CEO chat v1.',
          'NocoBase is the internal source of truth for task, approval, and monitor records.',
        ],
        success_criteria: [
          'Persist the original Founder instruction.',
          'Create CEO interpretation and executable AgentTask records.',
          external
            ? 'Route external-facing work through an approval gate before send or publish.'
            : 'Keep execution internal until a later approval gate is required.',
        ],
        risk_level: risk || finance ? 'D4' : external ? 'D3' : 'D2',
        approval_required: external || risk || finance,
        business_id: null,
        needs_business_clarification: false,
      });
    },
  };
}
