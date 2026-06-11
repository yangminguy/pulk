'use client'
import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import type { CmoCard } from '../_lib/types'

// 상품 정의 승인 보드 — proposeProductDefinition(Step1~7) 산출물(draft)을
// 사장님 요청 1~8 형식으로 표시하고, 승인 시 키 콘텐츠 기획(실검색)으로 전진한다.
// 도메인 로직 없음: 표시 + advanceStatus 호출만.

type FB = { item: string; description: string }
type Problem = { problem: string; derived_from: string }
type FunnelItem = { content: string }
type Draft = {
  step1_generalization?: { item_name?: string; customer_problem_category?: string; direct_category?: string; reason?: string }
  step2_item_fb?: { features?: FB[]; characteristics?: FB[]; benefits?: FB[] }
  step4_problems?: { item_problem_candidates?: Problem[] }
  step5_funnel?: Record<'phenomenon' | 'desire' | 'plan' | 'action' | 'reward', FunnelItem[] | undefined>
  step6_entry_decision?: { selected_entry_stage?: string; rationale?: string }
  step7_search_keywords?: {
    problem_keywords?: string[]
    item_feature_benefit_keywords?: string[]
    category_feature_benefit_keywords?: string[]
    item_name_keywords?: string[]
  }
}
type CardData = { draft?: Draft; viewtrap_keywords?: string[]; product?: string; target_audience?: string }

const FUNNEL_LABELS: [keyof NonNullable<Draft['step5_funnel']>, string][] = [
  ['phenomenon', '현상'], ['desire', '욕구'], ['plan', '계획'], ['action', '행동'], ['reward', '보상'],
]

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          width: 20, height: 20, borderRadius: 5, background: 'var(--wood-3)', color: '#fff',
          fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{n}</span>
        <h3 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink-1)', margin: 0 }}>{title}</h3>
      </div>
      <div style={{ paddingLeft: 28 }}>{children}</div>
    </section>
  )
}

function Chips({ items }: { items?: string[] }) {
  if (!items?.length) return <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>—</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((k, i) => (
        <span key={i} style={{
          fontSize: 12, padding: '4px 9px', borderRadius: 999,
          background: 'var(--silver-1)', border: '1px solid var(--silver-2)', color: 'var(--ink-2)',
        }}>{k}</span>
      ))}
    </div>
  )
}

function FBList({ rows }: { rows?: FB[] }) {
  if (!rows?.length) return <li style={{ color: 'var(--ink-4)' }}>—</li>
  return <>{rows.map((r, i) => (
    <li key={i} style={{ marginBottom: 4 }}>
      <strong style={{ color: 'var(--ink-1)' }}>{r.item}</strong>
      <span style={{ color: 'var(--ink-3)' }}> — {r.description}</span>
    </li>
  ))}</>
}

