'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { CompletionInsightCandidate, VideoPerformanceRecord } from '@/lib/api'

// ── R7 성과 재학습 보드 ────────────────────────────────────────────────────────
// 업로드 완료 후: 성과 지표(수동 입력) → 인사이트 추출 → 다음 기획 입력으로 누적.
// 외부 분석 자동연동은 없음(followup) — 사장님이 직접 입력한다.
const USAGE_LABEL: Record<CompletionInsightCandidate['usage'], string> = {
  hook: '도입 훅',
  intro: '도입부',
  pulling: '풀링 주제',
  topic: '주제/썸네일',
}

export default function PerformanceBoard({ projectId }: { projectId: string }) {
  const [views, setViews] = useState('')
  const [completion, setCompletion] = useState('') // 0~100 (%)
  const [ctr, setCtr] = useState('') // 0~100 (%)
  const [retention, setRetention] = useState('')
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [perf, setPerf] = useState<VideoPerformanceRecord | null>(null)
  const [insights, setInsights] = useState<CompletionInsightCandidate[]>([])

  // 이미 기록된 인사이트가 있으면 표시.
  useEffect(() => {
    let alive = true
    api.cmoGetCompletedVideoInsights(projectId)
      .then(r => {
        if (!alive) return
        setInsights(r.insights ?? [])
        setPerf(r.performance ?? null)
      })
      .catch(() => { /* graceful */ })
    return () => { alive = false }
  }, [projectId])

  const submit = async () => {
    setSaving(true)
    setErr(null)
    try {
      const r = await api.cmoRecordVideoPerformance(projectId, {
        view_count: Math.max(0, Math.round(Number(views) || 0)),
        completion_rate: Math.min(1, Math.max(0, (Number(completion) || 0) / 100)),
        ctr: Math.min(1, Math.max(0, (Number(ctr) || 0) / 100)),
        retention_notes: retention.trim() || undefined,
        feedback: feedback.trim() || undefined,
      })
      setPerf(r.performance)
      setInsights(r.insights)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '성과 기록 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div className="j-overline" style={{ marginBottom: 8 }}>성과 재학습 (수동 입력)</div>
      <div style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 8,
        background: 'var(--paper-surface)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>영상 성과 입력</span>
          <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 8 }}>
            (유튜브 분석 자동연동은 추후 — 지금은 직접 입력)
          </span>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {err && (
            <div style={{ fontSize: 12, color: 'var(--red)', padding: '4px 8px', background: 'var(--red-tint)', borderRadius: 4 }}>
              {err}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="j-input" style={{ flex: 1, minWidth: 120 }} placeholder="조회수" inputMode="numeric"
              value={views} onChange={e => setViews(e.target.value)} />
            <input className="j-input" style={{ flex: 1, minWidth: 120 }} placeholder="완료율 % (0~100)" inputMode="numeric"
              value={completion} onChange={e => setCompletion(e.target.value)} />
            <input className="j-input" style={{ flex: 1, minWidth: 120 }} placeholder="CTR % (0~100)" inputMode="numeric"
              value={ctr} onChange={e => setCtr(e.target.value)} />
          </div>
          <input className="j-input" placeholder="시청 유지 메모 (예: 도입 30초 이탈 큼)"
            value={retention} onChange={e => setRetention(e.target.value)} />
          <input className="j-input" placeholder="정성 피드백 (선택)"
            value={feedback} onChange={e => setFeedback(e.target.value)} />
          <button className="j-btn j-btn-secondary j-btn-sm" style={{ alignSelf: 'flex-start' }}
            disabled={saving} onClick={submit}>
            {saving ? '기록 중...' : '성과 기록 + 인사이트 추출'}
          </button>
        </div>

        {(perf || insights.length > 0) && (
          <div style={{ padding: '12px 14px', borderTop: '1px solid var(--silver-1)' }}>
            {perf && (
              <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '0 0 8px' }}>{perf.summary}</p>
            )}
            {insights.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 6 }}>
                  추출 인사이트 (다음 기획 입력)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {insights.map(ins => (
                    <div key={ins.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--ink-1)' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 999,
                        background: 'var(--silver-1)', color: 'var(--ink-3)', flexShrink: 0,
                      }}>
                        {USAGE_LABEL[ins.usage]}
                      </span>
                      <span style={{ lineHeight: 1.5 }}>{ins.insight}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
