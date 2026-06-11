'use client'
import { useState, useMemo, useEffect } from 'react'
import { api } from '@/lib/api'
import type {
  ThumbnailMatrixResult,
  ThumbnailMatrixCandidate,
  ThumbnailPsychologyAnalysis,
  ThumbnailReviewResult,
  ThumbnailDevelopResult,
  ThumbnailReferenceLearningResult,
} from '@/lib/api'

// ── 썸네일 9개 A/B(PRD cmo-thumbnail-ab-automation) Stage A+B+E ────────────────
// 비전: 확정 영상 정보 → 9개 매트릭스 후보(이미지전략×문구전략) + 후보별 클릭 심리분석.
// Stage E(검수): 데드존/작은화면/글자수/폰트/시청층 경고 — 판정은 전부 서버(l5-core).
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

// 시청층 정합 배지 — 서버 판정(fit)을 색으로만 매핑(녹/갈/적/회).
export function AudienceFitBadge({ fit, reason }: { fit?: string; reason?: string }) {
  if (!fit) return null
  const color = fit === 'match' ? 'var(--green)' : fit === 'partial' ? 'var(--wood-3)' : fit === 'mismatch' ? 'var(--red)' : 'var(--ink-4)'
  const label = fit === 'match' ? '시청층 정합' : fit === 'partial' ? '시청층 부분 정합' : fit === 'mismatch' ? '시청층 불일치' : '시청층 미확인'
  return (
    <span title={reason} style={{
      fontSize: 11, fontWeight: 700, color: '#fff', background: color,
      padding: '2px 8px', borderRadius: 999, flexShrink: 0,
    }}>{label}</span>
  )
}

