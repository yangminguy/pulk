import {
  openConsultation,
  resolveConsultation,
  formatConsultationForPrompt,
  type ConsultationRecord,
} from '../index';

describe('openConsultation', () => {
  it('creates a record in awaiting_founder status', () => {
    const rec = openConsultation({
      id: 'c1',
      task_id: 't1',
      from_agent: 'CMO',
      question: '포지셔닝 A/B 중 어느 쪽을 선택하시겠습니까?',
      options: ['A: 가성비 포지셔닝', 'B: 프리미엄 포지셔닝'],
    });

    expect(rec.id).toBe('c1');
    expect(rec.task_id).toBe('t1');
    expect(rec.from_agent).toBe('CMO');
    expect(rec.status).toBe('awaiting_founder');
    expect(rec.founder_response).toBeNull();
    expect(rec.resolved_at).toBeNull();
    expect(rec.options).toEqual(['A: 가성비 포지셔닝', 'B: 프리미엄 포지셔닝']);
  });

  it('sets options to null when empty array provided', () => {
    const rec = openConsultation({
      id: 'c2',
      task_id: 't2',
      from_agent: 'CPO',
      question: '기능 우선순위를 알려주세요.',
      options: [],
    });
    expect(rec.options).toBeNull();
  });

  it('throws if question is empty', () => {
    expect(() =>
      openConsultation({ id: 'c3', task_id: 't3', from_agent: 'CRO', question: '' })
    ).toThrow('question must not be empty');
  });

  it('throws if question is whitespace', () => {
    expect(() =>
      openConsultation({ id: 'c4', task_id: 't4', from_agent: 'CFO', question: '   ' })
    ).toThrow('question must not be empty');
  });
});

describe('resolveConsultation', () => {
  function makeAwaiting(): ConsultationRecord {
    return openConsultation({
      id: 'c5',
      task_id: 't5',
      from_agent: 'CMO',
      question: '어떤 채널을 우선하겠습니까?',
    });
  }

  it('transitions awaiting_founder → resolved', () => {
    const rec = resolveConsultation(makeAwaiting(), 'LinkedIn을 먼저 하세요');
    expect(rec.status).toBe('resolved');
    expect(rec.founder_response).toBe('LinkedIn을 먼저 하세요');
    expect(rec.resolved_at).not.toBeNull();
  });

  it('is idempotent when already resolved', () => {
    const first = resolveConsultation(makeAwaiting(), '첫 번째 응답');
    const second = resolveConsultation(first, '두 번째 응답');
    // no-op: first response preserved
    expect(second.founder_response).toBe('첫 번째 응답');
    expect(second.status).toBe('resolved');
  });
});

describe('formatConsultationForPrompt', () => {
  it('returns empty string for unresolved consultation', () => {
    const rec = openConsultation({
      id: 'c6',
      task_id: 't6',
      from_agent: 'CRO',
      question: '목표 고객을 알려주세요.',
    });
    expect(formatConsultationForPrompt(rec)).toBe('');
  });

  it('formats resolved consultation with options', () => {
    const rec = resolveConsultation(
      openConsultation({
        id: 'c7',
        task_id: 't7',
        from_agent: 'CMO',
        question: '포지셔닝 A/B 중 선택해주세요.',
        options: ['A', 'B'],
      }),
      'A로 합니다',
    );
    const text = formatConsultationForPrompt(rec);
    expect(text).toContain('창업자 협의 결과');
    expect(text).toContain('CMO가 창업자에게');
    expect(text).toContain('포지셔닝 A/B 중 선택해주세요.');
    expect(text).toContain('선택지: [A, B]');
    expect(text).toContain('A로 합니다');
    expect(text).toContain('이 답변을 반영해 작업을 완료하라.');
  });

  it('formats resolved consultation without options', () => {
    const rec = resolveConsultation(
      openConsultation({
        id: 'c8',
        task_id: 't8',
        from_agent: 'CPO',
        question: '어떤 기능을 먼저 출시할까요?',
      }),
      '로그인 기능부터 합시다',
    );
    const text = formatConsultationForPrompt(rec);
    expect(text).not.toContain('선택지:');
    expect(text).toContain('로그인 기능부터 합시다');
  });
});
