'use client'
import { useState, useEffect, useRef, Fragment } from 'react'
import { api } from '@/lib/api'
import type { CmoCard } from '../_lib/types'

// 키 콘텐츠 기획 보고서 보드 — proposeKeyContentReport 산출물(report)을
// 사장님 스펙 1~7 섹션으로 표시하고, 승인 시 키 콘텐츠 확정(advanceStatus)으로 전진.
// 도메인 로직 없음: 표시 + 생성/승인 호출만.

type Funnel = { phenomenon?: string; desire?: string; plan?: string; action?: string; reward?: string }
type Monetization = {
  selling_product?: string; pinned_comment?: string; description_links?: string; profile_links?: string
  moves_user_to?: string; monetization_method?: string; takeaway_for_us?: string
}
type MarketRow = {
  keyword: string; videoCount: number; avgViews: number; topViews: number
  longformRatio: number; shortsRatio: number; recentRatio: number
  targetFit: string; salesLink: string; verdict: string; verdictReason: string
}
type Candidate = {
  videoId: string; title: string; url: string; thumbnailUrl: string; channelTitle: string
  viewCount: number; performance: string | null; contribution: string | null; isShort: boolean
  keyword: string; rank: number; topPick: boolean; transcriptAvailable: boolean
  viewer_identity?: string; identity_match?: 'match' | 'partial' | 'mismatch'; identity_reason?: string
  funnel?: Funnel; monetization?: Monetization
}
type Applied = {
  content_topic?: string; core_target?: string; target_phenomenon?: string; desire_to_trigger?: string
  plan_user_makes?: string; action_to_our_product?: string; reward_user_expects?: string
}
type Report = {
  product?: string; target?: string; market?: MarketRow[]; candidates?: Candidate[]
  applied_sales_logic?: Applied | null; recommended_video_id?: string | null
  recommendation_reason?: string; approval_request?: string
  provenance?: { keywords_analyzed?: number; keywords_advanced?: number; candidates_selected?: number; transcripts_fetched?: number; notes?: string[] }
}

const fmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString() : '—')
const pct = (r?: number) => (typeof r === 'number' ? `${Math.round(r * 100)}%` : '—')

const VERDICT_COLOR: Record<string, string> = {
  '진행 추천': 'var(--green-press)', '보류': 'var(--wood-3)', '제외': 'var(--ink-4)',
}
const FIT_COLOR: Record<string, string> = { '높음': 'var(--green-press)', '보통': 'var(--ink-3)', '낮음': 'var(--ink-4)' }
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

