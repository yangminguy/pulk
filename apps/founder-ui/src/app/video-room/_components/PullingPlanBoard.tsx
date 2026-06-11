'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import type { PullingCandidate } from '@/lib/api'

// ── 풀링 단계 ──────────────────────────────────────────────────────────────────
// 비전: 사장님이 키 콘텐츠 1개를 택1한 뒤, 그 키 콘텐츠로 시청자를 끌어오는 풀링
// 주제 N개(기본 5)를 CMO가 자동 제안 → 사장님이 "세트째" 승인/수정.
// 키 콘텐츠(택1)와 다른 점: 개별 선택 버튼이 아니라 하단 단일 "세트 확정" 버튼 하나.
// 각 후보 = order 뱃지 + 제목 + 선정이유 4종. 본문구조·도입방향·CTA 없음(제작 단계로).

const PROGRESS_TOTAL = 5 // proposePullingCandidates progress 분모(후보 수 기준).

const REASON_LABELS: { key: keyof PullingCandidate['selection_reasons']; label: string; accent: string }[] = [
  { key: 'consumer_stage', label: '소비자 단계', accent: 'var(--blue)' },
  { key: 'bridge_to_key', label: '키 콘텐츠 브릿지', accent: 'var(--wood-3)' },
  { key: 'search_demand', label: '검색 수요', accent: 'var(--green)' },
  { key: 'problem_addressed', label: '다루는 문제', accent: 'var(--pi-butter)' },
]

function CandidateCard({ candidate }: { candidate: PullingCandidate }) {
  return (
    <div style={{
      border: '1px solid var(--silver-2)',
      borderLeft: '4px solid var(--wood-3)',
      borderRadius: 10,
      background: 'var(--paper-surface)',
      padding: 18,
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--wood-3)',
          padding: '3px 9px', borderRadius: 999, letterSpacing: '0.04em',
        }}>
          {candidate.order}
        </span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink-1)' }}>
          {candidate.title}
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {REASON_LABELS.map(({ key, label, accent }) => (
          <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{
              flexShrink: 0, width: 132, fontSize: 11, fontWeight: 700, color: accent,
              textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 1,
            }}>
              {label}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {candidate.selection_reasons?.[key] ?? '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PullingPlanBoard({
  projectId,
  cards,
  onRefresh,
}: {
  projectId: string
  cards?: { stage?: string; data?: unknown }[]
  onRefresh: () => void
}) {
  const [proposing, setProposing] = useState(false)
  const [candidates, setCandidates] = useState<PullingCandidate[] | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  const [committed, setCommitted] = useState(false)

  const handlePropose = useCallback(async () => {
    setProposing(true)
    setError(null)
    setProgress(0)
    try {
      const res = await api.cmoProposePullingCandidates(projectId)
      setCandidates(res.candidates ?? [])
      setProgress(res.progress ?? PROGRESS_TOTAL)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '풀링 주제 생성 실패')
    } finally {
      setProposing(false)
    }
  }, [projectId])

  // 진입 시: 이미 생성된 pulling_candidates 카드가 있으면 로드(재호출 없음). 없으면 자동 1회 생성.
  const autoProposed = useRef(false)
  useEffect(() => {
    if (autoProposed.current || candidates) return
    autoProposed.current = true
    const existing = cards?.find(c => c.stage === 'pulling_candidates')
    const data = existing?.data as { candidates?: PullingCandidate[]; progress?: number } | undefined
    if (data?.candidates && data.candidates.length > 0) {
      setCandidates(data.candidates)
      setProgress(data.progress ?? PROGRESS_TOTAL)
      return
    }
    void handlePropose()
  }, [candidates, handlePropose, cards])

  // 세트째 확정 — 개별 선택이 아니라 단일 버튼. 성공 시 onRefresh로 다음(제작) 단계 반영.
  const handleCommit = useCallback(async () => {
    setCommitting(true)
    setError(null)
    try {
      await api.cmoCommitPullingPlan(projectId)
      setCommitted(true)
      onRefresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '풀링 세트 확정 실패')
    } finally {
      setCommitting(false)
    }
  }, [projectId, onRefresh])

  // 진행 중: 진행률만 크게 표시(입력칸 없음).
  if (proposing || (!candidates && !error)) {
    const pct = Math.round((progress / PROGRESS_TOTAL) * 100)
    return (
      <div>
        <div className="j-overline" style={{ marginBottom: 16 }}>풀링 주제 기획</div>
        <div style={{
          border: '1px solid var(--silver-2)',
          borderRadius: 12,
          background: 'var(--paper-surface)',
          padding: '48px 32px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 8 }}>
            CMO가 풀링 주제를 만들고 있습니다…
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 24 }}>
            선택하신 키 콘텐츠로 시청자를 끌어올 풀링 주제 세트를 만들고 있습니다.
          </div>
          <div style={{ maxWidth: 320, margin: '0 auto', height: 8, borderRadius: 999, background: 'var(--silver-1)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)', transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>{pct}%</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="j-overline" style={{ marginBottom: 16 }}>풀링 주제 기획 · 후보 세트</div>

      {error && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'var(--red-tint)', border: '1px solid var(--red)', borderRadius: 6,
          fontSize: 12.5, color: 'var(--red)',
        }}>
          {error}
          <button
            className="j-btn j-btn-secondary j-btn-sm"
            onClick={() => handlePropose()}
            style={{ marginLeft: 12 }}
          >
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
          풀링 세트를 확정했습니다. 다음 단계(제작)로 진행합니다.
        </div>
      )}

      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 16 }}>
        CMO가 제안한 풀링 주제 세트입니다. 서로 다른 소비자 여정 단계를 함께 덮으며,
        각 주제는 선택하신 키 콘텐츠로 연결됩니다. 마음에 들면 세트째 확정하세요.
      </div>

      {(candidates ?? []).map(c => (
        <CandidateCard key={c.id} candidate={c} />
      ))}

      {candidates && candidates.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
          후보가 생성되지 않았습니다.
          <button className="j-btn j-btn-secondary j-btn-sm" onClick={() => handlePropose()} style={{ marginLeft: 12 }}>
            다시 생성
          </button>
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            className="j-btn j-btn-primary"
            onClick={handleCommit}
            disabled={committing || committed}
          >
            {committing ? '확정 중...' : committed ? '확정됨' : '이 풀링 세트로 확정'}
          </button>
        </div>
      )}
    </div>
  )
}
