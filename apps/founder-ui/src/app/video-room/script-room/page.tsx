'use client'
import { useState, useCallback, useEffect } from 'react'
import AuthGate from '@/components/AuthGate'
import ProjectSelector from '../_components/ProjectSelector'
import ContentCardBoard from '../_components/ContentCardBoard'
import type {
  ContentCard,
  GenerateBriefResult,
  ScriptRoomTab,
} from '../_lib/script-room-types'

// Panel components are being implemented by other agents.
// Paths are wired by contract; build verification happens in the Verify step.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ResearchRoomPanel: React.ComponentType<{ projectId: string; cardId: string }> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let StrategyBriefPanel: React.ComponentType<{ projectId: string; cardId: string }> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ScriptRoomPanel: React.ComponentType<{ projectId: string; cardId: string }> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let VideoExecutionBriefPanel: React.ComponentType<{ projectId: string; cardId: string; briefId?: string; factoryResultUrl?: string }> | null = null

// Attempt to import panels — they may not exist yet (other agents building them).
// Using dynamic require inside try/catch to avoid crashing the build.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ResearchRoomPanel = require('../_components/ResearchRoomPanel').default
} catch { /* not yet built */ }
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  StrategyBriefPanel = require('../_components/StrategyBriefPanel').default
} catch { /* not yet built */ }
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ScriptRoomPanel = require('../_components/ScriptRoomPanel').default
} catch { /* not yet built */ }
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  VideoExecutionBriefPanel = require('../_components/VideoExecutionBriefPanel').default
} catch { /* not yet built */ }

// ── Placeholder shown when a panel isn't built yet ───────────────────────────

function PanelPlaceholder({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: 200,
      color: 'var(--ink-4)',
      fontSize: 13,
      border: '1px dashed var(--silver-2)',
      borderRadius: 8,
      gap: 6,
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </span>
      <span>패널 구현 중입니다.</span>
    </div>
  )
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

const TABS: { id: ScriptRoomTab; label: string }[] = [
  { id: 'research',   label: '리서치' },
  { id: 'strategy',   label: '전략 기획서' },
  { id: 'script',     label: '원고' },
  { id: 'video_brief', label: 'Video Brief' },
]

function TabBar({
  active,
  onChange,
}: {
  active: ScriptRoomTab
  onChange: (tab: ScriptRoomTab) => void
}) {
  return (
    <div style={{
      display: 'flex',
      gap: 2,
      borderBottom: '1px solid var(--silver-2)',
      marginBottom: 16,
    }}>
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: active === t.id ? 700 : 500,
            color: active === t.id ? 'var(--ink-1)' : 'var(--ink-3)',
            cursor: 'pointer',
            borderBottom: active === t.id ? '2px solid var(--ink-1)' : '2px solid transparent',
            marginBottom: -1,
            transition: 'color 0.12s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Right panel: tab content for selected card ────────────────────────────────

function CardDetailPanel({
  projectId,
  card,
  briefId,
  factoryResultUrl,
}: {
  projectId: string
  card: ContentCard
  briefId?: string
  factoryResultUrl?: string
}) {
  const [activeTab, setActiveTab] = useState<ScriptRoomTab>('research')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Card identity header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--silver-2)',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 10.5,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: card.content_type === 'key' ? 'var(--wood-3)' : 'var(--blue)',
          marginBottom: 4,
        }}>
          {card.content_type === 'key' ? 'Key Content' : card.slot.replace('pulling_', 'Pulling ')}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', lineHeight: 1.4 }}>
          {card.title || '(제목 없음)'}
        </div>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {activeTab === 'research' && (
          ResearchRoomPanel
            ? <ResearchRoomPanel projectId={projectId} cardId={card.id} />
            : <PanelPlaceholder label="Research Room" />
        )}
        {activeTab === 'strategy' && (
          StrategyBriefPanel
            ? <StrategyBriefPanel projectId={projectId} cardId={card.id} />
            : <PanelPlaceholder label="Strategy Brief" />
        )}
        {activeTab === 'script' && (
          ScriptRoomPanel
            ? <ScriptRoomPanel projectId={projectId} cardId={card.id} />
            : <PanelPlaceholder label="Script Room" />
        )}
        {activeTab === 'video_brief' && (
          VideoExecutionBriefPanel
            ? <VideoExecutionBriefPanel
                projectId={projectId}
                cardId={card.id}
                briefId={briefId}
                factoryResultUrl={factoryResultUrl}
              />
            : <PanelPlaceholder label="Video Execution Brief" />
        )}
      </div>
    </div>
  )
}

