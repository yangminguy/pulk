import { buildVerificationPrompt, parseVerdict } from '../verify';

describe('buildVerificationPrompt', () => {
  it('embeds the requester role, criteria, and serialised output', () => {
    const { system, user } = buildVerificationPrompt({
      from_agent: 'CMO',
      to_agent: 'CTO',
      objective: '영상 생성기를 9:16로 출력하게 수정',
      acceptance_criteria: ['preset에 brand_color 반영', 'generate가 9:16 출력'],
      workOutput: { recommendation: '완료' },
    });
    expect(system).toContain('CMO');
    expect(system).toContain('CTO');
    expect(system).toContain('JSON');
    expect(user).toContain('1. preset에 brand_color 반영');
    expect(user).toContain('2. generate가 9:16 출력');
    expect(user).toContain('완료');
  });

  it('truncates very long output', () => {
    const { user } = buildVerificationPrompt({
      from_agent: 'CMO',
      to_agent: 'CTO',
      objective: 'x',
      acceptance_criteria: ['c'],
      workOutput: 'A'.repeat(10000),
    });
    expect(user.length).toBeLessThan(7000);
  });
});

describe('parseVerdict', () => {
  it('parses a clean pass', () => {
    expect(parseVerdict('{"pass": true, "feedback": ""}')).toEqual({ pass: true, feedback: '' });
  });

  it('forces empty feedback when pass=true', () => {
    expect(parseVerdict('{"pass": true, "feedback": "좋음"}')).toEqual({ pass: true, feedback: '' });
  });

  it('parses a fail with feedback', () => {
    expect(parseVerdict('{"pass": false, "feedback": "9:16 아님"}')).toEqual({
      pass: false,
      feedback: '9:16 아님',
    });
  });

  it('extracts JSON from fenced / prose-wrapped replies', () => {
    const text = '검토했습니다.\n```json\n{"pass": false, "feedback": "preset 누락"}\n```';
    expect(parseVerdict(text)).toEqual({ pass: false, feedback: 'preset 누락' });
  });

  it('treats missing JSON as fail (never resolves on garbage)', () => {
    const v = parseVerdict('네 통과입니다');
    expect(v.pass).toBe(false);
    expect(v.feedback).toContain('파싱 실패');
  });

  it('treats malformed JSON as fail', () => {
    const v = parseVerdict('{pass: true}'); // unquoted key → JSON.parse throws
    expect(v.pass).toBe(false);
    expect(v.feedback).toContain('파싱 실패');
  });

  it('supplies a default reason when fail feedback is absent', () => {
    expect(parseVerdict('{"pass": false}')).toEqual({
      pass: false,
      feedback: '수용 기준 미충족(사유 미기재)',
    });
  });
});
