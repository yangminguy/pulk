'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import {
  validateVideoExecutionBrief,
  BRIEF_FORBIDDEN_FIELDS,
} from '../_lib/script-room-types'
import type {
  VideoExecutionBrief,
  BriefForbiddenField,
} from '../_lib/script-room-types'

// ── Field row ─────────────────────────────────────────────────────────────────
function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid var(--silver-1)' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', minWidth: 130, paddingTop: 1, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.55, wordBreak: 'break-word' as const, flex: 1 }}>{value}</span>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      color: 'var(--ink-3)',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.08em',
      marginTop: 20,
      marginBottom: 8,
    }}>
      {label}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ label, variant }: { label: string; variant: 'green' | 'rose' | 'neutral' }) {
  const styles: Record<string, { background: string; color: string }> = {
    green: { background: 'var(--p-green)', color: 'var(--green)' },
    rose: { background: 'var(--p-rose)', color: 'var(--pi-rose)' },
    neutral: { background: 'var(--silver-2)', color: 'var(--ink-3)' },
  }
  const s = styles[variant]
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 9px',
      borderRadius: 999,
      background: s.background,
      color: s.color,
    }}>
      {label}
    </span>
  )
}

// ── Forbidden field checker ───────────────────────────────────────────────────
function ForbiddenFieldBadges({ forbidden }: { forbidden: BriefForbiddenField[] }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 6 }}>금지 필드 부재 확인</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const }}>
        {BRIEF_FORBIDDEN_FIELDS.map(ff => {
          const present = forbidden.includes(ff)
          return (
            <span key={ff} style={{
              fontSize: 10.5,
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: 999,
              background: present ? 'var(--p-rose)' : 'var(--p-green)',
              color: present ? 'var(--pi-rose)' : 'var(--green)',
            }}>
              {present ? `${ff} ✕` : `${ff} ✓`}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── VideoExecutionBriefPanel ──────────────────────────────────────────────────
// Props match script-room page calling convention: { projectId, cardId, briefId?, factoryResultUrl? }
export default function VideoExecutionBriefPanel({
  projectId,
  cardId,
  briefId: initialBriefId,
  factoryResultUrl: initialFactoryResultUrl,
}: {
  projectId: string
  cardId: string
  briefId?: string
  factoryResultUrl?: string
}) {
  const [brief, setBrief] = useState<VideoExecutionBrief | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [handoffStatus, setHandoffStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [handoffError, setHandoffError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [factoryResultUrl, setFactoryResultUrl] = useState(initialFactoryResultUrl)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await api.cmoGetScriptRoomData({ project_id: projectId, content_card_id: cardId }) as { brief?: VideoExecutionBrief; handoff_status?: 'idle' | 'sending' | 'sent' | 'error'; factory_result_url?: string }
      setBrief(res.brief ?? null)
      if (res.handoff_status) setHandoffStatus(res.handoff_status)
      if (res.factory_result_url) setFactoryResultUrl(res.factory_result_url)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [projectId, cardId])

  useEffect(() => {
    load()
  }, [load])

  const handleSendToFactory = async () => {
    if (!brief) return
    const validation = validateVideoExecutionBrief(brief)
    if (!validation.valid) return
    setHandoffStatus('sending')
    setHandoffError(null)
    try {
      const res = await api.cmoSendBriefToFactory({ project_id: projectId, content_card_id: cardId, brief_id: initialBriefId, brief }) as { factory_result_url?: string }
      setHandoffStatus('sent')
      if (res.factory_result_url) setFactoryResultUrl(res.factory_result_url)
      load()
    } catch (e) {
      setHandoffStatus('error')
      setHandoffError(e instanceof Error ? e.message : '전송 중 오류가 발생했습니다.')
    }
  }

  if (loading && !brief) {
    return <div style={{ fontSize: 13, color: 'var(--ink-4)', padding: '24px 0' }}>Brief 로딩 중...</div>
  }

  if (loadError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0' }}>
        <span style={{ fontSize: 13, color: 'var(--pi-rose)' }}>{loadError}</span>
        <button className="j-btn j-btn-secondary j-btn-sm" onClick={load}>재시도</button>
      </div>
    )
  }

  if (!brief) {
    return (
      <div style={{ padding: '16px 0' }}>
        <div className="j-overline" style={{ marginBottom: 8 }}>Video Execution Brief</div>
        <p style={{ fontSize: 13, color: 'var(--ink-4)' }}>Brief가 아직 생성되지 않았습니다.</p>
      </div>
    )
  }

  const validation = validateVideoExecutionBrief(brief)
  const logicBlocks = brief.script?.logic_blocks ?? []
  const assetRequests = brief.asset_requests ?? []

  return (
    <div>
      <div className="j-overline" style={{ marginBottom: 12 }}>Video Execution Brief</div>

      {/* Validation result */}
      <div style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 6,
        padding: '10px 14px',
        background: 'var(--paper-surface)',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>Brief 검증</span>
          <Badge
            label={validation.valid ? 'valid' : 'invalid'}
            variant={validation.valid ? 'green' : 'rose'}
          />
        </div>

        <ForbiddenFieldBadges forbidden={validation.forbidden_found} />

        {validation.errors.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pi-rose)', marginBottom: 4 }}>오류</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {validation.errors.map((err, i) => (
                <li key={i} style={{ fontSize: 12, color: 'var(--pi-rose)', lineHeight: 1.6 }}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Target viewer */}
      <SectionHeader label="타깃 시청자" />
      <div style={{ marginBottom: 8 }}>
        <FieldRow label="who" value={brief.target_viewer?.who} />
        <FieldRow label="knowledge_level" value={brief.target_viewer?.knowledge_level} />
        <FieldRow label="pain" value={brief.target_viewer?.pain} />
        <FieldRow label="desired_reaction" value={brief.target_viewer?.desired_reaction} />
      </div>

      {/* Strategy */}
      <SectionHeader label="전략" />
      <div style={{ marginBottom: 8 }}>
        <FieldRow label="content_type" value={<Badge label={brief.content_type} variant="neutral" />} />
        <FieldRow label="core_message" value={brief.strategy?.core_message} />
        <FieldRow
          label="covered_stages"
          value={
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
              {(brief.strategy?.covered_stages ?? []).map(s => (
                <Badge key={s} label={s} variant="neutral" />
              ))}
            </div>
          }
        />
        <FieldRow label="role_in_content_set" value={brief.strategy?.role_in_content_set} />
        {brief.strategy?.bridge_to_key_content && (
          <FieldRow label="bridge_to_key" value={brief.strategy.bridge_to_key_content} />
        )}
      </div>

      {/* Script */}
      <SectionHeader label="원고" />
      <div style={{ marginBottom: 8 }}>
        {brief.script?.intro_30s && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4 }}>도입부 30초</div>
            <div style={{
              padding: '8px 12px',
              background: 'var(--bg-inset)',
              border: '1px solid var(--silver-1)',
              borderRadius: 4,
              fontSize: 12.5,
              color: 'var(--ink-1)',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap' as const,
              fontFamily: 'var(--font-mono)',
            }}>
              {brief.script.intro_30s}
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4 }}>
          논리 블록 ({logicBlocks.length}개)
        </div>
        {logicBlocks.map((block, i) => (
          <div key={block.block_id ?? i} style={{
            border: '1px solid var(--silver-2)',
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 8,
          }}>
            <div style={{
              padding: '6px 10px',
              background: 'var(--bg-inset)',
              borderBottom: '1px solid var(--silver-1)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                {block.block_id}
              </span>
              {block.role && (
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{block.role}</span>
              )}
            </div>
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
              <div style={{ fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.6 }}>{block.speaker_text}</div>
              {block.communication_goal && (
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  <span style={{ fontWeight: 600 }}>goal: </span>{block.communication_goal}
                </div>
              )}
              {block.viewer_reaction_target && (
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  <span style={{ fontWeight: 600 }}>reaction: </span>{block.viewer_reaction_target}
                </div>
              )}
              {block.visual_intent_hint && (
                <div style={{ fontSize: 11, color: 'var(--ink-4)', fontStyle: 'italic' }}>
                  hint: {block.visual_intent_hint}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Constraints */}
      <SectionHeader label="제약 조건" />
      <div style={{ marginBottom: 8 }}>
        <FieldRow label="format" value={<Badge label={brief.constraints?.format} variant="neutral" />} />
        <FieldRow label="tone" value={brief.constraints?.tone} />
        {(brief.constraints?.avoid ?? []).length > 0 && (
          <FieldRow label="avoid" value={(brief.constraints.avoid ?? []).join(', ')} />
        )}
      </div>

      {/* Asset requests */}
      {assetRequests.length > 0 && (
        <>
          <SectionHeader label="에셋 요청" />
          {assetRequests.map((req, i) => (
            <div key={i} style={{
              border: '1px solid var(--silver-2)',
              borderRadius: 4,
              padding: '8px 10px',
              marginBottom: 6,
              display: 'flex', flexDirection: 'column' as const, gap: 3,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Badge label={req.preferred_asset_type} variant="neutral" />
                <span style={{ fontSize: 12.5, color: 'var(--ink-1)' }}>{req.need}</span>
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{req.reason}</span>
            </div>
          ))}
        </>
      )}

      {/* Factory result link */}
      {factoryResultUrl && (
        <div style={{ marginTop: 12, marginBottom: 4 }}>
          <a href={factoryResultUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--blue)', textDecoration: 'none' }}>
            Factory 결과 보기 →
          </a>
        </div>
      )}

      {/* Raw JSON toggle */}
      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <button
          className="j-btn j-btn-secondary j-btn-sm"
          onClick={() => setShowRaw(v => !v)}
        >
          {showRaw ? 'JSON 숨기기' : 'JSON 보기'}
        </button>
        {showRaw && (
          <pre style={{
            marginTop: 8,
            fontSize: 11,
            color: 'var(--ink-3)',
            background: 'var(--bg-inset)',
            border: '1px solid var(--silver-1)',
            borderRadius: 4,
            padding: '10px 12px',
            overflowX: 'auto',
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap' as const,
            wordBreak: 'break-word' as const,
          }}>
            {JSON.stringify(brief, null, 2)}
          </pre>
        )}
      </div>

      {/* Factory handoff button */}
      <div style={{
        borderTop: '1px solid var(--silver-2)',
        paddingTop: 14,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const,
      }}>
        <button
          className="j-btn j-btn-sm"
          disabled={!validation.valid || handoffStatus === 'sending' || handoffStatus === 'sent'}
          onClick={handleSendToFactory}
          style={validation.valid && handoffStatus !== 'sent' ? { background: 'var(--blue)', color: '#fff' } : {}}
        >
          {handoffStatus === 'sending'
            ? '전송 중...'
            : handoffStatus === 'sent'
              ? '전송 완료'
              : 'Factory로 전송'}
        </button>

        {handoffStatus === 'sent' && (
          <Badge label="handoff_status: sent" variant="green" />
        )}
        {handoffStatus === 'error' && (
          <span style={{ fontSize: 12, color: 'var(--pi-rose)' }}>{handoffError ?? '오류'}</span>
        )}
        {!validation.valid && handoffStatus !== 'sent' && (
          <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>Brief 검증 실패 — 전송 불가</span>
        )}
      </div>
    </div>
  )
}
