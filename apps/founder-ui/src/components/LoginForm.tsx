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
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={handleSubmit} className="bg-slate-800 p-8 rounded-xl w-80 space-y-4">
        <h1 className="text-xl font-bold">L5 Business OS</h1>
        <input
          className="w-full bg-slate-700 rounded px-3 py-2 text-sm"
          placeholder="이메일"
          value={account}
          onChange={e => setAccount(e.target.value)}
        />
        <input
          type="password"
          className="w-full bg-slate-700 rounded px-3 py-2 text-sm"
          placeholder="비밀번호"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  )
}
