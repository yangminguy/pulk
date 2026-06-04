export interface MemoryCandidate {
  source_task_id: string;
  source_agent: string;
  insight: string;
  workflow_improvement: string;
  pii_level: 'none' | 'low' | 'high';
  phase?: string;
}

export interface MemoryReviewBrief {
  review_date: string;
  candidates: MemoryCandidate[];
  total_count: number;
  generated_at: string;
}

export interface MemorySaveRequest {
  source_task_id: string;
  decision: 'saved' | 'discarded';
  approved_by?: string;
}

export interface MemorySaveResult {
  ok: boolean;
  source_task_id: string;
  decision: 'saved' | 'discarded';
  message: string;
}
