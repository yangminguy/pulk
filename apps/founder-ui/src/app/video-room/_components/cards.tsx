'use client'
import { STATUS_LABEL } from '../_lib/phases'
import type { CmoCard, AppliedInsight, Intro30sData } from '../_lib/types'

// ── Intro30sCard — dedicated renderer for stage 'intro_30s' ─────────────────
export function Intro30sCard({ card }: { card: CmoCard }) {
  const data = (card.data ?? {}) as Intro30sData
  const insights: AppliedInsight[] = Array.isArray(data.applied_insights) ? data.applied_insights : []

  return (
    <div style={{
      border: '1px solid var(--silver-2)',
      borderLeft: '4px solid var(--wood-3)',
      borderRadius: 8,
      background: 'var(--paper-surface)',
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--silver-1)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--wood-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          도입부 30초
        </span>
        {data.key_content_title && (
          <span style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>
            — {data.key_content_title}
          </span>
        )}
      </div>

      <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* 도입부 30초 원고 */}
        {data.intro_script_30s && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              원고 (30초)
            </div>
            {data.first_sentence && (
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
                {data.first_sentence}
              </div>
            )}
            <div style={{
              padding: '10px 12px',
              background: 'var(--bg-inset)',
              border: '1px solid var(--silver-1)',
              borderRadius: 4,
              fontSize: 13.5,
              color: 'var(--ink-1)',
              lineHeight: 1.75,
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-mono)',
            }}>
              {data.intro_script_30s}
            </div>
          </div>
        )}

        {/* 훅 구조 / 약속 / 호기심 갭 */}
        {(data.hook_structure || data.promise || data.curiosity_gap) && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              훅 구조
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.hook_structure && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', minWidth: 64, paddingTop: 1 }}>Hook</span>
                  <span style={{ fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.5 }}>{data.hook_structure}</span>
                </div>
              )}
              {data.promise && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', minWidth: 64, paddingTop: 1 }}>약속</span>
                  <span style={{ fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.5 }}>{data.promise}</span>
                </div>
              )}
              {data.curiosity_gap && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', minWidth: 64, paddingTop: 1 }}>호기심 갭</span>
                  <span style={{ fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.5 }}>{data.curiosity_gap}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 적용 인사이트 표 */}
        {insights.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              적용된 Second Brain 인사이트
            </div>
            <div style={{
              border: '1px solid var(--silver-2)',
              borderRadius: 4,
              overflow: 'hidden',
            }}>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                background: 'var(--bg-inset)',
                borderBottom: '1px solid var(--silver-2)',
              }}>
                <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.04em' }}>
                  인사이트
                </div>
                <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.04em', borderLeft: '1px solid var(--silver-2)' }}>
                  적용 방식
                </div>
              </div>
              {/* Table rows */}
              {insights.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    borderBottom: i < insights.length - 1 ? '1px solid var(--silver-1)' : 'none',
                    background: i % 2 === 1 ? 'var(--silver-1)' : 'transparent',
                  }}
                >
                  <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.5 }}>
                    {item.insight}
                  </div>
                  <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, borderLeft: '1px solid var(--silver-1)' }}>
                    {item.how_applied}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {card.summary && (
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
            {card.summary}
          </p>
        )}
      </div>
    </div>
  )
}

// ── FactoryJobCard — stage 'factory_job' renderer ───────────────────────────
export function FactoryJobCard({ card }: { card: CmoCard }) {
  const data = (card.data ?? {}) as { job_path?: string; validated?: boolean }
  return (
    <div style={{
      border: '1px solid var(--silver-2)',
      borderLeft: '4px solid var(--wood-3)',
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
        gap: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--wood-3)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          전달 완료 — Factory Job
        </span>
        {data.validated !== undefined && (
          <span style={{
            fontSize: 11,
            padding: '1px 8px',
            borderRadius: 999,
            background: data.validated ? 'var(--p-green)' : 'var(--p-rose)',
            color: data.validated ? 'var(--green)' : 'var(--pi-rose)',
            fontWeight: 600,
          }}>
            {data.validated ? '검증 통과' : '검증 실패'}
          </span>
        )}
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.job_path && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
            <span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>job_path: </span>{data.job_path}
          </div>
        )}
        {card.summary && (
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: 0, lineHeight: 1.5 }}>{card.summary}</p>
        )}
      </div>
    </div>
  )
}

// ── CardShell — generic fallback card ───────────────────────────────────────
export function CardShell({ card }: { card: CmoCard }) {
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
