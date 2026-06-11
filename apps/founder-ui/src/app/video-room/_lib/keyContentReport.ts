// 키 콘텐츠 보고서 — 후보 3개 + 선정이유 4종을 읽기 좋은 HTML 문자열로 변환.
// 순수(표시 전용) 함수. 도메인 로직 없음. 새 창(window.open + document.write)에 주입.

import type { KeyContentCandidate } from '@/lib/api'

const REASON_LABELS: { key: keyof KeyContentCandidate['selection_reasons']; label: string }[] = [
  { key: 'viewtrap', label: 'Viewtrap 검색축' },
  { key: 'feature_benefit', label: '기능 · 특징 · 장점' },
  { key: 'customer_problem', label: '실제 사용자 문제' },
  { key: 'funnel_application', label: '퍼널 적용 (현상·욕구·계획·행동·보상)' },
]

// 새 창에 주입되는 HTML이므로 사용자 데이터는 반드시 이스케이프한다.
function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function candidateCard(c: KeyContentCandidate, idx: number): string {
  const reasons = REASON_LABELS.map(({ key, label }) => `
    <tr>
      <th>${esc(label)}</th>
      <td>${esc(c.selection_reasons?.[key] ?? '—')}</td>
    </tr>`).join('')
  return `
  <section class="card">
    <div class="card-head">
      <span class="badge">후보 ${idx + 1}</span>
      <h2>${esc(c.title)}</h2>
    </div>
    <p class="promise"><strong>썸네일 약속</strong> · ${esc(c.thumbnail_promise)}</p>
    <table class="reasons">
      <tbody>${reasons}</tbody>
    </table>
  </section>`
}

/**
 * 후보 3개와 프로젝트 제목으로 보고서 HTML 문서를 만든다.
 * 반환값은 완전한 <html> 문서 문자열(새 창에 그대로 write).
 */
export function buildKeyContentReportHtml(
  candidates: KeyContentCandidate[],
  projectTitle: string,
): string {
  const cards = candidates.length
    ? candidates.map((c, i) => candidateCard(c, i)).join('')
    : '<p class="empty">아직 후보가 없습니다.</p>'

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>키 콘텐츠 보고서 — ${esc(projectTitle)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 20px 64px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Apple SD Gothic Neo', sans-serif;
    color: #1c1b18; background: #f7f5f1; line-height: 1.6;
  }
  .wrap { max-width: 880px; margin: 0 auto; }
  header { margin-bottom: 28px; }
  .overline { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #8a8478; font-weight: 700; }
  h1 { font-size: 26px; margin: 6px 0 0; font-weight: 600; }
  .card {
    background: #fff; border: 1px solid #e4e0d8; border-left: 4px solid #b5894f;
    border-radius: 10px; padding: 22px 24px; margin-bottom: 18px;
  }
  .card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .badge {
    flex-shrink: 0; font-size: 11px; font-weight: 700; color: #fff; background: #b5894f;
    padding: 3px 9px; border-radius: 999px; letter-spacing: 0.04em;
  }
  h2 { font-size: 19px; margin: 0; font-weight: 600; }
  .promise { margin: 0 0 14px; font-size: 14px; color: #56514a; }
  .promise strong { color: #1c1b18; }
  table.reasons { width: 100%; border-collapse: collapse; }
  table.reasons th, table.reasons td {
    text-align: left; vertical-align: top; padding: 9px 12px; font-size: 13.5px;
    border-top: 1px solid #efece5;
  }
  table.reasons th {
    width: 200px; color: #8a8478; font-weight: 700; font-size: 12px;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .empty { color: #8a8478; font-size: 14px; }
  @media print { body { background: #fff; } .card { break-inside: avoid; } }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="overline">CMO · 키 콘텐츠 보고서</div>
      <h1>${esc(projectTitle)}</h1>
    </header>
    ${cards}
  </div>
</body>
</html>`
}
