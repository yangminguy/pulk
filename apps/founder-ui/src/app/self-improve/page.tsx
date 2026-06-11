'use client'
import { useEffect, useState, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import { api, SelfImproveCard } from '@/lib/api'

// ── Config (표시 전용, 도메인 로직 아님) ──────────────────────────────────────
const SOURCE_LABEL: Record<string, string> = {
  log_adapter:    '로그 자동수집',
  founder_report: '사장님 제보',
}

const RISK_STYLES: Record<string, { bg: string; fg: string }> = {
  D1: { bg: 'var(--green-tint)', fg: 'var(--green-press)' },
  D2: { bg: 'var(--p-butter)',   fg: 'var(--pi-butter)'   },
}

// 선택 가능 여부 — 미전송이거나 반려된 카드만 다시 보낼 수 있다.
function isSelectable(status?: string | null): boolean {
  return !status || status === 'rejected'
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

// ── Chips ───────────────────────────────────────────────────────────────────
function SentChip() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 999,
      fontSize: 11.5, fontWeight: 500, lineHeight: 1.4,
      background: 'var(--silver-1)', color: 'var(--ink-2)', whiteSpace: 'nowrap',
      fontFamily: 'var(--font-sans)',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 999, background: 'var(--silver-4)',
        animation: 'j-pulse 1.8s ease-in-out infinite',
      }} />
      CTO로 전송됨
    </span>
  )
}

function BlockedChip({ reason }: { reason: string }) {
  return (
    <span title={reason} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 999,
      fontSize: 11.5, fontWeight: 600, lineHeight: 1.4,
      background: 'var(--red-tint)', color: '#8C2A1F', whiteSpace: 'nowrap',
      fontFamily: 'var(--font-sans)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--red)' }} />
      intent 차단
    </span>
  )
}

