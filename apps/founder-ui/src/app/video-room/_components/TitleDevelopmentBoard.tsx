'use client'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import type {
  TitleDevelopmentReferenceInput,
  TitleDevelopmentRun,
  FinalTitleEvaluation,
} from '@/lib/api'

// ── 제목 디벨롭 8단계 보드 (PRD cmo-title-development §22) ─────────────────────
// thumbnail_pattern_extraction 단계 내부에서 동작. Viewtrap 검증 레퍼런스 2개를
// 입력받아 서버(l5-core runTitleDevelopmentWorkflow)가 교차조합→2~8단계→평가를 수행.
// 이 컴포넌트는 도메인 로직 없이 산출물(run)을 표시만 한다(전역 규칙: UI에 도메인 로직 금지).

type RefDraft = {
  title: string
  url: string
  view_count: string
  performance_grade: 'Good' | 'Great'
  contribution_grade: 'Good' | 'Great'
  thumbnail_text: string
  thumbnail_structure: string
  topic: string
  topic_similarity: 'exact' | 'expanded_same_meaning'
  similarity_reason: string
  selected_reason: string
}

const emptyRef = (): RefDraft => ({
  title: '',
  url: '',
  view_count: '',
  performance_grade: 'Good',
  contribution_grade: 'Good',
  thumbnail_text: '',
  thumbnail_structure: '',
  topic: '',
  topic_similarity: 'exact',
  similarity_reason: '',
  selected_reason: '',
})

function toReference(d: RefDraft, idx: number): TitleDevelopmentReferenceInput {
  return {
    id: `ref-${idx + 1}`,
    research_session_id: 'manual-input',
    source: 'viewtrap',
    url: d.url.trim() || undefined,
    title: d.title.trim(),
    thumbnail_text: d.thumbnail_text.trim(),
    thumbnail_structure: d.thumbnail_structure.trim(),
    topic: d.topic.trim(),
    view_count: d.view_count ? Number(d.view_count) : 0,
    performance_grade: d.performance_grade,
    contribution_grade: d.contribution_grade,
    topic_similarity: d.topic_similarity,
    similarity_reason: d.similarity_reason.trim(),
    selected_reason: d.selected_reason.trim(),
  }
}

const LABEL = { color: 'var(--ink-3)', fontSize: 11, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }

function RefEditor({ idx, draft, onChange }: { idx: number; draft: RefDraft; onChange: (d: RefDraft) => void }) {
  const set = (k: keyof RefDraft, val: string) => onChange({ ...draft, [k]: val })
  return (
    <div style={{ border: '1px solid var(--silver-2)', borderRadius: 8, padding: 14, background: 'var(--paper-surface)' }}>
      <div style={{ ...LABEL, marginBottom: 10 }}>레퍼런스 {idx + 1}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="j-input" placeholder="영상 제목" value={draft.title} onChange={e => set('title', e.target.value)} />
        <input className="j-input" placeholder="썸네일 문구" value={draft.thumbnail_text} onChange={e => set('thumbnail_text', e.target.value)} />
        <input className="j-input" placeholder="썸네일 구조 (예: 인물+화살표+숫자)" value={draft.thumbnail_structure} onChange={e => set('thumbnail_structure', e.target.value)} />
        <input className="j-input" placeholder="주제" value={draft.topic} onChange={e => set('topic', e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="j-input" style={{ flex: 1 }} placeholder="조회수 (5만 이상)" type="number" value={draft.view_count} onChange={e => set('view_count', e.target.value)} />
          <input className="j-input" style={{ flex: 1 }} placeholder="URL (선택)" value={draft.url} onChange={e => set('url', e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, ...LABEL }}>성과도
            <select className="j-input" value={draft.performance_grade} onChange={e => set('performance_grade', e.target.value)} style={{ marginTop: 4, width: '100%' }}>
              <option value="Good">Good</option><option value="Great">Great</option>
            </select>
          </label>
          <label style={{ flex: 1, ...LABEL }}>기여도
            <select className="j-input" value={draft.contribution_grade} onChange={e => set('contribution_grade', e.target.value)} style={{ marginTop: 4, width: '100%' }}>
              <option value="Good">Good</option><option value="Great">Great</option>
            </select>
          </label>
          <label style={{ flex: 1.4, ...LABEL }}>주제 유사도
            <select className="j-input" value={draft.topic_similarity} onChange={e => set('topic_similarity', e.target.value)} style={{ marginTop: 4, width: '100%' }}>
              <option value="exact">정확히 같음</option><option value="expanded_same_meaning">확장(같은 의미)</option>
            </select>
          </label>
        </div>
        {draft.topic_similarity === 'expanded_same_meaning' && (
          <input className="j-input" placeholder="확장 사유 (AC-06 필수)" value={draft.similarity_reason} onChange={e => set('similarity_reason', e.target.value)} />
        )}
        <input className="j-input" placeholder="선택 이유" value={draft.selected_reason} onChange={e => set('selected_reason', e.target.value)} />
      </div>
    </div>
  )
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ width: 92, color: 'var(--ink-3)' }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: 'var(--silver-1)', borderRadius: 3 }}>
        <div style={{ width: `${Math.round((value / max) * 100)}%`, height: '100%', background: 'var(--wood-3)', borderRadius: 3 }} />
      </div>
      <span style={{ width: 44, textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>{value}/{max}</span>
    </div>
  )
}

