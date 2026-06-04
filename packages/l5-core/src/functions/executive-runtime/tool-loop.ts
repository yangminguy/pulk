// Executive Tool-Calling Loop — M1 implementation.
//
// runExecutiveWithTools wraps runExecutive with a text-based tool protocol.
// When no tools are provided it falls back to the single-shot runExecutive path.
// The LLMClient has no native tool-calling support, so the protocol uses
// a JSON envelope {"tool_call":{"name":"...","args":{...}}} for tool requests
// and the standard AgentOutput schema for the final deliverable.

import type { LLMClient } from '../ceo-orchestration/types';
import type { HandlerInput, HandlerResult } from './protocol';
import type { ExecutiveTool, ToolResult, ToolCallRequest } from './tools/types';
import {
  buildSystemPrompt,
  parseExecutiveOutput,
  buildHandlerResult,
} from './executive-llm';
import { runExecutive } from './executive-llm';

// ── constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_ITERATIONS = 4;

const nowMs = (): number => Date.now();

// ── tool-list formatter (injected into system prompt) ───────────────────────

function formatToolList(tools: ExecutiveTool[]): string {
  if (tools.length === 0) return '(사용 가능한 도구 없음)';
  // Compact one-line params keep the system prompt small — large pretty-printed
  // JSON inflates the prompt and slows each haiku round (M-fix 2026-06-02).
  return tools
    .map((t) => {
      const params = JSON.stringify(t.parameters);
      return `- "${t.name}": ${t.description} | args: ${params}`;
    })
    .join('\n');
}

// ── system prompt with tool protocol injected ────────────────────────────────

function buildToolSystemPrompt(
  role: Parameters<typeof buildSystemPrompt>[0],
  tools: ExecutiveTool[],
): string {
  const basePrompt = buildSystemPrompt(role);
  const toolList = formatToolList(tools);

  return `${basePrompt}

[도구 프로토콜]
다음 도구들을 사용할 수 있습니다:

${toolList}

도구를 호출하려면 다음 JSON 형식만 반환하십시오 (마크다운, 산문 없이):
{"tool_call": {"name": "<도구명>", "args": {<인자>}}}

모든 도구 호출이 완료되고 최종 산출물을 낼 준비가 되면, 기존 AgentOutput 스키마 JSON을 반환하십시오 (tool_call 없이).
한 번의 응답에 tool_call과 AgentOutput을 동시에 반환하지 마십시오.`;
}

// ── safe tool executor (never throws — wraps errors in ToolResult) ───────────