// ── Main content ──────────────────────────────────────────────────────────────
function SelfImproveContent() {
  const [cards, setCards] = useState<SelfImproveCard[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [blocked, setBlocked] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try { setCards(await api.listSelfImproveCards()) }
    catch { setCards([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const selectableIds = cards.filter(c => isSelectable(c.self_mod_status)).map(c => c.proposal_id)
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))

  const toggle = (id: string) =>
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectableIds))

  const bulkApprove = useCallback(async () => {
    const picked = cards.filter(c => selected.has(c.proposal_id))
    if (picked.length === 0) return
    const ok = window.confirm(
      `다음 ${picked.length}개 대상 repo로 자가개선을 CTO에 보냅니다:\n\n` +
      picked.map(c => `• ${c.target_repo_label}`).join('\n')
    )
    if (!ok) return
    setSubmitting(true)
    // optimistic: 선택분을 'sent'로
    setCards(prev => prev.map(c =>
      selected.has(c.proposal_id) ? { ...c, self_mod_status: 'sent' } : c))
    try {
      const res = await api.bulkApproveSelfImprove(
        picked.map(c => ({ proposal_id: c.proposal_id, target_repo: c.target_repo })))
      const b: Record<string, string> = {}
      res.blocked.forEach(x => { b[x.proposal_id] = x.reason })
      setBlocked(b)
      // 차단분은 optimistic 되돌림
      setCards(prev => prev.map(c =>
        b[c.proposal_id] ? { ...c, self_mod_status: null } : c))
      setSelected(new Set())
    } catch {
      // 전체 실패 시 optimistic 전부 되돌림
      setCards(prev => prev.map(c =>
        selected.has(c.proposal_id) ? { ...c, self_mod_status: null } : c))
    } finally {
      setSubmitting(false)
    }
  }, [cards, selected])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 8 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)',
            letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px',
          }}>
            호랑이 자가개선 루프
          </p>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 22,
            color: 'var(--ink-1)', margin: 0, letterSpacing: '-0.01em',
          }}>
            🐯 자가개선
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
            전 임원 워크플로우의 오류·병목을 분석한 개선 카드. 선택해 일괄 승인하면 CTO가 repo별로 고친다.
          </p>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/control-room" style={{
            fontSize: 12.5, fontWeight: 500, color: 'var(--green-press)',
            fontFamily: 'var(--font-sans)', textDecoration: 'none',
          }}>
            CTO 작업 보기 →
          </a>
          <button onClick={load} className="j-btn j-btn-secondary j-btn-sm" aria-label="새로고침">
            새로고침
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>로딩 중...</p>
      )}

      {/* Empty */}
      {!loading && cards.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '56px 24px',
          color: 'var(--ink-4)', fontSize: 13.5,
          background: 'var(--paper-surface)',
          border: '1px solid var(--silver-2)', borderRadius: 8,
        }}>
          개선 카드가 없습니다. 호랑이 루프가 매일 03:00에 실행됩니다.
        </div>
      )}

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {cards.map(card => {
          const selectable = isSelectable(card.self_mod_status)
          const riskStyle = RISK_STYLES[card.risk_level] ?? RISK_STYLES.D1!
          return (
            <div
              key={card.proposal_id}
              className="j-card"
              style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                opacity: selectable ? 1 : 0.7,
              }}
            >
              {/* Badge row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="checkbox"
                  checked={selected.has(card.proposal_id)}
                  disabled={!selectable}
                  onChange={() => toggle(card.proposal_id)}
                  style={{ accentColor: 'var(--green)', cursor: selectable ? 'pointer' : 'not-allowed' }}
                />

                {/* 임원 chip */}
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--green-press)', background: 'var(--green-tint)',
                  padding: '2px 8px', borderRadius: 4,
                }}>
                  {card.executive}
                </span>

                {/* 도구 */}
                <span style={{ fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>
                  {card.tool_label}
                </span>

                {/* 위험도 D1/D2 */}
                <span style={{
                  ...riskStyle, padding: '2px 8px', borderRadius: 4,
                  fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
                }}>
                  {card.risk_level}
                </span>

                {/* 수집 소스 */}
                <span style={{
                  fontSize: 11, color: 'var(--ink-3)', background: 'var(--silver-1)',
                  padding: '2px 8px', borderRadius: 999, fontFamily: 'var(--font-sans)',
                }}>
                  {SOURCE_LABEL[card.source] ?? card.source}
                </span>

                {card.self_mod_status === 'sent' && <SentChip />}
                {blocked[card.proposal_id] && <BlockedChip reason={blocked[card.proposal_id]!} />}
              </div>

              {/* 문제 */}
              <div style={{
                fontFamily: 'var(--font-sans)', fontWeight: 600,
                fontSize: 14, color: 'var(--ink-1)', lineHeight: 1.4,
              }}>
                {card.problem}
              </div>

              {/* 근본원인 */}
              {card.root_cause && (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>
                  근본원인: {card.root_cause}
                </p>
              )}

              {/* 해결예정 */}
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                해결예정: {card.proposed_fix}
              </p>

              {/* 차단 사유 인라인 */}
              {blocked[card.proposal_id] && (
                <div style={{
                  background: 'var(--red-tint)', border: '1px solid var(--red)',
                  borderRadius: 5, padding: '7px 10px',
                  fontSize: 12.5, color: '#8C2A1F', lineHeight: 1.4,
                }}>
                  보호영역 수정 시사 — 차단됨: {blocked[card.proposal_id]}
                </div>
              )}

              {/* 대상 repo 배지 + 공수 */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)',
                  background: 'var(--silver-1)', padding: '3px 9px', borderRadius: 5,
                }}>
                  📦 {card.target_repo_label}
                </span>
                {card.effort_estimate && (
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
                    예상공수 {card.effort_estimate}
                  </span>
                )}
                <span style={{
                  marginLeft: 'auto', fontFamily: 'var(--font-mono)',
                  fontSize: 11, color: 'var(--ink-4)',
                }}>
                  {relativeTime(card.created_at)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* sticky 일괄 액션바 */}
      {!loading && cards.length > 0 && (
        <div style={{
          position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', background: 'var(--paper-surface)',
          borderTop: '1px solid var(--silver-2)', flexWrap: 'wrap',
        }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer', userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={selectableIds.length === 0}
              style={{ accentColor: 'var(--green)', cursor: 'pointer' }}
            />
            전체 선택
          </label>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-3)' }}>
            {selected.size}건 선택됨
          </span>
          <button
            onClick={bulkApprove}
            disabled={selected.size === 0 || submitting}
            className="j-btn j-btn-primary"
          >
            선택 {selected.size}건 일괄 승인 → CTO
          </button>
        </div>
      )}
    </div>
  )
}

export default function SelfImprovePage() {
  return <AuthGate><SelfImproveContent /></AuthGate>
}
