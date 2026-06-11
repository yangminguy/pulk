'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import type {
  TitleDevelopmentRun,
  FinalTitleEvaluation,
  ThumbnailMatrixResult,
  ThumbnailMatrixCandidate,
  ThumbnailReviewResult,
  HookAlignmentResult,
} from '@/lib/api'
import type { CmoCard, Intro30sData } from '../_lib/types'
import { ReviewResultView } from './ThumbnailMatrixBoard'

// ── 승인③ 통합 보드 (hook_draft_approval) ─────────────────────────────────────
// 사장님 지시: "검증 게이트에서 썸네일이랑 제목 나한테 같이 보여주면 돼 — 썸네일 후보들,
// 제목 후보들. 내가 최종 확인할게."
// 한 화면 3섹션: ① 제목 후보(택1) ② 썸네일 후보(택1 + 검수) ③ 도입부 + 강도 정합.
// 점수·판정은 전부 서버(l5-core) 산출물을 표시만 한다(전역 규칙: UI에 도메인 로직 금지).

const LABEL = { color: 'var(--ink-3)', fontSize: 11, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
const SECTION: React.CSSProperties = {
  border: '1px solid var(--silver-2)', borderRadius: 10, background: 'var(--paper-surface)',
  padding: 16, marginBottom: 14,
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}

function cardData<T>(cards: CmoCard[], stage: string): T | null {
  const card = [...cards].reverse().find(c => c.stage === stage)
  if (!card) return null
  const d = typeof card.data === 'string' ? safeParse(card.data) : card.data
  return (d as T) ?? null
}

// ── 제목 후보 행 — 서버 점수표(FinalTitleEvaluation)를 그대로 표시 ───────────────
function TitleRow({ ev, recommended, checked, onSelect }: {
  ev: FinalTitleEvaluation
  recommended: boolean
  checked: boolean
  onSelect: () => void
}) {
  const recColor = ev.recommendation === 'upload_candidate' ? 'var(--green)' : ev.recommendation === 'revise' ? 'var(--wood-3)' : 'var(--red)'
  const recLabel = ev.recommendation === 'upload_candidate' ? '업로드 후보' : ev.recommendation === 'revise' ? '수정 권장' : '레퍼런스 재검색'
  const scores: Array<[string, number | undefined]> = [
    ['타겟', ev.target_fit], ['욕망', ev.desire_clarity], ['문제', ev.problem_sharpness],
    ['호기심', ev.curiosity_gap], ['원고', ev.script_match], ['썸네일', ev.thumbnail_fit],
  ]
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
      border: '1px solid var(--silver-2)', borderLeft: `4px solid ${checked ? 'var(--green)' : 'var(--silver-2)'}`,
      borderRadius: 8, padding: 12, background: 'var(--bg-surface, var(--paper-surface))',
    }}>
      <input type="radio" name="hook-title" checked={checked} onChange={onSelect} style={{ marginTop: 3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-1)' }}>{ev.title}</span>
          {recommended && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--pi-green, var(--green))', background: 'var(--p-green, var(--bg-inset))', padding: '2px 8px', borderRadius: 999 }}>CMO 추천</span>}
          {ev.recommendation && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: recColor, padding: '2px 8px', borderRadius: 999 }}>{recLabel}</span>}
          {typeof ev.total_score === 'number' && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--ink-1)', marginLeft: 'auto' }}>{ev.total_score}점</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          {scores.filter(([, v]) => typeof v === 'number').map(([k, v]) => (
            <span key={k} style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{k} {v}</span>
          ))}
        </div>
        {ev.thumbnail_direction && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>썸네일 방향: {ev.thumbnail_direction}</div>
        )}
        {ev.reason && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.5 }}>{ev.reason}</div>}
      </div>
    </label>
  )
}

// ── 썸네일 후보 카드 — 택1 라디오 + 검수(서버 판정 표시) ─────────────────────────
const IMG_LABEL: Record<string, string> = { zoom: '확대', evidence: '증거', empathy: '공감' }
const TXT_LABEL: Record<string, string> = { gain: '이득', loss_avoidance: '손해회피', curiosity: '궁금증' }

