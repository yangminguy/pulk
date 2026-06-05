'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import AuthGate from '@/components/AuthGate'
import AgentBadge from '@/components/AgentBadge'
import Icon from '@/components/Icon'
import { api } from '@/lib/api'

// ── Status label map (25-step workflow) ─────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  strategy_chat:                   '전략 대화',
  business_pt_context_loading:     'PT 컨텍스트 로딩',
  product_defined:                 '상품 정의 완료',
  key_content_ideation:            '키 콘텐츠 기획',
  viewtrap_key_research:           'Viewtrap 키 리서치',
  key_content_approval:            '키 콘텐츠 승인 대기',
  viewtrap_pulling_research:       'Viewtrap 풀링 리서치',
  pulling_content_set_selection:   '풀링 콘텐츠 선별',
  pulling_content_set_approval:    '풀링 콘텐츠 승인 대기',
  reference_analysis:              '레퍼런스 분석',
  thumbnail_pattern_extraction:    '썸네일 패턴 추출',
  intro_30s_analysis:              '도입부 30초 분석',
  second_brain_insight_merge:      'Second Brain 인사이트 결합',
  hook_draft_approval:             'Hook 초안 승인 대기',
  script_planning:                 '원고 기획',
  script_draft:                    '원고 초안 작성',
  script_approval:                 '원고 승인 대기',
  voice_recording:                 '음성 녹음',
  slide_deck:                      '슬라이드 덱 생성',
  rendering:                       '렌더링',
  qa:                              'QA 검수',
  video_qa_approval:               '영상 QA 승인 대기',
  upload_draft:                    '업로드 초안',
  upload_approval:                 '업로드 승인 대기',
  completed:                       '완료',
  paused:                          '일시 중지',
}

const PAGE_LABEL: Record<string, string> = {
  strategy:       'Strategy',
  production:     'Production',
  review_publish: 'Review & Publish',
}

// ── Types (local, matching backend shape) ───────────────────────────────────
type CmoProject = {
  id: string
  title: string
  product: string
  target_audience: string
  business_goal: string
  status: string
  current_page: 'strategy' | 'production' | 'review_publish'
  business_id?: string | null
}

type CmoCard = {
  id: string
  video_project_id: string
  stage: string
  summary: string | null
  data: unknown
}

type CmoGate = {
  id: string
  gate_type: string
  page: string
  title: string
  context: string | null
  options: string[]
  recommended_option: string | null
  status: 'pending' | 'approved' | 'needs_revision' | 'rejected'
}

type CmoMessage = {
  role: 'founder' | 'cmo'
  text: string
  proposal: unknown
  gate: unknown
  ready_to_advance: boolean
}

type RoadmapNode = {
  key: string
  label: string
  status: string
  state: 'done' | 'active' | 'pending'
}

type ProjectDetail = {
  project: CmoProject
  cards: CmoCard[]
  gates: CmoGate[]
  messages: CmoMessage[]
  roadmap: RoadmapNode[]
}

// ── MiniRoadmap ─────────────────────────────────────────────────────────────
function MiniRoadmap({ nodes }: { nodes: RoadmapNode[] }) {
  return (
    <div style={{
      overflowX: 'auto',
      paddingBottom: 4,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        minWidth: 'max-content',
        padding: '8px 0',
      }}>
        {nodes.map((node, i) => (
          <div key={node.key} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <div style={{
                width: 16,
                height: 1,
                background: node.state === 'pending' ? 'var(--silver-2)' : 'var(--silver-3)',
                flexShrink: 0,
              }} />
            )}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}>
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: node.state === 'done'
                  ? 'var(--green)'
                  : node.state === 'active'
                    ? 'transparent'
                    : 'var(--silver-1)',
                border: node.state === 'active'
                  ? '2px solid var(--ink-1)'
                  : node.state === 'done'
                    ? 'none'
                    : '2px solid var(--silver-2)',
                position: 'relative',
              }}>
                {node.state === 'done' && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {node.state === 'active' && (
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--ink-1)',
                  }} />
                )}
              </div>
              <span style={{
                fontSize: 9.5,
                fontFamily: 'var(--font-sans)',
                color: node.state === 'done'
                  ? 'var(--ink-3)'
                  : node.state === 'active'
                    ? 'var(--ink-1)'
                    : 'var(--ink-4)',
                fontWeight: node.state === 'active' ? 600 : 400,
                whiteSpace: 'nowrap',
                maxWidth: 56,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textAlign: 'center',
              }}>
                {node.label}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── VideoRoomHeader ──────────────────────────────────────────────────────────
