'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import type { ScriptBeat } from '../_lib/types'

// ── ScriptBeatEditor — editable beat table for stage 'script' ───────────────
export default function ScriptBeatEditor({
  projectId,
  initialBeats,
  onRefresh,
}: {
  projectId: string
  initialBeats: ScriptBeat[]
  onRefresh: () => void
}) {
  const [beats, setBeats] = useState<ScriptBeat[]>(
    initialBeats.length > 0
      ? initialBeats
      : [{ scene_id: '1', scene_type: 'hook', rhythm_role: '', headline: '', speaker_text: '', duration: 30 }]
  )
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  const updateBeat = (i: number, field: keyof ScriptBeat, value: string | number) => {
    setBeats(prev => prev.map((b, idx) => idx === i ? { ...b, [field]: value } : b))
    setSaveOk(false)
  }

  const addBeat = () => {
    setBeats(prev => [
      ...prev,
      {
        scene_id: String(prev.length + 1),
        scene_type: 'content',
        rhythm_role: '',
        headline: '',
        speaker_text: '',
        duration: 30,
      },
    ])
    setSaveOk(false)
  }

  const removeBeat = (i: number) => {
    setBeats(prev => prev.filter((_, idx) => idx !== i))
    setSaveOk(false)
  }

  const save = async () => {
    setSaving(true)
    setSaveErr(null)
    setSaveOk(false)
    try {
      await api.cmoSaveScript(projectId, beats)
      setSaveOk(true)
      onRefresh()
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      border: '1px solid var(--silver-2)',
      borderLeft: '4px solid var(--green)',
      borderRadius: 8,
      background: 'var(--paper-surface)',
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--silver-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          원고 (장면 Beat)
        </span>
        <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{beats.length}장면</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '80px 90px 1fr 1fr 60px 32px',
          background: 'var(--bg-inset)',
          borderBottom: '1px solid var(--silver-2)',
          minWidth: 600,
        }}>
          {['장면 ID', '유형', '헤드라인', '대사', '길이(초)', ''].map((h, i) => (
            <div key={i} style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: '0.04em', borderLeft: i > 0 ? '1px solid var(--silver-2)' : undefined }}>
              {h}
            </div>
          ))}
        </div>

        {/* Table rows */}
        {beats.map((beat, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '80px 90px 1fr 1fr 60px 32px',
            borderBottom: '1px solid var(--silver-1)',
            background: i % 2 === 1 ? 'var(--silver-1)' : 'transparent',
            minWidth: 600,
            alignItems: 'start',
          }}>
            <div style={{ padding: '6px 6px', borderLeft: undefined }}>
              <input
                className="j-input"
                style={{ fontSize: 12, padding: '3px 6px', width: '100%' }}
                value={beat.scene_id}
                onChange={e => updateBeat(i, 'scene_id', e.target.value)}
              />
            </div>
            <div style={{ padding: '6px 6px', borderLeft: '1px solid var(--silver-1)' }}>
              <input
                className="j-input"
                style={{ fontSize: 12, padding: '3px 6px', width: '100%' }}
                value={beat.scene_type}
                onChange={e => updateBeat(i, 'scene_type', e.target.value)}
                placeholder="hook / content / cta"
              />
            </div>
            <div style={{ padding: '6px 6px', borderLeft: '1px solid var(--silver-1)' }}>
              <input
                className="j-input"
                style={{ fontSize: 12, padding: '3px 6px', width: '100%' }}
                value={beat.headline}
                onChange={e => updateBeat(i, 'headline', e.target.value)}
                placeholder="장면 제목"
              />
            </div>
            <div style={{ padding: '6px 6px', borderLeft: '1px solid var(--silver-1)' }}>
              <textarea
                className="j-input"
                style={{ fontSize: 12, padding: '3px 6px', width: '100%', resize: 'vertical', minHeight: 56, lineHeight: 1.5 }}
                value={beat.speaker_text}
                onChange={e => updateBeat(i, 'speaker_text', e.target.value)}
                placeholder="대사 텍스트"
              />
            </div>
            <div style={{ padding: '6px 6px', borderLeft: '1px solid var(--silver-1)' }}>
              <input
                className="j-input"
                style={{ fontSize: 12, padding: '3px 6px', width: '100%' }}
                type="number"
                value={beat.duration}
                min={1}
                onChange={e => updateBeat(i, 'duration', Number(e.target.value))}
              />
            </div>
            <div style={{ padding: '6px 4px', borderLeft: '1px solid var(--silver-1)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
              <button
                onClick={() => removeBeat(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', fontSize: 14, padding: '2px 4px', lineHeight: 1 }}
                title="삭제"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={addBeat} className="j-btn j-btn-secondary j-btn-sm">
          + 장면 추가
        </button>
        {saveErr && (
          <span style={{ fontSize: 12, color: 'var(--red)', padding: '3px 8px', background: 'var(--red-tint)', borderRadius: 4 }}>
            {saveErr}
          </span>
        )}
        {saveOk && (
          <span style={{ fontSize: 12, color: 'var(--green)', padding: '3px 8px', background: 'var(--p-green)', borderRadius: 4 }}>
            저장 완료
          </span>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="j-btn j-btn-sm"
          style={{ marginLeft: 'auto', background: 'var(--p-green)', color: 'var(--green)', border: '1px solid var(--green)', fontWeight: 600 }}
        >
          {saving ? '저장 중...' : '원고 저장'}
        </button>
      </div>
    </div>
  )
}
