'use client'

import type { KeyContentCandidate } from './KeyContentCandidateCard'

type Props = {
  candidate: KeyContentCandidate
  status: string
  selectedAt?: string
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  selected:  { bg: 'var(--green-tint)', color: 'var(--green-press)', label: '승인됨' },
  ready:     { bg: 'var(--green-tint)', color: 'var(--green-press)', label: '준비 완료' },
  published: { bg: 'var(--silver-1)',   color: 'var(--ink-2)',       label: '배포됨' },
}

export default function SelectedKeyContentCard({ candidate, status, selectedAt }: Props) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.selected!

  return (
    <div style={{
      border: '1px solid var(--silver-2)',
      borderLeft: '4px solid var(--green)',
      borderRadius: 8,
      background: 'var(--paper-surface)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--ink-1)',
            margin: 0,
            flex: 1,
            lineHeight: 1.35,
          }}>
            {candidate.title}
          </h3>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 999,
            background: s.bg,
            color: s.color,
            flexShrink: 0,
          }}>
            {s.label}
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 }}>
          {candidate.summary}
        </p>
        {selectedAt && (
          <span style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
            선택일: {new Date(selectedAt).toLocaleDateString('ko-KR')}
          </span>
        )}
      </div>
    </div>
  )
}
