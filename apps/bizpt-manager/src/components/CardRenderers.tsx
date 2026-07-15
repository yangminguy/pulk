'use client'
// FR-3 — 산출물 카드 한국어 렌더러. raw JSON 대신 "무엇을 했고, 결과가 뭐고, 왜"를
// 한국어로 기본 표시한다. 원본 JSON은 <details> 접힘(디버그용).
// 표시 전용 — 도메인 판단 로직 없음(전역 규칙 준수).
import React from 'react'

export const CARD_NAMES: Record<string, string> = {
  pt_context: 'PT 컨텍스트 로드',
  product_definition: '상품 정의',
  key_content_report: '키 콘텐츠 리서치 보고서',
  key_content_choice: '키 콘텐츠 주제 확정',
  key_content_draft: '키 콘텐츠 분석 초안',
  key_content_candidates: '키 콘텐츠 후보',
  key_content_plan_doc: '키 콘텐츠 기획서 (승인용)',
  key_content_viewtrap: '키 뷰트랩 검증',
  pulling_candidates: '풀링 주제 후보',
  pulling_content_report: '풀링 리서치 보고서',
  pulling_plan: '풀링 플랜 확정',
  pulling_plan_doc: '풀링 리서치 리포트 (승인용)',
  title_development: '제목 디벨롭 (8단계)',
  thumbnail_plan: '썸네일 계획',
  thumbnail_choice: '썸네일 확정',
  hook_alignment: '훅 정렬 평가',
  script_draft: '원고 초안 (도입부+본론)',
  strategy: '전략 브리프',
  slide_deck: '슬라이드 덱',
  rendering: '렌더 잡',
  qa: '영상 QA 결과',
  upload_draft: '업로드 초안',
  completion_insights: '완료 인사이트',
  research_judgments: '리서치 후보 판정 기록',
  revision_request: '반려/수정 요청',
  image_sources: '이미지 소스',
}

export function cardName(stage: string): string {
  return CARD_NAMES[stage] ?? stage
}

const kvS: React.CSSProperties = { fontSize: 12, borderBottom: '1px solid #f2f4f6', padding: '4px 6px', verticalAlign: 'top' }
const thS: React.CSSProperties = { ...kvS, color: 'var(--muted, #7a8494)', whiteSpace: 'nowrap', width: 130, textAlign: 'left', fontWeight: 600 }

function KV({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (shown.length === 0) return null
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', margin: '6px 0' }}>
      <tbody>
        {shown.map(([k, v], i) => (
          <tr key={i}><th style={thS}>{k}</th><td style={kvS}>{v}</td></tr>
        ))}
      </tbody>
    </table>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, lineHeight: 1.65, margin: '4px 0' }}>{children}</div>
}

export function VideoChip({ v }: { v: Record<string, any> }) {
  const id = String(v.videoId ?? v.video_id ?? '')
  const url = String(v.url ?? (id ? `https://www.youtube.com/watch?v=${id}` : '#'))
  const thumb = String(v.thumbnailUrl ?? (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''))
  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid #f2f4f6' }}>
      {thumb && (
        <a href={url} target="_blank" rel="noreferrer" style={{ flex: '0 0 96px' }}>
          <img src={thumb} alt="" style={{ width: 96, height: 54, objectFit: 'cover', borderRadius: 6, background: '#eee' }} />
        </a>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: 'inherit', textDecoration: 'none' }}>
          {String(v.title ?? '(제목 없음)')}
        </a>
        <div style={{ fontSize: 11, color: 'var(--muted, #7a8494)' }}>
          {String(v.channelTitle ?? '')}{v.subscriberCount ? ` · 구독 ${Number(v.subscriberCount).toLocaleString()}` : ''} · 조회 {Number(v.viewCount ?? 0).toLocaleString()}
          {v.publishedAt ? ` · ${String(v.publishedAt).slice(0, 10)}` : ''}
        </div>
        <div style={{ fontSize: 11, color: '#2f6f4f', fontWeight: 600 }}>
          {[v.performance ? `성과도 ${v.performance}` : null, v.contribution ? `기여도 ${v.contribution}` : null, v.exposure ? `노출확률 ${v.exposure}` : null].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  )
}

/** 게이트용 HTML 문서(자기완결) — sandbox iframe 렌더. */
export function DocFrame({ html, height = 560 }: { html: string; height?: number }) {
  return (
    <iframe
      sandbox=""
      srcDoc={html}
      style={{ width: '100%', height, border: '1px solid #e4e8ee', borderRadius: 10, background: '#fff' }}
      title="report-doc"
    />
  )
}

