// Repetition Detection & Tool Request Generation
// Analyzes task patterns to identify manual work suitable for automation

import type { AgentTask } from '../types/orchestration';

export interface RepeatingTaskPattern {
  task_title: string;
  occurrences: number;
  task_ids: string[];
  agents_involved: string[];
  last_occurrence_at: string;
  first_occurrence_at: string;
}

export interface RepetitionPattern {
  task_title: string;
  occurrences: number;
  task_ids: string[];
  agents_involved: string[];
  last_occurrence_at: string;
  first_occurrence_at: string;
  time_span_hours: number;
  automation_priority: 'low' | 'medium' | 'high';
}

export function analyzeRepetitionPattern(
  pattern: RepeatingTaskPattern
): RepetitionPattern {
  const firstDate = new Date(pattern.first_occurrence_at).getTime();
  const lastDate = new Date(pattern.last_occurrence_at).getTime();
  const timeSpanHours = (lastDate - firstDate) / (1000 * 60 * 60);

  // Determine priority based on frequency and involvement
  let priority: 'low' | 'medium' | 'high' = 'low';
  if (pattern.occurrences >= 10) {
    priority = 'high';
  } else if (pattern.occurrences >= 5) {
    priority = 'medium';
  }

  return {
    task_title: pattern.task_title,
    occurrences: pattern.occurrences,
    task_ids: pattern.task_ids,
    agents_involved: pattern.agents_involved,
    first_occurrence_at: pattern.first_occurrence_at,
    last_occurrence_at: pattern.last_occurrence_at,
    time_span_hours: timeSpanHours,
    automation_priority: priority,
  };
}

export function generateToolRequestTask(
  pattern: RepetitionPattern,
  sourceReason: string = 'Repetition pattern detected'
): Omit<AgentTask, 'id' | 'instruction_id' | 'created_at' | 'updated_at'> {
  const agentList = pattern.agents_involved.join(', ');
  const occurrenceList = pattern.task_ids.slice(0, 3).join(', ');

  return {
    assigned_agent: 'CTO' as const,
    title: `Tool Request: ${pattern.task_title}`,
    rationale: `Manual work "${pattern.task_title}" has been repeated ${pattern.occurrences} times across agents: ${agentList}. First occurrence: ${new Date(pattern.first_occurrence_at).toISOString()}. Most recent: ${new Date(pattern.last_occurrence_at).toISOString()}. Suggest automation to reduce manual effort.`,
    expected_output: 'Technical feasibility assessment and build strategy recommendation for automating this repetitive task',
    status: 'queued' as const,
    approval_required: false,
    risk_level: 'D2' as const,
    phase: 'execution_build' as const,
    source_ref: `repetition-pattern:${pattern.task_ids[0]}`,
    blocker: undefined,
    due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    interpretation_id: undefined,
  };
}

export function detectRepeatingTasks(
  tasks: AgentTask[],
  threshold: number = 3
): Map<string, AgentTask[]> {
  const titleGroups = new Map<string, AgentTask[]>();

  tasks.forEach((task) => {
    const key = task.title.toLowerCase().trim();
    if (!titleGroups.has(key)) {
      titleGroups.set(key, []);
    }
    titleGroups.get(key)!.push(task);
  });

  // Filter to only patterns meeting threshold
  const repeating = new Map<string, AgentTask[]>();
  titleGroups.forEach((tasks, title) => {
    if (tasks.length >= threshold) {
      repeating.set(title, tasks);
    }
  });

  return repeating;
}
