import type { MemoryCandidate } from './types';

interface TaskInput {
  task_id: string;
  assigned_agent: string;
  output?: {
    insight_to_record?: string;
    workflow_improvement_suggestion?: string;
    risk_level?: string;
    phase?: string;
  };
}

function derivePiiLevel(riskLevel?: string): 'none' | 'low' | 'high' {
  if (riskLevel === 'D4' || riskLevel === 'D5') return 'high';
  if (riskLevel === 'D3') return 'low';
  return 'none';
}

export function collectInsights(tasks: TaskInput[]): MemoryCandidate[] {
  const results: MemoryCandidate[] = [];

  for (const task of tasks) {
    const insight = task.output?.insight_to_record ?? '';
    if (insight.length < 10) continue;

    results.push({
      source_task_id: task.task_id,
      source_agent: task.assigned_agent,
      insight,
      workflow_improvement: task.output?.workflow_improvement_suggestion ?? '',
      pii_level: derivePiiLevel(task.output?.risk_level),
      phase: task.output?.phase,
    });
  }

  return results;
}
