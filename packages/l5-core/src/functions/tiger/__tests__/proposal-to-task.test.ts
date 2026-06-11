import { proposalsToBatchCards, type ApprovedProposalInput } from '../proposal-to-task';
import { encodeTargetRef } from '../analysis';
import { getImprovementTarget, resolveRepoAbsPath } from '../tool-registry';
import type { CTOPhase } from '../../../types/acr-intent';

const PULK = '/Users/x/pulk';

function buildPhases(): CTOPhase[] {
  return [
    {
      name: 'code',
      runtime: 'claude',
      prompt_packet: 'fix',
      expected_output: 'patch',
      risk_level: 'D1',
      release_gate_type: 'none',
      l5_approval_required: false,
      auto_execute: true,
      verify_command: 'tsc --noEmit',
    },
  ];
}

describe('proposalsToBatchCards', () => {
  it('source_ref → target_id → resolveRepoAbsPath로 project_path 산출(pulk-relative)', () => {
    const targetId = 'cto_hermes_runtime';
    const entry = getImprovementTarget(targetId)!;
    const expectedRepo = resolveRepoAbsPath(entry, PULK);
    const input: ApprovedProposalInput[] = [
      { proposal_id: 'p1', source_ref: encodeTargetRef(targetId) },
    ];
    const { cards, skipped } = proposalsToBatchCards(input, buildPhases, PULK);
    expect(skipped).toEqual([]);
    expect(cards).toHaveLength(1);
    expect(cards[0].target_repo).toBe(expectedRepo);
    expect(cards[0].proposal_id).toBe('p1');
    expect(cards[0].phases).toHaveLength(1);
  });

  it('absolute repo target은 절대경로 그대로', () => {
    const entry = getImprovementTarget('cmo_slide_video_factory')!;
    const input: ApprovedProposalInput[] = [
      { proposal_id: 'p2', source_ref: encodeTargetRef('cmo_slide_video_factory') },
    ];
    const { cards } = proposalsToBatchCards(input, buildPhases, PULK);
    expect(cards[0].target_repo).toBe(entry.repo_path);
    expect(cards[0].target_repo.startsWith('/')).toBe(true);
  });

  it('입력 target_repo가 source_ref보다 우선', () => {
    const input: ApprovedProposalInput[] = [
      { proposal_id: 'p3', source_ref: encodeTargetRef('cto_hermes_runtime'), target_repo: '/override/repo' },
    ];
    const { cards } = proposalsToBatchCards(input, buildPhases, PULK);
    expect(cards[0].target_repo).toBe('/override/repo');
  });

  it('해석 불가 source_ref → skipped(사유 회수)', () => {
    const input: ApprovedProposalInput[] = [{ proposal_id: 'p4', source_ref: 'garbage' }];
    const { cards, skipped } = proposalsToBatchCards(input, buildPhases, PULK);
    expect(cards).toEqual([]);
    expect(skipped[0].proposal_id).toBe('p4');
    expect(skipped[0].reason).toContain('unresolvable');
  });

  it('미등록 target_id → skipped', () => {
    const input: ApprovedProposalInput[] = [{ proposal_id: 'p5', source_ref: 'tiger:nonexistent_tool' }];
    const { skipped } = proposalsToBatchCards(input, buildPhases, PULK);
    expect(skipped[0].reason).toContain('unknown target_id');
  });

  it('phase 0개 빌더 → skipped', () => {
    const input: ApprovedProposalInput[] = [{ proposal_id: 'p6', source_ref: encodeTargetRef('cto_hermes_runtime') }];
    const { cards, skipped } = proposalsToBatchCards(input, () => [], PULK);
    expect(cards).toEqual([]);
    expect(skipped[0].reason).toBe('no phases produced');
  });

  it('빌더 throw → skipped(never-throw)', () => {
    const input: ApprovedProposalInput[] = [{ proposal_id: 'p7', source_ref: encodeTargetRef('cto_hermes_runtime') }];
    const { skipped } = proposalsToBatchCards(input, () => { throw new Error('boom'); }, PULK);
    expect(skipped[0].reason).toContain('phase build failed');
  });

  it('business_id 전파', () => {
    const input: ApprovedProposalInput[] = [
      { proposal_id: 'p8', source_ref: encodeTargetRef('cto_hermes_runtime'), business_id: 'biz-9' },
    ];
    const { cards } = proposalsToBatchCards(input, buildPhases, PULK);
    expect(cards[0].business_id).toBe('biz-9');
  });
});
