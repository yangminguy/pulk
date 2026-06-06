'use client'
import { useState, useRef, useEffect } from 'react'
import Icon from '@/components/Icon'
import { api } from '@/lib/api'
import type { CmoMessage } from '../_lib/types'

// ── CMO Chat Panel ───────────────────────────────────────────────────────────
type LocalMsg = {
  role: 'founder' | 'cmo'
  text: string
  ready_to_advance?: boolean
}

export default function CmoChatPanel({
  projectId,
  initialMessages,
  onRefresh,
}: {
  projectId: string
  initialMessages: CmoMessage[]
  onRefresh: () => void
}) {
  const [messages, setMessages] = useState<LocalMsg[]>(
    initialMessages.map(m => ({ role: m.role, text: m.text, ready_to_advance: m.ready_to_advance }))
  )
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setErr(null)
    setSending(true)
    setMessages(m => [...m, { role: 'founder', text }])
    try {
      const res = await api.cmoChatMessage(projectId, text)
      setMessages(m => [...m, { role: 'cmo', text: res.reply, ready_to_advance: res.ready_to_advance }])
      onRefresh()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '전송 실패')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="j-overline" style={{ marginBottom: 8 }}>CMO Chat</div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 48, color: 'var(--ink-4)' }}>
            <div style={{ fontSize: 13 }}>CMO와 영상 전략을 논의하세요</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'founder' ? 'flex-end' : 'flex-start' }}>
            {msg.role === 'founder' ? (
              <div style={{
                maxWidth: '80%',
                background: 'var(--paper-elevated)',
                border: '1px solid var(--silver-2)',
                borderRadius: '12px 12px 3px 12px',
                padding: '10px 13px',
                fontSize: 13.5,
                color: 'var(--ink-1)',
                lineHeight: 1.55,
              }}>
                {msg.text}
              </div>
            ) : (
              <div style={{
                maxWidth: '92%',
                background: 'var(--paper-surface)',
                border: '1px solid var(--silver-2)',
                borderLeft: '3px solid var(--wood-3)',
                borderRadius: '3px 12px 12px 3px',
                padding: '10px 13px',
                fontSize: 13.5,
                color: 'var(--ink-1)',
                lineHeight: 1.55,
              }}>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 3,
                      background: 'var(--wood-3)', color: '#fff',
                      fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-mono)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>CM</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>CMO Agent</span>
                  </span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div style={{
            background: 'var(--paper-surface)',
            border: '1px solid var(--silver-2)',
            borderLeft: '3px solid var(--wood-3)',
            borderRadius: '3px 12px 12px 3px',
            padding: '10px 13px',
            fontSize: 13,
            color: 'var(--ink-3)',
            maxWidth: '60%',
          }}>
            CMO 분석 중...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {err && (
        <div style={{
          fontSize: 12, color: 'var(--red)', marginBottom: 8,
          padding: '5px 9px', background: 'var(--red-tint)', borderRadius: 4,
        }}>
          {err}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="j-input"
          style={{ flex: 1, borderRadius: 999, padding: '9px 16px', fontSize: 13 }}
          placeholder="CMO에게 메시지..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          disabled={sending}
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="j-btn j-btn-primary j-btn-sm"
          style={{ borderRadius: 999, padding: '0 16px' }}
        >
          <Icon name="send" size={13} stroke={1.8} />
        </button>
      </div>
    </div>
  )
}
