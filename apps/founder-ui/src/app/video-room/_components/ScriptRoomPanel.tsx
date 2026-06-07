'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import type {
  ScriptRoomPanelData,
  ScriptQaReport,
  RevisionRequest,
  ConsumerStage,
} from '../_lib/script-room-types'

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ label, score, threshold }: { label: string; score: number; threshold: number }) {
  const pass = score >= threshold
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--silver-1)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{label}</span>
      <span style={{
        fontSize: 12,
        fontWeight: 700,
        padding: '1px 10px',
        borderRadius: 999,
        background: pass ? 'var(--p-green)' : 'var(--p-rose)',
        color: pass ? 'var(--green)' : 'var(--pi-rose)',
      }}>
        {score}
      </span>
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
      marginBottom: 8,
      marginTop: 20,
    }}>
      {label}
    </div>
  )
}

// ── Script block ──────────────────────────────────────────────────────────────
function ScriptBlock({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4 }}>{label}</div>
      <div style={{
        padding: '10px 12px',
        background: 'var(--bg-inset)',
        border: '1px solid var(--silver-1)',
        borderRadius: 4,
        fontSize: 13,
        color: 'var(--ink-1)',
        lineHeight: 1.75,
        whiteSpace: 'pre-wrap' as const,
        fontFamily: 'var(--font-mono)',
      }}>
        {text}
      </div>
    </div>
  )
}

