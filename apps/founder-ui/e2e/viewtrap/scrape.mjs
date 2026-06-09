// R5 Viewtrap 자동화 — 저장된 세션으로 검색 + 스크래핑.
//
// login.mjs가 저장한 로그인 세션(storageState)을 로드해 로그인 상태로 /video-search를
// 검색한다. 비밀번호/OAuth는 일절 다루지 않는다.
//
// 산출: 각 결과를 l5-core의 ReferenceCandidate shape(packages/l5-core .../video-room/types.ts)로
// 매핑한 JSON 배열을 stdout에 출력. --out <path>로 파일 저장 가능.
// 이 JSON을 l5-core viewtrapScrapeAdapter(...)에 그대로 먹이면 ReferenceSourceAdapter가 된다.
//
// 사용:
//   corepack pnpm exec node e2e/viewtrap/scrape.mjs "검색어"
//   corepack pnpm exec node e2e/viewtrap/scrape.mjs "검색어" --discover   (선택자 튜닝용)
//   corepack pnpm exec node e2e/viewtrap/scrape.mjs "검색어" --headed --out /tmp/refs.json

import { chromium } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const SEARCH_URL = 'https://app.viewtrap.com/video-search';
const SESSION_PATH =
  process.env.VIEWTRAP_SESSION ?? path.join(os.homedir(), '.l5', 'viewtrap-session.json');
const DISCOVER_SCREENSHOT = '/tmp/viewtrap-discover.png';

// ── SELECTORS: discover 모드로 추후 확정한다(현재는 추정 placeholder). ─────────────
// 로그인 세션 없이 DOM을 확인할 수 없어, 아직 실 선택자를 모른다. 먼저 login.mjs로
// 로그인한 뒤 `scrape.mjs "검색어" --discover`를 돌려 반복 카드 구조를 탐색하고,
// 그 결과로 아래 값을 교체하라. (results=반복 카드 컨테이너, 나머지는 카드 내부 상대 선택자)
const SELECTORS = {
  search: 'input[type="search"], input[type="text"]',
  results: '[class*="card"], [class*="result"], [class*="video"]',
  title: '[class*="title"]',
  views: '[class*="view"]',
  url: 'a[href]',
  thumbnail: 'img',
};

function parseArgs(argv) {
  const rest = argv.slice(2);
  const flags = { discover: false, headed: false, out: null };
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--discover') flags.discover = true;
    else if (a === '--headed') flags.headed = true;
    else if (a === '--out') {
      flags.out = rest[i + 1] ?? null;
      i++;
    } else positional.push(a);
  }
  return { query: positional.join(' ').trim(), flags };
}

