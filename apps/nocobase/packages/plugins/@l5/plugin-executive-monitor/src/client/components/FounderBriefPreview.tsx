import React, { useEffect, useState } from 'react';
import { AgentTask } from './AgentTaskCard.js';

export const FounderBriefPreview: React.FC = () => {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/monitor:currentTasks');
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const json = await res.json() as { data?: AgentTask[] };
      setTasks(Array.isArray(json.data) ? json.data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '데이터를 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  // Compute Brief Data
  const moved = tasks.filter(t => t.status === 'done' || t.status === 'running');
  const blocked = tasks.filter(t => t.status === 'blocked');
  const approvalRequired = tasks.filter(t => t.approval_required || t.status === 'needs_review');
  const riskTasks = tasks.filter(t => t.risk_level && t.risk_level !== 'D1');

  // Determine Current Phase (most frequent or highest)
  let currentPhase = 'Phase 미지정';
  const phaseCounts: Record<string, number> = {};
  tasks.forEach(t => {
    if (t.phase) {
      phaseCounts[t.phase] = (phaseCounts[t.phase] || 0) + 1;
    }
  });
  const sortedPhases = Object.entries(phaseCounts).sort((a, b) => b[1] - a[1]);
  if (sortedPhases.length > 0) {
    currentPhase = sortedPhases[0][0];
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>Founder Brief Preview</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>Chief of Staff가 요약한 현재 상황 (Read-only)</p>
        </div>
        <button
          onClick={loadTasks}
          style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb', cursor: 'pointer', fontSize: 13 }}
        >
          새로고침
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>요약 생성 중...</div>}
      {!loading && error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '12px 16px', color: '#dc2626', fontSize: 13 }}>{error}</div>}
      
      {!loading && !error && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <span style={{ fontSize: 24 }}>📈</span>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>CURRENT PHASE</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{currentPhase.replace(/_/g, ' ')}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            {/* What Moved */}
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', paddingBottom: 8, marginBottom: 12 }}>
                🟢 진행 중 / 완료 ({moved.length})
              </h3>
              {moved.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>진행된 항목이 없습니다.</div> : (
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>
                  {moved.slice(0, 5).map(t => (
                    <li key={t.task_id}>{t.task_title} <span style={{ color: '#9ca3af' }}>({t.agent})</span></li>
                  ))}
                  {moved.length > 5 && <li style={{ color: '#9ca3af', listStyle: 'none', marginLeft: -20, marginTop: 4 }}>...외 {moved.length - 5}건</li>}
                </ul>
              )}
            </div>

            {/* What is Blocked */}
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', paddingBottom: 8, marginBottom: 12 }}>
                🔴 차단됨 ({blocked.length})
              </h3>
              {blocked.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>차단된 항목이 없습니다.</div> : (
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#dc2626', lineHeight: 1.6 }}>
                  {blocked.map(t => (
                    <li key={t.task_id}>
                      <span style={{ fontWeight: 600 }}>{t.agent}:</span> {t.blocker || t.task_title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginTop: 24 }}>
            {/* What Needs Approval */}
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', paddingBottom: 8, marginBottom: 12 }}>
                🟡 승인 대기 ({approvalRequired.length})
              </h3>
              {approvalRequired.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>승인이 필요한 항목이 없습니다.</div> : (
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#d97706', lineHeight: 1.6 }}>
                  {approvalRequired.map(t => (
                    <li key={t.task_id}>
                      {t.task_title} <span style={{ color: '#9ca3af' }}>({t.agent})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Risk Notes */}
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', paddingBottom: 8, marginBottom: 12 }}>
                ⚠️ 리스크 노트
              </h3>
              {riskTasks.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>주의할 리스크 항목이 없습니다.</div> : (
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>
                  {riskTasks.map(t => (
                    <li key={t.task_id}>
                      <span style={{ fontWeight: 600, color: '#dc2626' }}>[{t.risk_level}]</span> {t.task_title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div style={{ marginTop: 32, background: '#f8fafc', padding: '16px 20px', borderRadius: 8, borderLeft: '4px solid #2563eb' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e40af', fontWeight: 700 }}>추천 다음 결정 (Recommended Next Decisions)</h3>
            <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
              {approvalRequired.length > 0 
                ? 'Approval Queue에서 대기 중인 승인 항목을 처리해 주시면 병목이 해소됩니다.' 
                : blocked.length > 0
                  ? '차단된 항목(Blocked)들의 문제를 해결하거나, 새로운 방향성을 Chat을 통해 지시해 주세요.'
                  : '현재 순조롭게 진행 중입니다. 추가적인 피드백이나 새로운 목표가 있다면 Chat에 입력해 주세요.'}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