export default function KeyContentReportBoard({ projectId, cards, currentStatus, onRefresh }: {
  projectId: string
  cards: CmoCard[]
  currentStatus: string
  onRefresh: () => void
}) {
  const card = cards.find(c => c.stage === 'key_content_report')
  const report = card?.data as Report | undefined
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggered = useRef(false)

  const propose = async () => {
    if (loading) return
    setLoading(true); setError(null)
    try { await api.cmoProposeKeyContentReport(projectId); onRefresh() }
    catch (e) { setError(e instanceof Error ? e.message : '보고서 생성 실패') }
    finally { setLoading(false) }
  }

  // 진입 시 카드 없으면 자동 1회 생성.
  useEffect(() => {
    if (!card && !triggered.current && currentStatus === 'key_content_ideation') {
      triggered.current = true
      void propose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, currentStatus])

  const approve = async () => {
    if (approving) return
    setApproving(true); setError(null)
    try { await api.cmoAdvanceStatus(projectId); onRefresh() }
    catch (e) { setError(e instanceof Error ? e.message : '승인 실패'); setApproving(false) }
  }

  const box: React.CSSProperties = { border: '1px solid var(--silver-2)', borderRadius: 10, background: 'var(--paper-surface)', padding: 20 }

  if (!report) {
    return (
      <div style={{ ...box, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
        {loading
          ? '키 콘텐츠 기획 보고서 작성 중… (YouTube 시장성 분석 → 성과도/기여도 크롤 → 자막 판매논리 분석, 보통 5~15분)'
          : '키 콘텐츠 기획 보고서가 아직 없습니다.'}
        {!loading && (
          <button className="j-btn j-btn-secondary j-btn-sm" onClick={propose} style={{ marginLeft: 12 }}>보고서 생성</button>
        )}
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>
    )
  }

  const market = report.market ?? []
  const candidates = (report.candidates ?? []).slice().sort((a, b) => a.rank - b.rank)
  const top = candidates.find(c => c.topPick)
  const applied = report.applied_sales_logic ?? undefined

  return (
    <div style={box}>
      <div className="j-overline" style={{ marginBottom: 4 }}>키 콘텐츠 기획 보고서 (승인 2단계)</div>
      <p style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 0, marginBottom: 18 }}>
        키워드 {report.provenance?.keywords_analyzed ?? market.length}개 분석 · 진행 {report.provenance?.keywords_advanced ?? 0}개 ·
        후보 {candidates.length}개 · 자막 {report.provenance?.transcripts_fetched ?? 0}건 확보
      </p>

      {/* 1. 키워드 시장성 요약 */}
      <Section n={1} title="키워드 시장성 요약">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead><tr>
              {['키워드', '영상량', '평균 조회수', '상위 조회수', '롱폼', '타깃 정체성', '판매 연결', '판단'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {market.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--ink-1)' }}>{r.keyword}</td>
                  <td style={td}>{fmt(r.videoCount)}</td>
                  <td style={td}>{fmt(r.avgViews)}</td>
                  <td style={td}>{fmt(r.topViews)}</td>
                  <td style={td}>{pct(r.longformRatio)}</td>
                  <td style={{ ...td, color: FIT_COLOR[r.targetFit] ?? 'var(--ink-2)' }}>{r.targetFit}</td>
                  <td style={{ ...td, color: FIT_COLOR[r.salesLink] ?? 'var(--ink-2)' }}>{r.salesLink}</td>
                  <td style={{ ...td, fontWeight: 700, color: VERDICT_COLOR[r.verdict] ?? 'var(--ink-2)' }} title={r.verdictReason}>{r.verdict}</td>
                </tr>
              ))}
              {market.length === 0 && <tr><td style={td} colSpan={8}>분석된 키워드가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 2. 최종 선별 콘텐츠 3개 요약 */}
      <Section n={2} title="최종 선별 콘텐츠">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {candidates.map((c) => (
            <div key={c.videoId} style={{
              display: 'flex', gap: 12, padding: 10, borderRadius: 8,
              border: c.topPick ? '1.5px solid var(--green-press)' : '1px solid var(--silver-2)',
              background: c.topPick ? 'rgba(40,140,80,0.04)' : 'transparent',
            }}>
              <a href={c.url} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.thumbnailUrl} alt={c.title} width={132} height={74} style={{ borderRadius: 6, objectFit: 'cover', display: 'block' }} />
              </a>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--wood-3)' }}>#{c.rank}</span>
                  {c.topPick && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'var(--green-press)', borderRadius: 4, padding: '1px 6px' }}>최우선 추천</span>}
                  <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>키워드: {c.keyword}</span>
                </div>
                <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-1)', textDecoration: 'none', display: 'block', lineHeight: 1.4 }}>
                  {c.title}
                </a>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <span>{c.channelTitle}</span>
                  <span>조회수 {fmt(c.viewCount)}</span>
                  <span>성과도 <strong style={{ color: 'var(--ink-2)' }}>{c.performance ?? '-'}</strong></span>
                  <span>기여도 <strong style={{ color: 'var(--ink-2)' }}>{c.contribution ?? '-'}</strong></span>
                  <span>{c.transcriptAvailable ? '자막 ✓' : '자막 ✗'}</span>
                </div>
                {(c.identity_match || c.viewer_identity) && (
                  <div style={{ marginTop: 6 }}>
                    {c.identity_match && IDENTITY[c.identity_match] && (
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        color: IDENTITY[c.identity_match].color, background: IDENTITY[c.identity_match].bg,
                      }}>{IDENTITY[c.identity_match].label}</span>
                    )}
                    {c.viewer_identity && (
                      <span style={{ fontSize: 11.5, color: 'var(--ink-3)', marginLeft: 8 }}>
                        시청자: {c.viewer_identity}
                      </span>
                    )}
                    {c.identity_reason && (
                      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 3 }}>{c.identity_reason}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {candidates.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--ink-4)' }}>선별된 후보가 없습니다.</p>}
        </div>
      </Section>

      {/* 3. 콘텐츠별 수익화 구조 분석 */}
      {candidates.some(c => c.monetization) && (
        <Section n={3} title="콘텐츠별 수익화 구조 분석">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {candidates.map((c, i) => c.monetization && (
              <div key={c.videoId} style={{ border: '1px solid var(--silver-2)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-1)', marginBottom: 6 }}>콘텐츠 {i + 1} — {c.title}</div>
                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 4, columnGap: 10, fontSize: 12 }}>
                  {([
                    ['판매 상품/서비스', c.monetization.selling_product],
                    ['고정 댓글', c.monetization.pinned_comment],
                    ['본문 링크', c.monetization.description_links],
                    ['프로필 링크', c.monetization.profile_links],
                    ['이동 위치', c.monetization.moves_user_to],
                    ['수익화 방식', c.monetization.monetization_method],
                    ['우리 참고점', c.monetization.takeaway_for_us],
                  ] as [string, string | undefined][]).map(([k, val]) => (
                    <Fragment key={`${c.videoId}-${k}`}>
                      <dt style={{ color: 'var(--ink-4)' }}>{k}</dt>
                      <dd style={{ margin: 0, color: 'var(--ink-2)' }}>{val || '—'}</dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 4. 콘텐츠별 현상/욕구/계획/행동/보상 */}
      {candidates.some(c => c.funnel) && (
        <Section n={4} title="콘텐츠별 현상 / 욕구 / 계획 / 행동 / 보상">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead><tr>{['콘텐츠', '현상', '욕구', '계획', '행동', '보상'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {candidates.map((c, i) => (
                  <tr key={c.videoId}>
                    <td style={{ ...td, fontWeight: 600, color: 'var(--ink-1)', maxWidth: 160 }}>콘텐츠 {i + 1}</td>
                    <td style={td}>{c.funnel?.phenomenon || '—'}</td>
                    <td style={td}>{c.funnel?.desire || '—'}</td>
                    <td style={td}>{c.funnel?.plan || '—'}</td>
                    <td style={td}>{c.funnel?.action || '—'}</td>
                    <td style={td}>{c.funnel?.reward || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* 5. 우리 상품에 적용할 판매 논리 */}
      {applied && (
        <Section n={5} title="우리 상품에 적용할 판매 논리">
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '130px 1fr', rowGap: 6, columnGap: 10, fontSize: 13 }}>
            {([
              ['콘텐츠 주제', applied.content_topic],
              ['핵심 타깃', applied.core_target],
              ['타깃의 현상', applied.target_phenomenon],
              ['자극할 욕구', applied.desire_to_trigger],
              ['세우게 할 계획', applied.plan_user_makes],
              ['우리 상품 연결 행동', applied.action_to_our_product],
              ['기대 보상', applied.reward_user_expects],
            ] as [string, string | undefined][]).map(([k, val]) => (
              <Fragment key={k}>
                <dt style={{ color: 'var(--ink-4)', fontWeight: 600 }}>{k}</dt>
                <dd style={{ margin: 0, color: 'var(--ink-1)', lineHeight: 1.5 }}>{val || '—'}</dd>
              </Fragment>
            ))}
          </dl>
        </Section>
      )}

      {/* 6. 추천 콘텐츠 선정 이유 */}
      <Section n={6} title="추천 콘텐츠 선정 이유">
        {top && <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)', margin: '0 0 6px' }}>최우선 추천: {top.title}</p>}
        <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.6 }}>{report.recommendation_reason || '—'}</p>
      </Section>

      {/* 7. 최종 승인 요청 */}
      {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <div style={{ borderTop: '1px solid var(--silver-2)', paddingTop: 14, marginTop: 4 }}>
        <p style={{ fontSize: 13.5, color: 'var(--ink-1)', fontWeight: 600, marginBottom: 10 }}>
          {report.approval_request || '위 후보로 키 콘텐츠 기획을 확정해도 될까요?'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="j-btn j-btn-primary" onClick={approve} disabled={approving} style={{ flex: 1 }}>
            {approving ? '진행 중…' : '이대로 확정 → 다음 단계'}
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
