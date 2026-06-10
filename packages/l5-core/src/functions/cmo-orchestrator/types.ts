import type { RiskLevel } from '../../types/entities';
import type { AgentRole } from '../../types/orchestration';
import type { ExecutiveTool, ToolResult } from '../executive-runtime/tools/types';

// CMO v3 workflow data model — single source of truth lives in video-room/types.ts.
// Re-exported here so the cmo-orchestrator package surface exposes the full v3 contract
// (strategy package → research packs → strategy brief → script → execution brief + statuses).
export {
  ApprovedContentStrategyPackage,
  MarketResearchPack,
  ScriptMaterialPack,
  CmoVideoStrategyBrief,
  VoiceMatchedScript,
  ScriptQaReport,
  VideoExecutionBrief,
  CmoContentCard,
  ResearchStatus,
  StrategyBriefStatus,
  ScriptStatus,
  VideoGenStatus,
} from '../video-room/types';

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