export default function ProductDefinitionBoard({ projectId, cards, currentStatus, onRefresh }: {
  projectId: string
  cards: CmoCard[]
  currentStatus: string
  onRefresh: () => void
}) {
  const card = cards.find(c => c.stage === 'product_definition')
  const data = card?.data as CardData | undefined
  const draft = data?.draft
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggered = useRef(false)

  const propose = async () => {
    if (loading) return
    setLoading(true); setError(null)
    try { await api.cmoProposeProductDefinition(projectId); onRefresh() }
    catch (e) { setError(e instanceof Error ? e.message : '상품 정의 생성 실패') }
    finally { setLoading(false) }
  }

  // 진입 시 카드 없으면 자동 1회 생성(KeyContentPlanBoard 패턴).
  useEffect(() => {
    if (!card && !triggered.current && currentStatus === 'product_defined') {
      triggered.current = true
      void propose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, currentStatus])

  const approve = async () => {
    if (approving) return
    setApproving(true); setError(null)
    try { await api.cmoAdvanceStatus(projectId); onRefresh() }
    catch (e) { setError(e instanceof Error ? e.message : '승인 실패'); setApproving(false) }
  }

  const box: React.CSSProperties = {
    border: '1px solid var(--silver-2)', borderRadius: 10, background: 'var(--paper-surface)', padding: 20,
  }

  if (!draft) {
    return (
      <div style={{ ...box, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
        {loading ? '상품 정의 분석 중… (Step 1~7, 보통 2~3분)' : '상품 정의 초안이 아직 없습니다.'}
        {!loading && (
          <button className="j-btn j-btn-secondary j-btn-sm" onClick={propose} style={{ marginLeft: 12 }}>
            상품 정의 생성
          </button>
        )}
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>
    )
  }

  const oneLiner = data?.product || draft.step1_generalization?.item_name || ''
  const problemCategory = draft.step1_generalization?.customer_problem_category

  return (
    <div style={box}>
      <div className="j-overline" style={{ marginBottom: 14 }}>상품 정의 (승인 1단계)</div>

      <Section n={1} title="상품 한 줄 정의">
        <p style={{ fontSize: 14, color: 'var(--ink-1)', margin: 0, lineHeight: 1.55 }}>{oneLiner}</p>
        {problemCategory && problemCategory !== oneLiner && (
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>문제 카테고리: {problemCategory}</p>
        )}
      </Section>

      <Section n={2} title="핵심 타깃 사용자">
        <p style={{ fontSize: 13.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>{data?.target_audience || '—'}</p>
      </Section>

      <Section n={3} title="기능 / 특징 / 장점">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-press)', marginBottom: 4 }}>기능 (해주는 일)</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}><FBList rows={draft.step2_item_fb?.features} /></ul>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--wood-3)', marginBottom: 4 }}>특징 (차별점·방식)</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}><FBList rows={draft.step2_item_fb?.characteristics} /></ul>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 4 }}>장점 (얻는 편익)</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}><FBList rows={draft.step2_item_fb?.benefits} /></ul>
          </div>
        </div>
      </Section>

      <Section n={4} title="실제 사용자 문제 정의">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
          {(draft.step4_problems?.item_problem_candidates ?? []).map((p, i) => (
            <li key={i} style={{ marginBottom: 5 }}>{p.problem}</li>
          ))}
          {!(draft.step4_problems?.item_problem_candidates?.length) && <li style={{ color: 'var(--ink-4)' }}>—</li>}
        </ul>
      </Section>

      <Section n={5} title="현상 / 욕구 / 계획 / 행동 / 보상">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FUNNEL_LABELS.map(([key, label]) => (
            <div key={key} style={{ display: 'flex', gap: 10 }}>
              <span style={{ flexShrink: 0, width: 40, fontSize: 12, fontWeight: 700, color: 'var(--wood-3)' }}>{label}</span>
              <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                {(draft.step5_funnel?.[key] ?? []).map(x => x.content).join(' · ') || '—'}
              </span>
            </div>
          ))}
        </div>
        {draft.step6_entry_decision?.selected_entry_stage && (
          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10 }}>
            진입 단계: <strong>{draft.step6_entry_decision.selected_entry_stage}</strong>
          </p>
        )}
      </Section>

      <Section n={6} title="뷰트랩 검색 전 키워드 후보">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div><div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 4 }}>문제 기반</div><Chips items={draft.step7_search_keywords?.problem_keywords} /></div>
          <div><div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 4 }}>기능 기반</div><Chips items={draft.step7_search_keywords?.item_feature_benefit_keywords} /></div>
        </div>
      </Section>

      <Section n={7} title="뷰트랩 검색용 최종 키워드">
        <Chips items={data?.viewtrap_keywords} />
        <p style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 8 }}>
          승인하면 이 키워드로 YouTube/Viewtrap을 실제 검색해 키 콘텐츠 주제를 뽑습니다.
        </p>
      </Section>

      {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ borderTop: '1px solid var(--silver-2)', paddingTop: 14, marginTop: 4 }}>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 10 }}>
          위 상품 정의가 맞으면 승인하고 키 콘텐츠 기획으로 넘어갑니다. 수정이 필요하면 다시 생성하세요.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="j-btn j-btn-primary" onClick={approve} disabled={approving} style={{ flex: 1 }}>
            {approving ? '진행 중…' : '이대로 승인 → 키 콘텐츠 기획 시작'}
          </button>
          <button className="j-btn j-btn-ghost" onClick={propose} disabled={loading || approving}>
            {loading ? '생성 중…' : '다시 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}
