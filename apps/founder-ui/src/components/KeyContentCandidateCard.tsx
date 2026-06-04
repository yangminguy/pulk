'use client'

import { motion } from 'framer-motion'
import CandidateMetricsChart from './CandidateMetricsChart'

export type KeyContentCandidate = {
  id: string
  title: string
  summary: string
  effect: string
  metrics?: { label: string; value: number }[]
}

type Props = {
  candidate: KeyContentCandidate
  onSelect: (id: string) => void
  onReject: (id: string) => void
  loading?: boolean
}

export default function KeyContentCandidateCard({ candidate, onSelect, onReject, loading }: Props) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 8,
        background: 'var(--paper-surface)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--ink-1)',
          margin: 0,
          lineHeight: 1.35,
        }}>
          {candidate.title}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 }}>
          {candidate.summary}
        </p>
        <div style={{
          fontSize: 12.5,
          color: 'var(--ink-3)',
          background: 'var(--paper-elevated)',
          border: '1px solid var(--silver-1)',
          borderRadius: 4,
          padding: '8px 10px',
          lineHeight: 1.5,
        }}>
          <span style={{ fontWeight: 600, color: 'var(--ink-2)', marginRight: 4 }}>기대효과</span>
          {candidate.effect}
        </div>
        {candidate.metrics && candidate.metrics.length > 0 && (
          <CandidateMetricsChart data={candidate.metrics} />
        )}
      </div>

      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--silver-1)',
        display: 'flex',
        gap: 8,
        justifyContent: 'flex-end',
      }}>
        <button
          onClick={() => onReject(candidate.id)}
          disabled={loading}
          className="j-btn j-btn-danger j-btn-sm"
        >
          거절
        </button>
        <button
          onClick={() => onSelect(candidate.id)}
          disabled={loading}
          className="j-btn j-btn-primary j-btn-sm"
        >
          채택
        </button>
      </div>
    </motion.div>
  )
}
