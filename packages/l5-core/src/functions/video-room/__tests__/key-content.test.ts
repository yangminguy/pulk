import {
  createKeyContentCandidate,
  selectKeyContent,
  approveKeyContent,
  requestKeyContentRevision,
} from '../key-content';
import type { ViewtrapReference, ConsumerStage } from '../types';

const BASE_CANDIDATE_INPUT = {
  id: 'cand-1',
  title: '퇴직 후 컨설팅 수익화',
  target_problem: '은퇴 후 수입이 없다',
  consumer_stages: ['현상', '욕구'] as ConsumerStage[],
  sales_logic: '전문성을 상품화하면 월 500 가능',
  cta: '무료 상담 신청',
  why_this_can_sell: '40대 직장인 불안 심리 정조준',
};

const makeEvidence = (n: number): ViewtrapReference => ({
  id: `vt-${n}`,
  content_plan_id: 'plan-1',
  source: 'viewtrap',
  title: `Evidence video ${n}`,
  url: `https://viewtrap.com/${n}`,
  selected_reason: 'high view growth',
  consumer_stage: '현상',
});

describe('createKeyContentCandidate', () => {
  it('creates a candidate with not_researched default', () => {
    const cand = createKeyContentCandidate(BASE_CANDIDATE_INPUT);
    expect(cand.id).toBe('cand-1');
    expect(cand.title).toBe('퇴직 후 컨설팅 수익화');
    expect(cand.research_status).toBe('not_researched');
    expect(cand.consumer_stages).toEqual(['현상', '욕구']);
  });

  it('accepts an explicit research_status', () => {
    const cand = createKeyContentCandidate({
      ...BASE_CANDIDATE_INPUT,
      research_status: 'validated',
    });
    expect(cand.research_status).toBe('validated');
  });

  it('throws when id is empty', () => {
    expect(() => createKeyContentCandidate({ ...BASE_CANDIDATE_INPUT, id: '' })).toThrow(
      'id must not be empty',
    );
  });

  it('throws when title is empty', () => {
    expect(() => createKeyContentCandidate({ ...BASE_CANDIDATE_INPUT, title: '  ' })).toThrow(
      'title must not be empty',
    );
  });

  it('throws when target_problem is empty', () => {
    expect(() =>
      createKeyContentCandidate({ ...BASE_CANDIDATE_INPUT, target_problem: '' }),
    ).toThrow('target_problem must not be empty');
  });

  it('throws when sales_logic is empty', () => {
    expect(() =>
      createKeyContentCandidate({ ...BASE_CANDIDATE_INPUT, sales_logic: '' }),
    ).toThrow('sales_logic must not be empty');
  });

  it('throws when cta is empty', () => {
    expect(() => createKeyContentCandidate({ ...BASE_CANDIDATE_INPUT, cta: '' })).toThrow(
      'cta must not be empty',
    );
  });

  it('throws when why_this_can_sell is empty', () => {
    expect(() =>
      createKeyContentCandidate({ ...BASE_CANDIDATE_INPUT, why_this_can_sell: '' }),
    ).toThrow('why_this_can_sell must not be empty');
  });
});

describe('selectKeyContent', () => {
  const candidate = createKeyContentCandidate(BASE_CANDIDATE_INPUT);

  it('creates a SelectedKeyContent with approval_status draft', () => {
    const selected = selectKeyContent(candidate, {
      id: 'sel-1',
      viewtrap_evidence: [makeEvidence(1)],
      selected_reason: '조회수 성장 높은 포맷과 일치',
    });
    expect(selected.id).toBe('sel-1');
    expect(selected.title).toBe(candidate.title);
    expect(selected.core_problem).toBe(candidate.target_problem);
    expect(selected.approval_status).toBe('draft');
    expect(selected.viewtrap_evidence).toHaveLength(1);
    expect(selected.selected_reason).toBe('조회수 성장 높은 포맷과 일치');
  });

  it('maps candidate fields correctly', () => {
    const selected = selectKeyContent(candidate, {
      id: 'sel-2',
      viewtrap_evidence: [makeEvidence(1), makeEvidence(2)],
      selected_reason: 'strong match',
    });
    expect(selected.consumer_stages).toEqual(['현상', '욕구']);
    expect(selected.sales_logic).toBe(candidate.sales_logic);
    expect(selected.cta).toBe(candidate.cta);
  });

  it('throws when viewtrap_evidence is empty', () => {
    expect(() =>
      selectKeyContent(candidate, {
        id: 'sel-3',
        viewtrap_evidence: [],
        selected_reason: 'no evidence',
      }),
    ).toThrow('cannot select key content without viewtrap_evidence');
  });

  it('throws when selected_reason is empty', () => {
    expect(() =>
      selectKeyContent(candidate, {
        id: 'sel-4',
        viewtrap_evidence: [makeEvidence(1)],
        selected_reason: '',
      }),
    ).toThrow('selected_reason must not be empty');
  });

  it('throws when id is empty', () => {
    expect(() =>
      selectKeyContent(candidate, {
        id: '',
        viewtrap_evidence: [makeEvidence(1)],
        selected_reason: 'reason',
      }),
    ).toThrow('id must not be empty');
  });
});

describe('approveKeyContent', () => {
  it('transitions approval_status to approved', () => {
    const candidate = createKeyContentCandidate(BASE_CANDIDATE_INPUT);
    const selected = selectKeyContent(candidate, {
      id: 'sel-1',
      viewtrap_evidence: [makeEvidence(1)],
      selected_reason: 'great match',
    });
    const approved = approveKeyContent(selected);
    expect(approved.approval_status).toBe('approved');
    expect(approved.id).toBe(selected.id);
  });

  it('does not mutate the original', () => {
    const candidate = createKeyContentCandidate(BASE_CANDIDATE_INPUT);
    const selected = selectKeyContent(candidate, {
      id: 'sel-1',
      viewtrap_evidence: [makeEvidence(1)],
      selected_reason: 'reason',
    });
    approveKeyContent(selected);
    expect(selected.approval_status).toBe('draft');
  });
});

describe('requestKeyContentRevision', () => {
  it('transitions approval_status to needs_revision', () => {
    const candidate = createKeyContentCandidate(BASE_CANDIDATE_INPUT);
    const selected = selectKeyContent(candidate, {
      id: 'sel-1',
      viewtrap_evidence: [makeEvidence(1)],
      selected_reason: 'reason',
    });
    const revised = requestKeyContentRevision(selected);
    expect(revised.approval_status).toBe('needs_revision');
  });

  it('does not mutate the original', () => {
    const candidate = createKeyContentCandidate(BASE_CANDIDATE_INPUT);
    const selected = selectKeyContent(candidate, {
      id: 'sel-1',
      viewtrap_evidence: [makeEvidence(1)],
      selected_reason: 'reason',
    });
    requestKeyContentRevision(selected);
    expect(selected.approval_status).toBe('draft');
  });
});
