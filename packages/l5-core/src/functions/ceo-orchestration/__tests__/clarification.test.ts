import { resolveClarification } from '../clarification';

describe('resolveClarification', () => {
  it('returns no clarification when nothing is flagged', () => {
    expect(resolveClarification({})).toEqual({ needs: false, question: null, kind: null });
  });

  it('asks the general question when the plan lacks info', () => {
    const d = resolveClarification({
      needs_clarification: true,
      clarification_question: '어떤 고객 세그먼트를 대상으로 할까요?',
    });
    expect(d).toEqual({ needs: true, question: '어떤 고객 세그먼트를 대상으로 할까요?', kind: 'general' });
  });

  it('asks the business question when the business is ambiguous', () => {
    const d = resolveClarification({
      needs_business_clarification: true,
      business_clarification_question: '어느 사업에 대한 지시인가요?',
    });
    expect(d).toEqual({ needs: true, question: '어느 사업에 대한 지시인가요?', kind: 'business' });
  });

  it('prefers business ambiguity over a general gap when both are set', () => {
    const d = resolveClarification({
      needs_business_clarification: true,
      business_clarification_question: '어느 사업인가요?',
      needs_clarification: true,
      clarification_question: '목표가 모호합니다.',
    });
    expect(d.kind).toBe('business');
    expect(d.question).toBe('어느 사업인가요?');
  });

  it('does not ask when flagged but the question text is empty/whitespace', () => {
    expect(resolveClarification({ needs_clarification: true, clarification_question: '   ' }))
      .toEqual({ needs: false, question: null, kind: null });
    expect(resolveClarification({ needs_business_clarification: true, business_clarification_question: '' }))
      .toEqual({ needs: false, question: null, kind: null });
  });

  it('does not ask when a question exists but the flag is false', () => {
    expect(resolveClarification({ needs_clarification: false, clarification_question: '무시되어야 함' }))
      .toEqual({ needs: false, question: null, kind: null });
  });

  it('does not ask general clarification when the CEO can draft with assumptions', () => {
    const d = resolveClarification({
      goal: '새로운 founder workflow offer를 위한 PMF 메시지 실험 및 고객 아웃리치 제안 개발',
      assumptions: ['타겟은 초기 SaaS 창업자로 가정한다.'],
      success_criteria: ['PMF 메시지 3개와 내부용 아웃리치 초안을 만든다.'],
      needs_clarification: true,
      clarification_question: '타겟 세그먼트가 무엇인가요?',
    });
    expect(d).toEqual({ needs: false, question: null, kind: null });
  });

  it('still asks general clarification for founder-gated actions with missing details', () => {
    const d = resolveClarification({
      goal: '고객에게 메시지 발송',
      approval_required: true,
      needs_clarification: true,
      clarification_question: '어떤 고객에게 어떤 메시지를 발송할까요?',
    });
    expect(d).toEqual({ needs: true, question: '어떤 고객에게 어떤 메시지를 발송할까요?', kind: 'general' });
  });
});
