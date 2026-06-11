'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import type { KeyContentCandidate } from '@/lib/api'
import { buildKeyContentReportHtml } from '../_lib/keyContentReport'

// ── 키 콘텐츠 단계 (재기획) ────────────────────────────────────────────────────
// 비전: 입력은 프로젝트 생성 시 1회(상품·타깃·목표 + 고객핵심문제 + 핵심제안).
// 이 단계 = CMO 자동분석(11스텝 순차) → 서로 다른 주제 후보 3개 제시 → 사장님 1개 선택.
// 각 후보 = 제목 + 썸네일 약속 + 선정이유 4종. 본문구조·도입방향·CTA는 제외(제작 단계로).
// UI는 LLM 진행단계만 표시 + 후보 카드 + 보고서 새창. 입력칸 없음(생성 시 이미 받음).
//
// 기존 11스텝 수동입력 UI(Step1~11, Viewtrap 수동입력)는 제작 단계로 이동 — 이번
// 범위에선 제거. runKeyContentWorkflow(서버측 분석)와 25 status·게이트는 보존.

const ANALYSIS_TOTAL = 8 // runKeyContentWorkflow progress 분모(분석 스텝 수).

const REASON_LABELS: { key: keyof KeyContentCandidate['selection_reasons']; label: string; accent: string }[] = [
  { key: 'viewtrap', label: 'Viewtrap 검색축', accent: 'var(--blue)' },
  { key: 'feature_benefit', label: '기능 · 특징 · 장점', accent: 'var(--wood-3)' },
  { key: 'customer_problem', label: '실제 사용자 문제', accent: 'var(--green)' },
  { key: 'funnel_application', label: '퍼널 적용', accent: 'var(--pi-butter)' },
]

