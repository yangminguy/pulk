import React, { useEffect, useState } from 'react';

// Approval Queue Item (from hermes-runtime)
interface ApprovalQueueItem {
  task_id: string;
  title: string;
  assigned_agent: string;
  rationale: string;
  expected_output: string;
  risk_level?: string;
  approval_required: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  source_ref?: string; // Add source_ref if available in task
  phase?: string; // Add phase if available
}

type ApprovalQueuePayload = {
  data?: { items?: unknown[] } | unknown[];
  items?: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function getQueueRows(payload: ApprovalQueuePayload): Record<string, unknown>[] {
  const rows = isRecord(payload.data) && Array.isArray(payload.data.items)
    ? payload.data.items
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.items)
        ? payload.items
        : [];

  return rows.filter(isRecord);
}

export const ApprovalQueueView: React.FC = () => {
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/monitor:approvalQueue');
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const json = await res.json() as ApprovalQueuePayload;
      
      // We might need to map it if the endpoint returns raw AgentTasks
      const mapped = getQueueRows(json).map((t) => ({
        task_id: readString(t, 'task_id') ?? readString(t, 'id') ?? '',
        title: readString(t, 'task_title') ?? readString(t, 'title') ?? '제목 없음',
        assigned_agent: readString(t, 'agent') ?? readString(t, 'assigned_agent') ?? 'Unknown',
        rationale: readString(t, 'rationale') ?? '',
        expected_output: readString(t, 'expected_output') ?? '',
        risk_level: readString(t, 'risk_level'),
        approval_required: true,
        status: readString(t, 'status') ?? 'needs_review',
        created_at: readString(t, 'created_at') ?? '',
        updated_at: readString(t, 'updated_at') ?? '',
        source_ref: readString(t, 'source_ref'),
        phase: readString(t, 'phase'),
      }));

      setItems(mapped);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '승인 대기열을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleApprove = async (taskId: string, notes?: string) => {
    setActionLoading(taskId);
    setActionError(null);
    try {
      const res = await fetch('/api/monitor:approveTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, notes }),
      });
      const json = await res.json() as { ok: boolean; message?: string };
      if (!json.ok) throw new Error(json.message ?? '승인 실패');
      await loadQueue();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '승인 처리 중 오류');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (taskId: string) => {
    const explanation = window.prompt('거절 사유를 입력하세요:');
    if (!explanation) return;
    setActionLoading(taskId);
    setActionError(null);
    try {
      const res = await fetch('/api/monitor:rejectTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, explanation }),
      });
      const json = await res.json() as { ok: boolean; message?: string };
      if (!json.ok) throw new Error(json.message ?? '거절 실패');
      await loadQueue();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '거절 처리 중 오류');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>Founder Approval Queue</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>결정 또는 맥락 확인이 필요한 항목입니다.</p>
        </div>
        <button
          onClick={loadQueue}
          style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb', cursor: 'pointer', fontSize: 13 }}
        >
          새로고침
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>불러오는 중...</div>}
      {!loading && error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '12px 16px', color: '#dc2626', fontSize: 13 }}>{error}</div>}
      {actionError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '12px 16px', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{actionError}</div>}
      {!loading && !error && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', border: '2px dashed #e5e7eb', borderRadius: 8, marginTop: 24 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
          <div style={{ color: '#4b5563', fontWeight: 600, fontSize: 15 }}>모든 승인이 완료되었습니다.</div>
          <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>현재 대기 중인 항목이 없습니다.</div>
        </div>
      )}

      {!loading && !error && items.map((item) => (
        <div key={item.task_id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>{item.assigned_agent}</span>
                {item.phase && (
                  <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{item.phase}</span>
                )}
                {item.risk_level && (
                  <span style={{ fontSize: 11, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                    {item.risk_level} Risk
                  </span>
                )}
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>{item.title}</h3>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, fontSize: 13 }}>
            <div>
              <div style={{ color: '#6b7280', marginBottom: 4 }}>승인 필요 사유 (Rationale)</div>
              <div style={{ color: '#374151', background: '#f9fafb', padding: '8px 12px', borderRadius: 6, border: '1px solid #f3f4f6' }}>
                {item.rationale || '이유가 명시되지 않았습니다.'}
              </div>
            </div>
            <div>
              <div style={{ color: '#6b7280', marginBottom: 4 }}>추천 / 예상 산출물 (Expected Output)</div>
              <div style={{ color: '#374151', background: '#f9fafb', padding: '8px 12px', borderRadius: 6, border: '1px solid #f3f4f6' }}>
                {item.expected_output || '명시되지 않았습니다.'}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>
            {item.source_ref && <div><span style={{ fontWeight: 600 }}>출처:</span> {item.source_ref}</div>}
            <div style={{ marginTop: 4 }}>
              <span style={{ fontWeight: 600 }}>Task ID:</span> {item.task_id} &nbsp;·&nbsp;
              <span style={{ fontWeight: 600 }}>생성일:</span> {new Date(item.created_at).toLocaleString('ko-KR')}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <button
              onClick={() => handleApprove(item.task_id)}
              disabled={actionLoading === item.task_id}
              style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: actionLoading === item.task_id ? 'not-allowed' : 'pointer', fontSize: 13, opacity: actionLoading === item.task_id ? 0.7 : 1 }}
            >
              {actionLoading === item.task_id ? '처리 중...' : '승인 (Approve)'}
            </button>
            <button
              onClick={() => handleReject(item.task_id)}
              disabled={actionLoading === item.task_id}
              style={{ padding: '8px 16px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontWeight: 600, cursor: actionLoading === item.task_id ? 'not-allowed' : 'pointer', fontSize: 13, opacity: actionLoading === item.task_id ? 0.7 : 1 }}
            >
              거절 (Reject)
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
