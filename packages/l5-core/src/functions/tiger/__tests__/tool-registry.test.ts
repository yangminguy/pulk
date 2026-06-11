import type { AgentRole } from '../../../types/orchestration';
import {
  IMPROVEMENT_TARGET_REGISTRY,
  listImprovementTargets,
  getImprovementTarget,
  targetsForOwner,
  resolveRepoAbsPath,
} from '../tool-registry';

const VALID_ROLES: AgentRole[] = [
  'CEO', 'ChiefOfStaff', 'CMO', 'CRO', 'CPO', 'CTO', 'COO', 'CFO', 'RiskQA', 'Culture',
];

describe('tiger tool-registry', () => {
  it('id가 유일하다', () => {
    const ids = IMPROVEMENT_TARGET_REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 owner가 유효한 AgentRole이다', () => {
    for (const e of IMPROVEMENT_TARGET_REGISTRY) {
      expect(VALID_ROLES).toContain(e.owner);
    }
  });

  it('repo_path_kind가 유효하고, absolute는 / 로 시작한다', () => {
    for (const e of IMPROVEMENT_TARGET_REGISTRY) {
      expect(['pulk-relative', 'absolute']).toContain(e.repo_path_kind);
      if (e.repo_path_kind === 'absolute') {
        expect(e.repo_path.startsWith('/')).toBe(true);
      }
      expect(Array.isArray(e.error_sources)).toBe(true);
      expect(typeof e.manual_intake).toBe('boolean');
    }
  });

  it('ACR(agent_control_room_docs)은 등록되지 않는다(은퇴)', () => {
    const hasAcr = IMPROVEMENT_TARGET_REGISTRY.some(
      (e) => /acr|agent_control_room/i.test(e.id) || /agent_control_room/i.test(e.repo_path),
    );
    expect(hasAcr).toBe(false);
  });

  it('자동 수집 도구(manual_intake=false)는 error_sources가 비어있지 않다', () => {
    for (const e of IMPROVEMENT_TARGET_REGISTRY) {
      if (!e.manual_intake) {
        expect(e.error_sources.length).toBeGreaterThan(0);
      }
    }
  });

  it('listImprovementTargets는 전체를 반환한다', () => {
    expect(listImprovementTargets().length).toBe(IMPROVEMENT_TARGET_REGISTRY.length);
  });

  it('getImprovementTarget: 존재/부재', () => {
    expect(getImprovementTarget('cmo_slide_video_factory')?.owner).toBe('CMO');
    expect(getImprovementTarget('does_not_exist')).toBeUndefined();
  });

  it('targetsForOwner: CMO 필터', () => {
    const cmo = targetsForOwner('CMO');
    expect(cmo.length).toBeGreaterThanOrEqual(3);
    expect(cmo.every((e) => e.owner === 'CMO')).toBe(true);
  });

  it('resolveRepoAbsPath: absolute는 그대로', () => {
    const e = getImprovementTarget('cmo_slide_video_factory')!;
    expect(resolveRepoAbsPath(e, '/Users/x/pulk')).toBe('/Users/wonminyang/ai-slide-video-factory');
  });

  it('resolveRepoAbsPath: pulk-relative는 결합(트레일링 슬래시 정규화)', () => {
    const e = getImprovementTarget('cmo_viewtrap_youtube')!;
    expect(resolveRepoAbsPath(e, '/Users/x/pulk')).toBe('/Users/x/pulk/services/youtube');
    expect(resolveRepoAbsPath(e, '/Users/x/pulk/')).toBe('/Users/x/pulk/services/youtube');
  });
});
