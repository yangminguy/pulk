import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const pluginSource = readFileSync(resolve(testDir, '../server/plugin.ts'), 'utf8');

describe('CMO Video Room plugin contract — source checks', () => {
  it('registers registerCmoResource and calls it from load()', () => {
    expect(pluginSource).toContain('function registerCmoResource(app: any, db: any)');
    expect(pluginSource).toContain('registerCmoResource(this.app, this.db)');
  });

  it('defines the cmo_planning_messages collection', () => {
    expect(pluginSource).toContain("name: 'cmo_planning_messages'");
  });

  it('defines the video_room_projects collection', () => {
    expect(pluginSource).toContain("name: 'video_room_projects'");
  });

  it('defines the video_room_cards collection', () => {
    expect(pluginSource).toContain("name: 'video_room_cards'");
  });

  it('defines the video_room_gates collection', () => {
    expect(pluginSource).toContain("name: 'video_room_gates'");
  });

  it('creates raw tables via CREATE TABLE IF NOT EXISTS', () => {
    expect(pluginSource).toContain('CREATE TABLE IF NOT EXISTS cmo_planning_messages');
    expect(pluginSource).toContain('CREATE TABLE IF NOT EXISTS video_room_projects');
    expect(pluginSource).toContain('CREATE TABLE IF NOT EXISTS video_room_cards');
    expect(pluginSource).toContain('CREATE TABLE IF NOT EXISTS video_room_gates');
  });

  it('grants loggedIn ACL on cmo resource actions including production pipeline', () => {
    expect(pluginSource).toContain("this.app.acl.allow('cmo'");
    expect(pluginSource).toContain("'buildSlideDeck'");
    expect(pluginSource).toContain("'submitRender'");
    expect(pluginSource).toContain("'runQA'");
    expect(pluginSource).toContain("'createUploadDraft'");
    expect(pluginSource).toContain("this.app.acl.allow('cmo_planning_messages', '*', 'loggedIn')");
  });

  it('imports runCmoStrategyTurn from l5-core dist', () => {
    expect(pluginSource).toContain('runCmoStrategyTurn');
    expect(pluginSource).toContain("dist/functions/cmo-strategy");
  });

  it('imports advanceStatus and video-room helpers from l5-core dist', () => {
    expect(pluginSource).toContain('advanceVideoRoomStatus');
    expect(pluginSource).toContain("dist/functions/video-room");
    expect(pluginSource).toContain('pageForStatus');
    expect(pluginSource).toContain('buildMiniRoadmap');
  });

  it('imports production pipeline functions from l5-core dist', () => {
    expect(pluginSource).toContain('buildSlideDeckSpec');
    expect(pluginSource).toContain('slideDeckToVideoJob');
    expect(pluginSource).toContain('createRenderJob');
    expect(pluginSource).toContain('submitRenderJob');
    expect(pluginSource).toContain('evaluateVideoRoomQA');
    expect(pluginSource).toContain('createUploadDraft');
  });

  it('has all twelve CMO actions defined', () => {
    expect(pluginSource).toContain('createProject: async');
    expect(pluginSource).toContain('listProjects: async');
    expect(pluginSource).toContain('getProject: async');
    expect(pluginSource).toContain('chatMessage: async');
    expect(pluginSource).toContain('advanceStatus: async');
    expect(pluginSource).toContain('decideGate: async');
    expect(pluginSource).toContain('approvePlan: async');
    expect(pluginSource).toContain('saveCard: async');
    expect(pluginSource).toContain('buildSlideDeck: async');
    expect(pluginSource).toContain('submitRender: async');
    expect(pluginSource).toContain('runQA: async');
    expect(pluginSource).toContain('createUploadDraft: async');
  });
});

describe('CMO Video Room — l5-core runtime smoke tests', () => {
  it('runCmoStrategyTurn returns {reply, proposal, gate, ready_to_advance} without LLM', async () => {
    const { runCmoStrategyTurn } = require(
      resolve(testDir, '../../../../../../../../packages/l5-core/dist/functions/cmo-strategy'),
    );
    expect(typeof runCmoStrategyTurn).toBe('function');

    const result = await runCmoStrategyTurn(
      [],
      '제품 전략을 도와주세요',
      { status: 'strategy_chat', product: '테스트 제품', target_audience: '스타트업 창업자' },
    );

    expect(result).toBeDefined();
    expect(typeof result.reply).toBe('string');
    expect(result.reply.length).toBeGreaterThan(0);
    expect('proposal' in result).toBe(true);
    expect('gate' in result).toBe(true);
    expect('ready_to_advance' in result).toBe(true);
  });

  it('buildSlideDeckSpec returns a valid spec', () => {
    const { buildSlideDeckSpec } = require(
      resolve(testDir, '../../../../../../../../packages/l5-core/dist/functions/video-room'),
    );
    expect(typeof buildSlideDeckSpec).toBe('function');

    const spec = buildSlideDeckSpec({
      id: 'test-spec-id',
      video_project_id: 'test-project-id',
      script_draft_id: 'test-draft-id',
      voice_recording_id: 'test-voice-id',
      design_theme: 'Pulk Clean Green Slide Deck',
      slides: [
        { index: 0, headline: '테스트 헤드라인', speaker_text: '테스트 스피커 텍스트', visual_type: 'text' },
      ],
    });

    expect(spec.id).toBe('test-spec-id');
    expect(spec.video_project_id).toBe('test-project-id');
    expect(spec.design_theme).toBe('Pulk Clean Green Slide Deck');
    expect(Array.isArray(spec.slides)).toBe(true);
    expect(spec.slides).toHaveLength(1);
  });

  it('evaluateVideoRoomQA returns overall_status pass when all checks pass', () => {
    const { evaluateVideoRoomQA } = require(
      resolve(testDir, '../../../../../../../../packages/l5-core/dist/functions/video-room'),
    );
    expect(typeof evaluateVideoRoomQA).toBe('function');

    const result = evaluateVideoRoomQA({
      id: 'test-qa-id',
      video_project_id: 'test-project-id',
      render_job_id: 'test-render-id',
      checks: {
        business_pt_structure: 'pass',
        pulling_to_key_bridge: 'pass',
        script_matches_approved_draft: 'pass',
        slide_readability: 'pass',
        audio_sync: 'pass',
        visual_quality: 'pass',
        upload_metadata_ready: 'pass',
      },
    });

    expect(result.id).toBe('test-qa-id');
    expect(result.overall_status).toBe('pass');
    expect(result.checks.business_pt_structure).toBe('pass');
  });

  it('submitRenderJob advances job to rendering status using in-memory transport', async () => {
    const { createRenderJob, submitRenderJob } = require(
      resolve(testDir, '../../../../../../../../packages/l5-core/dist/functions/video-room'),
    );
    const { createInMemoryVideoFactoryTransport } = require(
      resolve(testDir, '../../../../../../../../packages/l5-core/dist/functions/memory'),
    );

    const job = createRenderJob({
      id: 'test-job-id',
      video_project_id: 'test-project-id',
      slide_deck_spec_id: 'test-spec-id',
      created_at: new Date().toISOString(),
    });
    expect(job.status).toBe('queued');

    const transport = createInMemoryVideoFactoryTransport();
    const submitted = await submitRenderJob(job, transport);
    expect(submitted.status).toBe('rendering');
    expect(submitted.id).toBe('test-job-id');
  });
});
