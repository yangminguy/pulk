// CMO v3 R5 — Reference Source 어댑터 "이음새(seam)".
//
// 목적: 지금은 Viewtrap 리서치를 사장님이 수동 입력한다(StrategyBoard의 'Viewtrap 리서치
// 수동 입력' 폼 → reference_analysis 카드). 나중에 실제 Viewtrap 스크래퍼를 끼울 수 있도록
// "주입형 어댑터 인터페이스"만 만든다. 실제 스크래퍼/세션영속/자격증명은 만들지 않는다.
//
// 컨벤션: llmComplete 주입 패턴과 동일한 선택형(deps.scraper 주입 시 위임, 아니면 수동 폴백).
// 순수/결정론: Date.now()/randomUUID() 금지. 입력을 그대로 통과시킨다.
//
// ReferenceCandidate shape는 기존 것(types.ts)을 그대로 재사용한다.

import type { ReferenceCandidate } from './types';

/**
 * 참조 영상 소스 어댑터. 검색 쿼리 → 참조 후보 목록.
 * - 수동 입력 어댑터: 이미 사장님이 넣은 records를 그대로 반환(현 동작 보존).
 * - 실 스크래퍼 어댑터(미구현, followup): 같은 인터페이스로 Viewtrap에서 긁어온다.
 */
export interface ReferenceSourceAdapter {
  fetch(query: string): Promise<ReferenceCandidate[]>;
}

/**
 * 수동 입력 어댑터: 기존 수동 입력 데이터를 그대로 통과시키는 결정론 어댑터.
 * query에 무관하게 주어진 records를 그대로 반환한다(현재 동작을 정확히 보존).
 * 입력 배열을 변형하지 않도록 얕은 복사본을 돌려준다.
 */
export function manualInputAdapter(records: ReferenceCandidate[]): ReferenceSourceAdapter {
  const snapshot = [...records];
  return {
    async fetch(_query: string): Promise<ReferenceCandidate[]> {
      return [...snapshot];
    },
  };
}

export interface CreateReferenceAdapterDeps {
  /**
   * 실제 외부 소스 스크래퍼(예: Viewtrap). 주입되면 이걸 쓴다.
   * 미주입이 기본 — 그때는 수동 입력 어댑터로 폴백한다.
   * (실 스크래퍼/세션영속/자격증명/Playwright 서비스는 followup, 외부 의존.)
   */
  scraper?: ReferenceSourceAdapter;
  /** 스크래퍼 미주입 시 통과시킬 수동 입력 데이터. */
  manualRecords?: ReferenceCandidate[];
}

/**
 * 어댑터 선택자(llmComplete 주입 패턴과 동일).
 * - deps.scraper 주입 → 그 스크래퍼를 반환(실 소스 위임).
 * - 미주입(기본) → manualRecords 기반 수동 입력 어댑터로 폴백.
 */
export function createReferenceAdapter(
  deps: CreateReferenceAdapterDeps = {},
): ReferenceSourceAdapter {
  if (deps.scraper) {
    return deps.scraper;
  }
  return manualInputAdapter(deps.manualRecords ?? []);
}
