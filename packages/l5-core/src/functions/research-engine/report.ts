// research-engine — report assembly + rendering (§5.2).
//
// assembleReport builds the canonical SynthesisReport from run artifacts (pure).
// renderReportMarkdown renders purpose-specific markdown; every purpose's
// required sections are always emitted (empty → "(없음)") so §9's section-
// presence test is deterministic. No LLM here.

import {
  BusinessSection,
  ContentPlanningSection,
  DecisionSection,
  KeyConcept,
  KnowledgeAtom,
  LearningSection,
  Market,
  MethodologySummary,
  OutputLanguage,
  ReportVideoSource,
  ResearchPurpose,
  ResolvedResearchRequest,
  SynthesisReport,
  SynthesizedPrinciple,
  VerificationSummary,
  VerificationStatus,
} from './types';
import { partitionPrinciples } from './synthesis';

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface AssembleReportInput {
  runId: string;
  request: ResolvedResearchRequest;
  principles: SynthesizedPrinciple[];
  unifiedTheory: string | null;
  atoms: KnowledgeAtom[];
  videoSources: ReportVideoSource[];
  methodology: MethodologySummary;
  generatedAt: string;
  keyConcepts?: KeyConcept[];
  limitations?: string[];
  furtherQuestions?: string[];
  executiveSummary?: string[];
  learning?: LearningSection;
  contentPlanning?: ContentPlanningSection;
  business?: BusinessSection;
  decision?: DecisionSection;
}

export function summarizeVerification(principles: SynthesizedPrinciple[]): VerificationSummary {
  const byStatus: Partial<Record<VerificationStatus, number>> = {};
  for (const p of principles) {
    byStatus[p.verificationStatus] = (byStatus[p.verificationStatus] ?? 0) + 1;
  }
  const notes: string[] = [];
  if ((byStatus.TRANSCRIPT_AMBIGUOUS ?? 0) > 0) {
    notes.push('일부 주장은 타임스탬프 구간에서 근거 어휘를 확인하지 못했습니다(TRANSCRIPT_AMBIGUOUS).');
  }
  notes.push('언급 빈도는 검증이 아닙니다 — 공식문서 검증을 통과한 항목만 VERIFIED입니다.');
  return { byStatus, notes };
}

/** Default executive summary derived from the top principles (deterministic). */
function defaultExecutiveSummary(principles: SynthesizedPrinciple[]): string[] {
  return principles
    .filter((p) => p.kind === 'common')
    .sort((a, b) => b.independentChannelCount - a.independentChannelCount)
    .slice(0, 3)
    .map((p) => p.statement);
}

export function assembleReport(input: AssembleReportInput): SynthesisReport {
  const parts = partitionPrinciples(input.principles);
  const report: SynthesisReport = {
    runId: input.runId,
    topic: input.request.topic,
    researchPurpose: input.request.researchPurpose,
    researchQuestion: input.request.researchQuestion,
    outputLanguage: input.request.outputLanguage,
    generatedAt: input.generatedAt,
    executiveSummary:
      input.executiveSummary && input.executiveSummary.length > 0
        ? input.executiveSummary
        : defaultExecutiveSummary(input.principles),
    methodology: input.methodology,
    keyConcepts: input.keyConcepts ?? [],
    unifiedTheory: input.unifiedTheory,
    commonClaims: parts.common,
    conflictClaims: parts.conflict,
    krUsDifferences: parts.krUsDiff,
    verification: summarizeVerification(input.principles),
    videoSources: input.videoSources,
    limitations: input.limitations ?? [],
    furtherQuestions: input.furtherQuestions ?? [],
  };
  // Attach only the purpose-relevant section.
  const p = input.request.researchPurpose;
  if (p === 'LEARNING' || p === 'TECHNICAL_RESEARCH') {
    report.learning = input.learning ?? emptyLearning();
  } else if (p === 'CONTENT_PLANNING') {
    report.contentPlanning = input.contentPlanning ?? emptyContentPlanning();
  } else if (p === 'BUSINESS_RESEARCH') {
    report.business = input.business ?? emptyBusiness();
  } else if (p === 'DECISION_SUPPORT') {
    report.decision = input.decision ?? emptyDecision();
  }
  return report;
}