// ── QA section ────────────────────────────────────────────────────────────────
function QaSection({
  qa,
  onRevisionRequest,
  revisionTarget,
  onRevisionTargetChange,
  requesting,
}: {
  qa: ScriptQaReport
  onRevisionRequest: (target: string) => void
  revisionTarget: string
  onRevisionTargetChange: (v: string) => void
  requesting: boolean
}) {
  const STAGE_LABELS: Record<ConsumerStage, string> = {
    phenomenon: '현상',
    desire: '욕구',
    plan: '계획',
    action: '행동',
    reward: '보상',
  }

  const revisionRequests: RevisionRequest[] = qa.revision_requests ?? []

  return (
    <div>
      <SectionHeader label="CMO QA 결과" />

      {/* Overall pass badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>종합 판정</span>
        <span style={{
          fontSize: 12,
          fontWeight: 700,
          padding: '2px 12px',
          borderRadius: 999,
          background: qa.overall_pass ? 'var(--p-green)' : 'var(--p-rose)',
          color: qa.overall_pass ? 'var(--green)' : 'var(--pi-rose)',
        }}>
          {qa.overall_pass ? '통과' : '미통과'}
        </span>
      </div>

      {/* 5 scores */}
      <div style={{
        border: '1px solid var(--silver-2)',
        borderRadius: 6,
        padding: '8px 12px',
        background: 'var(--paper-surface)',
        marginBottom: 12,
      }}>
        <ScoreBadge label="전략 부합도" score={qa.strategy_fit_score} threshold={80} />
        <ScoreBadge label="타깃 적합도" score={qa.audience_fit_score} threshold={80} />
        <ScoreBadge label="내 말투 적합도" score={qa.voice_fit_score} threshold={75} />
        <ScoreBadge label="판매 논리" score={qa.sales_logic_score} threshold={80} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>사실 안전성</span>
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            padding: '1px 10px',
            borderRadius: 999,
            background: qa.fact_safety_score >= 90 ? 'var(--p-green)' : 'var(--p-rose)',
            color: qa.fact_safety_score >= 90 ? 'var(--green)' : 'var(--pi-rose)',
          }}>
            {qa.fact_safety_score}
          </span>
        </div>
      </div>

      {/* Desire stage coverage */}
      {qa.desire_stage_coverage && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 6 }}>욕구 단계 커버리지</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {(Object.entries(qa.desire_stage_coverage) as [ConsumerStage, boolean][]).map(([stage, covered]) => (
              <span key={stage} style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 999,
                background: covered ? 'var(--p-green)' : 'var(--silver-2)',
                color: covered ? 'var(--green)' : 'var(--ink-4)',
              }}>
                {STAGE_LABELS[stage] ?? stage}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Missing parts */}
      {(qa.missing_parts ?? []).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4 }}>누락 항목</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {(qa.missing_parts ?? []).map((p, i) => (
              <li key={i} style={{ fontSize: 12.5, color: 'var(--pi-rose)', lineHeight: 1.6 }}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Revision requests list */}
      {revisionRequests.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 6 }}>재작업 요청 항목</div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
            {revisionRequests.map((r, i) => (
              <div key={i} style={{
                border: '1px solid var(--silver-2)',
                borderLeft: '3px solid var(--pi-rose)',
                borderRadius: 4,
                padding: '7px 10px',
                background: 'var(--paper-surface)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--pi-rose)', marginBottom: 2 }}>
                  {r.target}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.5 }}>{r.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revision request button — only shown when QA fails */}
      {!qa.overall_pass && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <input
            className="j-input"
            style={{ flex: 1, fontSize: 12.5 }}
            placeholder="재작업 대상 (예: intro_writer)"
            value={revisionTarget}
            onChange={e => onRevisionTargetChange(e.target.value)}
          />
          <button
            className="j-btn j-btn-secondary j-btn-sm"
            disabled={requesting || !revisionTarget.trim()}
            onClick={() => onRevisionRequest(revisionTarget.trim())}
          >
            {requesting ? '요청 중...' : '재작업 요청'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── ScriptRoomPanel — self-fetching, matches page calling convention ───────────
// Props: { projectId, cardId } — same interface the script-room page expects.
export default function ScriptRoomPanel({
  projectId,
  cardId,
}: {
  projectId: string
  cardId: string
}) {
  const [data, setData] = useState<ScriptRoomPanelData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revisionTarget, setRevisionTarget] = useState('')
  const [requesting, setRequesting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.cmoGetScriptRoomData({ project_id: projectId, content_card_id: cardId }) as { script_room?: ScriptRoomPanelData }
      setData(res.script_room ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [projectId, cardId])

  useEffect(() => {
    load()
  }, [load])

  const handleRevisionRequest = async (target: string) => {
    setRequesting(true)
    try {
      await api.cmoRequestScriptRevision({ project_id: projectId, content_card_id: cardId, revision_target: target })
      setRevisionTarget('')
      load()
    } catch {
      // silently fail; user can retry
    } finally {
      setRequesting(false)
    }
  }

  if (loading && !data) {
    return <div style={{ fontSize: 13, color: 'var(--ink-4)', padding: '24px 0' }}>원고 데이터 로딩 중...</div>
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0' }}>
        <span style={{ fontSize: 13, color: 'var(--pi-rose)' }}>{error}</span>
        <button className="j-btn j-btn-secondary j-btn-sm" onClick={load}>재시도</button>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ padding: '16px 0' }}>
        <div className="j-overline" style={{ marginBottom: 8 }}>Script Room</div>
        <p style={{ fontSize: 13, color: 'var(--ink-4)' }}>원고 작성이 시작되면 여기에 표시됩니다.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="j-overline" style={{ marginBottom: 12 }}>Script Room</div>

      {/* Intro 30s */}
      {data.intro_30s && (
        <div>
          <SectionHeader label="도입부 30초" />
          {data.intro_30s.first_sentence && (
            <div style={{
              padding: '8px 12px',
              background: 'var(--p-butter)',
              borderRadius: 4,
              fontSize: 13.5,
              fontWeight: 600,
              color: 'var(--pi-butter)',
              marginBottom: 8,
              lineHeight: 1.5,
            }}>
              {data.intro_30s.first_sentence}
            </div>
          )}
          {data.intro_30s.script && (
            <ScriptBlock label="원고" text={data.intro_30s.script} />
          )}
          {(data.intro_30s.hook_type || data.intro_30s.tension || data.intro_30s.viewer_promise) && (
            <div style={{
              display: 'flex', flexDirection: 'column' as const, gap: 4,
              padding: '8px 12px',
              background: 'var(--bg-inset)',
              border: '1px solid var(--silver-1)',
              borderRadius: 4,
              fontSize: 12.5,
              marginBottom: 8,
            }}>
              {data.intro_30s.hook_type && (
                <div><span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>Hook: </span><span style={{ color: 'var(--ink-1)' }}>{data.intro_30s.hook_type}</span></div>
              )}
              {data.intro_30s.tension && (
                <div><span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>Tension: </span><span style={{ color: 'var(--ink-1)' }}>{data.intro_30s.tension}</span></div>
              )}
              {data.intro_30s.viewer_promise && (
                <div><span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>약속: </span><span style={{ color: 'var(--ink-1)' }}>{data.intro_30s.viewer_promise}</span></div>
              )}
            </div>
          )}
          {data.intro_30s.why_it_works && (
            <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 8px', fontStyle: 'italic', lineHeight: 1.5 }}>
              {data.intro_30s.why_it_works}
            </p>
          )}
        </div>
      )}

      {/* Logic block drafts (per-part) */}
      {(data.logic_block_drafts ?? []).length > 0 && (
        <div>
          <SectionHeader label="논리 블록 원고 (파트별)" />
          {(data.logic_block_drafts ?? []).map((block, i) => (
            <div key={block.block_id ?? i} style={{
              border: '1px solid var(--silver-2)',
              borderRadius: 6,
              overflow: 'hidden',
              marginBottom: 10,
            }}>
              <div style={{
                padding: '7px 12px',
                borderBottom: '1px solid var(--silver-1)',
                background: 'var(--bg-inset)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                  {block.block_id}
                </span>
                {block.role && (
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{block.role}</span>
                )}
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{
                  fontSize: 13,
                  color: 'var(--ink-1)',
                  lineHeight: 1.75,
                  whiteSpace: 'pre-wrap' as const,
                  fontFamily: 'var(--font-mono)',
                }}>
                  {block.draft}
                </div>
                {(block.used_voc_lines ?? []).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)' }}>VOC 반영: </span>
                    <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{(block.used_voc_lines ?? []).join(' / ')}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Integrated script */}
      {data.integrated_script && (
        <div>
          <SectionHeader label="통합 원고" />
          <ScriptBlock label="전체 원고" text={data.integrated_script.full_script} />
          {(data.integrated_script.added_transitions ?? []).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4 }}>추가된 연결어</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(data.integrated_script.added_transitions ?? []).map((t, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Founder voice matched script */}
      {data.voice_matched_script && (
        <div>
          <SectionHeader label="Founder Voice 변환 원고" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 999,
              background: data.voice_matched_script.preserved_logic !== false ? 'var(--p-green)' : 'var(--p-rose)',
              color: data.voice_matched_script.preserved_logic !== false ? 'var(--green)' : 'var(--pi-rose)',
            }}>
              {data.voice_matched_script.preserved_logic !== false ? '논리 보존' : '논리 변경됨'}
            </span>
          </div>
          <ScriptBlock label="변환 원고" text={data.voice_matched_script.full_script} />
          {(data.voice_matched_script.changed_phrases ?? []).length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 4 }}>변환된 표현</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(data.voice_matched_script.changed_phrases ?? []).map((p, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* CMO QA */}
      {data.script_qa_report && (
        <QaSection
          qa={data.script_qa_report}
          onRevisionRequest={handleRevisionRequest}
          revisionTarget={revisionTarget}
          onRevisionTargetChange={setRevisionTarget}
          requesting={requesting}
        />
      )}
    </div>
  )
}