function parseViewCount(text) {
  if (!text) return undefined;
  const m = String(text).replace(/,/g, '').match(/[\d.]+/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

async function main() {
  const { query, flags } = parseArgs(process.argv);

  if (!query) {
    console.error('검색어가 필요합니다. 예: node e2e/viewtrap/scrape.mjs "마케팅 대행사"');
    process.exit(1);
  }

  // 로그인과 동일한 영속 Chrome 프로필을 재사용한다(storageState는 viewtrap 인증이 이식 안 됨).
  const PROFILE_DIR = process.env.VIEWTRAP_CHROME_PROFILE ?? path.join(os.homedir(), '.l5', 'viewtrap-chrome-profile');
  if (!fs.existsSync(PROFILE_DIR)) {
    console.error(
      `로그인 프로필이 없습니다(${PROFILE_DIR}).\n먼저 로그인하세요: VTG_EMAIL=... VTG_PASS=... corepack pnpm exec node e2e/viewtrap-google-login.mjs`,
    );
    process.exit(3);
  }

  const baseOpts = { headless: !flags.headed, viewport: { width: 1280, height: 900 }, args: ['--disable-blink-features=AutomationControlled'] };
  let context;
  try { context = await chromium.launchPersistentContext(PROFILE_DIR, { ...baseOpts, channel: 'chrome' }); }
  catch { context = await chromium.launchPersistentContext(PROFILE_DIR, baseOpts); }
  await context.addInitScript(() => { try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) } catch {} });
  const browser = context;
  const page = context.pages()[0] ?? await context.newPage();

  try {
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.error('검색 페이지 이동 실패:', String(e).slice(0, 160));
    await browser.close();
    process.exit(1);
  }

  await page.waitForTimeout(2500);

  if (page.url().includes('/auth/login')) {
    console.error('세션 만료 — login.mjs를 재실행해 로그인하세요.');
    await browser.close();
    process.exit(3);
  }

  // 검색어 입력 → 검색 실행.
  try {
    const searchBox = page.locator(SELECTORS.search).first();
    await searchBox.fill(query, { timeout: 15000 });
    await searchBox.press('Enter');
  } catch (e) {
    if (!flags.discover) {
      console.error('검색창을 찾지 못했습니다. --discover 모드로 선택자를 확인하세요:', String(e).slice(0, 120));
    }
  }

  // 결과 로딩 대기(graceful — 빈 결과도 허용).
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    /* networkidle 미도달 — 계속 진행 */
  }
  await page.waitForTimeout(2000);

  if (flags.discover) {
    await runDiscover(page);
    await browser.close();
    return;
  }

  // 일반 모드: SELECTORS로 결과 추출 → ReferenceCandidate shape 매핑.
  const cards = page.locator(SELECTORS.results);
  let count = 0;
  try {
    count = await cards.count();
  } catch {
    count = 0;
  }

  const candidates = [];
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const title = (await card.locator(SELECTORS.title).first().innerText().catch(() => '')).trim();
    if (!title) continue; // 제목 없는 노이즈 카드 스킵
    const viewsText = await card.locator(SELECTORS.views).first().innerText().catch(() => '');
    const url = (await card.locator(SELECTORS.url).first().getAttribute('href').catch(() => '')) || '';
    const thumb = (await card.locator(SELECTORS.thumbnail).first().getAttribute('src').catch(() => '')) || '';

    // ReferenceCandidate shape (types.ts). 인덱스 기반 결정론 id (시각/랜덤 금지).
    candidates.push({
      id: `viewtrap-${i}`,
      research_session_id: '',
      title,
      url,
      source: 'viewtrap',
      view_count: parseViewCount(viewsText),
      thumbnail_ref: thumb || undefined,
      consumer_stage: '현상',
      selected_for: 'key_content',
      selection_reason: '',
    });
  }

  const json = JSON.stringify(candidates, null, 2);
  if (flags.out) {
    fs.writeFileSync(flags.out, json);
    console.error(`결과 ${candidates.length}건 저장: ${flags.out}`);
  }
  process.stdout.write(json + '\n');

  if (candidates.length === 0) {
    console.error('빈 결과입니다. SELECTORS가 실제 DOM과 다를 수 있습니다 — --discover로 확인하세요.');
  }

  await browser.close();
}

async function runDiscover(page) {
  console.error('=== DISCOVER 모드: 반복 카드 구조 탐색 ===');
  await page.screenshot({ path: DISCOVER_SCREENSHOT, fullPage: true }).catch(() => {});
  console.error(`스크린샷 저장: ${DISCOVER_SCREENSHOT}`);

  // 반복되는 카드 구조 후보: 같은 class를 가진 형제가 여럿인 컨테이너를 찾는다.
  const candidates = await page
    .evaluate(() => {
      const counts = {};
      document.querySelectorAll('*').forEach((el) => {
        const cls = (el.getAttribute('class') || '').trim();
        if (!cls) return;
        const tag = el.tagName.toLowerCase();
        const key = `${tag}.${cls.split(/\s+/).join('.')}`;
        counts[key] = (counts[key] || 0) + 1;
      });
      return Object.entries(counts)
        .filter(([, n]) => n >= 3 && n <= 100)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([sel, n]) => ({ selector: sel, count: n }));
    })
    .catch(() => []);

  console.error('반복 선택자 후보(count 내림차순):');
  for (const c of candidates) console.error(`  [${c.count}] ${c.selector}`);

  // 가장 유력한 컨테이너의 outerHTML 일부 덤프(부모 추정).
  if (candidates.length > 0) {
    const top = candidates[0].selector;
    const dump = await page
      .evaluate((sel) => {
        const first = document.querySelector(sel.replace(/^[a-z]+/, (m) => m));
        const el = first || document.body;
        return (el.outerHTML || '').slice(0, 2500);
      }, top)
      .catch(() => '');
    console.error('\n=== 최상위 후보 카드 outerHTML(앞 2500자) ===');
    console.error(dump);
  }
  console.error('\n위 후보를 보고 scrape.mjs 상단 SELECTORS를 실 선택자로 교체하세요.');
}

main().catch((e) => {
  console.error('예기치 못한 오류:', e);
  process.exit(1);
});
