// L5 Business OS - MVP Loop Demo
//
// Idea -> FounderFit -> Brief -> PMF -> Approval Gate -> Tool Candidate 까지의
// 핵심 루프를 샘플 데이터로 end-to-end 시뮬레이션한다.
//
// 실행: pnpm demo  (tsx scripts/demo-mvp-loop.ts)
//
// 주의: 이 스크립트는 데모 전용이며 외부 호출/부수효과가 없다.
//       PII 데이터와 재사용 가능한 Business Insight 는 출력에서 명확히 분리한다.

import {
  scoreFounderFit,
  calculatePmfScore,
  generateBusinessBrief,
  requiresFounderApproval,
  decideToolCandidate,
  type BusinessIdea,
  type FounderDNA,
  type MemoryEntry,
  type PMFExperimentMetric,
  type RiskLevel,
  type ToolRequestInput,
} from '@l5/core';

// ---------------------------------------------------------------------------
// 출력 헬퍼
// ---------------------------------------------------------------------------

function heading(text: string): void {
  console.log('\n' + '='.repeat(72));
  console.log(text);
  console.log('='.repeat(72));
}

function section(text: string): void {
  console.log('\n## ' + text + '\n');
}

function json(label: string, value: unknown): void {
  console.log(`${label}:`);
  console.log(JSON.stringify(value, null, 2));
}

// ---------------------------------------------------------------------------
// 샘플 데이터
// ---------------------------------------------------------------------------

const NOW = '2026-05-26T00:00:00.000Z';

const sampleIdea: BusinessIdea = {
  id: 'idea_001',
  created_at: NOW,
  updated_at: NOW,
  title: 'AI Workflow Automation for Solo Founders',
  raw_description:
    'A workflow automation product that helps solo founders design and run repeatable business processes with AI agents, focusing on marketing and sales delivery.',
  source: 'founder',
  status: 'scoring',
  risk_level: 'D3',
};

const sampleFounderDNA: FounderDNA[] = [
  {
    id: 'dna_001',
    created_at: NOW,
    updated_at: NOW,
    category: 'business_preference',
    statement: 'Prefers building automation workflow products for founders',
    evidence: 'Repeatedly chose automation projects over services',
    confidence: 5,
  },
  {
    id: 'dna_002',
    created_at: NOW,
    updated_at: NOW,
    category: 'strength',
    statement: 'Strong at designing agent workflow systems and automation',
    evidence: 'Shipped 3 internal automation tools',
    confidence: 4,
  },
  {
    id: 'dna_003',
    created_at: NOW,
    updated_at: NOW,
    category: 'weakness',
    statement: 'Weak at enterprise sales and outbound cold calling',
    evidence: 'Avoided sales-heavy ventures historically',
    confidence: 3,
  },
  {
    id: 'dna_004',
    created_at: NOW,
    updated_at: NOW,
    category: 'risk_standard',
    statement: 'Comfortable with D3 level external drafts under CEO review',
    evidence: 'Set internal risk policy at D3',
    confidence: 4,
  },
];

// MemoryEntry: PII vs Business Insight 분리를 보여주기 위해 두 종류를 포함한다.
const sampleMemory: MemoryEntry[] = [
  {
    id: 'mem_001',
    created_at: NOW,
    updated_at: NOW,
    category: 'pmf_learning',
    content:
      'Waitlist landing pages with a concrete delivery promise converted 3x better than generic interest forms.',
    pii_level: 'none',
    searchable_tags: ['pmf', 'waitlist', 'conversion'],
    reusability_score: 90,
  },
  {
    id: 'mem_002',
    created_at: NOW,
    updated_at: NOW,
    category: 'workflow',
    content:
      'Manual onboarding takes ~30 min per customer and is error prone when done by hand.',
    pii_level: 'low',
    searchable_tags: ['workflow', 'onboarding', 'bottleneck'],
    reusability_score: 75,
  },
  {
    id: 'mem_003',
    created_at: NOW,
    updated_at: NOW,
    category: 'sales',
    content:
      'Customer Jane Doe (jane.doe@example.com, +1-555-0142) requested a custom onboarding flow.',
    related_business_id: 'idea_001',
    pii_level: 'high',
    searchable_tags: ['sales', 'customer-request'],
    reusability_score: 10,
  },
];

const samplePmfMetrics: PMFExperimentMetric[] = [
  { id: 'm1', created_at: NOW, updated_at: NOW, experiment_id: 'exp_001', metric_name: 'waitlist_conversion', metric_value: '24%', signal_level: 4, collected_at: NOW },
  { id: 'm2', created_at: NOW, updated_at: NOW, experiment_id: 'exp_001', metric_name: 'waitlist_conversion', metric_value: '21%', signal_level: 4, collected_at: NOW },
  { id: 'm3', created_at: NOW, updated_at: NOW, experiment_id: 'exp_001', metric_name: 'interview_requests', metric_value: 8, signal_level: 4, collected_at: NOW },
  { id: 'm4', created_at: NOW, updated_at: NOW, experiment_id: 'exp_001', metric_name: 'interview_requests', metric_value: 6, signal_level: 5, collected_at: NOW },
  { id: 'm5', created_at: NOW, updated_at: NOW, experiment_id: 'exp_001', metric_name: 'purchase_intent', metric_value: '40%', signal_level: 4, collected_at: NOW },
  { id: 'm6', created_at: NOW, updated_at: NOW, experiment_id: 'exp_001', metric_name: 'purchase_intent', metric_value: '38%', signal_level: 4, collected_at: NOW },
  { id: 'm7', created_at: NOW, updated_at: NOW, experiment_id: 'exp_001', metric_name: 'customer_calls', metric_value: 5, signal_level: 3, collected_at: NOW },
  { id: 'm8', created_at: NOW, updated_at: NOW, experiment_id: 'exp_001', metric_name: 'survey_responses', metric_value: 30, signal_level: 4, collected_at: NOW },
  { id: 'm9', created_at: NOW, updated_at: NOW, experiment_id: 'exp_001', metric_name: 'survey_responses', metric_value: 28, signal_level: 4, collected_at: NOW },
  { id: 'm10', created_at: NOW, updated_at: NOW, experiment_id: 'exp_001', metric_name: 'email_engagement', metric_value: '55%', signal_level: 3, collected_at: NOW },
  { id: 'm11', created_at: NOW, updated_at: NOW, experiment_id: 'exp_001', metric_name: 'email_engagement', metric_value: '52%', signal_level: 3, collected_at: NOW },
];