function ThumbRow({ c, projectId, checked, onSelect }: {
  c: ThumbnailMatrixCandidate
  projectId: string
  checked: boolean
  onSelect: () => void
}) {
  const [review, setReview] = useState<ThumbnailReviewResult | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [err, setErr] = useState('')

  const runReview = async () => {
    setReviewing(true); setErr('')
    try {
      const res = await api.cmoReviewThumbnail({
        project_id: projectId,
        candidate: { thumbnail_text: c.thumbnail_text, design_notes: c.design_notes || undefined },
      })
      setReview(res ?? {})
    } catch (e) {
      setErr(e instanceof Error ? e.message : '검수 실패')
    } finally {
      setReviewing(false)
    }
  }

  return (
    <div style={{
      border: '1px solid var(--silver-2)', borderLeft: `4px solid ${checked ? 'var(--green)' : 'var(--silver-2)'}`,
      borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 7,
      background: 'var(--bg-surface, var(--paper-surface))',
    }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexWrap: 'wrap' }}>
        <input type="radio" name="hook-thumb" checked={checked} onChange={onSelect} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--ink-1)', padding: '2px 8px', borderRadius: 999 }}>{c.slot}</span>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          {(IMG_LABEL[c.image_strategy] ?? c.image_strategy)} × {(TXT_LABEL[c.text_strategy] ?? c.text_strategy)}
        </span>
        <button
          className="j-btn j-btn-secondary j-btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={e => { e.preventDefault(); runReview() }}
          disabled={reviewing}
        >
          {reviewing ? '검수 중…' : '검수'}
        </button>
      </label>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-1)', lineHeight: 1.4 }}>“{c.thumbnail_text}”</div>
      {c.image_composition && <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>🖼 {c.image_composition}</div>}
      <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--ink-3)' }}>클릭 가설</b> · {c.click_hypothesis}
      </div>
      {err && <div style={{ fontSize: 11.5, color: 'var(--red)' }}>{err}</div>}
      {review && <ReviewResultView review={review} />}
    </div>
  )
}

// ── 강도 정합 배지 — 서버 status를 색으로만 매핑(aligned=녹/intro_weaker=노/그 외 회) ─
function AlignmentBadge({ a }: { a: HookAlignmentResult }) {
  const color = a.status === 'aligned' ? 'var(--green)' : a.status === 'intro_weaker' ? 'var(--wood-3)' : 'var(--ink-4)'
  const label = a.status === 'aligned' ? '강도 정합' : a.status === 'intro_weaker' ? '도입부가 더 약함' : '데이터 부족'
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: color, padding: '2px 10px', borderRadius: 999, flexShrink: 0 }}>
      {label}
    </span>
  )
}

