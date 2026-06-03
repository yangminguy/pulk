// M5: Video Factory Tool — pure l5-core module.
//
// IO is fully isolated behind VideoFactoryTransport so this file has zero
// direct network calls and can be tested with createInMemoryVideoFactoryTransport.
//
// Real transport implementation lives in plugin-orchestration/video-factory-transport.ts.
//
// 도구 발전 루프: CMO가 recalledInsights(창업자와 합의된 방식, M4 협의 결과)를
// 읽고 video_factory.configure를 먼저 호출하여 합의된 방식을 도구에 반영한 뒤,
// video_factory.generate로 실제 영상을 생성하는 흐름을 유도합니다.
// 이 유도는 도구 description에 명시되어 있으므로 추가 코드 배선 없이 동작합니다.

import type { ExecutiveTool, ToolResult } from '../executive-runtime/tools/types';

// ── Transport contract ────────────────────────────────────────────────────────

/**
 * VideoFactoryTransport — the single interface point between l5-core and the
 * external video generation project.
 *
 * The calling interface of the real video generator project is currently unknown.
 * All request/response mapping is concentrated in the plugin-side transport so
 * that when the real project's API is confirmed, only that file needs updating.
 */
export interface VideoFactoryTransport {
  /**
   * Push agreed content strategy/style into the video generator.
   * Called by CMO when recalledInsights contain founder-agreed direction.
   *
   * preset fields map to the video generator's config schema.
   * TODO: update the plugin transport mapping when the real schema is confirmed.
   */
  configure(preset: {
    strategy?: string;
    content_style?: string;
    notes?: string;
  }): Promise<{ ok: boolean; error?: string }>;

  /**
   * Request a new video brief + generation from the video generator.
   */
  generate(brief: {
    topic: string;
    angle?: string;
    format?: string;
  }): Promise<{ ok: boolean; data?: unknown; error?: string }>;

  /**
   * Retrieve the currently applied content configuration (read-only).
   * Optional — transports that do not support this return undefined.
   */
  getConfig?(): Promise<{
    strategy?: string;
    content_style?: string;
    notes?: string;
  }>;
}

// ── Executive tools ───────────────────────────────────────────────────────────

/**
 * Create the three CMO-exclusive video factory executive tools:
 *   - video_factory.configure  : apply agreed content strategy to the generator
 *   - video_factory.generate   : create a new video brief + generation request
 *   - video_factory.get_config : read the current applied strategy (optional)
 *
 * All tools have allowed_roles: ['CMO'] so the tool-loop automatically rejects
 * requests from other executives.
 *
 * 도구 발전 루프 유도:
 * video_factory.configure description에 "recalledInsights에 합의된 방식이 있으면
 * generate 전에 먼저 이 도구를 호출하라"는 지시를 포함합니다.
 * 별도 코드 없이 LLM이 올바른 호출 순서를 따릅니다.
 */
export function createVideoFactoryTools(transport: VideoFactoryTransport): ExecutiveTool[] {
  const configureTool: ExecutiveTool = {
    name: 'video_factory.configure',
    description:
      '영상 생성기에 콘텐츠 전략과 스타일을 적용합니다. CMO 전용. ' +
      '⚑ recalledInsights(또는 창업자와 합의된 방식)에 방향이 있으면 ' +
      'video_factory.generate를 호출하기 전에 반드시 이 도구를 먼저 호출하여 ' +
      '합의 내용을 반영하십시오. 이것이 도구 발전 루프의 핵심입니다. ' +
      '인자: strategy(선택, 전략 텍스트), content_style(선택, 스타일 설명), notes(선택, 비고).',
    parameters: {
      strategy: { type: 'string', description: '콘텐츠 전략 텍스트 (선택)' },
      content_style: { type: 'string', description: '영상 스타일 설명 (선택)' },
      notes: { type: 'string', description: '추가 비고 (선택)' },
    },
    allowed_roles: ['CMO'],
    permission: 'write',
    async run(args) {
      const preset: { strategy?: string; content_style?: string; notes?: string } = {};
      if (typeof args.strategy === 'string') preset.strategy = args.strategy;
      if (typeof args.content_style === 'string') preset.content_style = args.content_style;
      if (typeof args.notes === 'string') preset.notes = args.notes;
      try {
        return await transport.configure(preset);
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  };

  const generateTool: ExecutiveTool = {
    name: 'video_factory.generate',
    description:
      '영상 기획 및 생성을 요청합니다. CMO 전용. ' +
      '합의된 방식이 있다면 이 도구 호출 전에 video_factory.configure를 먼저 실행하십시오. ' +
      '결과물 중 재사용 가치 있는 인사이트는 secondbrain.write로 적립하십시오. ' +
      '인자: topic(필수, 영상 주제), angle(선택, 접근 각도), format(선택, 형식).',
    parameters: {
      topic: { type: 'string', description: '영상 주제 (필수)' },
      angle: { type: 'string', description: '콘텐츠 접근 각도 (선택)' },
      format: { type: 'string', description: '영상 형식 (선택, 예: short-form, long-form, reel)' },
    },
    allowed_roles: ['CMO'],
    permission: 'write',
    async run(args) {
      if (typeof args.topic !== 'string' || args.topic.trim() === '') {
        return { ok: false, error: 'video_factory.generate: topic 인자가 필요합니다.' };
      }
      const brief: { topic: string; angle?: string; format?: string } = {
        topic: args.topic.trim(),
      };
      if (typeof args.angle === 'string') brief.angle = args.angle;
      if (typeof args.format === 'string') brief.format = args.format;
      try {
        return await transport.generate(brief);
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  };

  const getConfigTool: ExecutiveTool = {
    name: 'video_factory.get_config',
    description:
      '현재 영상 생성기에 적용된 콘텐츠 전략과 스타일을 조회합니다. CMO 전용. ' +
      '인자 없음.',
    parameters: {},
    allowed_roles: ['CMO'],
    permission: 'read',
    async run(_args) {
      if (!transport.getConfig) {
        return { ok: true, data: { message: 'getConfig not supported by this transport' } };
      }
      try {
        const config = await transport.getConfig();
        return { ok: true, data: config };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  };

  return [configureTool, generateTool, getConfigTool];
}

// ── In-memory transport (mock / test / env-not-set fallback) ─────────────────

/**
 * Lightweight in-memory transport for tests and environments where
 * VIDEO_FACTORY_URL / VIDEO_FACTORY_TOKEN are not set.
 * All data lives in-process; no network calls.
 */
export function createInMemoryVideoFactoryTransport(
  seed: { strategy?: string; content_style?: string; notes?: string } = {},
): VideoFactoryTransport & { _store: { config: { strategy?: string; content_style?: string; notes?: string }; generated: Array<{ topic: string; angle?: string; format?: string }> } } {
  const store = {
    config: { ...seed },
    generated: [] as Array<{ topic: string; angle?: string; format?: string }>,
  };

  return {
    _store: store,

    async configure(preset) {
      if (preset.strategy !== undefined) store.config.strategy = preset.strategy;
      if (preset.content_style !== undefined) store.config.content_style = preset.content_style;
      if (preset.notes !== undefined) store.config.notes = preset.notes;
      return { ok: true };
    },

    async generate(brief) {
      store.generated.push({ ...brief });
      return {
        ok: true,
        data: {
          brief_id: `mock-${store.generated.length}`,
          topic: brief.topic,
          angle: brief.angle ?? null,
          format: brief.format ?? null,
          applied_config: { ...store.config },
        },
      };
    },

    async getConfig() {
      return { ...store.config };
    },
  };
}