function FinalCandidate({ ev, selected }: { ev: FinalTitleEvaluation; selected: boolean }) {
  const recColor = ev.recommendation === 'upload_candidate' ? 'var(--green)' : ev.recommendation === 'revise' ? 'var(--wood-3)' : 'var(--red)'
  const recLabel = ev.recommendation === 'upload_candidate' ? '업로드 후보' : ev.recommendation === 'revise' ? '수정 권장' : '레퍼런스 재검색'
  return (
    <div style={{ border: '1px solid var(--silver-2)', borderLeft: `4px solid ${selected ? 'var(--green)' : 'var(--silver-2)'}`, borderRadius: 8, padding: 14, marginBottom: 10, background: 'var(--paper-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--ink-1)' }}>{ev.title}</span>
        {selected && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--pi-green)', background: 'var(--p-green)', padding: '2px 8px', borderRadius: 999 }}>최종 추천</span>}
        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: recColor, padding: '2px 8px', borderRadius: 999 }}>{recLabel}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--ink-1)' }}>{ev.total_score}점</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
        <ScoreBar label="타겟 적합" value={ev.target_fit} max={20} />
        <ScoreBar label="욕망 선명" value={ev.desire_clarity} max={20} />
        <ScoreBar label="문제 지적" value={ev.problem_sharpness} max={20} />
        <ScoreBar label="호기심" value={ev.curiosity_gap} max={15} />
        <ScoreBar label="원고 일치" value={ev.script_match} max={15} />
        <ScoreBar label="썸네일 결합" value={ev.thumbnail_fit} max={10} />
      </div>
      {ev.reason && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>{ev.reason}</div>}
      {ev.risks?.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>위험: {ev.risks.join(' · ')}</div>
      )}
    </div>
  )
}

