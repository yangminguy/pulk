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

  it('grants loggedIn ACL on cmo resource actions', () => {
    expect(pluginSource).toContain("this.app.acl.allow('cmo'");
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

  it('has all eight CMO actions defined', () => {
    expect(pluginSource).toContain('createProject: async');
    expect(pluginSource).toContain('listProjects: async');
    expect(pluginSource).toContain('getProject: async');
    expect(pluginSource).toContain('chatMessage: async');
    expect(pluginSource).toContain('advanceStatus: async');
    expect(pluginSource).toContain('decideGate: async');
    expect(pluginSource).toContain('approvePlan: async');
    expect(pluginSource).toContain('saveCard: async');
  });
});

describe('CMO Video Room — l5-core runtime smoke test', () => {
  it('runCmoStrategyTurn returns {reply, proposal, gate, ready_to_advance} without LLM', async () => {
    // Require from dist directly (no LLM provided → deterministic fallback).
    const { runCmoStrategyTurn } = require(
      resolve(testDir, '../../../../../../../../packages/l5-core/dist/functions/cmo-strategy'),
    );
    expect(typeof runCmoStrategyTurn).toBe('function');

    const result = await runCmoStrategyTurn(
      [],
      '제품 전략을 도와주세요',
      { status: 'strategy_chat', product: '테스트 제품', target_audience: '스타트업 창업자' },
      // no llm — uses deterministic stage-script fallback
    );

    expect(result).toBeDefined();
    expect(typeof result.reply).toBe('string');
    expect(result.reply.length).toBeGreaterThan(0);
    // proposal and gate may be null at strategy_chat stage — just check shape.
    expect('proposal' in result).toBe(true);
    expect('gate' in result).toBe(true);
    expect('ready_to_advance' in result).toBe(true);
  });
});