function CandidateCard({
  candidate,
  index,
  onSelect,
  selecting,
  disabled,
}: {
  candidate: KeyContentCandidate
  index: number
  onSelect: () => void
  selecting: boolean
  disabled: boolean
}) {
  return (
    <div style={{
      border: '1px solid var(--silver-2)',
      borderLeft: '4px solid var(--wood-3)',
      borderRadius: 10,
      background: 'var(--paper-surface)',
      padding: 18,
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--wood-3)',
          padding: '3px 9px', borderRadius: 999, letterSpacing: '0.04em',
        }}>
          후보 {index + 1}
        </span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink-1)' }}>
          {candidate.title}
        </h3>
      </div>

      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 14 }}>
        <span style={{ fontWeight: 700, color: 'var(--ink-1)' }}>썸네일 약속</span> · {candidate.thumbnail_promise}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {REASON_LABELS.map(({ key, label, accent }) => (
          <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{
              flexShrink: 0, width: 132, fontSize: 11, fontWeight: 700, color: accent,
              textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 1,
            }}>
              {label}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {candidate.selection_reasons?.[key] ?? '—'}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="j-btn j-btn-primary j-btn-sm"
          onClick={onSelect}
          disabled={disabled}
        >
          {selecting ? '선택 중...' : '이 주제로 선택'}
        </button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function KeyContentPlanBoard({
  projectId,
  product,
  cards,
  onRefresh,
}: {
  projectId: string
  product?: string
  cards?: { stage?: string; data?: unknown }[]
  onRefresh: () => void
}) {
  const [proposing, setProposing] = useState(false)
  const [candidates, setCandidates] = useState<KeyContentCandidate[] | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const handlePropose = useCallback(async () => {
    setProposing(true)
    setError(null)
    setProgress(0)
    try {
      const res = await api.cmoProposeKeyContentDraft(projectId)
      setCandidates(res.candidates ?? [])
      setProgress(res.progress ?? ANALYSIS_TOTAL)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '초안 생성 실패')
    } finally {
      setProposing(false)
    }
  }, [projectId])

  // 진입 시: 이미 생성된 후보 카드가 있으면 그걸 로드(재호출 없음). 없으면 자동 1회 생성.
  const autoProposed = useRef(false)
  useEffect(() => {
    if (autoProposed.current || candidates) return
    autoProposed.current = true
    const existing = cards?.find(c => c.stage === 'key_content_candidates')
    const data = existing?.data as { candidates?: KeyContentCandidate[]; progress?: number } | undefined
    if (data?.candidates && data.candidates.length > 0) {
      setCandidates(data.candidates)
      setProgress(data.progress ?? ANALYSIS_TOTAL)
      return
    }
    void handlePropose()
  }, [candidates, handlePropose, cards])

  const handleSelect = useCallback(async (candidateId: string) => {
    setSelecting(candidateId)
    setError(null)
    try {
      await api.cmoSelectKeyContentCandidate(projectId, candidateId)
      setSelectedId(candidateId)
      onRefresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '주제 선택 실패')
    } finally {
      setSelecting(null)
    }
  }, [projectId, onRefresh])

  // 보고서 새 창: window.open 후 document.write. 팝업 차단 시 안내.
  const handleOpenReport = useCallback(() => {
    if (!candidates) return
    const html = buildKeyContentReportHtml(candidates, product ?? '키 콘텐츠')
    const win = window.open('', '_blank')
    if (!win) {
      setError('팝업이 차단되었습니다. 브라우저에서 이 사이트의 팝업을 허용해 주세요.')
      return
    }
    win.document.write(html)
    win.document.close()
  }, [candidates, product])

  // 진행 중: LLM 분석 단계/진행률만 크게 표시(입력칸 없음).
  if (proposing || (!candidates && !error)) {
    const pct = Math.round((progress / ANALYSIS_TOTAL) * 100)
    const stepLabel = progress >= ANALYSIS_TOTAL ? '후보 정리 중' : `Step ${Math.min(progress + 1, ANALYSIS_TOTAL)}`
    return (
      <div>
        <div className="j-overline" style={{ marginBottom: 16 }}>키 콘텐츠 기획</div>
        <div style={{
          border: '1px solid var(--silver-2)',
          borderRadius: 12,
          background: 'var(--paper-surface)',
          padding: '48px 32px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 8 }}>
            CMO 분석 중… {stepLabel}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 24 }}>
            상품과 고객 문제를 바탕으로 서로 다른 주제 후보 3개를 만들고 있습니다.
          </div>
          <div style={{ maxWidth: 320, margin: '0 auto', height: 8, borderRadius: 999, background: 'var(--silver-1)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)', transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>{pct}%</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div className="j-overline">키 콘텐츠 기획 · 주제 후보</div>
        <div style={{ flex: 1 }} />
        <button
          className="j-btn j-btn-secondary j-btn-sm"
          onClick={handleOpenReport}
          disabled={!candidates || candidates.length === 0}
        >
          📄 보고서 확인하기
        </button>
      </div>

      {error && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'var(--red-tint)', border: '1px solid var(--red)', borderRadius: 6,
          fontSize: 12.5, color: 'var(--red)',
        }}>
          {error}
          <button
            className="j-btn j-btn-secondary j-btn-sm"
            onClick={() => handlePropose()}
            style={{ marginLeft: 12 }}
          >
            다시 생성
          </button>
        </div>
      )}

      {selectedId && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          background: 'var(--p-green)', borderRadius: 6,
          fontSize: 12.5, color: 'var(--pi-green)', fontWeight: 600,
        }}>
          주제를 선택했습니다. 다음 단계(제작)로 진행합니다.
        </div>
      )}

      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 16 }}>
        CMO가 제안한 서로 다른 주제 후보 3개입니다. 1개를 선택하면 본문 구조·도입 방향·CTA는
        제작 단계에서 이어서 만듭니다.
      </div>

      {(candidates ?? []).map((c, i) => (
        <CandidateCard
          key={c.id}
          candidate={c}
          index={i}
          onSelect={() => handleSelect(c.id)}
          selecting={selecting === c.id}
          disabled={!!selecting || !!selectedId}
        />
      ))}

      {candidates && candidates.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
          후보가 생성되지 않았습니다.
          <button className="j-btn j-btn-secondary j-btn-sm" onClick={() => handlePropose()} style={{ marginLeft: 12 }}>
            다시 생성
          </button>
        </div>
      )}
    </div>
  )
}
