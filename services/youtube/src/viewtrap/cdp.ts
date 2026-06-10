// CMO M1 — 로그인된 크롬을 CDP로 운전해 Viewtrap을 크롤링하는 라이브 드라이버.
// 실증 원본: /tmp/cdp-fullscrape.mjs · cdp-yt-scrape.mjs (2026-06-10).
// 셀렉터·함정 실측 = docs/cmo/features/youtube-viewtrap-discovery.md
//
// 함정 (반드시 지킬 것):
// - 크롬 기동은 복사 프로필(~/chrome-cdp) + --remote-debugging-port=9222 (Chrome 136+는
//   기본 user-data-dir로 디버깅 거부). 이 모듈은 크롬을 띄우지 않는다 — 연결만 한다.
// - Viewtrap 인증은 인메모리 → app.viewtrap.com 탭은 절대 reload/goto 금지(로그아웃).
//   in-app 클릭/타이핑만 한다.
// - playwright는 이 패키지에 설치하지 않고 apps/nocobase-app node_modules를 createRequire로 빌린다.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseExtensionCards, parseVideoSearchRows, normalizeGrade } from './parse.js';
import type {
  ExtensionMetricsRow,
  RawExtensionCard,
  RawTableRow,
  VideoSearchRow,
} from './types.js';

export const DEFAULT_CDP_ENDPOINT = 'http://localhost:9222';

// ── playwright 구조 최소 타입 (직접 의존 없이 구조적으로만 사용) ─────────────

export interface CdpLocator {
  first(): CdpLocator;
  count(): Promise<number>;
  click(options?: { timeout?: number }): Promise<void>;
  innerText(options?: { timeout?: number }): Promise<string>;
}

export interface CdpPage {
  url(): string;
  bringToFront(): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  press(selector: string, key: string): Promise<void>;
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  evaluate<R>(fn: () => R): Promise<R>;
  locator(selector: string): CdpLocator;
}

export interface CdpContext {
  pages(): CdpPage[];
  newPage(): Promise<CdpPage>;
}

export interface CdpBrowser {
  contexts(): CdpContext[];
  /** connectOverCDP에서 close()는 연결 해제만 — 실제 크롬은 살아 있다. */
  close(): Promise<void>;
}

export interface CdpSession {
  browser: CdpBrowser;
  context: CdpContext;
}

// ── 연결 ─────────────────────────────────────────────────────────────────────

export interface ConnectCdpOptions {
  endpoint?: string;
  /** playwright 설치 디렉토리. 기본 = 레포의 apps/nocobase-app. */
  playwrightDir?: string;
}

/**
 * 이 모듈의 URL. 진짜 ESM(tsc/런타임)에서는 import.meta.url.
 * ts-jest 가 module=CommonJS 로 컴파일할 때 import.meta 토큰이 구문 오류를 내므로
 * (이 패키지 jest.config.cjs), 정적 분석을 피하려고 간접 평가로 읽고 CJS 폴백을 둔다.
 */
function thisModuleUrl(): string | null {
  try {
    // eslint-disable-next-line no-new-func
    return new Function('return import.meta.url')() as string;
  } catch {
    return null; // CommonJS 컨텍스트(테스트 변환). 실 CDP 연결은 ESM 런타임에서만 한다.
  }
}

function loadChromium(playwrightDir?: string): { connectOverCDP(endpoint: string): Promise<CdpBrowser> } {
  // src/viewtrap/ 와 dist/viewtrap/ 모두 레포 루트까지 4단계 위.
  let base = playwrightDir;
  if (!base) {
    const moduleUrl = thisModuleUrl();
    base = moduleUrl
      ? fileURLToPath(new URL('../../../../apps/nocobase-app/', moduleUrl))
      : `${process.cwd()}/apps/nocobase-app/`;
  }
  const requireFrom = createRequire(base.endsWith('/') ? `${base}package.json` : base);
  return requireFrom('playwright').chromium;
}

