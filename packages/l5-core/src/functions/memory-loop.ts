import { MemoryEntry } from '../types/entities';
import { AgentTask, AgentHandoff } from '../types/orchestration';

export function proposeMemoryCandidate(
  task: AgentTask,
  handoff: AgentHandoff | undefined,
  piiRule: { hasPii: boolean; notes?: string }
): MemoryEntry {
  const content = handoff 
    ? `Task: ${task.title}\nContext: ${handoff.context}\nAction: ${handoff.next_action}` 
    : `Task: ${task.title}\nOutput: ${task.expected_output}`;

  return {
    id: `mem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    category: 'workflow',
    content,
    pii_level: piiRule.hasPii ? 'high' : 'none',
    searchable_tags: ['candidate', task.assigned_agent.toLowerCase()],
    suggested_tags: [task.assigned_agent.toLowerCase(), task.status],
    approval_status: 'pending',
    contains_pii: piiRule.hasPii,
    pii_notes: piiRule.notes,
    source_task_id: task.id,
    reusable_context: task.rationale,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}
