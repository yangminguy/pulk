// M4: ask_founder executive tool factory.
// Pure l5-core — no I/O. The `propose` callback is injected by the plugin layer.

import type { ExecutiveTool, ToolResult } from '../executive-runtime/tools/types';
import type { ConsultationRequest } from './index';

export interface AskFounderToolOptions {
  /**
   * Plugin-injected callback: persists the consultation record + marks the task
   * needs_review. Returns a ToolResult with data.await_founder=true on success.
   */
  propose: (req: ConsultationRequest) => Promise<ToolResult>;
}

/**
 * Create the ask_founder executive tool.
 *
 * When an executive needs founder input before producing a deliverable, it calls
 * this tool with a question (and optional choices). The tool-loop detects
 * data.await_founder=true and the plugin terminates the run as needs_review.
 */
export function createAskFounderTool(opts: AskFounderToolOptions): ExecutiveTool {
  const { propose } = opts;

  return {
    name: 'ask_founder',
    description:
      '창업자에게 직접 질문하거나 선택을 요청합니다. ' +
      '산출물을 내기 전에 방향 결정이 필요할 때 사용하세요. ' +
      '인자: question(필수, 창업자에게 보낼 질문), options(선택, 선택지 문자열 배열).',
    parameters: {
      question: { type: 'string', description: '창업자에게 전달할 질문 (필수)' },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: '선택지 배열 (선택). 없으면 자유 텍스트 응답.',
      },
    },
    allowed_roles: 'all',
    permission: 'write',
    async run(args, ctx) {
      if (typeof args.question !== 'string' || args.question.trim() === '') {
        return { ok: false, error: 'ask_founder: question 인자가 필요합니다.' };
      }
      if (!ctx?.task_id) {
        return { ok: false, error: 'ask_founder: task_id 컨텍스트가 필요합니다.' };
      }

      const options =
        Array.isArray(args.options) &&
        args.options.every((o: unknown) => typeof o === 'string')
          ? (args.options as string[])
          : undefined;

      const req: ConsultationRequest = {
        from_agent: ctx.role,
        task_id: ctx.task_id,
        question: args.question.trim(),
        options,
      };

      return propose(req);
    },
  };
}