export async function connectCdp(options: ConnectCdpOptions = {}): Promise<CdpSession> {
  const chromium = loadChromium(options.playwrightDir);
  const browser = await chromium.connectOverCDP(options.endpoint ?? DEFAULT_CDP_ENDPOINT);
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    await browser.close();
    throw new Error(
      'CDP 연결됐지만 브라우저 컨텍스트가 없음 — 복사 프로필(~/chrome-cdp)로 띄운 크롬인지 확인',
    );
  }
  return { browser, context: contexts[0] };
}

function findPage(context: CdpContext, urlPart: string): CdpPage | undefined {
  return context.pages().find((p) => p.url().includes(urlPart));
}

// ── Viewtrap 사이트 테이블 (app.viewtrap.com/video-search) ──────────────────

const SEARCH_INPUT = 'input[name="search"]';
const TABLE_ROWS = 'table tbody tr';
/** 노출확률 컬럼 = 9번째(1-based). 실측 컬럼표 = parse.ts TABLE_COLUMNS. */
const EXPOSURE_CELL_NTH = 9;

export interface ScrapeVideoSearchOptions {
  /** 검색 후 테이블 안정화 대기(ms). 기본 1500. */
  settleMs?: number;
  timeoutMs?: number;
}

/**
 * Viewtrap 검색창에 query 입력 → 결과 테이블 파싱.
 * 이미 열려 있는 app.viewtrap.com 탭만 사용한다(없으면 throw — 새 탭/이동 금지).
 */
export async function scrapeVideoSearchTable(
  session: CdpSession,
  query: string,
  options: ScrapeVideoSearchOptions = {},
): Promise<VideoSearchRow[]> {
  const page = findPage(session.context, 'app.viewtrap.com');
  if (!page) {
    throw new Error(
      'app.viewtrap.com 탭이 없음 — 로그인된 크롬에서 video-search 페이지를 열어두세요 (이 모듈은 로그아웃 위험 때문에 탭을 새로 열거나 이동하지 않습니다)',
    );
  }
  await page.bringToFront();

  const timeout = options.timeoutMs ?? 20_000;
  await page.waitForSelector(SEARCH_INPUT, { timeout });
  await page.fill(SEARCH_INPUT, query);
  await page.press(SEARCH_INPUT, 'Enter');
  await page.waitForSelector(TABLE_ROWS, { timeout });
  await page.waitForTimeout(options.settleMs ?? 1_500);

  const raws = await page.evaluate((): RawTableRow[] => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    return rows.map((tr) => ({
      cells: Array.from(tr.querySelectorAll('td')).map((td) =>
        (td as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
      ),
      thumbnailSrc: tr.querySelector('img')?.getAttribute('src') ?? null,
    }));
  });
  return parseVideoSearchRows(raws);
}

export interface ExposureClickOptions {
  /** 한 번에 클릭할 최대 행 수 (Viewtrap 한도 보호). 기본 10. */
  maxClicks?: number;
  /** 클릭 후 값 로드 폴링 시간(ms). 기본 8000. */
  waitMs?: number;
}

/**
 * 노출확률 미로드(null) 행의 버튼을 클릭해 값을 채운다 (기본 "-" → 등급).
 * 입력 rows는 변형하지 않고, exposure가 채워진 새 배열을 반환한다.
 * 버튼이 없거나 시간 내 값이 안 뜨면 해당 행은 null 유지(부분 실패 허용).
 */