/** 카드 타입별 한국어 요약 뷰. 미등록 타입은 null(호출부가 JSON 접힘만 표시). */
export function renderCardKorean(stage: string, raw: unknown): React.ReactNode {
  const d = (typeof raw === 'string' ? safeParse(raw) : raw) as Record<string, any> | null
  if (!d || typeof d !== 'object') return null

  switch (stage) {
    case 'key_content_plan_doc':
    case 'pulling_plan_doc':
      return d.html ? <DocFrame html={String(d.html)} /> : null

    case 'product_definition':
      return (
        <>
          <P>상품·타깃을 정의하고 리서치 검색 키워드를 확정한 단계입니다.</P>
          <KV rows={[
            ['상품', d.product_name ?? d.product ?? d.draft?.product_name],
            ['타깃', d.target_audience ?? d.draft?.target_audience],
            ['핵심 오퍼', d.core_offer ?? d.draft?.core_offer],
            ['검색 키워드', Array.isArray(d.viewtrap_keywords) ? d.viewtrap_keywords.join(', ') : undefined],
          ]} />
        </>
      )

    case 'key_content_choice':
      return (
        <>
          <P>여러 후보 중 이 프로젝트가 만들 <b>키 콘텐츠 주제를 확정</b>한 단계입니다.</P>
          <KV rows={[
            ['확정 주제', <b key="t">{String(d.key_topic_title ?? '')}</b>],
            ['벤치마킹 영상', d.recommended_video_id ? <a href={`https://www.youtube.com/watch?v=${d.recommended_video_id}`} target="_blank" rel="noreferrer">{String(d.recommended_video_id)}</a> : undefined],
            ['판매 논리(주제→상품)', d.applied_sales_logic ? `${d.applied_sales_logic.target_phenomenon} → ${d.applied_sales_logic.desire_to_trigger} → ${d.applied_sales_logic.action_to_our_product}` : undefined],
          ]} />
        </>
      )

    case 'key_content_report': {
      const cands: any[] = Array.isArray(d.candidates) ? d.candidates : []
      return (
        <>
          <P>승인 키워드로 유튜브·뷰트랩 리서치를 돌려 <b>근거 영상 {cands.length}건</b>을 선별하고 추천 주제를 도출했습니다.</P>
          <KV rows={[
            ['추천 이유', d.recommendation_reason],
            ['분석 키워드', `${d.provenance?.keywords_analyzed ?? '-'}개 (통과 ${d.provenance?.keywords_advanced ?? '-'}개)`],
          ]} />
          {cands.slice(0, 4).map((c, i) => <VideoChip key={i} v={c} />)}
        </>
      )
    }

    case 'pulling_content_report': {
      const topics: any[] = Array.isArray(d.topics) ? d.topics : []
      return (
        <>
          <P>키 콘텐츠로 시청자를 끌어올 <b>풀링 주제 {topics.length}개</b>를 실데이터로 선별했습니다.</P>
          {topics.map((t, i) => (
            <div key={i} style={{ margin: '6px 0', padding: '6px 8px', background: '#f7f8fa', borderRadius: 8 }}>
              <b style={{ fontSize: 12.5 }}>{t.rank}. {t.topic_name}</b> <span style={{ fontSize: 11, color: '#2f6f4f' }}>등급 {t.grade}</span>
              <div style={{ fontSize: 11.5, color: 'var(--muted, #7a8494)' }}>{t.selection_reason}</div>
            </div>
          ))}
        </>
      )
    }

    case 'pulling_plan': {
      const topics: any[] = Array.isArray(d.pulling_topics) ? d.pulling_topics : []
      return (
        <>
          <P>풀링 주제 {topics.length}개를 확정했습니다. 이 순서로 콘텐츠를 제작합니다.</P>
          <KV rows={topics.map((t, i) => [`${i + 1}`, `${t.title}`] as [string, React.ReactNode])} />
        </>
      )
    }

    case 'title_development': {
      const log: any[] = Array.isArray(d.version_log) ? d.version_log : []
      const refs: any[] = Array.isArray(d.references) ? d.references : []
      return (
        <>
          <P>레퍼런스 2개 교차 치환 시드 → 8기법 디벨롭 → 최종 <b>“{String(d.selected_title ?? '')}”</b> 선정.</P>
          {refs.length >= 2 && (
            <div style={{ fontSize: 11.5, color: 'var(--muted,#7a8494)', margin: '2px 0 6px' }}>
              참조 영상: {refs.map((r, i) => (
                <span key={i}>{i > 0 && ' · '}<a href={r.url ?? '#'} target="_blank" rel="noreferrer">{r.title}</a> (조회 {Number(r.view_count ?? 0).toLocaleString()})</span>
              ))}
            </div>
          )}
          {log.length > 0 && (
            <div style={{ borderLeft: '2px solid #e4e8ee', paddingLeft: 10, margin: '6px 0' }}>
              {log.map((e, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700 }}>{e.label}</div>
                  <div style={{ fontSize: 11.5 }}>→ {Array.isArray(e.titles_after) ? e.titles_after.join(' / ') : ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted,#7a8494)' }}>기법: {e.technique} · 이유: {e.reason}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )
    }

    case 'thumbnail_plan': {
      const cands: any[] = Array.isArray(d.candidates) ? d.candidates : []
      return (
        <>
          <P>썸네일 후보 {cands.length}개 (45/45/10 구성 · KB 08). 각 후보의 클릭 논리:</P>
          <KV rows={cands.slice(0, 9).map((c, i) => [`후보 ${i + 1}`, `${c.copy_main ?? c.click_logic ?? ''}`] as [string, React.ReactNode])} />
        </>
      )
    }

    case 'script_draft': {
      const intro = String(d.intro_30s?.script ?? '')
      const full = String(d.integrated_script?.full_script ?? '')
      const body = full.startsWith(intro) ? full.slice(intro.length).trim() : full
      const r = d.rationale
      return (
        <>
          <P><b>도입부</b> ({intro.length}자):</P>
          <div style={{ fontSize: 12, background: '#f7f8fa', borderRadius: 8, padding: 8, whiteSpace: 'pre-wrap' }}>{intro}</div>
          {r?.intro && (
            <div style={{ fontSize: 11.5, color: 'var(--muted,#7a8494)', margin: '4px 0' }}>
              근거: 구조 “{r.intro.structure_name}” · {r.intro.reason}
              {r.intro.benchmark_video_id && <> · 벤치마킹 <a href={`https://www.youtube.com/watch?v=${r.intro.benchmark_video_id}`} target="_blank" rel="noreferrer">{r.intro.benchmark_video_id}</a></>}
              {' · 생성: '}{r.intro.generation === 'llm' ? 'LLM 실원고' : '결정론 초안'}
            </div>
          )}
          <P><b>본론</b> ({body.length}자) — 전문:</P>
          <div style={{ fontSize: 12, background: '#f7f8fa', borderRadius: 8, padding: 8, whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>{body}</div>
          {Array.isArray(r?.blocks) && r.blocks.length > 0 && (
            <KV rows={r.blocks.map((b: any) => [b.block_id, `소스: ${(b.used_materials ?? []).slice(0, 2).join(' / ') || '-'} · VOC: ${(b.used_voc_lines ?? []).slice(0, 1).join('') || '-'}`] as [string, React.ReactNode])} />
          )}
        </>
      )
    }

    case 'qa':
      return (
        <>
          <P>렌더된 영상의 자동 QA 결과입니다.</P>
          <KV rows={[
            ['판정', d.pass === false ? '실패' : d.pass === true ? '통과' : (d.verdict ?? d.overall ?? JSON.stringify(d.result ?? '').slice(0, 60))],
            ['비고', Array.isArray(d.notes) ? d.notes.join(' · ') : d.notes],
          ]} />
        </>
      )

    case 'upload_draft':
      return (
        <>
          <P>업로드(비공개) 초안 — 게시 승인 대기.</P>
          <KV rows={[
            ['제목', d.title ?? d.draft?.title],
            ['설명', String(d.description ?? d.draft?.description ?? '').slice(0, 200)],
            ['태그', Array.isArray(d.tags ?? d.draft?.tags) ? (d.tags ?? d.draft?.tags).join(', ') : undefined],
          ]} />
        </>
      )

    case 'revision_request':
      return (
        <>
          <P>사장님 반려/수정 요청 — 재작업 입력.</P>
          <KV rows={[['게이트', d.gate_type], ['결정', d.decision], ['사유', d.note]]} />
        </>
      )

    case 'research_judgments': {
      const js: any[] = Array.isArray(d.judgments) ? d.judgments : []
      return <KV rows={js.map((j) => [String(j.video_id), `${j.verdict === 'adopt' ? '채택' : '제외'} — ${j.reason}`] as [string, React.ReactNode])} />
    }

    case 'completion_insights': {
      const ins: any[] = Array.isArray(d.insights) ? d.insights : Array.isArray(d) ? (d as any[]) : []
      return <KV rows={ins.map((c, i) => [`${c.usage ?? i}`, c.insight] as [string, React.ReactNode])} />
    }

    default:
      return null
  }
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}
