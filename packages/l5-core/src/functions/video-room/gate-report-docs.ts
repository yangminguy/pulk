// FR-4/FR-5 — 승인 게이트 리포트(HTML 기획서) 생성기.
//
// 사장님이 승인 시점에 검토할 자기완결형 HTML 문서를 만든다.
//   ① key_content_plan_doc  — 키 콘텐츠 기획서 (선별 이유 · 벤치마킹 영상 · 판매 논리 · 풀링 키워드 계획)
//   ② pulling_plan_doc      — 풀링 리서치 리포트 (주제별 근거 영상 · 선별 이유 · 키 연결 논리)
//
// 규칙:
// - 순수 함수. Date/random 미사용 — 생성 시각은 caller가 meta로 붙인다.
// - 스타일 인라인(자기완결). 썸네일은 유튜브 URL 참조(i.ytimg.com).
// - 판매 논리(applied_sales_logic)는 필수 — null이면 throw (FR-4 §3).
// - 선별 기준은 지식베이스 문서(04·06)의 기준 항목을 명시 인용한다.

import type { KeyContentReport, ReportCandidate, AppliedSalesLogic } from './key-content-report';
import type { PullingContentReport, PullingEvidenceVideo } from './pulling-content-report';

// ── 공용 헬퍼 ────────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function num(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('en-US') : '-';
}

const DOC_STYLE = [
  'font-family:-apple-system,\'Apple SD Gothic Neo\',sans-serif;color:#1c2430;line-height:1.65;',
  'max-width:860px;margin:0 auto;padding:20px;background:#fff;',
].join('');

const H2 = 'font-size:16px;margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid #e8ecf1;';
const TBL = 'width:100%;border-collapse:collapse;font-size:12.5px;margin:8px 0 14px;';
const TH = 'text-align:left;padding:6px 8px;border-bottom:1px solid #d8dee6;color:#5b6675;font-size:11.5px;white-space:nowrap;';
const TD = 'padding:6px 8px;border-bottom:1px solid #eef1f5;vertical-align:top;';
const KBREF = 'display:inline-block;background:#eef4ff;color:#3457d5;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;margin-left:6px;';
const CARD = 'border:1px solid #e4e8ee;border-radius:10px;padding:12px 14px;margin:8px 0;';

/** 벤치마킹 영상 행(FR-2 필드: 썸네일·제목·채널·조회수·성과도·기여도·링크). */
function videoRowHtml(v: {
  videoId: string;
  title: string;
  url?: string;
  thumbnailUrl?: string;
  channelTitle: string;
  viewCount: number;
  publishedAt?: string;
  performance?: string | null;
  contribution?: string | null;
  exposure?: string | null;
  isShort?: boolean;
}): string {
  const url = v.url || `https://www.youtube.com/watch?v=${v.videoId}`;
  const thumb = v.thumbnailUrl || `https://i.ytimg.com/vi/${esc(v.videoId)}/hqdefault.jpg`;
  const grades = [
    v.performance ? `성과도 ${esc(v.performance)}` : null,
    v.contribution ? `기여도 ${esc(v.contribution)}` : null,
    v.exposure ? `노출확률 ${esc(v.exposure)}` : null,
  ].filter(Boolean).join(' · ');
  return [
    `<div style="display:flex;gap:12px;${CARD}">`,
    `<a href="${esc(url)}" target="_blank" rel="noreferrer" style="flex:0 0 128px">`,
    `<img src="${esc(thumb)}" alt="" style="width:128px;height:72px;object-fit:cover;border-radius:6px;background:#eee" /></a>`,
    `<div style="flex:1;min-width:0">`,
    `<div style="font-weight:700;font-size:13px"><a href="${esc(url)}" target="_blank" rel="noreferrer" style="color:#1c2430;text-decoration:none">${esc(v.title)}</a></div>`,
    `<div style="font-size:12px;color:#5b6675;margin-top:3px">${esc(v.channelTitle)} · 조회수 ${num(v.viewCount)}${v.publishedAt ? ` · 게시 ${esc(String(v.publishedAt).slice(0, 10))}` : ''}${v.isShort ? ' · 쇼츠' : ''}</div>`,
    grades ? `<div style="font-size:11.5px;color:#2f6f4f;margin-top:3px;font-weight:600">${grades}</div>` : '',
    `</div></div>`,
  ].join('');
}

