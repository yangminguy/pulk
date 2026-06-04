import fs from 'fs';
import path from 'path';
import { evaluateVideoQA, generateVideoQAReports } from '../evaluations/videoqa-evaluator';
import { VideoQAAnswerSchema } from '../schemas/videoqa-result';
import type { VideoQAAnswer } from '../schemas/videoqa-result';
import type { GroundTruth } from '../evaluations/checks/types';

function makeAnswer(overrides: Partial<VideoQAAnswer> = {}): VideoQAAnswer {
  return {
    question_id: 'q1',
    question: 'What happened at the start?',
    answer: 'The presenter introduced the topic',
    timestamp_start: 0,
    timestamp_end: 10,
    confidence: 0.9,
    ...overrides,
  };
}

function makeGT(overrides: Partial<GroundTruth> = {}): GroundTruth {
  return {
    question_id: 'q1',
    expected_answer: 'The presenter introduced the topic',
    timestamp_start: 0,
    timestamp_end: 10,
    sub_questions: ['who', 'what'],
    ...overrides,
  };
}

describe('VideoQAAnswerSchema', () => {
  it('validates a correct answer', () => {
    const result = VideoQAAnswerSchema.safeParse(makeAnswer());
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = VideoQAAnswerSchema.safeParse({ question_id: 'q1' });
    expect(result.success).toBe(false);
  });

  it('rejects timestamp_end < timestamp_start', () => {
    const result = VideoQAAnswerSchema.safeParse(
      makeAnswer({ timestamp_start: 10, timestamp_end: 5 }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects confidence out of range', () => {
    expect(VideoQAAnswerSchema.safeParse(makeAnswer({ confidence: 1.5 })).success).toBe(false);
    expect(VideoQAAnswerSchema.safeParse(makeAnswer({ confidence: -0.1 })).success).toBe(false);
  });
});

describe('evaluateVideoQA', () => {
  it('returns 7 check results', () => {
    const report = evaluateVideoQA([makeAnswer()], [makeGT()]);
    expect(report.checks).toHaveLength(7);
  });

  it('passes when all answers are valid and match ground truth', () => {
    const answers = [
      makeAnswer({ question_id: 'q1' }),
      makeAnswer({ question_id: 'q2', answer: 'The presenter introduced the topic' }),
    ];
    const gts = [
      makeGT({ question_id: 'q1' }),
      makeGT({ question_id: 'q2' }),
    ];
    const report = evaluateVideoQA(answers, gts);
    expect(report.passed).toBe(true);
    expect(report.overall_score).toBeGreaterThanOrEqual(80);
    expect(report.sample_count).toBe(2);
  });

  it('fails when format check fails (invalid schema)', () => {
    // Evaluator receives already-typed answers, but format check re-validates.
    // We simulate by passing an answer with empty question_id (schema requires min 1).
    const badAnswer = { ...makeAnswer(), question_id: '' } as unknown as VideoQAAnswer;
    const report = evaluateVideoQA([badAnswer], [makeGT()]);
    const formatCheck = report.checks.find((c) => c.check === 'format_schema');
    expect(formatCheck!.passed).toBe(false);
    expect(report.passed).toBe(false);
  });

  it('fails when guardrail detects PII', () => {
    const piiAnswer = makeAnswer({ answer: 'Contact me at user@example.com for details' });
    const report = evaluateVideoQA([piiAnswer], [makeGT()]);
    const guardrail = report.checks.find((c) => c.check === 'guardrail_safety');
    expect(guardrail!.passed).toBe(false);
    expect(report.passed).toBe(false);
  });

  it('temporal grounding fails with large offset', () => {
    const answer = makeAnswer({ timestamp_start: 50, timestamp_end: 60 });
    const report = evaluateVideoQA([answer], [makeGT()]);
    const temporal = report.checks.find((c) => c.check === 'temporal_grounding');
    expect(temporal!.passed).toBe(false);
  });

  it('robustness flags low-confidence answers', () => {
    const lowConf = makeAnswer({ confidence: 0.1 });
    const report = evaluateVideoQA([lowConf], [makeGT()]);
    const robustness = report.checks.find((c) => c.check === 'robustness');
    expect(robustness!.passed).toBe(false);
  });

  it('completeness passes when sub_questions are covered', () => {
    const answer = makeAnswer({ answer: 'The presenter (who) introduced what the topic is about' });
    const gt = makeGT({ sub_questions: ['presenter', 'topic'] });
    const report = evaluateVideoQA([answer], [gt]);
    const completeness = report.checks.find((c) => c.check === 'completeness');
    expect(completeness!.passed).toBe(true);
  });

  it('report includes evaluated_at timestamp', () => {
    const report = evaluateVideoQA([makeAnswer()], [makeGT()]);
    expect(report.evaluated_at).toBeDefined();
    expect(() => new Date(report.evaluated_at)).not.toThrow();
  });
});

describe('VideoQA Acceptance Criteria', () => {
  it('has test:videoqa script in root package.json', () => {
    const rootPkgPath = path.resolve(__dirname, '../../../../package.json');
    const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
    expect(pkg.scripts).toHaveProperty('test:videoqa');
  });

  it('generates report files (JSON and MD) in docs/reports', async () => {
    const report = evaluateVideoQA([makeAnswer()], [makeGT()]);
    const docsDir = path.resolve(__dirname, '../../../../docs/reports');
    const jsonPath = path.join(docsDir, 'videoqa_eval_result.json');
    const mdPath = path.join(docsDir, 'videoqa_eval_result.md');
    
    // clean up if exists
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);

    await generateVideoQAReports(report, docsDir);

    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);
  });
});
