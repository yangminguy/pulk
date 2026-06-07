'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type {
  MarketResearchPack,
  VoiceOfCustomerPack,
  ClaimEvidenceReport,
  AudienceFitReport,
  ScriptMaterialPack,
} from '../_lib/script-room-types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function Gate1Badge({ pass }: { pass?: boolean }) {
  if (pass === undefined) return null
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 999,
      background: pass ? 'var(--p-green)' : 'var(--p-rose)',
      color: pass ? 'var(--green)' : 'var(--pi-rose)',
    }}>
      {pass ? 'Gate 1 통과' : 'Gate 1 미통과'}
    </span>
  )
}

function ScoreBar({ score, label }: { score?: number; label?: string }) {
  if (score === undefined) return null
  const pct = Math.min(100, Math.max(0, score))
  const color = pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--wood-3)' : 'var(--pi-rose)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      {label && <span style={{ fontSize: 11, color: 'var(--ink-3)', minWidth: 80 }}>{label}</span>}
      <div style={{ flex: 1, height: 6, background: 'var(--silver-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>{pct}</span>
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: 'var(--ink-3)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4,
    }}>
      {label}
    </div>
  )
}

function StringList({ items, color }: { items?: string[]; color?: string }) {
  if (!items?.length) return <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>—</span>
  return (
    <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 12.5, color: color ?? 'var(--ink-1)', lineHeight: 1.55 }}>{item}</li>
      ))}
    </ul>
  )
}

function SourcesList({ sources }: { sources?: string[] }) {
  if (!sources?.length) return null
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--silver-1)' }}>
      <SectionHeader label="출처" />
      <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sources.map((s, i) => (
          <li key={i} style={{ fontSize: 11.5, color: 'var(--blue)', lineHeight: 1.4 }}>{s}</li>
        ))}
      </ul>
    </div>
  )
}

