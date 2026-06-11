import type { AgentSkill, SkillCategory } from './types';

export class SkillRegistry {
  private readonly skills = new Map<string, AgentSkill>();

  constructor(skills: AgentSkill[] = []) {
    skills.forEach((skill) => this.register(skill));
  }

  register(skill: AgentSkill): void {
    this.skills.set(skill.skill_id, skill);
  }

  get(skillId: string): AgentSkill | undefined {
    return this.skills.get(skillId);
  }

  byCategory(category: SkillCategory): AgentSkill[] {
    return this.all().filter((skill) => skill.category === category);
  }

  all(): AgentSkill[] {
    return Array.from(this.skills.values());
  }

  resolveDependencies(skillIds: string[]): string[] {
    const resolved: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (skillId: string): void => {
      if (visited.has(skillId)) return;
      if (visiting.has(skillId)) {
        throw new Error(`Skill dependency cycle detected: ${skillId}`);
      }

      const skill = this.get(skillId);
      if (!skill) {
        throw new Error(`Unknown skill dependency: ${skillId}`);
      }

      visiting.add(skillId);
      skill.depends_on.forEach(visit);
      visiting.delete(skillId);
      visited.add(skillId);
      resolved.push(skillId);
    };

    skillIds.forEach(visit);
    return resolved;
  }
}

export function createSkillRegistry(skills: AgentSkill[] = []): SkillRegistry {
  return new SkillRegistry(skills);
}
