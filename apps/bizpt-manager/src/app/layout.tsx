import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '비즈니스 PT 매니저',
  description: '콘텐츠 수익화 운영 콘솔 — 지식베이스 12문서 기반',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
