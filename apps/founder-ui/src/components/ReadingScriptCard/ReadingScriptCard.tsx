'use client'
import { useRef, useState, useCallback, useEffect } from 'react'

type Block = { type: string; text: string }

const BLOCK_STYLE: Record<string, React.CSSProperties> = {
  'scene-heading': { fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--silver-2)', paddingBottom: 8, marginBottom: 8 },
  character: { textAlign: 'center', fontWeight: 700, textTransform: 'uppercase', marginTop: 16 },
  parenthetical: { textAlign: 'center', fontStyle: 'italic', color: 'var(--ink-3)' },
  dialogue: { paddingLeft: 40, paddingRight: 40 },
}

export default function ReadingScriptCard({ blocks }: { blocks: Block[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const speedRef = useRef(1)
  const rafRef = useRef<number>(0)

  const tick = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    el.scrollTop += speedRef.current
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(rafRef.current)
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, tick])

  const toggle = useCallback(() => setIsPlaying(p => !p), [])
  const setSpeed = useCallback((s: number) => { speedRef.current = s }, [])

  return (
    <div style={{ border: '1px solid var(--silver-2)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--silver-1)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" onClick={toggle} className="j-btn j-btn-sm">
          {isPlaying ? '일시정지' : '재생'}
        </button>
        <select onChange={e => setSpeed(Number(e.target.value))} defaultValue="1" style={{ fontSize: 12 }}>
          <option value="0.5">0.5x</option>
          <option value="1">1x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
      </div>
      <div ref={containerRef} style={{ padding: '24px 20px', maxHeight: 400, overflowY: 'auto', fontSize: 18, lineHeight: 2 }}>
        {blocks.map((b, i) => (
          <div key={i} data-type={b.type} style={BLOCK_STYLE[b.type] ?? {}}>
            {b.text}
          </div>
        ))}
      </div>
    </div>
  )
}