export default function HookApprovalBoard({
  projectId,
  cards,
  onRefresh,
}: {
  projectId: string
  cards: CmoCard[]
  onRefresh: () => void
}) {
  // ① 제목 후보 — title_development 카드(서버 산출물).
  const run = useMemo(() => cardData<TitleDevelopmentRun>(cards, 'title_development'), [cards])
  const titleCandidates = run?.final_candidates ?? []

  // ② 썸네일 후보 — thumbnail_matrix 카드(서버 산출물).
  const matrix = useMemo(() => {
    const r = cardData<ThumbnailMatrixResult>(cards, 'thumbnail_matrix')
    return r && Array.isArray(r.candidates) ? r : null
  }, [cards])
  const thumbCandidates = matrix?.candidates ?? []

  // ③ 도입부 — intro_30s 카드.
  const intro = useMemo(() => cardData<Intro30sData>(cards, 'intro_30s'), [cards])
  const introText = intro?.intro_script_30s ?? intro?.first_sentence ?? ''

  // 선택 상태 — 제목은 CMO 추천을 기본 선택.
  const [selectedTitle, setSelectedTitle] = useState<string>('')
  const [selectedThumbId, setSelectedThumbId] = useState<string>('')
  useEffect(() => {
    if (!selectedTitle && run?.selected_title) setSelectedTitle(run.selected_title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  // 강도 정합 — 마운트 시 1회 서버 호출(채점은 서버, 여기선 배지 표시만).
  const [alignment, setAlignment] = useState<HookAlignmentResult | null>(null)
  const [alignErr, setAlignErr] = useState('')
  const alignCalled = useRef(false)
  useEffect(() => {
    if (alignCalled.current) return
    alignCalled.current = true
    api.cmoEvaluateHookAlignment(projectId)
      .then(res => setAlignment(res ?? null))
      .catch(e => setAlignErr(e instanceof Error ? e.message : '정합 평가 실패'))
  }, [projectId])

  // 승인 — 선택 결과를 카드로 저장 후 기존 stage gate 승인 흐름 재사용(approveStageGate).
  const [approving, setApproving] = useState(false)
  const [approveErr, setApproveErr] = useState('')
  const selectedThumb = thumbCandidates.find(c => c.candidate_id === selectedThumbId) ?? null
  const canApprove = !!selectedTitle && !!selectedThumb && !approving

  const approve = async () => {
    if (!selectedTitle || !selectedThumb) return
    setApproving(true); setApproveErr('')
    try {
      await api.cmoSaveCard({
        project_id: projectId,
        stage: 'hook_final_choice',
        summary: `승인③ 최종 선택 — 제목: ${selectedTitle} / 썸네일 ${selectedThumb.slot}: ${selectedThumb.thumbnail_text}`,
        data: {
          selected_title: selectedTitle,
          selected_thumbnail_candidate_id: selectedThumb.candidate_id,
          selected_thumbnail_slot: selectedThumb.slot,
          selected_thumbnail_text: selectedThumb.thumbnail_text,
          hook_alignment: alignment ?? undefined,
        },
      })
      await api.cmoApproveStageGate(projectId)
      onRefresh()
    } catch (e) {
      setApproveErr(e instanceof Error ? e.message : '승인 실패')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div>
      <div className="j-overline" style={{ marginBottom: 8 }}>승인③ — Hook 최종 확인 (제목 + 썸네일 + 도입부)</div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 14 }}>
        제목 후보와 썸네일 후보를 한 화면에서 확인하고 각각 하나씩 선택하세요. 도입부 강도 정합까지 확인한 뒤
        승인하면 원고 단계로 진행합니다.
      </p>

      {/* ① 제목 후보 */}
      <div style={SECTION}>
        <div style={{ ...LABEL, marginBottom: 10 }}>① 제목 후보 (택1)</div>
        {titleCandidates.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {titleCandidates.map((ev, i) => (
              <TitleRow
                key={i}
                ev={ev}
                recommended={ev.title === run?.selected_title}
                checked={selectedTitle === ev.title}
                onSelect={() => setSelectedTitle(ev.title)}
              />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
            제목 디벨롭 결과가 없습니다. 이전 단계의 “제목 디벨롭” 보드에서 먼저 생성하세요.
          </div>
        )}
      </div>

      {/* ② 썸네일 후보 */}
      <div style={SECTION}>
        <div style={{ ...LABEL, marginBottom: 10 }}>② 썸네일 후보 (택1 · 검수 가능)</div>
        {thumbCandidates.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {thumbCandidates.map(c => (
              <ThumbRow
                key={c.candidate_id}
                c={c}
                projectId={projectId}
                checked={selectedThumbId === c.candidate_id}
                onSelect={() => setSelectedThumbId(c.candidate_id)}
              />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
            썸네일 매트릭스 결과가 없습니다. 이전 단계의 “썸네일 9개 A/B” 보드에서 먼저 생성하세요.
          </div>
        )}
      </div>

      {/* ③ 도입부 + 강도 정합 */}
      <div style={SECTION}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={LABEL}>③ 도입부 + 강도 정합</span>
          {alignment && <AlignmentBadge a={alignment} />}
          {alignment && typeof alignment.thumbnail_score === 'number' && typeof alignment.intro_score === 'number' && (
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              썸네일 {alignment.thumbnail_score} · 도입부 {alignment.intro_score}
            </span>
          )}
        </div>
        {alignment?.status === 'intro_weaker' && (
          <div style={{ fontSize: 12.5, color: 'var(--wood-3)', lineHeight: 1.6, padding: '8px 10px', border: '1px solid var(--wood-3)', borderRadius: 6, marginBottom: 10 }}>
            ⚠ {alignment.warning ?? '도입부 강도가 썸네일보다 약합니다.'}
            {alignment.recommended_action && <div style={{ marginTop: 2 }}>권장: {alignment.recommended_action}</div>}
          </div>
        )}
        {alignment?.status === 'insufficient_data' && (
          <div style={{ fontSize: 12, color: 'var(--ink-4)', marginBottom: 10 }}>
            {alignment.warning ?? '정합 판정에 필요한 데이터가 부족합니다.'}
          </div>
        )}
        {alignErr && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{alignErr}</div>}
        {introText ? (
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', background: 'var(--bg-inset)', borderRadius: 6, padding: 12 }}>
            {introText}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>도입부 30초 카드가 아직 없습니다.</div>
        )}
        {intro?.promise && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>약속: {intro.promise}</div>}
        {intro?.curiosity_gap && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>호기심 갭: {intro.curiosity_gap}</div>}
      </div>

      {/* 하단 — 선택 요약 + 승인 */}
      <div style={{
        border: '1px solid var(--silver-2)', borderLeft: '4px solid var(--green)', borderRadius: 8,
        padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        background: 'var(--bg-surface, var(--paper-surface))',
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-1)' }}>
            제목: {selectedTitle || <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>미선택</span>}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-1)', marginTop: 2 }}>
            썸네일: {selectedThumb
              ? `${selectedThumb.slot} · “${selectedThumb.thumbnail_text}”`
              : <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>미선택</span>}
          </div>
        </div>
        <button className="j-btn j-btn-primary" onClick={approve} disabled={!canApprove}>
          {approving ? '승인 중…' : '이 조합으로 승인하고 원고 단계로'}
        </button>
      </div>
      {approveErr && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 8 }}>{approveErr}</div>}
    </div>
  )
}
