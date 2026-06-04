// Repetition Analyzer
// Runs every 2 hours via cronTrigger. Finds task patterns where the same
// task_title (or similar intent) appears 3+ times within a timeframe,
// then triggers CTO tool request generation.

import type { AgentTask, RepeatingTaskPattern } from "@l5/core";
import { analyzeRepetitionPattern, generateToolRequestTask } from "@l5/core";

export interface RepetitionAnalysisResult {
  analyzed_at: string;
  patterns_detected: number;
  repeating_patterns: RepeatingTaskPattern[];
  tool_requests_created: string[];
}

const REPETITION_THRESHOLD = 3; // Trigger tool request at 3+ occurrences
const ANALYSIS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days lookback

export async function runRepetitionAnalyzer(
  tasks: AgentTask[],
  createToolRequest: (taskPayload: Omit<AgentTask, 'id' | 'instruction_id' | 'created_at' | 'updated_at'>) => Promise<string>,
): Promise<RepetitionAnalysisResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - ANALYSIS_WINDOW_MS);

  // Group tasks by normalized title (exact title match for simplicity)
  const titleGroups = new Map<string, AgentTask[]>();

  tasks
    .filter((t) => {
      const createdAt = new Date(t.created_at);
      return createdAt >= windowStart;
    })
    .forEach((t) => {
      const key = t.title.toLowerCase().trim();
      if (!titleGroups.has(key)) {
        titleGroups.set(key, []);
      }
      titleGroups.get(key)!.push(t);
    });

  // Detect patterns with 3+ occurrences
  const patterns: RepeatingTaskPattern[] = [];
  const toolRequestIds: string[] = [];

  for (const [title, tasksInGroup] of titleGroups) {
    if (tasksInGroup.length >= REPETITION_THRESHOLD) {
      const sorted = tasksInGroup.sort(
        (a, b) =>
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
      );

      const pattern: RepeatingTaskPattern = {
        task_title: sorted[0]!.title,
        occurrences: tasksInGroup.length,
        task_ids: tasksInGroup.map((t) => t.id),
        agents_involved: [...new Set(tasksInGroup.map((t) => t.assigned_agent))],
        first_occurrence_at: sorted[0]!.created_at,
        last_occurrence_at: sorted[sorted.length - 1]!.created_at,
      };

      patterns.push(pattern);

      // Analyze pattern and generate tool request task
      try {
        const analyzed = analyzeRepetitionPattern(pattern);
        const toolRequestTask = generateToolRequestTask(analyzed, 'Repetition pattern detected by Hermes analyzer');
        const toolRequestId = await createToolRequest(toolRequestTask);
        toolRequestIds.push(toolRequestId);
      } catch (err) {
        console.error(
          `Failed to create tool request for pattern "${title}":`,
          err
        );
      }
    }
  }

  return {
    analyzed_at: now.toISOString(),
    patterns_detected: patterns.length,
    repeating_patterns: patterns,
    tool_requests_created: toolRequestIds,
  };
}
