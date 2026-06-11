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

// CMO discovery: 같은 9222 CDP 크롬을 동시에 여러 runDiscovery가 운전하면 충돌하므로
// in-process lock으로 직렬화한다. 라이브 발굴(2·3단계)이 진행 중이면 다음 호출은 409로 거절.
let _discoveryInFlight = false;

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
  // 제목 디벨롭 8단계 (PRD cmo-title-development §19~21): Viewtrap 레퍼런스 2개 → 교차조합 → 2~8단계 → 평가
  runTitleDevelopmentWorkflow,
  buildTitleDevelopmentProposal,
  // 갭 #2 (2026-06-11): 레퍼런스 2개 자동 발굴 — YouTube API search/stats + (옵션) 확장 등급 실측
  discoverTitleReferences,
  // 갭 #10: 업로드 후 제목 교체 신호 (강의 기준: 1주일 100회 미만 → 교체)
  shouldSwapTitle,
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
  derivePTRules,
  DEFAULT_KEY_CONTENT_RULES,
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
  sendToFactory,
  // v3 key-content planning
  draftKeyContentPlan,
  runKeyContentWorkflow,
  runKeyContentReport,
  finalizeKeyContentPlan,
  buildViewtrapValidation,
  // v3 key-content 재기획: 서로 다른 주제 후보 N개 생성 + 사장님 선택 확정
  generateKeyContentCandidates,
  finalizeKeyContentChoice,
  // R1 풀링: 선택된 키 콘텐츠로 끌어오는 풀링 주제 후보 N개 생성 + 사장님 승인 확정
  generatePullingCandidates,
  finalizePullingPlan,
  // 풀링 콘텐츠 주제 탐색 보고서(workflow v2): 실데이터 기반 현상→욕구 주제 4~5개 선별
  runPullingContentReport,
  computeChannelOutlier,
  // R4 콘텐츠 제작: 확정 주제 → 썸네일 상세 후보 + 도입30초/원고/QA 초안
  proposeThumbnailDraft,
  proposeScriptDraft,
  // 썸네일 9개 A/B(PRD cmo-thumbnail-ab-automation): 9개 매트릭스 + 심리분석 통합 진입점
  proposeThumbnailSet,
  // §5/§7 이미지 소싱: 위험도 분류 + 출처표기
  collectImageSources,
  buildAttributionBlock,
  // R7 성과 재학습 루프: 완료 영상 성과(수동 입력) → 인사이트 → 다음 기획 입력
  recordVideoPerformance,
  extractCompletionInsight,
  // M4 영상 제작 파이프라인 잔여: brief 직접참조 슬라이드덱 → 렌더 잡 → 상태 폴링 → QA → 업로드 초안
  buildSlideDeckSpecFromBrief,
  buildFactoryJobFromSlideDeck,
  markRenderJobSubmitted,
  deriveRenderJobStatus,
  reconcileRenderJob,
  evaluateRenderArtifacts,
  buildYoutubeUploadDraftFromBrief,
  // M1~M3 통합 발굴 파이프라인: 발굴→통계·필터→(옵션)크롤링→Sonnet 분류→후보 + 키/풀링 Step 변환
  runDiscoveryPipeline,
  classifyDiscoveredVideos,
  toKeyViewtrapValidationInput,
  toPullingViewtrapValidationInput,
  toLongtailCandidateInputs,
  buildSelectionReason,
  // B1~B7 썸네일 보강(2026-06-11): 레퍼런스 패턴 학습 → 이미지/문구 디벨롭 → 시청층 정합 →
  // 도입부 후킹 정렬 → 디벨롭 자가점검 → 채널 우선 발굴. 도메인은 전부 l5-core — 여기는 배선만.
  learnThumbnailPatternsFromReferences,
  developThumbnailImage,
  developThumbnailTextWithTitleTechniques,
  judgeThumbnailAudienceFit,
  scoreIntroHookStrength,
  evaluateHookIntensityAlignment,
  evaluateDevelopImprovement,
  buildChannelFirstDiscoveryPlan,
  selectAudienceChannels,
  reviewThumbnailCandidate,
  // 갭 #10+#11: 업로드 후 성과 자동 매핑 + 썸네일 교체 신호 (제목 신호는 cmo-strategy shouldSwapTitle)
  parseVideoAnalyticsRecords,
  mapAnalyticsToPerformanceInput,
  evaluateThumbnailSwapSignal,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/video-room'));

