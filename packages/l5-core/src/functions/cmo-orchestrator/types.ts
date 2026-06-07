import type { RiskLevel } from '../../types/entities';
import type { AgentRole } from '../../types/orchestration';
import type { ExecutiveTool, ToolResult } from '../executive-runtime/tools/types';

export type SkillCategory =
  | 'research'
  | 'content'
  | 'positioning'
  | 'experiment'
  | 'analysis';

export interface AgentSkill extends ExecutiveTool {
  skill_id: string;
  category: SkillCategory;
  depends_on: string[];
  default_risk: RiskLevel;
  estimated_duration_ms?: number;
}

export interface SkillResult extends ToolResult {
  skill_id: string;
  suggested_next?: string[];
  insight?: string;
}

export interface SkillExecutionContext {
  role: AgentRole;
  task_id: string;
  prior_results: Map<string, SkillResult>;
  video_room_status?: string;
}
