'use client'

const AGENT_PASTEL: Record<string, { bg: string; fg: string }> = {
  CMO: { bg: 'var(--p-lav)', fg: 'var(--pi-lav)' },
  CRO: { bg: 'var(--p-sky)', fg: 'var(--pi-sky)' },
  CPO: { bg: 'var(--p-mint)', fg: 'var(--pi-mint)' },
  CTO: { bg: 'var(--p-butter)', fg: 'var(--pi-butter)' },
  COO: { bg: 'var(--p-peach)', fg: 'var(--pi-peach)' },
  CFO: { bg: 'var(--p-sand)', fg: 'var(--pi-sand)' },
  RiskQA: { bg: 'var(--p-rose)', fg: 'var(--pi-rose)' },
  CEO: { bg: 'var(--p-lav)', fg: 'var(--pi-lav)' },
  ChiefOfStaff: { bg: 'var(--p-peach)', fg: 'var(--pi-peach)' },
}

const AGENT_CHIP: Record<string, { bg: string; fg: string }> = {
  CMO: { bg: 'var(--p-lav)', fg: 'var(--pi-lav)' },
  CRO: { bg: 'var(--p-sky)', fg: 'var(--pi-sky)' },
  CPO: { bg: 'var(--p-mint)', fg: 'var(--pi-mint)' },
  CTO: { bg: 'var(--p-sky)', fg: 'var(--pi-sky)' },
  COO: { bg: 'var(--p-peach)', fg: 'var(--pi-peach)' },
  CFO: { bg: 'var(--p-butter)', fg: 'var(--pi-butter)' },
  RiskQA: { bg: 'var(--p-rose)', fg: 'var(--pi-rose)' },
  CEO: { bg: 'var(--p-sand)', fg: 'var(--pi-sand)' },
}

export const EXECUTIVE_AGENTS = new Set(Object.keys(AGENT_PASTEL))

export default function AgentBadge({
  agent,
  variant = 'badge',
}: {
  agent: string
  variant?: 'badge' | 'chip'
}) {
  const tone = variant === 'chip'
    ? AGENT_CHIP[agent] ?? { bg: 'var(--silver-1)', fg: 'var(--ink-2)' }
    : AGENT_PASTEL[agent] ?? { bg: 'var(--silver-1)', fg: 'var(--ink-2)' }

  if (variant === 'chip') {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 7px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        background: tone.bg,
        color: tone.fg,
      }}>
        {agent}
      </span>
    )
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 11.5,
      fontWeight: 600,
      lineHeight: 1.4,
      background: tone.bg,
      color: tone.fg,
      fontFamily: 'var(--font-sans)',
      whiteSpace: 'nowrap',
    }}>
      {agent}
    </span>
  )
}
