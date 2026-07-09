import {
  buildLedgerEntry,
  computeDelta,
  serializeEntry,
  parseEntry,
  buildCalibrationProposals,
} from '../index';
import type {
  DecisionLedgerEntry,
  DecisionObservation,
  DecisionPrediction,
} from '../index';

const AT = '2026-07-09T00:00:00.000Z';
const AT2 = '2026-07-09T01:00:00.000Z';

function prediction(
  subject_id: string,
  predicted: Record<string, unknown>
): DecisionPrediction {
  return { kind: 'complexity', subject_id, predicted, at: AT };
}

function observation(
  subject_id: string,
  observed: Record<string, unknown>
): DecisionObservation {
  return { subject_id, observed, at: AT2 };
}

/** kind+field 캘리브레이션 표본 생성 헬퍼. */
function ledgerPair(
  subject_id: string,
  predicted: Record<string, unknown>,
  observed: Record<string, unknown>
): DecisionLedgerEntry {
  return buildLedgerEntry(prediction(subject_id, predicted), observation(subject_id, observed));
}

describe('computeDelta / buildLedgerEntry', () => {
  it('1. 공통 필드가 모두 일치하면 matched=true, mismatches 빈배열', () => {
    const delta = computeDelta({ complexity: 'C2', file_count: 3 }, { complexity: 'C2', file_count: 3 });
    expect(delta.matched).toBe(true);
    expect(delta.mismatches).toEqual([]);
  });

  it('2. 문자열 불일치를 mismatch로 잡는다(정확일치)', () => {
    const delta = computeDelta({ complexity: 'C2' }, { complexity: 'C4' });
    expect(delta.matched).toBe(false);
    expect(delta.mismatches).toEqual([{ field: 'complexity', predicted: 'C2', observed: 'C4' }]);
  });

  it('3. 숫자는 ±50% 이내면 match(4 vs 3, 예측4 기준 오차 25%)', () => {
    const delta = computeDelta({ file_count: 4 }, { file_count: 3 });
    expect(delta.matched).toBe(true);
  });

  it('4. 숫자가 ±50% 초과면 mismatch(2 vs 5, 예측2 기준 오차 150%)', () => {
    const delta = computeDelta({ file_count: 2 }, { file_count: 5 });
    expect(delta.matched).toBe(false);
    expect(delta.mismatches[0].field).toBe('file_count');
  });

  it('5. 예측이 0이면 정확일치만 match', () => {
    expect(computeDelta({ n: 0 }, { n: 0 }).matched).toBe(true);
    expect(computeDelta({ n: 0 }, { n: 1 }).matched).toBe(false);
  });

  it('6. 예측에만 있고 실측에 없는 필드는 비교에서 제외', () => {
    const delta = computeDelta({ a: 1, b: 2 }, { a: 1 });
    expect(delta.matched).toBe(true);
    expect(delta.mismatches).toEqual([]);
  });

  it('7. 불리언 정확일치 비교', () => {
    expect(computeDelta({ ok: true }, { ok: true }).matched).toBe(true);
    expect(computeDelta({ ok: true }, { ok: false }).matched).toBe(false);
  });

  it('8. observation 없으면 delta 생략', () => {
    const entry = buildLedgerEntry(prediction('t1', { complexity: 'C2' }));
    expect(entry.delta).toBeUndefined();
    expect(entry.observation).toBeUndefined();
    expect(entry.id).toBeTruthy();
  });

  it('9. observation 있으면 delta 채움', () => {
    const entry = ledgerPair('t1', { file_count: 4 }, { file_count: 9 });
    expect(entry.delta?.matched).toBe(false);
    expect(entry.observation?.observed).toEqual({ file_count: 9 });
  });
});

