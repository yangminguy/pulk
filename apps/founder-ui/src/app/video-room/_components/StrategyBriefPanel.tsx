'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { CmoVideoStrategyBrief, CmoLogicBlock, ConsumerStage } from '../_lib/script-room-types'

// ── Shared helpers ────────────────────────────────────────────────────────────

const STAGE_LABEL: Record<ConsumerStage, string> = {
  phenomenon: '현상',
  desire: '욕구',
  plan: '계획',
  action: '행동',
  reward: '보상',
}

const STAGE_COLOR: Record<ConsumerStage, { bg: string; text: string }> = {
  phenomenon: { bg: 'var(--p-butter)', text: 'var(--pi-butter)' },
  desire:     { bg: 'var(--p-rose)',   text: 'var(--pi-rose)' },
  plan:       { bg: 'var(--p-blue)',   text: 'var(--blue)' },
  action:     { bg: 'var(--p-green)',  text: 'var(--green)' },
  reward:     { bg: 'var(--silver-2)', text: 'var(--ink-2)' },
}

function StageBadge({ stage }: { stage: ConsumerStage }) {
  const { bg, text } = STAGE_COLOR[stage] ?? { bg: 'var(--silver-2)', text: 'var(--ink-2)' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px',
      borderRadius: 999, background: bg, color: text, display: 'inline-block',
    }}>
      {STAGE_LABEL[stage] ?? stage}
    </span>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--ink-3)',
      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
    }}>
      {label}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', minWidth: 72, flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.55 }}>{value}</span>
    </div>
  )
}

function StringList({ items, color }: { items?: string[]; color?: string }) {
  if (!items?.length) return <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>—</span>
  return (
    <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 12.5, color: color ?? 'var(--ink-1)', lineHeight: 1.55 }}>{item}</li>
      ))}
    </ul>
  )
}

// ── Consumer Desire Coverage strip ────────────────────────────────────────────

const ALL_STAGES: ConsumerStage[] = ['phenomenon', 'desire', 'plan', 'action', 'reward']

function DesireCoverageBadges({
  coveredStages,
  primaryStage,
}: {
  coveredStages: ConsumerStage[]
  primaryStage?: string
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {ALL_STAGES.map(stage => {
        const covered = coveredStages.includes(stage)
        const isPrimary = stage === primaryStage
        const { bg, text } = STAGE_COLOR[stage]
        return (
          <span key={stage} style={{
            fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
            background: covered ? bg : 'var(--silver-1)',
            color: covered ? text : 'var(--ink-4)',
            outline: isPrimary && covered ? `2px solid ${text}` : 'none',
            outlineOffset: 1,
            opacity: covered ? 1 : 0.45,
          }}>
            {STAGE_LABEL[stage]}{isPrimary && covered && ' ●'}
          </span>
        )
      })}
    </div>
  )
}

// ── Logic block card ──────────────────────────────────────────────────────────

