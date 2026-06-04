'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'

export default function LoginForm() {
  const { setToken } = useAuth()
  const [account, setAccount] = useState('admin@nocobase.com')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { token } = await api.signIn(account, password)
      setToken(token)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '로그인 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--paper-canvas)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--paper-elevated)',
          border: '1px solid var(--silver-2)',
          borderRadius: 10,
          padding: '36px 32px',
          width: 340,
          boxShadow: 'var(--shadow-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Brand mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--green)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-serif)',
              fontWeight: 700,
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            L
          </span>
          <span
            style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 600,
              fontSize: 17,
              color: 'var(--ink-1)',
              letterSpacing: '-0.01em',
            }}
          >
            L5 Business OS
          </span>
        </div>

        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--ink-3)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          운영 콘솔에 로그인하세요
        </p>

        {/* Hairline */}
        <div style={{ height: 1, background: 'var(--silver-2)', margin: '0 -4px' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="email"
            className="j-input"
            style={{ width: '100%' }}
            placeholder="이메일"
            value={account}
            autoComplete="email"
            onChange={e => setAccount(e.target.value)}
          />
          <input
            type="password"
            className="j-input"
            style={{ width: '100%' }}
            placeholder="비밀번호"
            value={password}
            autoComplete="current-password"
            onChange={e => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              color: 'var(--red)',
              background: 'var(--red-tint)',
              border: '1px solid var(--red)',
              borderRadius: 6,
              padding: '8px 12px',
              lineHeight: 1.4,
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="j-btn j-btn-primary j-btn-lg"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  )
}
