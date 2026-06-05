'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type MetricEntry = { label: string; value: number }

const PRIMARY_COLOR = 'var(--color-primary, #2D6A4F)'
const SECONDARY_COLOR = 'var(--color-secondary, #74C69D)'

export default function CandidateMetricsChart({ data }: { data: MetricEntry[] }) {
  return (
    <div style={{ width: '100%', height: 100 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--ink-3, #888)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              background: 'var(--paper-elevated, #fff)',
              border: '1px solid var(--silver-2, #ddd)',
              borderRadius: 4,
            }}
          />
          <Bar
            dataKey="value"
            fill={PRIMARY_COLOR}
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