function PackCard({
  packKey,
  score,
  gate1Pass,
  sources,
  children,
}: {
  packKey: string
  score?: number
  gate1Pass?: boolean
  sources?: string[]
  children: React.ReactNode
}) {
  const LABEL: Record<string, string> = {
    market_research_pack: '시장조사',
    voice_of_customer_pack: 'VOC 수집',
    claim_evidence_report: '주장/근거 검증',
    audience_fit_report: '타깃 욕구 검증',
    script_material_pack: '원고 재료표',
  }
  return (
    <div style={{
      border: '1px solid var(--silver-2)',
      borderLeft: '4px solid var(--wood-3)',
      borderRadius: 8,
      background: 'var(--paper-surface)',
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--silver-1)',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--wood-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {LABEL[packKey] ?? packKey}
        </span>
        <Gate1Badge pass={gate1Pass} />
      </div>
      {score !== undefined && (
        <div style={{ padding: '10px 14px 0' }}>
          <ScoreBar score={score} label="점수" />
        </div>
      )}
      <div style={{ padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
        <SourcesList sources={sources} />
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionHeader label={label} />
      {children}
    </div>
  )
}

// ── Pack renderers ────────────────────────────────────────────────────────────

function MarketPack({ pack }: { pack: MarketResearchPack }) {
  return (
    <PackCard packKey="market_research_pack" score={pack.score} gate1Pass={pack.gate1_pass} sources={pack.sources}>
      {pack.why_this_topic_matters && (
        <Row label="왜 이 주제인가">
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.6 }}>{pack.why_this_topic_matters}</p>
        </Row>
      )}
      {!!pack.content_opportunities?.length && (
        <Row label="콘텐츠 기회"><StringList items={pack.content_opportunities} color="var(--green)" /></Row>
      )}
      {!!pack.market_context?.length && (
        <Row label="시장 맥락"><StringList items={pack.market_context} /></Row>
      )}
      {!!pack.common_misunderstandings?.length && (
        <Row label="흔한 오해"><StringList items={pack.common_misunderstandings} color="var(--pi-rose)" /></Row>
      )}
      {!!pack.competitor_content_patterns?.length && (
        <Row label="경쟁 콘텐츠 패턴"><StringList items={pack.competitor_content_patterns} /></Row>
      )}
      {!!pack.unanswered_questions?.length && (
        <Row label="미해결 질문"><StringList items={pack.unanswered_questions} /></Row>
      )}
    </PackCard>
  )
}

function VocPack({ pack }: { pack: VoiceOfCustomerPack }) {
  return (
    <PackCard packKey="voice_of_customer_pack" score={pack.score} gate1Pass={pack.gate1_pass} sources={pack.sources}>
      {!!pack.pain_expressions?.length && (
        <Row label="페인 표현"><StringList items={pack.pain_expressions} color="var(--pi-rose)" /></Row>
      )}
      {!!pack.desire_expressions?.length && (
        <Row label="욕구 표현"><StringList items={pack.desire_expressions} color="var(--green)" /></Row>
      )}
      {!!pack.repeated_phrases?.length && (
        <Row label="반복 문구"><StringList items={pack.repeated_phrases} /></Row>
      )}
      {!!pack.must_use_language?.length && (
        <Row label="반드시 쓸 언어"><StringList items={pack.must_use_language} color="var(--blue)" /></Row>
      )}
      {!!pack.avoid_language?.length && (
        <Row label="쓰지 말 언어"><StringList items={pack.avoid_language} color="var(--pi-rose)" /></Row>
      )}
      {!!pack.objection_expressions?.length && (
        <Row label="반대 표현"><StringList items={pack.objection_expressions} /></Row>
      )}
    </PackCard>
  )
}

function ClaimPack({ pack }: { pack: ClaimEvidenceReport }) {
  return (
    <PackCard packKey="claim_evidence_report" score={pack.score} gate1Pass={pack.gate1_pass} sources={pack.sources}>
      {!!pack.safe_claims?.length && (
        <Row label="안전한 주장"><StringList items={pack.safe_claims} color="var(--green)" /></Row>
      )}
      {!!pack.risky_claims?.length && (
        <Row label="위험 주장"><StringList items={pack.risky_claims} color="var(--pi-rose)" /></Row>
      )}
      {!!pack.unverified_claims?.length && (
        <Row label="미검증 주장"><StringList items={pack.unverified_claims} color="var(--wood-3)" /></Row>
      )}
      {!!pack.proof_points?.length && (
        <Row label="근거 포인트"><StringList items={pack.proof_points} /></Row>
      )}
      {!!pack.claims_to_avoid?.length && (
        <Row label="회피 주장"><StringList items={pack.claims_to_avoid} color="var(--pi-rose)" /></Row>
      )}
    </PackCard>
  )
}

function AudiencePack({ pack }: { pack: AudienceFitReport }) {
  const subScores: Array<{ label: string; key: keyof AudienceFitReport }> = [
    { label: 'Pain Fit', key: 'pain_fit' },
    { label: 'Desire Fit', key: 'desire_fit' },
    { label: 'Language Fit', key: 'language_fit' },
    { label: 'Curiosity Fit', key: 'curiosity_fit' },
    { label: 'Trust Fit', key: 'trust_fit' },
    { label: 'Action Fit', key: 'action_fit' },
  ]
  return (
    <PackCard packKey="audience_fit_report" score={pack.overall_score} gate1Pass={pack.gate1_pass} sources={pack.sources}>
      {subScores.map(({ label, key }) => {
        const v = pack[key]
        return typeof v === 'number' ? <ScoreBar key={key} score={v} label={label} /> : null
      })}
      {pack.recommended_angle && (
        <Row label="권장 앵글">
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-1)', lineHeight: 1.6 }}>{pack.recommended_angle}</p>
        </Row>
      )}
      {!!pack.what_target_wants_to_hear?.length && (
        <Row label="듣고 싶은 말"><StringList items={pack.what_target_wants_to_hear} color="var(--green)" /></Row>
      )}
      {!!pack.what_target_does_not_want_to_hear?.length && (
        <Row label="듣기 싫은 말"><StringList items={pack.what_target_does_not_want_to_hear} color="var(--pi-rose)" /></Row>
      )}
      {!!pack.must_answer_questions?.length && (
        <Row label="반드시 답해야 할 질문"><StringList items={pack.must_answer_questions} /></Row>
      )}
    </PackCard>
  )
}

function ScriptMaterialPackCard({ pack }: { pack: ScriptMaterialPack }) {
  return (
    <PackCard packKey="script_material_pack" score={pack.score} gate1Pass={pack.gate1_pass} sources={pack.sources}>
      {!!pack.core_message_candidates?.length && (
        <Row label="핵심 메시지 후보"><StringList items={pack.core_message_candidates} color="var(--blue)" /></Row>
      )}
      {!!pack.pain_scenes?.length && (
        <Row label="Pain 장면"><StringList items={pack.pain_scenes} /></Row>
      )}
      {!!pack.desire_scenes?.length && (
        <Row label="Desire 장면"><StringList items={pack.desire_scenes} /></Row>
      )}
      {!!pack.must_use_lines?.length && (
        <Row label="반드시 쓸 문장"><StringList items={pack.must_use_lines} color="var(--green)" /></Row>
      )}
      {!!pack.must_avoid_lines?.length && (
        <Row label="쓰지 말 문장"><StringList items={pack.must_avoid_lines} color="var(--pi-rose)" /></Row>
      )}
      {!!pack.proof_points?.length && (
        <Row label="근거 포인트"><StringList items={pack.proof_points} /></Row>
      )}
      {!!pack.cta_materials?.length && (
        <Row label="CTA 재료"><StringList items={pack.cta_materials} /></Row>
      )}
    </PackCard>
  )
}

