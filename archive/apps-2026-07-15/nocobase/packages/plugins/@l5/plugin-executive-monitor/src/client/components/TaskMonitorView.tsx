import React, { useEffect, useState } from 'react';
import { AgentTaskCard, AgentTask } from './AgentTaskCard.js';

const AGENTS = ['CEO', 'ChiefOfStaff', 'CMO', 'CRO', 'CPO', 'CTO', 'COO', 'CFO', 'RiskQA', 'Culture'];
const PHASES = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5']; // Common phases
const RISK_LEVELS = ['D1', 'D2', 'D3', 'D4', 'D5'];

async function fetchTasks(endpoint: string): Promise<AgentTask[]> {
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const json = await res.json() as { data?: AgentTask[] };
  return Array.isArray(json.data) ? json.data : [];
}

export const TaskMonitorView: React.FC = () => {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [showApprovalRequired, setShowApprovalRequired] = useState<boolean>(false);
  const [showBlocked, setShowBlocked] = useState<boolean>(false);

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTasks('/api/monitor:currentTasks');
      setTasks(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '데이터를 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 30_000);
    return () => clearInterval(interval);
  }, []);

  const visibleTasks = tasks.filter((t) => {
    if (filterAgent !== 'all' && t.agent !== filterAgent) return false;
    if (filterPhase !== 'all' && t.phase !== filterPhase) return false;
    if (filterRisk !== 'all' && t.risk_level !== filterRisk) return false;
    if (showApprovalRequired && !t.approval_required) return false;
    if (showBlocked && t.status !== 'blocked') return false;
    return true;
  });

  const byPhase: Record<string, AgentTask[]> = {};
  for (const task of visibleTasks) {
    const phase = task.phase ?? '기타 (Phase 미지정)';
    if (!byPhase[phase]) byPhase[phase] = [];
    byPhase[phase].push(task);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>
          Executive Task Monitor
        </h2>
        <button
          onClick={loadTasks}
          style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb', cursor: 'pointer', fontSize: 13 }}
        >
          새로고침
        </button>
      </div>

      {/* 필터 바 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', background: '#fff', padding: '16px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <FilterSelect label="Phase" value={filterPhase} onChange={setFilterPhase} options={PHASES} />
        <FilterSelect label="Agent" value={filterAgent} onChange={setFilterAgent} options={AGENTS} />
        <FilterSelect label="Risk Level" value={filterRisk} onChange={setFilterRisk} options={RISK_LEVELS} />
        
        <label style={{ display: 'flex', alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={showApprovalRequired} onChange={e => setShowApprovalRequired(e.target.checked)} style={{ marginRight: 6 }} />
          승인 대기만 보기
        </label>
        
        <label style={{ display: 'flex', alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={showBlocked} onChange={e => setShowBlocked(e.target.checked)} style={{ marginRight: 6 }} />
          차단(Blocked)만 보기
        </label>
        
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af', alignSelf: 'center' }}>
          read-only · 30초 자동 갱신
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>불러오는 중...</div>}
      {!loading && error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '12px 16px', color: '#dc2626', fontSize: 13 }}>{error}</div>}
      {!loading && !error && visibleTasks.length === 0 && <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 14 }}>조건에 맞는 Task가 없습니다.</div>}

      {!loading && !error && Object.entries(byPhase).map(([phase, phaseTasks]) => (
        <div key={phase} style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
            <span>{phase.replace(/_/g, ' ')}</span>
            <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 13 }}>{phaseTasks.length} tasks</span>
          </div>
          {phaseTasks.map((task) => (
            <AgentTaskCard key={task.task_id} task={task} />
          ))}
        </div>
      ))}
    </div>
  );
};

const FilterSelect: React.FC<{ label: string, value: string, onChange: (v: string) => void, options: string[] }> = ({ label, value, onChange, options }) => (
  <div style={{ display: 'flex', alignItems: 'center' }}>
    <label style={{ fontSize: 13, color: '#4b5563', marginRight: 8 }}>{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, background: '#fff' }}
    >
      <option value="all">전체</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);