export default function TitleDevelopmentBoard({
  projectId,
  cards,
  onRefresh,
}: {
  projectId: string
  cards?: { stage?: string; data?: unknown }[]
  onRefresh: () => void
}) {
  const [ref1, setRef1] = useState<RefDraft>(emptyRef())
  const [ref2, setRef2] = useState<RefDraft>(emptyRef())
  const [pullingTopic, setPullingTopic] = useState('')
  const [running, setRunning] = useState(false)
  const [run, setRun] = useState<TitleDevelopmentRun | null>(null)
  const [failed, setFailed] = useState<{ reference_id: string; reasons: string[] }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fallbackCount, setFallbackCount] = useState(0)

  // 진입 시: 이미 생성된 title_development 카드가 있으면 로드.
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current || run) return
    loaded.current = true
    const existing = cards?.find(c => c.stage === 'title_development')
    if (existing?.data) setRun(existing.data as TitleDevelopmentRun)
  }, [cards, run])

  const handleRun = async () => {
    setRunning(true)
    setError(null)
    setFailed(null)
    try {
      const res = await api.cmoProposeTitleDevelopment(
        projectId,
        [toReference(ref1, 0), toReference(ref2, 1)],
        pullingTopic.trim() ? { pulling_topic: pullingTopic.trim() } : undefined,
      )
      if (res.ok) {
        setRun(res.run)
        setFallbackCount(res.fallback_count)
        onRefresh()
      } else {
        setFailed(res.failed_references)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '제목 디벨롭 실행 실패')
    } finally {
      setRunning(false)
    }
  }

  const canRun = ref1.title.trim() && ref1.thumbnail_text.trim() && ref2.title.trim() && ref2.thumbnail_text.trim() && !running

  return (
    <div>
      <div className="j-overline" style={{ marginBottom: 8 }}>제목 디벨롭 · 8단계</div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.6, marginBottom: 14 }}>
        같은 주제의 Viewtrap 레퍼런스 2개(조회수 5만 이상, 성과도·기여도 Good 또는 Great)를 입력하면
        교차 조합 후 8단계 디벨롭으로 최종 제목·썸네일 방향을 만듭니다. 결과는 Hook/원고 승인에서 함께 확인합니다.
      </p>

      {!run && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="j-input" placeholder="풀링 주제 (비우면 확정 풀링 플랜 첫 주제 사용)" value={pullingTopic} onChange={e => setPullingTopic(e.target.value)} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <RefEditor idx={0} draft={ref1} onChange={setRef1} />
            <RefEditor idx={1} draft={ref2} onChange={setRef2} />
          </div>
          {failed && (
            <div style={{ padding: '10px 14px', background: 'var(--red-tint)', border: '1px solid var(--red)', borderRadius: 6, fontSize: 12.5, color: 'var(--red)' }}>
              레퍼런스 조건 미충족 — 추가 레퍼런스가 필요합니다:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {failed.map(f => <li key={f.reference_id}>{f.reference_id}: {f.reasons.join(', ')}</li>)}
              </ul>
            </div>
          )}
          {error && (
            <div style={{ padding: '10px 14px', background: 'var(--red-tint)', border: '1px solid var(--red)', borderRadius: 6, fontSize: 12.5, color: 'var(--red)' }}>{error}</div>
          )}
          <button onClick={handleRun} disabled={!canRun} className="j-btn j-btn-primary" style={{ alignSelf: 'flex-end' }}>
            {running ? '디벨롭 중… (8단계)' : '제목 디벨롭 실행'}
          </button>
        </div>
      )}

      {run && (
        <div>
          {/* 최종 추천 */}
          <div style={{ border: '1px solid var(--green)', borderRadius: 10, padding: 16, background: 'var(--p-green)', marginBottom: 16 }}>
            <div style={{ ...LABEL, marginBottom: 6 }}>최종 추천 제목</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink-1)', marginBottom: 6 }}>{run.selected_title}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>썸네일 방향: {run.selected_thumbnail_direction}</div>
            {fallbackCount > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--wood-3)', marginTop: 6 }}>※ {fallbackCount}개 단계가 결정론 폴백으로 처리됨 — 수동 확인 권장</div>
            )}
          </div>

          {/* 최종 평가 패널 */}
          <div style={{ ...LABEL, margin: '8px 0' }}>최종 평가 (100점 기준)</div>
          {run.final_candidates.map((ev, i) => (
            <FinalCandidate key={i} ev={ev} selected={ev.title === run.selected_title} />
          ))}

          {/* 교차 조합 보드 */}
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', ...LABEL }}>교차 조합 ({run.combinations.length})</summary>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {run.combinations.map(c => (
                <div key={c.id} style={{ fontSize: 12.5, padding: '8px 10px', border: '1px solid var(--silver-2)', borderRadius: 6, background: 'var(--paper-surface)', opacity: c.passed ? 1 : 0.55 }}>
                  <span style={{ fontWeight: 600 }}>{c.title_draft}</span>
                  <span style={{ color: 'var(--ink-4)' }}> · {c.combination_type}</span>
                  {c.selected_for_next_step && <span style={{ color: 'var(--green)', marginLeft: 6 }}>→ 다음 단계</span>}
                  {!c.passed && c.awkwardness_reason && <div style={{ color: 'var(--red)', marginTop: 2 }}>어색: {c.awkwardness_reason}</div>}
                </div>
              ))}
            </div>
          </details>

          {/* 8단계 타임라인 */}
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', ...LABEL }}>디벨롭 타임라인 ({run.step_results.length}단계)</summary>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {run.step_results.map(s => (
                <div key={s.step_number} style={{ fontSize: 12.5, padding: '8px 10px', border: '1px solid var(--silver-2)', borderRadius: 6, background: 'var(--paper-surface)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink-1)' }}>{s.step_number}. {s.step_name}</div>
                  <div style={{ color: 'var(--ink-3)', marginTop: 2 }}>{s.method_explanation}</div>
                  <div style={{ color: 'var(--ink-2)', marginTop: 2 }}>출력: {s.output_titles.join(' / ')}</div>
                  {s.rejected_titles.length > 0 && (
                    <div style={{ color: 'var(--ink-4)', marginTop: 2 }}>버림: {s.rejected_titles.map(r => `${r.title}(${r.reason})`).join(', ')}</div>
                  )}
                </div>
              ))}
            </div>
          </details>

          <button onClick={() => { setRun(null); loaded.current = true }} className="j-btn j-btn-secondary j-btn-sm" style={{ marginTop: 14 }}>
            레퍼런스 다시 입력
          </button>
        </div>
      )}
    </div>
  )
}
