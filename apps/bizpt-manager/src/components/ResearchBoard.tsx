'use client'
// FR-2 — 뷰트랩 리서치 후보 판정 보드. 각 후보 행에 영상 실물 정보(썸네일·제목·채널·
// 조회수·게시일·성과도·기여도)와 판정(채택/제외)+사유 입력을 둔다.
// 데이터는 key_content_report / pulling_content_report 카드의 병합 레코드(videoId 보존).
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Artifact, type Project } from '@/lib/api'
import { IdentityHeader } from './ArtifactBoard'
import { VideoChip } from './CardRenderers'

type Judgment = { video_id: string; verdict: 'adopt' | 'exclude'; reason: string }

function CandidateRow({ projectId, v, judgment, onJudged, toast }: {
  projectId: string
  v: Record<string, any>
  judgment?: Judgment
  onJudged: () => void
  toast: (m: string) => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const decide = async (verdict: 'adopt' | 'exclude') => {
    if (!reason.trim() && !judgment) { toast('판정 사유를 입력해 주세요 — 산출물에 기록됩니다'); return }
    setBusy(true)
    try {
      await api.decideResearchCandidate(projectId, String(v.videoId ?? v.video_id), verdict, reason.trim() || (judgment?.reason ?? ''))
      toast(verdict === 'adopt' ? '채택 기록' : '제외 기록')
      setReason('')
      onJudged()
    } catch (e) { toast('판정 실패: ' + String(e).slice(0, 120)) } finally { setBusy(false) }
  }
  return (
    <div style={{ borderBottom: '1px solid #f2f4f6', paddingBottom: 6, marginBottom: 6 }}>
      <VideoChip v={v} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
        {judgment && (
          <span className={`pill ${judgment.verdict === 'adopt' ? 'ok' : 'line'}`} style={{ fontSize: 10.5 }}>
            {judgment.verdict === 'adopt' ? '✓ 채택' : '✗ 제외'} — {judgment.reason}
          </span>
        )}
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="판정 사유"
          style={{ flex: 1, minWidth: 160, fontSize: 11.5, padding: '5px 8px', borderRadius: 8, border: '1px solid #d8dee6' }} />
        <button className="btn p sm" disabled={busy} onClick={() => decide('adopt')}>채택</button>
        <button className="btn g sm" disabled={busy} onClick={() => decide('exclude')}>제외</button>
      </div>
    </div>
  )
}

export function ResearchBoard({ projects, onOpenProject, toast }: {
  projects: Project[]
  onOpenProject?: (id: string) => void
  toast: (m: string) => void
}) {
  const [items, setItems] = useState<Artifact[] | null>(null)
  const [judgmentCards, setJudgmentCards] = useState<Artifact[]>([])
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    try {
      const [r, j] = await Promise.all([
        api.listArtifacts(['key_content_report', 'pulling_content_report'], filter || undefined),
        api.listArtifacts(['research_judgments'], filter || undefined),
      ])
      setItems(r?.artifacts ?? [])
      setJudgmentCards(j?.artifacts ?? [])
    } catch { setItems([]) }
  }, [filter])
  useEffect(() => { load() }, [load])

  const judgments = useMemo(() => {
    const m = new Map<string, Judgment>()
    for (const c of judgmentCards) {
      const js = (c.data as any)?.judgments
      if (Array.isArray(js)) for (const j of js) m.set(`${c.video_project_id}:${j.video_id}`, j)
    }
    return m
  }, [judgmentCards])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1px solid #d8dee6' }}>
          <option value="">전체 콘텐츠</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title || p.id.slice(0, 8)}</option>)}
        </select>
        <span className="hint">리서치 보고서 {items?.length ?? '…'}건 — 후보별 실물 정보 + 판정(채택/제외·사유 기록)</span>
      </div>
      {items && items.length === 0 && <div className="card"><div className="hint">아직 리서치 보고서가 없습니다 — 프로젝트가 리서치 단계를 지나면 여기서 후보를 판정합니다.</div></div>}
      {(items ?? []).map((a) => {
        const d = a.data as any
        const candidates: any[] = a.stage === 'key_content_report'
          ? (Array.isArray(d?.candidates) ? d.candidates : [])
          : (Array.isArray(d?.topics) ? d.topics.flatMap((t: any) => t.evidence_videos ?? []) : [])
        return (
          <div className="card" key={a.id} style={{ marginBottom: 12 }}>
            <IdentityHeader a={a} onOpen={onOpenProject} />
            <div style={{ fontSize: 12.5, fontWeight: 700, margin: '2px 0 8px' }}>
              {a.stage === 'key_content_report' ? '키 콘텐츠 리서치 후보' : '풀링 리서치 근거 영상'} {candidates.length}건
            </div>
            {candidates.slice(0, 12).map((v, i) => (
              <CandidateRow key={`${v.videoId ?? i}`} projectId={a.video_project_id} v={v}
                judgment={judgments.get(`${a.video_project_id}:${v.videoId ?? v.video_id}`)}
                onJudged={load} toast={toast} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
