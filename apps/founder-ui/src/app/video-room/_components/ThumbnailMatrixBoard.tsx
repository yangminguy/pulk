'use client'
import { useState, useMemo, useEffect } from 'react'
import { api } from '@/lib/api'
import type { ThumbnailMatrixResult, ThumbnailMatrixCandidate, ThumbnailPsychologyAnalysis } from '@/lib/api'

// ── 썸네일 9개 A/B(PRD cmo-thumbnail-ab-automation) Stage A+B ──────────────────
// 비전: 확정 영상 정보 → 9개 매트릭스 후보(이미지전략×문구전략) + 후보별 클릭 심리분석.
// 사장님은 G1 게이트에서 9개 세트를 승인. (도메인 로직은 서버 l5-core, UI는 표시·승인만)

const IMG_LABEL: Record<string, string> = { zoom: '확대', evidence: '증거', empathy: '공감' }
const TXT_LABEL: Record<string, string> = { gain: '이득', loss_avoidance: '손해회피', curiosity: '궁금증' }

function Badge({ children, tone }: { children: React.ReactNode; tone: 'img' | 'txt' | 'slot' }) {
  const bg = tone === 'slot' ? 'var(--ink-1)' : tone === 'img' ? 'var(--green)' : 'var(--wood-3)'
  return (
    <span style={{
      flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#fff', background: bg,
      padding: '2px 8px', borderRadius: 999, letterSpacing: '0.02em',
    }}>{children}</span>
  )
}

function CandidateCard({ c, a }: { c: ThumbnailMatrixCandidate; a?: ThumbnailPsychologyAnalysis }) {
  return (
    <div style={{
      border: '1px solid var(--silver-2)', borderRadius: 10, background: 'var(--paper-surface)',
      padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Badge tone="slot">{c.slot}</Badge>
        <Badge tone="img">{IMG_LABEL[c.image_strategy] ?? c.image_strategy}</Badge>
        <Badge tone="txt">{TXT_LABEL[c.text_strategy] ?? c.text_strategy}</Badge>
        {a && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
            명료도 {a.click_reason_clarity_score}
          </span>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-1)', lineHeight: 1.4 }}>
        “{c.thumbnail_text}”
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--ink-3)' }}>클릭 가설</b> · {c.click_hypothesis}
      </div>
      {c.image_composition && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>🖼 {c.image_composition}</div>
      )}
      {a && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5, borderTop: '1px dashed var(--silver-2)', paddingTop: 7 }}>
          🧠 {a.combined_click_psychology}
        </div>
      )}
    </div>
  )
}

type CardLike = { stage?: string; data?: unknown }

export default function ThumbnailMatrixBoard({
  projectId,
  cards,
  onRefresh,
}: {
  projectId: string
  cards: CardLike[]
  onRefresh?: () => void
}) {
  const [title, setTitle] = useState('')
  const [reason, setReason] = useState('')
  const [prefilled, setPrefilled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // 워크플로우 자동 프리필: 확정 키 콘텐츠(key_content_choice) 카드에서 제목·클릭이유를 끌어온다.
  // 사장님이 직접 타이핑하지 않아도 되게(승인중심). 비어있을 때만 1회 채운다.
  useEffect(() => {
    if (prefilled) return
    const choice = [...cards].reverse().find(c => c.stage === 'key_content_choice')
    const d = choice && (typeof choice.data === 'string' ? safeParse(choice.data) : choice.data)
    const cd = d as { key_topic_title?: string; selected?: { title?: string; thumbnail_promise?: string; main_click_reason?: string } } | null
    if (cd) {
      const t = cd.key_topic_title ?? cd.selected?.title ?? ''
      const r = cd.selected?.main_click_reason ?? cd.selected?.thumbnail_promise ?? ''
      if (t && !title) setTitle(t)
      if (r && !reason) setReason(r)
      if (t || r) setPrefilled(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards])

  // 기존 thumbnail_matrix 카드(있으면) 렌더.
  const existing = useMemo<ThumbnailMatrixResult | null>(() => {
    const card = [...cards].reverse().find(c => c.stage === 'thumbnail_matrix')
    if (!card) return null
    const d = typeof card.data === 'string' ? safeParse(card.data) : card.data
    const r = d as ThumbnailMatrixResult | null
    return r && Array.isArray(r.candidates) ? r : null
  }, [cards])

  const analysisById = useMemo(() => {
    const m = new Map<string, ThumbnailPsychologyAnalysis>()
    existing?.analyses?.forEach(a => m.set(a.candidate_id, a))
    return m
  }, [existing])

  const generate = async () => {
    if (!title.trim() || !reason.trim()) { setErr('제목과 클릭 이유를 입력하세요.'); return }
    setLoading(true); setErr('')
    try {
      await api.cmoProposeThumbnailMatrix({ project_id: projectId, title: title.trim(), main_click_reason: reason.trim() })
      onRefresh?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 12 }}>
        9개 썸네일을 <b>서로 다른 클릭 가설</b>로 만들고(이미지전략 3 × 문구전략 3), 각 후보의 클릭 심리를 분석합니다.
        3개씩 A/B 테스트해 이기는 방향을 강화합니다.
      </div>

      {/* 생성/재생성 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {prefilled && (
          <div style={{ fontSize: 12, color: 'var(--green-press)', fontFamily: 'var(--font-mono)' }}>
            ✓ 확정 키 콘텐츠에서 자동 입력됨 — 필요하면 수정 후 생성하세요.
          </div>
        )}
        <input className="j-input" placeholder="확정 영상 제목" value={title} onChange={e => setTitle(e.target.value)} />
        <input className="j-input" placeholder="이 영상을 클릭해야 하는 단 하나의 이유" value={reason} onChange={e => setReason(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="j-btn j-btn-primary" onClick={generate} disabled={loading}>
            {loading ? '생성 중…' : existing ? '9개 기획안 재생성' : '9개 기획안 생성'}
          </button>
          {err && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{err}</span>}
        </div>
      </div>

      {/* 9개 후보 그리드 */}
      {existing ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>9개 기획안</span>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              {existing.source === 'fallback' ? '결정론 초안' : 'AI 생성'} · {existing.candidates.length}개
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {existing.candidates.map(c => (
              <CandidateCard key={c.candidate_id} c={c} a={analysisById.get(c.candidate_id)} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '12px 0' }}>
          아직 생성된 기획안이 없습니다. 위에서 “9개 기획안 생성”을 눌러 시작하세요.
        </div>
      )}
    </div>
  )
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}
