import React, { useEffect, useState } from 'react';

interface MemoryCandidate {
  id: string;
  source_task_id?: string;
  source_agent: string;
  insight: string;
  workflow_improvement?: string;
  pii_level: 'none' | 'low' | 'high';
  approval_status: 'pending' | 'saved' | 'discarded';
  phase?: string;
  created_at: string;
}

type MemoryCandidatesPayload = {
  ok: boolean;
  data?: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isMemoryCandidate(value: unknown): value is MemoryCandidate {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.insight === 'string' &&
    typeof value.source_agent === 'string' &&
    (value.pii_level === 'none' || value.pii_level === 'low' || value.pii_level === 'high') &&
    (value.approval_status === 'pending' || value.approval_status === 'saved' || value.approval_status === 'discarded') &&
    typeof value.created_at === 'string'
  );
}

export const MemoryReview: React.FC = () => {
  const [candidates, setCandidates] = useState<MemoryCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadCandidates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/monitor:memoryCandidates');
      if (!res.ok) {
        if (res.status === 404) {
          setCandidates([]);
          return;
        }
        throw new Error(`fetch failed: ${res.status}`);
      }
      const json = await res.json() as MemoryCandidatesPayload;
      const rows = Array.isArray(json.data) ? json.data : [];
      setCandidates(rows.filter(isMemoryCandidate));
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
  }, []);

  const handleSave = async (item: MemoryCandidate) => {
    const id = item.source_task_id ?? item.id;
    setActionLoading(item.id);
    setActionError(null);
    try {
      const res = await fetch('/api/monitor:saveMemory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_task_id: id }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? '저장 실패');
      await loadCandidates();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '저장 처리 중 오류');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDiscard = async (item: MemoryCandidate) => {
    const id = item.source_task_id ?? item.id;
    setActionLoading(item.id);
    setActionError(null);
    try {
      const res = await fetch('/api/monitor:discardMemory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_task_id: id }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? '폐기 실패');
      await loadCandidates();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '폐기 처리 중 오류');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>Memory Candidate Review</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>영구 기억 저장소에 추가할 맥락/학습 내용을 검토합니다.</p>
        </div>
        <button
          onClick={loadCandidates}
          style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb', cursor: 'pointer', fontSize: 13 }}
        >
          새로고침
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>불러오는 중...</div>}
      {!loading && error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '12px 16px', color: '#dc2626', fontSize: 13 }}>{error}</div>}
      {actionError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '12px 16px', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{actionError}</div>}

      {!loading && !error && candidates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', border: '2px dashed #e5e7eb', borderRadius: 8, marginTop: 24, background: '#fff' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>&#x1F9E0;</div>
          <div style={{ color: '#4b5563', fontWeight: 600, fontSize: 15 }}>검토 대기 중인 Memory Candidate가 없습니다.</div>
          <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>새로운 학습 내용이나 중요한 맥락이 발생하면 이곳에 표시됩니다.</div>
        </div>
      )}

      {!loading && !error && candidates.map((item) => (
        <div key={item.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>{item.source_agent}</span>
                {item.phase && (
                  <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{item.phase}</span>
                )}
              </div>
              <div style={{ marginTop: 4, fontSize: 13, color: '#6b7280' }}>
                <span style={{ fontWeight: 600 }}>상태:</span> {item.approval_status === 'pending' ? '검토 대기' : item.approval_status}
              </div>
            </div>
            {item.pii_level !== 'none' && (
              <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', fontSize: 11, fontWeight: 700 }}>
                PII {item.pii_level.toUpperCase()}
              </span>
            )}
          </div>

          <div style={{ marginBottom: 16, fontSize: 13 }}>
            <div style={{ color: '#6b7280', marginBottom: 4 }}>인사이트 (Insight)</div>
            <div style={{ color: '#374151', background: '#f9fafb', padding: '8px 12px', borderRadius: 6, border: '1px solid #f3f4f6' }}>
              {item.insight}
            </div>
          </div>

          {item.workflow_improvement && (
            <div style={{ marginBottom: 16, fontSize: 13 }}>
              <div style={{ color: '#6b7280', marginBottom: 4 }}>워크플로우 개선 (Workflow Improvement)</div>
              <div style={{ color: '#374151', background: '#f9fafb', padding: '8px 12px', borderRadius: 6, border: '1px solid #f3f4f6', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {item.workflow_improvement}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>
            {item.source_task_id && <div><span style={{ fontWeight: 600 }}>출처 Task ID:</span> {item.source_task_id}</div>}
            <div style={{ marginTop: 4 }}>
              <span style={{ fontWeight: 600 }}>생성일:</span> {new Date(item.created_at).toLocaleString('ko-KR')}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <button
              onClick={() => handleSave(item)}
              disabled={actionLoading === item.id}
              style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: actionLoading === item.id ? 'not-allowed' : 'pointer', fontSize: 13, opacity: actionLoading === item.id ? 0.7 : 1 }}
            >
              {actionLoading === item.id ? '처리 중...' : '승인하여 저장 (Save)'}
            </button>
            <button
              onClick={() => handleDiscard(item)}
              disabled={actionLoading === item.id}
              style={{ padding: '8px 16px', background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontWeight: 600, cursor: actionLoading === item.id ? 'not-allowed' : 'pointer', fontSize: 13, opacity: actionLoading === item.id ? 0.7 : 1 }}
            >
              폐기 (Discard)
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
