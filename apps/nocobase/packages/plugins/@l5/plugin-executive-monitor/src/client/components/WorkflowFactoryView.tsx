import React, { useState } from 'react';

interface BusinessBrief {
  idea_summary: string;
  target_customer: string;
  core_problem: string;
  proposed_solution: string;
  differentiation: string;
  risk_factors: string[];
  founder_fit_score: number;
  recommended_phase: string;
  generated_at: string;
}

interface PMFExperimentPlan {
  hypothesis: string;
  target_segment: string;
  experiment_type: string;
  success_signal: string;
  timeline_days: number;
  channels: string[];
  kill_criteria: string;
  scale_criteria: string;
  generated_at: string;
}

interface AgentStaffingPlan {
  primary_agent: string;
  secondary_agents: string[];
  task_assignments: Array<{
    agent: string;
    task: string;
    rationale: string;
    risk_level: string;
  }>;
  parallel_workstreams: number;
  generated_at: string;
}

interface WorkflowFactoryOutput {
  business_brief: BusinessBrief;
  pmf_experiment_plan: PMFExperimentPlan;
  agent_staffing_plan: AgentStaffingPlan;
  generated_at: string;
}

const sectionStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 20,
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
};

const valueStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#111827',
  marginBottom: 12,
};

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value}</div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
  return (
    <span style={{ background: color, color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 14, fontWeight: 700 }}>
      {score}/100
    </span>
  );
}

export const WorkflowFactoryView: React.FC = () => {
  const [idea, setIdea] = useState('');
  const [founderContext, setFounderContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkflowFactoryOutput | null>(null);

  const handleGenerate = async () => {
    if (!idea.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/chat:generateWorkflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_idea: idea.trim(),
          founder_context: founderContext.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 4 }}>워크플로 팩토리</h2>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
        비즈니스 아이디어를 입력하면 Business Brief, PMF 실험 계획, 에이전트 배치 계획을 자동 생성합니다.
      </p>

      {/* Input Section */}
      <div style={sectionStyle}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>비즈니스 아이디어 *</label>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="비즈니스 아이디어를 입력하세요 (예: B2B SaaS 영업 자동화 솔루션)"
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              fontFamily: 'system-ui, sans-serif',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Founder 컨텍스트 (선택)</label>
          <input
            type="text"
            value={founderContext}
            onChange={(e) => setFounderContext(e.target.value)}
            placeholder="Founder 경험이나 강점 요약 (선택)"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              fontFamily: 'system-ui, sans-serif',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || !idea.trim()}
          style={{
            background: loading || !idea.trim() ? '#9ca3af' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            cursor: loading || !idea.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '생성 중...' : '워크플로 생성'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 16, marginBottom: 16, color: '#dc2626', fontSize: 14 }}>
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Business Brief */}
          <div style={sectionStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginTop: 0, marginBottom: 16 }}>
              Business Brief
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={labelStyle}>Founder Fit Score</span>
              <ScoreBadge score={result.business_brief.founder_fit_score} />
            </div>
            <Field label="아이디어 요약" value={result.business_brief.idea_summary} />
            <Field label="타겟 고객" value={result.business_brief.target_customer} />
            <Field label="핵심 문제" value={result.business_brief.core_problem} />
            <Field label="제안 솔루션" value={result.business_brief.proposed_solution} />
            <Field label="차별화 포인트" value={result.business_brief.differentiation} />
            <Field label="권장 Phase" value={result.business_brief.recommended_phase} />
            <div>
              <div style={labelStyle}>리스크 요인</div>
              <ul style={{ margin: '4px 0 12px', paddingLeft: 20 }}>
                {result.business_brief.risk_factors.map((r, i) => (
                  <li key={i} style={{ fontSize: 14, color: '#374151', marginBottom: 4 }}>{r}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* PMF Experiment Plan */}
          <div style={sectionStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginTop: 0, marginBottom: 16 }}>
              PMF 실험 계획
            </h3>
            <Field label="실험 유형" value={result.pmf_experiment_plan.experiment_type} />
            <Field label="가설" value={result.pmf_experiment_plan.hypothesis} />
            <Field label="타겟 세그먼트" value={result.pmf_experiment_plan.target_segment} />
            <Field label="성공 신호" value={result.pmf_experiment_plan.success_signal} />
            <Field label="기간 (일)" value={result.pmf_experiment_plan.timeline_days} />
            <Field label="중단 기준" value={result.pmf_experiment_plan.kill_criteria} />
            <Field label="확장 기준" value={result.pmf_experiment_plan.scale_criteria} />
            <div>
              <div style={labelStyle}>채널</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {result.pmf_experiment_plan.channels.map((ch, i) => (
                  <span key={i} style={{ background: '#eff6ff', color: '#2563eb', borderRadius: 4, padding: '2px 8px', fontSize: 13 }}>
                    {ch}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Agent Staffing Plan */}
          <div style={sectionStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginTop: 0, marginBottom: 16 }}>
              에이전트 배치 계획
            </h3>
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>주요 에이전트</div>
              <span style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: 4, padding: '2px 8px', fontSize: 14, fontWeight: 600 }}>
                {result.agent_staffing_plan.primary_agent}
              </span>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>보조 에이전트</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {result.agent_staffing_plan.secondary_agents.map((a, i) => (
                  <span key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 4, padding: '2px 8px', fontSize: 13 }}>
                    {a}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div style={labelStyle}>태스크 배정</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {result.agent_staffing_plan.task_assignments.map((t, i) => (
                  <div key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{t.agent}</span>
                      <span style={{ fontSize: 12, color: '#6b7280', background: '#e5e7eb', borderRadius: 4, padding: '1px 6px' }}>{t.risk_level}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{t.task}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{t.rationale}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
