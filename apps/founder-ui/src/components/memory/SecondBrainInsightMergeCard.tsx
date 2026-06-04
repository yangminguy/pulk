import React from 'react'

export type MergeAction = 'merge' | 'discard_new' | 'keep_both'

export interface MergeCardData {
  candidate_id: string
  incoming: { insight: string; source_agent: string }
  existing: { card_id: string; insight: string }
  similarity_score: number
  suggested_merge: string
}

interface Props {
  data: MergeCardData
  onAction: (candidateId: string, action: MergeAction) => void
}

export function SecondBrainInsightMergeCard({ data, onAction }: Props) {
  const pct = Math.round(data.similarity_score * 100)

  return (
    <div style={{
      background: 'var(--paper-surface)',
      border: '1px solid var(--silver-2)',
      borderRadius: 6,
      padding: '14px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)' }}>
          유사도
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--ink-1)',
        }}>
          {pct}%
        </span>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--ink-4)', marginBottom: 4 }}>기존</div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.4 }}>
          {data.existing.insight}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--ink-4)', marginBottom: 4 }}>신규</div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.4 }}>
          {data.incoming.insight}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <button
          className="j-btn j-btn-primary j-btn-sm"
          onClick={() => onAction(data.candidate_id, 'merge')}
        >
          병합하여 저장
        </button>
        <button
          className="j-btn j-btn-sm"
          onClick={() => onAction(data.candidate_id, 'discard_new')}
        >
          신규 건 폐기
        </button>
        <button
          className="j-btn j-btn-sm"
          onClick={() => onAction(data.candidate_id, 'keep_both')}
        >
          각각 분리 저장
        </button>
      </div>
    </div>
  )
}
