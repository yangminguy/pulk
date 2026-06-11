// model-map.ts — ACR agent-model-router 이식(순수 함수, I/O 없음).
// 출처: agent_control_room_docs/lib/agents/agent-model-router.ts (getPreferredAgentForTask, getPreferredModelsForTask)
// 변경: monitoring 제거(MainAgent 외), claude-opus-4-7 → claude-opus-4-8.

import type { AgentForTaskKind, ModelForTask, TaskKind, MainAgent, ModelId } from './types';

const AGENT_FOR_KIND: Record<TaskKind, MainAgent> = {
  implementation: 'claude-code',
  architecture:   'claude-code',
  security:       'claude-code',
  release:        'claude-code',
  database:       'claude-code',
  deployment:     'claude-code',
  documentation:  'claude-code',
  qa:             'codex',
  test:           'codex',
  code_review:    'codex',
  ui:             'antigravity',
  ux_copy:        'antigravity',
  unknown:        'claude-code',
};

export const agentForTaskKind: AgentForTaskKind = (taskKind) =>
  AGENT_FOR_KIND[taskKind] ?? 'claude-code';

// (agent, taskKind) → ModelId | undefined
const MODEL_FOR: Record<MainAgent, Partial<Record<TaskKind, ModelId>>> = {
  'claude-code': {
    architecture:  'claude-opus-4-8',
    security:      'claude-opus-4-8',
    release:       'claude-opus-4-8',
    deployment:    'claude-opus-4-8',
    implementation:'claude-sonnet-4-6',
    database:      'claude-sonnet-4-6',
    documentation: 'claude-haiku-4-5',
  },
  codex: {
    qa:          'gpt-5.5',
    test:        'gpt-5.5',
    code_review: 'gpt-5.5',
  },
  antigravity: {
    ui:      'gemini-3.5-flash-high',
    ux_copy: 'gemini-3.5-flash-medium',
  },
};

export const modelForTask: ModelForTask = (agent, taskKind) =>
  MODEL_FOR[agent]?.[taskKind];