function salesLogicHtml(logic: AppliedSalesLogic): string {
  const rows: Array<[string, string]> = [
    ['콘텐츠 주제', logic.content_topic],
    ['핵심 타깃', logic.core_target],
    ['담당 현상 (고객이 지금 겪는 문제)', logic.target_phenomenon],
    ['만들 욕구', logic.desire_to_trigger],
    ['고객이 세우는 계획', logic.plan_user_makes],
    ['우리 상품으로 이어지는 행동', logic.action_to_our_product],
    ['고객이 기대하는 보상', logic.reward_user_expects],
  ];
  return [
    `<table style="${TBL}">`,
    ...rows.map(([k, v]) => `<tr><th style="${TH};width:220px">${esc(k)}</th><td style="${TD}">${esc(v)}</td></tr>`),
    '</table>',
  ].join('');
}

// ── ① 키 콘텐츠 기획서 ───────────────────────────────────────────────────────

export interface PullingKeywordPlanItem {
  keyword: string;
  reason: string;
}

export interface BuildKeyContentPlanDocInput {
  project: { id: string; title: string };
  report: KeyContentReport;
  /** 확정 키 주제(있으면 표기 우선). */
  key_topic_title?: string;
  /** 풀링 키워드 계획 — 비어 있으면 안 된다 (FR-4 §4). */
  pulling_keyword_plan: PullingKeywordPlanItem[];
}

export interface GatePlanDoc {
  /** 자기완결형 HTML(문서 본문). */
  html: string;
  /** 카드 summary용 한 줄. */
  summary: string;
  key_topic_title: string;
}

/** KB 04·06 정본 선별 기준 — 기획서에 명시 인용(추측 금지, 문서 체계 인용). */
const KEY_SELECTION_CRITERIA = [
  '[04 §기획] 역순 기획 — 판매할 상품에서 출발해 키 주제를 역산했는가',
  '[06 §4] 실측 가치 판단 — 조회수·성과도·기여도 등급이 검증된 영상을 근거로 했는가',
  '[06 §4] 시청자 정체성 — 근거 영상이 끌어당기는 시청자가 우리 핵심 타깃과 같은 레벨인가',
  '[03·04] 판매 논리 — 현상→욕구→계획→행동→보상 5단계가 상품까지 이어지는가',
];

