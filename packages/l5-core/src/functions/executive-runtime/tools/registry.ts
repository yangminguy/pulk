// Executive Tool Registry — central store for ExecutiveTool instances.
//
// Tools register once at startup; the tool-calling loop queries forRole()
// to build the per-role available-tool list shown in the system prompt.

import type { AgentRole } from '../../../types/orchestration';
import type { ExecutiveTool } from './types';

export class ToolRegistry {
  private readonly _tools: Map<string, ExecutiveTool> = new Map();

  /** Register a tool. Throws if a tool with the same name is already registered. */
  register(tool: ExecutiveTool): void {
    if (this._tools.has(tool.name)) {
      throw new Error(`ToolRegistry: duplicate tool name "${tool.name}"`);
    }
    this._tools.set(tool.name, tool);
  }

  /** Retrieve a tool by name, or undefined if not found. */
  get(name: string): ExecutiveTool | undefined {
    return this._tools.get(name);
  }

  /** All tools the given role is allowed to use. */
  forRole(role: AgentRole): ExecutiveTool[] {
    const result: ExecutiveTool[] = [];
    for (const tool of this._tools.values()) {
      if (tool.allowed_roles === 'all' || tool.allowed_roles.includes(role)) {
        result.push(tool);
      }
    }
    return result;
  }

  /** All registered tools regardless of role. */
  list(): ExecutiveTool[] {
    return Array.from(this._tools.values());
  }
}

/** Factory — optionally pre-loads a list of tools. */
export function createToolRegistry(tools?: ExecutiveTool[]): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of tools ?? []) {
    registry.register(tool);
  }
  return registry;
}
