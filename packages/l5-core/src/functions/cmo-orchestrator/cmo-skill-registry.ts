// Default CMO SkillRegistry wiring.
// Collects every create*Skill factory and registers them so the orchestrator can
// resolve the content-strategy dependency chain:
//   keycontent → pulling → package → title → script → voice → factory
// (research/positioning skills are independent roots).

import { createSkillRegistry, type SkillRegistry } from './skill-registry';
import type { AgentSkill } from './types';
import { createMarketResearchSkill } from './skills/market-research';
import { createPositioningMessageSkill } from './skills/positioning-message';
import { createKeyContentSkill } from './skills/key-content';
import { createViewtrapValidateSkill } from './skills/viewtrap';
import { createPullingContentSkill } from './skills/pulling-content';
import { createStrategyPackageSkill } from './skills/strategy-package';
import { createTitleDevelopmentSkill } from './skills/title-development';
import { createTitleThumbnailSkill } from './skills/title-thumbnail';
import { createScriptWriteSkill } from './skills/script';
import type { TitleDevelopmentLLMDeps } from '../cmo-strategy/title-development-llm';
import { createVoiceBriefSkill } from './skills/voice-brief';
import { createFactoryHandoffSkill } from './skills/factory';

export interface CreateCmoSkillsOptions {
  /** 제목 디벨롭 8단계 실행기의 LLM 주입 (미주입 시 결정론 폴백). */
  title_development_deps?: TitleDevelopmentLLMDeps;
}

/**
 * Build the default set of CMO skills (one instance per factory).
 */
export function createCmoSkills(options: CreateCmoSkillsOptions = {}): AgentSkill[] {
  return [
    createMarketResearchSkill(),
    createPositioningMessageSkill(),
    createKeyContentSkill(),
    createViewtrapValidateSkill(),
    createPullingContentSkill(),
    createStrategyPackageSkill(),
    createTitleDevelopmentSkill({}, options.title_development_deps),
    createTitleThumbnailSkill(),
    createScriptWriteSkill(),
    createVoiceBriefSkill(),
    createFactoryHandoffSkill(),
  ];
}

/**
 * Build a SkillRegistry pre-loaded with all default CMO skills.
 * Eagerly validates the dependency graph (throws on cycle or unknown dependency).
 */
export function createCmoSkillRegistry(options: CreateCmoSkillsOptions = {}): SkillRegistry {
  const registry = createSkillRegistry(createCmoSkills(options));
  // Fail fast: ensures the full dependency graph topo-sorts without cycles.
  registry.resolveDependencies(registry.all().map((skill) => skill.skill_id));
  return registry;
}