// ── Main Script Room content ──────────────────────────────────────────────────

function ScriptRoomContent() {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [cards, setCards] = useState<ContentCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  // briefId/factoryResultUrl keyed by cardId
  const [briefMeta, setBriefMeta] = useState<Record<string, { briefId?: string; factoryResultUrl?: string }>>({})
  const [loadingCards, setLoadingCards] = useState(false)

  const loadCards = useCallback(async (pid: string) => {
    setLoadingCards(true)
    try {
      // cmo:listContentCards returns { cards: ContentCard[] }
      const { api } = await import('@/lib/api')
      const res = await (api as unknown as {
        post: (action: string, body: unknown) => Promise<{ data: { ok: boolean; data: { cards: ContentCard[] } } }>
      }).post('cmo:listContentCards', { project_id: pid })

      const inner = res.data
      const fetched: ContentCard[] =
        inner && typeof inner === 'object' && 'data' in inner
          ? ((inner as { data: { cards: ContentCard[] } }).data.cards ?? [])
          : []

      setCards(fetched)
      // Pre-select first card if none selected
      setSelectedCardId(prev => prev ?? (fetched[0]?.id ?? null))
    } catch {
      setCards([])
    } finally {
      setLoadingCards(false)
    }
  }, [])

  useEffect(() => {
    if (projectId) loadCards(projectId)
  }, [projectId, loadCards])

  const handleBriefGenerated = useCallback((cardId: string, result: GenerateBriefResult) => {
    setBriefMeta(prev => ({
      ...prev,
      [cardId]: {
        briefId: result.brief_id,
        factoryResultUrl: result.factory_job_url,
      },
    }))
    // Also update the card status to 'video' optimistically
    setCards(prev =>
      prev.map(c =>
        c.id === cardId
          ? { ...c, status: 'video', brief_id: result.brief_id, factory_result_url: result.factory_job_url }
          : c
      )
    )
  }, [])

  const selectedCard = cards.find(c => c.id === selectedCardId) ?? null

  if (!projectId) {
    return <ProjectSelector onSelect={id => setProjectId(id)} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--silver-2)',
        background: 'var(--bg-surface)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexShrink: 0,
      }}>
        <div className="j-overline">CMO · Script Room</div>
        <button
          onClick={() => setProjectId(null)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--ink-3)',
            padding: 0,
          }}
        >
          ← 프로젝트 변경
        </button>
      </div>

      {/* Body: card board (left) + detail panel (right) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Content Card Board */}
        <div style={{
          width: 320,
          flexShrink: 0,
          borderRight: '1px solid var(--silver-2)',
          overflowY: 'auto',
          padding: '16px 16px',
          background: 'var(--bg-surface)',
        }}>
          {loadingCards ? (
            <div style={{ fontSize: 13, color: 'var(--ink-4)', textAlign: 'center', padding: 24 }}>
              로딩 중...
            </div>
          ) : (
            <ContentCardBoard
              projectId={projectId}
              cards={cards}
              selectedCardId={selectedCardId}
              onSelectCard={setSelectedCardId}
              onBriefGenerated={handleBriefGenerated}
            />
          )}
        </div>

        {/* Right: panel for selected card */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', background: 'var(--bg)' }}>
          {selectedCard ? (
            <CardDetailPanel
              projectId={projectId}
              card={selectedCard}
              briefId={briefMeta[selectedCard.id]?.briefId ?? selectedCard.brief_id}
              factoryResultUrl={briefMeta[selectedCard.id]?.factoryResultUrl ?? selectedCard.factory_result_url}
            />
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--ink-4)',
              fontSize: 13,
            }}>
              왼쪽에서 콘텐츠 카드를 선택하세요.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ScriptRoomPage() {
  return <AuthGate><ScriptRoomContent /></AuthGate>
}
