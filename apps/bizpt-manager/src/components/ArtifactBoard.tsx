'use client'
// FR-1 — 콘텐츠 정체성(식별 헤더) + 전 구역 산출물 보드.
// 모든 산출물은 어디에 표시되든 소속 콘텐츠(프로젝트 제목·키 주제·ID 8자·단계)를 함께 표시.
// 여러 콘텐츠가 섞이는 목록엔 프로젝트 필터 드롭다운 제공. 서버 join 응답(listArtifacts) 사용 — N+1 금지.
import React, { useCallback, useEffect, useState } from 'react'
import { api, type Artifact, type Project } from '@/lib/api'
import { label } from '@/lib/statuses'
import { cardName, renderCardKorean } from './CardRenderers'

export function IdentityHeader({ a, onOpen }: { a: Artifact; onOpen?: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
      <button
        onClick={() => onOpen?.(a.video_project_id)}
        style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 800, color: 'inherit' }}
        title="프로젝트 상세 열기"
      >
        {a.project_title || '(제목 없음)'}
      </button>
      {a.key_topic_title && <span style={{ fontSize: 11.5, color: '#2f6f4f', fontWeight: 700 }}>🔑 {a.key_topic_title}</span>}
      <span style={{ fontSize: 10.5, color: 'var(--muted, #7a8494)', fontFamily: 'monospace' }}>{a.video_project_id.slice(0, 8)}</span>
      {a.project_status && <span className="pill line" style={{ fontSize: 10.5 }}>{label(a.project_status)}</span>}
    </div>
  )
}

export function ArtifactBoard({
  stages,
  projects,
  emptyHint,
  onOpenProject,
}: {
  stages: string[]
  projects: Project[]
  emptyHint: string
  onOpenProject?: (id: string) => void
}) {
  const [items, setItems] = useState<Artifact[] | null>(null)
  const [filter, setFilter] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await api.listArtifacts(stages, filter || undefined)
      setItems(r?.artifacts ?? [])
      setErr('')
    } catch (e) {
      setErr(String(e).slice(0, 160))
      setItems([])
    }
  }, [stages.join(','), filter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1px solid #d8dee6' }}>
          <option value="">전체 콘텐츠 ({projects.length}개 프로젝트)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title || p.id.slice(0, 8)}</option>
          ))}
        </select>
        <span className="hint">산출물 {items?.length ?? '…'}건 · 최신순</span>
        <button className="btn g sm" onClick={load}>새로고침</button>
      </div>
      {err && <div className="card" style={{ borderLeft: '4px solid var(--danger, #d64545)', marginBottom: 10 }}><span className="hint">{err}</span></div>}
      {items && items.length === 0 && !err && <div className="card"><div className="hint">{emptyHint}</div></div>}
      {(items ?? []).map((a) => (
        <div className="card" key={a.id} style={{ marginBottom: 10 }}>
          <IdentityHeader a={a} onOpen={onOpenProject} />
          <div style={{ fontSize: 12.5, fontWeight: 700, margin: '2px 0' }}>{cardName(a.stage)} <span className="hint" style={{ fontWeight: 500 }}>{a.summary}</span></div>
          {renderCardKorean(a.stage, a.data)}
          <details style={{ marginTop: 4 }}>
            <summary style={{ fontSize: 11, color: 'var(--muted, #7a8494)', cursor: 'pointer' }}>원본 JSON (디버그)</summary>
            <pre style={{ fontSize: 10, background: '#f7f8fa', borderRadius: 8, padding: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 240, overflow: 'auto' }}>
              {JSON.stringify(a.data ?? {}, null, 2).slice(0, 4000)}
            </pre>
          </details>
        </div>
      ))}
    </div>
  )
}
