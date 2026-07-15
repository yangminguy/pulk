'use client'
// FR-6 — 승인 센터. 승인 대기 항목만 모아, 각 항목을 펼치면 해당 게이트의 리포트가
// 인라인으로 렌더되어 그 자리에서 검토 → 승인/반려/수정요청까지 끝낸다.
// 리포트 카드가 없으면 승인 버튼 비활성 + "리포트 생성 대기" 표시 (서버도 동일 강제).
import React, { useCallback, useEffect, useState } from 'react'
import { api, type Project, type ProjectDetail, type Card } from '@/lib/api'
import { isGate, label } from '@/lib/statuses'
import { cardName, renderCardKorean, DocFrame } from './CardRenderers'

// 게이트 status → 검토 리포트 카드 stage (l5-core GATE_REQUIRED_REPORT_STAGES와 동기).
const GATE_REPORT_STAGES: Record<string, string[]> = {
  key_content_approval: ['key_content_plan_doc'],
  pulling_content_set_approval: ['pulling_plan_doc'],
  hook_draft_approval: ['title_development', 'thumbnail_plan'],
  script_approval: ['script_draft'],
  video_qa_approval: ['qa'],
  upload_approval: ['upload_draft'],
}

const GATE_TITLES: Record<string, string> = {
  key_content_approval: '① 키 콘텐츠 기획 승인',
  pulling_content_set_approval: '② 풀링 콘텐츠 승인',
  hook_draft_approval: '③ 훅 승인 (제목·썸네일)',
  script_approval: '④ 원고 승인',
  video_qa_approval: '⑤ 영상 승인',
  upload_approval: '⑥ 게시 승인',
}

function latestByStage(cards: Card[], stage: string): Card | undefined {
  return cards.filter((c) => (c as any).stage === stage).slice(-1)[0]
}

function GateItem({ p, onDone, toast }: { p: Project; onDone: () => void; toast: (m: string) => void }) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try { setDetail(await api.getProject(p.id)) } catch { /* 표시만 실패 */ }
  }, [p.id])
  useEffect(() => { if (open && !detail) load() }, [open, detail, load])

  const required = GATE_REPORT_STAGES[p.status] ?? []
  const cards = (detail?.cards ?? []) as Card[]
  const reportCards = required.map((s) => latestByStage(cards, s))
  const ready = detail ? reportCards.every(Boolean) : false
  const missing = detail ? required.filter((_, i) => !reportCards[i]) : []

  const approve = async () => {
    setBusy(true)
    try {
      const r = await api.approveStageGate(p.id)
      toast(`승인 완료 → ${label(r.status)}`)
      onDone()
    } catch (e) { toast('승인 실패: ' + String(e).slice(0, 140)) } finally { setBusy(false) }
  }
  const reject = async (decision: 'needs_revision' | 'rejected') => {
    if (!note.trim()) { toast('반려/수정요청은 사유를 입력해야 합니다 (재작업 입력이 됩니다)'); return }
    setBusy(true)
    try {
      await api.rejectStageGate(p.id, decision, note.trim())
      toast(decision === 'needs_revision' ? '수정 요청 기록 완료' : '반려 기록 완료')
      setNote('')
      onDone()
    } catch (e) { toast('처리 실패: ' + String(e).slice(0, 140)) } finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="pill gate">{GATE_TITLES[p.status] ?? label(p.status)}</span>
        <b style={{ fontSize: 13 }}>{p.title || '(제목 없음)'}</b>
        <span style={{ fontSize: 10.5, color: 'var(--muted, #7a8494)', fontFamily: 'monospace' }}>{p.id.slice(0, 8)}</span>
        <span style={{ flex: 1 }} />
        <button className="btn g sm" onClick={() => setOpen((o) => !o)}>{open ? '접기' : '리포트 검토 →'}</button>
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          {!detail && <div className="hint">리포트 불러오는 중…</div>}
          {detail && !ready && (
            <div style={{ background: 'var(--gate-soft, #fdf6e7)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#8a5a12', fontWeight: 700 }}>
              리포트 생성 대기 — 필요한 산출물: {missing.map(cardName).join(', ')}. 생성 완료 전에는 승인할 수 없습니다.
            </div>
          )}
          {detail && reportCards.filter(Boolean).map((c) => {
            const card = c as Card & { stage?: string; data?: unknown }
            const stage = String(card.stage ?? '')
            const data = (card as any).data
            const html = data && typeof data === 'object' && typeof (data as any).html === 'string' ? String((data as any).html) : null
            return (
              <div key={card.id} style={{ margin: '10px 0' }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 4 }}>{cardName(stage)}</div>
                {html ? <DocFrame html={html} /> : (renderCardKorean(stage, data) ?? (
                  <pre style={{ fontSize: 10.5, background: '#f7f8fa', borderRadius: 8, padding: 8, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>
                    {JSON.stringify(data ?? {}, null, 2).slice(0, 3000)}
                  </pre>
                ))}
              </div>
            )
          })}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn p" disabled={busy || !ready} title={ready ? '' : '리포트 생성 대기'} onClick={approve}>
              {busy ? '처리 중…' : `✓ 승인하고 다음으로`}
            </button>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="반려/수정 사유 (재작업 입력으로 전달)"
              style={{ flex: 1, minWidth: 220, fontSize: 12, padding: '7px 10px', borderRadius: 8, border: '1px solid #d8dee6' }}
            />
            <button className="btn g sm" disabled={busy} onClick={() => reject('needs_revision')}>수정 요청</button>
            <button className="btn g sm" disabled={busy} onClick={() => reject('rejected')}>반려</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ApprovalCenter({ projects, reload, toast }: { projects: Project[]; reload: () => void; toast: (m: string) => void }) {
  const gates = projects.filter((p) => isGate(p.status))
  return (
    <div>
      <div className="sect">승인 대기 {gates.length}건 <span className="kbref">사장님이 관여하는 6개 게이트만 모입니다 — 리포트 검토 → 승인/반려가 한 화면에서 끝납니다</span></div>
      {gates.length === 0 && <div className="card"><div className="hint">승인 대기 항목이 없습니다.</div></div>}
      {gates.map((p) => <GateItem key={p.id} p={p} onDone={reload} toast={toast} />)}
    </div>
  )
}