export function buildKeyContentPlanDoc(input: BuildKeyContentPlanDocInput): GatePlanDoc {
  const { report, project } = input;

  // FR-4 §3: 판매 논리 필수 — 생성 단계에서 null 금지.
  if (!report.applied_sales_logic) {
    throw new Error('buildKeyContentPlanDoc: applied_sales_logic이 없습니다 — 기획서 생성 전에 판매 논리를 필수 생성하세요');
  }
  if (!input.pulling_keyword_plan || input.pulling_keyword_plan.length === 0) {
    throw new Error('buildKeyContentPlanDoc: pulling_keyword_plan이 비어 있습니다 (FR-4 §4)');
  }

  const keyTopic =
    (input.key_topic_title ?? '').trim() ||
    report.applied_sales_logic.content_topic ||
    report.candidates.find((c) => c.topPick)?.title ||
    '(주제 미확정)';

  const benchmarks: ReportCandidate[] = report.candidates
    .slice()
    .sort((a, b) => Number(b.topPick) - Number(a.topPick) || a.rank - b.rank)
    .slice(0, 5);

  const marketRows = report.market.map((m) =>
    `<tr><td style="${TD}"><b>${esc(m.keyword)}</b></td><td style="${TD}">${m.videoCount}</td><td style="${TD}">${num(m.avgViews)}</td><td style="${TD}">${num(m.topViews)}</td><td style="${TD}">${Math.round(m.longformRatio * 100)}%</td><td style="${TD}">${esc(m.verdict)}</td><td style="${TD}">${esc(m.verdictReason)}</td></tr>`,
  ).join('');

  const html = [
    `<div style="${DOC_STYLE}">`,
    `<h1 style="font-size:19px;margin:0 0 4px">키 콘텐츠 기획서<span style="${KBREF}">근거: 03 · 04 · 06</span></h1>`,
    `<div style="font-size:12px;color:#5b6675">프로젝트: ${esc(project.title)} (${esc(project.id.slice(0, 8))}) · 상품: ${esc(report.product)} · 타깃: ${esc(report.target)}</div>`,

    `<h2 style="${H2}">1. 키 콘텐츠 주제와 선별 이유<span style="${KBREF}">04 · 06</span></h2>`,
    `<div style="${CARD};background:#f6f9f6"><b style="font-size:14px">${esc(keyTopic)}</b>`,
    `<div style="font-size:12.5px;margin-top:6px">${esc(report.recommendation_reason || report.approval_request)}</div></div>`,
    `<div style="font-size:12px;color:#5b6675;margin:6px 0 4px">적용한 선별 기준(지식베이스 정본 인용):</div>`,
    `<ul style="font-size:12.5px;margin:4px 0 10px;padding-left:20px">${KEY_SELECTION_CRITERIA.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`,
    `<div style="font-size:12px;color:#5b6675;margin:10px 0 2px">키워드 시장 검증(후보 대비 비교 근거):</div>`,
    `<table style="${TBL}"><tr><th style="${TH}">키워드</th><th style="${TH}">표본</th><th style="${TH}">평균 조회</th><th style="${TH}">최고 조회</th><th style="${TH}">롱폼</th><th style="${TH}">판정</th><th style="${TH}">사유</th></tr>${marketRows}</table>`,

    `<h2 style="${H2}">2. 벤치마킹 영상<span style="${KBREF}">06 §4</span></h2>`,
    `<div style="font-size:12px;color:#5b6675;margin-bottom:4px">아래 영상들이 벤치마킹 기준(실측 조회·성과도·기여도·시청자 정체성 일치)에 부합해 근거로 선정됨. 썸네일 클릭 시 원본.</div>`,
    ...benchmarks.map((c) => [
      videoRowHtml(c),
      c.identity_reason || c.viewer_identity
        ? `<div style="font-size:11.5px;color:#5b6675;margin:-4px 0 8px 4px">↳ 시청자 정체성: ${esc(c.viewer_identity ?? '')}${c.identity_match ? ` (${esc(c.identity_match)})` : ''} — ${esc(c.identity_reason ?? '')}</div>`
        : '',
    ].join('')),

    `<h2 style="${H2}">3. 판매 논리 — 이 주제가 상품 판매로 이어지는 전개<span style="${KBREF}">03 · 04</span></h2>`,
    salesLogicHtml(report.applied_sales_logic),

    `<h2 style="${H2}">4. 풀링 키워드 계획 — 승인 후 이 키워드로 풀링 리서치 진행<span style="${KBREF}">05</span></h2>`,
    `<table style="${TBL}"><tr><th style="${TH}">키워드</th><th style="${TH}">선정 이유</th></tr>`,
    ...input.pulling_keyword_plan.map((k) => `<tr><td style="${TD}"><b>${esc(k.keyword)}</b></td><td style="${TD}">${esc(k.reason)}</td></tr>`),
    `</table>`,
    `<div style="font-size:12px;color:#8a5a12;background:#fdf6e7;border-radius:8px;padding:8px 12px">이 기획서를 승인하면 위 키워드 계획대로 풀링 리서치가 시작됩니다. 키워드 수정 지시는 반려(수정 요청) 사유에 적어 주세요.</div>`,
    `</div>`,
  ].join('\n');

  return {
    html,
    summary: `키 콘텐츠 기획서: ${keyTopic} (벤치마킹 ${benchmarks.length}건 · 풀링 키워드 ${input.pulling_keyword_plan.length}개)`,
    key_topic_title: keyTopic,
  };
}

// ── ② 풀링 리서치 리포트 ─────────────────────────────────────────────────────