const {
  createInMemoryVideoFactoryTransport,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/memory'));

// M3 발굴 분류용 Sonnet 클라이언트(모델 고정). 발굴 액션에서만 사용.
const {
  createClaudeCLIClient,
} = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/llm/claude-cli-client'));

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
    this.app.acl.allow('cmo', ['createProject', 'listProjects', 'getProject', 'chatMessage', 'advanceStatus', 'decideGate', 'approveStageGate', 'approvePlan', 'saveCard', 'buildSlideDeck', 'submitRender', 'getRenderStatus', 'runQA', 'createUploadDraft', 'loadPTContext', 'attachVoice', 'commitStrategyArtifact', 'saveScript', 'sendToFactory', 'generateVideoExecutionBrief', 'sendBriefToFactory', 'runContentStrategy', 'proposeKeyContentDraft', 'proposeProductDefinition', 'proposeKeyContentReport', 'selectKeyContentCandidate', 'proposePullingCandidates', 'proposePullingReport', 'commitPullingPlan', 'proposeThumbnailPlanDraft', 'commitThumbnailPlan', 'proposeThumbnailMatrix', 'recordImageSources', 'proposeTitleDevelopment', 'proposeScriptDraft', 'commitScriptDraft', 'saveKeyContentStep', 'submitViewtrapValidation', 'runDiscovery', 'commitKeyContentPlan', 'getStageGuides', 'recordVideoPerformance', 'getCompletedVideoInsights', 'learnThumbnailReferences', 'developThumbnailCandidate', 'reviewThumbnail', 'channelFirstDiscovery', 'evaluateHookAlignment', 'checkSwapSignals', 'publishUpload'], 'loggedIn');
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
        customer_problem text,
        core_offer text,
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

  // CMO v3 key-content 재기획: 프로젝트 생성 시 1회 입력으로 받는
  // customer_problem / core_offer 컬럼 보강(기존 테이블에도 적용).
  try {
    await db.sequelize.query(`
      ALTER TABLE IF EXISTS video_room_projects
        ADD COLUMN IF NOT EXISTS customer_problem text,
        ADD COLUMN IF NOT EXISTS core_offer text;
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure video_room_projects key-content columns: ${message}`);
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

  // R7: 완료 영상 성과 지표(수동 입력) 보관. 인사이트는 video_room_cards('completion_insights')에 저장.
  try {
    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS video_performance_metrics (
        id text PRIMARY KEY,
        video_project_id text NOT NULL,
        metric_type text NOT NULL,
        value numeric,
        data jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.logger?.warn?.(`Could not ensure video_performance_metrics table: ${message}`);
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

  // Shared helper: 비-게이트 status를 다음 승인 게이트(또는 흐름 끝)까지 자동 전진.
  // - `onlyFrom`: 현재 status가 이 목록에 있을 때만 전진(재호출/순서꼬임 멱등 보호).
  // - 게이트 status에 도달하면 그 status에서 정지(사장님 승인 대기). 최대 8스텝.
  // - 정책(2026-06-11): 승인 게이트만 수동, 비-게이트 단계는 액션 성공 시 자동 전진.
  async function advanceProjectUntilGate(project_id: string, onlyFrom: string[]): Promise<string | null> {
    const projRows = await q(`SELECT status FROM video_room_projects WHERE id = $1`, [project_id]);
    if (!projRows[0]) return null;
    let status: string = projRows[0].status;
    if (!onlyFrom.includes(status)) return null;
    let moved = false;
    for (let i = 0; i < 8 && !videoRoomRequiresApproval(status); i++) {
      let nxt: string;
      try {
        nxt = advanceVideoRoomStatus(status);
      } catch {
        break; // 흐름 끝(completed 등)
      }
      status = nxt;
      moved = true;
    }
    if (moved) {
      await db.sequelize.query(
        `UPDATE video_room_projects SET status = $1, current_page = $2, "updatedAt" = now() WHERE id = $3`,
        { bind: [status, pageForStatus(status), project_id] },
      );
      return status;
    }
    return null;
  }

  // Shared helper: 현재 status가 `from`일 때만 +1 전진(제작 구간 단계별 전진용, 멱등).
  async function advanceProjectFrom(project_id: string, from: string): Promise<string | null> {
    const projRows = await q(`SELECT status FROM video_room_projects WHERE id = $1`, [project_id]);
    if (!projRows[0] || projRows[0].status !== from) return null;
    if (videoRoomRequiresApproval(from)) return null;
    let newStatus: string;
    try {
      newStatus = advanceVideoRoomStatus(from);
    } catch {
      return null;
    }
    await db.sequelize.query(
      `UPDATE video_room_projects SET status = $1, current_page = $2, "updatedAt" = now() WHERE id = $3`,
      { bind: [newStatus, pageForStatus(newStatus), project_id] },
    );
    return newStatus;
  }

  // Shared helper: (project, stage) 최신 카드의 data를 파싱해 반환. 없으면 null.
  async function loadCardData(project_id: string, stage: string): Promise<any | null> {
    const rows = await q(
      `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = $2 ORDER BY "createdAt" DESC LIMIT 1`,
      [project_id, stage],
    );
    if (!rows[0]) return null;
    return typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : (rows[0].data ?? {});
  }

  // Shared helper: @l5/youtube는 ESM이라 require 불가 — dynamic import(기존 runDiscovery 컨벤션).
  // 모듈은 1회 로드 캐시, 클라이언트/자격증명은 호출 시 생성. 자격증명 미설정 시 throw(호출부가 graceful 처리).
  let _ytModule: any = null;
  async function loadYoutube(): Promise<{ yt: any; client: any; creds: any }> {
    if (!_ytModule) {
      _ytModule = await import(
        path.resolve(__dirname, '../../../../../../../services/youtube/dist/index.js')
      );
    }
    const creds = _ytModule.loadCredentials();
    return { yt: _ytModule, client: new _ytModule.YouTubeClient(creds), creds };
  }

  // Shared helper: Sonnet llmComplete(prompt→string) — l5-core deps { llmComplete } 주입용.
  function sonnetComplete(timeoutMs = 240_000): (prompt: string) => Promise<string> {
    const sonnet = createClaudeCLIClient({ model: 'sonnet', timeoutMs });
    return (p: string) => sonnet.complete({ system: '', user: p });
  }

  // Shared helper: 프로젝트의 "주제" 기본값 — 풀링 주제 1순위 → 확정 키 콘텐츠 → 프로젝트 제목.
  async function resolveProjectTopic(project_id: string): Promise<string> {
    const plan = await loadCardData(project_id, 'pulling_plan');
    const topics = Array.isArray(plan?.pulling_topics) ? plan.pulling_topics : [];
    const fromPulling = String(topics[0]?.title ?? topics[0]?.topic ?? plan?.key_topic_title ?? '').trim();
    if (fromPulling) return fromPulling;
    const choice = await loadCardData(project_id, 'key_content_choice');
    const fromKey = String(choice?.key_topic_title ?? choice?.selected?.title ?? '').trim();
    if (fromKey) return fromKey;
    const projRows = await q(`SELECT title FROM video_room_projects WHERE id = $1`, [project_id]);
    return String(projRows[0]?.title ?? '').trim();
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
        // CMO v3: 키 콘텐츠 단계 입력을 프로젝트 생성 시 1회 받아 저장.
        const customer_problem = String(v.customer_problem ?? '');
        const core_offer = String(v.core_offer ?? '');
        const business_id = v.business_id != null ? String(v.business_id) : null;
        const project_type = String(v.project_type ?? 'single_video');
        await db.sequelize.query(
          `INSERT INTO video_room_projects (id, title, business_id, product, target_audience, business_goal, customer_problem, core_offer, project_type, status, current_page, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'strategy_chat','strategy', now(), now())`,
          { bind: [project_id, title, business_id, product, target_audience, business_goal, customer_problem, core_offer, project_type] },
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
        // 승인=진행 원자화: approved면 approveGateForProject 내부에서
        // advanceVideoRoomStatus(status, { gateApproved: true })까지 수행해
        // 같은 호출에서 다음 status로 자동 전이한다. 별도 advanceStatus 호출 불필요.
        const advancedStatus = await approveGateForProject(gateRow.video_project_id, gate_id, decision);
        const projRows = await q(`SELECT status FROM video_room_projects WHERE id = $1`, [gateRow.video_project_id]);
        const status = advancedStatus ?? projRows[0]?.status ?? null;
        ctx.body = { ok: true, data: { gate_id, decision, status, advanced: decision === 'approved' && advancedStatus != null } };
        await next();
      },

      // POST /api/cmo:approveStageGate  { project_id }
      // 새 보드 흐름(R1/R4 등)에서 승인 게이트 상태를 사장님 권한으로 통과시킨다.
      // 레거시 chatMessage는 gate row를 만들지만 보드 흐름은 만들지 않으므로,
      // 현재 상태가 승인 게이트면 approved gate row(감사용)를 만들고 gateApproved 전이한다.
      approveStageGate: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        const projRows = await q(`SELECT status FROM video_room_projects WHERE id = $1`, [project_id]);
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const status = projRows[0].status;
        if (!videoRoomRequiresApproval(status)) {
          ctx.throw(400, `status ${status} is not an approval gate`);
        }
        // 감사용 approved gate row (gate_type == 현재 상태, GATE_BY_STATUS 매핑과 동일).
        const gateId = randomUUID();
        await db.sequelize.query(
          `INSERT INTO video_room_gates (id, video_project_id, gate_type, page, title, status, decided_by, decided_at, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,'approved','founder', now(), now(), now())`,
          { bind: [gateId, project_id, status, pageForStatus(status), `${status} 승인`] },
        );
        const newStatus = advanceVideoRoomStatus(status, { gateApproved: true });
        await db.sequelize.query(
          `UPDATE video_room_projects SET status = $1, current_page = $2, "updatedAt" = now() WHERE id = $3`,
          { bind: [newStatus, pageForStatus(newStatus), project_id] },
        );
        ctx.body = { ok: true, data: { status: newStatus, gate_id: gateId } };
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

        // Placeholder ids so buildSlideDeckSpec validates without real records.
        const spec_id = randomUUID();
        const placeholder_script_draft_id = randomUUID();
        const placeholder_voice_recording_id = randomUUID();

        // M4: 슬라이드 명시 입력이 없으면 최신 VideoExecutionBrief를 직접 참조해
        // 슬라이드덱을 만든다(인트로 + 논리블록별 + 브릿지). brief가 없을 때만
        // 기존 script_draft 요약 1장 폴백.
        let spec: any = null;
        let source: 'slides' | 'brief' | 'script_draft' = 'slides';
        let slides: any[] = Array.isArray(v.slides) ? v.slides : [];

        if (slides.length === 0) {
          const brief = await loadLatestBriefForProject(q, project_id);
          if (brief?.script?.logic_blocks?.length) {
            spec = buildSlideDeckSpecFromBrief(brief, {
              id: spec_id,
              video_project_id: project_id,
              script_draft_id: placeholder_script_draft_id,
              voice_recording_id: placeholder_voice_recording_id,
              design_theme,
            });
            source = 'brief';
          }
        }

        if (!spec) {
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
            source = 'script_draft';
          }

          spec = buildSlideDeckSpec({
            id: spec_id,
            video_project_id: project_id,
            script_draft_id: placeholder_script_draft_id,
            voice_recording_id: placeholder_voice_recording_id,
            design_theme,
            slides,
          });
        }

        const card_id = randomUUID();
        await db.sequelize.query(
          `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
           VALUES ($1,$2,'slide_deck',$3,$4, now(), now())`,
          { bind: [card_id, project_id, design_theme, JSON.stringify(spec)] },
        );

        ctx.body = { ok: true, data: { slide_deck_spec_id: spec_id, spec, source } };
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

        // M4: 실 factory(submitJob)가 있고 spec이 있으면, 슬라이드덱을 factory 렌더 잡으로
        // 변환해 jobs/ 인박스에 실제 push(+validate)한다. 렌더 자체(remotion, 수 분)는
        // factory 쪽에서 실행되고, 이후 진행은 cmo:getRenderStatus 폴링으로 본다.
        let factory_slug: string | undefined;
        let job_path: string | undefined;
        if (spec && _videoFactoryTransport && typeof (_videoFactoryTransport as any).submitJob === 'function') {
          const projRows = await q(`SELECT title FROM video_room_projects WHERE id = $1`, [project_id]);
          const title = String(projRows[0]?.title ?? spec.slides?.[0]?.headline ?? '영상');
          let factoryJob: any;
          try {
            factoryJob = buildFactoryJobFromSlideDeck(spec, { slug: slide_deck_spec_id, title });
          } catch (err: any) {
            ctx.throw(400, `buildFactoryJobFromSlideDeck 실패: ${err?.message ?? String(err)}`);
          }
          const result = await (_videoFactoryTransport as any).submitJob(factoryJob);
          if (!result.ok) {
            ctx.throw(400, `factory submitJob 실패: ${result.error ?? 'unknown'}`);
          }
          factory_slug = String(factoryJob.slug);
          job_path = result.job_path;
          job = markRenderJobSubmitted(job);
        } else {
          // 폴백: factory 미설정 시 기존 in-memory transport 경로(generate 심) 유지.
          const transport = _videoFactoryTransport ?? createInMemoryVideoFactoryTransport();
          job = await submitRenderJob(job, transport);
        }

        const card_id = randomUUID();
        await db.sequelize.query(
          `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
           VALUES ($1,$2,'rendering',$3,$4, now(), now())`,
          { bind: [card_id, project_id, `render job ${render_job_id}`, JSON.stringify({ job, payload, factory_slug, job_path })] },
        );

        // 렌더 잡 제출 성공 → slide_deck에서 rendering으로 자동 전진(멱등: slide_deck일 때만).
        const advanced_status = await advanceProjectFrom(project_id, 'slide_deck');

        ctx.body = { ok: true, data: { render_job_id, job, factory_slug, job_path, status: advanced_status } };
        await next();
      },

      // POST /api/cmo:getRenderStatus  { project_id, slug?, render_job_id? }
      // M4: 파일 기반 렌더 상태 폴링. factory outputs/<slug>/ 산출물 존재로 상태를 도출하고
      // (l5-core deriveRenderJobStatus), 완료 시 산출물 QA(evaluateRenderArtifacts)까지 반환.
      getRenderStatus: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        // 최신 rendering 카드에서 job + factory_slug 회수.
        const cardRows = await q(
          `SELECT id, data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'rendering' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        const cardRow = cardRows[0] ?? null;
        const cardData = cardRow
          ? (typeof cardRow.data === 'string' ? JSON.parse(cardRow.data) : cardRow.data)
          : null;

        const render_job_id = String(v.render_job_id ?? cardData?.job?.id ?? '').trim();
        const slug = String(v.slug ?? cardData?.factory_slug ?? '').trim();
        if (!slug) {
          ctx.throw(400, 'factory_slug를 알 수 없습니다. submitRender(실 factory)를 먼저 호출하거나 slug를 넘기세요.');
        }
        if (!_videoFactoryTransport || typeof (_videoFactoryTransport as any).getRenderJobStatus !== 'function') {
          ctx.body = { ok: false, data: { error: '팩토리 디렉토리가 없어 상태를 조회할 수 없습니다 (VIDEO_FACTORY_DIR 미설정).' } };
          await next();
          return;
        }

        const res = await (_videoFactoryTransport as any).getRenderJobStatus(slug);
        if (!res.ok) {
          ctx.throw(400, `getRenderJobStatus 실패: ${res.error ?? 'unknown'}`);
        }
        const observation = res.observation;
        const status = deriveRenderJobStatus(observation);

        // 상태머신 반영 + 완료 시 산출물 QA.
        let job = cardData?.job ?? null;
        if (job) {
          job = reconcileRenderJob(job, observation, new Date().toISOString());
        }
        const render_qa = status === 'completed'
          ? evaluateRenderArtifacts(observation, {
              format: observation?.render_report?.width === 1080 ? 'shorts_9_16' : 'youtube_16_9',
            })
          : null;

        // 카드 데이터 갱신(있을 때만).
        if (cardRow && job) {
          await db.sequelize.query(
            `UPDATE video_room_cards SET data = $1, summary = $2, "updatedAt" = now() WHERE id = $3`,
            {
              bind: [
                JSON.stringify({ ...cardData, job, last_observation: observation, render_qa }),
                `render ${status}`,
                cardRow.id,
              ],
            },
          );
        }

        // 렌더 완료 관측 → rendering에서 qa로 자동 전진(멱등: rendering일 때만).
        let advanced_status: string | null = null;
        if (status === 'completed') {
          advanced_status = await advanceProjectFrom(project_id, 'rendering');
        }

        ctx.body = { ok: true, data: { render_job_id, slug, status, job, observation, render_qa, project_status: advanced_status } };
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

        // QA 통과 → qa에서 video_qa_approval 게이트로 자동 전진(멱등: qa일 때만, fail이면 정지).
        let advanced_status: string | null = null;
        if (result.overall_status === 'pass') {
          advanced_status = await advanceProjectFrom(project_id, 'qa');
        }

        ctx.body = { ok: true, data: { qa_result_id, result, status: advanced_status } };
        await next();
      },

      // POST /api/cmo:createUploadDraft  { project_id, render_job_id, title?, description?, tags? }
      // M4: title 미입력 시 최신 VideoExecutionBrief에서 업로드 "초안"(제목/설명/태그)을
      // 자동 생성한다. 초안 생성까지만 — 실제 YouTube 업로드는 절대 하지 않는다(승인 게이트).
      createUploadDraft: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const render_job_id = String(v.render_job_id ?? '').trim();
        const title = String(v.title ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (!render_job_id) ctx.throw(400, 'render_job_id is required');

        const upload_draft_id = randomUUID();
        let draft: any;
        if (title) {
          draft = createUploadDraft({
            id: upload_draft_id,
            video_project_id: project_id,
            render_job_id,
            title,
            description: String(v.description ?? ''),
            tags: Array.isArray(v.tags) ? v.tags.map(String) : [],
          });
        } else {
          const brief = await loadLatestBriefForProject(q, project_id);
          if (!brief) {
            ctx.throw(400, 'title이 없고 VideoExecutionBrief도 없습니다. title을 넘기거나 generateVideoExecutionBrief를 먼저 호출하세요.');
          }
          draft = buildYoutubeUploadDraftFromBrief(
            brief,
            { id: upload_draft_id, video_project_id: project_id, render_job_id },
            v.thumbnail_ref ? { thumbnail_ref: String(v.thumbnail_ref) } : {},
          );
        }

        const card_id = randomUUID();
        await db.sequelize.query(
          `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
           VALUES ($1,$2,'upload_draft',$3,$4, now(), now())`,
          { bind: [card_id, project_id, String(draft.title ?? title), JSON.stringify(draft)] },
        );

        // 업로드 초안 생성 → upload_draft에서 upload_approval 게이트로 자동 전진(멱등).
        const advanced_status = await advanceProjectFrom(project_id, 'upload_draft');

        ctx.body = { ok: true, data: { upload_draft_id, draft, status: advanced_status } };
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

        // rules 미입력 시 자동 도출(LLM → 강의 기본 규칙 폴백) — 전체 흐름 정지 방지.
        let key_content_rules = rawRules;
        let pulling_content_rules = rawRules;
        let rules_source: string = rawRules.length > 0 ? 'caller' : 'derived';
        if (rawRules.length === 0) {
          const projRows = await q(
            `SELECT product, target_audience FROM video_room_projects WHERE id = $1`,
            [project_id],
          );
          const derived = await derivePTRules(
            rawSourceRefs.map((s: any) => String(s)),
            { product: projRows[0]?.product, target_audience: projRows[0]?.target_audience },
            { llmComplete: sonnetComplete() },
          );
          key_content_rules = derived.key_content_rules;
          pulling_content_rules = derived.pulling_content_rules;
          rules_source = derived.source;
        }
        // second brain 발췌가 3개 미만이면 강의 기본 원칙 라벨로 부족분만 보충(투명 표기).
        if (rawSourceRefs.length < 3) {
          const pad = DEFAULT_KEY_CONTENT_RULES.slice(0, 3 - rawSourceRefs.length).map(
            (r: string) => `[기본 원칙 보충] ${r}`,
          );
          rawSourceRefs = [...rawSourceRefs, ...pad];
        }

        try {
          const snapshot = createBusinessPTContextSnapshot({
            id: randomUUID(),
            video_project_id: project_id,
            loaded_at: new Date().toISOString(),
            source_refs: rawSourceRefs,
            key_content_rules,
            pulling_content_rules,
            freshness_status: 'fresh',
          });
          assertContextLoadingComplete(snapshot);
          (snapshot as any).rules_source = rules_source;

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

          // 음성 첨부 성공 → voice_recording에서 slide_deck으로 자동 전진(멱등).
          const advanced_status = await advanceProjectFrom(project_id, 'voice_recording');

          ctx.body = { ok: true, data: { voice: attached, status: advanced_status } };
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
          // 전략패키지→Brief 파이프라인: 승인된 키 콘텐츠(choice) + script_draft(원고/논리블록/도입)
          // 카드를 읽어 CmoVideoStrategyBrief + VoiceMatchedScript + intro_30s를 조립한 뒤
          // buildVideoExecutionBrief(정확한 시그니처)로 brief를 생성한다.
          const scriptDraft = await loadScriptDraftForBrief(q, project_id, card_id);
          if (!scriptDraft) {
            ctx.throw(400, 'script_draft 카드가 없습니다. proposeScriptDraft를 먼저 호출하세요.');
          }

          const proj = (await q(`SELECT * FROM video_room_projects WHERE id = $1`, [project_id]))[0] ?? {};
          const strategyBrief = buildStrategyBriefFromCards(scriptDraft, proj, card_id);

          const fullScript: string =
            scriptDraft.integrated_script?.full_script ??
            scriptDraft.full_script ??
            (Array.isArray(scriptDraft.logic_blocks)
              ? scriptDraft.logic_blocks.map((b: any) => b.draft ?? '').filter(Boolean).join('\n\n')
              : '');
          const intro30s: string =
            scriptDraft.intro_30s?.script ??
            scriptDraft.intro_30s?.first_sentence ??
            strategyBrief.intro_direction;

          const voice_matched_script = {
            full_script: fullScript,
            voice_profile_used: {},
            changed_phrases: [],
            preserved_logic: true,
          };

          try {
            brief = buildVideoExecutionBrief({
              content_card_id: card_id,
              content_type: strategyBrief.content_type,
              title: strategyBrief.topic,
              strategy_brief: strategyBrief,
              voice_matched_script,
              intro_30s: intro30s,
            });
          } catch (err: any) {
            ctx.throw(400, `buildVideoExecutionBrief 실패: ${err?.message ?? String(err)}`);
          }
        }

        const validation = validateVideoExecutionBrief(brief);
        if (!validation.valid) {
          ctx.throw(400, `brief 검증 실패: ${(validation.errors ?? []).join(', ')}`);
        }

        const record_id = randomUUID();
        const now = new Date().toISOString();
        const handoff = prepareFactoryHandoff(brief, { id: record_id, created_at: now });

        await db.sequelize.query(
          `INSERT INTO video_execution_briefs (id, content_card_id, project_id, schema_version, brief, validation_status, handoff_status, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
           ON CONFLICT (id) DO UPDATE SET brief=$5, validation_status=$6, handoff_status=$7, "updatedAt"=now()`,
          {
            bind: [
              record_id,
              card_id,
              project_id,
              brief.schema_version ?? 'cmo_to_factory_v2',
              JSON.stringify(handoff),
              handoff.validation_status,
              handoff.handoff_status,
            ],
          },
        );

        ctx.body = { ok: true, data: { brief_id: record_id, brief: handoff.brief, record: handoff } };
        await next();
      },

      // POST /api/cmo:sendBriefToFactory  { project_id, content_card_id, brief_id?, brief? }
      // 승인된 VideoExecutionBrief를 팩토리로 전송한다(prepareFactoryHandoff→sendToFactory).
      // transport는 기존 video factory transport(submitJob)를 재사용하고, 미설정 시
      // 최소 결정론 transport(상태만 sent)로 폴백한다.
      sendBriefToFactory: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const card_id = String(v.content_card_id ?? v.card_id ?? '').trim();
        const brief_id = v.brief_id ? String(v.brief_id).trim() : '';
        if (!project_id) ctx.throw(400, 'project_id is required');

        // 1) 레코드 로드 우선순위: brief_id → content_card_id 최신 → body의 brief.
        let row: any = null;
        if (brief_id) {
          row = (await q(`SELECT * FROM video_execution_briefs WHERE id = $1 AND project_id = $2`, [brief_id, project_id]))[0] ?? null;
        }
        if (!row && card_id) {
          row = (await q(
            `SELECT * FROM video_execution_briefs WHERE content_card_id = $1 AND project_id = $2 ORDER BY "createdAt" DESC LIMIT 1`,
            [card_id, project_id],
          ))[0] ?? null;
        }

        let record: any;
        if (row) {
          const stored = typeof row.brief === 'string' ? JSON.parse(row.brief) : row.brief;
          // stored는 prepareFactoryHandoff가 만든 VideoExecutionBriefRecord.
          record = stored;
        } else if (v.brief) {
          const briefPayload = typeof v.brief === 'string' ? JSON.parse(v.brief) : v.brief;
          record = prepareFactoryHandoff(briefPayload, { id: randomUUID(), created_at: new Date().toISOString() });
        } else {
          ctx.throw(400, 'video_execution_brief 레코드를 찾을 수 없습니다. generateVideoExecutionBrief를 먼저 호출하세요.');
        }

        if (record.validation_status === 'invalid') {
          ctx.throw(400, 'invalid brief는 팩토리로 전송할 수 없습니다.');
        }

        // 2) transport: 브리프 핸드오프 = 외부 팩토리 인박스(briefs/)에 brief JSON 전달.
        // submitJob은 슬라이드덱→렌더 잡 전용이라 VideoExecutionBrief를 넘기면 검증 실패함(사용 금지).
        // _videoFactoryTransport.submitBrief가 briefs/<slug>.json을 쓰고 validate:brief로 검증한다.
        // factory dir 미존재(=transport null)면 graceful stub로 sent 처리(brief는 DB에 영속).
        let brief_path: string | undefined;
        let usedStub = true;
        const transport = {
          async send(brief: any): Promise<{ ok: boolean }> {
            if (_videoFactoryTransport && typeof (_videoFactoryTransport as any).submitBrief === 'function') {
              usedStub = false;
              const res = await (_videoFactoryTransport as any).submitBrief(brief);
              brief_path = res?.data?.brief_path;
              return { ok: !!res?.ok };
            }
            return { ok: true };
          },
        };

        const sent = await sendToFactory(record, transport);

        const factory_result_url =
          (process.env.VIDEO_FACTORY_RESULT_BASE_URL
            ? `${process.env.VIDEO_FACTORY_RESULT_BASE_URL}/${sent.id}`
            : undefined);

        // 3) 레코드 상태 갱신(있던 행만 update; body brief 경로는 신규 insert).
        if (row) {
          await db.sequelize.query(
            `UPDATE video_execution_briefs SET brief=$1, handoff_status=$2, "updatedAt"=now() WHERE id=$3`,
            { bind: [JSON.stringify(sent), sent.handoff_status, row.id] },
          );
        } else {
          await db.sequelize.query(
            `INSERT INTO video_execution_briefs (id, content_card_id, project_id, schema_version, brief, validation_status, handoff_status, "createdAt", "updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
             ON CONFLICT (id) DO UPDATE SET brief=$5, handoff_status=$7, "updatedAt"=now()`,
            {
              bind: [
                sent.id,
                sent.content_card_id,
                project_id,
                sent.schema_version,
                JSON.stringify(sent),
                sent.validation_status,
                sent.handoff_status,
              ],
            },
          );
        }

        if (sent.handoff_status !== 'sent') {
          ctx.throw(400, `factory 전송 실패 (handoff_status=${sent.handoff_status})`);
        }

        ctx.body = { ok: true, data: { handoff_status: sent.handoff_status, factory_result_url, brief_path, stub: usedStub } };
        await next();
      },

      // POST /api/cmo:proposeKeyContentDraft  { project_id }
      // v3 Step1~7,10: LLM으로 키 콘텐츠 초안 생성 → key_content_draft 카드 upsert.
      proposeKeyContentDraft: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        // Load project for product info.
        const projRows = await q(`SELECT * FROM video_room_projects WHERE id = $1`, [project_id]);
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const proj = projRows[0];

        // CMO v3: 키 콘텐츠 입력은 프로젝트 생성 시 1회 받은 값을 사용.
        // 요청에 직접 넘어온 값이 있으면 우선(편집·재실행 호환).
        const customer_problem =
          (v.customer_problem ? String(v.customer_problem).trim() : '') ||
          (proj.customer_problem ? String(proj.customer_problem).trim() : '') ||
          undefined;
        const core_offer =
          (v.core_offer ? String(v.core_offer).trim() : '') ||
          (proj.core_offer ? String(proj.core_offer).trim() : '') ||
          undefined;

        // ProductBrief shape (runKeyContentWorkflow/buildItemGeneralization 입력 계약).
        // category는 createProject가 별도로 받지 않으므로 product 문자열로 폴백.
        const productStr = String(proj.product ?? '').trim();
        const product = {
          product_name: productStr || String(proj.title ?? '').trim(),
          category: String((proj as any).category ?? '').trim() || productStr || '제품/서비스',
          target_audience: String(proj.target_audience ?? '').trim(),
          core_offer: core_offer ?? productStr,
          business_goal: String(proj.business_goal ?? 'brand_growth').trim(),
        };

        // Graceful second brain insight fetch.
        let second_brain_insights: string[] = [];
        if (_secondBrainTransport) {
          try {
            const sbHits = await _secondBrainTransport.query({ role: '키 콘텐츠 기획' as any, limit: 5 });
            second_brain_insights = (sbHits ?? [])
              .map((h: any) => String(h.content ?? h.text ?? h.insight ?? '').trim())
              .filter((s: string) => s.length > 0);
          } catch {
            // graceful: leave empty
          }
        }

        const llm = buildLLMClient('');
        const llmComplete = (p: string) => llm.complete({ system: '', user: p });

        // 11스텝 순차 워크플로우(Step1~7,10)로 초안 생성. 각 LLM 스텝은 이전 스텝
        // 출력을 주입받아 추론·검증·누적하며, 실패 스텝만 결정론 fallback.
        let result: any;
        try {
          result = await runKeyContentWorkflow({ product, customer_problem, second_brain_insights }, { llmComplete });
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        // 분석 초안(draft)으로 서로 다른 각도의 주제 후보 3개 생성.
        // 동일 llmComplete 주입(미설정/실패 시 도메인 모듈이 결정론 폴백).
        let candidates: any[];
        try {
          candidates = await generateKeyContentCandidates(result.draft, { llmComplete }, 3);
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        // key_content_draft 카드 upsert(분석 산출물 보존 — 후보/선택 단계가 참조).
        await upsertVideoRoomCard(
          db,
          project_id,
          'key_content_draft',
          `key_content_draft (progress: ${result.progress}/8)`,
          result.draft,
        );

        // key_content_candidates 카드 upsert(후보 + progress).
        await upsertVideoRoomCard(
          db,
          project_id,
          'key_content_candidates',
          `key_content_candidates (${candidates.length}개 후보)`,
          { candidates, progress: result.progress },
        );

        // 초안 완료 텔레그램 알림(best-effort — 알림 실패가 응답에 영향 없음).
        sendKeyContentDraftTelegram(project_id, candidates.length).catch(() => {
          /* graceful: 알림 실패는 무시 */
        });

        ctx.body = { ok: true, data: { candidates, progress: result.progress } };
        await next();
      },

      // POST /api/cmo:proposeProductDefinition  { project_id }
      // 키 콘텐츠 "기획"(실검색) 전에 상품 정의(Step1~7 분석)만 만들어 사장님 승인을 받는 단계.
      // 후보 생성은 하지 않는다. 승인(advanceStatus) 후 proposeKeyContentDraft로 넘어간다.
      proposeProductDefinition: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        const projRows = await q(`SELECT * FROM video_room_projects WHERE id = $1`, [project_id]);
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const proj = projRows[0];

        const customer_problem =
          (proj.customer_problem ? String(proj.customer_problem).trim() : '') || undefined;
        const core_offer =
          (proj.core_offer ? String(proj.core_offer).trim() : '') || undefined;
        const productStr = String(proj.product ?? '').trim();
        const product = {
          product_name: productStr || String(proj.title ?? '').trim(),
          category: String((proj as any).category ?? '').trim() || productStr || '제품/서비스',
          target_audience: String(proj.target_audience ?? '').trim(),
          core_offer: core_offer ?? productStr,
          business_goal: String(proj.business_goal ?? 'brand_growth').trim(),
        };

        const llm = buildLLMClient('');
        const llmComplete = (p: string) => llm.complete({ system: '', user: p });

        // Step1~7 분석만 (후보 생성 X). 실패 스텝만 결정론 폴백.
        let result: any;
        try {
          result = await runKeyContentWorkflow({ product, customer_problem }, { llmComplete });
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        // 뷰트랩 실검색용 짧은 키워드(2~4어절) 생성 — 다음 단계(키 콘텐츠 기획)의 검색 입력.
        const sk = result.draft?.step7_search_keywords ?? {};
        let viewtrap_keywords: string[] = [];
        try {
          const kwPrompt = [
            '아래 분석을 바탕으로 YouTube/Viewtrap에서 실제로 검색할 짧은 키워드 6개를 뽑아라.',
            '규칙: 각 2~4어절. 문장형·추상적 표현 금지. 사용자가 실제로 검색창에 칠 형태(예: "인스타 마케팅 자동화", "소상공인 마케팅 대행").',
            `상품: ${product.product_name}`,
            `타깃: ${product.target_audience}`,
            customer_problem ? `핵심 문제: ${customer_problem}` : '',
            `문제 키워드: ${(sk.problem_keywords ?? []).slice(0, 5).join(' / ')}`,
            `기능 키워드: ${(sk.item_feature_benefit_keywords ?? []).join(' / ')}`,
            'JSON 배열만 출력: ["키워드1","키워드2",...]',
          ].filter(Boolean).join('\n');
          const raw = await llmComplete(kwPrompt);
          const m = raw.match(/\[[\s\S]*\]/);
          if (m) viewtrap_keywords = (JSON.parse(m[0]) as unknown[])
            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            .slice(0, 8);
        } catch {
          // graceful: 실패 시 기존 step7 기능 키워드로 폴백.
        }
        if (viewtrap_keywords.length === 0) {
          viewtrap_keywords = (sk.item_feature_benefit_keywords ?? []).slice(0, 6);
        }

        await upsertVideoRoomCard(
          db,
          project_id,
          'product_definition',
          `product_definition (progress: ${result.progress}/8)`,
          {
            draft: result.draft,
            viewtrap_keywords,
            progress: result.progress,
            product: product.product_name,
            target_audience: product.target_audience,
          },
        );

        ctx.body = { ok: true, data: { draft: result.draft, viewtrap_keywords, progress: result.progress } };
        await next();
      },

      // POST /api/cmo:proposeKeyContentReport  { project_id }
      // 상품정의 승인 후 — 승인된 viewtrap_keywords로 키 콘텐츠 기획 "보고서"를 만든다.
      //   ① YouTube API 키워드 시장성 분석 → 진행/보류/제외 판정
      //   ② CDP YouTube 확장으로 성과도/기여도 등급 수집 + 5만+/롱폼 필터 → 키워드별 후보
      //   ③ 최종 3개 선별 → 자막(timedtext) 추출 → 판매논리(현상→…→보상) 분석
      //   ④ 우리 상품 적용 판매논리 + 최우선 추천 1개 + 승인요청 문장으로 보고서 조립
      // CDP 단일 테넌트라 _discoveryInFlight lock 공유. CDP/자막/LLM 실패는 부분 폴백(throw 금지).
      proposeKeyContentReport: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        const projRows = await q(`SELECT * FROM video_room_projects WHERE id = $1`, [project_id]);
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const proj = projRows[0];

        // 상품정의 카드에서 승인된 검색 키워드를 읽는다(없으면 step7 폴백).
        const cardRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'product_definition' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        const cardData = (cardRows[0]?.data ?? {}) as any;
        let keywords: string[] = Array.isArray(cardData.viewtrap_keywords)
          ? cardData.viewtrap_keywords.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
          : [];
        if (keywords.length === 0) {
          ctx.throw(400, 'no approved keywords found — run proposeProductDefinition first');
        }

        const productStr = String(proj.product ?? '').trim();
        const reportProduct = {
          product_name: productStr || String(proj.title ?? '').trim(),
          category: String((proj as any).category ?? '').trim() || productStr || '제품/서비스',
          target_audience: String(proj.target_audience ?? '').trim() || '타깃 미상',
          core_offer: String(proj.core_offer ?? productStr).trim() || productStr,
        };
        const discoveryProduct = { ...reportProduct, business_goal: String(proj.business_goal ?? 'brand_growth').trim() };
        const target = reportProduct.target_audience;

        if (_discoveryInFlight) {
          ctx.throw(409, 'another discovery is in flight (CDP chrome is single-tenant); retry shortly');
        }
        _discoveryInFlight = true;

        let cdpSession: any = null;
        let report: any;
        try {
          const yt: any = await import(
            path.resolve(__dirname, '../../../../../../../services/youtube/dist/index.js')
          );
          const creds = yt.loadCredentials();
          const client = new yt.YouTubeClient(creds);
          const sonnet = createClaudeCLIClient({ model: 'sonnet', timeoutMs: 240_000 });
          const llmComplete = (p: string) => sonnet.complete({ system: '', user: p });

          // CDP 확장 어댑터(성과도/기여도 등급) — graceful. 실패 시 조회수만으로 진행.
          // 연결은 1회 재시도(런타임 일시 실패로 등급이 통째로 비던 원인 방지).
          const reportNotes: string[] = [];
          let extensionAdapter: any;
          for (let attempt = 0; attempt < 2 && !cdpSession; attempt += 1) {
            try {
              cdpSession = await yt.connectCdp({ endpoint: yt.DEFAULT_CDP_ENDPOINT });
            } catch (e: any) {
              if (attempt === 1) reportNotes.push(`CDP 연결 실패 — 성과도/기여도 미수집(조회수만): ${e?.message ?? String(e)}`);
            }
          }
          if (cdpSession) {
            extensionAdapter = yt.createExtensionScraperAdapter(cdpSession, {});
            reportNotes.push('CDP YouTube 확장 라이브 — 성과도/기여도 등급 수집');
          }
          const baseDeps = yt.createLiveDiscoveryDeps({
            client,
            searchMaxResults: 25,
            ...(extensionAdapter ? { extensionAdapter } : {}),
          });

          // 키워드 1개 발굴 → 영상[](성과도/기여도 병합). 분류(classify) 미주입 → videos만 사용.
          const discover = async (keyword: string) => {
            const res = await runDiscoveryPipeline(
              { query: keyword, product: discoveryProduct, target, mode: 'key' },
              baseDeps,
            );
            return (res.videos ?? []).map((x: any) => ({
              videoId: x.videoId,
              title: x.title,
              channelTitle: x.channelTitle,
              viewCount: x.viewCount,
              metrics: x.metrics,
            }));
          };
          const getDurations = (ids: string[]) => client.getVideoDurations(ids);
          // 자막: 로그인 CDP 브라우저의 "Show transcript" 패널 스크랩(서버 raw fetch는 빈 본문/pot로 막힘).
          // CDP 없으면 서버 fetch 폴백(대개 빈 결과 — graceful, 판매논리는 메타데이터로).
          const fetchTranscript = async (id: string) => {
            if (cdpSession) {
              try {
                const t = await yt.scrapeTranscriptViaCdp(cdpSession, id, {});
                if (t.available) return { available: true, text: t.text };
              } catch { /* 폴백 */ }
            }
            const t = await yt.fetchTranscript(id, fetch);
            return { available: t.available, text: t.text };
          };

          // 시청자 정체성 판단 근거 — 인기순 상위 댓글(YouTube Data API).
          const getComments = (id: string) => client.getTopComments(id, 8);

          report = await runKeyContentReport(
            { product: reportProduct, keywords, maxKeywords: 6, extraNotes: reportNotes },
            { discover, getDurations, fetchTranscript, getComments, llmComplete },
          );
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        } finally {
          if (cdpSession) {
            try { await cdpSession.browser.close(); } catch { /* ignore */ }
          }
          _discoveryInFlight = false;
        }

        await upsertVideoRoomCard(
          db,
          project_id,
          'key_content_report',
          `key_content_report (${report.provenance.candidates_selected} candidates / ${report.provenance.keywords_advanced} keywords)`,
          report,
        );

        // 풀링 입력 배선 — 보고서 흐름은 selectKeyContentCandidate를 거치지 않으므로,
        // 풀링(proposePullingCandidates)이 요구하는 key_content_choice + key_content_draft 카드를
        // 보고서 추천(applied 주제) + 상품정의 draft로 여기서 커밋한다.
        const keyTopic =
          String(report.applied_sales_logic?.content_topic ?? '').trim() ||
          String((report.candidates ?? []).find((c: any) => c.topPick)?.title ?? '').trim() ||
          String((report.candidates ?? [])[0]?.title ?? '').trim();
        if (keyTopic) {
          await upsertVideoRoomCard(
            db,
            project_id,
            'key_content_choice',
            `key_content_choice: ${keyTopic}`,
            {
              key_topic_title: keyTopic,
              source: 'key_content_report',
              recommended_video_id: report.recommended_video_id ?? null,
              applied_sales_logic: report.applied_sales_logic ?? null,
            },
          );
        }
        if (cardData.draft) {
          await upsertVideoRoomCard(
            db,
            project_id,
            'key_content_draft',
            'key_content_draft (from product_definition)',
            cardData.draft,
          );
        }

        ctx.body = { ok: true, data: report };
        await next();
      },

      // POST /api/cmo:selectKeyContentCandidate  { project_id, candidate_id }
      // 사장님이 후보 1개 선택 → finalizeKeyContentChoice로 풀링 입력 확정 +
      // key_content_choice 카드 저장 + 상태를 풀링 단계로 advance.
      selectKeyContentCandidate: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const candidate_id = String(v.candidate_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (!candidate_id) ctx.throw(400, 'candidate_id is required');

        // 후보 카드 로드.
        const candRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_candidates' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (!candRows[0]) ctx.throw(404, 'key_content_candidates 카드가 없습니다. proposeKeyContentDraft를 먼저 호출하세요.');
        const candData = typeof candRows[0].data === 'string' ? JSON.parse(candRows[0].data) : (candRows[0].data ?? {});
        const candidate = (candData.candidates ?? []).find((c: any) => c.id === candidate_id);
        if (!candidate) ctx.throw(404, `candidate ${candidate_id} not found`);

        // 분석 초안 로드(entry_stage 계승용).
        const draftRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_draft' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (!draftRows[0]) ctx.throw(404, 'key_content_draft 카드가 없습니다.');
        const draft = typeof draftRows[0].data === 'string' ? JSON.parse(draftRows[0].data) : (draftRows[0].data ?? {});

        let choice: any;
        try {
          choice = finalizeKeyContentChoice({ candidate, draft });
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        // 확정 카드 저장.
        await upsertVideoRoomCard(
          db,
          project_id,
          'key_content_choice',
          `key_content_choice: ${choice.key_topic_title}`,
          choice,
        );

        // 풀링 단계로 상태 진입.
        const projRows = await q(`SELECT status FROM video_room_projects WHERE id = $1`, [project_id]);
        let newStatus: string | null = null;
        if (projRows[0]) {
          newStatus = advanceVideoRoomStatus(projRows[0].status);
          const newPage = pageForStatus(newStatus);
          await db.sequelize.query(
            `UPDATE video_room_projects SET status = $1, current_page = $2, "updatedAt" = now() WHERE id = $3`,
            { bind: [newStatus, newPage, project_id] },
          );
        }

        ctx.body = { ok: true, data: { choice, status: newStatus } };
        await next();
      },

      // POST /api/cmo:proposePullingCandidates  { project_id }
      // R1 풀링: 선택된 키 콘텐츠(key_content_choice)와 분석 초안(key_content_draft)으로
      // 끌어오는 풀링 주제 후보 N개 생성 → pulling_candidates 카드 upsert.
      proposePullingCandidates: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        // 선택된 키 콘텐츠 로드(key_topic_title 입력).
        const choiceRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_choice' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (!choiceRows[0]) ctx.throw(404, 'key_content_choice 카드가 없습니다. selectKeyContentCandidate를 먼저 호출하세요.');
        const choice = typeof choiceRows[0].data === 'string' ? JSON.parse(choiceRows[0].data) : (choiceRows[0].data ?? {});
        const key_topic_title = String(choice.key_topic_title ?? '').trim();
        if (!key_topic_title) ctx.throw(400, 'key_content_choice 카드에 key_topic_title이 없습니다.');

        // 분석 초안 로드(draft 입력).
        const draftRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_draft' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (!draftRows[0]) ctx.throw(404, 'key_content_draft 카드가 없습니다. proposeKeyContentDraft를 먼저 호출하세요.');
        const draft = typeof draftRows[0].data === 'string' ? JSON.parse(draftRows[0].data) : (draftRows[0].data ?? {});

        const llm = buildLLMClient('');
        const llmComplete = (p: string) => llm.complete({ system: '', user: p });

        // 풀링 주제 후보 생성(미설정/실패 시 도메인 모듈이 결정론 폴백).
        let candidates: any[];
        try {
          candidates = await generatePullingCandidates({ key_topic_title, draft }, { llmComplete });
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        // pulling_candidates 카드 upsert.
        await upsertVideoRoomCard(
          db,
          project_id,
          'pulling_candidates',
          `pulling_candidates (${candidates.length}개 후보)`,
          { candidates },
        );

        // 풀링 초안 완료 텔레그램 알림(best-effort — 알림 실패가 응답에 영향 없음).
        sendPullingDraftTelegram(project_id, candidates.length).catch(() => {
          /* graceful: 알림 실패는 무시 */
        });

        ctx.body = { ok: true, data: { candidates } };
        await next();
      },

      // POST /api/cmo:proposePullingReport  { project_id }
      // 풀링 콘텐츠 주제 탐색 보고서(workflow v2) — 확정된 키 콘텐츠로 끌어올 "현상→욕구"
      // 풀링 주제 4~5개를 실데이터로 선별한다.
      //   ① LLM이 현상 영역 → 검색어 후보 생성(데이터 탐색용, 뷰트랩 예산 ≤10)
      //   ② 검색어별 YouTube/CDP 뷰트랩 발굴(성과도/기여도/노출확률 실측) + 롱폼·5만+ 필터
      //   ③ video_score 점수화(노출확률 최우선) → LLM 클러스터링 → topic_score 4~5개 선별
      //   ④ 주제별 현상→욕구→계획→행동→보상 퍼널 + 상품 접목 논리(LLM 병렬)
      // proposeKeyContentReport와 동일한 라이브 deps/lock 공유(CDP 단일 테넌트).
      proposePullingReport: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        const projRows = await q(`SELECT * FROM video_room_projects WHERE id = $1`, [project_id]);
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const proj = projRows[0];

        // 확정된 키 콘텐츠 로드.
        const choiceRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_choice' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (!choiceRows[0]) ctx.throw(404, 'key_content_choice 카드가 없습니다. 키 콘텐츠를 먼저 확정하세요.');
        const choice = typeof choiceRows[0].data === 'string' ? JSON.parse(choiceRows[0].data) : (choiceRows[0].data ?? {});
        const key_topic_title = String(choice.key_topic_title ?? '').trim();
        if (!key_topic_title) ctx.throw(400, 'key_content_choice 카드에 key_topic_title이 없습니다.');
        const asl = choice.applied_sales_logic ?? {};

        // 분석 초안 로드 → draftContext 추출.
        const draftRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_draft' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        const draft = draftRows[0]
          ? (typeof draftRows[0].data === 'string' ? JSON.parse(draftRows[0].data) : (draftRows[0].data ?? {}))
          : {};

        const productStr = String(proj.product ?? '').trim();
        const reportProduct = {
          product_name: productStr || String(proj.title ?? '').trim(),
          category: String((proj as any).category ?? '').trim() || productStr || '제품/서비스',
          target_audience: String(proj.target_audience ?? '').trim() || '타깃 미상',
          core_offer: String(proj.core_offer ?? productStr).trim() || productStr,
        };
        const discoveryProduct = { ...reportProduct, business_goal: String(proj.business_goal ?? 'brand_growth').trim() };
        const target = reportProduct.target_audience;

        // key_content_draft에서 풀링 탐색 컨텍스트(현상 후보·검색축) 추출.
        const dctx = (() => {
          const d: any = draft || {};
          const itemFeatures = (d.step2_item_fb?.features ?? []).map((f: any) => f?.item).filter((s: any): s is string => typeof s === 'string' && s.trim() !== '');
          const itemBenefits = (d.step2_item_fb?.benefits ?? []).map((b: any) => b?.item).filter((s: any): s is string => typeof s === 'string' && s.trim() !== '');
          const problems = (d.step4_problems?.item_problem_candidates ?? []).map((p: any) => p?.problem).filter((s: any): s is string => typeof s === 'string' && s.trim() !== '');
          const searchAxes = [
            ...(d.step7_search_keywords?.problem_keywords ?? []),
            ...(d.step7_search_keywords?.category_name_keywords ?? []),
            ...(d.step7_search_keywords?.item_feature_benefit_keywords ?? []),
          ].filter((s: any, i: number, a: any[]) => typeof s === 'string' && s.trim() !== '' && a.indexOf(s) === i);
          return {
            category: String(d.step1_generalization?.customer_problem_category ?? reportProduct.category),
            entryStage: String(d.step6_entry_decision?.selected_entry_stage ?? '욕구'),
            itemFeatures,
            itemBenefits,
            problems,
            searchAxes,
          };
        })();

        const keyContent = {
          key_topic_title,
          recommended_video_id: choice.recommended_video_id ?? null,
          funnel_desire: String(asl.desire_to_trigger ?? '').trim() || undefined,
          funnel_plan: String(asl.plan_user_makes ?? '').trim() || undefined,
          funnel_action: String(asl.action_to_our_product ?? '').trim() || undefined,
          funnel_reward: String(asl.reward_user_expects ?? '').trim() || undefined,
        };

        if (_discoveryInFlight) {
          ctx.throw(409, 'another discovery is in flight (CDP chrome is single-tenant); retry shortly');
        }
        _discoveryInFlight = true;

        let cdpSession: any = null;
        let report: any;
        try {
          const yt: any = await import(
            path.resolve(__dirname, '../../../../../../../services/youtube/dist/index.js')
          );
          const creds = yt.loadCredentials();
          const client = new yt.YouTubeClient(creds);
          // 클러스터링은 큰 입력/출력이라 여유 타임아웃(240s에 끊겨 단일주제로 폴백된 실측 버그 방지).
          const sonnet = createClaudeCLIClient({ model: 'sonnet', timeoutMs: 360_000 });
          const llmComplete = (pr: string) => sonnet.complete({ system: '', user: pr });

          const reportNotes: string[] = [];
          let extensionAdapter: any;
          for (let attempt = 0; attempt < 2 && !cdpSession; attempt += 1) {
            try {
              cdpSession = await yt.connectCdp({ endpoint: yt.DEFAULT_CDP_ENDPOINT });
            } catch (e: any) {
              if (attempt === 1) reportNotes.push(`CDP 연결 실패 — 성과도/기여도/노출확률 미수집(조회수만): ${e?.message ?? String(e)}`);
            }
          }
          // ★ 후보 소스 = viewtrap 검색(워크플로우 §6). 검색어 입력 → 확인 팝업 클릭 → 65초 대기 →
          //   결과 테이블(노출확률·성과도·기여도·조회수 완비) → 노출확률 버튼 → 50초 수집.
          //   노출확률 없는 영상은 후보에서 제외(사장님 지시). YouTube API는 길이/댓글/채널 보강.
          if (!cdpSession) {
            ctx.throw(400, 'viewtrap 노출확률 수집은 CDP 크롬이 필요합니다 — app.viewtrap.com 탭을 열어두세요');
          }
          reportNotes.push('viewtrap 라이브 — 검색→노출확률 수집(후보 소스). 노출확률 없는 영상 제외.');

          // viewtrap 검색은 trusted 키 입력(Enter)이 활성 창을 요구 → 검색 동안만 창을 화면에 띄운다.
          // (화면 밖/minimized에선 검색이 트리거되지 않아 0행이 되는 실측 버그 방지. 끝나면 다시 숨김.)
          const vtPage = cdpSession.context.pages().find((p: any) => p.url().includes('app.viewtrap.com'));
          if (vtPage) { try { await vtPage.bringOnscreen(); } catch { /* ignore */ } }

          // 검색어 1개 → viewtrap 검색 + 노출확률 → 후보 영상[](노출확률 있는 것만).
          const discover = async (keyword: string) => {
            let rows: any[] = [];
            try {
              rows = await yt.scrapeVideoSearchTable(cdpSession, keyword, { resultWaitMs: 65_000, settleMs: 2_500, timeoutMs: 25_000 });
            } catch (e: any) {
              reportNotes.push(`viewtrap 검색 실패("${keyword}"): ${e?.message ?? String(e)}`);
              return [];
            }
            if (rows.length === 0) {
              // 조용한 0행 = 탭 부재/로그인 풀림/검색 미트리거의 전형 — 진단 노트 필수(2026-06-11).
              reportNotes.push(`viewtrap 검색 0행("${keyword}") — 탭/로그인/검색 트리거 상태 확인 필요`);
              return [];
            }
            // 검색 결과 테이블 안정화 대기 후 노출확률 분석(viewtrap 서버 분석이 14~60s 들쭉날쭉 → 70s 대기).
            await new Promise((r) => setTimeout(r, 3_000));
            try {
              rows = await yt.clickExposureProbability(cdpSession, rows, { waitMs: 70_000 });
            } catch (e: any) {
              reportNotes.push(`노출확률 수집 실패("${keyword}"): ${e?.message ?? String(e)}`);
            }
            // 노출확률 있는 영상만 후보로(사장님 지시: 노출확률 없는건 평가 제외).
            // 단 해당 검색에서 노출확률 분석이 통째로 미완(viewtrap 서버 지연)이면, 빈 결과를 막기 위해
            // 성과도/기여도로 평가하는 폴백(노트로 표시).
            const withExpo = rows.filter((r: any) => r.exposure !== null && r.exposure !== undefined);
            const kept = withExpo.length > 0 ? withExpo : rows;
            if (withExpo.length === 0 && rows.length > 0) {
              reportNotes.push(`"${keyword}": 노출확률 분석 미완(viewtrap 지연) — 성과도/기여도로 평가(폴백)`);
            }
            // 채널명은 viewtrap 행에 없으니 YouTube로 보강(표시용).
            const titleMap = new Map<string, string>();
            try {
              const stats = await client.getVideoStats(kept.map((r: any) => r.videoId));
              for (const s of stats) titleMap.set(s.videoId, s.channelTitle ?? '');
            } catch { /* graceful */ }
            return kept.map((r: any) => ({
              videoId: r.videoId,
              title: r.title,
              channelTitle: titleMap.get(r.videoId) ?? '',
              viewCount: r.views ?? 0,
              metrics: { 성과도: r.performance, 기여도: r.contribution, 노출확률: r.exposure },
            }));
          };
          const getDurations = (ids: string[]) => client.getVideoDurations(ids);
          const getComments = (id: string) => client.getTopComments(id, 8);
          // 채널 보정(channels.list) — videoId→channelId+조회수 재조회 후 채널 평균 대비 outlier.
          const getChannelAdj = async (ids: string[]): Promise<Record<string, number>> => {
            const out: Record<string, number> = {};
            try {
              const stats = await client.getVideoStats(ids);
              const chIds = [...new Set(stats.map((s: any) => s.channelId).filter(Boolean))];
              const chStats = await client.getChannelStats(chIds);
              const chAvg = new Map<string, number>(chStats.map((c: any) => [c.channelId, c.avgViewsPerVideo]));
              for (const s of stats) out[s.videoId] = computeChannelOutlier(s.viewCount, chAvg.get(s.channelId) ?? 0);
            } catch { /* graceful: 채널 보정 실패는 중립 유지 */ }
            return out;
          };

          // viewtrap은 최소한만(신용 차감) — 핵심 검색어 6개로 제한(사장님 지시: 뷰트랩 최소한).
          report = await runPullingContentReport(
            { product: reportProduct, keyContent, draftContext: dctx, maxKeywords: 6, targetTopics: 5, extraNotes: reportNotes },
            { discover, getDurations, getComments, getChannelAdj, llmComplete },
          );
          // 검색 끝 — 창을 다시 화면 밖으로 숨긴다(사장님 선호: 창 숨겨서 운전).
          if (vtPage) { try { await vtPage.moveOffscreen(); } catch { /* ignore */ } }
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        } finally {
          if (cdpSession) {
            try { await cdpSession.browser.close(); } catch { /* ignore */ }
          }
          _discoveryInFlight = false;
        }

        await upsertVideoRoomCard(
          db,
          project_id,
          'pulling_content_report',
          `pulling_content_report (${report.provenance.topics_selected} topics / ${report.search_summary.qualified_count} videos)`,
          report,
        );

        // 새 보고서 흐름 배선(2026-06-11): 보고서 승인 경로는 commitPullingPlan을 거치지
        // 않으므로, downstream(proposeTitleDevelopment 등)이 읽는 'pulling_plan' 카드를
        // 보고서 topics에서 자동 커밋한다(key_content_choice 자동 커밋과 동일 패턴).
        try {
          const reportTopics: any[] = Array.isArray((report as any).topics) ? (report as any).topics : [];
          if (reportTopics.length > 0) {
            const planTopics = reportTopics
              .slice()
              .sort((a, b) => Number(a?.rank ?? 0) - Number(b?.rank ?? 0))
              .map((t, i) => ({
                id: `pulling-content-${Number(t?.rank ?? i + 1)}`,
                order: Number(t?.rank ?? i + 1),
                title: String(t?.topic_name ?? '').trim(),
                selection_reasons: {
                  consumer_stage: String(t?.funnel?.phenomenon ?? t?.target_phenomenon ?? '현상'),
                  bridge_to_key: String(
                    t?.created_desire
                      ? `${t.created_desire} → 키 콘텐츠 "${t?.linked_key_content ?? (report as any).key_content_title ?? ''}"로 연결`
                      : `키 콘텐츠 "${t?.linked_key_content ?? (report as any).key_content_title ?? ''}"로 연결`,
                  ),
                  search_demand: String(t?.selection_reason ?? '실데이터 발굴 기반'),
                  problem_addressed: String(t?.target_phenomenon ?? t?.selection_reason ?? ''),
                },
              }))
              .filter((t) => t.title);
            if (planTopics.length > 0) {
              await upsertVideoRoomCard(
                db,
                project_id,
                'pulling_plan',
                `pulling_plan: ${planTopics.length}개 주제 (보고서 자동 커밋)`,
                {
                  key_topic_title: String((report as any).key_content_title ?? ''),
                  pulling_topics: planTopics,
                  source: 'pulling_content_report',
                },
              );
            }
          }
        } catch {
          // 카드 자동 커밋 실패는 보고서 응답을 막지 않는다(수동 commitPullingPlan 폴백 가능).
        }

        ctx.body = { ok: true, data: report };
        await next();
      },

      // POST /api/cmo:commitPullingPlan  { project_id }
      // R1 풀링 확정: pulling_candidates + key_content_choice를 읽어 finalizePullingPlan →
      // pulling_plan 카드 저장 + 상태를 다음(제작) 단계로 advance.
      commitPullingPlan: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        // 풀링 후보 카드 로드.
        const candRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'pulling_candidates' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (!candRows[0]) ctx.throw(404, 'pulling_candidates 카드가 없습니다. proposePullingCandidates를 먼저 호출하세요.');
        const candData = typeof candRows[0].data === 'string' ? JSON.parse(candRows[0].data) : (candRows[0].data ?? {});
        const candidates = candData.candidates ?? [];

        // 선택된 키 콘텐츠 로드(key_topic_title).
        const choiceRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_choice' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (!choiceRows[0]) ctx.throw(404, 'key_content_choice 카드가 없습니다.');
        const choice = typeof choiceRows[0].data === 'string' ? JSON.parse(choiceRows[0].data) : (choiceRows[0].data ?? {});
        const key_topic_title = String(choice.key_topic_title ?? '').trim();

        let plan: any;
        try {
          plan = finalizePullingPlan({ key_topic_title, candidates });
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        // 확정 카드 저장.
        await upsertVideoRoomCard(
          db,
          project_id,
          'pulling_plan',
          `pulling_plan: ${plan.pulling_topics.length}개 주제`,
          plan,
        );

        // 다음(제작) 단계로 상태 진입(selectKeyContentCandidate와 동일 패턴).
        const projRows = await q(`SELECT status FROM video_room_projects WHERE id = $1`, [project_id]);
        let newStatus: string | null = null;
        if (projRows[0]) {
          newStatus = advanceVideoRoomStatus(projRows[0].status);
          const newPage = pageForStatus(newStatus);
          await db.sequelize.query(
            `UPDATE video_room_projects SET status = $1, current_page = $2, "updatedAt" = now() WHERE id = $3`,
            { bind: [newStatus, newPage, project_id] },
          );
        }

        ctx.body = { ok: true, data: { key_topic_title: plan.key_topic_title, pulling_topics: plan.pulling_topics } };
        await next();
      },

      // POST /api/cmo:proposeThumbnailPlanDraft  { project_id }
      // R4 제작: 확정 키콘텐츠/풀링 + 전략 컨텍스트 → 썸네일 후보 카드 'thumbnail_plan' upsert.
      // (상태 thumbnail_pattern_extraction 구간. advance는 commitThumbnailPlan이 수행.)
      proposeThumbnailPlanDraft: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        // 확정 키 콘텐츠 로드(content_id/topic_title 입력).
        const choiceRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_choice' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (!choiceRows[0]) ctx.throw(404, 'key_content_choice 카드가 없습니다. selectKeyContentCandidate를 먼저 호출하세요.');
        const choice = typeof choiceRows[0].data === 'string' ? JSON.parse(choiceRows[0].data) : (choiceRows[0].data ?? {});
        const topic_title = String(choice.key_topic_title ?? choice.selected?.title ?? '').trim();
        if (!topic_title) ctx.throw(400, 'key_content_choice 카드에 key_topic_title이 없습니다.');
        const content_id = String(choice.selected?.id ?? 'key-content').trim();
        const thumbnail_direction = String(choice.selected?.thumbnail_promise ?? '').trim();

        // 전략 카드(있으면) 위험메모 컨텍스트.
        const stratRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'strategy' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        const strat = stratRows[0]
          ? (typeof stratRows[0].data === 'string' ? JSON.parse(stratRows[0].data) : (stratRows[0].data ?? {}))
          : {};
        const risk_notes = Array.isArray(strat.risk_notes) ? strat.risk_notes : [];

        const llm = buildLLMClient('');
        const llmComplete = (p: string) => llm.complete({ system: '', user: p });

        let result: any;
        try {
          result = await proposeThumbnailDraft(
            { content_id, topic_title, thumbnail_direction, risk_notes },
            { llmComplete },
            3,
          );
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        await upsertVideoRoomCard(
          db,
          project_id,
          'thumbnail_plan',
          `thumbnail_plan (${result.candidates.length}개 후보)`,
          result,
        );

        ctx.body = { ok: true, data: result };
        await next();
      },

      // POST /api/cmo:proposeThumbnailMatrix  { project_id, title, main_click_reason,
      //   target_audience?, target_problem?, target_desire?, target_loss_to_avoid?,
      //   channel_audience_profile?, reference_patterns?, deterministic? }
      // 썸네일 9개 A/B PRD Stage A+B: 9개 매트릭스 후보 + 후보별 심리분석을 생성해
      // 'thumbnail_matrix' 카드로 저장(사장님 승인 G1 대상). thumbnail_pattern_extraction 구간 확장.
      // B2: channel_audience_profile("내 채널에 모인 사람")을 ThumbnailMatrixInput으로 전달.
      // B1⑥: reference_patterns 미입력이면 thumbnail_reference_patterns 카드에서 자동 로드.
      proposeThumbnailMatrix: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        const title = String(v.title ?? '').trim();
        const main_click_reason = String(v.main_click_reason ?? '').trim();
        if (!title) ctx.throw(400, 'title is required');
        if (!main_click_reason) ctx.throw(400, 'main_click_reason is required');

        // reference_patterns: 명시 입력 우선, 없으면 learnThumbnailReferences가 저장한 카드(있을 때만).
        let reference_patterns = Array.isArray(v.reference_patterns) ? v.reference_patterns : [];
        let reference_patterns_source: 'input' | 'thumbnail_reference_patterns_card' | 'none' =
          reference_patterns.length > 0 ? 'input' : 'none';
        if (reference_patterns.length === 0) {
          const learned = await loadCardData(project_id, 'thumbnail_reference_patterns');
          if (learned && Array.isArray(learned.patterns) && learned.patterns.length > 0) {
            reference_patterns = learned.patterns;
            reference_patterns_source = 'thumbnail_reference_patterns_card';
          }
        }

        const channel_audience_profile = String(v.channel_audience_profile ?? '').trim();
        const input = {
          video_id: project_id,
          title,
          main_click_reason,
          target_audience: String(v.target_audience ?? '').trim(),
          target_problem: String(v.target_problem ?? '').trim(),
          target_desire: String(v.target_desire ?? '').trim(),
          target_loss_to_avoid: String(v.target_loss_to_avoid ?? '').trim(),
          reference_patterns,
          ...(channel_audience_profile ? { channel_audience_profile } : {}),
        };
        // deterministic=true면 LLM 없이 결정론 폴백(테스트/빠른 초안). 아니면 Claude CLI 주입.
        const llmComplete = v.deterministic
          ? undefined
          : (p: string) => buildLLMClient('').complete({ system: '', user: p });

        let result: any;
        try {
          result = await proposeThumbnailSet(input, llmComplete ? { llmComplete } : {});
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        const matrixPayload = { ...result, reference_patterns_source };
        await upsertVideoRoomCard(
          db,
          project_id,
          'thumbnail_matrix',
          `thumbnail_matrix (${result.candidates.length}개 후보 · ${result.source})`,
          matrixPayload,
        );

        ctx.body = { ok: true, data: matrixPayload };
        await next();
      },

      // POST /api/cmo:recordImageSources  { project_id, hits: RawImageHit[] }
      // §5/§7 이미지 소싱: 제공된 이미지 후보(수동/스크래퍼 hits)에 위험도 자동 분류 + 출처표기
      // 블록을 부여해 'image_sources' 카드로 저장. 실 스크래퍼는 엣지 어댑터(followup).
      recordImageSources: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        const hits = Array.isArray(v.hits) ? v.hits : [];
        if (hits.length === 0) ctx.throw(400, 'hits (이미지 후보 배열) is required');

        let sources: any[];
        try {
          // 제공된 hits를 그대로 돌려주는 인라인 어댑터로 도메인 분류 로직 재사용.
          const adapter = { search: async () => hits };
          sources = await collectImageSources('', hits.length, { adapter, idPrefix: project_id });
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }
        const attribution_block = buildAttributionBlock(sources);
        const payload = { sources, attribution_block };

        await upsertVideoRoomCard(
          db,
          project_id,
          'image_sources',
          `image_sources (${sources.length}개 · critical ${sources.filter((s: any) => s.risk_level === 'critical').length})`,
          payload,
        );

        ctx.body = { ok: true, data: payload };
        await next();
      },

      // POST /api/cmo:commitThumbnailPlan  { project_id, candidate_id }
      // R4 제작: 사장님이 썸네일 후보 1개 택1 → 'thumbnail_choice' 저장 + 상태 advance.
      commitThumbnailPlan: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const candidate_id = String(v.candidate_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (!candidate_id) ctx.throw(400, 'candidate_id is required');

        const planRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'thumbnail_plan' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (!planRows[0]) ctx.throw(404, 'thumbnail_plan 카드가 없습니다. proposeThumbnailPlanDraft를 먼저 호출하세요.');
        const plan = typeof planRows[0].data === 'string' ? JSON.parse(planRows[0].data) : (planRows[0].data ?? {});
        const selected = (plan.candidates ?? []).find((c: any) => c.candidate_id === candidate_id);
        if (!selected) ctx.throw(404, `thumbnail candidate ${candidate_id} not found`);

        await upsertVideoRoomCard(
          db,
          project_id,
          'thumbnail_choice',
          `thumbnail_choice: ${selected.click_logic}`,
          { selected, thumbnail_direction: plan.thumbnail_direction },
        );

        // 다음 승인 게이트(hook_draft_approval)까지 자동 전진(2026-06-11 정책: 게이트만 수동).
        // 기존 +1 전진은 intro_30s_analysis(전진 트리거 없는 비-게이트)에서 영구 정지하는 버그.
        const newStatus = await advanceProjectUntilGate(project_id, [
          'thumbnail_pattern_extraction',
          'intro_30s_analysis',
        ]);

        ctx.body = { ok: true, data: { selected, status: newStatus } };
        await next();
      },

      // POST /api/cmo:proposeTitleDevelopment  { project_id, references?:[ref1,ref2], hot_videos?, pulling_topic?, pulling_content_id?, target_audience?, business_goal?, script_summary? }
      // 제목 디벨롭 8단계 (PRD cmo-title-development §20.1): thumbnail_pattern_extraction 단계 내부에서
      // Viewtrap 검증 레퍼런스 2개 → 교차조합 → 어색함판단 → 2~8단계 디벨롭 → 최종평가 → 'title_development' 카드 upsert.
      // 도메인 로직은 l5-core(runTitleDevelopmentWorkflow). 결과는 hook_draft_approval(승인3)·script_approval(승인4)에서 노출.
      // 갭 #2 (2026-06-11): references 미입력/2개 미만이면 discoverTitleReferences로 자동 발굴(graceful).
      // 갭 #3: hot_videos 미입력이면 collectHotVideoCandidates로 수집 주입(실패 시 미주입 폴백).
      proposeTitleDevelopment: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        let references = Array.isArray(v.references) ? v.references : [];

        // 프로젝트(타겟/목표) 로드.
        const projRows = await q(
          `SELECT target_audience, business_goal FROM video_room_projects WHERE id = $1`,
          [project_id],
        );
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const target_audience =
          String(v.target_audience ?? projRows[0].target_audience ?? '작은 브랜드 대표').trim();
        const business_goal = v.business_goal ?? projRows[0].business_goal ?? undefined;

        // 풀링 주제: 명시 입력 우선, 없으면 pulling_plan 카드 첫 주제.
        let pulling_topic = String(v.pulling_topic ?? '').trim();
        let pulling_content_id = String(v.pulling_content_id ?? '').trim();
        if (!pulling_topic) {
          const planRows = await q(
            `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'pulling_plan' ORDER BY "createdAt" DESC LIMIT 1`,
            [project_id],
          );
          const plan = planRows[0]
            ? (typeof planRows[0].data === 'string' ? JSON.parse(planRows[0].data) : (planRows[0].data ?? {}))
            : {};
          const topics = Array.isArray(plan.pulling_topics) ? plan.pulling_topics : [];
          const first = topics[0];
          pulling_topic = String(first?.title ?? first?.topic ?? plan.key_topic_title ?? '').trim();
        }
        if (!pulling_topic) {
          ctx.throw(400, 'pulling_topic이 필요합니다. 풀링 플랜을 먼저 확정하거나 pulling_topic을 입력하세요.');
        }
        if (!pulling_content_id) pulling_content_id = 'pulling-content-1';

        // ── 갭 #2: 레퍼런스 자동 발굴 (references 미입력/2개 미만일 때만) ──────────
        // YouTube API search/stats deps + (CDP 연결 성공 시) 확장 등급 실측 graceful 주입.
        // 실패해도 throw 금지 — 기존 컨벤션대로 추가 레퍼런스 요청 응답으로 폴백.
        let auto_discovered = false;
        const discovery_notes: string[] = [];
        let discovery_pool: any[] = [];
        if (references.length < 2) {
          let cdpSession: any = null;
          let cdpLockHeld = false;
          try {
            const { yt, client } = await loadYoutube();
            const search = async (query: string, maxResults?: number) => {
              const hits = await client.searchVideos(query, { maxResults: maxResults ?? 10 });
              return hits.map((h: any) => ({
                video_id: h.videoId,
                title: h.title,
                channel_title: h.channelTitle,
                url: `https://www.youtube.com/watch?v=${h.videoId}`,
              }));
            };
            const getStats = async (ids: string[]) => {
              const stats = await client.getVideoStats(ids);
              return Object.fromEntries(stats.map((s: any) => [s.videoId, s.viewCount]));
            };

            // 확장 등급 스크랩(graceful): CDP 단일 테넌트 — 발굴 lock이 비어 있을 때만 시도.
            // 연결은 1회 재시도, 사용 후 반드시 close(크롬은 launchd가 유지).
            let scrapeGrades: any;
            if (!_discoveryInFlight) {
              _discoveryInFlight = true;
              cdpLockHeld = true;
              try {
                try {
                  cdpSession = await yt.connectCdp({ endpoint: yt.DEFAULT_CDP_ENDPOINT });
                } catch {
                  cdpSession = await yt.connectCdp({ endpoint: yt.DEFAULT_CDP_ENDPOINT }); // 1회 재시도
                }
                const ext = yt.createExtensionScraperAdapter(cdpSession, {});
                const topicForScrape = pulling_topic;
                scrapeGrades = async (videos: { video_id: string; title: string }[]) => {
                  const rows = await ext.fetch(topicForScrape);
                  const byId: Record<string, { performance: string | null; contribution: string | null }> = {};
                  for (const r of rows ?? []) {
                    if (r?.videoId) byId[r.videoId] = { performance: r.performance ?? null, contribution: r.contribution ?? null };
                  }
                  const out: Record<string, { performance?: string | null; contribution?: string | null }> = {};
                  for (const vd of videos) if (byId[vd.video_id]) out[vd.video_id] = byId[vd.video_id];
                  return out;
                };
                discovery_notes.push('cdp connected — 확장 등급 실측 주입');
              } catch (cdpErr: any) {
                discovery_notes.push(`cdp unavailable — 등급 미실측(YouTube API만) 발굴: ${cdpErr?.message ?? String(cdpErr)}`);
                if (cdpSession) {
                  try { await cdpSession.browser.close(); } catch { /* ignore */ }
                  cdpSession = null;
                }
              }
            } else {
              discovery_notes.push('다른 발굴이 CDP 사용 중 — 등급 미실측(YouTube API만) 발굴');
            }

            // 적격 후보 부족 시 같은 의미 범위로 검색어를 넓히는 LLM 확장(2차 패스).
            const expandQueries = async (eq: { pulling_topic: string; target_audience: string; existing_queries: string[] }) => {
              const raw = await sonnetComplete()(
                [
                  '유튜브 검색어 확장. 아래 풀링 주제와 "같은 의미 범위"(시청자가 얻으려는 결과가 같은)의',
                  '더 일반적인(일반명사화된) 검색어 4개를 만들어라. 각 2~4어절, 조회수 많은 영상이 있을 법한 말로.',
                  '주제에서 벗어난 일반론(브랜딩 일반론/동기부여/마인드셋)은 금지.',
                  `주제: ${eq.pulling_topic}`,
                  `타깃: ${eq.target_audience}`,
                  `이미 시도한 검색어: ${eq.existing_queries.join(' / ')}`,
                  '반드시 JSON 배열만 출력: ["검색어1","검색어2","검색어3","검색어4"]',
                ].join('\n'),
              );
              const m = String(raw).match(/\[[\s\S]*\]/);
              return m ? (JSON.parse(m[0]) as string[]) : [];
            };

            const dres = await discoverTitleReferences(
              { pulling_topic, target_audience, business_goal },
              { search, getStats, expandQueries, ...(scrapeGrades ? { scrapeGrades } : {}) },
            );
            discovery_notes.push(...(dres.notes ?? []));
            discovery_pool = dres.pool ?? [];
            if (dres.ok) {
              references = dres.references;
              auto_discovered = true;
            } else {
              discovery_notes.push(`자동 발굴 미충족: ${dres.reason}`);
            }
          } catch (err: any) {
            discovery_notes.push(`자동 발굴 실패: ${err?.message ?? String(err)}`);
          } finally {
            if (cdpSession) {
              try { await cdpSession.browser.close(); } catch { /* ignore */ }
            }
            if (cdpLockHeld) _discoveryInFlight = false;
          }
        }

        if (references.length < 2) {
          // throw 금지 — 기존 검증실패 응답 컨벤션과 동일한 추가 레퍼런스 요청.
          ctx.body = {
            ok: false,
            data: {
              next_action: 'request_more_references',
              failed_references: [],
              auto_discovered: false,
              discovery_notes,
              discovery_pool,
            },
          };
          await next();
          return;
        }

        // ── 갭 #3: hot_videos graceful 수집 (미입력일 때만, 실패 시 미주입 폴백) ──
        let hot_videos: any[] | undefined =
          Array.isArray(v.hot_videos) && v.hot_videos.length > 0 ? v.hot_videos : undefined;
        let hot_videos_source: string = hot_videos ? 'founder_input' : 'none';
        if (!hot_videos) {
          try {
            const { yt, client } = await loadYoutube();
            const hot = await yt.collectHotVideoCandidates({ query: pulling_topic }, client);
            if (Array.isArray(hot?.candidates) && hot.candidates.length > 0) {
              hot_videos = hot.candidates.map((c: any) => ({
                title: c.title,
                view_count: c.view_count,
                channel_subscribers: c.subscriber_count,
                url: `https://www.youtube.com/watch?v=${c.video_id}`,
              }));
              hot_videos_source = String(hot.provenance ?? 'youtube_api_proxy');
            } else {
              hot_videos_source = 'unavailable: 후보 0건(YouTube 프록시)';
            }
          } catch (err: any) {
            // graceful — 미주입이면 도메인이 HOT_VIDEO_MISSING_NOTE 폴백으로 수행.
            hot_videos_source = `unavailable: ${err?.message ?? String(err)}`;
          }
        }

        const llm = buildLLMClient('');

        let result: any;
        try {
          result = await runTitleDevelopmentWorkflow(
            {
              video_project_id: project_id,
              pulling_content_id,
              pulling_topic,
              target_audience,
              business_goal,
              references: [references[0], references[1]],
              script_summary: v.script_summary,
              ...(hot_videos ? { hot_videos } : {}),
            },
            { llm },
          );
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        // 레퍼런스 검증 실패 (AC-01~04): 추가 레퍼런스 요청.
        if (!result.ok) {
          ctx.body = {
            ok: false,
            data: {
              next_action: result.next_action,
              failed_references: result.failed_references,
              auto_discovered,
              discovery_notes,
            },
          };
          await next();
          return;
        }

        const proposal = buildTitleDevelopmentProposal(result.run);
        await upsertVideoRoomCard(
          db,
          project_id,
          'title_development',
          proposal.summary,
          result.run,
        );

        ctx.body = {
          ok: true,
          data: {
            run: result.run,
            fallback_count: result.fallback_count,
            auto_discovered,
            hot_videos_source,
            ...(auto_discovered ? { references, discovery_notes, discovery_pool } : {}),
          },
        };
        await next();
      },

      // POST /api/cmo:proposeScriptDraft  { project_id }
      // R4 제작: 전략 brief/자료 → 도입30초 + 로직블록 + 통합원고 + QA 초안 → 'script_draft' 카드 upsert.
      // (script_planning→script_draft 구간. advance는 commitScriptDraft가 수행.)
      proposeScriptDraft: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        // 확정 키 콘텐츠(주제/콘텐츠 식별자) 로드.
        const choiceRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_choice' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (!choiceRows[0]) ctx.throw(404, 'key_content_choice 카드가 없습니다.');
        const choice = typeof choiceRows[0].data === 'string' ? JSON.parse(choiceRows[0].data) : (choiceRows[0].data ?? {});
        const topic_title = String(choice.key_topic_title ?? choice.selected?.title ?? '').trim();
        if (!topic_title) ctx.throw(400, 'key_content_choice 카드에 key_topic_title이 없습니다.');
        const content_id = String(choice.selected?.id ?? 'key-content').trim();

        // 전략 카드(있으면) brief/자료 컨텍스트.
        const stratRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'strategy' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        const strat = stratRows[0]
          ? (typeof stratRows[0].data === 'string' ? JSON.parse(stratRows[0].data) : (stratRows[0].data ?? {}))
          : {};

        const llm = buildLLMClient('');
        const llmComplete = (p: string) => llm.complete({ system: '', user: p });

        let result: any;
        try {
          result = await proposeScriptDraft(
            {
              content_id,
              content_type: 'key',
              topic_title,
              target_viewer: strat.target_viewer,
              video_promise: strat.video_promise,
              core_message: strat.core_message,
              strategic_angle: strat.strategic_angle,
              intro_direction: strat.intro_direction,
              cta: strat.cta,
              materials: Array.isArray(strat.materials) ? strat.materials : undefined,
              voc_lines: Array.isArray(strat.voc_lines) ? strat.voc_lines : undefined,
              safe_claims: Array.isArray(strat.safe_claims) ? strat.safe_claims : undefined,
              proof_points: Array.isArray(strat.proof_points) ? strat.proof_points : undefined,
              risk_notes: Array.isArray(strat.risk_notes) ? strat.risk_notes : undefined,
            },
            { llmComplete },
          );
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        await upsertVideoRoomCard(
          db,
          project_id,
          'script_draft',
          `script_draft (blocks: ${result.logic_blocks.length}, qa_pass: ${result.qa.overall_pass})`,
          result,
        );

        // 초안 완료 텔레그램 알림(best-effort — 실패가 응답에 영향 없음).
        sendPullingDraftTelegram(project_id, result.logic_blocks.length).catch(() => {
          /* graceful: 알림 실패는 무시 */
        });

        ctx.body = { ok: true, data: result };
        await next();
      },

      // POST /api/cmo:commitScriptDraft  { project_id }
      // R4 제작: 사장님 원고 승인 → 상태 advance(script_approval 게이트 전까지).
      commitScriptDraft: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        const draftRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'script_draft' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (!draftRows[0]) ctx.throw(404, 'script_draft 카드가 없습니다. proposeScriptDraft를 먼저 호출하세요.');

        // script_approval 게이트까지 자동 전진(2026-06-11 정책: 게이트만 수동).
        // 기존 +1 전진은 사장님이 승인 버튼을 2번 눌러야 게이트에 도달하는 배선 버그.
        const newStatus = await advanceProjectUntilGate(project_id, ['script_planning', 'script_draft']);

        ctx.body = { ok: true, data: { status: newStatus } };
        await next();
      },

      // POST /api/cmo:recordVideoPerformance  { project_id, performance_data }
      // R7 성과 재학습: 업로드 완료 후 사장님이 입력한 성과 지표를 저장하고,
      // 완료 인사이트를 추출해 'completion_insights' 카드에 저장한다(다음 기획 입력용).
      // 데이터 소스는 수동 입력 — 외부 분석 자동연동은 followup.
      recordVideoPerformance: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        const pd = (v.performance_data ?? {}) as Record<string, any>;

        // 1) 성과 지표 검증 (도메인).
        let record: any;
        try {
          record = recordVideoPerformance({
            project_id,
            view_count: Number(pd.view_count ?? 0),
            completion_rate: Number(pd.completion_rate ?? 0),
            ctr: Number(pd.ctr ?? 0),
            retention_notes: pd.retention_notes != null ? String(pd.retention_notes) : undefined,
            feedback: pd.feedback != null ? String(pd.feedback) : undefined,
          });
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        // 2) video_performance_metrics에 best-effort 저장(각 지표 1행).
        try {
          for (const mt of ['view_count', 'completion_rate', 'ctr'] as const) {
            await db.sequelize.query(
              `INSERT INTO video_performance_metrics (id, video_project_id, metric_type, value, data, "createdAt", "updatedAt")
               VALUES ($1,$2,$3,$4,$5, now(), now())`,
              { bind: [randomUUID(), project_id, mt, record[mt], JSON.stringify(record)] },
            );
          }
        } catch {
          // graceful: 저장 실패가 인사이트 추출/응답을 막지 않는다.
        }

        // 3) 확정 키 콘텐츠 제목 + 풀링 주제 로드(인사이트 컨텍스트).
        const choiceRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_choice' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        const choice = choiceRows[0]
          ? (typeof choiceRows[0].data === 'string' ? JSON.parse(choiceRows[0].data) : choiceRows[0].data ?? {})
          : {};
        const key_content_title = String(choice.key_topic_title ?? choice.selected?.title ?? '키 콘텐츠').trim();

        const pullingRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'pulling_plan' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        const pulling = pullingRows[0]
          ? (typeof pullingRows[0].data === 'string' ? JSON.parse(pullingRows[0].data) : pullingRows[0].data ?? {})
          : {};
        const pulling_titles: string[] = Array.isArray(pulling.pulling_topics)
          ? pulling.pulling_topics.map((t: any) => String(t.title ?? '')).filter(Boolean)
          : [];

        // 4) 완료 인사이트 추출 (LLM 미설정/실패 시 도메인 결정론 폴백).
        const llm = buildLLMClient('');
        const llmComplete = (p: string) => llm.complete({ system: '', user: p });
        let insights: any[];
        try {
          insights = await extractCompletionInsight(
            { performance: record, key_content_title, pulling_titles },
            { llmComplete },
          );
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        // 5) completion_insights 카드 저장(누적 — getCompletedVideoInsights가 읽음).
        await upsertVideoRoomCard(
          db,
          project_id,
          'completion_insights',
          `completion_insights (${insights.length}개) · ${record.summary}`,
          { performance: record, insights },
        );

        ctx.body = { ok: true, data: { performance: record, insights } };
        await next();
      },

      // POST /api/cmo:getCompletedVideoInsights  { project_id }
      // R7: 누적된 완료 인사이트를 반환(다음 기획 입력용). 카드 없으면 빈 배열.
      getCompletedVideoInsights: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        const rows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'completion_insights' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        const data = rows[0]
          ? (typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data ?? {})
          : {};
        ctx.body = {
          ok: true,
          data: { insights: data.insights ?? [], performance: data.performance ?? null },
        };
        await next();
      },

      // POST /api/cmo:learnThumbnailReferences  { project_id, query? }
      // B1-6: 같은 카테고리 고성과 썸네일 레퍼런스 수집(YouTube API) → 구성 패턴 학습(LLM) →
      // 'thumbnail_reference_patterns' 카드 upsert. proposeThumbnailMatrix가 자동 로드한다.
      learnThumbnailReferences: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        let query = String(v.query ?? '').trim();
        if (!query) query = await resolveProjectTopic(project_id);
        if (!query) ctx.throw(400, 'query가 없고 프로젝트에서 주제(풀링/키 콘텐츠/제목)도 찾지 못했습니다.');

        let refs: any[];
        try {
          const { yt, client } = await loadYoutube();
          refs = await yt.collectThumbnailReferences({ query }, client);
        } catch (err: any) {
          ctx.throw(400, `썸네일 레퍼런스 수집 실패: ${err?.message ?? String(err)}`);
        }

        // ThumbnailReference → ThumbnailReferenceInput (등급은 YouTube 프록시 단계라 미실측).
        const inputs = refs.map((r: any) => ({
          video_id: r.video_id,
          title: r.title,
          thumbnail_url: r.thumbnail_url,
          view_count: r.view_count,
        }));

        let result: any;
        try {
          result = await learnThumbnailPatternsFromReferences(inputs, { llmComplete: sonnetComplete() });
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        const payload = { query, references: refs, ...result };
        await upsertVideoRoomCard(
          db,
          project_id,
          'thumbnail_reference_patterns',
          `thumbnail_reference_patterns (${result.patterns.length}개 패턴 · ${result.source})`,
          payload,
        );

        ctx.body = { ok: true, data: payload };
        await next();
      },

      // POST /api/cmo:developThumbnailCandidate
      //   { project_id, candidate:{thumbnail_text, image_composition?}, original?:{title?, thumbnail_text?},
      //     target_problem?, target_desire?, main_click_reason?, channel_audience_profile? }
      // B1+B3+B5: 이미지 디벨롭 기술 1~5 + 제목기술(2·5·6단계) 문구 디벨롭 + (original 있으면)
      // 자가 재귀 점검(더 후킹되게 됐나?) → 'thumbnail_develop' 카드 upsert.
      developThumbnailCandidate: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        const candidate = (v.candidate && typeof v.candidate === 'object') ? v.candidate as Record<string, any> : {};
        const thumbnail_text = String(candidate.thumbnail_text ?? '').trim();
        if (!thumbnail_text) ctx.throw(400, 'candidate.thumbnail_text is required');

        const projRows = await q(
          `SELECT title, target_audience FROM video_room_projects WHERE id = $1`,
          [project_id],
        );
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const topic = await resolveProjectTopic(project_id);
        const target_audience = String(projRows[0].target_audience ?? '').trim() || '타깃 시청자';

        const developInput = {
          title: String(projRows[0].title ?? topic),
          target_audience,
          target_problem: String(v.target_problem ?? '').trim(),
          target_desire: String(v.target_desire ?? '').trim(),
          main_click_reason: String(v.main_click_reason ?? candidate.click_hypothesis ?? '').trim(),
          ...(v.channel_audience_profile
            ? { channel_audience_profile: String(v.channel_audience_profile) }
            : {}),
        };
        const deps = { llmComplete: sonnetComplete() };

        let image_develop: any;
        let text_develop: any;
        let improvement: any = null;
        try {
          image_develop = await developThumbnailImage(
            {
              candidate_id: candidate.candidate_id ? String(candidate.candidate_id) : undefined,
              thumbnail_text,
              image_composition: String(candidate.image_composition ?? ''),
            },
            developInput,
            deps,
          );
          text_develop = await developThumbnailTextWithTitleTechniques(
            { text: thumbnail_text, topic: topic || developInput.title, target_audience },
            deps,
          );
          const original = (v.original && typeof v.original === 'object') ? v.original as Record<string, any> : null;
          const originalText = String(original?.thumbnail_text ?? original?.title ?? '').trim();
          if (originalText) {
            improvement = await evaluateDevelopImprovement(
              {
                original: originalText,
                developed: thumbnail_text,
                context: `주제: ${topic || developInput.title} / 타깃: ${target_audience}`,
              },
              deps,
            );
          }
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        const payload = { candidate: { ...candidate, thumbnail_text }, image_develop, text_develop, improvement };
        await upsertVideoRoomCard(
          db,
          project_id,
          'thumbnail_develop',
          `thumbnail_develop ("${thumbnail_text}" · 이미지 ${image_develop.suggestions.length}건 · 문구 ${text_develop.candidates.length}건)`,
          payload,
        );

        ctx.body = { ok: true, data: payload };
        await next();
      },

      // POST /api/cmo:reviewThumbnail
      //   { project_id, candidate:{thumbnail_text, design_notes?, font_source?, image_composition?}, channel_audience_profile? }
      // B2+B7: 결정론 검수(글자수/폰트 라이선스/체크리스트) + (profile 있으면) 시청층 정합 LLM 판정.
      // 조회성 액션 — 카드 저장 없음(저장은 developThumbnailCandidate/commitThumbnailPlan 몫).
      reviewThumbnail: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        const candidate = (v.candidate && typeof v.candidate === 'object') ? v.candidate as Record<string, any> : {};
        const thumbnail_text = String(candidate.thumbnail_text ?? '').trim();
        if (!thumbnail_text) ctx.throw(400, 'candidate.thumbnail_text is required');
        const channel_audience_profile = String(v.channel_audience_profile ?? '').trim();

        let review: any;
        let audience_fit: any = null;
        try {
          review = reviewThumbnailCandidate({
            thumbnail_text,
            design_notes: candidate.design_notes != null ? String(candidate.design_notes) : undefined,
            ...(channel_audience_profile ? { channel_audience_profile } : {}),
            ...(candidate.font_source && typeof candidate.font_source === 'object'
              ? { font_source: candidate.font_source }
              : {}),
          });
          if (channel_audience_profile) {
            audience_fit = await judgeThumbnailAudienceFit(
              {
                thumbnail_text,
                ...(candidate.image_composition ? { image_composition: String(candidate.image_composition) } : {}),
              },
              channel_audience_profile,
              { llmComplete: sonnetComplete() },
            );
          }
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        ctx.body = { ok: true, data: { review, audience_fit } };
        await next();
      },

      // POST /api/cmo:channelFirstDiscovery  { project_id, my_terms?: string[] }
      // B6 컨설팅 절차: ① 타깃이 볼만한 채널 검색계획(LLM) → ② 상위 쿼리 2~3개로 채널 검색+통계
      // → ③ "타깃이 볼만한 채널" 선별(LLM) → 'channel_first_discovery' 카드 upsert.
      // runDiscovery와 _discoveryInFlight lock 공유(발굴 동시 실행 금지).
      channelFirstDiscovery: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (_discoveryInFlight) {
          ctx.throw(409, 'another discovery is in flight; retry shortly');
        }
        _discoveryInFlight = true;

        try {
          const projRows = await q(`SELECT * FROM video_room_projects WHERE id = $1`, [project_id]);
          if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
          const proj = projRows[0];
          const target_audience = String(proj.target_audience ?? '').trim();
          if (!target_audience) ctx.throw(400, '프로젝트에 target_audience가 없습니다.');
          const my_terms = Array.isArray(v.my_terms)
            ? v.my_terms.map((t: any) => String(t)).filter(Boolean)
            : [];
          const deps = { llmComplete: sonnetComplete() };
          const live_notes: string[] = [];

          let plan: any;
          try {
            plan = await buildChannelFirstDiscoveryPlan(
              {
                product: String(proj.product ?? proj.title ?? '').trim(),
                target_audience,
                my_terms,
              },
              deps,
            );
          } catch (err: any) {
            ctx.throw(400, err?.message ?? String(err));
          }

          // 상위 채널 쿼리 2~3개 → searchChannels + getChannelStats (쿼리별 실패는 스킵).
          let candidates: any[] = [];
          try {
            const { client } = await loadYoutube();
            const channelMap = new Map<string, any>();
            for (const query of (plan.channel_queries ?? []).slice(0, 3)) {
              try {
                const found = await client.searchChannels(String(query));
                for (const c of found ?? []) {
                  if (c?.channelId && !channelMap.has(c.channelId)) channelMap.set(c.channelId, c);
                }
              } catch (err: any) {
                live_notes.push(`채널 검색 실패(스킵): "${query}" — ${err?.message ?? String(err)}`);
              }
            }
            const ids = [...channelMap.keys()].slice(0, 50);
            let statsById: Record<string, any> = {};
            if (ids.length > 0) {
              try {
                const stats = await client.getChannelStats(ids);
                statsById = Object.fromEntries((stats ?? []).map((s: any) => [s.channelId, s]));
              } catch (err: any) {
                live_notes.push(`채널 통계 조회 실패 — 구독자 미상으로 진행: ${err?.message ?? String(err)}`);
              }
            }
            candidates = [...channelMap.values()].map((c: any) => ({
              channel_id: c.channelId,
              name: c.title,
              description: c.description || undefined,
              subscribers: statsById[c.channelId]?.subscriberCount ?? undefined,
            }));
          } catch (err: any) {
            live_notes.push(`YouTube 클라이언트 불가 — 계획만 반환: ${err?.message ?? String(err)}`);
          }

          let selection: any;
          try {
            selection = await selectAudienceChannels(candidates, { target_audience }, deps);
          } catch (err: any) {
            ctx.throw(400, err?.message ?? String(err));
          }

          const payload = { plan, candidates, selection, live_notes };
          await upsertVideoRoomCard(
            db,
            project_id,
            'channel_first_discovery',
            `channel_first_discovery (후보 ${candidates.length}개 · 선별 ${selection.selected.length}개 · ${selection.source})`,
            payload,
          );

          ctx.body = { ok: true, data: payload };
        } finally {
          _discoveryInFlight = false;
        }
        await next();
      },

      // POST /api/cmo:evaluateHookAlignment  { project_id, thumbnail_score?, intro_text? }
      // B4 "썸네일이 9점이면 도입부도 9점": 도입부 후킹 강도(LLM 채점) + 썸네일 점수와의
      // 강도 정합(결정론) → 'hook_alignment' 카드 upsert. 미입력 값은 프로젝트 카드에서 탐색(없으면 null).
      evaluateHookAlignment: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        // intro_text: 명시 입력 → script_draft 카드 intro_30s 폴백 → null.
        let intro_text = String(v.intro_text ?? '').trim();
        let intro_text_source = intro_text ? 'input' : 'none';
        if (!intro_text) {
          const scriptDraft = await loadCardData(project_id, 'script_draft');
          const intro = scriptDraft?.intro_30s ?? null;
          if (intro) {
            intro_text = [intro.first_sentence, intro.viewer_promise, intro.full_text]
              .map((s: any) => String(s ?? '').trim())
              .filter(Boolean)
              .join(' ');
            if (intro_text) intro_text_source = 'script_draft_card';
          }
        }

        // thumbnail_score: 명시 입력 → hook_alignment/카드 내 기존 점수 탐색 → null.
        let thumbnail_score: number | null =
          v.thumbnail_score != null && Number.isFinite(Number(v.thumbnail_score))
            ? Number(v.thumbnail_score)
            : null;
        if (thumbnail_score == null) {
          const prevAlignment = await loadCardData(project_id, 'hook_alignment');
          if (prevAlignment?.thumbnail_score != null && Number.isFinite(Number(prevAlignment.thumbnail_score))) {
            thumbnail_score = Number(prevAlignment.thumbnail_score);
          }
        }

        let intro_hook: any;
        try {
          intro_hook = intro_text
            ? await scoreIntroHookStrength({ intro_text }, { llmComplete: sonnetComplete() })
            : { score: null, reason: '도입부 텍스트 없음 — script_draft 카드에도 intro_30s 미존재', source: 'fallback' };
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }
        const alignment = evaluateHookIntensityAlignment({
          thumbnail_score,
          intro_score: intro_hook.score,
        });

        const payload = { thumbnail_score, intro_text: intro_text || null, intro_text_source, intro_hook, alignment };
        await upsertVideoRoomCard(
          db,
          project_id,
          'hook_alignment',
          `hook_alignment (${alignment.status} · 썸네일 ${thumbnail_score ?? '-'} / 도입부 ${intro_hook.score ?? '-'})`,
          payload,
        );

        ctx.body = { ok: true, data: payload };
        await next();
      },

      // POST /api/cmo:checkSwapSignals  { project_id, video_id?, uploaded_at? }
      // 갭 #10+#11 업로드 후 모니터링: YouTube Analytics 성과 수집 + Reporting API 노출/CTR(graceful)
      // → 제목 교체 신호(shouldSwapTitle) + 썸네일 교체 신호(evaluateThumbnailSwapSignal)
      // → 교체 권장 발생 시 텔레그램 알림(best-effort) → 'swap_signals' 카드 upsert.
      checkSwapSignals: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');

        // video_id/uploaded_at: 명시 입력 → upload_draft 카드(publishUpload가 저장) 폴백.
        const uploadCard = await loadCardData(project_id, 'upload_draft');
        const video_id = String(v.video_id ?? uploadCard?.video_id ?? '').trim();
        if (!video_id) {
          ctx.throw(400, 'video_id가 없습니다. publishUpload 이후이거나 video_id를 직접 넘기세요.');
        }
        const uploadedAtRaw = String(v.uploaded_at ?? uploadCard?.published_at ?? uploadCard?.uploaded_at ?? '').trim();
        const uploadedAtMs = uploadedAtRaw ? Date.parse(uploadedAtRaw) : NaN;
        if (!Number.isFinite(uploadedAtMs)) {
          ctx.throw(400, 'uploaded_at이 없습니다(ISO 문자열). publishUpload 이후이거나 uploaded_at을 직접 넘기세요.');
        }
        const nowMs = Date.now();
        const days_since_upload = Math.max(0, Math.floor((nowMs - uploadedAtMs) / 86_400_000));
        const startDate = new Date(uploadedAtMs).toISOString().slice(0, 10);
        const endDate = new Date(nowMs).toISOString().slice(0, 10);
        const notes: string[] = [];

        // 1) 업로드 이후 구간 성과 수집 (graceful — 실패 시 조회수 0 + 사유 기록).
        let metrics: any = null;
        let reach: any = null;
        let yt: any = null;
        let creds: any = null;
        try {
          const loaded = await loadYoutube();
          yt = loaded.yt;
          creds = loaded.creds;
          try {
            const collection = await yt.collectVideoPerformance(loaded.client, {
              startDate,
              endDate,
              videoIds: [video_id],
            });
            const parsed = parseVideoAnalyticsRecords(collection.records ?? []);
            metrics = parsed.find((m: any) => m.video_id === video_id) ?? parsed[0] ?? null;
            if (collection.scope === 'channel') notes.push('video 디멘전 실패 — 채널 합계 폴백 지표');
          } catch (err: any) {
            notes.push(`Analytics 수집 실패 — 조회수 0으로 보수 평가: ${err?.message ?? String(err)}`);
          }
          // 2) Reporting API 노출/CTR (graceful — 미등록/대기/실패 모두 null 허용).
          try {
            const reporting = new yt.ReportingClient(creds);
            const r = await reporting.collectImpressionsCtr([video_id]);
            const e = r?.byVideo?.[video_id];
            if (e) reach = { impressions: e.impressions ?? null, impression_ctr: e.impressionCtr ?? null };
            if (r?.note) notes.push(`reach: ${r.note}`);
          } catch (err: any) {
            notes.push(`노출/CTR 수집 실패(graceful): ${err?.message ?? String(err)}`);
          }
        } catch (err: any) {
          notes.push(`YouTube 클라이언트 불가 — 실측 없이 보수 평가: ${err?.message ?? String(err)}`);
        }

        const performance_input = metrics
          ? mapAnalyticsToPerformanceInput({
              project_id,
              metrics,
              range: `${startDate}..${endDate}`,
              ...(reach ? { reach } : {}),
            })
          : null;
        const views = Number(metrics?.views ?? 0);

        // 3) 교체 신호 (결정론 도메인).
        let title_signal: any;
        let thumbnail_signal: any;
        try {
          title_signal = shouldSwapTitle({ days_since_upload, views });
          thumbnail_signal = evaluateThumbnailSwapSignal({ days_since_upload, views });
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        // 4) 교체 권장 발생 시 텔레그램 알림 (best-effort, env 없으면 스킵 노트).
        const swapRecommended =
          title_signal.action === 'swap_recommended' || thumbnail_signal.action === 'swap_recommended';
        let telegram: 'sent' | 'skipped_no_env' | 'failed' | 'not_needed' = 'not_needed';
        if (swapRecommended) {
          telegram = await sendSwapSignalTelegram(project_id, video_id, [
            `제목: ${title_signal.action} — ${title_signal.reason}`,
            `썸네일: ${thumbnail_signal.action} — ${thumbnail_signal.reason}`,
          ]);
          if (telegram === 'skipped_no_env') notes.push('텔레그램 env(TELEGRAM_BOT_TOKEN/CHAT_ID) 미설정 — 알림 스킵');
        }

        const payload = {
          video_id,
          uploaded_at: new Date(uploadedAtMs).toISOString(),
          days_since_upload,
          range: `${startDate}..${endDate}`,
          views,
          metrics,
          reach,
          performance_input,
          title_signal,
          thumbnail_signal,
          telegram,
          notes,
        };
        await upsertVideoRoomCard(
          db,
          project_id,
          'swap_signals',
          `swap_signals (D+${days_since_upload} · 제목 ${title_signal.action} · 썸네일 ${thumbnail_signal.action})`,
          payload,
        );

        ctx.body = { ok: true, data: payload };
        await next();
      },

      // POST /api/cmo:publishUpload  { project_id, confirm: true, visibility?, publish_at? }
      // 갭 #9 — 실제 YouTube 업로드(videos.insert).
      // ⚠️ 위험도 D3 외부 액션: 절대 자동 트리거(스케줄러/훅/advance 체인)에 연결하지 말 것.
      //    Founder가 업로드 승인 게이트(upload_approval) 통과 후 confirm:true로 명시 호출할 때만 실행.
      publishUpload: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        if (!project_id) ctx.throw(400, 'project_id is required');
        // 가드 1: 명시 confirm 필수 (D3 — 외부 고객 노출 액션).
        if (v.confirm !== true) {
          ctx.throw(400, 'confirm: true가 필요합니다 (D3 외부 액션 — 명시 확인 없이는 업로드하지 않음)');
        }
        const visibility = ['private', 'public', 'unlisted'].includes(String(v.visibility ?? ''))
          ? (String(v.visibility) as 'private' | 'public' | 'unlisted')
          : 'private';

        // 가드 2: 승인 게이트 — status가 upload_approval(승인 대기 게이트) 또는 completed가 아니면 403.
        const projRows = await q(`SELECT status FROM video_room_projects WHERE id = $1`, [project_id]);
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const projStatus = String(projRows[0].status);
        if (projStatus !== 'upload_approval' && projStatus !== 'completed') {
          ctx.throw(403, `status ${projStatus} — upload_approval 게이트 도달 후에만 업로드할 수 있습니다`);
        }

        // 가드 3: 업로드 초안 카드 필수.
        const draftRows = await q(
          `SELECT id, data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'upload_draft' ORDER BY "createdAt" DESC LIMIT 1`,
          [project_id],
        );
        if (!draftRows[0]) ctx.throw(400, 'upload_draft 카드가 없습니다. createUploadDraft를 먼저 호출하세요.');
        const draft = typeof draftRows[0].data === 'string' ? JSON.parse(draftRows[0].data) : (draftRows[0].data ?? {});
        const title = String(draft.title ?? '').trim();
        if (!title) ctx.throw(400, 'upload_draft 카드에 title이 없습니다.');

        // 렌더 산출물(video.mp4) 확인 — getRenderStatus와 동일한 factory outputs 경로 로직 재사용.
        const renderCard = await loadCardData(project_id, 'rendering');
        const slug = String(v.slug ?? renderCard?.factory_slug ?? '').trim();
        if (!slug) ctx.throw(400, 'factory_slug를 알 수 없습니다. submitRender(실 factory)를 먼저 진행하세요.');
        if (!_videoFactoryTransport || typeof (_videoFactoryTransport as any).getRenderJobStatus !== 'function') {
          ctx.throw(400, '팩토리 디렉토리가 없어 렌더 산출물을 확인할 수 없습니다 (VIDEO_FACTORY_DIR 미설정).');
        }
        const renderRes = await (_videoFactoryTransport as any).getRenderJobStatus(slug);
        if (!renderRes.ok) ctx.throw(400, `렌더 산출물 확인 실패: ${renderRes.error ?? 'unknown'}`);
        const observation = renderRes.observation;
        const filePath = observation?.paths?.video;
        if (!observation?.video_file_exists || !filePath) {
          ctx.throw(400, `렌더 산출물 video.mp4가 없습니다 (outputs/${slug}). 렌더 완료 후 업로드하세요.`);
        }

        // 실제 업로드 — privacyStatus 기본 'private' (publish_at 지정 시 YouTube 규칙상 private 강제).
        let uploadResult: any;
        try {
          const { yt, creds } = await loadYoutube();
          const tokenManager = new yt.TokenManager(creds);
          uploadResult = await yt.uploadVideo(
            {
              filePath,
              title,
              description: String(draft.description ?? ''),
              tags: Array.isArray(draft.tags) ? draft.tags.map(String) : undefined,
              privacyStatus: visibility,
              ...(v.publish_at ? { publishAt: String(v.publish_at) } : {}),
            },
            tokenManager,
          );
        } catch (err: any) {
          ctx.throw(400, `YouTube 업로드 실패: ${err?.message ?? String(err)}`);
        }

        // video_id를 업로드 카드에 저장 (checkSwapSignals가 읽음).
        const published_at = new Date().toISOString();
        const updatedDraft = {
          ...draft,
          video_id: uploadResult.video_id,
          privacy_status: uploadResult.privacy_status,
          published_at,
          ...(uploadResult.publish_at ? { publish_at: uploadResult.publish_at } : {}),
        };
        await db.sequelize.query(
          `UPDATE video_room_cards SET data = $1, summary = $2, "updatedAt" = now() WHERE id = $3`,
          {
            bind: [
              JSON.stringify(updatedDraft),
              `uploaded ${uploadResult.video_id} (${uploadResult.privacy_status})`,
              draftRows[0].id,
            ],
          },
        );

        // status 전진: upload_approval 게이트에서 업로드 완료 → completed.
        let new_status: string | null = null;
        if (projStatus === 'upload_approval') {
          try {
            new_status = advanceVideoRoomStatus('upload_approval', { gateApproved: true });
            await db.sequelize.query(
              `UPDATE video_room_projects SET status = $1, current_page = $2, "updatedAt" = now() WHERE id = $3`,
              { bind: [new_status, pageForStatus(new_status), project_id] },
            );
          } catch {
            new_status = null; // 전진 실패는 업로드 성공 응답을 막지 않는다.
          }
        }

        ctx.body = {
          ok: true,
          data: {
            video_id: uploadResult.video_id,
            privacy_status: uploadResult.privacy_status,
            publish_at: uploadResult.publish_at ?? null,
            published_at,
            status: new_status ?? projStatus,
          },
        };
        await next();
      },

      // POST /api/cmo:saveKeyContentStep  { project_id, step, data }
      // 사장님 편집: key_content_draft 카드의 특정 step 필드를 merge.
      saveKeyContentStep: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const step = String(v.step ?? '').trim();
        const stepData = (v.data && typeof v.data === 'object') ? v.data as Record<string, any> : {};
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (!step) ctx.throw(400, 'step is required');

        const cardRows = await q(
          `SELECT id, data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_draft' LIMIT 1`,
          [project_id],
        );
        if (!cardRows[0]) ctx.throw(404, 'key_content_draft 카드가 없습니다. proposeKeyContentDraft를 먼저 호출하세요.');

        const existing = typeof cardRows[0].data === 'string' ? JSON.parse(cardRows[0].data) : (cardRows[0].data ?? {});
        const merged = { ...existing, [step]: { ...(existing[step] ?? {}), ...stepData } };

        await db.sequelize.query(
          `UPDATE video_room_cards SET data = $1, "updatedAt" = now() WHERE id = $2`,
          { bind: [JSON.stringify(merged), cardRows[0].id] },
        );

        ctx.body = { ok: true };
        await next();
      },

      // POST /api/cmo:submitViewtrapValidation  { project_id, payload }
      // Step8: buildViewtrapValidation(payload) → key_content_viewtrap 카드 upsert.
      submitViewtrapValidation: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const payload = (v.payload && typeof v.payload === 'object') ? v.payload as Record<string, any> : {};
        if (!project_id) ctx.throw(400, 'project_id is required');

        let validation: any;
        try {
          validation = buildViewtrapValidation(payload);
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        const existingRows = await q(
          `SELECT id FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_viewtrap' LIMIT 1`,
          [project_id],
        );
        if (existingRows[0]) {
          await db.sequelize.query(
            `UPDATE video_room_cards SET data = $1, "updatedAt" = now() WHERE id = $2`,
            { bind: [JSON.stringify(validation), existingRows[0].id] },
          );
        } else {
          const card_id = randomUUID();
          await db.sequelize.query(
            `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
             VALUES ($1,$2,'key_content_viewtrap',$3,$4, now(), now())`,
            { bind: [card_id, project_id, 'key_content_viewtrap', JSON.stringify(validation)] },
          );
        }

        ctx.body = { ok: true, data: { validation } };
        await next();
      },

      // POST /api/cmo:runDiscovery
      //   { project_id, query, mode?, search_keyword?, validated_keywords?, use_viewtrap? }
      // M1~M3 통합: 발굴(YouTube API) → 통계+5만+ 필터 → CDP 라이브 크롤(2·3단계) → Sonnet 분류 → 후보.
      // 라이브 발굴: 서버가 launchd 상시 9222 CDP 크롬에 붙어
      //   - 2단계(YouTube 플러그인 deepWalk, 무료): 기본 ON.
      //   - 3단계(viewtrap 사이트 검색, 이용횟수 차감): use_viewtrap===true 일 때만 ON(기본 OFF).
      // CDP 연결 실패/viewtrap 미로그인 시 → 1단계(YouTube API)+Sonnet만으로 graceful 진행.
      // 응답 provenance + degraded note 로 어디까지 라이브였는지 명시한다. throw로 전체 실패시키지 않는다.
      runDiscovery: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const query = String(v.query ?? '').trim();
        const mode = (String(v.mode ?? 'key').trim() === 'pulling' ? 'pulling' : 'key') as
          | 'key'
          | 'pulling';
        // 3단계(viewtrap 사이트 검색)는 이용횟수가 차감되므로 명시적으로 켤 때만.
        const useViewtrap = v.use_viewtrap === true || String(v.use_viewtrap ?? '') === 'true';
        if (!project_id) ctx.throw(400, 'project_id is required');
        if (!query) ctx.throw(400, 'query is required');

        // 같은 9222 크롬을 동시 운전하면 충돌 → in-process lock으로 직렬화(이미 실행 중이면 409).
        if (_discoveryInFlight) {
          ctx.throw(409, 'another runDiscovery is in flight (CDP chrome is single-tenant); retry shortly');
        }
        _discoveryInFlight = true;

        const projRows = await q(`SELECT * FROM video_room_projects WHERE id = $1`, [project_id]);
        if (!projRows[0]) ctx.throw(404, `project ${project_id} not found`);
        const proj = projRows[0];

        const productStr = String(proj.product ?? '').trim();
        const product = {
          product_name: productStr || String(proj.title ?? '').trim(),
          category: String((proj as any).category ?? '').trim() || productStr || '제품/서비스',
          target_audience: String(proj.target_audience ?? '').trim(),
          core_offer: String(proj.core_offer ?? productStr).trim() || productStr,
          business_goal: String(proj.business_goal ?? 'brand_growth').trim(),
        };
        const target = product.target_audience || '타깃 미상';

        // 라이브 발굴 진행 중 어디까지 살아있었는지 기록(응답 note용). throw 금지 — 단계 실패는 폴백.
        const liveNotes: string[] = [];
        let cdpSession: any = null;
        let result: any;
        try {
          // 실 발굴 deps 조립 — @l5/youtube는 ESM이라 dynamic import. 자격증명/모델
          // 없으면 graceful 실패(파이프라인이 단계별 폴백하므로 후보 0개로 반환).
          let deps: any;
          try {
            const yt: any = await import(
              path.resolve(__dirname, '../../../../../../../services/youtube/dist/index.js')
            );
            const creds = yt.loadCredentials();
            const client = new yt.YouTubeClient(creds);
            // Sonnet 분류 함수 주입(모델 고정). classifyDiscoveredVideos를 감싼다.
            // 타임아웃 240s: launchd 서버 컨텍스트의 claude CLI cold-spawn은 셸보다 훨씬
            // 느리다(실측 배치 1콜 47~125s). 기본 60s면 양 attempt 모두 타임아웃 →
            // 배치 10개가 통째로 ambiguous 폴백(classified=false)되던 근본원인. (후속3 2026-06-10)
            const sonnet = createClaudeCLIClient({ model: 'sonnet', timeoutMs: 240_000 });
            const classify = (videos: any[], m: 'key' | 'pulling') =>
              classifyDiscoveredVideos(
                {
                  product,
                  target,
                  videos,
                  mode: m,
                  ...(mode === 'pulling' && proj.key_content_context
                    ? { key_content_context: String(proj.key_content_context) }
                    : {}),
                },
                { llm: sonnet },
              );

            // ── CDP 라이브 어댑터 조립(graceful) ────────────────────────────────
            // 9222 CDP 크롬에 붙어 2단계(YouTube 플러그인) 어댑터를 만든다. 실패해도 throw하지 않고
            // extension/viewtrap 미주입으로 1단계+분류만 진행한다.
            let extensionAdapter: any;
            let viewtrapAdapter: any;
            try {
              cdpSession = await yt.connectCdp({ endpoint: yt.DEFAULT_CDP_ENDPOINT });
              // 2단계(무료): YouTube 검색결과 확장 deepWalk. 항상 시도.
              extensionAdapter = yt.createExtensionScraperAdapter(cdpSession, {});
              liveNotes.push('cdp connected; stage2 (youtube extension) live');
              // 3단계(차감): viewtrap 사이트 검색 — use_viewtrap===true 일 때만. resolveExposure로
              // 노출확률 다건 보강(extension이 못 채운 영상만 deps 병합 로직이 사용).
              if (useViewtrap) {
                viewtrapAdapter = yt.createViewtrapScraperAdapter(cdpSession, {
                  transform: {
                    researchSessionId: `discovery-${project_id}`,
                    consumerStage: '현상',
                    selectedFor: mode === 'pulling' ? 'pulling_content' : 'key_content',
                  },
                  resolveExposure: true,
                });
                liveNotes.push('stage3 (viewtrap site search) enabled — consumes usage credit');
              } else {
                liveNotes.push('stage3 (viewtrap) skipped — use_viewtrap not set (credit-saving default)');
              }
            } catch (cdpErr: any) {
              // CDP 연결 실패(크롬 죽음/포트 닫힘) → 1단계+분류만. 절대 전체 실패시키지 않는다.
              liveNotes.push(`cdp unavailable — falling back to youtube-api+classify only: ${cdpErr?.message ?? String(cdpErr)}`);
              if (cdpSession) {
                try { await cdpSession.browser.close(); } catch { /* ignore */ }
                cdpSession = null;
              }
            }

            deps = yt.createLiveDiscoveryDeps({
              client,
              searchMaxResults: 25,
              classify,
              ...(extensionAdapter ? { extensionAdapter } : {}),
              ...(viewtrapAdapter ? { viewtrapAdapter } : {}),
            });
          } catch (err: any) {
            ctx.throw(400, `discovery deps unavailable: ${err?.message ?? String(err)}`);
          }

          // 파이프라인 실행. scrapeMetrics(2·3단계)가 throw해도 결과를 못 만들면 안 되므로
          // 라이브 크롤 실패는 폴백으로 흡수한다(1차 시도 후 deps에서 scrapeMetrics 제거하고 재시도).
          try {
            result = await runDiscoveryPipeline({ query, product, target, mode }, deps);
          } catch (pipeErr: any) {
            liveNotes.push(`live scrape failed — retrying without cdp metrics: ${pipeErr?.message ?? String(pipeErr)}`);
            const fallbackDeps = { ...deps };
            delete fallbackDeps.scrapeMetrics;
            result = await runDiscoveryPipeline({ query, product, target, mode }, fallbackDeps);
          }
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        } finally {
          // CDP 세션은 연결만 해제(크롬은 launchd가 유지). lock도 항상 해제.
          if (cdpSession) {
            try { await cdpSession.browser.close(); } catch { /* ignore */ }
          }
          _discoveryInFlight = false;
        }

        // 후보 → viewtrap_validation 초안(실데이터 기반 선정이유 포함).
        const candidates = (result.candidates ?? []).map((c: any) => ({
          videoId: c.videoId,
          title: c.title,
          channelTitle: c.channelTitle,
          viewCount: c.viewCount,
          metrics: c.metrics ?? null,
          verdict: c.classification?.verdict ?? 'ambiguous',
          selection_reason: buildSelectionReason(c),
        }));

        let viewtrap_validation_input: any = null;
        if (result.candidates?.length) {
          viewtrap_validation_input =
            mode === 'pulling'
              ? toPullingViewtrapValidationInput(result.candidates, {
                  searchKeyword: String(v.search_keyword ?? query),
                })
              : toKeyViewtrapValidationInput(result.candidates, {
                  validatedKeywords: Array.isArray(v.validated_keywords)
                    ? v.validated_keywords.map((s: any) => String(s))
                    : [query],
                });
        }
        const longtail_inputs =
          mode === 'pulling' && result.candidates?.length
            ? toLongtailCandidateInputs(result.candidates)
            : [];

        // 라이브 발굴이 부분만 됐으면(스크래핑/분류 누락) degraded=true. note로 사유 명시.
        const prov = result.provenance ?? {};
        const degraded = !prov.scraped || !prov.classified;
        const discoveryData = {
          mode,
          query,
          use_viewtrap: useViewtrap,
          provenance: result.provenance,
          degraded,
          live_notes: liveNotes,
          candidates,
          viewtrap_validation_input,
          longtail_inputs,
        };
        await upsertVideoRoomCard(
          db,
          project_id,
          'discovery',
          `discovery (${mode}, 후보 ${candidates.length}개)`,
          discoveryData,
        );

        ctx.body = { ok: true, data: discoveryData };
        await next();
      },

      // POST /api/cmo:commitKeyContentPlan  { project_id, payload: {title, thumbnail_promise, intro_direction, body_structure, cta} }
      // Step11: draft + viewtrap + 사장님 승인 → finalizeKeyContentPlan → key_content 카드 저장.
      commitKeyContentPlan: async (ctx: ActionContext, next: () => Promise<void>) => {
        const v = getValues(ctx);
        const project_id = String(v.project_id ?? '').trim();
        const payload = (v.payload && typeof v.payload === 'object') ? v.payload as Record<string, any> : {};
        if (!project_id) ctx.throw(400, 'project_id is required');

        // Load draft card.
        const draftRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_draft' LIMIT 1`,
          [project_id],
        );
        if (!draftRows[0]) ctx.throw(400, 'key_content_draft 카드가 없습니다.');
        const draft = typeof draftRows[0].data === 'string' ? JSON.parse(draftRows[0].data) : draftRows[0].data;

        // Load viewtrap card.
        const vtRows = await q(
          `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'key_content_viewtrap' LIMIT 1`,
          [project_id],
        );
        if (!vtRows[0]) ctx.throw(400, 'key_content_viewtrap 카드가 없습니다. submitViewtrapValidation을 먼저 호출하세요.');
        const viewtrap_validation = typeof vtRows[0].data === 'string' ? JSON.parse(vtRows[0].data) : vtRows[0].data;

        let plan: any;
        try {
          plan = finalizeKeyContentPlan({
            draft,
            viewtrap_validation,
            approved: {
              title: payload.title,
              thumbnail_promise: payload.thumbnail_promise,
              intro_direction: payload.intro_direction,
              body_structure: Array.isArray(payload.body_structure) ? payload.body_structure : [],
              cta: payload.cta,
            },
          });
        } catch (err: any) {
          ctx.throw(400, err?.message ?? String(err));
        }

        const card_id = randomUUID();
        await db.sequelize.query(
          `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
           VALUES ($1,$2,'key_content',$3,$4, now(), now())`,
          { bind: [card_id, project_id, `key_content: ${plan.step11_approved_topic?.title ?? ''}`, JSON.stringify(plan)] },
        );

        ctx.body = { ok: true, data: { approved_topic: plan.step11_approved_topic } };
        await next();
      },

      // GET /api/cmo:getStageGuides
      // 단계 진행 레일용: STAGE_SCRIPT를 { [status]: { label, focus } } 형태로 반환.
      getStageGuides: async (ctx: ActionContext, next: () => Promise<void>) => {
        const { STAGE_SCRIPT } = require(path.resolve(__dirname, '../../../../../../../packages/l5-core/dist/functions/cmo-strategy'));
        const guides: Record<string, { label: string; focus: string }> = {};
        for (const [status, entry] of Object.entries(STAGE_SCRIPT as Record<string, { label: string; focus: string; prompt: string }>)) {
          guides[status] = { label: entry.label, focus: entry.focus };
        }
        ctx.body = { ok: true, data: { guides } };
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

// Upsert a single video_room_card per (project, stage). data is JSON-serialized.
// ── VideoExecutionBrief 조립 헬퍼 (R6 파이프라인) ───────────────────────────
// script_draft 카드(proposeScriptDraft 산출물: integrated_script/intro_30s/logic_blocks)를
// content_card_id 또는 프로젝트 최신본으로 로드. JSON 컬럼은 문자열일 수 있어 파싱.
async function loadScriptDraftForBrief(
  q: (sql: string, bind: any[]) => Promise<any[]>,
  project_id: string,
  card_id: string,
): Promise<any | null> {
  let rows = await q(
    `SELECT data FROM video_room_cards WHERE id = $1 AND video_project_id = $2 AND stage = 'script_draft' ORDER BY "createdAt" DESC LIMIT 1`,
    [card_id, project_id],
  );
  if (!rows[0]) {
    rows = await q(
      `SELECT data FROM video_room_cards WHERE video_project_id = $1 AND stage = 'script_draft' ORDER BY "createdAt" DESC LIMIT 1`,
      [project_id],
    );
  }
  if (!rows[0]) return null;
  const data = rows[0].data;
  return typeof data === 'string' ? JSON.parse(data) : data;
}

// M4: 프로젝트의 최신 VideoExecutionBrief(payload)를 video_execution_briefs에서 읽는다.
// 저장 형태는 prepareFactoryHandoff가 만든 VideoExecutionBriefRecord({ brief: ... }) JSON.
async function loadLatestBriefForProject(
  q: (sql: string, bind: any[]) => Promise<any[]>,
  project_id: string,
): Promise<any | null> {
  const rows = await q(
    `SELECT brief FROM video_execution_briefs WHERE project_id = $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [project_id],
  );
  if (!rows[0]) return null;
  const stored = typeof rows[0].brief === 'string' ? JSON.parse(rows[0].brief) : rows[0].brief;
  return stored?.brief ?? stored ?? null;
}

// script_draft + 프로젝트 메타에서 CmoVideoStrategyBrief를 결정론적으로 조립한다.
// buildVideoExecutionBrief가 요구하는 필드(core_message/logic_blocks/covered_stages(영문)/
// channel_context/target_viewer)를 채운다. covered_stages는 logic_blocks에서 합산.
function buildStrategyBriefFromCards(scriptDraft: any, proj: any, content_id: string): any {
  const blocks: any[] = Array.isArray(scriptDraft?.logic_blocks) ? scriptDraft.logic_blocks : [];
  const topic = String(proj?.title ?? scriptDraft?.topic ?? '콘텐츠').trim() || '콘텐츠';
  const coreMessage =
    String(scriptDraft?.qa?.logic_block_alignment?.[0] ?? '').trim() ||
    String(blocks[0]?.main_claim ?? blocks[0]?.draft ?? '').trim() ||
    topic;

  // ScriptPart(block_id/draft) → LogicBlock 형태로 정규화.
  const logic_blocks = (blocks.length > 0 ? blocks : [{}]).map((b: any, i: number) => ({
    block_id: String(b?.block_id ?? `block-${i + 1}`),
    role: String(b?.role ?? `논리 블록 ${i + 1}`),
    covered_stages: Array.isArray(b?.covered_stages) && b.covered_stages.length > 0
      ? b.covered_stages
      : [(['phenomenon', 'desire', 'plan', 'action', 'reward'] as const)[i % 5]],
    main_claim: String(b?.main_claim ?? b?.draft ?? coreMessage).trim() || coreMessage,
    supporting_materials: Array.isArray(b?.supporting_materials) && b.supporting_materials.length > 0
      ? b.supporting_materials
      : Array.isArray(b?.used_materials) ? b.used_materials : [],
    viewer_emotion: String(b?.viewer_emotion ?? '공감과 신뢰'),
    transition_to_next_block: String(b?.transition_to_next_block ?? b?.transition_out ?? ''),
  }));

  const covered_stages = Array.from(
    new Set(logic_blocks.flatMap((b: any) => b.covered_stages)),
  );

  return {
    content_id,
    content_type: 'key',
    topic,
    channel_context: {
      current_position: '',
      content_pillar: '',
      role_in_content_set: '핵심(키) 콘텐츠',
      bridge_from_previous_content: '',
      bridge_to_next_content: '',
    },
    target_viewer: {
      who: String(proj?.target_audience ?? '타깃 시청자').trim() || '타깃 시청자',
      current_belief: '현재 문제를 충분히 인식하지 못함',
      hidden_desire: String(scriptDraft?.intro_30s?.viewer_promise ?? coreMessage),
      main_pain: String(proj?.customer_problem ?? coreMessage).trim() || coreMessage,
      objection: '효과가 없을 것이다',
      language_style: [],
    },
    consumer_desire_coverage: {
      covered_stages,
      primary_stage: covered_stages[0] ?? 'desire',
      stage_explanation: coreMessage,
    },
    video_promise: String(scriptDraft?.intro_30s?.viewer_promise ?? coreMessage),
    core_message: coreMessage,
    strategic_angle: String(scriptDraft?.intro_30s?.hook_type ?? coreMessage),
    logic_blocks,
    intro_direction: String(scriptDraft?.intro_30s?.first_sentence ?? coreMessage),
    thumbnail_direction: `${topic} 핵심 메시지를 시각화`,
    script_tone_direction: '명확하고 신뢰감 있는 설명체',
    cta: String(proj?.core_offer ?? '더 알고 싶다면 댓글로 질문해주세요').trim() || '더 알고 싶다면 댓글로 질문해주세요',
    risk_notes: Array.isArray(scriptDraft?.qa?.revision_requests) && scriptDraft.qa.revision_requests.length > 0
      ? scriptDraft.qa.revision_requests
      : ['주장 근거 출처 명시 필요'],
  };
}

async function upsertVideoRoomCard(
  db: any,
  projectId: string,
  stage: string,
  summary: string,
  data: unknown,
): Promise<void> {
  const SELECT = db.sequelize.QueryTypes.SELECT;
  const existing = await db.sequelize.query(
    `SELECT id FROM video_room_cards WHERE video_project_id = $1 AND stage = $2 LIMIT 1`,
    { bind: [projectId, stage], type: SELECT },
  );
  const payload = JSON.stringify(data);
  if (existing[0]) {
    await db.sequelize.query(
      `UPDATE video_room_cards SET data = $1, summary = $2, "updatedAt" = now() WHERE id = $3`,
      { bind: [payload, summary, existing[0].id] },
    );
  } else {
    await db.sequelize.query(
      `INSERT INTO video_room_cards (id, video_project_id, stage, summary, data, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5, now(), now())`,
      { bind: [randomUUID(), projectId, stage, summary, payload] },
    );
  }
}

// Best-effort Telegram notification when key-content topic candidates are ready.
// Reads env vars TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FOUNDER_UI_BASE_URL.
// Silent skip if env vars are absent (no throw).
async function sendKeyContentDraftTelegram(projectId: string, candidateCount: number): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  const founderUIBase = process.env.FOUNDER_UI_BASE_URL ?? 'http://localhost:3002';
  const link = `${founderUIBase}/video-room`;
  const text = `ℹ️ *키콘텐츠 주제 후보 ${candidateCount}개 생성됨 — 확인하세요*\n\nproject_id: ${projectId}\n\n🔗 ${link}`;

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

// Best-effort Telegram notification when pulling topic candidates are ready.
// Reads env vars TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FOUNDER_UI_BASE_URL.
// Silent skip if env vars are absent (no throw).
async function sendPullingDraftTelegram(projectId: string, candidateCount: number): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  const founderUIBase = process.env.FOUNDER_UI_BASE_URL ?? 'http://localhost:3002';
  const link = `${founderUIBase}/video-room`;
  const text = `ℹ️ *풀링 주제 후보 ${candidateCount}개 생성됨 — 확인하세요*\n\nproject_id: ${projectId}\n\n🔗 ${link}`;

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

// Best-effort Telegram notification when a title/thumbnail swap is recommended
// after upload (cmo:checkSwapSignals). Reads env vars TELEGRAM_BOT_TOKEN,
// TELEGRAM_CHAT_ID, FOUNDER_UI_BASE_URL. Returns the outcome so the caller can
// record a skip note (env absent) without ever throwing.
async function sendSwapSignalTelegram(
  projectId: string,
  videoId: string,
  lines: string[],
): Promise<'sent' | 'skipped_no_env' | 'failed'> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return 'skipped_no_env';

  const founderUIBase = process.env.FOUNDER_UI_BASE_URL ?? 'http://localhost:3002';
  const link = `${founderUIBase}/video-room`;
  const text = `⚠️ *업로드 후 교체 신호 — 확인하세요*\n\nproject_id: ${projectId}\nvideo: https://www.youtube.com/watch?v=${videoId}\n\n${lines.join('\n')}\n\n🔗 ${link}`;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    return 'sent';
  } catch {
    // Intentionally silent — notification failure must not affect signal state.
    return 'failed';
  }
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
