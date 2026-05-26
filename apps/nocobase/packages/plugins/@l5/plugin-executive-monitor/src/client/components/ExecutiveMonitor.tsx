import React, { useEffect, useState } from 'react';
import { AgentTaskCard, AgentTask } from './AgentTaskCard.js';

type FilterStatus = 'all' | 'blocked' | 'approval_required' | 'running' | 'needs_review';

const AGENTS = ['CEO', 'ChiefOfStaff', 'CMO', 'CRO', 'CPO', 'CTO', 'COO', 'CFO', 'RiskQA', 'Culture'];

async function fetchTasks(endpoint: string): Promise<AgentTask[]> {
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

export const ExecutiveMonitor: React.FC = () => {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      let endpoint = '/api/monitor/currentTasks';
      if (filterStatus === 'blocked') endpoint = '/api/monitor/blockedTasks';
      else if (filterStatus === 'approval_required') endpoint = '/api/monitor/approvalQueue';
      const data = await fetchTasks(endpoint);
      setTasks(data);
    } catch (e: any) {
      setError(e.message ?? '데이터를 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    // 30초마다 자동 갱신
    const interval = setInterval(loadTasks, 30_000);
    return () => clearInterval(interval);
  }, [filterStatus]);

  const visibleTasks = tasks.filter((t) => {
    if (filterAgent !== 'all' && t.agent !== filterAgent) return false;
    if (filterStatus === 'running' && t.status !== 'running') return false;
    if (filterStatus === 'needs_review' && t.status !== 'needs_review') return false;
    return true;
  });

  // agent별 그룹화
  const byAgent: Record<string, AgentTask[]> = {};
  for (const task of visibleTasks) {
    if (!byAgent[task.agent]) byAgent[task.agent] = [];
    byAgent[task.agent].push(task);
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111827' }}>
          Executive Monitor
        </h2>
        <button
          onClick={loadTasks}
          style={{
            padding: '6px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            background: '#f9fafb',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          새로고침
        </button>
      </div>

      {/* 필터 바 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, color: '#6b7280', marginRight: 6 }}>상태</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
          >
            <option value="all">전체</option>
            <option value="running">실행중</option>
            <option value="blocked">차단됨</option>
            <option value="needs_review">검토 필요</option>
            <option value="approval_required">승인 필요</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#6b7280', marginRight: 6 }}>Agent</label>
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
          >
            <option value="all">전체</option>
            {AGENTS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af', alignSelf: 'center' }}>
          read-only · 30초 자동 갱신
        </div>
      </div>

      {/* 로딩 */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
          불러오는 중...
        </div>
      )}

      {/* 에러 */}
      {!loading && error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            padding: '12px 16px',
            color: '#dc2626',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* 빈 상태 */}
      {!loading && !error && visibleTasks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 14 }}>
          현재 조건에 해당하는 task가 없습니다.
        </div>
      )}

      {/* Agent별 card 그룹 */}
      {!loading && !error && Object.entries(byAgent).map(([agent, agentTasks]) => (
        <div key={agent} style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#374151',
              marginBottom: 8,
              paddingBottom: 4,
              borderBottom: '1px solid #f3f4f6',
            }}
          >
            {agent} <span style={{ fontWeight: 400, color: '#9ca3af' }}>({agentTasks.length})</span>
          </div>
          {agentTasks.map((task) => (
            <AgentTaskCard key={task.task_id} task={task} />
          ))}
        </div>
      ))}
    </div>
  );
};