export async function clickExposureProbability(
  session: CdpSession,
  rows: VideoSearchRow[],
  options: ExposureClickOptions = {},
): Promise<VideoSearchRow[]> {
  const page = findPage(session.context, 'app.viewtrap.com');
  if (!page) {
    throw new Error('app.viewtrap.com 탭이 없음 — scrapeVideoSearchTable과 같은 세션에서 호출하세요');
  }
  await page.bringToFront();

  const maxClicks = options.maxClicks ?? 10;
  const waitMs = options.waitMs ?? 8_000;
  const result = rows.map((row) => ({ ...row }));
  let clicks = 0;

  for (const row of result) {
    if (row.exposure !== null) continue;
    if (clicks >= maxClicks) break;

    const rowSelector = `table tbody tr:has(img[src*="${row.videoId}"])`;
    const cell = page.locator(`${rowSelector} td:nth-child(${EXPOSURE_CELL_NTH})`).first();
    const button = page
      .locator(`${rowSelector} td:nth-child(${EXPOSURE_CELL_NTH}) button`)
      .first();
    try {
      if ((await button.count()) === 0) continue;
      await button.click({ timeout: 3_000 });
      clicks += 1;
      // 값 로드 폴링: "-"/버튼 → 등급 텍스트
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        const text = (await cell.innerText({ timeout: 2_000 })).trim();
        const grade = normalizeGrade(text);
        if (grade !== null) {
          row.exposure = grade;
          break;
        }
        await page.waitForTimeout(500);
      }
    } catch {
      // 부분 실패 허용: 이 행은 exposure null 유지
    }
  }
  return result;
}

// ── YouTube 검색결과 + Viewtrap 확장 주입 지표 ───────────────────────────────

export interface ScrapeYoutubeExtensionOptions {
  /** 확장이 shadow DOM에 지표를 주입할 시간(ms). 기본 2500. */
  settleMs?: number;
  timeoutMs?: number;
}

/**
 * YouTube 검색결과 페이지에서 Viewtrap 확장이 주입한 기여도/성과도를 추출.
 * youtube.com 탭을 재사용(없으면 새 탭)해 검색결과 URL로 이동한다 —
 * YouTube 탭 이동은 안전(인메모리 인증 제약은 app.viewtrap.com 탭에만 해당).
 */
export async function scrapeYoutubeSearchExtension(
  session: CdpSession,
  query: string,
  options: ScrapeYoutubeExtensionOptions = {},
): Promise<ExtensionMetricsRow[]> {
  let page = findPage(session.context, 'youtube.com');
  if (!page) page = await session.context.newPage();
  await page.bringToFront();

  const timeout = options.timeoutMs ?? 20_000;
  await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
    waitUntil: 'domcontentloaded',
    timeout,
  });
  await page.waitForSelector('ytd-video-renderer, ytd-rich-item-renderer', { timeout });
  await page.waitForTimeout(options.settleMs ?? 2_500);

  const raws = await page.evaluate((): RawExtensionCard[] => {
    // shadow DOM 재귀 순회(deepWalk) — 확장 주입 <dt>기여도</dt><dd>Good</dd> 추출.
    function* deepWalk(node: Element | ShadowRoot): Generator<Element | ShadowRoot> {
      yield node;
      if ((node as Element).shadowRoot) yield* deepWalk((node as Element).shadowRoot as ShadowRoot);
      for (const child of Array.from(node.children ?? [])) yield* deepWalk(child);
    }
    const cards = Array.from(
      document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer'),
    );
    const out: RawExtensionCard[] = [];
    for (const card of cards) {
      const titleAnchor = card.querySelector<HTMLAnchorElement>('a#video-title, a#video-title-link');
      const href =
        titleAnchor?.href ?? card.querySelector<HTMLAnchorElement>('a[href*="/watch"]')?.href ?? '';
      const title = (card.querySelector<HTMLElement>('#video-title')?.innerText ?? '').trim();
      const metaText =
        card.querySelector<HTMLElement>('#metadata-line, .inline-metadata-item')?.innerText ??
        (card as HTMLElement).innerText ??
        '';
      const metrics: Record<string, string> = {};
      let lastDt: string | null = null;
      for (const el of deepWalk(card)) {
        const tagName = (el as Element).tagName ?? '';
        if (tagName !== 'DT' && tagName !== 'DD') continue;
        const own = Array.from(el.childNodes ?? [])
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent ?? '')
          .join('')
          .trim();
        if (tagName === 'DT' && /기여도|성과도|노출/.test(own)) lastDt = own;
        else if (tagName === 'DD' && lastDt) {
          metrics[lastDt] = own;
          lastDt = null;
        }
      }
      out.push({ href, title, metaText, metrics });
    }
    return out;
  });
  return parseExtensionCards(raws);
}
