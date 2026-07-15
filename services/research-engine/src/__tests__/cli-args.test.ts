import { parseCliArgs } from '../cli-args';

describe('parseCliArgs', () => {
  it('parses --request JSON into a ResearchRequest', () => {
    const req = { topic: '콘텐츠 전략', researchPurpose: 'CONTENT_PLANNING' };
    const p = parseCliArgs(['--request', JSON.stringify(req)]);
    expect(p.error).toBeUndefined();
    expect(p.resume).toBe(false);
    expect(p.request).toEqual(req);
  });

  it('supports --flag=value form', () => {
    const req = { topic: 'x', researchPurpose: 'LEARNING' };
    const p = parseCliArgs([`--request=${JSON.stringify(req)}`]);
    expect(p.error).toBeUndefined();
    expect(p.request?.topic).toBe('x');
  });

  it('parses --resume without requiring --request', () => {
    const p = parseCliArgs(['--resume', 'run-20260714-abcd']);
    expect(p.error).toBeUndefined();
    expect(p.resume).toBe(true);
    expect(p.runId).toBe('run-20260714-abcd');
  });

  it('captures slack channel + thread', () => {
    const req = { topic: 't', researchPurpose: 'LEARNING' };
    const p = parseCliArgs([
      '--request', JSON.stringify(req),
      '--slack-channel', 'C123',
      '--slack-thread', '1700000000.000100',
    ]);
    expect(p.slackChannel).toBe('C123');
    expect(p.slackThread).toBe('1700000000.000100');
  });

  it('errors when neither --request nor --resume is given', () => {
    const p = parseCliArgs([]);
    expect(p.error).toMatch(/--request/);
  });

  it('errors on invalid --request JSON', () => {
    const p = parseCliArgs(['--request', '{not json']);
    expect(p.error).toMatch(/not valid JSON/);
  });

  it('errors when topic is empty', () => {
    const p = parseCliArgs(['--request', JSON.stringify({ topic: '  ', researchPurpose: 'LEARNING' })]);
    expect(p.error).toMatch(/topic/);
  });

  it('errors when --resume has no runId value', () => {
    const p = parseCliArgs(['--resume']);
    expect(p.error).toMatch(/requires a value|requires a runId/);
  });
});
