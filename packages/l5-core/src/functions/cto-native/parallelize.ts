// parallelize.ts — phase 의존성 위상정렬로 병렬 실행 레벨을 계산(순수 함수).
// CTO가 CTOPhase.depends_on(phase name 참조)으로 명시한 의존성만 병렬화한다.
// depends_on 미지정 phase는 직전 phase에 암묵 의존 → 기존 순차 동작을 그대로 보존한다.
// I/O·네트워크·Date.now 금지. 순환/미존재 의존은 graceful(console.warn 후 무시).

import type { CTOPhase } from '../../types/acr-intent';

/**
 * phases를 depends_on 위상정렬해 "레벨"(동시 실행 가능 묶음) 배열로 묶는다.
 *  - level 0  = 선행 의존이 없는 phase들
 *  - level k  = level<k 에만 의존하는 phase들
 * 같은 레벨 내 순서는 선언(배열) 순서를 유지한다.
 *
 * depends_on이 비어있는 phase는 직전 phase에 암묵 의존한다. 따라서 아무 phase도
 * depends_on을 지정하지 않으면 결과는 각 phase가 단독인 완전 순차(현행 동작)다.
 */
export function planPhaseLevels(phases: CTOPhase[]): CTOPhase[][] {
  const n = phases.length;
  if (n === 0) return [];

  // phase 이름 → 첫 등장 인덱스(중복 이름은 첫 것 기준).
  const nameToIndex = new Map<string, number>();
  phases.forEach((p, i) => {
    if (!nameToIndex.has(p.name)) nameToIndex.set(p.name, i);
  });

  // 각 phase의 유효 의존 인덱스 집합.
  //  - depends_on 미지정(undefined) → 직전 phase에 암묵 의존(기존 순차 보존).
  //  - depends_on=[](명시적 빈 배열) → 선행 없음(root) → 같은 레벨로 병렬 가능.
  //  - depends_on=[...] → 그 phase들에 의존.
  const deps: number[][] = phases.map((p, i) => {
    const raw =
      p.depends_on !== undefined
        ? p.depends_on
        : i > 0
          ? [phases[i - 1].name]
          : [];
    const resolved: number[] = [];
    for (const name of raw) {
      const di = nameToIndex.get(name);
      if (di === undefined) {
        console.warn(`[parallelize] phase "${p.name}": 미존재 의존 "${name}" 무시.`);
        continue;
      }
      if (di === i) {
        console.warn(`[parallelize] phase "${p.name}": 자기 의존 무시.`);
        continue;
      }
      resolved.push(di);
    }
    return resolved;
  });

  // 레벨 계산(메모이즈 + 순환 가드).
  const level = new Array<number>(n).fill(-1);
  const visiting = new Array<boolean>(n).fill(false);

  const computeLevel = (i: number): number => {
    if (level[i] >= 0) return level[i];
    if (visiting[i]) {
      // 순환 — back-edge를 무시해 무한 재귀를 막는다(graceful).
      console.warn(`[parallelize] phase "${phases[i].name}": 순환 의존 감지 — back-edge 무시.`);
      return 0;
    }
    visiting[i] = true;
    let lvl = 0;
    for (const d of deps[i]) {
      lvl = Math.max(lvl, computeLevel(d) + 1);
    }
    visiting[i] = false;
    level[i] = lvl;
    return lvl;
  };

  for (let i = 0; i < n; i++) computeLevel(i);

  const maxLevel = Math.max(...level);
  const levels: CTOPhase[][] = [];
  for (let l = 0; l <= maxLevel; l++) {
    const group = phases.filter((_, i) => level[i] === l);
    if (group.length > 0) levels.push(group);
  }
  return levels;
}
