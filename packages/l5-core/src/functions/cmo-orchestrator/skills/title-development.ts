import type { AgentSkill, SkillResult } from '../types';
import {
  runTitleDevelopmentWorkflow,
  type TitleDevelopmentLLMDeps,
  type TitleDevelopmentWorkflowInput,
} from '../../cmo-strategy/title-development-llm';
import { buildTitleDevelopmentProposal } from '../../cmo-strategy/title-development';
import type { TitleDevelopmentReference } from '../../cmo-strategy/title-development-types';

/**
 * createTitleDevelopmentSkill — thin orchestration adapter over the
 * cmo-strategy executor runTitleDevelopmentWorkflow (PRD cmo-title-development
 * §21.4~21.6, WO-2). 확정된 풀링 콘텐츠 주제 + Viewtrap 검증 레퍼런스 2개를 받아
 * 교차 조합 → 어색함 판단 → 2~8단계 디벨롭 → 최종 평가까지 수행한다.
 *
 * deps.llm 미주입 시 실행기의 결정론 폴백으로 동작한다(전체 실패 금지).
 * 기존 cmo.title.thumbnail(썸네일 후보 생성)과 책임이 다르다 — 이 스킬은
 * 제목 디벨롭 8단계 워크플로우 전체를 소유한다.
 */
export function createTitleDevelopmentSkill(
  overrides: Partial<AgentSkill> = {},
  deps?: TitleDevelopmentLLMDeps,
): AgentSkill {
  return {
    name: 'cmo.title.development',
    skill_id: 'cmo.title.development',
    category: 'content',
    depends_on: ['cmo.pulling.plan'],
    default_risk: 'D2',
    description:
      'Viewtrap 검증 레퍼런스 2개 기반 교차 조합 + 8단계 제목 디벨롭으로 풀링 콘텐츠의 최종 제목/썸네일 방향을 만든다.',
    parameters: {},
    allowed_roles: ['CMO'],
    permission: 'read',
    run: async (args, ctx): Promise<SkillResult> => {
      const a = (args ?? {}) as Partial<TitleDevelopmentWorkflowInput> & {
        references?: TitleDevelopmentReference[];
      };

      const refs = Array.isArray(a.references) ? a.references : [];
      if (refs.length < 2) {
        return {
          ok: false,
          skill_id: 'cmo.title.development',
          error:
            '레퍼런스가 2개 미만이라 제목 디벨롭을 진행할 수 없습니다. Viewtrap 검증 레퍼런스 2개를 입력해 주세요. (AC-01)',
        };
      }
      const pulling_topic = String(a.pulling_topic ?? '').trim();
      if (!pulling_topic) {
        return {
          ok: false,
          skill_id: 'cmo.title.development',
          error: 'pulling_topic이 필요합니다.',
        };
      }

      const result = await runTitleDevelopmentWorkflow(
        {
          video_project_id: a.video_project_id ?? ctx?.task_id ?? 'video-project-unknown',
          pulling_content_id: a.pulling_content_id ?? 'pulling-content-unknown',
          pulling_topic,
          target_audience: String(a.target_audience ?? '').trim() || '작은 브랜드 대표',
          business_goal: a.business_goal,
          references: [refs[0], refs[1]],
          script_summary: a.script_summary,
        },
        deps,
      );

      if (!result.ok) {
        return {
          ok: false,
          skill_id: 'cmo.title.development',
          error:
            '레퍼런스가 선택 조건(조회수 5만 이상, 성과도/기여도 Good·Great)을 충족하지 않습니다. 추가 레퍼런스가 필요합니다.',
          data: {
            next_action: result.next_action,
            failed_references: result.failed_references,
          },
        };
      }

      // PRD §20.1 / AC-14: proposal.data에 저장 가능한 구조로 반환.
      const proposal = buildTitleDevelopmentProposal(result.run);
      return {
        ok: true,
        skill_id: 'cmo.title.development',
        data: { proposal, fallback_count: result.fallback_count },
        insight: result.run.second_brain_summary,
        suggested_next: ['cmo.script.write'],
      };
    },
    ...overrides,
  };
}
