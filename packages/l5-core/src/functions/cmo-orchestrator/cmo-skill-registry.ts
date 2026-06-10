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
import { createTitleThumbnailSkill } from './skills/title-thumbnail';
import { createScriptWriteSkill } from './skills/script';
import { createVoiceBriefSkill } from './skills/voice-brief';
import { createFactoryHandoffSkill } from './skills/factory';

/**
 * Build the default set of CMO skills (one instance per factory).
 */
export function createCmoSkills(): AgentSkill[] {
  return [
    createMarketResearchSkill(),
    createPositioningMessageSkill(),
    createKeyContentSkill(),
    createViewtrapValidateSkill(),
    createPullingContentSkill(),
    createStrategyPackageSkill(),
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
export function createCmoSkillRegistry(): SkillRegistry {
  const registry = createSkillRegistry(createCmoSkills());
  // Fail fast: ensures the full dependency graph topo-sorts without cycles.
  registry.resolveDependencies(registry.all().map((skill) => skill.skill_id));
  return registry;
}
