import type { AgentSkill, SkillResult } from '../types';
import type { KeyContentViewtrapValidation } from '../../video-room/types';
import {
  buildViewtrapValidation,
  filterSalesViableCandidates,
} from '../../video-room/viewtrap-tools';

type ViewtrapValidationInput = Omit<KeyContentViewtrapValidation, 'verdict'>;

/**
 * Viewtrap 검증 스킬 — 키/풀링 콘텐츠 후보를 Viewtrap 규칙으로 검증한다.
 *
 * 얇은 어댑터: 도메인 로직은 video-room/viewtrap-tools.ts(buildViewtrapValidation,
 * filterSalesViableCandidates)가 전부 소유한다. 여기서는 args로 받은 후보를
 * 도메인 함수에 넘기고 verdict/판매 가능 후보만 정리해 반환한다.
 *
 * args.candidates: ViewtrapValidationInput[] (verdict 제외한 검증 입력)
 */
export function createViewtrapValidateSkill(
  overrides: Partial<AgentSkill> = {},
): AgentSkill {
  return {
    name: 'cmo.viewtrap.validate',
    skill_id: 'cmo.viewtrap.validate',
    category: 'research',
    depends_on: [],
    default_risk: 'D2',
    description:
      'Validate key/pool content candidates with Viewtrap rules and keep only sales-viable verdicts.',
    parameters: {},
    allowed_roles: ['CMO'],
    permission: 'read',
    run: async (args, ctx): Promise<SkillResult> => {
      const candidates = (args?.candidates as ViewtrapValidationInput[] | undefined) ?? [];
      const validated = candidates.map((c) => buildViewtrapValidation(c));
      const viable = filterSalesViableCandidates(validated);
      return {
        ok: true,
        skill_id: 'cmo.viewtrap.validate',
        data: {
          task_id: ctx?.task_id,
          validated,
          viable_candidates: viable,
          viable_count: viable.length,
        },
        insight:
          viable.length > 0
            ? `Viewtrap kept ${viable.length}/${validated.length} candidates as sales-viable.`
            : 'Viewtrap rejected all candidates: no sales-viable topic found.',
      };
    },
    ...overrides,
  };
}
