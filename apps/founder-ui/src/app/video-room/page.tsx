'use client'
import AuthGate from '@/components/AuthGate'
import ThreeColumnLayout from '@/components/ThreeColumnLayout'
import ReadingScriptCard from '@/components/ReadingScriptCard/ReadingScriptCard'

function VideoRoomContent() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
      }}
    >
      <section
        style={{
          padding: '24px clamp(20px, 4vw, 48px) 0',
          maxWidth: 1120,
          margin: '0 auto',
        }}
      >
        <p className="j-overline" style={{ marginBottom: 8 }}>CMO</p>
        <h1 className="j-h1" style={{ margin: '0 0 16px', color: 'var(--ink-1)' }}>
          Video Room
        </h1>
      </section>
      <ThreeColumnLayout
        left={
          <div>
            <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>
              영상 프로젝트 목록이 여기에 표시됩니다.
            </p>
          </div>
        }
        center={
          <div>
            <ReadingScriptCard blocks={[]} />
            <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 12 }}>
              영상을 선택하면 미리보기가 여기에 표시됩니다.
            </p>
          </div>
        }
        right={
          <div>
            <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>
              설정 및 발행 옵션이 여기에 표시됩니다.
            </p>
          </div>
        }
      />
    </main>
  )
}

export default function VideoRoomPage() {
  return <AuthGate><VideoRoomContent /></AuthGate>
}
