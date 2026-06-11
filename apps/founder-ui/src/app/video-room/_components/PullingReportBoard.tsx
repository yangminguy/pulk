'use client'
import { useState, useEffect, useRef, Fragment } from 'react'
import { api } from '@/lib/api'
import type { CmoCard } from '../_lib/types'

// 풀링 콘텐츠 주제 탐색 보고서 보드 — proposePullingReport 산출물(report)을
// workflow v2 보고서 구조(요약/수집데이터/주제 4~5개/승인)로 표시.
// 도메인 로직 없음: 표시 + 생성/승인 호출만.

type Funnel = { phenomenon?: string; desire?: string; plan?: string; action?: string; reward?: string }
type Evidence = {
  videoId: string; title: string; url: string; thumbnailUrl: string; channelTitle: string
  viewCount: number; publishedAt: string; isShort: boolean
  exposure: string | null; performance: string | null; contribution: string | null
  videoScore: number; source: string
}
type Topic = {
  rank: number; topic_name: string; grade: 'A' | 'B' | 'C' | 'D'
  target_phenomenon: string; created_desire: string; linked_key_content: string
  evidence_videos: Evidence[]
  viewer_identity?: string; identity_match?: 'match' | 'partial' | 'mismatch'; identity_reason?: string
  selection_reason: string; product_application: string; funnel: Funnel; topic_score: number
}
type Slot = { slot: number; query: string; purpose: string; resultCount: number; goodOrGreatCount: number }
type Report = {
  product?: string; target?: string; key_content_title?: string; key_funnel_summary?: string; pulling_role?: string
  search_summary?: { keywords_used?: number; videos_collected?: number; videos_after_dedup?: number; longform_count?: number; over_50k_count?: number; qualified_count?: number }
  viewtrap_budget?: { used?: number; limit?: number; slots?: Slot[] }
  topics?: Topic[]; approval_request?: string
  provenance?: { keywords_generated?: number; clusters_formed?: number; topics_selected?: number; notes?: string[] }
}

const GATE_STATES = ['key_content_approval', 'pulling_content_set_approval', 'hook_draft_approval', 'script_approval', 'video_qa_approval', 'upload_approval']

const fmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString() : '—')
const GRADE_COLOR: Record<string, { color: string; bg: string }> = {
  A: { color: 'var(--green-press)', bg: 'rgba(40,140,80,0.12)' },
  B: { color: 'var(--wood-3)', bg: 'rgba(150,110,60,0.12)' },
  C: { color: 'var(--ink-3)', bg: 'rgba(120,120,120,0.10)' },
  D: { color: 'var(--ink-4)', bg: 'rgba(120,120,120,0.06)' },
}
const IDENTITY: Record<string, { label: string; color: string; bg: string }> = {
  match: { label: '타깃 정체성 일치', color: 'var(--green-press)', bg: 'rgba(40,140,80,0.10)' },
  partial: { label: '정체성 부분 일치', color: 'var(--wood-3)', bg: 'rgba(150,110,60,0.10)' },
  mismatch: { label: '정체성 불일치', color: 'var(--red)', bg: 'rgba(180,60,60,0.10)' },
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          width: 20, height: 20, borderRadius: 5, background: 'var(--wood-3)', color: '#fff',
          fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{n}</span>
        <h3 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink-1)', margin: 0 }}>{title}</h3>
      </div>
      <div>{children}</div>
    </section>
  )
}

const th: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--silver-2)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: 12, color: 'var(--ink-2)', padding: '7px 8px', borderBottom: '1px solid var(--silver-1)', verticalAlign: 'top' }