async function safeRunTool(
  tool: ExecutiveTool,
  args: Record<string, unknown>,
  ctx: { role: Parameters<typeof buildSystemPrompt>[0]; task_id: string },
): Promise<ToolResult> {
  try {
    return await tool.run(args, ctx);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── tool_call parser ─────────────────────────────────────────────────────────

function parseToolCall(raw: string): ToolCallRequest | null {
  // Find the first JSON object in the response and check for tool_call key.
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s === -1 || e <= s) return null;
  try {
    const obj = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>;
    if (obj.tool_call && typeof obj.tool_call === 'object' && obj.tool_call !== null) {
      const tc = obj.tool_call as Record<string, unknown>;
      if (typeof tc.name === 'string') {
        return {
          name: tc.name,
          args: (tc.args ?? {}) as Record<string, unknown>,
        };
      }
    }
  } catch {
    // not a tool call
  }
  return null;
}

// ── main export ──────────────────────────────────────────────────────────────

/**
 * Run an executive agent with optional tool support.
 *
 * - tools empty/absent  → delegates to runExecutive (single-shot, back-compat).
 * - tools present       → text-based tool-calling loop up to maxIterations.
 *
 * recalledInsights, when provided, is prepended to the user prompt as context
 * regardless of whether tools are active (consistent behaviour for M2+).
 */
export async function runExecutiveWithTools(
  input: HandlerInput,
  llm: LLMClient,
  opts: {
    tools?: ExecutiveTool[];
    maxIterations?: number;
    recalledInsights?: string;
  } = {},
): Promise<HandlerResult> {
  const { tools = [], maxIterations = DEFAULT_MAX_ITERATIONS, recalledInsights } = opts;
  const { task } = input;
  const role = task.assigned_agent;

  // ── fallback path ─────────────────────────────────────────────────────────
  if (tools.length === 0) {
    if (!recalledInsights) {
      return runExecutive(input, llm);
    }
    // Inject recalled insights into a one-shot call mirroring runExecutive.
    const insightPrefix =
      `[참고 인사이트]\n${recalledInsights}\n\n`;
    const baseUserPrompt =
      `Task (id=${task.id}):\n` +
      `- title: ${task.title}\n` +
      `- expected_output: ${task.expected_output}\n` +
      `- rationale / source instruction: ${task.rationale}\n\n` +
      `Do the real work now and return JSON only.`;

    const rawText = await llm.complete({
      system: buildSystemPrompt(role),
      user: insightPrefix + baseUserPrompt,
      trace_name: `executive.${role}.run`,
      trace_metadata: { task_id: task.id, role },
    });
    const parsed = parseExecutiveOutput(rawText);
    return buildHandlerResult(task, parsed);
  }

  // ── tool-calling loop path ────────────────────────────────────────────────
  const systemPrompt = buildToolSystemPrompt(role, tools);

  const baseTaskPrompt =
    `Task (id=${task.id}):\n` +
    `- title: ${task.title}\n` +
    `- expected_output: ${task.expected_output}\n` +
    `- rationale / source instruction: ${task.rationale}\n\n` +
    `필요한 도구를 사용하고, 완료되면 최종 산출물 JSON을 반환하십시오.`;

  // Accumulate tool results to append to successive user messages.
  let userContext = recalledInsights
    ? `[참고 인사이트]\n${recalledInsights}\n\n${baseTaskPrompt}`
    : baseTaskPrompt;

  const invokedTools: string[] = [];
  let lastRawResponse = '';

  // Per-round instrumentation, opt-in via L5_TOOL_LOOP_DEBUG=1, writes to stderr.
  // Isolates whether wall-clock is dominated by LLM rounds, tool spawns, or retries.
  const debug = process.env.L5_TOOL_LOOP_DEBUG === '1';
  const dbg = (msg: string) => {
    if (debug) console.error(`[tool-loop ${role} ${task.id}] ${msg}`);
  };
  dbg(`start: tools=${tools.length} maxIter=${maxIterations} sysPromptLen=${systemPrompt.length} ctxLen=${userContext.length}`);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const isLastIteration = iteration === maxIterations - 1;

    // First round: force an information-gathering tool call. Weak models (haiku)
    // otherwise skip tools and emit the full deliverable in one shot — which both
    // defeats the "learn from secondbrain / use the video factory" design intent
    // AND makes that single round very slow (large output). Constraining the first
    // turn to a tool_call costs nothing extra (no discarded round). (M-fix 2026-06-02)
    const forceToolFirst = iteration === 0 && tools.length > 0;
    const userMessage = isLastIteration
      ? `${userContext}\n\n[지시] 이제 최종 산출물 JSON(AgentOutput 스키마)을 반환하십시오. tool_call을 반환하지 마십시오.`
      : forceToolFirst
        ? `${userContext}\n\n[1단계 — 필수] 최종 산출물을 작성하기 전에, 반드시 먼저 관련 도구를 호출해 필요한 지식·맥락을 수집하십시오(예: secondbrain.read로 과거 인사이트 조회). 이번 응답은 {"tool_call":{...}} JSON 하나만 반환하고, 최종 산출물(AgentOutput)은 절대 반환하지 마십시오.`
        : userContext;

    const _t0 = nowMs();
    const rawText = await llm.complete({
      system: systemPrompt,
      user: userMessage,
      trace_name: `executive.${role}.tool_loop.${iteration}`,
      trace_metadata: { task_id: task.id, role, iteration },
    });
    dbg(`iter#${iteration} llm.complete ${nowMs() - _t0}ms userLen=${userMessage.length} rawLen=${rawText.length} rawHead=${JSON.stringify(rawText.slice(0, 80))}`);

    lastRawResponse = rawText;

    const toolCall = isLastIteration ? null : parseToolCall(rawText);

    if (toolCall === null) {
      // Final output — parse as AgentOutput.
      let parsed;
      try {
        parsed = parseExecutiveOutput(rawText);
      } catch {
        // One retry with an explicit reminder.
        const retryText = await llm.complete({
          system: systemPrompt,
          user: `${userContext}\n\n[지시] JSON 파싱에 실패했습니다. AgentOutput 스키마 JSON만 반환하십시오.`,
          trace_name: `executive.${role}.tool_loop.retry`,
          trace_metadata: { task_id: task.id, role },
        });
        parsed = parseExecutiveOutput(retryText);
        lastRawResponse = retryText;
      }

      const uniqueTools = Array.from(new Set(invokedTools));
      return buildHandlerResult(task, parsed, uniqueTools);
    }

    // ── execute the requested tool ──────────────────────────────────────────
    const tool = tools.find((t) => t.name === toolCall.name);

    let toolResult: ToolResult;
    if (!tool) {
      toolResult = { ok: false, error: `도구 "${toolCall.name}"을 찾을 수 없습니다.` };
    } else {
      // Role permission check.
      const allowed =
        tool.allowed_roles === 'all' || tool.allowed_roles.includes(role);
      if (!allowed) {
        toolResult = {
          ok: false,
          error: `역할 "${role}"은 도구 "${toolCall.name}"을 사용할 권한이 없습니다.`,
        };
      } else {
        const _tt = nowMs();
        toolResult = await safeRunTool(tool, toolCall.args, { role, task_id: task.id });
        dbg(`iter#${iteration} tool "${toolCall.name}" ran ${nowMs() - _tt}ms ok=${toolResult.ok}`);
        if (toolResult.ok) {
          invokedTools.push(toolCall.name);
        }
      }
    }

    // Append tool result to the running context for the next round.
    const resultJson = JSON.stringify(toolResult);
    userContext += `\n\n[도구 결과: ${toolCall.name}]\n${resultJson}`;
  }

  // maxIterations exhausted — the last forced prompt should have produced output,
  // but if we somehow exit the loop without returning, parse lastRawResponse.
  const parsed = parseExecutiveOutput(lastRawResponse);
  const uniqueTools = Array.from(new Set(invokedTools));
  return buildHandlerResult(task, parsed, uniqueTools);
}