describe('serialize / parse 왕복', () => {
  it('10. serialize→parse 왕복이 동일 엔트리를 복원', () => {
    const entry = ledgerPair('t1', { complexity: 'C2', file_count: 3 }, { complexity: 'C4', file_count: 3 });
    const round = parseEntry(serializeEntry(entry));
    expect(round).toEqual(entry);
  });

  it('11. malformed 라인은 graceful null', () => {
    expect(parseEntry('{not json')).toBeNull();
    expect(parseEntry('')).toBeNull();
    expect(parseEntry('   ')).toBeNull();
    expect(parseEntry('null')).toBeNull();
    expect(parseEntry('123')).toBeNull();
  });

  it('12. 필수 필드 누락 라인은 null', () => {
    expect(parseEntry(JSON.stringify({ id: 'x', kind: 'complexity' }))).toBeNull();
  });
});

describe('buildCalibrationProposals', () => {
  it('13. 표본 수 임계 미달이면 제안 없음', () => {
    const entries = [
      ledgerPair('a', { complexity: 'C2' }, { complexity: 'C4' }),
      ledgerPair('b', { complexity: 'C2' }, { complexity: 'C4' }),
    ];
    expect(buildCalibrationProposals(entries)).toEqual([]);
  });

  it('14. 불일치율 임계 미달이면 제안 없음', () => {
    // 6표본, 불일치 2건(33%) < 0.4
    const entries = [
      ledgerPair('a', { complexity: 'C2' }, { complexity: 'C4' }),
      ledgerPair('b', { complexity: 'C2' }, { complexity: 'C4' }),
      ledgerPair('c', { complexity: 'C2' }, { complexity: 'C2' }),
      ledgerPair('d', { complexity: 'C2' }, { complexity: 'C2' }),
      ledgerPair('e', { complexity: 'C2' }, { complexity: 'C2' }),
      ledgerPair('f', { complexity: 'C2' }, { complexity: 'C2' }),
    ];
    expect(buildCalibrationProposals(entries)).toEqual([]);
  });

  it('15. 임계 충족 시 제안 생성 + 수치 반영', () => {
    // 5표본, 불일치 5건(100%)
    const entries = Array.from({ length: 5 }, (_, i) =>
      ledgerPair(`a${i}`, { complexity: 'C2' }, { complexity: 'C4' })
    );
    const proposals = buildCalibrationProposals(entries);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].kind).toBe('complexity');
    expect(proposals[0].field).toBe('complexity');
    expect(proposals[0].sample_count).toBe(5);
    expect(proposals[0].mismatch_rate).toBe(1);
    expect(proposals[0].suggestion).toContain('5건 중 5건');
  });

  it('16. 숫자 과대예측 다수면 direction=over', () => {
    // 예측 10 > 실측 2 (오차 80% → mismatch), 과대예측
    const entries = Array.from({ length: 5 }, (_, i) =>
      ledgerPair(`n${i}`, { file_count: 10 }, { file_count: 2 })
    );
    const proposals = buildCalibrationProposals(entries);
    expect(proposals[0].direction).toBe('over');
    expect(proposals[0].suggestion).toContain('높은');
    expect(proposals[0].suggestion).toContain('완화');
  });

  it('17. 숫자 과소예측 다수면 direction=under', () => {
    // 예측 2 < 실측 10 (오차 400% → mismatch), 과소예측
    const entries = Array.from({ length: 5 }, (_, i) =>
      ledgerPair(`n${i}`, { file_count: 2 }, { file_count: 10 })
    );
    const proposals = buildCalibrationProposals(entries);
    expect(proposals[0].direction).toBe('under');
    expect(proposals[0].suggestion).toContain('낮은');
    expect(proposals[0].suggestion).toContain('강화');
  });

  it('18. observation 없는 엔트리는 무시', () => {
    const entries = [buildLedgerEntry(prediction('x', { complexity: 'C2' }))];
    expect(buildCalibrationProposals(entries)).toEqual([]);
  });

  it('19. opts로 임계 조정 가능', () => {
    const entries = [
      ledgerPair('a', { complexity: 'C2' }, { complexity: 'C4' }),
      ledgerPair('b', { complexity: 'C2' }, { complexity: 'C4' }),
    ];
    const proposals = buildCalibrationProposals(entries, { minSamples: 2, minMismatchRate: 0.4 });
    expect(proposals).toHaveLength(1);
    expect(proposals[0].sample_count).toBe(2);
  });
});
