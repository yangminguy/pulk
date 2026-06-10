import { planPhaseLevels } from '../parallelize';
import type { CTOPhase } from '../../../types/acr-intent';

function phase(name: string, depends_on?: string[]): CTOPhase {
  return {
    name,
    runtime: 'claude',
    prompt_packet: `do ${name}`,
    expected_output: 'done',
    risk_level: 'D1',
    release_gate_type: 'none',
    l5_approval_required: false,
    auto_execute: true,
    ...(depends_on ? { depends_on } : {}),
  };
}

const names = (levels: CTOPhase[][]) => levels.map((l) => l.map((p) => p.name));

describe('planPhaseLevels', () => {
  it('빈 배열은 빈 레벨', () => {
    expect(planPhaseLevels([])).toEqual([]);
  });

  it('depends_on 전무 → 완전 순차(각 레벨 단독, 기존 동작 보존)', () => {
    const levels = planPhaseLevels([phase('A'), phase('B'), phase('C')]);
    expect(names(levels)).toEqual([['A'], ['B'], ['C']]);
  });

  it('공통 선행에 의존하는 두 phase는 같은 레벨(병렬)', () => {
    const levels = planPhaseLevels([
      phase('A'),
      phase('B', ['A']),
      phase('C', ['A']),
    ]);
    expect(names(levels)).toEqual([['A'], ['B', 'C']]);
  });

  it('수렴: 병렬 두 phase 후 합류 phase는 다음 레벨', () => {
    const levels = planPhaseLevels([
      phase('A'),
      phase('B', ['A']),
      phase('C', ['A']),
      phase('D', ['B', 'C']),
    ]);
    expect(names(levels)).toEqual([['A'], ['B', 'C'], ['D']]);
  });

  it('같은 레벨 내 선언 순서 유지', () => {
    const levels = planPhaseLevels([
      phase('root'),
      phase('z', ['root']),
      phase('a', ['root']),
    ]);
    expect(names(levels)).toEqual([['root'], ['z', 'a']]);
  });

  it('미존재 의존은 무시(graceful) — 의존 없는 것으로 취급', () => {
    const levels = planPhaseLevels([phase('A', ['ghost']), phase('B', ['A'])]);
    expect(names(levels)).toEqual([['A'], ['B']]);
  });

  it('자기 의존 무시', () => {
    const levels = planPhaseLevels([phase('A', ['A'])]);
    expect(names(levels)).toEqual([['A']]);
  });

  it('순환 의존은 graceful(무한 재귀 없이 레벨 산출)', () => {
    const levels = planPhaseLevels([phase('A', ['B']), phase('B', ['A'])]);
    // 결과 형태는 구현 정의이나, 두 phase가 모두 포함되고 throw하지 않으면 OK.
    const flat = levels.flat().map((p) => p.name).sort();
    expect(flat).toEqual(['A', 'B']);
  });
});
