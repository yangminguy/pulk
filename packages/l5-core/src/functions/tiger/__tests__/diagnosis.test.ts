import {
  selectDiagnosisModel,
  buildIncidentDiagnosisPrompt,
  parseIncidentDiagnosis,
  type IncidentForDiagnosis,
} from '../diagnosis';

const base: IncidentForDiagnosis = {
  target_label: '키 콘텐츠 보고서',
  incident_type: 'stalled',
  error_summary: '입력 대기',
  heartbeat_evidence: 'updatedAt 30분 정지',
  target_repo: 'packages/l5-core',
};

describe('tiger diagnosis', () => {
  it('selectDiagnosisModel: failed → opus', () => {
    expect(selectDiagnosisModel({ ...base, incident_type: 'failed' })).toBe('claude-opus-4-8');
  });
  it('selectDiagnosisModel: 단순 stall → sonnet', () => {
    expect(selectDiagnosisModel(base)).toBe('claude-sonnet-4-6');
  });
  it('selectDiagnosisModel: 긴 오류 → opus', () => {
    expect(selectDiagnosisModel({ ...base, error_summary: 'x'.repeat(250) })).toBe('claude-opus-4-8');
  });

  it('buildIncidentDiagnosisPrompt: 핵심 필드 포함 + JSON 강제', () => {
    const p = buildIncidentDiagnosisPrompt(base);
    expect(p).toContain('키 콘텐츠 보고서');
    expect(p).toContain('packages/l5-core');
    expect(p).toContain('입력 대기');
    expect(p).toContain('JSON');
  });

  it('parseIncidentDiagnosis: 정상 JSON', () => {
    const r = parseIncidentDiagnosis('{"diagnosis":"세션 만료","proposed_fix":"쿠키 연장"}');
    expect(r).toEqual({ diagnosis: '세션 만료', proposed_fix: '쿠키 연장' });
  });
  it('parseIncidentDiagnosis: 코드펜스/잡텍스트 내성', () => {
    const raw = '분석 결과입니다:\n```json\n{"diagnosis":"A","proposed_fix":"B"}\n```\n끝';
    expect(parseIncidentDiagnosis(raw)).toEqual({ diagnosis: 'A', proposed_fix: 'B' });
  });
  it('parseIncidentDiagnosis: 잘못된 JSON → null', () => {
    expect(parseIncidentDiagnosis('not json')).toBeNull();
    expect(parseIncidentDiagnosis('')).toBeNull();
  });
  it('parseIncidentDiagnosis: 필드 누락 → null', () => {
    expect(parseIncidentDiagnosis('{"diagnosis":"A"}')).toBeNull();
    expect(parseIncidentDiagnosis('{"diagnosis":"","proposed_fix":"B"}')).toBeNull();
  });
});
