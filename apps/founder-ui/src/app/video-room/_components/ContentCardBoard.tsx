'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import type {
  ContentCard,
  ContentCardStatus,
  ConsumerStage,
  GenerateBriefResult,
} from '../_lib/script-room-types'

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ContentCardStatus, string> = {
  idle: '대기',
  research: '리서치',
  strategy: '전략',
  script: '원고',
  qa: 'QA',
  video: '영상',
  done: '완료',
  error: '오류',
}

const STATUS_COLOR: Record<ContentCardStatus, { bg: string; fg: string }> = {
  idle:     { bg: 'var(--silver-2)',   fg: 'var(--ink-3)' },
  research: { bg: 'var(--p-butter)',   fg: 'var(--pi-butter)' },
  strategy: { bg: 'var(--p-butter)',   fg: 'var(--pi-butter)' },
  script:   { bg: 'var(--p-blue)',     fg: 'var(--blue)' },
  qa:       { bg: 'var(--p-rose)',     fg: 'var(--pi-rose)' },
  video:    { bg: 'var(--p-green)',    fg: 'var(--green)' },
  done:     { bg: 'var(--p-green)',    fg: 'var(--green)' },
  error:    { bg: 'var(--p-rose)',     fg: 'var(--pi-rose)' },
}

function StatusBadge({ status }: { status: ContentCardStatus }) {
  const { bg, fg } = STATUS_COLOR[status]
  return (
    <span style={{
      fontSize: 10.5,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 999,
      background: bg,
      color: fg,
      letterSpacing: '0.03em',
    }}>
      {STATUS_LABEL[status]}
    </span>
  )
}

// ── Stage chip ───────────────────────────────────────────────────────────────

const STAGE_LABEL: Record<ConsumerStage, string> = {
  phenomenon: '현상',
  desire:     '욕구',
  plan:       '계획',
  action:     '행동',
  reward:     '보상',
}

function StageChip({ stage }: { stage: ConsumerStage }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      padding: '1px 6px',
      borderRadius: 4,
      background: 'var(--bg-inset)',
      color: 'var(--ink-3)',
      border: '1px solid var(--silver-2)',
    }}>
      {STAGE_LABEL[stage]}
    </span>
  )
}

// ── Single content card ───────────────────────────────────────────────────────

function ContentCardItem({
  card,
  selected,
  generating,
  onSelect,
  onGenerate,
}: {
  card: ContentCard
  selected: boolean
  generating: boolean
  onSelect: () => void
  onGenerate: () => void
}) {
  const isKey = card.content_type === 'key'
  const accentColor = isKey ? 'var(--wood-3)' : 'var(--blue)'

  return (
    <div
      onClick={onSelect}
      style={{
        border: `1px solid ${selected ? accentColor : 'var(--silver-2)'}`,
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: 8,
        background: selected ? 'var(--paper-surface)' : 'var(--bg)',
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10.5,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: accentColor,
        }}>
          {isKey ? 'Key' : card.slot.replace('pulling_', 'Pulling ')}
        </span>
        <StatusBadge status={card.status} />
      </div>

      {/* Title */}
      <div style={{
        fontSize: 13.5,
        fontWeight: 600,
        color: 'var(--ink-1)',
        lineHeight: 1.45,
      }}>
        {card.title || '(제목 없음)'}
      </div>

      {/* Covered stages */}
      {card.covered_stages.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {card.covered_stages.map(s => (
            <StageChip key={s} stage={s} />
          ))}
        </div>
      )}

      {/* Thumbnail candidates */}
      {card.thumbnail_candidates && card.thumbnail_candidates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            썸네일 후보
          </div>
          {card.thumbnail_candidates.slice(0, 2).map((t, i) => (
            <div key={i} style={{
              fontSize: 12,
              color: 'var(--ink-2)',
              background: 'var(--bg-inset)',
              borderRadius: 4,
              padding: '4px 8px',
              lineHeight: 1.4,
            }}>
              {t.hook_text}
            </div>
          ))}
        </div>
      )}

      {/* Factory result link */}
      {card.factory_result_url && (
        <div style={{ marginTop: 2 }}>
          <a
            href={card.factory_result_url}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              fontSize: 12,
              color: 'var(--blue)',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Factory 결과 보기 →
          </a>
        </div>
      )}

      {/* Generate button — only show when status is qa or done (brief ready) or always visible */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
        <button
          onClick={e => {
            e.stopPropagation()
            onGenerate()
          }}
          disabled={generating}
          className="j-btn j-btn-primary j-btn-sm"
          style={{ fontSize: 12 }}
        >
          {generating ? '생성 중...' : '영상 생성'}
        </button>
      </div>
    </div>
  )
}

// ── ContentCardBoard ──────────────────────────────────────────────────────────

export default function ContentCardBoard({
  projectId,
  cards,
  selectedCardId,
  onSelectCard,
  onBriefGenerated,
}: {
  projectId: string
  cards: ContentCard[]
  selectedCardId: string | null
  onSelectCard: (id: string) => void
  onBriefGenerated?: (cardId: string, result: GenerateBriefResult) => void
}) {
  // Track which card is currently generating (only one at a time — PRD §1.5)
  const [generatingCardId, setGeneratingCardId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleGenerate = async (card: ContentCard) => {
    if (generatingCardId !== null) return // enforce sequential — no batch generation
    setGeneratingCardId(card.id)
    setErrors(prev => { const n = { ...prev }; delete n[card.id]; return n })

    try {
      // api.post convention: POST /api/cmo:generateVideoExecutionBrief
      const result = await (api as unknown as {
        post: (action: string, body: unknown) => Promise<{ data: { ok: boolean; data: GenerateBriefResult } }>
      }).post('cmo:generateVideoExecutionBrief', {
        project_id: projectId,
        content_card_id: card.id,
      }).then(r => {
        const inner = r.data
        if (inner && typeof inner === 'object' && 'data' in inner) {
          return (inner as { data: GenerateBriefResult }).data
        }
        return inner as unknown as GenerateBriefResult
      })

      onBriefGenerated?.(card.id, result)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '영상 생성 실패'
      setErrors(prev => ({ ...prev, [card.id]: msg }))
    } finally {
      setGeneratingCardId(null)
    }
  }

  // Separate pulling cards (ordered) from key card
  const pullingCards = cards.filter(c => c.content_type === 'pulling')
    .sort((a, b) => a.slot.localeCompare(b.slot))
  const keyCards = cards.filter(c => c.content_type === 'key')

  const renderSection = (label: string, sectionCards: ContentCard[]) => (
    <div style={{ marginBottom: 20 }}>
      <div className="j-overline" style={{ marginBottom: 10 }}>{label}</div>
      {sectionCards.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--ink-4)', padding: '8px 0' }}>
          카드가 없습니다. CMO와 대화를 시작하면 생성됩니다.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sectionCards.map(card => (
            <div key={card.id}>
              <ContentCardItem
                card={card}
                selected={selectedCardId === card.id}
                generating={generatingCardId === card.id}
                onSelect={() => onSelectCard(card.id)}
                onGenerate={() => handleGenerate(card)}
              />
              {errors[card.id] && (
                <div style={{
                  fontSize: 12,
                  color: 'var(--pi-rose)',
                  background: 'var(--p-rose)',
                  borderRadius: 4,
                  padding: '5px 10px',
                  marginTop: 4,
                }}>
                  {errors[card.id]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div>
      {renderSection('Pulling 콘텐츠 (1~5)', pullingCards)}
      {renderSection('Key 콘텐츠', keyCards)}
    </div>
  )
}
