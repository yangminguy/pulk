'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

// 🔔 호랑이 실시간 장애 벨. 종모양 + 미해결 장애 수 빨강 배지.
// 백그라운드 실행이 멈추거나 실패하면 사장님이 모른 채 기다리지 않도록,
// 미해결(resolved/escalated 제외) 장애 수를 폴링해 빨강 배지로 알린다.
// 클릭하면 장애 목록·승인 페이지(/incidents)로 이동.
export default function Bell() {
  const router = useRouter()
  const [count, setCount] = useState(0)

  const load = async () => {
    try {
      const items = await api.listIncidents()
      setCount(items.length)
    } catch {
      setCount(0)
    }
  }

  // 30s 폴링 — 장애가 발생하면 사장님이 수동 새로고침 없이 배지로 인지.
  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <button
      type="button"
      onClick={() => router.push('/incidents')}
      aria-label={count > 0 ? `장애 ${count}건` : '장애 없음'}
      className="fixed top-2.5 z-40 flex items-center justify-center"
      style={{
        top: 10, right: 56, // 기존 알림 벨(우측 10px) 왼쪽에 배치
        width: 38, height: 38, borderRadius: 8,
        background: 'var(--paper-elevated)',
        border: count > 0 ? '1px solid var(--red)' : '1px solid var(--silver-2)',
        color: count > 0 ? 'var(--red)' : 'var(--ink-1)',
        boxShadow: 'var(--shadow-2, 0 1px 3px rgba(0,0,0,0.08))',
        cursor: 'pointer',
        position: 'fixed',
      }}
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span style={{
          position: 'absolute', top: 4, right: 4,
          minWidth: 15, height: 15, padding: '0 4px', borderRadius: 999,
          background: 'var(--red)', color: '#fff',
          fontSize: 9.5, fontWeight: 700, lineHeight: '15px', textAlign: 'center',
          fontFamily: 'var(--font-mono)',
        }}>
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}
