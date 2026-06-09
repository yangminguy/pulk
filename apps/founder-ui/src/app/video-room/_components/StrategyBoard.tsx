'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { blockState } from '../_lib/phases'
import type { CmoCard } from '../_lib/types'
import { Intro30sCard, CardShell } from './cards'
import StageGate from './StageGate'
import KeyContentPlanBoard from './KeyContentPlanBoard'

// ── Strategy Board ───────────────────────────────────────────────────────────
export default function StrategyBoard({
  cards,
  projectId,
  currentStatus,
  product,
  onRefresh,
}: {
  cards: CmoCard[]
  projectId: string
  currentStatus: string
  product?: string
  onRefresh: () => void
}) {
  const [refUrl, setRefUrl] = useState('')
  const [refTitle, setRefTitle] = useState('')
  const [refViews, setRefViews] = useState('')
  const [refReason, setRefReason] = useState('')
  const [saving, setSaving] = useState(false)

  const strategyCards = cards.filter(c =>
    !['script_planning', 'script_draft', 'reading_script', 'voice_recording', 'slide_deck', 'rendering', 'qa', 'upload_draft'].includes(c.stage)
  )

  const saveRef = async () => {
    if (!refUrl.trim() || !refTitle.trim()) return
    setSaving(true)
    try {
      await api.cmoSaveCard({
        project_id: projectId,
        stage: 'reference_analysis',
        summary: refTitle,
        data: { url: refUrl, title: refTitle, view_count: refViews ? Number(refViews) : undefined, selected_reason: refReason },
      })
      setRefUrl('')
      setRefTitle('')
      setRefViews('')
      setRefReason('')
      onRefresh()
    } catch {
      // silently fail; user can retry
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="j-overline" style={{ marginBottom: 8 }}>Strategy Board</div>

      {strategyCards.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-4)', marginBottom: 16 }}>
          CMO와 대화를 시작하면 카드가 생성됩니다.
        </p>
      )}

      {strategyCards
        // 키 콘텐츠 v3 카드는 raw JSON으로 노출하지 않는다 — 전용 보드(KeyContentPlanBoard)가 렌더.
        .filter(card => !['key_content_draft', 'key_content_candidates', 'key_content_choice', 'key_content'].includes(card.stage))
        .map(card => {
          if (card.stage === 'intro_30s') {
            return <Intro30sCard key={card.id} card={card} />
          }
          return <CardShell key={card.id} card={card} />
        })}

      {/* 키 콘텐츠 11스텝 보드 — key_content_ideation/viewtrap_key_research/key_content_approval */}
      <div style={{ marginTop: 16 }}>
        <StageGate title="키 콘텐츠 기획 (v3 · 11스텝)" state={blockState({ from: 'key_content_ideation', to: 'key_content_approval' }, currentStatus)}>
          <KeyContentPlanBoard projectId={projectId} product={product} cards={cards} onRefresh={onRefresh} />
        </StageGate>
      </div>

      {/* Viewtrap 수동 입력 폼 — 리서치 단계 게이팅 */}
      <div style={{ marginTop: 16 }}>
        <StageGate title="Viewtrap 리서치 수동 입력" state={blockState({ from: 'key_content_ideation', to: 'hook_draft_approval' }, currentStatus)}>
          <div style={{
            border: '1px solid var(--silver-2)',
            borderRadius: 8,
            background: 'var(--paper-surface)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
                Viewtrap 리서치 수동 입력
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 8 }}>
                <a href="https://app.viewtrap.com/video-search" target="_blank" rel="noreferrer"
                  style={{ color: 'var(--blue)', textDecoration: 'none' }}>
                  Viewtrap 열기 →
                </a>
              </span>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                className="j-input"
                placeholder="영상 URL"
                value={refUrl}
                onChange={e => setRefUrl(e.target.value)}
              />
              <input
                className="j-input"
                placeholder="영상 제목"
                value={refTitle}
                onChange={e => setRefTitle(e.target.value)}
              />
              <input
                className="j-input"
                placeholder="조회수 (선택)"
                value={refViews}
                onChange={e => setRefViews(e.target.value)}
                type="number"
              />
              <input
                className="j-input"
                placeholder="선택 이유"
                value={refReason}
                onChange={e => setRefReason(e.target.value)}
              />
              <button
                onClick={saveRef}
                disabled={saving || !refUrl.trim() || !refTitle.trim()}
                className="j-btn j-btn-secondary j-btn-sm"
                style={{ alignSelf: 'flex-end' }}
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </StageGate>
      </div>
    </div>
  )
}