export interface BuildPullingPlanDocInput {
  project: { id: string; title: string };
  report: PullingContentReport;
}

export function buildPullingPlanDoc(input: BuildPullingPlanDocInput): GatePlanDoc {
  const { report, project } = input;
  if (!report.topics || report.topics.length === 0) {
    throw new Error('buildPullingPlanDoc: topics가 비어 있습니다 — 풀링 리포트 없이 승인 문서를 만들 수 없습니다');
  }

  const topicBlocks = report.topics.map((t) => {
    const evidence = (t.evidence_videos ?? []) as PullingEvidenceVideo[];
    return [
      `<div style="${CARD}">`,
      `<div style="display:flex;align-items:center;gap:8px"><b style="font-size:14px">${t.rank}. ${esc(t.topic_name)}</b>`,
      `<span style="background:${t.grade === 'A' ? '#e5f5ec' : t.grade === 'B' ? '#eef4ff' : '#f4f5f7'};color:#2f6f4f;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700">등급 ${esc(t.grade)} · ${Math.round(t.topic_score)}점</span></div>`,
      `<table style="${TBL}">`,
      `<tr><th style="${TH};width:180px">담당 현상</th><td style="${TD}">${esc(t.target_phenomenon)}</td></tr>`,
      `<tr><th style="${TH}">만들 욕구</th><td style="${TD}">${esc(t.created_desire)}</td></tr>`,
      `<tr><th style="${TH}">키 콘텐츠 연결 논리</th><td style="${TD}">${esc(t.linked_key_content)} — ${esc(t.funnel?.action ?? '')}</td></tr>`,
      `<tr><th style="${TH}">선별 이유</th><td style="${TD}">${esc(t.selection_reason)}</td></tr>`,
      `<tr><th style="${TH}">상품 접목</th><td style="${TD}">${esc(t.product_application)}</td></tr>`,
      t.viewer_identity ? `<tr><th style="${TH}">시청자 정체성</th><td style="${TD}">${esc(t.viewer_identity)}${t.identity_match ? ` (${esc(t.identity_match)})` : ''} — ${esc(t.identity_reason ?? '')}</td></tr>` : '',
      `</table>`,
      `<div style="font-size:12px;color:#5b6675;margin:2px 0 4px">근거 영상 ${evidence.length}건 (실측):</div>`,
      ...evidence.slice(0, 4).map((v) => videoRowHtml(v)),
      `</div>`,
    ].join('\n');
  });

  const s = report.search_summary;
  const html = [
    `<div style="${DOC_STYLE}">`,
    `<h1 style="font-size:19px;margin:0 0 4px">풀링 콘텐츠 리서치 리포트<span style="${KBREF}">근거: 05 · 06</span></h1>`,
    `<div style="font-size:12px;color:#5b6675">프로젝트: ${esc(project.title)} (${esc(project.id.slice(0, 8))}) · 키 콘텐츠: ${esc(report.key_content_title)} · 역할: ${esc(report.pulling_role)}</div>`,
    `<div style="${CARD};background:#f6f8fb;font-size:12.5px">검색 ${s.keywords_used}개 키워드 · 수집 ${s.videos_collected}건 → 중복 제거 ${s.videos_after_dedup}건 → 적격 ${s.qualified_count}건 · 뷰트랩 예산 ${report.viewtrap_budget.used}/${report.viewtrap_budget.limit}</div>`,
    `<h2 style="${H2}">선별된 풀링 주제 ${report.topics.length}개</h2>`,
    ...topicBlocks,
    `<div style="font-size:12px;color:#8a5a12;background:#fdf6e7;border-radius:8px;padding:8px 12px">${esc(report.approval_request || '이 리포트를 승인하면 훅 제작(썸네일 패턴 추출) 단계로 진행합니다.')}</div>`,
    `</div>`,
  ].join('\n');

  return {
    html,
    summary: `풀링 리서치 리포트: ${report.topics.length}개 주제 (적격 영상 ${s.qualified_count}건)`,
    key_topic_title: report.key_content_title,
  };
}
