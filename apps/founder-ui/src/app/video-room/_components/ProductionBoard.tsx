'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { blockState } from '../_lib/phases'
import type { CmoCard, CmoGate, ScriptBeat } from '../_lib/types'
import { FactoryJobCard, CardShell } from './cards'
import ScriptBeatEditor from './ScriptBeatEditor'
import ScriptDraftPanel from './ScriptDraftPanel'
import DecisionPanel from './DecisionPanel'
import StageGate from './StageGate'
import VideoProductionUpgradePanel from './VideoProductionUpgradePanel'

// ── Production Board ─────────────────────────────────────────────────────────
export default function ProductionBoard({
  cards,
  projectId,
  currentStatus,
  onRefresh,
}: {
  cards: CmoCard[]
  projectId: string
  currentStatus: string
  onRefresh: () => void
}) {
  const [buildingDeck, setBuildingDeck] = useState(false)
  const [submittingRender, setSubmittingRender] = useState(false)
  const [deckId, setDeckId] = useState<string | null>(null)
  const [pipelineErr, setPipelineErr] = useState<string | null>(null)
  const [checkingRender, setCheckingRender] = useState(false)
  const [renderStatus, setRenderStatus] = useState<string | null>(null)

  // Voice upload state
  const [voiceUrl, setVoiceUrl] = useState('')
  const [voiceDuration, setVoiceDuration] = useState('')
  const [attachingVoice, setAttachingVoice] = useState(false)
  const [voiceErr, setVoiceErr] = useState<string | null>(null)
  const [voiceOk, setVoiceOk] = useState(false)

  // Factory send state
  const [sendingFactory, setSendingFactory] = useState(false)
  const [factoryErr, setFactoryErr] = useState<string | null>(null)
  const [factoryResult, setFactoryResult] = useState<{ job_path: string; validated: boolean } | null>(null)

  // P0-2 fix: use backend stage keys.
  // script_planning/script_draft는 ScriptDraftPanel(자동초안 승인)이 전담 렌더하므로
  // raw JSON 중복 표시를 막기 위해 여기 raw 목록에서 제외한다.
  const productionStages = ['reading_script', 'voice_recording', 'slide_deck', 'rendering']
  const productionCards = cards.filter(c => productionStages.includes(c.stage))

  // Script beat data
  const scriptCard = cards.find(c => c.stage === 'script')
  const scriptBeats: ScriptBeat[] = Array.isArray((scriptCard?.data as { beats?: ScriptBeat[] } | null)?.beats)
    ? ((scriptCard!.data as { beats: ScriptBeat[] }).beats)
    : []

  // Factory job card
  const factoryJobCard = cards.find(c => c.stage === 'factory_job')
  const storyboardCard = cards.find(c => c.stage === 'storyboard')

  const sendToFactory = async () => {
    setSendingFactory(true)
    setFactoryErr(null)
    setFactoryResult(null)
    try {
      const res = await api.cmoSendToFactory(projectId) as { job_path: string; validated: boolean }
      setFactoryResult(res)
      onRefresh()
    } catch (e: unknown) {
      setFactoryErr(e instanceof Error ? e.message : '팩토리 전달 실패')
    } finally {
      setSendingFactory(false)
    }
  }

  // 승인4(원고 확인) 컨텍스트: 제목 디벨롭에서 확정된 제목/썸네일 방향을 읽기 전용으로 함께 노출.
  const titleDevCard = cards.find(c => c.stage === 'title_development')
  const titleDev = titleDevCard?.data as { selected_title?: string; selected_thumbnail_direction?: string } | undefined

  return (
    <div>
      <div className="j-overline" style={{ marginBottom: 8 }}>Production Board</div>

      {titleDev?.selected_title && (
        <div style={{ border: '1px solid var(--silver-2)', borderLeft: '4px solid var(--green)', borderRadius: 8, padding: '12px 14px', background: 'var(--paper-surface)', marginBottom: 16 }}>
          <div className="j-overline" style={{ marginBottom: 4 }}>확정 제목 (제목 디벨롭 8단계)</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-1)' }}>{titleDev.selected_title}</div>
          {titleDev.selected_thumbnail_direction && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>썸네일 방향: {titleDev.selected_thumbnail_direction}</div>
          )}
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 4 }}>원고가 이 제목의 약속을 회수하는지 확인하세요.</div>
        </div>
      )}

      {/* R4 원고 초안 — script_planning ~ script_approval (자동초안 → 승인/수정) */}
      <StageGate title="원고 초안 (v3 · 자동초안 승인)" state={blockState({ from: 'script_planning', to: 'script_approval' }, currentStatus)}>
        <ScriptDraftPanel projectId={projectId} cards={cards} onRefresh={onRefresh} />
      </StageGate>

      {/* Script Beat Editor — 원고 단계 */}
      <StageGate title="원고 (장면 Beat)" state={blockState({ from: 'script_planning', to: 'script_approval' }, currentStatus)}>
        <ScriptBeatEditor
          projectId={projectId}
          initialBeats={scriptBeats}
          onRefresh={onRefresh}
        />
      </StageGate>

      {/* Factory Job Card (from backend) */}
      {factoryJobCard && <FactoryJobCard card={factoryJobCard} />}

      {/* Factory Send panel — 원고 승인 후 제작 전달 */}
      <StageGate title="팩토리 전달" state={blockState({ from: 'script_approval', to: 'voice_recording' }, currentStatus)}>
      <div style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 8,
        background: 'var(--paper-surface)',
        overflow: 'hidden',
        marginBottom: 16,
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>팩토리 전달</span>
          <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 8 }}>원고 저장 후 팩토리로 전달합니다</span>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {factoryErr && (
            <div style={{ fontSize: 12, color: 'var(--red)', padding: '4px 8px', background: 'var(--red-tint)', borderRadius: 4 }}>
              {factoryErr}
            </div>
          )}
          {factoryResult && (
            <div style={{ fontSize: 12, color: 'var(--green)', padding: '4px 8px', background: 'var(--p-green)', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
              전달 완료 — {factoryResult.job_path} / validated: {String(factoryResult.validated)}
            </div>
          )}
          <button
            className="j-btn j-btn-secondary j-btn-sm"
            disabled={sendingFactory}
            style={{ alignSelf: 'flex-start' }}
            onClick={sendToFactory}
          >
            {sendingFactory ? '전달 중...' : '팩토리로 전달 →'}
          </button>
        </div>
      </div>
      </StageGate>

      <StageGate title="영상 제작 계획 · Storyboard · Pilot" state={blockState({ from: 'slide_deck', to: 'pilot_approval' }, currentStatus)}>
        <VideoProductionUpgradePanel projectId={projectId} currentStatus={currentStatus} cards={cards} onRefresh={onRefresh} />
      </StageGate>

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

      {/* Internal status stays voice_recording for legacy compatibility. */}
      <StageGate title="원본 영상 등록" state={blockState({ from: 'voice_recording', to: 'voice_recording' }, currentStatus)}>
      <div style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 8,
        background: 'var(--paper-surface)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>원본 영상 파일 등록</span>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="j-input"
            placeholder="가로 원본 영상 URL 또는 등록된 파일 경로"
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
              원본 영상 등록 완료
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
            {attachingVoice ? '등록 중...' : '원본 영상 등록'}
          </button>
        </div>
      </div>
      </StageGate>

      {/* Legacy 프로젝트 또는 Pilot 승인 완료 후 기존 전체 렌더 파이프라인 사용. */}
      {(!storyboardCard || currentStatus === 'rendering') && <>
      {/* P0-1: Slide deck + Render pipeline buttons — 슬라이드덱/렌더 단계 */}
      <StageGate title="프로덕션 파이프라인 (슬라이드덱 · 렌더)" state={blockState({ from: 'slide_deck', to: 'rendering' }, currentStatus)}>
      <div style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 8,
        background: 'var(--paper-surface)',
        overflow: 'hidden',
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
            <button
              className="j-btn j-btn-secondary j-btn-sm"
              disabled={checkingRender}
              title="factory 산출물 기준 렌더 상태를 조회합니다. 완료면 QA 단계로 자동 진행됩니다."
              onClick={async () => {
                setCheckingRender(true)
                setPipelineErr(null)
                try {
                  const res = await api.cmoGetRenderStatus(projectId) as { status: string; project_status: string | null }
                  setRenderStatus(res.status)
                  onRefresh()
                } catch (e: unknown) {
                  setPipelineErr(e instanceof Error ? e.message : '렌더 상태 조회 실패')
                } finally {
                  setCheckingRender(false)
                }
              }}
            >
              {checkingRender ? '조회 중...' : '렌더 상태 확인'}
            </button>
          </div>
          {renderStatus && (
            <div style={{ fontSize: 11.5, color: renderStatus === 'completed' ? 'var(--pi-green)' : 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              render: {renderStatus}{renderStatus === 'completed' ? ' → QA 단계로 진행됨' : ''}
            </div>
          )}
          {deckId && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              deck: {deckId}
            </div>
          )}
        </div>
      </div>
      </StageGate>
      </>}
    </div>
  )
}

// ── Production Action Panel ───────────────────────────────────────────────────
export function ProductionActionPanel({
  gates,
  onDecide,
  deciding,
}: {
  gates: CmoGate[]
  onDecide: (gateId: string, decision: 'approved' | 'needs_revision' | 'rejected') => void
  deciding: string | null
}) {
  const productionGates = gates.filter(g => (g.page === 'production' || g.gate_type === 'script_approval') && !['storyboard_approval', 'pilot_approval'].includes(g.gate_type))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="j-overline" style={{ marginBottom: 4 }}>Action Panel</div>

      <DecisionPanel
        gates={productionGates}
        onDecide={onDecide}
        deciding={deciding}
      />
    </div>
  )
}