export function emptyLearning(): LearningSection {
  return {
    prerequisites: [],
    glossary: [],
    learningRoadmap: [],
    exercises: [],
    implementationPatterns: [],
    commonMistakes: [],
    docsVerification: [],
  };
}
export function emptyContentPlanning(): ContentPlanningSection {
  return { targetProblems: [], coreMessages: [], differentiators: [], contentIdeas: [], reusableClaims: [] };
}
export function emptyBusiness(): BusinessSection {
  return { marketSignals: [], opportunities: [], risks: [], recommendations: [] };
}
export function emptyDecision(): DecisionSection {
  return { options: [], tradeoffs: [], recommendation: '', evidenceBasis: [] };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

interface Labels {
  summary: string;
  question: string;
  methodology: string;
  keyConcepts: string;
  unifiedTheory: string;
  common: string;
  conflict: string;
  krUs: string;
  verification: string;
  sources: string;
  limitations: string;
  further: string;
  none: string;
  // learning/technical
  prerequisites: string;
  glossary: string;
  roadmap: string;
  exercises: string;
  patterns: string;
  mistakes: string;
  docsVerify: string;
  // content planning
  targetProblems: string;
  coreMessages: string;
  differentiators: string;
  contentIdeas: string;
  reusableClaims: string;
  // business
  marketSignals: string;
  opportunities: string;
  risks: string;
  recommendations: string;
  // decision
  options: string;
  tradeoffs: string;
  recommendation: string;
  evidenceBasis: string;
}

const KO: Labels = {
  summary: '한눈에 보는 결론',
  question: '리서치 질문',
  methodology: '조사 방법·선정 영상',
  keyConcepts: '핵심 개념',
  unifiedTheory: '통합 이론',
  common: '공통 주장',
  conflict: '충돌 주장',
  krUs: 'KR·US 차이',
  verification: '검증 결과',
  sources: '영상별 출처·타임스탬프',
  limitations: '한계',
  further: '추가 질문',
  none: '(없음)',
  prerequisites: '선수 지식',
  glossary: '용어 사전',
  roadmap: '학습 로드맵',
  exercises: '실습 과제',
  patterns: '구현 패턴',
  mistakes: '흔한 실수',
  docsVerify: '공식문서 검증 결과',
  targetProblems: '타깃 문제',
  coreMessages: '핵심 메시지',
  differentiators: '차별화 관점',
  contentIdeas: '콘텐츠 아이디어',
  reusableClaims: '재사용 가능한 주장·출처',
  marketSignals: '시장 신호',
  opportunities: '기회',
  risks: '리스크',
  recommendations: '권장 사항',
  options: '선택지',
  tradeoffs: '트레이드오프',
  recommendation: '권장안',
  evidenceBasis: '근거',
};

const EN: Labels = {
  summary: 'Executive Summary',
  question: 'Research Question',
  methodology: 'Methodology & Selected Videos',
  keyConcepts: 'Key Concepts',
  unifiedTheory: 'Unified Theory',
  common: 'Common Claims',
  conflict: 'Conflicting Claims',
  krUs: 'KR·US Differences',
  verification: 'Verification Results',
  sources: 'Sources & Timestamps',
  limitations: 'Limitations',
  further: 'Further Questions',
  none: '(none)',
  prerequisites: 'Prerequisites',
  glossary: 'Glossary',
  roadmap: 'Learning Roadmap',
  exercises: 'Exercises',
  patterns: 'Implementation Patterns',
  mistakes: 'Common Mistakes',
  docsVerify: 'Official-Docs Verification',
  targetProblems: 'Target Problems',
  coreMessages: 'Core Messages',
  differentiators: 'Differentiators',
  contentIdeas: 'Content Ideas',
  reusableClaims: 'Reusable Claims & Sources',
  marketSignals: 'Market Signals',
  opportunities: 'Opportunities',
  risks: 'Risks',
  recommendations: 'Recommendations',
  options: 'Options',
  tradeoffs: 'Trade-offs',
  recommendation: 'Recommendation',
  evidenceBasis: 'Evidence Basis',
};

function labelsFor(lang: OutputLanguage): Labels {
  return lang === 'en' ? EN : KO;
}

function bulletList(items: string[], none: string): string {
  if (items.length === 0) return `${none}\n`;
  return items.map((i) => `- ${i}`).join('\n') + '\n';
}

function principleBlock(principles: SynthesizedPrinciple[], none: string): string {
  if (principles.length === 0) return `${none}\n`;
  return (
    principles
      .map((p) => {
        const src = p.representativeSources.map((s) => s.sourceUrl).join(', ');
        return (
          `- **${p.statement}** ` +
          `(영상 ${p.mentionVideoCount} · 독립 채널 ${p.independentChannelCount} · ` +
          `${p.evidenceQuality} · ${p.verificationStatus})` +
          (src ? `\n  출처: ${src}` : '')
        );
      })
      .join('\n') + '\n'
  );
}

function marketBreakdownStr(mb: Record<Market, number>): string {
  return Object.entries(mb)
    .map(([m, n]) => `${m} ${n}`)
    .join(', ');
}

function renderPurposeSection(report: SynthesisReport, L: Labels): string {
  const out: string[] = [];
  if (report.learning) {
    const s = report.learning;
    out.push(`## ${L.prerequisites}\n\n${bulletList(s.prerequisites, L.none)}`);
    out.push(
      `## ${L.glossary}\n\n${bulletList(s.glossary.map((g) => `${g.term}: ${g.definition}`), L.none)}`,
    );
    out.push(`## ${L.roadmap}\n\n${bulletList(s.learningRoadmap, L.none)}`);
    out.push(`## ${L.exercises}\n\n${bulletList(s.exercises, L.none)}`);
    out.push(`## ${L.patterns}\n\n${bulletList(s.implementationPatterns, L.none)}`);
    out.push(`## ${L.mistakes}\n\n${bulletList(s.commonMistakes, L.none)}`);
    out.push(
      `## ${L.docsVerify}\n\n${bulletList(
        s.docsVerification.map(
          (d) => `${d.claim} — ${d.status}${d.sourceUrl ? ` (${d.sourceUrl})` : ''}`,
        ),
        L.none,
      )}`,
    );
  } else if (report.contentPlanning) {
    const s = report.contentPlanning;
    out.push(`## ${L.targetProblems}\n\n${bulletList(s.targetProblems, L.none)}`);
    out.push(`## ${L.coreMessages}\n\n${bulletList(s.coreMessages, L.none)}`);
    out.push(`## ${L.differentiators}\n\n${bulletList(s.differentiators, L.none)}`);
    out.push(`## ${L.contentIdeas}\n\n${bulletList(s.contentIdeas, L.none)}`);
    out.push(
      `## ${L.reusableClaims}\n\n${bulletList(s.reusableClaims.map((r) => r.sourceUrl), L.none)}`,
    );
  } else if (report.business) {
    const s = report.business;
    out.push(`## ${L.marketSignals}\n\n${bulletList(s.marketSignals, L.none)}`);
    out.push(`## ${L.opportunities}\n\n${bulletList(s.opportunities, L.none)}`);
    out.push(`## ${L.risks}\n\n${bulletList(s.risks, L.none)}`);
    out.push(`## ${L.recommendations}\n\n${bulletList(s.recommendations, L.none)}`);
  } else if (report.decision) {
    const s = report.decision;
    out.push(`## ${L.options}\n\n${bulletList(s.options, L.none)}`);
    out.push(`## ${L.tradeoffs}\n\n${bulletList(s.tradeoffs, L.none)}`);
    out.push(`## ${L.recommendation}\n\n${s.recommendation || L.none}\n`);
    out.push(`## ${L.evidenceBasis}\n\n${bulletList(s.evidenceBasis, L.none)}`);
  }
  return out.join('\n');
}

export function renderReportMarkdown(report: SynthesisReport): string {
  const L = labelsFor(report.outputLanguage);
  const out: string[] = [];
  out.push(`# ${report.topic}`);
  out.push('');
  out.push(`## ${L.summary}\n\n${bulletList(report.executiveSummary, L.none)}`);
  out.push(`## ${L.question}\n\n${report.researchQuestion || L.none}\n`);

  const m = report.methodology;
  out.push(
    `## ${L.methodology}\n\n` +
      `- 후보 ${m.candidateCount} · 분석 ${m.analyzedCount} · 검색어 ${m.queriesUsed}\n` +
      `- 시장 분포: ${marketBreakdownStr(m.marketBreakdown)}\n` +
      `- 자막 없음 스킵: ${m.skippedNoTranscript.length} · 보충(refill): ${m.refillUsed}\n`,
  );

  out.push(
    `## ${L.keyConcepts}\n\n${bulletList(
      report.keyConcepts.map((c) => `${c.term}: ${c.definition}`),
      L.none,
    )}`,
  );
  out.push(`## ${L.unifiedTheory}\n\n${report.unifiedTheory || L.none}\n`);
  out.push(`## ${L.common}\n\n${principleBlock(report.commonClaims, L.none)}`);
  out.push(`## ${L.conflict}\n\n${principleBlock(report.conflictClaims, L.none)}`);
  out.push(`## ${L.krUs}\n\n${principleBlock(report.krUsDifferences, L.none)}`);

  const vlines = Object.entries(report.verification.byStatus).map(([s, n]) => `${s}: ${n}`);
  out.push(
    `## ${L.verification}\n\n${bulletList(vlines, L.none)}${report.verification.notes
      .map((n) => `> ${n}`)
      .join('\n')}\n`,
  );

  out.push(
    `## ${L.sources}\n\n${bulletList(
      report.videoSources.map(
        (v) =>
          `[${v.market}] ${v.title} — ${v.channelTitle} (${v.transcriptSource}) ${v.sourceUrl}`,
      ),
      L.none,
    )}`,
  );

  const purpose = renderPurposeSection(report, L);
  if (purpose.trim()) out.push(purpose);

  out.push(`## ${L.limitations}\n\n${bulletList(report.limitations, L.none)}`);
  out.push(`## ${L.further}\n\n${bulletList(report.furtherQuestions, L.none)}`);

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Appendix rendering (§12-A) — the reliability-evidence subset of the canonical
// report, rendered under a single "부록" heading with H3 sub-sections so it can
// be appended to the book manuscript. NO truncation — full claim statements.
// ---------------------------------------------------------------------------

export function renderAppendixMarkdown(report: SynthesisReport): string {
  const L = labelsFor(report.outputLanguage);
  const appendixTitle = report.outputLanguage === 'en' ? 'Appendix — Reliability Evidence' : '부록 — 신뢰성 근거';
  const out: string[] = [];
  out.push(`## ${appendixTitle}`, '');

  const m = report.methodology;
  out.push(
    `### ${L.methodology}\n\n` +
      `- 후보 ${m.candidateCount} · 분석 ${m.analyzedCount} · 검색어 ${m.queriesUsed}\n` +
      `- 시장 분포: ${marketBreakdownStr(m.marketBreakdown)}\n` +
      `- 자막 없음 스킵: ${m.skippedNoTranscript.length} · 보충(refill): ${m.refillUsed}\n`,
  );

  out.push(`### ${L.common}\n\n${principleBlock(report.commonClaims, L.none)}`);
  out.push(`### ${L.conflict}\n\n${principleBlock(report.conflictClaims, L.none)}`);
  out.push(`### ${L.krUs}\n\n${principleBlock(report.krUsDifferences, L.none)}`);

  const vlines = Object.entries(report.verification.byStatus).map(([s, n]) => `${s}: ${n}`);
  out.push(
    `### ${L.verification}\n\n${bulletList(vlines, L.none)}${report.verification.notes
      .map((n) => `> ${n}`)
      .join('\n')}\n`,
  );

  out.push(
    `### ${L.sources}\n\n${bulletList(
      report.videoSources.map(
        (v) => `[${v.market}] ${v.title} — ${v.channelTitle} (${v.transcriptSource}) ${v.sourceUrl}`,
      ),
      L.none,
    )}`,
  );

  out.push(`### ${L.limitations}\n\n${bulletList(report.limitations, L.none)}`);
  out.push(`### ${L.further}\n\n${bulletList(report.furtherQuestions, L.none)}`);

  return out.join('\n');
}

/** Required section headers per purpose — exported for the §9 presence test. */
export function requiredSectionHeaders(
  purpose: ResearchPurpose,
  lang: OutputLanguage = 'ko',
): string[] {
  const L = labelsFor(lang);
  const common = [
    L.summary,
    L.question,
    L.methodology,
    L.keyConcepts,
    L.unifiedTheory,
    L.common,
    L.conflict,
    L.krUs,
    L.verification,
    L.sources,
    L.limitations,
  ];
  if (purpose === 'LEARNING' || purpose === 'TECHNICAL_RESEARCH') {
    return [...common, L.prerequisites, L.glossary, L.roadmap, L.exercises, L.patterns, L.mistakes, L.docsVerify];
  }
  if (purpose === 'CONTENT_PLANNING') {
    return [...common, L.targetProblems, L.coreMessages, L.differentiators, L.contentIdeas, L.reusableClaims];
  }
  if (purpose === 'BUSINESS_RESEARCH') {
    return [...common, L.marketSignals, L.opportunities, L.risks, L.recommendations];
  }
  return [...common, L.options, L.tradeoffs, L.recommendation, L.evidenceBasis];
}
