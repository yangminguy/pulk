'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { blockState } from '../_lib/phases'
import type { CmoCard } from '../_lib/types'
import { Intro30sCard, CardShell } from './cards'
import StageGate from './StageGate'
import PullingPlanBoard from './PullingPlanBoard'
import ThumbnailPlanBoard from './ThumbnailPlanBoard'
import TitleDevelopmentBoard from './TitleDevelopmentBoard'
import ProductDefinitionBoard from './ProductDefinitionBoard'
import KeyContentReportBoard from './KeyContentReportBoard'

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
  const [advancing, setAdvancing] = useState(false)

  // 전략 대화 → 상품 정의. strategy_chat/PT 로딩 구간엔 게이트가 없으므로 advanceStatus 로
  // product_defined 까지 전진시킨다. 거기서 ProductDefinitionBoard 가 상품 정의 초안을
  // 생성·표시하고, 사장님 승인(보드 내부 버튼)으로 키 콘텐츠 기획(실검색)으로 넘어간다.
  const PRE_PRODUCT_STATUSES = ['strategy_chat', 'business_pt_context_loading']
  const canStartProductDef = PRE_PRODUCT_STATUSES.includes(currentStatus)
  const startProductDef = async () => {
    if (advancing) return
    setAdvancing(true)
    try {
      for (let i = 0; i < 4; i++) {
        const res = await api.cmoAdvanceStatus(projectId)
        const next = (res as { status?: string })?.status
        if (next === 'product_defined' || !PRE_PRODUCT_STATUSES.includes(next ?? '')) break
      }
      onRefresh()
    } catch {
      // 오류 시 멈춤 — 사장님이 다시 시도할 수 있다.
    } finally {
      setAdvancing(false)
    }
  }

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

      {canStartProductDef && (
        <div style={{ marginBottom: 16 }}>
          <button
            className="j-btn j-btn-primary"
            onClick={startProductDef}
            disabled={advancing}
            style={{ width: '100%' }}
          >
            {advancing ? '상품 정의 준비 중…' : '전략 대화 완료 → 상품 정의 시작'}
          </button>
          <p style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 6 }}>
            CMO와 충분히 논의했다면 눌러서 상품 정의 초안을 생성합니다.
          </p>
        </div>
      )}

      {currentStatus === 'product_defined' && (
        <div style={{ marginBottom: 16 }}>
          <ProductDefinitionBoard projectId={projectId} cards={cards} currentStatus={currentStatus} onRefresh={onRefresh} />
        </div>
      )}

      {strategyCards.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-4)', marginBottom: 16 }}>
          CMO와 대화를 시작하면 카드가 생성됩니다.
        </p>
      )}

      {strategyCards
        // 키 콘텐츠 v3 카드는 raw JSON으로 노출하지 않는다 — 전용 보드(KeyContentPlanBoard)가 렌더.
        .filter(card => !['product_definition', 'key_content_draft', 'key_content_candidates', 'key_content_choice', 'key_content', 'key_content_report', 'pulling_candidates', 'pulling_plan', 'thumbnail_plan', 'thumbnail_choice', 'title_development'].includes(card.stage))
        .map(card => {
          if (card.stage === 'intro_30s') {
            return <Intro30sCard key={card.id} card={card} />
          }
          return <CardShell key={card.id} card={card} />
        })}

      {/* 키 콘텐츠 기획 보고서 — 상품정의 승인 후 실검색(시장성→후보3→판매논리→추천). */}
      <div style={{ marginTop: 16 }}>
        <StageGate title="키 콘텐츠 기획 보고서 (실검색 · 승인 2단계)" state={blockState({ from: 'key_content_ideation', to: 'key_content_approval' }, currentStatus)}>
          <KeyContentReportBoard projectId={projectId} cards={cards} currentStatus={currentStatus} onRefresh={onRefresh} />
        </StageGate>
      </div>

      {/* 풀링 주제 기획 보드 — pulling_content_set_selection ~ pulling_content_set_approval */}
      <div style={{ marginTop: 16 }}>
        <StageGate title="풀링 주제 기획 (v3 · 세트 승인)" state={blockState({ from: 'pulling_content_set_selection', to: 'pulling_content_set_approval' }, currentStatus)}>
          <PullingPlanBoard projectId={projectId} cards={cards} onRefresh={onRefresh} />
        </StageGate>
      </div>

      {/* R4 썸네일 상세 기획 보드 — thumbnail_pattern_extraction ~ hook_draft_approval */}
      <div style={{ marginTop: 16 }}>
        <StageGate title="썸네일 상세 기획 (v3 · 후보 택1)" state={blockState({ from: 'thumbnail_pattern_extraction', to: 'hook_draft_approval' }, currentStatus)}>
          <ThumbnailPlanBoard projectId={projectId} cards={cards} onRefresh={onRefresh} />
        </StageGate>
      </div>

      {/* 제목 디벨롭 8단계 보드 — thumbnail_pattern_extraction ~ hook_draft_approval (승인3에서 함께 확인) */}
      <div style={{ marginTop: 16 }}>
        <StageGate title="제목 디벨롭 (8단계 · Viewtrap 레퍼런스 2개)" state={blockState({ from: 'thumbnail_pattern_extraction', to: 'hook_draft_approval' }, currentStatus)}>
          <TitleDevelopmentBoard projectId={projectId} cards={cards} onRefresh={onRefresh} />
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