// ── Gate 1 check (client-side) ────────────────────────────────────────────────

function computeGate1(
  mrp?: MarketResearchPack,
  voc?: VoiceOfCustomerPack,
  cer?: ClaimEvidenceReport,
  afr?: AudienceFitReport,
): { pass: boolean; notes: string[] } {
  const notes: string[] = []
  if (!mrp) notes.push('Market Research Pack 없음')
  if (!voc) notes.push('VOC Pack 없음')
  if (!cer) notes.push('Claim Evidence Report 없음')
  const score = afr?.overall_score ?? 0
  if (score < 80) notes.push(`Audience Fit 점수 미달 (${score}/80)`)
  const vocLang = voc?.must_use_language?.length ?? 0
  if (vocLang < 5) notes.push(`VOC 실제 언어 부족 (${vocLang}/5개)`)
  const safe = cer?.safe_claims?.length ?? 0
  if (safe < 3) notes.push(`safe_claims 부족 (${safe}/3개)`)
  return { pass: notes.length === 0, notes }
}

// ── Card-data shape returned by cmo:getProject ────────────────────────────────

type RawCard = { stage: string; data: unknown }

function extractPack<T>(cards: RawCard[], stage: string): T | undefined {
  const card = cards.find(c => c.stage === stage)
  if (!card?.data) return undefined
  // Some backends wrap it: { market_research_pack: { ... } } or directly the pack
  const d = card.data as Record<string, unknown>
  return (d[stage] ?? card.data) as T
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ResearchRoomPanel({
  projectId,
}: {
  projectId: string
  cardId?: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mrp, setMrp] = useState<MarketResearchPack | undefined>()
  const [voc, setVoc] = useState<VoiceOfCustomerPack | undefined>()
  const [cer, setCer] = useState<ClaimEvidenceReport | undefined>()
  const [afr, setAfr] = useState<AudienceFitReport | undefined>()
  const [smp, setSmp] = useState<ScriptMaterialPack | undefined>()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!projectId) return
      setLoading(true)
      setError(null)
      try {
        const detail = await api.cmoGetProject(projectId) as { cards?: RawCard[] }
        if (cancelled) return
        const cards: RawCard[] = detail?.cards ?? []
        setMrp(extractPack<MarketResearchPack>(cards, 'market_research_pack'))
        setVoc(extractPack<VoiceOfCustomerPack>(cards, 'voice_of_customer_pack'))
        setCer(extractPack<ClaimEvidenceReport>(cards, 'claim_evidence_report'))
        setAfr(extractPack<AudienceFitReport>(cards, 'audience_fit_report'))
        setSmp(extractPack<ScriptMaterialPack>(cards, 'script_material_pack'))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '로딩 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  const { pass: gate1Pass, notes: gate1Notes } = computeGate1(mrp, voc, cer, afr)
  const hasAny = !!(mrp || voc || cer || afr || smp)

  if (loading) {
    return (
      <div style={{ padding: '24px 0', fontSize: 13, color: 'var(--ink-4)', textAlign: 'center' }}>
        리서치 데이터 로딩 중...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '12px 0', fontSize: 12.5, color: 'var(--pi-rose)' }}>
        오류: {error}
      </div>
    )
  }

  return (
    <div>
      {/* Panel header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span className="j-overline" style={{ flex: 1 }}>Research Room</span>
        {hasAny && <Gate1Badge pass={gate1Pass} />}
      </div>

      {/* Gate 1 failure notes */}
      {hasAny && !gate1Pass && gate1Notes.length > 0 && (
        <div style={{
          marginBottom: 14,
          padding: '10px 12px',
          background: 'var(--p-rose)',
          borderRadius: 6,
          border: '1px solid var(--pi-rose)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--pi-rose)', marginBottom: 6 }}>Gate 1 미통과 사유</div>
          <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {gate1Notes.map((n, i) => (
              <li key={i} style={{ fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.55 }}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {!hasAny && (
        <p style={{ fontSize: 13, color: 'var(--ink-4)', marginTop: 0 }}>
          Research Room 데이터가 아직 없습니다. CMO와 대화를 시작하면 조사 결과가 여기에 표시됩니다.
        </p>
      )}

      {mrp && <MarketPack pack={mrp} />}
      {voc && <VocPack pack={voc} />}
      {cer && <ClaimPack pack={cer} />}
      {afr && <AudiencePack pack={afr} />}
      {smp && <ScriptMaterialPackCard pack={smp} />}
    </div>
  )
}
