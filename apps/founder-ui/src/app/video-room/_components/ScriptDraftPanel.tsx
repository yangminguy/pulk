'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import type { ScriptDraftResult } from '@/lib/api'

// ── R4 원고 초안 단계 ───────────────────────────────────────────────────────────
// 비전: 전략 brief/자료 → CMO가 도입 30초 + 로직블록 + 통합 원고 + QA 초안을 자동 생성
// → 사장님이 '원고 승인' / '수정 요청'.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid var(--silver-2)', borderRadius: 10, background: 'var(--paper-surface)',
      padding: 16, marginBottom: 14,
    }}>
      <div className="j-overline" style={{ marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}

function QaRow({ label, score }: { label: string; score: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 110, fontSize: 12, color: 'var(--ink-3)' }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--silver-1)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, score)}%`, height: '100%', background: 'var(--green)' }} />
      </div>
      <span style={{ width: 36, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right' }}>{score}</span>
    </div>
  )
}

export default function ScriptDraftPanel({
  projectId,
  cards,
  onRefresh,
}: {
  projectId: string
  cards?: { stage?: string; data?: unknown }[]
  onRefresh: () => void
}) {
  const [proposing, setProposing] = useState(false)
  const [draft, setDraft] = useState<ScriptDraftResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  const [committed, setCommitted] = useState(false)

  const handlePropose = useCallback(async () => {
    setProposing(true)
    setError(null)
    try {
      const res = await api.cmoProposeScriptDraft(projectId)
      setDraft(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '원고 초안 생성 실패')
    } finally {
      setProposing(false)
    }
  }, [projectId])

  // 진입 시: 이미 생성된 script_draft 카드가 있으면 로드. 없으면 자동 1회 생성.
  const autoProposed = useRef(false)
  useEffect(() => {
    if (autoProposed.current || draft) return
    autoProposed.current = true
    const existing = cards?.find(c => c.stage === 'script_draft')
    const data = existing?.data as ScriptDraftResult | undefined
    if (data?.integrated_script?.full_script) {
      setDraft(data)
      return
    }
    void handlePropose()
  }, [draft, handlePropose, cards])

  const handleApprove = useCallback(async () => {
    setCommitting(true)
    setError(null)
    try {
      await api.cmoCommitScriptDraft(projectId)
      setCommitted(true)
      onRefresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '원고 승인 실패')
    } finally {
      setCommitting(false)
    }
  }, [projectId, onRefresh])

  if (proposing || (!draft && !error)) {
    return (
      <div>
        <div className="j-overline" style={{ marginBottom: 16 }}>원고 초안</div>
        <div style={{
          border: '1px solid var(--silver-2)', borderRadius: 12, background: 'var(--paper-surface)',
          padding: '48px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 8 }}>
            CMO가 원고를 작성하고 있습니다…
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            도입 30초 · 로직 블록 · 통합 원고 · QA를 순차로 만들고 있습니다.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="j-overline" style={{ marginBottom: 16 }}>원고 초안 · 검토</div>

      {error && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'var(--red-tint)', border: '1px solid var(--red)', borderRadius: 6,
          fontSize: 12.5, color: 'var(--red)',
        }}>
          {error}
          <button className="j-btn j-btn-secondary j-btn-sm" onClick={() => handlePropose()} style={{ marginLeft: 12 }}>
            다시 생성
          </button>
        </div>
      )}

      {committed && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'var(--p-green)', borderRadius: 6,
          fontSize: 12.5, color: 'var(--pi-green)', fontWeight: 600,
        }}>
          원고를 승인했습니다. 다음 단계로 진행합니다.
        </div>
      )}

      {draft && (
        <>
          <Section title="도입 30초">
            <div style={{ fontSize: 14, color: 'var(--ink-1)', lineHeight: 1.7 }}>
              {draft.intro_30s.script}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 8 }}>
              훅 타입: {draft.intro_30s.hook_type} · {draft.intro_30s.why_it_works}
            </div>
          </Section>

          <Section title={`로직 블록 (${draft.logic_blocks.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {draft.logic_blocks.map((b, i) => (
                <div key={b.block_id} style={{ borderLeft: '3px solid var(--wood-3)', paddingLeft: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--wood-3)', marginBottom: 4 }}>
                    블록 {i + 1} · {b.block_id}
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>{b.draft}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="통합 원고">
            <div style={{
              fontSize: 14, color: 'var(--ink-1)', lineHeight: 1.9, whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-mono)', maxHeight: 360, overflowY: 'auto',
            }}>
              {draft.integrated_script.full_script}
            </div>
          </Section>

          <Section title={`QA — ${draft.qa.overall_pass ? '통과' : '재검토 필요'}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <QaRow label="전략 적합도" score={draft.qa.strategy_fit_score} />
              <QaRow label="타깃 적합도" score={draft.qa.audience_fit_score} />
              <QaRow label="보이스 적합도" score={draft.qa.voice_fit_score} />
              <QaRow label="세일즈 로직" score={draft.qa.sales_logic_score} />
              <QaRow label="사실 안전성" score={draft.qa.fact_safety_score} />
            </div>
            {draft.qa.revision_requests.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10 }}>
                수정 요청: {draft.qa.revision_requests.join(', ')}
              </div>
            )}
          </Section>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button className="j-btn j-btn-secondary" onClick={() => handlePropose()} disabled={committing || committed}>
              수정 요청 (재생성)
            </button>
            <button className="j-btn j-btn-primary" onClick={handleApprove} disabled={committing || committed}>
              {committing ? '승인 중...' : committed ? '승인됨' : '원고 승인'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