function LogicBlockCard({ block, index }: { block: CmoLogicBlock; index: number }) {
  return (
    <div style={{ border: '1px solid var(--silver-2)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
      <div style={{
        padding: '8px 12px', background: 'var(--bg-inset)', borderBottom: '1px solid var(--silver-1)',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', minWidth: 52 }}>
          Block {index + 1}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', flex: 1 }}>{block.role}</span>
        {block.covered_stages?.map(stage => <StageBadge key={stage} stage={stage} />)}
      </div>

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Main claim */}
        <div style={{
          padding: '8px 10px', background: 'var(--p-butter)', borderRadius: 4,
          fontSize: 13, fontWeight: 600, color: 'var(--pi-butter)', lineHeight: 1.5,
        }}>
          {block.main_claim}
        </div>

        {!!block.supporting_materials?.length && (
          <div>
            <SectionHeader label="근거 재료" />
            <StringList items={block.supporting_materials} />
          </div>
        )}

        {block.visual_intent_hint && (
          <div style={{
            padding: '6px 10px', background: 'var(--silver-1)', borderRadius: 4,
            display: 'flex', gap: 6, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', flexShrink: 0, paddingTop: 1 }}>Visual hint</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, fontStyle: 'italic' }}>
              {block.visual_intent_hint}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {block.viewer_emotion && (
            <div style={{ flex: 1, minWidth: 140 }}>
              <SectionHeader label="시청자 감정" />
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{block.viewer_emotion}</span>
            </div>
          )}
          {block.transition_to_next_block && (
            <div style={{ flex: 1, minWidth: 140 }}>
              <SectionHeader label="다음 블록으로" />
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{block.transition_to_next_block}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Data extraction ───────────────────────────────────────────────────────────

type RawCard = { stage: string; data: unknown }

function extractBrief(cards: RawCard[]): CmoVideoStrategyBrief | undefined {
  const card = cards.find(c => c.stage === 'cmo_video_strategy_brief')
  if (!card?.data) return undefined
  const d = card.data as Record<string, unknown>
  // May be wrapped: { cmo_video_strategy_brief: { ... } } or the brief directly
  return (d['cmo_video_strategy_brief'] ?? card.data) as CmoVideoStrategyBrief
}

// ── Brief renderer (pure display) ────────────────────────────────────────────

function BriefDisplay({ brief }: { brief: CmoVideoStrategyBrief }) {
  const coverage = brief.consumer_desire_coverage
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span className="j-overline" style={{ flex: 1 }}>Strategy Brief</span>
        {brief.content_type && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
            background: brief.content_type === 'key' ? 'var(--p-blue)' : 'var(--silver-2)',
            color: brief.content_type === 'key' ? 'var(--blue)' : 'var(--ink-2)',
          }}>
            {brief.content_type === 'key' ? 'Key 콘텐츠' : 'Pulling 콘텐츠'}
          </span>
        )}
      </div>

      {brief.topic && (
        <div style={{ marginBottom: 12 }}>
          <SectionHeader label="주제" />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.5 }}>{brief.topic}</p>
        </div>
      )}

      {brief.core_message && (
        <div style={{ padding: '10px 14px', background: 'var(--p-blue)', borderRadius: 6, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            핵심 메시지
          </div>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.6 }}>{brief.core_message}</p>
        </div>
      )}

      {/* Consumer desire coverage */}
      {coverage && (
        <div style={{ marginBottom: 14 }}>
          <SectionHeader label="소비자 욕구 5단계 커버리지" />
          <DesireCoverageBadges
            coveredStages={coverage.covered_stages ?? []}
            primaryStage={coverage.primary_stage}
          />
          {coverage.stage_explanation && (
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>
              {coverage.stage_explanation}
            </p>
          )}
        </div>
      )}

      {/* Target viewer */}
      {brief.target_viewer && (
        <div style={{ border: '1px solid var(--silver-2)', borderRadius: 6, padding: '10px 14px', marginBottom: 12, background: 'var(--bg-inset)' }}>
          <SectionHeader label="타깃 시청자" />
          <InfoRow label="대상" value={brief.target_viewer.who} />
          <InfoRow label="현재 믿음" value={brief.target_viewer.current_belief} />
          <InfoRow label="숨겨진 욕구" value={brief.target_viewer.hidden_desire} />
          <InfoRow label="핵심 고통" value={brief.target_viewer.main_pain} />
          <InfoRow label="반론" value={brief.target_viewer.objection} />
          {!!brief.target_viewer.language_style?.length && (
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)' }}>언어 스타일 </span>
              {brief.target_viewer.language_style.map((s, i) => (
                <span key={i} style={{
                  fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 999,
                  background: 'var(--silver-2)', color: 'var(--ink-2)',
                  marginLeft: 4, display: 'inline-block', marginBottom: 4,
                }}>{s}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {brief.strategic_angle && (
        <div style={{ marginBottom: 10 }}>
          <SectionHeader label="전략 앵글" />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.6 }}>{brief.strategic_angle}</p>
        </div>
      )}

      {brief.video_promise && (
        <div style={{ marginBottom: 10 }}>
          <SectionHeader label="영상 약속" />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.6 }}>{brief.video_promise}</p>
        </div>
      )}

      {/* Logic blocks */}
      {!!brief.logic_blocks?.length && (
        <div style={{ marginBottom: 14 }}>
          <SectionHeader label={`논리 블록 (${brief.logic_blocks.length}개)`} />
          {brief.logic_blocks.map((block, i) => (
            <LogicBlockCard key={block.block_id} block={block} index={i} />
          ))}
        </div>
      )}

      {/* Thumbnail / intro direction */}
      {(brief.thumbnail_direction || brief.intro_direction) && (
        <div style={{ border: '1px solid var(--silver-2)', borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
          {brief.thumbnail_direction && (
            <div style={{ padding: '10px 14px', borderBottom: brief.intro_direction ? '1px solid var(--silver-1)' : 'none' }}>
              <SectionHeader label="썸네일 방향" />
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.6 }}>{brief.thumbnail_direction}</p>
            </div>
          )}
          {brief.intro_direction && (
            <div style={{ padding: '10px 14px' }}>
              <SectionHeader label="도입부 방향" />
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.6 }}>{brief.intro_direction}</p>
            </div>
          )}
        </div>
      )}

      {brief.cta && (
        <div style={{ padding: '10px 14px', background: 'var(--p-green)', borderRadius: 6, marginBottom: 12 }}>
          <SectionHeader label="CTA" />
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.6 }}>{brief.cta}</p>
        </div>
      )}

      {!!brief.risk_notes?.length && (
        <div style={{ padding: '10px 14px', background: 'var(--p-rose)', borderRadius: 6, border: '1px solid var(--pi-rose)', marginBottom: 12 }}>
          <SectionHeader label="리스크 노트" />
          <StringList items={brief.risk_notes} color="var(--pi-rose)" />
        </div>
      )}

      {brief.channel_context && (
        <div style={{ border: '1px solid var(--silver-2)', borderRadius: 6, padding: '10px 14px', marginBottom: 12, background: 'var(--bg-inset)' }}>
          <SectionHeader label="채널 컨텍스트" />
          <InfoRow label="현재 위치" value={brief.channel_context.current_position} />
          <InfoRow label="콘텐츠 기둥" value={brief.channel_context.content_pillar} />
          <InfoRow label="세트 역할" value={brief.channel_context.role_in_content_set} />
          <InfoRow label="이전 연결" value={brief.channel_context.bridge_from_previous_content} />
          <InfoRow label="다음 연결" value={brief.channel_context.bridge_to_next_content} />
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StrategyBriefPanel({
  projectId,
}: {
  projectId: string
  cardId?: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [brief, setBrief] = useState<CmoVideoStrategyBrief | undefined>()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!projectId) return
      setLoading(true)
      setError(null)
      try {
        const detail = await api.cmoGetProject(projectId) as { cards?: RawCard[] }
        if (cancelled) return
        setBrief(extractBrief(detail?.cards ?? []))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '로딩 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  if (loading) {
    return (
      <div style={{ padding: '24px 0', fontSize: 13, color: 'var(--ink-4)', textAlign: 'center' }}>
        전략기획서 로딩 중...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '12px 0', fontSize: 12.5, color: 'var(--pi-rose)' }}>
        오류: {error}
      </div>
    )
  }

  if (!brief) {
    return (
      <div style={{ padding: '16px 0' }}>
        <div className="j-overline" style={{ marginBottom: 8 }}>Strategy Brief</div>
        <p style={{ fontSize: 13, color: 'var(--ink-4)', margin: 0 }}>
          전략기획서가 아직 없습니다. CMO 에이전트가 Strategy Brief를 작성하면 여기에 표시됩니다.
        </p>
      </div>
    )
  }

  return <BriefDisplay brief={brief} />
}
