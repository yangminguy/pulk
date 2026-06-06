'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { blockState } from '../_lib/phases'
import type { CmoCard, CmoGate } from '../_lib/types'
import { CardShell } from './cards'
import DecisionPanel from './DecisionPanel'
import StageGate from './StageGate'

// ── Review & Publish Board ───────────────────────────────────────────────────
export default function ReviewPublishBoard({
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

      {/* P0-1: QA + Upload Draft pipeline buttons — 게시 단계 게이팅 */}
      <div style={{ marginTop: 16 }}>
        <StageGate title="게시 파이프라인 (QA · 업로드 초안)" state={blockState({ from: 'qa', to: 'upload_approval' }, currentStatus)}>
          <div style={{
            border: '1px solid var(--silver-2)',
            borderRadius: 8,
            background: 'var(--paper-surface)',
            overflow: 'hidden',
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
        </StageGate>
      </div>
    </div>
  )
}

// ── Review Approval Panel ────────────────────────────────────────────────────
export function ReviewApprovalPanel({
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