function VideoRoomHeader({
  project,
  gates,
  activePage,
  onChangePage,
}: {
  project: CmoProject
  gates: CmoGate[]
  activePage: string
  onChangePage: (p: string) => void
}) {
  const pendingCount = gates.filter(g => g.status === 'pending').length
  const statusLabel = STATUS_LABEL[project.status] ?? project.status

  return (
    <div style={{
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--silver-2)',
      padding: '12px 20px 0',
    }}>
      {/* Top row */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        marginBottom: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span className="j-overline">CMO · Video Room</span>
            <AgentBadge agent="CMO" variant="chip" />
            {project.product && (
              <span style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                background: 'var(--silver-1)',
                border: '1px solid var(--silver-2)',
                borderRadius: 4,
                padding: '1px 7px',
                fontFamily: 'var(--font-mono)',
              }}>
                {project.product}
              </span>
            )}
          </div>
          <h2 style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 500,
            fontSize: 20,
            color: 'var(--ink-1)',
            margin: 0,
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {project.title}
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {/* Status badge */}
          <span style={{
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 11.5,
            fontWeight: 600,
            background: 'var(--p-butter)',
            color: 'var(--pi-butter)',
            fontFamily: 'var(--font-sans)',
            whiteSpace: 'nowrap',
          }}>
            {statusLabel}
          </span>

          {/* Pending gate badge */}
          {pendingCount > 0 && (
            <span style={{
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 600,
              background: 'var(--p-rose)',
              color: 'var(--pi-rose)',
              fontFamily: 'var(--font-sans)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              whiteSpace: 'nowrap',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--pi-rose)' }} />
              승인 필요 {pendingCount}건
            </span>
          )}

          {/* Page label */}
          <span style={{
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 500,
            background: 'var(--silver-1)',
            color: 'var(--ink-3)',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
          }}>
            {PAGE_LABEL[project.current_page] ?? project.current_page}
          </span>
        </div>
      </div>

      {/* Internal Tab Nav */}
      <div style={{ display: 'flex', gap: 0 }}>
        {(['strategy', 'production', 'review_publish'] as const).map(p => (
          <button
            key={p}
            onClick={() => onChangePage(p)}
            style={{
              padding: '8px 16px',
              fontSize: 13.5,
              fontFamily: 'var(--font-sans)',
              fontWeight: activePage === p ? 600 : 400,
              color: activePage === p ? 'var(--ink-1)' : 'var(--ink-3)',
              background: 'transparent',
              border: 'none',
              borderBottom: activePage === p ? '2px solid var(--green)' : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 120ms, border-color 120ms',
            }}
          >
            {PAGE_LABEL[p]}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── CardShell — generic fallback card ───────────────────────────────────────
function CardShell({ card }: { card: CmoCard }) {
  const stageLabel = STATUS_LABEL[card.stage] ?? card.stage
  const dataStr = card.data
    ? typeof card.data === 'string'
      ? card.data
      : JSON.stringify(card.data, null, 2)
    : null

  return (
    <div style={{
      border: '1px solid var(--silver-2)',
      borderRadius: 8,
      background: 'var(--paper-surface)',
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--silver-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>
          {stageLabel}
        </span>
      </div>
      <div style={{ padding: '12px 14px' }}>
        {card.summary && (
          <p style={{ fontSize: 13, color: 'var(--ink-1)', margin: '0 0 8px', lineHeight: 1.55 }}>
            {card.summary}
          </p>
        )}
        {dataStr && (
          <pre style={{
            fontSize: 11.5,
            color: 'var(--ink-3)',
            background: 'var(--bg-inset)',
            border: '1px solid var(--silver-1)',
            borderRadius: 4,
            padding: '8px 10px',
            overflowX: 'auto',
            margin: 0,
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {dataStr}
          </pre>
        )}
        {!card.summary && !dataStr && (
          <p style={{ fontSize: 12.5, color: 'var(--ink-4)', margin: 0 }}>아직 내용이 없습니다.</p>
        )}
      </div>
    </div>
  )
}

// ── DecisionPanel ────────────────────────────────────────────────────────────
function DecisionPanel({
  gates,
  readyToAdvance,
  onDecide,
  onAdvance,
  deciding,
  advancing,
}: {
  gates: CmoGate[]
  readyToAdvance: boolean
  onDecide: (gateId: string, decision: 'approved' | 'needs_revision' | 'rejected', note?: string) => void
  onAdvance: () => void
  deciding: string | null
  advancing: boolean
}) {
  const pending = gates.filter(g => g.status === 'pending')

  if (pending.length === 0 && !readyToAdvance) {
    return (
      <div style={{ padding: 16, color: 'var(--ink-4)', fontSize: 13, textAlign: 'center' }}>
        대기 중인 승인 항목이 없습니다.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="j-overline" style={{ marginBottom: 4 }}>Decision Panel</div>

      {pending.map(gate => (
        <div key={gate.id} style={{
          border: '1px solid var(--p-rose)',
          borderLeft: '4px solid var(--pi-rose)',
          borderRadius: 8,
          background: 'var(--paper-surface)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--silver-1)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-1)', marginBottom: 4 }}>
              {gate.title}
            </div>
            {gate.context && (
              <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
                {gate.context}
              </p>
            )}
          </div>

          {gate.recommended_option && (
            <div style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--silver-1)',
              background: 'var(--p-rose)',
            }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--pi-rose)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                CMO 추천
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--pi-rose)', fontWeight: 500 }}>
                {gate.recommended_option}
              </div>
            </div>
          )}

          <div style={{ padding: '10px 14px', display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button
              onClick={() => onDecide(gate.id, 'approved')}
              disabled={deciding === gate.id}
              className="j-btn j-btn-sm"
              style={{
                background: 'var(--p-rose)',
                color: 'var(--pi-rose)',
                border: '1px solid var(--pi-rose)',
                fontWeight: 600,
              }}
            >
              승인
            </button>
            <button
              onClick={() => onDecide(gate.id, 'needs_revision')}
              disabled={deciding === gate.id}
              className="j-btn j-btn-secondary j-btn-sm"
            >
              수정 요청
            </button>
            <button
              onClick={() => onDecide(gate.id, 'rejected')}
              disabled={deciding === gate.id}
              className="j-btn j-btn-danger j-btn-sm"
            >
              보류
            </button>
          </div>
        </div>
      ))}

      {readyToAdvance && pending.length === 0 && (
        <button
          onClick={onAdvance}
          disabled={advancing}
          className="j-btn j-btn-primary"
          style={{ width: '100%' }}
        >
          {advancing ? '진행 중...' : '다음 단계로 →'}
        </button>
      )}
    </div>
  )
}

// ── CMO Chat Panel ───────────────────────────────────────────────────────────
type LocalMsg = {
  role: 'founder' | 'cmo'
  text: string
  ready_to_advance?: boolean
}

function CmoChatPanel({
  projectId,
  initialMessages,
  onRefresh,
}: {
  projectId: string
  initialMessages: CmoMessage[]
  onRefresh: () => void
}) {
  const [messages, setMessages] = useState<LocalMsg[]>(
    initialMessages.map(m => ({ role: m.role, text: m.text, ready_to_advance: m.ready_to_advance }))
  )
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setErr(null)
    setSending(true)
    setMessages(m => [...m, { role: 'founder', text }])
    try {
      const res = await api.cmoChatMessage(projectId, text)
      setMessages(m => [...m, { role: 'cmo', text: res.reply, ready_to_advance: res.ready_to_advance }])
      onRefresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '전송 실패')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="j-overline" style={{ marginBottom: 8 }}>CMO Chat</div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 48, color: 'var(--ink-4)' }}>
            <div style={{ fontSize: 13 }}>CMO와 영상 전략을 논의하세요</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'founder' ? 'flex-end' : 'flex-start' }}>
            {msg.role === 'founder' ? (
              <div style={{
                maxWidth: '80%',
                background: 'var(--paper-elevated)',
                border: '1px solid var(--silver-2)',
                borderRadius: '12px 12px 3px 12px',
                padding: '10px 13px',
                fontSize: 13.5,
                color: 'var(--ink-1)',
                lineHeight: 1.55,
              }}>
                {msg.text}
              </div>
            ) : (
              <div style={{
                maxWidth: '92%',
                background: 'var(--paper-surface)',
                border: '1px solid var(--silver-2)',
                borderLeft: '3px solid var(--wood-3)',
                borderRadius: '3px 12px 12px 3px',
                padding: '10px 13px',
                fontSize: 13.5,
                color: 'var(--ink-1)',
                lineHeight: 1.55,
              }}>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 3,
                      background: 'var(--wood-3)', color: '#fff',
                      fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>CM</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>CMO Agent</span>
                  </span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div style={{
            background: 'var(--paper-surface)',
            border: '1px solid var(--silver-2)',
            borderLeft: '3px solid var(--wood-3)',
            borderRadius: '3px 12px 12px 3px',
            padding: '10px 13px',
            fontSize: 13,
            color: 'var(--ink-3)',
            maxWidth: '60%',
          }}>
            CMO 분석 중...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {err && (
        <div style={{
          fontSize: 12, color: 'var(--red)', marginBottom: 8,
          padding: '5px 9px', background: 'var(--red-tint)', borderRadius: 4,
        }}>
          {err}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="j-input"
          style={{ flex: 1, borderRadius: 999, padding: '9px 16px', fontSize: 13 }}
          placeholder="CMO에게 메시지..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          disabled={sending}
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="j-btn j-btn-primary j-btn-sm"
          style={{ borderRadius: 999, padding: '0 16px' }}
        >
          <Icon name="send" size={13} stroke={1.8} />
        </button>
      </div>
    </div>
  )
}

// ── Strategy Board ───────────────────────────────────────────────────────────
function StrategyBoard({
  cards,
  projectId,
  onRefresh,
}: {
  cards: CmoCard[]
  projectId: string
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

      {strategyCards.map(card => (
        <CardShell key={card.id} card={card} />
      ))}

      {/* Viewtrap 수동 입력 폼 */}
      <div style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 8,
        background: 'var(--paper-surface)',
        overflow: 'hidden',
        marginTop: 16,
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
    </div>
  )
}

// ── Production Board ─────────────────────────────────────────────────────────
function ProductionBoard({
  cards,
  projectId,
  onRefresh,
}: {
  cards: CmoCard[]
  projectId: string
  onRefresh: () => void
}) {
  const [buildingDeck, setBuildingDeck] = useState(false)
  const [submittingRender, setSubmittingRender] = useState(false)
  const [deckId, setDeckId] = useState<string | null>(null)
  const [pipelineErr, setPipelineErr] = useState<string | null>(null)

  // Voice upload state
  const [voiceUrl, setVoiceUrl] = useState('')
  const [voiceDuration, setVoiceDuration] = useState('')
  const [attachingVoice, setAttachingVoice] = useState(false)
  const [voiceErr, setVoiceErr] = useState<string | null>(null)
  const [voiceOk, setVoiceOk] = useState(false)

  // P0-2 fix: use backend stage keys
  const productionStages = ['script_planning', 'script_draft', 'reading_script', 'voice_recording', 'slide_deck', 'rendering']
  const productionCards = cards.filter(c => productionStages.includes(c.stage))

  return (
    <div>
      <div className="j-overline" style={{ marginBottom: 8 }}>Production Board</div>

      {productionCards.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-4)' }}>
          Strategy 단계가 완료되면 프로덕션 카드가 표시됩니다.
        </p>
      )}

      {productionCards.map(card => {
        if (card.stage === 'reading_script') {
          const data = card.data as { blocks?: Array<{ type: string; text: string }> } | null
          const blocks = data?.blocks ?? []
          if (blocks.length > 0) {
            return (
              <div key={card.id} style={{ marginBottom: 12 }}>
                <div className="j-overline" style={{ marginBottom: 4 }}>읽기용 원고</div>
                <div style={{
                  border: '1px solid var(--silver-2)',
                  borderRadius: 8,
                  background: 'var(--paper-surface)',
                  padding: '12px 16px',
                  fontSize: 14,
                  lineHeight: 1.9,
                  fontFamily: 'var(--font-mono)',
                  maxHeight: 320,
                  overflowY: 'auto',
                }}>
                  {blocks.map((b, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>{b.text}</div>
                  ))}
                </div>
              </div>
            )
          }
        }
        return <CardShell key={card.id} card={card} />
      })}

      {/* P1: Voice attach UI */}
      <div style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 8,
        background: 'var(--paper-surface)',
        overflow: 'hidden',
        marginTop: 16,
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>음성 파일 첨부</span>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="j-input"
            placeholder="파일 URL (예: https://...)"
            value={voiceUrl}
            onChange={e => setVoiceUrl(e.target.value)}
          />
          <input
            className="j-input"
            placeholder="길이(초, 선택)"
            type="number"
            value={voiceDuration}
            onChange={e => setVoiceDuration(e.target.value)}
          />
          {voiceErr && (
            <div style={{ fontSize: 12, color: 'var(--red)', padding: '4px 8px', background: 'var(--red-tint)', borderRadius: 4 }}>
              {voiceErr}
            </div>
          )}
          {voiceOk && (
            <div style={{ fontSize: 12, color: 'var(--green)', padding: '4px 8px', background: 'var(--p-green)', borderRadius: 4 }}>
              음성 첨부 완료
            </div>
          )}
          <button
            className="j-btn j-btn-secondary j-btn-sm"
            style={{ alignSelf: 'flex-end' }}
            disabled={attachingVoice || !voiceUrl.trim()}
            onClick={async () => {
              setAttachingVoice(true)
              setVoiceErr(null)
              setVoiceOk(false)
              try {
                await api.cmoAttachVoice(projectId, voiceUrl.trim(), {
                  duration_sec: voiceDuration ? Number(voiceDuration) : undefined,
                })
                setVoiceUrl('')
                setVoiceDuration('')
                setVoiceOk(true)
                onRefresh()
              } catch (e: unknown) {
                setVoiceErr(e instanceof Error ? e.message : '첨부 실패')
              } finally {
                setAttachingVoice(false)
              }
            }}
          >
            {attachingVoice ? '첨부 중...' : '음성 첨부'}
          </button>
        </div>
      </div>

      {/* P0-1: Slide deck + Render pipeline buttons */}
      <div style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 8,
        background: 'var(--paper-surface)',
        overflow: 'hidden',
        marginTop: 12,
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>프로덕션 파이프라인</span>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pipelineErr && (
            <div style={{ fontSize: 12, color: 'var(--red)', padding: '4px 8px', background: 'var(--red-tint)', borderRadius: 4 }}>
              {pipelineErr}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="j-btn j-btn-secondary j-btn-sm"
              disabled={buildingDeck}
              onClick={async () => {
                setBuildingDeck(true)
                setPipelineErr(null)
                try {
                  const res = await api.cmoBuildSlideDeck(projectId) as { slide_deck_spec_id: string }
                  setDeckId(res.slide_deck_spec_id)
                  onRefresh()
                } catch (e: unknown) {
                  setPipelineErr(e instanceof Error ? e.message : '슬라이드덱 생성 실패')
                } finally {
                  setBuildingDeck(false)
                }
              }}
            >
              {buildingDeck ? '생성 중...' : '슬라이드덱 생성'}
            </button>
            <button
              className="j-btn j-btn-secondary j-btn-sm"
              disabled={submittingRender || !deckId}
              title={!deckId ? '먼저 슬라이드덱을 생성하세요' : undefined}
              onClick={async () => {
                if (!deckId) return
                setSubmittingRender(true)
                setPipelineErr(null)
                try {
                  await api.cmoSubmitRender(projectId, deckId)
                  onRefresh()
                } catch (e: unknown) {
                  setPipelineErr(e instanceof Error ? e.message : '렌더 제출 실패')
                } finally {
                  setSubmittingRender(false)
                }
              }}
            >
              {submittingRender ? '제출 중...' : '렌더 제출'}
            </button>
          </div>
          {deckId && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              deck: {deckId}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Production Action Panel ───────────────────────────────────────────────────
function ProductionActionPanel({
  gates,
  readyToAdvance,
  onDecide,
  onAdvance,
  deciding,
  advancing,
}: {
  gates: CmoGate[]
  readyToAdvance: boolean
  onDecide: (gateId: string, decision: 'approved' | 'needs_revision' | 'rejected') => void
  onAdvance: () => void
  deciding: string | null
  advancing: boolean
}) {
  const productionGates = gates.filter(g => g.page === 'production' || g.gate_type === 'script_approval')
  const hasPendingGates = productionGates.some(g => g.status === 'pending')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="j-overline" style={{ marginBottom: 4 }}>Action Panel</div>

      <DecisionPanel
        gates={productionGates}
        readyToAdvance={readyToAdvance && !hasPendingGates}
        onDecide={onDecide}
        onAdvance={onAdvance}
        deciding={deciding}
        advancing={advancing}
      />
    </div>
  )
}

// ── Review & Publish Board ───────────────────────────────────────────────────
function ReviewPublishBoard({
  cards,
  projectId,
  onRefresh,
}: {
  cards: CmoCard[]
  projectId: string
  onRefresh: () => void
}) {
  const [runningQA, setRunningQA] = useState(false)
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [publishErr, setPublishErr] = useState<string | null>(null)
  const [publishOk, setPublishOk] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDesc, setDraftDesc] = useState('')
  const [draftTags, setDraftTags] = useState('')

  // P0-2 fix: use backend stage key 'qa' (not 'video_qa')
  const reviewCards = cards.filter(c => ['qa', 'upload_draft'].includes(c.stage))

  return (
    <div>
      <div className="j-overline" style={{ marginBottom: 8 }}>Publish Board</div>

      {reviewCards.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--ink-4)' }}>
          프로덕션이 완료되면 검수 항목이 표시됩니다.
        </p>
      )}

      {reviewCards.map(card => {
        if (card.stage === 'qa') {
          return <CardShell key={card.id} card={card} />
        }
        if (card.stage === 'upload_draft') {
          const data = card.data as Record<string, unknown> | null
          return (
            <div key={card.id} style={{
              border: '1px solid var(--silver-2)',
              borderRadius: 8,
              background: 'var(--paper-surface)',
              overflow: 'hidden',
              marginBottom: 12,
            }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>업로드 초안</span>
                <span style={{
                  fontSize: 11,
                  padding: '1px 8px',
                  borderRadius: 999,
                  background: 'var(--silver-1)',
                  color: 'var(--ink-3)',
                  fontWeight: 600,
                }}>
                  {(data?.visibility as string) ?? 'private'} (비공개 기본)
                </span>
              </div>
              <div style={{ padding: '12px 14px' }}>
                {card.summary && <p style={{ fontSize: 13, color: 'var(--ink-1)', margin: '0 0 8px', lineHeight: 1.55 }}>{card.summary}</p>}
                {data && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' }}>
                    {(data.title as string | undefined) && (
                      <div><span style={{ fontWeight: 600 }}>제목: </span>{data.title as string}</div>
                    )}
                    {(data.description as string | undefined) && (
                      <div><span style={{ fontWeight: 600 }}>설명: </span>{data.description as string}</div>
                    )}
                  </div>
                )}
                <div style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  background: 'var(--amber-tint)',
                  border: '1px solid var(--amber)',
                  borderRadius: 4,
                  fontSize: 12,
                  color: '#8A5408',
                }}>
                  공개 설정 변경은 최종 승인 후에만 가능합니다. 현재 상태: 비공개 보호
                </div>
              </div>
            </div>
          )
        }
        return <CardShell key={card.id} card={card} />
      })}

      {/* P0-1: QA + Upload Draft pipeline buttons */}
      <div style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 8,
        background: 'var(--paper-surface)',
        overflow: 'hidden',
        marginTop: 16,
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>게시 파이프라인</span>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {publishErr && (
            <div style={{ fontSize: 12, color: 'var(--red)', padding: '4px 8px', background: 'var(--red-tint)', borderRadius: 4 }}>
              {publishErr}
            </div>
          )}
          {publishOk && (
            <div style={{ fontSize: 12, color: 'var(--green)', padding: '4px 8px', background: 'var(--p-green)', borderRadius: 4 }}>
              {publishOk}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="j-btn j-btn-secondary j-btn-sm"
              disabled={runningQA}
              onClick={async () => {
                setRunningQA(true)
                setPublishErr(null)
                setPublishOk(null)
                try {
                  const renderCard = cards.find(c => c.stage === 'rendering')
                  const renderJobId = renderCard
                    ? ((renderCard.data as Record<string, unknown> | null)?.render_job_id as string | undefined) ?? renderCard.id
                    : ''
                  await api.cmoRunQA(projectId, renderJobId)
                  setPublishOk('QA 실행 완료')
                  onRefresh()
                } catch (e: unknown) {
                  setPublishErr(e instanceof Error ? e.message : 'QA 실행 실패')
                } finally {
                  setRunningQA(false)
                }
              }}
            >
              {runningQA ? '실행 중...' : 'QA 실행'}
            </button>
          </div>

          {/* Upload draft inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', display: 'block', marginBottom: 3 }}>
                제목 <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <input
                className="j-input"
                placeholder="업로드 제목을 입력하세요"
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
              />
            </div>
            <input
              className="j-input"
              placeholder="설명 (선택)"
              value={draftDesc}
              onChange={e => setDraftDesc(e.target.value)}
            />
            <input
              className="j-input"
              placeholder="태그 (쉼표 구분, 선택)"
              value={draftTags}
              onChange={e => setDraftTags(e.target.value)}
            />
          </div>

          <button
            className="j-btn j-btn-secondary j-btn-sm"
            disabled={creatingDraft || !draftTitle.trim()}
            title={!draftTitle.trim() ? '제목을 입력하세요' : undefined}
            style={{ alignSelf: 'flex-start' }}
            onClick={async () => {
              setCreatingDraft(true)
              setPublishErr(null)
              setPublishOk(null)
              try {
                const renderCard = cards.find(c => c.stage === 'rendering')
                const renderJobId = renderCard
                  ? ((renderCard.data as Record<string, unknown> | null)?.render_job_id as string | undefined) ?? renderCard.id
                  : ''
                await api.cmoCreateUploadDraft({
                  project_id: projectId,
                  render_job_id: renderJobId,
                  title: draftTitle.trim(),
                  description: draftDesc.trim() || undefined,
                  tags: draftTags.trim()
                    ? draftTags.split(',').map(t => t.trim()).filter(Boolean)
                    : undefined,
                })
                setPublishOk('업로드 초안 생성 완료 (비공개)')
                onRefresh()
              } catch (e: unknown) {
                setPublishErr(e instanceof Error ? e.message : '업로드 초안 생성 실패')
              } finally {
                setCreatingDraft(false)
              }
            }}
          >
            {creatingDraft ? '생성 중...' : '업로드 초안 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Review Approval Panel ────────────────────────────────────────────────────
function ReviewApprovalPanel({
  gates,
  readyToAdvance,
  onDecide,
  onAdvance,
  deciding,
  advancing,
}: {
  gates: CmoGate[]
  readyToAdvance: boolean
  onDecide: (gateId: string, decision: 'approved' | 'needs_revision' | 'rejected') => void
  onAdvance: () => void
  deciding: string | null
  advancing: boolean
}) {
  const reviewGates = gates.filter(g =>
    g.page === 'review_publish' ||
    g.gate_type === 'video_qa_approval' ||
    g.gate_type === 'upload_approval'
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="j-overline" style={{ marginBottom: 4 }}>Approval Panel</div>
      <DecisionPanel
        gates={reviewGates}
        readyToAdvance={readyToAdvance}
        onDecide={onDecide}
        onAdvance={onAdvance}
        deciding={deciding}
        advancing={advancing}
      />
    </div>
  )
}

// ── Project List & Create ─────────────────────────────────────────────────────
type ProjectListItem = {
  id: string
  title: string
  product?: string
  status?: string
  current_page?: string
}

function ProjectSelector({ onSelect }: { onSelect: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [product, setProduct] = useState('')
  const [target, setTarget] = useState('')
  const [goal, setGoal] = useState('brand_growth')
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.cmoListProjects() as { projects: ProjectListItem[] }
      setProjects(res.projects ?? [])
    } catch {
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!title.trim()) return
    setCreating(true)
    setErr(null)
    try {
      const res = await api.cmoCreateProject({
        title: title.trim(),
        product: product.trim(),
        target_audience: target.trim(),
        business_goal: goal,
      })
      onSelect(res.project_id)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{
      maxWidth: 640,
      margin: '0 auto',
      padding: '40px 20px',
    }}>
      <div style={{ marginBottom: 24 }}>
        <div className="j-overline" style={{ marginBottom: 6 }}>CMO · Video Room</div>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 500,
          fontSize: 28,
          color: 'var(--ink-1)',
          margin: 0,
        }}>
          영상 프로젝트 선택
        </h1>
      </div>

      {/* Existing projects */}
      {loading ? (
        <div style={{ color: 'var(--ink-4)', fontSize: 13, textAlign: 'center', padding: 24 }}>로딩 중...</div>
      ) : projects.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <div className="j-overline" style={{ marginBottom: 8 }}>기존 프로젝트</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="j-card j-card-hover"
                style={{ textAlign: 'left', border: 'none', cursor: 'pointer', padding: '12px 16px', width: '100%' }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-1)', marginBottom: 4 }}>{p.title}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {p.product && (
                    <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{p.product}</span>
                  )}
                  {p.status && (
                    <span style={{
                      fontSize: 11,
                      padding: '1px 7px',
                      borderRadius: 999,
                      background: 'var(--p-butter)',
                      color: 'var(--pi-butter)',
                      fontWeight: 500,
                    }}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : !showForm ? (
        <div style={{ color: 'var(--ink-4)', fontSize: 13, textAlign: 'center', padding: 16, marginBottom: 16 }}>
          아직 영상 프로젝트가 없습니다.
        </div>
      ) : null}

      {/* Create form toggle */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="j-btn j-btn-primary"
          style={{ width: '100%' }}
        >
          + 새 영상 프로젝트
        </button>
      ) : (
        <div style={{
          border: '1px solid var(--silver-2)',
          borderRadius: 10,
          background: 'var(--paper-surface)',
          padding: 20,
        }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink-1)', marginBottom: 16 }}>새 영상 프로젝트</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>프로젝트 제목 *</label>
              <input
                className="j-input"
                placeholder="예: AI 마케팅팀 상품 판매용 콘텐츠 세트"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>상품</label>
              <input
                className="j-input"
                placeholder="예: AI 마케팅 자동화 팀"
                value={product}
                onChange={e => setProduct(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>타깃 고객</label>
              <input
                className="j-input"
                placeholder="예: 마케팅팀을 둘 여력이 없는 작은 브랜드 대표"
                value={target}
                onChange={e => setTarget(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>비즈니스 목표</label>
              <select
                className="j-input"
                value={goal}
                onChange={e => setGoal(e.target.value)}
              >
                <option value="brand_growth">브랜드 성장</option>
                <option value="consulting_lead">상담 신청</option>
                <option value="product_sale">상품 판매</option>
                <option value="waitlist">대기자 모집</option>
              </select>
            </div>
          </div>
          {err && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)', padding: '5px 9px', background: 'var(--red-tint)', borderRadius: 4 }}>
              {err}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              onClick={create}
              disabled={creating || !title.trim()}
              className="j-btn j-btn-primary"
              style={{ flex: 1 }}
            >
              {creating ? '생성 중...' : '프로젝트 생성'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="j-btn j-btn-secondary"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main VideoRoom Content ────────────────────────────────────────────────────
function VideoRoomContent() {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [activePage, setActivePage] = useState<'strategy' | 'production' | 'review_publish'>('strategy')
  const [deciding, setDeciding] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [readyToAdvance, setReadyToAdvance] = useState(false)

  const loadDetail = useCallback(async (id: string, initPage?: boolean) => {
    setLoadingDetail(true)
    try {
      const res = await api.cmoGetProject(id) as ProjectDetail
      setDetail(res)
      if (initPage) {
        setActivePage(res.project?.current_page ?? 'strategy')
      }
      // check if last message has ready_to_advance
      const msgs = res.messages ?? []
      const lastCmo = [...msgs].reverse().find(m => m.role === 'cmo')
      setReadyToAdvance(lastCmo?.ready_to_advance ?? false)
    } catch {
      setDetail(null)
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    if (projectId) {
      loadDetail(projectId, true)
    }
  }, [projectId, loadDetail])

  const handleDecide = async (gateId: string, decision: 'approved' | 'needs_revision' | 'rejected') => {
    if (!projectId) return
    setDeciding(gateId)
    try {
      await api.cmoDecideGate(gateId, decision)
      await loadDetail(projectId)
    } catch {
      // ignore
    } finally {
      setDeciding(null)
    }
  }

  const handleAdvance = async () => {
    if (!projectId) return
    setAdvancing(true)
    try {
      await api.cmoAdvanceStatus(projectId)
      await loadDetail(projectId)
    } catch {
      // ignore
    } finally {
      setAdvancing(false)
    }
  }

  if (!projectId) {
    return <ProjectSelector onSelect={id => setProjectId(id)} />
  }

  if (loadingDetail && !detail) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--ink-4)', fontSize: 14 }}>
        로딩 중...
      </div>
    )
  }

  if (!detail) {
    return (
      <div style={{ padding: 24, color: 'var(--red)', fontSize: 14 }}>
        프로젝트를 불러오지 못했습니다.
        <button onClick={() => loadDetail(projectId)} className="j-btn j-btn-secondary j-btn-sm" style={{ marginLeft: 12 }}>
          재시도
        </button>
      </div>
    )
  }

  const { project, cards, gates, messages, roadmap } = detail
  const pendingGates = gates.filter(g => g.status === 'pending')
  const strategyGates = gates.filter(g => g.page === 'strategy' || (!g.page && !['script_approval', 'video_qa_approval', 'upload_approval'].includes(g.gate_type)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: 'var(--bg)' }}>
      {/* Header */}
      <VideoRoomHeader
        project={project}
        gates={gates}
        activePage={activePage}
        onChangePage={p => setActivePage(p as 'strategy' | 'production' | 'review_publish')}
      />

      {/* Mini Roadmap */}
      {roadmap && roadmap.length > 0 && (
        <div style={{
          padding: '4px 20px',
          borderBottom: '1px solid var(--silver-1)',
          background: 'var(--bg-surface)',
        }}>
          <MiniRoadmap nodes={roadmap} />
        </div>
      )}

      {/* Page Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activePage === 'strategy' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '260px 1fr 280px',
            height: '100%',
            gap: 0,
          }}>
            {/* Left: CMO Chat */}
            <div style={{ overflowY: 'auto', borderRight: '1px solid var(--silver-2)', padding: 16 }}>
              <CmoChatPanel
                projectId={projectId}
                initialMessages={messages}
                onRefresh={() => loadDetail(projectId)}
              />
            </div>
            {/* Center: Strategy Board */}
            <div style={{ overflowY: 'auto', borderRight: '1px solid var(--silver-2)', padding: 16 }}>
              <StrategyBoard
                cards={cards}
                projectId={projectId}
                onRefresh={() => loadDetail(projectId)}
              />
            </div>
            {/* Right: Decision Panel */}
            <div style={{ overflowY: 'auto', padding: 16 }}>
              <DecisionPanel
                gates={strategyGates}
                readyToAdvance={readyToAdvance && pendingGates.length === 0}
                onDecide={handleDecide}
                onAdvance={handleAdvance}
                deciding={deciding}
                advancing={advancing}
              />
            </div>
          </div>
        )}

        {activePage === 'production' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '260px 1fr 280px',
            height: '100%',
            gap: 0,
          }}>
            {/* Left: CMO Chat */}
            <div style={{ overflowY: 'auto', borderRight: '1px solid var(--silver-2)', padding: 16 }}>
              <CmoChatPanel
                projectId={projectId}
                initialMessages={messages}
                onRefresh={() => loadDetail(projectId)}
              />
            </div>
            {/* Center: Production Board */}
            <div style={{ overflowY: 'auto', borderRight: '1px solid var(--silver-2)', padding: 16 }}>
              <ProductionBoard cards={cards} projectId={projectId} onRefresh={() => loadDetail(projectId)} />
            </div>
            {/* Right: Action Panel */}
            <div style={{ overflowY: 'auto', padding: 16 }}>
              <ProductionActionPanel
                gates={gates}
                readyToAdvance={readyToAdvance}
                onDecide={handleDecide}
                onAdvance={handleAdvance}
                deciding={deciding}
                advancing={advancing}
              />
            </div>
          </div>
        )}

        {activePage === 'review_publish' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '260px 1fr 280px',
            height: '100%',
            gap: 0,
          }}>
            {/* Left: CMO Chat */}
            <div style={{ overflowY: 'auto', borderRight: '1px solid var(--silver-2)', padding: 16 }}>
              <CmoChatPanel
                projectId={projectId}
                initialMessages={messages}
                onRefresh={() => loadDetail(projectId)}
              />
            </div>
            {/* Center: Review & Publish Board */}
            <div style={{ overflowY: 'auto', borderRight: '1px solid var(--silver-2)', padding: 16 }}>
              <ReviewPublishBoard cards={cards} projectId={projectId} onRefresh={() => loadDetail(projectId)} />
            </div>
            {/* Right: Approval Panel */}
            <div style={{ overflowY: 'auto', padding: 16 }}>
              <ReviewApprovalPanel
                gates={gates}
                readyToAdvance={readyToAdvance}
                onDecide={handleDecide}
                onAdvance={handleAdvance}
                deciding={deciding}
                advancing={advancing}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VideoRoomPage() {
  return <AuthGate><VideoRoomContent /></AuthGate>
}
