// Collections: founder_instruction, ceo_interpretation, agent_task, agent_handoff
// 스키마 정의만 포함. 도메인 로직은 @l5/core에 위임.

export const founderInstructionCollection = {
  name: 'founder_instructions',
  fields: [
    { name: 'raw_text', type: 'text', required: true },
    { name: 'source', type: 'string', defaultValue: 'chat' },
    { name: 'intent', type: 'text' },
    { name: 'constraints', type: 'json' },
    { name: 'requested_phase', type: 'string' },
    {
      name: 'status',
      type: 'string',
      defaultValue: 'new',
      // 'new' | 'interpreted' | 'in_progress' | 'closed'
    },
    { name: 'created_at', type: 'date' },
  ],
};

export const ceoInterpretationCollection = {
  name: 'ceo_interpretations',
  fields: [
    { name: 'instruction_id', type: 'string', required: true },
    { name: 'goal', type: 'text', required: true },
    { name: 'assumptions', type: 'json' },
    { name: 'phase', type: 'string' },
    { name: 'success_criteria', type: 'json' },
    { name: 'risk_level', type: 'string', defaultValue: 'D1' },
    { name: 'approval_required', type: 'boolean', defaultValue: false },
    { name: 'created_at', type: 'date' },
  ],
};

export const agentTaskCollection = {
  name: 'agent_tasks',
  fields: [
    { name: 'instruction_id', type: 'string', required: true },
    { name: 'interpretation_id', type: 'string' },
    { name: 'assigned_agent', type: 'string', required: true },
    { name: 'title', type: 'string', required: true },
    { name: 'rationale', type: 'text' },
    { name: 'expected_output', type: 'text' },
    {
      name: 'status',
      type: 'string',
      defaultValue: 'queued',
      // 'queued' | 'running' | 'blocked' | 'needs_review' | 'done' | 'killed'
    },
    { name: 'approval_required', type: 'boolean', defaultValue: false },
    { name: 'blocker', type: 'text' },
    { name: 'next_output', type: 'text' },
    { name: 'next_owner', type: 'string' },
    { name: 'stop_reason', type: 'text' },
    { name: 'due_at', type: 'date' },
    { name: 'created_at', type: 'date' },
    { name: 'updated_at', type: 'date' },
  ],
};

export const agentHandoffCollection = {
  name: 'agent_handoffs',
  fields: [
    { name: 'task_id', type: 'string', required: true },
    { name: 'from_agent', type: 'string', required: true },
    { name: 'to_agent', type: 'string' },
    { name: 'context', type: 'text' },
    { name: 'next_action', type: 'text' },
    { name: 'blocker', type: 'text' },
    { name: 'approval_required', type: 'boolean', defaultValue: false },
    { name: 'created_at', type: 'date' },
  ],
};