export default function PullingReportBoard({ projectId, cards, currentStatus, onRefresh }: {
  projectId: string
  cards: CmoCard[]
  currentStatus: string
  onRefresh: () => void
}) {
  const card = cards.find(c => c.stage === 'pulling_content_report')
  const report = card?.data as Report | undefined
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggered = useRef(false)

  const propose = async () => {
    if (loading) return
    setLoading(true); setError(null)
    try { await api.cmoProposePullingReport(projectId); onRefresh() }
    catch (e) { setError(e instanceof Error ? e.message : '보고서 생성 실패') }
    finally { setLoading(false) }
  }

  // 진입 시 카드 없으면 자동 1회 생성.
  useEffect(() => {
    if (!card && !triggered.current && currentStatus === 'pulling_content_set_selection') {
      triggered.current = true
      void propose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, currentStatus])

  const approve = async () => {
    if (approving) return
    setApproving(true); setError(null)
    try {
      let status: string = currentStatus
      for (let i = 0; i < 8 && status && status !== 'thumbnail_pattern_extraction'; i++) {
        const res = GATE_STATES.includes(status)
          ? await api.cmoApproveStageGate(projectId)
          : await api.cmoAdvanceStatus(projectId)
        const next = (res as { status?: string })?.status
        if (!next || next === status) break
        status = next
      }
      onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '승인 실패'); setApproving(false)
    }
  }

  const box: React.CSSProperties = { border: '1px solid var(--silver-2)', borderRadius: 10, background: 'var(--paper-surface)', padding: 20 }

  if (!report) {
    return (
      <div style={{ ...box, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
        {loading
          ? '풀링 콘텐츠 주제 탐색 보고서 작성 중… (현상영역→검색어 생성 → YouTube/뷰트랩 발굴 → 클러스터링 → 주제별 퍼널 분석, 보통 5~12분)'
          : '풀링 콘텐츠 주제 탐색 보고서가 아직 없습니다.'}
        {!loading && (
          <button className="j-btn j-btn-secondary j-btn-sm" onClick={propose} style={{ marginLeft: 12 }}>보고서 생성</button>
        )}
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>
    )
  }

  const ss = report.search_summary ?? {}
  const budget = report.viewtrap_budget ?? {}
  const slots = budget.slots ?? []
  const topics = (report.topics ?? []).slice().sort((a, b) => a.rank - b.rank)

  return (
    <div style={box}>
      <div className="j-overline" style={{ marginBottom: 4 }}>풀링 콘텐츠 주제 탐색 보고서 (실데이터 · 현상 → 욕구)</div>

      {/* 1. 요약 */}
      <Section n={1} title="요약">
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '150px 1fr', rowGap: 5, columnGap: 10, fontSize: 12.5 }}>
          {([
            ['연결 키 콘텐츠', report.key_content_title],
            ['키 콘텐츠 퍼널', report.key_funnel_summary],
            ['풀링 콘텐츠 역할', report.pulling_role],
            ['뷰트랩 검색 사용량', `${budget.used ?? 0}/${budget.limit ?? 10}`],
            ['YouTube 후보 수', `${fmt(ss.videos_collected)} (중복제거 ${fmt(ss.videos_after_dedup)} · 적격 ${fmt(ss.qualified_count)})`],
            ['최종 선별 주제 수', `${topics.length}개`],
          ] as [string, string | undefined][]).map(([k, val]) => (
            <Fragment key={k}>
              <dt style={{ color: 'var(--ink-4)', fontWeight: 600 }}>{k}</dt>
              <dd style={{ margin: 0, color: 'var(--ink-1)', lineHeight: 1.5 }}>{val || '—'}</dd>
            </Fragment>
          ))}
        </dl>
      </Section>

      {/* 2. 뷰트랩 검색 슬롯 + 수집 요약 */}
      <Section n={2} title="수집 데이터 요약 (뷰트랩 검색 슬롯)">
        <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginBottom: 8 }}>
          롱폼 {fmt(ss.longform_count)} · 5만+ {fmt(ss.over_50k_count)} · 적격 {fmt(ss.qualified_count)}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead><tr>{['#', '검색어', '목적', '결과 수', 'good+ 수'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.slot}>
                  <td style={td}>{s.slot}</td>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--ink-1)' }}>{s.query}</td>
                  <td style={td}>{s.purpose}</td>
                  <td style={td}>{fmt(s.resultCount)}</td>
                  <td style={td}>{fmt(s.goodOrGreatCount)}</td>
                </tr>
              ))}
              {slots.length === 0 && <tr><td style={td} colSpan={5}>검색 내역이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 3. 최종 선별 주제 4~5개 */}
      <Section n={3} title={`최종 선별 풀링 주제 ${topics.length}개`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {topics.map((t) => (
            <div key={t.rank} style={{ border: '1px solid var(--silver-2)', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--wood-3)' }}>#{t.rank}</span>
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: '1px 8px', borderRadius: 4,
                  color: (GRADE_COLOR[t.grade] ?? GRADE_COLOR.C).color, background: (GRADE_COLOR[t.grade] ?? GRADE_COLOR.C).bg,
                }}>등급 {t.grade}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-1)' }}>{t.topic_name}</span>
                {t.identity_match && IDENTITY[t.identity_match] && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                    color: IDENTITY[t.identity_match].color, background: IDENTITY[t.identity_match].bg,
                  }}>{IDENTITY[t.identity_match].label}</span>
                )}
                <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 'auto' }}>점수 {t.topic_score?.toFixed?.(2) ?? t.topic_score}</span>
              </div>

              {/* 현상 → 욕구 */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 10 }}>
                <span style={{ background: 'rgba(180,60,60,0.08)', color: 'var(--ink-2)', padding: '3px 8px', borderRadius: 5 }}>현상: {t.target_phenomenon || '—'}</span>
                <span style={{ color: 'var(--ink-4)' }}>→</span>
                <span style={{ background: 'rgba(40,140,80,0.08)', color: 'var(--ink-2)', padding: '3px 8px', borderRadius: 5 }}>욕구: {t.created_desire || '—'}</span>
              </div>

              {/* 근거 영상 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {(t.evidence_videos ?? []).map((e) => (
                  <div key={e.videoId} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <a href={e.url} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={e.thumbnailUrl} alt={e.title} width={104} height={58} style={{ borderRadius: 5, objectFit: 'cover', display: 'block' }} />
                    </a>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={e.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-1)', textDecoration: 'none', display: 'block', lineHeight: 1.35 }}>{e.title}</a>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                        <span>{e.channelTitle}</span>
                        <span>조회수 {fmt(e.viewCount)}</span>
                        <span>노출확률 <strong style={{ color: 'var(--ink-2)' }}>{e.exposure ?? '-'}</strong></span>
                        <span>성과도 <strong style={{ color: 'var(--ink-2)' }}>{e.performance ?? '-'}</strong></span>
                        <span>기여도 <strong style={{ color: 'var(--ink-2)' }}>{e.contribution ?? '-'}</strong></span>
                        <span style={{ color: 'var(--ink-4)' }}>점수 {e.videoScore?.toFixed?.(2) ?? e.videoScore}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {(t.evidence_videos?.length ?? 0) === 0 && <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>근거 영상이 없습니다.</span>}
              </div>

              {/* 선택 이유 + 상품 접목 */}
              {t.selection_reason && <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '0 0 6px', lineHeight: 1.5 }}><strong style={{ color: 'var(--ink-1)' }}>선택 이유</strong> · {t.selection_reason}</p>}
              {t.product_application && <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '0 0 8px', lineHeight: 1.5 }}><strong style={{ color: 'var(--ink-1)' }}>상품 접목</strong> · {t.product_application}</p>}

              {/* 퍼널 */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                  <thead><tr>{['현상', '욕구', '계획', '행동', '보상'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody><tr>
                    <td style={td}>{t.funnel?.phenomenon || '—'}</td>
                    <td style={td}>{t.funnel?.desire || '—'}</td>
                    <td style={td}>{t.funnel?.plan || '—'}</td>
                    <td style={td}>{t.funnel?.action || '—'}</td>
                    <td style={td}>{t.funnel?.reward || '—'}</td>
                  </tr></tbody>
                </table>
              </div>
              {t.identity_reason && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 6 }}>정체성 판단: {t.identity_reason}</div>}
            </div>
          ))}
          {topics.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--ink-4)' }}>선별된 주제가 없습니다.</p>}
        </div>
      </Section>

      {/* 4. 승인 */}
      {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <div style={{ borderTop: '1px solid var(--silver-2)', paddingTop: 14, marginTop: 4 }}>
        <p style={{ fontSize: 13.5, color: 'var(--ink-1)', fontWeight: 600, marginBottom: 10 }}>
          {report.approval_request || '위 풀링 주제로 세트를 확정해도 될까요?'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="j-btn j-btn-primary" onClick={approve} disabled={approving} style={{ flex: 1 }}>
            {approving ? '진행 중…' : '풀링 세트 확정 → 다음 단계'}
          </button>
          <button className="j-btn j-btn-ghost" onClick={propose} disabled={loading || approving}>
            {loading ? '생성 중…' : '다시 생성'}
          </button>
        </div>
      </div>

      {(report.provenance?.notes?.length ?? 0) > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 11, color: 'var(--ink-4)', cursor: 'pointer' }}>진행 로그 ({report.provenance?.notes?.length})</summary>
          <ul style={{ fontSize: 11, color: 'var(--ink-4)', margin: '6px 0 0', paddingLeft: 18 }}>
            {report.provenance?.notes?.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}
