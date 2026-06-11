// 2026-06-11 — viewtrap 탭 복구 + 상태 진단 (풀링 보고서 0건 수집 대응)
// 동작:
//   1) CDP(9222) 연결 → 열린 탭 목록 진단
//   2) app.viewtrap.com 탭이 없으면 새 탭으로 video-search 열기
//      (구글 OAuth 쿠키가 chrome-cdp 프로필에 persist → 자동 재로그인. 기존 탭은 절대 reload/goto 안 함.)
//   3) 로그인/검색입력/테이블 상태 확인 → JSON 보고
//   4) 끝나면 창 다시 숨김(offscreen+minimized)
//
// 실행: node services/youtube/scripts/viewtrap-recover.mjs

import { connectCdp, DEFAULT_CDP_ENDPOINT } from '../dist/index.js';

const out = { endpoint: DEFAULT_CDP_ENDPOINT, steps: [] };
let session;
try {
  session = await connectCdp({ endpoint: DEFAULT_CDP_ENDPOINT, moveOffscreen: false });
  out.steps.push('CDP 연결 OK');
} catch (e) {
  out.error = `CDP 연결 실패: ${e?.message ?? e} — launchctl kickstart -k gui/$(id -u)/com.l5.cdp-chrome 후 재시도`;
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

const pages = session.context.pages();
out.tabs = pages.map((p) => p.url().slice(0, 90));

let vt = pages.find((p) => p.url().includes('app.viewtrap.com'));
if (!vt) {
  out.steps.push('viewtrap 탭 없음 → 새 탭으로 video-search 열기 (OAuth 자동 재로그인 기대)');
  vt = await session.context.newPage();
  await vt.goto('https://app.viewtrap.com/video-search', { timeout: 30_000 });
  await vt.waitForTimeout(15_000); // OAuth 리다이렉트 + SPA 부팅 대기
} else {
  out.steps.push(`viewtrap 탭 존재: ${vt.url().slice(0, 90)}`);
}

// 상태 진단 (이미 열린 탭은 이동/새로고침 없이 DOM만 읽음)
const probe = await vt.evalExpr(`(() => {
  const inputs = [...document.querySelectorAll('input')];
  const searchInput = inputs.find(i => (i.placeholder || '').length > 0) || inputs[0] || null;
  const rows = document.querySelectorAll('tr').length;
  const bodyText = (document.body && document.body.innerText || '').slice(0, 400);
  const hasLoginHint = /로그인|sign in|구글로 시작/i.test(bodyText);
  return JSON.stringify({
    url: location.href,
    inputs: inputs.length,
    searchInputValue: searchInput ? searchInput.value : null,
    tableRows: rows,
    hasLoginHint,
    bodySample: bodyText.slice(0, 150),
  });
})()`);
out.viewtrap = JSON.parse(probe);

// 로그인 안 된 상태로 보이면 한 번 더 대기 후 재확인 (OAuth 리다이렉트 지연 케이스)
if (out.viewtrap.hasLoginHint) {
  out.steps.push('로그인 힌트 감지 — 20초 추가 대기 후 재확인');
  await vt.waitForTimeout(20_000);
  const probe2 = await vt.evalExpr(`(() => {
    const bodyText = (document.body && document.body.innerText || '').slice(0, 400);
    return JSON.stringify({ url: location.href, stillLogin: /로그인|sign in|구글로 시작/i.test(bodyText), bodySample: bodyText.slice(0, 150) });
  })()`);
  out.recheck = JSON.parse(probe2);
}

out.verdict = out.viewtrap.url.includes('app.viewtrap.com') && !((out.recheck ?? out.viewtrap).stillLogin ?? out.viewtrap.hasLoginHint)
  ? 'OK — viewtrap 사용 가능 (보고서 재생성 가능)'
  : 'LOGIN_REQUIRED — chrome-cdp 창에서 구글 로그인 1회 필요';

// 창 다시 숨김
for (const p of session.context.pages()) {
  try { await p.moveOffscreen(); } catch { /* ignore */ }
}
try { await session.browser.close(); } catch { /* ignore */ }

console.log(JSON.stringify(out, null, 2));
