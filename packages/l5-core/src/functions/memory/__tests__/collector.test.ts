import { collectInsights } from '../collector';

describe('collectInsights', () => {
  it('excludes tasks with empty insight_to_record', () => {
    const result = collectInsights([
      { task_id: 't1', assigned_agent: 'CMO', output: { insight_to_record: '' } },
    ]);
    expect(result).toHaveLength(0);
  });

  it('excludes tasks with insight shorter than 10 characters', () => {
    const result = collectInsights([
      { task_id: 't1', assigned_agent: 'CMO', output: { insight_to_record: 'short' } },
    ]);
    expect(result).toHaveLength(0);
  });

  it('excludes tasks with no output field', () => {
    const result = collectInsights([
      { task_id: 't1', assigned_agent: 'CMO' },
    ]);
    expect(result).toHaveLength(0);
  });

  it('includes tasks with valid insight (10+ chars)', () => {
    const result = collectInsights([
      {
        task_id: 't1',
        assigned_agent: 'CMO',
        output: { insight_to_record: '고객 인터뷰에서 핵심 불편 포인트 발견' },
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].source_task_id).toBe('t1');
    expect(result[0].source_agent).toBe('CMO');
  });

  it('sets pii_level to "high" when risk_level is D5', () => {
    const result = collectInsights([
      {
        task_id: 't1',
        assigned_agent: 'CRO',
        output: { insight_to_record: '개인 식별 가능 데이터 포함된 인사이트', risk_level: 'D5' },
      },
    ]);
    expect(result[0].pii_level).toBe('high');
  });

  it('sets pii_level to "high" when risk_level is D4', () => {
    const result = collectInsights([
      {
        task_id: 't1',
        assigned_agent: 'CRO',
        output: { insight_to_record: '고위험 작업에서 도출된 중요 인사이트', risk_level: 'D4' },
      },
    ]);
    expect(result[0].pii_level).toBe('high');
  });

  it('sets pii_level to "low" when risk_level is D3', () => {
    const result = collectInsights([
      {
        task_id: 't1',
        assigned_agent: 'CFO',
        output: { insight_to_record: '재무 분석에서 도출된 비용 절감 인사이트', risk_level: 'D3' },
      },
    ]);
    expect(result[0].pii_level).toBe('low');
  });

  it('sets pii_level to "none" when risk_level is D1', () => {
    const result = collectInsights([
      {
        task_id: 't1',
        assigned_agent: 'CTO',
        output: { insight_to_record: '기술 스택 선택에 대한 일반적인 인사이트', risk_level: 'D1' },
      },
    ]);
    expect(result[0].pii_level).toBe('none');
  });

  it('sets pii_level to "none" when risk_level is absent', () => {
    const result = collectInsights([
      {
        task_id: 't1',
        assigned_agent: 'CTO',
        output: { insight_to_record: '리스크 레벨 없는 작업의 일반 인사이트' },
      },
    ]);
    expect(result[0].pii_level).toBe('none');
  });

  it('captures workflow_improvement_suggestion', () => {
    const result = collectInsights([
      {
        task_id: 't1',
        assigned_agent: 'CMO',
        output: {
          insight_to_record: '마케팅 채널별 전환율 차이 발견',
          workflow_improvement_suggestion: '주간 채널 리뷰 추가 필요',
        },
      },
    ]);
    expect(result[0].workflow_improvement).toBe('주간 채널 리뷰 추가 필요');
  });

  it('filters mixed valid and invalid tasks correctly', () => {
    const result = collectInsights([
      { task_id: 't1', assigned_agent: 'CMO', output: { insight_to_record: '' } },
      { task_id: 't2', assigned_agent: 'CTO', output: { insight_to_record: 'too short' } },
      {
        task_id: 't3',
        assigned_agent: 'CRO',
        output: { insight_to_record: '충분히 긴 인사이트 텍스트입니다' },
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].source_task_id).toBe('t3');
  });
});
