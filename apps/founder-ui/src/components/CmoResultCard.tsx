'use client'
import Icon from '@/components/Icon'
import type { CmoMarketingPlan } from '@/lib/api'

const RISK_CLASS: Record<string, string> = {
  D1: 'j-risk-d1',
  D2: 'j-risk-d2',
  D3: 'j-risk-d3',
  D4: 'j-risk-d4',
  D5: 'j-risk-d5',
}

export function CmoResultCard({
  plan,
  onApprove,
  onReject,
  approved,
}: {
  plan: CmoMarketingPlan
  onApprove: () => void
  onReject: () => void
  approved: boolean
}) {
  const riskCls = RISK_CLASS[plan.risk_level] ?? ''

  return (
    <div style={{
      marginTop: 10,
      border: '1px solid var(--silver-2)',
      borderRadius: 8,
      overflow: 'hidden',
      background: 'var(--paper-elevated)',
    }}>
      {/* Decision */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--silver-1)' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-1)', lineHeight: 1.4 }}>
          {plan.decision}
        </div>
      </div>

      {/* Reasoning */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)' }}>
        <div className="j-overline" style={{ marginBottom: 4 }}>판단 근거</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          {plan.reasoning}
        </div>
      </div>

      {/* Next Action */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--silver-1)' }}>
        <div style={{
          background: 'var(--green-tint)',
          border: '1px solid var(--green-tint-2)',
          borderRadius: 6,
          padding: '9px 12px',
        }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--green-press)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="arrowR" size={12} stroke={2} /> 다음 액션
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.5 }}>
            {plan.next_action}
          </div>
        </div>
      </div>

      {/* Risk + Approval CTA */}
      <div style={{
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}>
        {plan.risk_level && (
          <span className={`j-badge ${riskCls}`}>{plan.risk_level}</span>
        )}

        {approved ? (
          <span style={{
            marginLeft: 'auto',
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--green-press)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}>
            <Icon name="check" size={13} stroke={2.2} />
            승인됨
          </span>
        ) : plan.requires_founder_approval ? (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={onApprove} className="j-btn j-btn-primary j-btn-sm">
              <Icon name="check" size={13} stroke={2.2} />
              승인
            </button>
            <button onClick={onReject} className="j-btn j-btn-danger j-btn-sm">
              <Icon name="x" size={13} stroke={2} />
              수정 요청
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
