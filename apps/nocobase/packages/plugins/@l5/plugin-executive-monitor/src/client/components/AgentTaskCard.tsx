import React from 'react';

export type AgentTask = {
  task_id: string;
  agent: string;
  task_title: string;
  source_instruction: string | null;
  rationale?: string;
  status: 'queued' | 'running' | 'blocked' | 'needs_review' | 'done' | 'killed';
  expected_output?: string;
  next_output?: string;
  next_owner?: string;
  stop_reason?: string;
  approval_required: boolean;
  blocker?: string;
  updated_at?: string;
};

const STATUS_COLORS: Record<string, string> = {
  queued: '#6b7280',
  running: '#2563eb',
  blocked: '#dc2626',
  needs_review: '#d97706',
  done: '#16a34a',
  killed: '#9ca3af',
};

const STATUS_LABELS: Record<string, string> = {
  queued: '대기',
  running: '실행중',
  blocked: '차단됨',
  needs_review: '검토 필요',
  done: '완료',
  killed: '중단됨',
};

export const AgentTaskCard: React.FC<{ task: AgentTask }> = ({ task }) => {
  const statusColor = STATUS_COLORS[task.status] ?? '#6b7280';
  const statusLabel = STATUS_LABELS[task.status] ?? task.status;

  return (
    <div
      style={{
        border: task.approval_required ? '2px solid #dc2626' : '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '16px',
        background: '#fff',
        marginBottom: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>{task.agent}</span>
          <span style={{ margin: '0 6px', color: '#d1d5db' }}>›</span>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{task.task_title}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {task.approval_required && (
            <span
              style={{
                background: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              승인 필요
            </span>
          )}
          <span
            style={{
              background: statusColor + '18',
              color: statusColor,
              border: `1px solid ${statusColor}40`,
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* 원본 지시 */}
      {task.source_instruction && (
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, fontStyle: 'italic' }}>
          지시: "{task.source_instruction}"
        </div>
      )}

      {/* 수행 이유 */}
      {task.rationale && (
        <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>이유:</span> {task.rationale}
        </div>
      )}

      {/* 기대 산출물 */}
      {task.expected_output && (
        <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>산출물:</span> {task.expected_output}
        </div>
      )}

      {/* 차단 이유 */}
      {task.blocker && (
        <div
          style={{
            fontSize: 12,
            color: '#dc2626',
            marginBottom: 6,
            background: '#fef2f2',
            padding: '4px 8px',
            borderRadius: 4,
          }}
        >
          <span style={{ fontWeight: 600 }}>차단:</span> {task.blocker}
        </div>
      )}

      {/* 다음 소유자 / 중단 이유 */}
      {(task.next_owner || task.stop_reason) && (
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {task.next_owner && <span><span style={{ fontWeight: 600 }}>다음 담당:</span> {task.next_owner}</span>}
          {task.stop_reason && <span style={{ marginLeft: 8 }}><span style={{ fontWeight: 600 }}>중단 이유:</span> {task.stop_reason}</span>}
        </div>
      )}
    </div>
  );
};