// 검수 결과 표시 — 경고 리스트 + 체크리스트(접이식) + 시청층 정합 배지.
export function ReviewResultView({ review }: { review: ThumbnailReviewResult }) {
  const warnings = review.warnings ?? []
  const checklist = review.checklist ?? []
  return (
    <div style={{ borderTop: '1px dashed var(--silver-2)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>검수 결과</span>
        <AudienceFitBadge fit={review.audience_fit?.fit} reason={review.audience_fit?.reason} />
      </div>
      {review.audience_fit?.reason && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>{review.audience_fit.reason}</div>
      )}
      {warnings.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {warnings.map((w, i) => (
            <li key={i} style={{ fontSize: 12, color: 'var(--red)', lineHeight: 1.5 }}>{w}</li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--green-press, var(--green))' }}>✓ 경고 없음</div>
      )}
      {checklist.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>
            체크리스트 ({checklist.length})
          </summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {checklist.map((c, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{c}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

// 디벨롭 결과 표시 — 6기술 제안 + 문구 후보 + 개선 판정(전부 서버 산출물).
function DevelopResultView({ dev }: { dev: ThumbnailDevelopResult }) {
  const suggestions = dev.suggestions ?? []
  const texts = dev.text_candidates ?? []
  return (
    <div style={{ borderTop: '1px dashed var(--silver-2)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>디벨롭 제안</span>
      {dev.improvement && (
        <div style={{
          fontSize: 12, lineHeight: 1.5, padding: '6px 8px', borderRadius: 6,
          background: dev.improvement.improved ? 'var(--p-green, var(--bg-inset))' : 'var(--bg-inset)',
          color: 'var(--ink-2)',
        }}>
          <b>{dev.improvement.improved ? '개선됨' : '개선 판정'}</b>
          {dev.improvement.recommendation && <> · {dev.improvement.recommendation}</>}
          {dev.improvement.reason && <div style={{ color: 'var(--ink-3)', marginTop: 2 }}>{dev.improvement.reason}</div>}
        </div>
      )}
      {texts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {texts.map((t, i) => (
            <div key={i} style={{ fontSize: 12.5, lineHeight: 1.5, padding: '5px 8px', border: '1px solid var(--silver-2)', borderRadius: 6 }}>
              <span style={{ fontWeight: 700, color: 'var(--ink-1)' }}>“{t.text}”</span>
              {t.technique && <span style={{ color: 'var(--ink-4)' }}> · {t.technique}</span>}
              {typeof t.char_count === 'number' && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: t.over_limit ? 'var(--red)' : 'var(--ink-3)', marginLeft: 6 }}>
                  {t.char_count}자{t.over_limit ? ' · 초과' : ''}
                </span>
              )}
              {t.warning && <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 2 }}>{t.warning}</div>}
              {t.shortened_candidate && <div style={{ color: 'var(--ink-3)', fontSize: 11.5, marginTop: 2 }}>축약안: “{t.shortened_candidate}”</div>}
            </div>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>
            기술별 제안 ({suggestions.length})
          </summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {suggestions.map((s, i) => (
              <li key={i} style={{ fontSize: 12, lineHeight: 1.5, color: s.applicable === false ? 'var(--ink-4)' : 'var(--ink-2)' }}>
                <b>{s.technique}</b>{s.applicable === false ? ' (해당 없음)' : ''}{s.suggestion ? ` — ${s.suggestion}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function CandidateCard({
  c,
  a,
  projectId,
  audienceProfile,
}: {
  c: ThumbnailMatrixCandidate
  a?: ThumbnailPsychologyAnalysis
  projectId: string
  audienceProfile: string
}) {
  const [review, setReview] = useState<ThumbnailReviewResult | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [dev, setDev] = useState<ThumbnailDevelopResult | null>(null)
  const [developing, setDeveloping] = useState(false)
  const [actionErr, setActionErr] = useState('')

  const runReview = async () => {
    setReviewing(true); setActionErr('')
    try {
      const res = await api.cmoReviewThumbnail({
        project_id: projectId,
        candidate: { thumbnail_text: c.thumbnail_text, design_notes: c.design_notes || undefined },
        channel_audience_profile: audienceProfile.trim() || undefined,
      })
      setReview(res ?? {})
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : '검수 실패')
    } finally {
      setReviewing(false)
    }
  }

  const runDevelop = async () => {
    setDeveloping(true); setActionErr('')
    try {
      const res = await api.cmoDevelopThumbnailCandidate({
        project_id: projectId,
        candidate: { thumbnail_text: c.thumbnail_text, image_composition: c.image_composition || undefined },
      })
      setDev(res ?? {})
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : '디벨롭 실패')
    } finally {
      setDeveloping(false)
    }
  }

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

      {/* Stage E — 검수/디벨롭 (판정은 서버, 여기선 호출·표시만) */}
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button className="j-btn j-btn-secondary j-btn-sm" onClick={runReview} disabled={reviewing}>
          {reviewing ? '검수 중…' : '검수'}
        </button>
        <button className="j-btn j-btn-secondary j-btn-sm" onClick={runDevelop} disabled={developing}>
          {developing ? '디벨롭 중…' : '디벨롭'}
        </button>
      </div>
      {actionErr && <div style={{ fontSize: 11.5, color: 'var(--red)' }}>{actionErr}</div>}
      {review && <ReviewResultView review={review} />}
      {dev && <DevelopResultView dev={dev} />}
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
  // Stage E — 채널 시청층 프로필(선택). 검수 호출에 그대로 전달, 판정은 서버.
  const [audienceProfile, setAudienceProfile] = useState('')
  // 레퍼런스 학습 결과 표시.
  const [learning, setLearning] = useState(false)
  const [learned, setLearned] = useState<ThumbnailReferenceLearningResult | null>(null)
  const [learnErr, setLearnErr] = useState('')

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

  const learnReferences = async () => {
    setLearning(true); setLearnErr('')
    try {
      const res = await api.cmoLearnThumbnailReferences({ project_id: projectId })
      setLearned(res ?? {})
    } catch (e) {
      setLearnErr(e instanceof Error ? e.message : '레퍼런스 학습 실패')
    } finally {
      setLearning(false)
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
        <input
          className="j-input"
          placeholder="채널 시청층 프로필 (선택 — 예: 40대 자영업자, 절세에 민감) · 검수 시 시청층 정합 판정에 사용"
          value={audienceProfile}
          onChange={e => setAudienceProfile(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="j-btn j-btn-primary" onClick={generate} disabled={loading}>
            {loading ? '생성 중…' : existing ? '9개 기획안 재생성' : '9개 기획안 생성'}
          </button>
          <button className="j-btn j-btn-secondary" onClick={learnReferences} disabled={learning}>
            {learning ? '학습 중…' : '레퍼런스 학습'}
          </button>
          {err && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{err}</span>}
          {learnErr && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{learnErr}</span>}
        </div>
        {learned && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, padding: '8px 10px', border: '1px solid var(--silver-2)', borderRadius: 6, background: 'var(--bg-inset)' }}>
            ✓ 레퍼런스 학습 완료 — 패턴 {learned.patterns?.length ?? 0}개
            {typeof learned.eligible_count === 'number' && <> (적격 {learned.eligible_count}건)</>}
            {learned.notes && <div style={{ color: 'var(--ink-3)', marginTop: 2 }}>{learned.notes}</div>}
            <div style={{ color: 'var(--ink-4)', marginTop: 2 }}>학습된 패턴은 다음 매트릭스 생성 시 자동 반영됩니다.</div>
          </div>
        )}
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
              <CandidateCard
                key={c.candidate_id}
                c={c}
                a={analysisById.get(c.candidate_id)}
                projectId={projectId}
                audienceProfile={audienceProfile}
              />
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
