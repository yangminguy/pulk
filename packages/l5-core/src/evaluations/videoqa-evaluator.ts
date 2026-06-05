import fs from 'fs';
import path from 'path';
import type { VideoQAAnswer, EvalReport, CheckResult } from '../schemas/videoqa-result';
import type { GroundTruth } from './checks/types';
import {
  formatSchemaCheck,
  temporalGroundingCheck,
  contextualRelevanceCheck,
  factualConsistencyCheck,
  completenessCheck,
  robustnessCheck,
  guardrailSafetyCheck,
} from './checks';

const ALL_CHECKS = [
  formatSchemaCheck,
  temporalGroundingCheck,
  contextualRelevanceCheck,
  factualConsistencyCheck,
  completenessCheck,
  robustnessCheck,
  guardrailSafetyCheck,
] as const;

const PASS_THRESHOLD = 80;

export function evaluateVideoQA(
  answers: VideoQAAnswer[],
  groundTruths: GroundTruth[],
): EvalReport {
  const checks: CheckResult[] = ALL_CHECKS.map((c) => c.run(answers, groundTruths));

  const overall_score = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;

  const formatPassed = checks.find((c) => c.check === 'format_schema')!.passed;
  const guardrailPassed = checks.find((c) => c.check === 'guardrail_safety')!.passed;

  const passed = formatPassed && guardrailPassed && overall_score >= PASS_THRESHOLD;

  return {
    overall_score: Math.round(overall_score * 100) / 100,
    passed,
    checks,
    evaluated_at: new Date().toISOString(),
    sample_count: answers.length,
  };
}

function renderReportMarkdown(report: EvalReport): string {
  const lines: string[] = [
    '# VideoQA Evaluation Report',
    '',
    `- **Overall score:** ${report.overall_score}`,
    `- **Passed:** ${report.passed ? '✅ PASS' : '❌ FAIL'}`,
    `- **Samples:** ${report.sample_count}`,
    `- **Evaluated at:** ${report.evaluated_at}`,
    '',
    '## Checks',
    '',
    '| Check | Result | Score | Reason |',
    '|---|---|---:|---|',
  ];
  for (const c of report.checks) {
    lines.push(
      `| ${c.check} | ${c.passed ? 'PASS' : 'FAIL'} | ${c.score} | ${(c.reason ?? '').replace(/\|/g, '\\|')} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

// Persist a VideoQA eval report as both JSON and Markdown so QA results land in
// docs/reports for human review and CI artifacts.
export async function generateVideoQAReports(
  report: EvalReport,
  outputDir: string,
): Promise<{ jsonPath: string; mdPath: string }> {
  await fs.promises.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'videoqa_eval_result.json');
  const mdPath = path.join(outputDir, 'videoqa_eval_result.md');
  await fs.promises.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  await fs.promises.writeFile(mdPath, renderReportMarkdown(report), 'utf-8');
  return { jsonPath, mdPath };
}
