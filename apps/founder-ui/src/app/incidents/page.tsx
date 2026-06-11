'use client'
import { useCallback, useEffect, useState } from 'react'
import AuthGate from '@/components/AuthGate'
import { api, TigerIncident, TigerIncidentStatus } from '@/lib/api'

// ── Config (표시 전용, 도메인 로직 아님) ──────────────────────────────────────
const STATUS_LABEL: Record<TigerIncidentStatus, string> = {
  detected:  '감지됨 · 승인 대기',
  approved:  '승인됨 · CTO 수정 대기',
  fixing:    'CTO 수정 중',
  testing:   '호랑이 검증 중',
  resolved:  '해결됨',
  escalated: '사람 확인 필요',
}

const STATUS_STYLE: Record<TigerIncidentStatus, { bg: string; fg: string }> = {
  detected:  { bg: 'var(--red-tint)',   fg: '#8C2A1F' },
  approved:  { bg: 'var(--green-tint)', fg: 'var(--green-press)' },
  fixing:    { bg: 'var(--silver-1)',   fg: 'var(--ink-2)' },
  testing:   { bg: 'var(--silver-1)',   fg: 'var(--ink-2)' },
  resolved:  { bg: 'var(--green-tint)', fg: 'var(--green-press)' },
  escalated: { bg: 'var(--red-tint)',   fg: '#8C2A1F' },
}

const TYPE_LABEL: Record<string, string> = {
  failed:  '실패',
  stalled: '멈춤',
  error:   '오류',
}

const MAX_ATTEMPTS = 4

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

// 승인 버튼은 detected에서만 노출(승인 전 코딩 금지 — 안전 게이트).
function isApprovable(status: TigerIncidentStatus): boolean {
  return status === 'detected'
}

// ── Main content ──────────────────────────────────────────────────────────────
function IncidentsContent() {
  const [items, setItems] = useState<TigerIncident[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try { setItems(await api.listIncidents()) }
    catch { setItems([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  const approve = useCallback(async (id: string) => {
    const ok = window.confirm('이 장애를 CTO가 고치도록 승인합니다. 승인 후 호랑이가 수정·검증을 진행합니다.')
    if (!ok) return
    setApproving(prev => new Set(prev).add(id))
    // optimistic: 해당 카드를 approved로
    setItems(prev => prev.map(it => (it.id === id ? { ...it, status: 'approved' as TigerIncidentStatus } : it)))
    try {
      await api.approveIncidentFix(id)
      await load()
    } catch {
      // 실패 시 되돌림
      setItems(prev => prev.map(it => (it.id === id ? { ...it, status: 'detected' as TigerIncidentStatus } : it)))
    } finally {
      setApproving(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }, [load])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '20px 24px', maxWidth: 880, margin: '0 auto' }}>

      {/* Page header */}
      <div>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-3)',
          letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px',
        }}>
          호랑이 실시간 장애 감시
        </p>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: 22,
          color: 'var(--ink-1)', margin: 0, letterSpacing: '-0.01em',
        }}>
          🔔 장애 감시
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink-3)', fontFamily: 'var(--font-sans)' }}>
          백그라운드 실행이 멈추거나 실패하면 호랑이가 감지해 알립니다. 진단·수정 계획을 확인하고 승인하면 CTO가 고칩니다.
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>로딩 중...</p>
      )}

      {/* Empty */}
      {!loading && items.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '56px 24px',
          color: 'var(--ink-4)', fontSize: 13.5,
          background: 'var(--paper-surface)',
          border: '1px solid var(--silver-2)', borderRadius: 8,
        }}>
          현재 감지된 장애가 없습니다. 호랑이가 백그라운드 실행을 감시 중입니다.
        </div>
      )}

      {/* Incident cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(it => {
          const statusStyle = STATUS_STYLE[it.status] ?? STATUS_STYLE.detected
          const busy = approving.has(it.id)
          return (
            <div key={it.id} className="j-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Badge row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {it.incident_type && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: '#8C2A1F', background: 'var(--red-tint)',
                    padding: '2px 8px', borderRadius: 4,
                  }}>
                    {TYPE_LABEL[it.incident_type] ?? it.incident_type}
                  </span>
                )}
                <span style={{
                  ...statusStyle, padding: '2px 8px', borderRadius: 4,
                  fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}>
                  {STATUS_LABEL[it.status] ?? it.status}
                </span>
                <span style={{
                  fontSize: 11, color: 'var(--ink-3)', background: 'var(--silver-1)',
                  padding: '2px 8px', borderRadius: 999, fontFamily: 'var(--font-mono)',
                }}>
                  시도 {it.attempt_count}/{MAX_ATTEMPTS}
                </span>
                <span style={{
                  marginLeft: 'auto', fontFamily: 'var(--font-mono)',
                  fontSize: 11, color: 'var(--ink-4)',
                }}>
                  {relativeTime(it.detected_at)}
                </span>
              </div>

              {/* 작업명 */}
              <div style={{
                fontFamily: 'var(--font-sans)', fontWeight: 600,
                fontSize: 14, color: 'var(--ink-1)', lineHeight: 1.4,
              }}>
                {it.task_label ?? it.task_ref ?? '백그라운드 작업'}
              </div>

              {/* 오류 요지 */}
              {it.error_summary && (
                <div style={{
                  background: 'var(--red-tint)', border: '1px solid var(--red)',
                  borderRadius: 5, padding: '7px 10px',
                  fontSize: 12.5, color: '#8C2A1F', lineHeight: 1.5,
                  fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                }}>
                  {it.error_summary}
                </div>
              )}

              {/* 호랑이 진단 */}
              {it.diagnosis && (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>
                  진단: {it.diagnosis}
                </p>
              )}

              {/* CTO 수정 계획 */}
              {it.proposed_fix && (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                  CTO 수정 계획: {it.proposed_fix}
                </p>
              )}

              {/* 대상 repo + 액션 */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {it.target_repo && (
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)',
                    background: 'var(--silver-1)', padding: '3px 9px', borderRadius: 5,
                    overflowWrap: 'anywhere',
                  }}>
                    📦 {it.target_repo}
                  </span>
                )}
                {it.status === 'escalated' && (
                  <span style={{ fontSize: 12, color: '#8C2A1F', fontWeight: 600 }}>
                    {MAX_ATTEMPTS}회 시도 실패 — 사람이 확인해야 합니다.
                  </span>
                )}
                {isApprovable(it.status) && (
                  <button
                    onClick={() => approve(it.id)}
                    disabled={busy}
                    className="j-btn j-btn-primary j-btn-sm"
                    style={{ marginLeft: 'auto' }}
                  >
                    {busy ? '승인 중...' : '승인 → CTO가 고치게'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function IncidentsPage() {
  return <AuthGate><IncidentsContent /></AuthGate>
}
