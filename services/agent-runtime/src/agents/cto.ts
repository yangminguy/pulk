// CTO Agent
// Owns technical execution proposals, tooling decisions, and Agent Control Tower operations.

import type { AgentInput, AgentOutput } from "./types.js";
import type { ACRIntent, CTOPhase, RuntimeType, ReleaseGateType } from "@l5/core";

export interface CTOAgentInput extends AgentInput {
  task?: {
    id: string;
    title: string;
    rationale: string;
  };
}

export interface CTOAgentOutput extends AgentOutput {
  acr_intent: ACRIntent;
}

interface OpenAIResponse {
  choices: Array<{ message: { content: string | null } }>;
}

function assignRuntime(phaseName: string): RuntimeType {
  const lower = phaseName.toLowerCase();
  if (/아키텍처|스펙|설계|리뷰|architecture|spec|design|review/.test(lower)) return 'claude';
  if (/ui|컴포넌트|스타일|프론트엔드|component|style|frontend/.test(lower)) return 'antigravity';
  if (/병렬|다중파일|모노레포|parallel|multi.file|monorepo/.test(lower)) return 'omc';
  return 'codex';
}

function gateFromRisk(risk: CTOPhase['risk_level']): { release_gate_type: ReleaseGateType; l5_approval_required: boolean; auto_execute: boolean } {
  if (risk === 'D1' || risk === 'D2') {
    return { release_gate_type: 'none', l5_approval_required: false, auto_execute: true };
  }
  if (risk === 'D3') {
    return { release_gate_type: 'auto_24h', l5_approval_required: false, auto_execute: false };
  }
  return { release_gate_type: 'manual_founder', l5_approval_required: true, auto_execute: false };
}

function buildDeterministicIntent(task: CTOAgentInput['task']): ACRIntent {
  const taskId = task?.id ?? 'unknown';
  const taskTitle = task?.title ?? 'Unknown Task';
  const phases: CTOPhase[] = [
    {
      name: 'Architecture & Spec',
      runtime: 'claude',
      prompt_packet: `Review and specify the architecture for: ${taskTitle}`,
      expected_output: 'Architecture document and implementation spec',
      risk_level: 'D2',
      ...gateFromRisk('D2'),
    },
    {
      name: 'Implementation',
      runtime: 'codex',
      prompt_packet: `Implement the following based on the spec: ${taskTitle}`,
      expected_output: 'Working code implementation with tests',
      risk_level: 'D2',
      ...gateFromRisk('D2'),
    },
  ];
  return { l5_task_id: taskId, task_title: taskTitle, phases, created_at: new Date().toISOString() };
}

async function buildIntentFromLLM(task: CTOAgentInput['task'], apiKey: string): Promise<ACRIntent> {
  const taskTitle = task?.title ?? 'Unknown Task';
  const rationale = task?.rationale ?? '';

  const systemPrompt = `You are a CTO agent for L5 Business OS. Given a technical task, break it into execution phases.
Return valid JSON with this structure:
{
  "phases": [
    {
      "name": "string",
      "prompt_packet": "string",
      "expected_output": "string",
      "risk_level": "D1"|"D2"|"D3"|"D4"|"D5"
    }
  ]
}
Rules:
- 2-4 phases maximum
- risk_level D1-D2 for safe changes, D3 for moderate, D4-D5 for risky/external
- Return ONLY valid JSON, no markdown`;

  const userPrompt = `Task: ${taskTitle}\nRationale: ${rationale}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as OpenAIResponse;
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error('No content in OpenAI response');

  const parsed = JSON.parse(content) as { phases: Array<{ name: string; prompt_packet: string; expected_output: string; risk_level: CTOPhase['risk_level'] }> };

  const phases: CTOPhase[] = parsed.phases.map((p) => ({
    name: p.name,
    runtime: assignRuntime(p.name),
    prompt_packet: p.prompt_packet,
    expected_output: p.expected_output,
    risk_level: p.risk_level,
    ...gateFromRisk(p.risk_level),
  }));

  return {
    l5_task_id: task?.id ?? 'unknown',
    task_title: taskTitle,
    phases,
    created_at: new Date().toISOString(),
  };
}

async function dispatchToACR(intent: ACRIntent): Promise<void> {
  try {
    const response = await fetch('http://localhost:3001/api/workbench/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intent),
    });
    if (!response.ok) {
      console.warn(`[CTO] ACR dispatch returned ${response.status} — continuing`);
    }
  } catch (err) {
    console.warn('[CTO] ACR dispatch failed (server may not be running) —', (err as Error).message);
  }
}

export async function runCTOAgent(input: CTOAgentInput): Promise<CTOAgentOutput> {
  const apiKey = process.env['OPENAI_API_KEY'];

  let acrIntent: ACRIntent;

  if (apiKey) {
    try {
      acrIntent = await buildIntentFromLLM(input.task, apiKey);
    } catch (err) {
      console.warn('[CTO] OpenAI call failed, falling back to deterministic —', (err as Error).message);
      acrIntent = buildDeterministicIntent(input.task);
    }
  } else {
    acrIntent = buildDeterministicIntent(input.task);
  }

  await dispatchToACR(acrIntent);

  const riskOrder: CTOPhase['risk_level'][] = ['D1', 'D2', 'D3', 'D4', 'D5'];
  const highestRisk = acrIntent.phases.reduce<CTOPhase['risk_level']>(
    (max: CTOPhase['risk_level'], p: CTOPhase) =>
      riskOrder.indexOf(p.risk_level) > riskOrder.indexOf(max) ? p.risk_level : max,
    'D1'
  );

  const requiresApproval = acrIntent.phases.some((p: CTOPhase) => p.l5_approval_required);

  return {
    decision: `CTO execution plan created: ${acrIntent.phases.length} phases for "${acrIntent.task_title}"`,
    reasoning: acrIntent.phases.map((p: CTOPhase) => `[${p.runtime}] ${p.name} (${p.risk_level})`).join('; '),
    risk_level: highestRisk,
    requires_founder_approval: requiresApproval,
    acr_intent: acrIntent,
  };
}
