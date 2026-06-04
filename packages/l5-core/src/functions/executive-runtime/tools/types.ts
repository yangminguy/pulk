// Executive Tool Runtime — type definitions for M1 tool platform.
//
// ExecutiveTool is the unit of capability: registered in the ToolRegistry,
// filtered by AgentRole, and invoked inside the tool-calling loop.

import type { AgentRole } from '../../../types/orchestration';

export type ToolPermission = 'read' | 'write' | 'readwrite';

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface ExecutiveTool {
  /** Unique identifier used by the LLM to request this tool (e.g. "secondbrain.read"). */
  name: string;
  /** Human/LLM-readable description of what this tool does (Korean allowed). */
  description: string;
  /** Simplified JSON-schema-style parameter description shown in the system prompt. */
  parameters: Record<string, unknown>;
  /** Which roles may invoke this tool. 'all' means any AgentRole. */
  allowed_roles: AgentRole[] | 'all';
  permission: ToolPermission;
  run(args: Record<string, unknown>, ctx?: ToolRunContext): Promise<ToolResult>;
}

export interface ToolRunContext {
  role: AgentRole;
  task_id: string;
}

export interface ToolCallRequest {
  name: string;
  args: Record<string, unknown>;
}