// ---------------------------------------------------------------------------
// 루프 실행
// ---------------------------------------------------------------------------

function runDemo(): void {
  heading('L5 Business OS — MVP Loop Demo');
  console.log('Idea -> FounderFit -> Brief -> PMF -> Approval Gate -> Tool Candidate');

  // --- Step 0: PII vs Business Insight 분리 표시 -------------------------
  section('Step 0 — Memory Governance (PII vs Business Insight)');

  const reusableInsights = sampleMemory.filter((m) => m.pii_level === 'none' || m.pii_level === 'low');
  const piiRecords = sampleMemory.filter((m) => m.pii_level === 'medium' || m.pii_level === 'high');

  console.log('Reusable Business Insights (LLM/agent 재사용 가능):');
  reusableInsights.forEach((m) => {
    console.log(`  - [${m.category}] (pii=${m.pii_level}) ${m.content}`);
  });

  console.log('\nPII-Restricted Records (LLM 전달 금지, 정책 승인 필요):');
  piiRecords.forEach((m) => {
    console.log(`  - [${m.category}] (pii=${m.pii_level}) <REDACTED ${m.searchable_tags.join(', ')}>`);
  });

  // 다운스트림(brief 생성)에는 재사용 가능한 인사이트만 전달한다.
  const memoryForBrief = reusableInsights;

  // --- Step 1: Founder Fit ----------------------------------------------
  section('Step 1 — Founder Fit Scoring');
  const founderFit = scoreFounderFit(sampleIdea, sampleFounderDNA);
  json('FounderFitScore', founderFit);

  // --- Step 2: Business Brief -------------------------------------------
  section('Step 2 — Business Brief (Markdown)');
  const brief = generateBusinessBrief({
    idea: sampleIdea,
    founder_fit: founderFit,
    relevant_memory: memoryForBrief,
    founder_dna: sampleFounderDNA,
  });
  console.log(brief);

  // --- Step 3: PMF Scoring ----------------------------------------------
  section('Step 3 — PMF Scoring');
  const pmf = calculatePmfScore(samplePmfMetrics);
  json('PMFScoreResult', pmf);

  // --- Step 4: Approval Gate --------------------------------------------
  section('Step 4 — Approval Gate Simulation');

  // 데모: 외부 고객 대상 메시지 발송은 D4 위험도로 가정한다.
  const externalSendRisk: RiskLevel = 'D4';
  const gate = requiresFounderApproval('customer_outreach', externalSendRisk);
  json('ApprovalGate', gate);

  if (gate.requires_approval) {
    console.log(
      `\n[GATE] 승인 필요: decision="${gate.decision_type}" ` +
        `level=${gate.approval_level} urgency=${gate.urgency} ` +
        `(예상 검토 ${gate.estimated_review_time_hours ?? 'N/A'}h)`,
    );
    console.log('[GATE] 승인 전까지 외부 발송은 보류된다.');
  } else {
    console.log('\n[GATE] 자동 진행 가능 (승인 불필요).');
  }

  // --- Step 5: Tool Candidate Decision ----------------------------------
  section('Step 5 — Tool Candidate Decision');

  // PMF 점수를 그대로 의사결정 입력에 연결한다.
  const toolInput: ToolRequestInput = {
    pmf_score: pmf.pmf_score,
    repetition_count: 12,
    time_to_complete: 30,
    error_risk: 'high',
    impact_on_revenue: 'high',
    bottleneck_severity: 'high',
  };
  json('ToolRequestInput', toolInput);

  const toolDecision = decideToolCandidate(toolInput);
  json('ToolCandidateDecision', toolDecision);

  // --- Summary ----------------------------------------------------------
  heading('Loop Summary');
  console.log(`Idea:            ${sampleIdea.title}`);
  console.log(`Founder Fit:     ${founderFit.score}/100`);
  console.log(`PMF Score:       ${pmf.pmf_score}/100 (${pmf.signal_strength})`);
  console.log(`Approval Gate:   ${gate.requires_approval ? 'REQUIRED' : 'not required'} (${gate.approval_level})`);
  console.log(
    `Tool Candidate:  ${toolDecision.is_tool_candidate ? 'YES' : 'NO'}` +
      `${toolDecision.priority ? ` (priority=${toolDecision.priority})` : ''}`,
  );
  console.log('\nDemo complete.\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

try {
  runDemo();
} catch (err) {
  console.error('\n[ERROR] Demo loop failed:');
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
}
