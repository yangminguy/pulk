'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import type { ThumbnailCandidate } from '@/lib/api'

// ── R4 썸네일 상세 단계 ─────────────────────────────────────────────────────────
// 비전: 키 콘텐츠 확정 후, CMO가 썸네일 후보 N개(기본 3)를 자동 제안 → 사장님이 택1.
// 키 콘텐츠처럼 "1개 택1" — 각 카드 = 시각 방향 + 카피 + 훅 타입 + '이 썸네일로 선택'.

function CandidateCard({
  candidate,
  recommended,
  onSelect,
  selecting,
}: {
  candidate: ThumbnailCandidate
  recommended: boolean
  onSelect: () => void
  selecting: boolean
}) {
  return (
    <div style={{
      border: '1px solid var(--silver-2)',
      borderLeft: `4px solid ${recommended ? 'var(--green)' : 'var(--wood-3)'}`,
      borderRadius: 10,
      background: 'var(--paper-surface)',
      padding: 18,
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--wood-3)',
          padding: '3px 9px', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          {candidate.click_logic}
        </span>
        {recommended && (
          <span style={{
            flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--pi-green)', background: 'var(--p-green)',
            padding: '3px 9px', borderRadius: 999,
          }}>
            추천
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0, width: 80, fontSize: 11, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 1 }}>
            카피
          </span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.5 }}>
            {candidate.copy}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0, width: 80, fontSize: 11, fontWeight: 700, color: 'var(--wood-3)', textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 1 }}>
            시각 방향
          </span>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            {candidate.visual_direction}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="j-btn j-btn-primary j-btn-sm" onClick={onSelect} disabled={selecting}>
          {selecting ? '선택 중...' : '이 썸네일로 선택'}
        </button>
      </div>
    </div>
  )
}

export default function ThumbnailPlanBoard({
  projectId,
  cards,
  onRefresh,
}: {
  projectId: string
  cards?: { stage?: string; data?: unknown }[]
  onRefresh: () => void
}) {
  const [proposing, setProposing] = useState(false)
  const [candidates, setCandidates] = useState<ThumbnailCandidate[] | null>(null)
  const [recommended, setRecommended] = useState<string | null>(null)
  const [whyRecommended, setWhyRecommended] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [committed, setCommitted] = useState(false)

  const handlePropose = useCallback(async () => {
    setProposing(true)
    setError(null)
    try {
      const res = await api.cmoProposeThumbnailPlanDraft(projectId)
      setCandidates(res.candidates ?? [])
      setRecommended(res.recommended ?? null)
      setWhyRecommended(res.why_recommended ?? '')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '썸네일 후보 생성 실패')
    } finally {
      setProposing(false)
    }
  }, [projectId])

  // 진입 시: 이미 생성된 thumbnail_plan 카드가 있으면 로드. 없으면 자동 1회 생성.
  const autoProposed = useRef(false)
  useEffect(() => {
    if (autoProposed.current || candidates) return
    autoProposed.current = true
    const existing = cards?.find(c => c.stage === 'thumbnail_plan')
    const data = existing?.data as { candidates?: ThumbnailCandidate[]; recommended?: string; why_recommended?: string } | undefined
    if (data?.candidates && data.candidates.length > 0) {
      setCandidates(data.candidates)
      setRecommended(data.recommended ?? null)
      setWhyRecommended(data.why_recommended ?? '')
      return
    }
    void handlePropose()
  }, [candidates, handlePropose, cards])

  const handleSelect = useCallback(async (candidate_id: string) => {
    setSelecting(candidate_id)
    setError(null)
    try {
      await api.cmoCommitThumbnailPlan(projectId, candidate_id)
      setCommitted(true)
      onRefresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '썸네일 선택 실패')
    } finally {
      setSelecting(null)
    }
  }, [projectId, onRefresh])

  if (proposing || (!candidates && !error)) {
    return (
      <div>
        <div className="j-overline" style={{ marginBottom: 16 }}>썸네일 상세 기획</div>
        <div style={{
          border: '1px solid var(--silver-2)', borderRadius: 12, background: 'var(--paper-surface)',
          padding: '48px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 8 }}>
            CMO가 썸네일 후보를 만들고 있습니다…
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            확정하신 주제로 클릭을 유도할 썸네일 후보를 만들고 있습니다.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="j-overline" style={{ marginBottom: 16 }}>썸네일 상세 기획 · 후보 택1</div>

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
          썸네일을 확정했습니다. 다음 단계로 진행합니다.
        </div>
      )}

      {whyRecommended && (
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 16, lineHeight: 1.6 }}>
          {whyRecommended}
        </div>
      )}

      {(candidates ?? []).map(c => (
        <CandidateCard
          key={c.candidate_id}
          candidate={c}
          recommended={c.candidate_id === recommended}
          onSelect={() => handleSelect(c.candidate_id)}
          selecting={selecting === c.candidate_id}
        />
      ))}

      {candidates && candidates.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
          후보가 생성되지 않았습니다.
          <button className="j-btn j-btn-secondary j-btn-sm" onClick={() => handlePropose()} style={{ marginLeft: 12 }}>
            다시 생성
          </button>
        </div>
      )}
    </div>
  )
}
