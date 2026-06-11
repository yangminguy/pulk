// CMO M1 — 로그인된 크롬을 raw CDP로 운전해 Viewtrap/YouTube를 크롤링하는 라이브 드라이버.
// 실증 원본(라이브 검증 2026-06-10):
//   /tmp/cdp-verified-ref/cdp-raw-check.mjs    — page WebSocket + Runtime.evaluate
//   /tmp/cdp-verified-ref/cdp-vt-crawl2.mjs    — viewtrap 사이트 테이블(3단계)
//   /tmp/cdp-verified-ref/cdp-yt-deepwalk.mjs  — YouTube 플러그인 shadow DOM(2단계)
//   /tmp/cdp-verified-ref/cdp-hide-all.mjs     — 화면 밖(-4000px) 이동
// 셀렉터·함정 실측 = docs/cmo/features/youtube-viewtrap-discovery.md
//
// 왜 raw CDP인가:
// - 크롬 149는 playwright connectOverCDP가 Browser.setDownloadBehavior를 거부해 실패한다.
//   → /json/list의 webSocketDebuggerUrl에 WebSocket을 직접 붙이고 Runtime.evaluate만 쓴다.
//
// 함정 (반드시 지킬 것):
// - 크롬 기동은 복사 프로필(~/chrome-cdp) + --remote-debugging-port=9222. 이 모듈은 띄우지 않는다.
// - 연결 직후 모든 창을 화면 밖(-4000px)으로 이동(.claude/rules/50-ui-playwright.md — 화면 점유 금지).
//   Page.bringToFront / 양수 좌표 setWindowBounds 금지. 스크린샷은 화면 밖에서 captureScreenshot.
// - Viewtrap 인증은 인메모리 → app.viewtrap.com 탭은 절대 reload/goto 금지(로그아웃).
//   in-app 검색(컨트롤드 input setter + Enter)만 한다.
// - WebSocket은 Node 전역(node 18+) 또는 apps/nocobase-app의 ws 를 빌려 쓴다.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseExtensionCards, parseVideoSearchRows, normalizeGrade } from './parse.js';
import type {
  ExtensionMetricsRow,
  RawExtensionCard,
  RawTableRow,
  VideoSearchRow,
  ViewtrapGrade,
} from './types.js';

export const DEFAULT_CDP_ENDPOINT = 'http://localhost:9222';
const OFFSCREEN_LEFT = -4000;

// ── 공개 인터페이스 (adapter.ts / 테스트 fake 와 구조 호환 유지) ──────────────

export interface CdpLocator {
  first(): CdpLocator;
  count(): Promise<number>;
  click(options?: { timeout?: number }): Promise<void>;
  innerText(options?: { timeout?: number }): Promise<string>;
}

export interface CdpPage {
  url(): string;
  /** raw CDP에서는 no-op(화면 밖 유지). 인터페이스 호환을 위해 남긴다. */
  bringToFront(): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  press(selector: string, key: string): Promise<void>;
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  evaluate<R>(fn: () => R): Promise<R>;
  locator(selector: string): CdpLocator;
  /** raw 확장: 임의 JS 식 평가. */
  evalExpr<R>(expression: string): Promise<R>;
  /** raw 확장: 화면 밖에서 PNG 스크린샷(base64). */
  screenshot(): Promise<string>;
  /** raw 확장: 이 페이지가 속한 창을 화면 밖으로. */
  moveOffscreen(): Promise<void>;
  /** raw 확장: 이 페이지 창을 화면 안(normal)으로 + 앞으로. viewtrap 검색의 trusted 키 입력용. */
  bringOnscreen(): Promise<void>;
  /**
   * raw 확장: 요소를 찾아 **trusted 마우스 클릭**(Input.dispatchMouseEvent). findExpr는 요소를 반환하는
   * JS 식(예: `[...document.querySelectorAll('button')].find(b=>/확인/.test(b.innerText))`).
   * viewtrap의 검색(돋보기)·확인 모달·노출확률 버튼은 합성 click()을 무시하고 trusted 클릭만 받는다(실측).
   * 요소 없거나 보이지 않으면 false.
   */
  trustedClick?(findExpr: string): Promise<boolean>;
}

export interface CdpContext {
  pages(): CdpPage[];
  newPage(): Promise<CdpPage>;
}

export interface CdpBrowser {
  contexts(): CdpContext[];
  close(): Promise<void>;
}

export interface CdpSession {
  browser: CdpBrowser;
  context: CdpContext;
}

// ── raw CDP 저수준 ────────────────────────────────────────────────────────────

type WsCtor = new (url: string) => WsLike;
interface WsLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'message' | 'error' | 'close', cb: (ev: { data?: string }) => void): void;
}

interface CdpTargetInfo {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

function loadWebSocket(playwrightDir?: string): WsCtor {
  const g = globalThis as unknown as { WebSocket?: WsCtor };
  if (typeof g.WebSocket === 'function') return g.WebSocket;
  // 폴백: ws 패키지(apps/nocobase-app node_modules).
  let base = playwrightDir;
  if (!base) {
    const moduleUrl = thisModuleUrl();
    base = moduleUrl
      ? fileURLToPath(new URL('../../../../apps/nocobase-app/', moduleUrl))
      : `${process.cwd()}/apps/nocobase-app/`;
  }
  const requireFrom = createRequire(base.endsWith('/') ? `${base}package.json` : base);
  return requireFrom('ws') as WsCtor;
}

function thisModuleUrl(): string | null {
  try {
    // eslint-disable-next-line no-new-func
    return new Function('return import.meta.url')() as string;
  } catch {
    return null;
  }
}

/** 한 page 타겟의 WebSocket 세션. id 매칭으로 명령/응답 짝을 맞춘다. */
/** CDP RPC 기본 타임아웃. 응답 유실(탭 파괴·네비게이션 중 evaluate·ws 단절) 시
 * pending이 영원히 안 풀려 상위 워크플로우 전체가 행되는 사고 방지(2026-06-11 실측). */
export const CDP_RPC_TIMEOUT_MS = 60_000;

class RawCdpConnection {
  private ws: WsLike;
  private id = 0;
  private pending = new Map<number, { res: (msg: Record<string, unknown>) => void; rej: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private opened: Promise<void>;
  private closed = false;

  constructor(WsImpl: WsCtor, wsUrl: string) {
    this.ws = new WsImpl(wsUrl);
    this.opened = new Promise<void>((res, rej) => {
      this.ws.addEventListener('open', () => res());
      this.ws.addEventListener('error', () => rej(new Error(`CDP WebSocket 연결 실패: ${wsUrl}`)));
    });
    this.ws.addEventListener('message', (ev) => {
      if (!ev.data) return;
      const m = JSON.parse(ev.data) as { id?: number };
      if (typeof m.id === 'number' && this.pending.has(m.id)) {
        const p = this.pending.get(m.id)!;
        this.pending.delete(m.id);
        clearTimeout(p.timer);
        p.res(m as Record<string, unknown>);
      }
    });
    // ws가 끊기면 대기 중인 모든 RPC를 즉시 reject(무한 대기 금지).
    const failAll = (why: string) => {
      this.closed = true;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.rej(new Error(`CDP 연결 종료(${why}) — RPC 응답 불가`));
      }
      this.pending.clear();
    };
    this.ws.addEventListener('close', () => failAll('close'));
    this.ws.addEventListener('error', () => failAll('error'));
  }

  async ready(): Promise<void> {
    await this.opened;
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs: number = CDP_RPC_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> {
    if (this.closed) return Promise.reject(new Error('CDP 연결이 이미 종료됨'));
    const i = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        if (this.pending.has(i)) {
          this.pending.delete(i);
          rej(new Error(`CDP RPC 타임아웃(${timeoutMs}ms): ${method}`));
        }
      }, timeoutMs);
      this.pending.set(i, { res, rej, timer });
      try {
        this.ws.send(JSON.stringify({ id: i, method, params }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(i);
        rej(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  close(): void {
    this.closed = true;
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** RawCdpConnection 위에 CdpPage 인터페이스를 구현. */
class RawCdpPage implements CdpPage {
  constructor(
    private conn: RawCdpConnection,
    private currentUrl: string,
  ) {}

  static async create(WsImpl: WsCtor, info: CdpTargetInfo): Promise<RawCdpPage> {
    const conn = new RawCdpConnection(WsImpl, info.webSocketDebuggerUrl);
    await conn.ready();
    await conn.send('Runtime.enable');
    await conn.send('Page.enable').catch(() => undefined);
    return new RawCdpPage(conn, info.url);
  }

  url(): string {
    return this.currentUrl;
  }

  async bringToFront(): Promise<void> {
    // 의도적 no-op — 화면 밖 유지(.claude/rules/50). 창을 앞으로 끌어내지 않는다.
  }

  async waitForTimeout(ms: number): Promise<void> {
    await sleep(ms);
  }

  async evalExpr<R>(expression: string): Promise<R> {
    const r = (await this.conn.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result?: { result?: { value?: unknown } } };
    return r.result?.result?.value as R;
  }

  async evaluate<R>(fn: () => R): Promise<R> {
    // 인자 없는 함수만 지원(스크래퍼는 클로저 없는 fn 사용). 함수 본문을 IIFE로 평가.
    const expr = `(${fn.toString()})()`;
    return this.evalExpr<R>(expr);
  }

  private jsonStr(s: string): string {
    return JSON.stringify(s);
  }

  async waitForSelector(selector: string, options: { timeout?: number } = {}): Promise<unknown> {
    const deadline = Date.now() + (options.timeout ?? 20_000);
    const sel = this.jsonStr(selector);
    while (Date.now() < deadline) {
      const found = await this.evalExpr<boolean>(`!!document.querySelector(${sel})`);
      if (found) return true;
      await sleep(250);
    }
    throw new Error(`waitForSelector 타임아웃: ${selector}`);
  }

  /**
   * React 컨트롤드 input에 값 주입: native value setter로 값을 세팅하고
   * input 이벤트를 디스패치한다(단순 .value= 는 React가 되돌림). cdp-vt-crawl2.mjs 패턴.
   */
  async fill(selector: string, value: string): Promise<void> {
    const sel = this.jsonStr(selector);
    const val = this.jsonStr(value);
    await this.evalExpr(`(() => {
      const el = document.querySelector(${sel});
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${val});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
  }

  /**
   * 키 입력. Enter는 CDP Input.dispatchKeyEvent로 **trusted** 이벤트를 보낸다 —
   * React 검색 핸들러는 synthetic(isTrusted:false) KeyboardEvent를 무시하므로
   * (실측: 합성 Enter로는 viewtrap 검색이 트리거되지 않음) 신뢰 이벤트가 필요하다.
   * 다른 키는 합성 이벤트 폴백.
   */
  async press(selector: string, key: string): Promise<void> {
    const sel = this.jsonStr(selector);
    // 먼저 대상에 포커스(trusted 키는 포커스된 엘리먼트로 간다).
    await this.evalExpr(`(() => { const el = document.querySelector(${sel}); if (el) el.focus(); return !!el; })()`);
    if (key === 'Enter') {
      const common = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
      await this.conn.send('Input.dispatchKeyEvent', { type: 'keyDown', ...common });
      await this.conn.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
      return;
    }
    const k = this.jsonStr(key);
    await this.evalExpr(`(() => {
      const el = document.querySelector(${sel});
      if (!el) return false;
      el.focus();
      for (const type of ['keydown', 'keypress', 'keyup']) {
        el.dispatchEvent(new KeyboardEvent(type, { key: ${k}, code: ${k}, bubbles: true }));
      }
      return true;
    })()`);
  }

  async goto(url: string, options: { timeout?: number } = {}): Promise<unknown> {
    await this.conn.send('Page.navigate', { url });
    this.currentUrl = url;
    // domcontentloaded 근사: body 등장까지 폴링.
    const deadline = Date.now() + (options.timeout ?? 20_000);
    while (Date.now() < deadline) {
      const ready = await this.evalExpr<string>('document.readyState').catch(() => '');
      if (ready === 'interactive' || ready === 'complete') break;
      await sleep(200);
    }
    return true;
  }

  locator(selector: string): CdpLocator {
    return new RawCdpLocator(this, selector);
  }

  async screenshot(): Promise<string> {
    const r = (await this.conn.send('Page.captureScreenshot', { format: 'png' })) as {
      result?: { data?: string };
    };
    return r.result?.data ?? '';
  }

  async moveOffscreen(): Promise<void> {
    const win = (await this.conn.send('Browser.getWindowForTarget')) as {
      result?: { windowId?: number };
    };
    const wid = win.result?.windowId;
    if (wid) {
      // 화면 밖(-4000)으로 옮긴 뒤 최소화 — macOS는 -4000을 화면 경계로 클램프(40px 노출)하므로
      // minimized로 데스크톱에서 완전히 숨긴다. 크롤링은 Runtime.evaluate(DOM)이라 minimized에서도 동작.
      await this.conn.send('Browser.setWindowBounds', {
        windowId: wid,
        bounds: { left: OFFSCREEN_LEFT, top: 0, width: 1280, height: 900, windowState: 'normal' },
      });
      await this.conn.send('Browser.setWindowBounds', {
        windowId: wid,
        bounds: { windowState: 'minimized' },
      });
    }
  }

  async bringOnscreen(): Promise<void> {
    const win = (await this.conn.send('Browser.getWindowForTarget')) as {
      result?: { windowId?: number };
    };
    const wid = win.result?.windowId;
    if (wid) {
      // 화면 안(normal)으로 복귀 + 앞으로. viewtrap 검색은 trusted 키 입력(Input.dispatchKeyEvent)이
      // 활성 창을 요구하므로 minimized/화면밖에선 검색이 트리거되지 않는다(실측).
      await this.conn.send('Browser.setWindowBounds', {
        windowId: wid,
        bounds: { left: 80, top: 60, width: 1500, height: 950, windowState: 'normal' },
      });
      await this.conn.send('Page.bringToFront').catch(() => undefined);
    }
  }

  async trustedClick(findExpr: string): Promise<boolean> {
    // 요소를 찾아 중심 좌표 계산(+ 화면 안으로 스크롤). 보이지 않으면 null.
    const rectJson = await this.evalExpr<string | null>(`(() => {
      const el = (${findExpr});
      if (!el) return null;
      try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    })()`);
    if (!rectJson) return false;
    const { x, y } = JSON.parse(rectJson) as { x: number; y: number };
    await this.conn.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.conn.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.conn.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    return true;
  }

  /** 내부: locator가 식 평가를 위임받는다. */
  async _eval<R>(expression: string): Promise<R> {
    return this.evalExpr<R>(expression);
  }

  close(): void {
    this.conn.close();
  }
}

/** CSS selector 기반 최소 locator(첫 매치만). innerText/click/count 지원. */
class RawCdpLocator implements CdpLocator {
  constructor(
    private page: RawCdpPage,
    private selector: string,
  ) {}

  first(): CdpLocator {
    return this;
  }

  async count(): Promise<number> {
    const sel = JSON.stringify(this.selector);
    return this.page._eval<number>(`document.querySelectorAll(${sel}).length`);
  }

  async click(): Promise<void> {
    const sel = JSON.stringify(this.selector);
    const ok = await this.page._eval<boolean>(`(() => {
      const el = document.querySelector(${sel});
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`click 대상 없음: ${this.selector}`);
  }

  async innerText(): Promise<string> {
    const sel = JSON.stringify(this.selector);
    return this.page._eval<string>(`(() => {
      const el = document.querySelector(${sel});
      return el ? (el.innerText || el.textContent || '').trim() : '';
    })()`);
  }
}

// ── 연결 ─────────────────────────────────────────────────────────────────────

export interface ConnectCdpOptions {
  endpoint?: string;
  /** ws/playwright 설치 디렉토리. 기본 = 레포의 apps/nocobase-app. */
  playwrightDir?: string;
  /** 연결 직후 모든 창을 화면 밖으로 이동할지. 기본 true(화면 점유 금지). */
  moveOffscreen?: boolean;
}

interface RawCdpSessionInternal extends CdpSession {
  /** 열린 page 들(URL 매칭용). */
  _pages: RawCdpPage[];
  _wsCtor: WsCtor;
  _endpoint: string;
}

async function fetchTargets(endpoint: string): Promise<CdpTargetInfo[]> {
  const res = await fetch(`${endpoint}/json/list`);
  const list = (await res.json()) as CdpTargetInfo[];
  return list.filter((t) => t.type === 'page' && !!t.webSocketDebuggerUrl);
}

/**
 * raw CDP 세션 연결. 모든 page 타겟에 WebSocket을 붙이고, 즉시 화면 밖으로 이동한다.
 * page 타겟이 하나도 없으면 PUT /json/new?about:blank 로 하나 생성한다.
 */
export async function connectCdp(options: ConnectCdpOptions = {}): Promise<CdpSession> {
  const endpoint = options.endpoint ?? DEFAULT_CDP_ENDPOINT;
  const WsImpl = loadWebSocket(options.playwrightDir);

  let targets = await fetchTargets(endpoint);
  if (targets.length === 0) {
    await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' });
    await sleep(500);
    targets = await fetchTargets(endpoint);
    if (targets.length === 0) {
      throw new Error('CDP 연결됐지만 page 타겟이 없음 — 복사 프로필(~/chrome-cdp) 크롬인지 확인');
    }
  }

  const pages: RawCdpPage[] = [];
  for (const t of targets) {
    try {
      const p = await RawCdpPage.create(WsImpl, t);
      pages.push(p);
    } catch {
      // 일부 page 타겟(devtools 등)은 붙기 어려울 수 있음 — 건너뛴다.
    }
  }
  if (pages.length === 0) throw new Error('어떤 page 타겟에도 CDP WebSocket을 붙이지 못함');

  if (options.moveOffscreen !== false) {
    const movedWindows = new Set<number>();
    for (const p of pages) {
      try {
        await p.moveOffscreen();
        void movedWindows;
      } catch {
        /* ignore */
      }
    }
  }

  const context: CdpContext = {
    pages: () => session._pages,
    async newPage(): Promise<CdpPage> {
      await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' });
      await sleep(400);
      const fresh = await fetchTargets(endpoint);
      const known = new Set(session._pages.map((p) => p.url()));
      const info = fresh.find((t) => t.url === 'about:blank' || !known.has(t.url)) ?? fresh[0];
      const p = await RawCdpPage.create(WsImpl, info);
      if (options.moveOffscreen !== false) await p.moveOffscreen().catch(() => undefined);
      session._pages.push(p);
      return p;
    },
  };

  const browser: CdpBrowser = {
    contexts: () => [context],
    async close(): Promise<void> {
      for (const p of session._pages) p.close();
    },
  };

  const session: RawCdpSessionInternal = {
    browser,
    context,
    _pages: pages,
    _wsCtor: WsImpl,
    _endpoint: endpoint,
  };
  return session;
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
  /** 검색 결과 갱신 폴링 최대 대기(ms). 실측 ~20초 후 갱신 → 기본 30000. */
  resultWaitMs?: number;
}

/** 첫 행(td:nth-child(4) = 제목 셀) 텍스트 미리보기. 검색 전/후 비교용. */
const FIRST_ROW_EXPR =
  '(()=>{const t=document.querySelector("table tbody tr td:nth-child(4)");return t?t.innerText.slice(0,40):"";})()';

/**
 * 검색 확인 모달("이용횟수가 차감되며 검색이 진행됩니다 ... 검색하시겠습니까?")의
 * "확인" 버튼을 클릭한다. 모달 등장까지 잠깐 폴링. clickExposureProbability 의 확인 패턴 재사용.
 * 클릭했으면 true, 모달이 끝내 안 뜨면 false(이미 검색이 시작됐거나 모달 없는 흐름).
 */
// 확인 버튼 식: '취소'가 아닌 '확인' 버튼.
const CONFIRM_BTN_EXPR =
  `[...document.querySelectorAll('button')].find((b)=>{const t=(b.innerText||'').trim();return t==='확인'||(/확인/.test(t)&&!/취소/.test(t));})`;

async function clickSearchConfirm(page: CdpPage, deadlineMs: number): Promise<boolean> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const modalUp = await page.evalExpr<boolean>(
      `/이용횟수가 차감|검색하시겠습니까|진행하시겠습니까/.test(document.body.innerText || '')`,
    );
    if (modalUp) {
      // 확인 버튼은 **trusted 마우스 클릭**만 받는다(합성 click() 무시 — 실측). 폴백은 합성.
      const ok = page.trustedClick
        ? await page.trustedClick(CONFIRM_BTN_EXPR)
        : await page.evalExpr<boolean>(`(()=>{const b=(${CONFIRM_BTN_EXPR});if(!b)return false;b.click();return true;})()`);
      if (ok) return true;
    }
    await page.waitForTimeout(400);
  }
  return false;
}

/**
 * 검색 결과 갱신 대기. 첫 행 텍스트가 before 와 달라지고 비어있지 않을 때까지 폴링.
 * 실측: 확인 클릭 후 ~20초 뒤 결과 테이블 갱신. 최대 resultWaitMs(기본 30초).
 */
async function waitForResultChange(page: CdpPage, before: string, waitMs: number): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1_000);
    const cur = await page.evalExpr<string>(FIRST_ROW_EXPR);
    if (cur && cur !== before) return true;
  }
  return false;
}

/**
 * 테이블 행 수가 안정될 때까지(연속 2회 동일) 폴링. 점진 로드되는 결과를 끝까지 기다린다.
 * minSettleMs는 최소 대기(첫 폴 전). 최대 12초.
 */
async function stabilizeRowCount(
  page: CdpPage,
  rowsSelector: string,
  minSettleMs: number,
): Promise<void> {
  await page.waitForTimeout(minSettleMs);
  const sel = JSON.stringify(rowsSelector);
  let prev = -1;
  let stable = 0;
  let polls = 0;
  const deadline = Date.now() + 18_000;
  // 행 수가 점진/버스트 로드되므로(중간 plateau 존재), 연속 3회 동일 + 최소 5회 폴 후에만 안정 판정.
  while (Date.now() < deadline) {
    const n = await page.evalExpr<number>(`document.querySelectorAll(${sel}).length`);
    polls += 1;
    if (n === prev) {
      stable += 1;
      if (stable >= 3 && polls >= 5) return;
    } else {
      stable = 0;
      prev = n;
    }
    await page.waitForTimeout(900);
  }
}

/**
 * Viewtrap 검색창에 query 입력(컨트롤드 setter + Enter) → 결과 테이블 파싱.
 * 이미 열려 있는 app.viewtrap.com 탭만 사용한다(없으면 throw — 새 탭/이동/새로고침 금지).
 */
export async function scrapeVideoSearchTable(
  session: CdpSession,
  query: string,
  options: ScrapeVideoSearchOptions = {},
): Promise<VideoSearchRow[]> {
  const page = findPage(session.context, 'app.viewtrap.com');
  if (!page) {
    throw new Error(
      'app.viewtrap.com 탭이 없음 — 로그인된 크롬에서 video-search 페이지를 열어두세요 (로그아웃 위험 때문에 탭을 새로 열거나 이동하지 않습니다)',
    );
  }

  const timeout = options.timeoutMs ?? 20_000;
  await page.waitForSelector(SEARCH_INPUT, { timeout });

  // 이미 같은 query가 입력되어 있고 테이블이 차 있으면 재검색하지 않는다(불필요한 재로드 방지).
  const inputVal =
    (await page.evalExpr<string>(
      `document.querySelector(${JSON.stringify(SEARCH_INPUT)})?.value ?? ''`,
    )) ?? '';
  const existingRows =
    (await page.evalExpr<number>(
      `document.querySelectorAll(${JSON.stringify(TABLE_ROWS)}).length`,
    )) ?? 0;
  const alreadyOnQuery = inputVal.trim() === query.trim() && existingRows > 0;

  if (!alreadyOnQuery) {
    // 검색 전 첫 행을 기억(결과 갱신 감지용).
    const beforeFirstRow = (await page.evalExpr<string>(FIRST_ROW_EXPR)) ?? '';

    // ① query 입력(컨트롤드 input native setter + input/change 이벤트).
    await page.fill(SEARCH_INPUT, query);
    await page.waitForTimeout(300);

    // ② 검색 실행: **돋보기 버튼(bg-primary-300) trusted 마우스 클릭**. Enter는 viewtrap이 무시한다(실측).
    const MAGNIFIER_EXPR =
      `[...document.querySelectorAll('button')].find((x)=>/bg-primary-300/.test((x.className&&x.className.toString&&x.className.toString())||''))`;
    if (page.trustedClick) {
      await page.trustedClick(MAGNIFIER_EXPR);
    } else {
      await page.press(SEARCH_INPUT, 'Enter'); // 폴백(fake page)
    }
    await page.waitForTimeout(800);

    // ③ 확인 모달 대기 → "확인" trusted 클릭. 안 떴으면 돋보기를 다시 눌러 재시도.
    let confirmed = await clickSearchConfirm(page, 6_000);
    if (!confirmed && page.trustedClick) {
      await page.trustedClick(MAGNIFIER_EXPR);
      confirmed = await clickSearchConfirm(page, 6_000);
    }

    // ④ 결과 갱신 대기: 확인 후 ~20초 뒤 첫 행이 바뀜(최대 resultWaitMs). 모달이 없었어도(즉시 검색)
    //    동일하게 첫 행 변화를 기다린다.
    await waitForResultChange(page, beforeFirstRow, options.resultWaitMs ?? 30_000);
    await page.waitForSelector(TABLE_ROWS, { timeout });
  }

  // 행 수 안정화 폴링: 재검색 시 테이블이 점진 로드되므로 행 수가 멈출 때까지 기다린다.
  await stabilizeRowCount(page, TABLE_ROWS, options.settleMs ?? 1_500);

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

/**
 * 검색을 트리거하지 않고, **사장님이 이미 viewtrap에 로드해둔 테이블**의 노출확률을 수집한다.
 * (viewtrap은 코드 검색 트리거가 신용게이트로 막힘 — rules/50. 그래서 로드된 테이블만 읽는다.)
 *   현재 테이블 파싱 → 노출확률 헤더 버튼 클릭 → 충분히 대기(기본 50초, "40초+ 기다려야 뜬다") → 수집.
 * videoId별 노출확률 등급만 반환(발굴 풀에 매칭 병합용). 탭/테이블 없으면 빈 배열(graceful).
 */
export async function scrapeLoadedViewtrapExposure(
  session: CdpSession,
  options: { waitMs?: number } = {},
): Promise<Array<{ videoId: string; exposure: ViewtrapGrade }>> {
  const page = findPage(session.context, 'app.viewtrap.com');
  if (!page) return [];
  const hasTable = await page
    .waitForSelector(TABLE_ROWS, { timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (!hasTable) return [];

  // 현재 로드된 테이블을 그대로 파싱(검색 트리거 없음).
  const raws = await page.evaluate((): RawTableRow[] => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    return rows.map((tr) => ({
      cells: Array.from(tr.querySelectorAll('td')).map((td) =>
        (td as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
      ),
      thumbnailSrc: tr.querySelector('img')?.getAttribute('src') ?? null,
    }));
  });
  const rows = parseVideoSearchRows(raws);
  if (rows.length === 0) return [];

  // 노출확률 버튼 클릭 + 긴 대기(40초+). clickExposureProbability가 videoId별로 채워준다.
  const withExposure = await clickExposureProbability(session, rows, { waitMs: options.waitMs ?? 50_000 });
  return withExposure
    .filter((r) => r.exposure !== null)
    .map((r) => ({ videoId: r.videoId, exposure: r.exposure as ViewtrapGrade }));
}

export interface ExposureClickOptions {
  /** 노출확률 배치 분석 로드 폴링 시간(ms). 기본 35000(실측 ~14s 후 채워짐). */
  waitMs?: number;
}

/**
 * 노출확률 배치 로드(다건). 실측 흐름(2026-06-10):
 *   ① 테이블 헤더 "노출 확률" <button> 클릭 → ② 확인 모달("진행하시겠습니까?")의 "확인" 클릭
 *   → ③ ~14s 후 전 행의 노출확률 셀(9번째 td)이 ".. Bad/Good/..." 로 채워짐.
 * 셀 자체에는 버튼이 없다(<span>-</span>). 헤더 버튼 1회로 전 행을 한꺼번에 분석한다.
 *
 * 입력 rows는 videoId 매칭으로 exposure만 채워 새 배열로 반환한다(추려진 후보만 넘길 것).
 * 이미 exposure가 채워진 rows뿐이면 배치 분석을 건너뛴다(불필요한 신용 소모/모달 방지).
 * 새로고침/탭 재이동 금지 — in-app 클릭만.
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
  const result = rows.map((row) => ({ ...row }));
  if (result.every((r) => r.exposure !== null)) return result;

  const waitMs = options.waitMs ?? 35_000;

  // ① 헤더 노출확률 버튼 **trusted 마우스 클릭**(합성 click() 무시 — 실측). 없으면 폴링만.
  const HEADER_BTN_EXPR = `(()=>{const th=[...document.querySelectorAll('table thead th')][${EXPOSURE_CELL_NTH - 1}];return th?th.querySelector('button'):null;})()`;
  const clicked = page.trustedClick
    ? await page.trustedClick(HEADER_BTN_EXPR)
    : await page.evalExpr<boolean>(`(()=>{const b=${HEADER_BTN_EXPR};if(!b)return false;b.click();return true;})()`);

  if (clicked) {
    // ② 확인 모달의 "확인" 버튼 trusted 클릭(모달 등장까지 잠깐 폴링).
    const confirmDeadline = Date.now() + 8_000;
    while (Date.now() < confirmDeadline) {
      const modalUp = await page.evalExpr<boolean>(
        `!!document.querySelector('[role="dialog"], [class*="modal"], [class*="Modal"]') || /진행하시겠습니까|차감/.test(document.body.innerText||'')`,
      );
      if (modalUp) {
        const ok = page.trustedClick
          ? await page.trustedClick(CONFIRM_BTN_EXPR)
          : await page.evalExpr<boolean>(`(()=>{const b=(${CONFIRM_BTN_EXPR});if(!b)return false;b.click();return true;})()`);
        if (ok) break;
      }
      await page.waitForTimeout(400);
    }
  }

  // ③ 전 행 노출확률 셀 폴링 → videoId별 등급 맵. "-"만 남아 있으면 계속 대기.
  const deadline = Date.now() + waitMs;
  let exposureById = new Map<string, ViewtrapGrade>();
  while (Date.now() < deadline) {
    const pairs = await page.evaluate((): Array<[string | null, string]> => {
      const out: Array<[string | null, string]> = [];
      for (const tr of Array.from(document.querySelectorAll('table tbody tr'))) {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 9) continue;
        const img = tr.querySelector('img');
        const src = img?.getAttribute('src') ?? null;
        const cellText = (tds[8] as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
        out.push([src, cellText]);
      }
      return out;
    });
    const map = new Map<string, ViewtrapGrade>();
    for (const [src, text] of pairs) {
      const id = extractVideoIdFromSrc(src);
      if (!id) continue;
      const grade = normalizeGrade(text);
      if (grade !== null) map.set(id, grade);
    }
    exposureById = map;
    // 입력 후보 중 하나라도 채워졌으면 충분(배치는 전 행 동시 로드).
    const anyWanted = result.some((r) => map.has(r.videoId));
    if (anyWanted) break;
    await page.waitForTimeout(1_500);
  }

  for (const row of result) {
    const grade = exposureById.get(row.videoId);
    if (grade) row.exposure = grade;
  }
  return result;
}

/** 썸네일 src(i.ytimg.com/vi/<id>/...)에서 videoId. parse.extractVideoId의 부분집합. */
function extractVideoIdFromSrc(src: string | null): string | null {
  if (!src) return null;
  const m = src.match(/\/vi\/([^/?#]+)\//) ?? src.match(/[?&]v=([^&#]+)/);
  return m ? m[1] : null;
}

// ── YouTube 검색결과 + Viewtrap 확장 주입 지표 (deepWalk shadow DOM) ──────────

export interface ScrapeYoutubeExtensionOptions {
  /** 확장이 shadow DOM에 지표를 주입할 시간(ms). 기본 2500. */
  settleMs?: number;
  timeoutMs?: number;
}

/**
 * YouTube 검색결과 페이지에서 Viewtrap 확장이 주입한 기여도/성과도를 deepWalk로 추출.
 * youtube.com 탭을 재사용(없으면 새 탭)해 검색결과 URL로 이동한다 —
 * YouTube 탭 이동은 안전(인메모리 인증 제약은 app.viewtrap.com 탭에만 해당).
 * innerText로는 안 잡힘 → shadowRoot 재귀 수집 필수(cdp-yt-deepwalk.mjs 패턴).
 */
export async function scrapeYoutubeSearchExtension(
  session: CdpSession,
  query: string,
  options: ScrapeYoutubeExtensionOptions = {},
): Promise<ExtensionMetricsRow[]> {
  let page = findPage(session.context, 'youtube.com');
  if (!page) page = await session.context.newPage();

  const timeout = options.timeoutMs ?? 20_000;
  const encoded = encodeURIComponent(query);
  const targetUrl = `https://www.youtube.com/results?search_query=${encoded}`;
  // 이미 같은 검색결과면 재이동하지 않는다 — 재이동하면 확장이 지표를 다시 주입할 때까지
  // 비어 보인다(실측: navigate 직후 settle 부족 시 0 카드). 이동이 필요할 때만 더 오래 기다린다.
  const alreadyOnQuery =
    page.url().includes('youtube.com/results') && page.url().includes(`search_query=${encoded}`);
  if (!alreadyOnQuery) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout });
  }
  await page.waitForSelector('ytd-video-renderer, ytd-rich-item-renderer', { timeout });
  // 확장 주입 대기: 이동했으면 길게(기본 6000), 같은 페이지면 짧게(기본 2500).
  await page.waitForTimeout(options.settleMs ?? (alreadyOnQuery ? 2_500 : 6_000));
  // 확장이 shadow DOM에 "기여도"를 주입할 때까지 추가 폴링(최대 8초).
  const injectDeadline = Date.now() + 8_000;
  while (Date.now() < injectDeadline) {
    const injected = await page.evalExpr<boolean>(`(() => {
      for (const el of document.querySelectorAll('ytd-video-renderer *, ytd-rich-item-renderer *')) {
        if (el.shadowRoot && (el.shadowRoot.textContent || '').includes('기여도')) return true;
      }
      return false;
    })()`);
    if (injected) break;
    await page.waitForTimeout(500);
  }

  const raws = await page.evaluate((): RawExtensionCard[] => {
    // deepWalk: renderer 내부 shadowRoot까지 재귀 순회.
    function* deepWalk(node: Element | ShadowRoot): Generator<Element | ShadowRoot> {
      yield node;
      if ((node as Element).shadowRoot) yield* deepWalk((node as Element).shadowRoot as ShadowRoot);
      for (const child of Array.from(node.children ?? [])) yield* deepWalk(child);
    }
    // shadowRoot 텍스트 전부 모아 "기여도 ... Good" 정규식 매핑(dt/dd가 아닐 수도 있음).
    function collectText(root: Element): string {
      let s = (root as HTMLElement).innerText || '';
      for (const el of deepWalk(root)) {
        const sr = (el as Element).shadowRoot;
        if (sr) s += '\n' + (sr.textContent || '');
      }
      return s;
    }
    function gradeFrom(text: string, label: string): string {
      const re = new RegExp(label + '[\\s·:\\n]*\\n?\\s*(Wow|Great|Good|Normal|Bad|Worst)', 'i');
      const m = text.match(re);
      return m ? m[1] : '';
    }
    const cards = Array.from(
      document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer'),
    );
    const out: RawExtensionCard[] = [];
    for (const card of cards) {
      const titleAnchor = card.querySelector<HTMLAnchorElement>('a#video-title, a#video-title-link');
      const href =
        titleAnchor?.href ?? card.querySelector<HTMLAnchorElement>('a[href*="/watch"]')?.href ?? '';
      const title = (
        card.querySelector<HTMLElement>(
          '#video-title, a#video-title-link, yt-formatted-string#video-title',
        )?.innerText ?? ''
      ).trim();
      if (!title) continue;
      const text = collectText(card);
      const metrics: Record<string, string> = {};
      const contrib = gradeFrom(text, '기여도');
      const perf = gradeFrom(text, '성과도');
      const expo = gradeFrom(text, '노출');
      if (contrib) metrics['기여도'] = contrib;
      if (perf) metrics['성과도'] = perf;
      if (expo) metrics['노출확률'] = expo;
      // 조회수: 한글("조회수 27만회") 또는 영문 로케일("6.5M views" / "1.2K views" / "272,415 views").
      const vmKo = text.match(/조회수\s*([\d.,]+\s*[만천억]?\s*회?)/);
      const vmEn = text.match(/([\d.,]+\s*[KMB]?)\s*views/i);
      out.push({ href, title, metaText: vmKo ? vmKo[0] : (vmEn ? vmEn[0] : ''), metrics });
    }
    return out;
  });
  return parseExtensionCards(raws);
}

// ── 자막(대본) 추출 — 로그인 CDP 브라우저 in-page fetch ────────────────────────

export interface CdpTranscriptResult {
  videoId: string;
  available: boolean;
  text: string;
  languageCode?: string;
  note?: string;
}

export interface ScrapeTranscriptOptions {
  preferredLanguages?: string[];
  /** 평문 최대 길이(LLM 비용 보호). 기본 12000자. */
  maxChars?: number;
  /** watch 페이지 로드 후 ytInitialPlayerResponse 안착 대기(ms). 기본 1500. */
  settleMs?: number;
  timeoutMs?: number;
}

/**
 * youtube.com 탭을 watch?v=ID로 이동시켜 ytInitialPlayerResponse.captionTracks의 baseUrl을
 * **브라우저 컨텍스트 fetch**(쿠키·origin 보유)로 받아 자막 평문을 환원한다.
 * 서버 raw fetch는 빈 본문/토큰요구로 막히지만(transcript/fetch.ts), 로그인 브라우저 in-page
 * fetch는 통과한다. 자막 없음/실패는 throw하지 않고 available=false.
 *
 * 주의: 키워드 발굴(확장 스크래핑)이 모두 끝난 뒤 호출할 것 — 같은 탭을 watch로 이동시키므로
 * 검색결과 페이지 상태를 덮어쓴다.
 */
export async function scrapeTranscriptViaCdp(
  session: CdpSession,
  videoId: string,
  options: ScrapeTranscriptOptions = {},
): Promise<CdpTranscriptResult> {
  const timeout = options.timeoutMs ?? 20_000;
  const preferred = options.preferredLanguages ?? ['ko', 'en'];
  let page = findPage(session.context, 'youtube.com');
  if (!page) page = await session.context.newPage();

  try {
    await page.goto(`https://www.youtube.com/watch?v=${videoId}&hl=ko`, {
      waitUntil: 'domcontentloaded',
      timeout,
    });
  } catch (e) {
    return { videoId, available: false, text: '', note: `goto: ${e instanceof Error ? e.message : String(e)}` };
  }
  await page.waitForTimeout(options.settleMs ?? 1_500);

  const prefJson = JSON.stringify(preferred);
  // 현 YouTube는 captionTracks baseUrl 직접 fetch(빈 본문/pot) · InnerTube get_transcript 직접 POST
  // (FAILED_PRECONDITION) 둘 다 막힌다. → YouTube **자체 JS가 호출하도록** "Show transcript" 버튼을
  // 클릭해 패널을 열고 ytd-transcript-segment-renderer DOM 세그먼트를 긁는다(가장 안정적).
  const expr = `(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    function clickByText(re) {
      const nodes = [...document.querySelectorAll('button, ytd-button-renderer, yt-button-shape, a')];
      for (const n of nodes) {
        const t = (n.innerText || n.getAttribute('aria-label') || '').trim();
        if (t && re.test(t)) {
          const btn = n.querySelector('button') || n;
          try { btn.click(); return true; } catch (e) {}
        }
      }
      return false;
    }
    // 설명 더보기 펼치기(자막 섹션 노출).
    const exp = document.querySelector('#description-inline-expander #expand, tp-yt-paper-button#expand, #expand');
    if (exp) { try { exp.click(); } catch (e) {} await sleep(900); }
    // "Show transcript" / "스크립트 표시" 버튼 클릭.
    let opened = clickByText(/스크립트 표시|Show transcript|^Transcript$|자막 표시/i);
    if (!opened) {
      // 설명 섹션 transcript 버튼 직접 클릭.
      const sec = document.querySelector('ytd-video-description-transcript-section-renderer button, ytd-video-description-transcript-section-renderer ytd-button-renderer');
      if (sec) { try { (sec.querySelector('button') || sec).click(); opened = true; } catch (e) {} }
    }
    if (opened) {
      // 패널 세그먼트 렌더 대기(최대 9초).
      const deadline = Date.now() + 9000;
      while (Date.now() < deadline) {
        if (document.querySelectorAll('ytd-transcript-segment-renderer').length > 0) break;
        await sleep(500);
      }
      const segs = [...document.querySelectorAll('ytd-transcript-segment-renderer')];
      if (segs.length) {
        const text = segs
          .map(s => {
            const el = s.querySelector('.segment-text, yt-formatted-string.segment-text') || s;
            return (el.innerText || el.textContent || '').trim();
          })
          .filter(Boolean)
          .join(' ')
          .replace(/\\s+/g, ' ')
          .trim();
        if (text) return { available: true, text: text, languageCode: 'panel' };
      }
    }
    return await (async () => {
    const preferred = ${prefJson};
    function deepFind(obj, key, depth) {
      if (!obj || depth > 12) return null;
      if (typeof obj !== 'object') return null;
      if (obj[key] !== undefined) return obj[key];
      for (const k in obj) {
        const v = deepFind(obj[k], key, depth + 1);
        if (v !== null && v !== undefined) return v;
      }
      return null;
    }
    function flattenTranscript(json) {
      const groups = deepFind(json, 'initialSegments', 0)
        || (deepFind(json, 'transcriptSegmentListRenderer', 0) || {}).initialSegments
        || [];
      let segs = groups;
      if (!segs || !segs.length) {
        // 다른 셰이프: cueGroups
        const cues = deepFind(json, 'transcriptCueGroupRenderer', 0);
        if (cues) segs = deepFind(json, 'cueGroups', 0) || [];
      }
      const out = [];
      (segs || []).forEach(s => {
        const r = s.transcriptSegmentRenderer || s.transcriptSectionHeaderRenderer
          || (s.transcriptCueGroupRenderer && s.transcriptCueGroupRenderer.cues && s.transcriptCueGroupRenderer.cues[0] && s.transcriptCueGroupRenderer.cues[0].transcriptCueRenderer);
        if (!r) return;
        const sn = r.snippet || r.cue || {};
        const t = (sn.runs ? sn.runs.map(x => x.text).join('') : (sn.simpleText || ''));
        if (t) out.push(t);
      });
      return out.join(' ').replace(/\\s+/g, ' ').trim();
    }
    // 1) InnerTube get_transcript
    try {
      const cfg = (window.ytcfg && window.ytcfg.data_) || {};
      const apiKey = cfg.INNERTUBE_API_KEY;
      const ctx = cfg.INNERTUBE_CONTEXT;
      const params = deepFind(window.ytInitialData || {}, 'getTranscriptEndpoint', 0);
      const transcriptParams = params && params.params;
      if (apiKey && ctx && transcriptParams) {
        const res = await fetch('/youtubei/v1/get_transcript?key=' + apiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: ctx, params: transcriptParams }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = flattenTranscript(data);
          if (text) return { available: true, text: text, languageCode: 'innertube' };
        }
      }
    } catch (e) {}
    // 2) 폴백: captionTracks baseUrl
    function getPR() {
      if (window.ytInitialPlayerResponse) return window.ytInitialPlayerResponse;
      const m = (document.documentElement.innerHTML || '').match(/ytInitialPlayerResponse\\s*=\\s*(\\{.+?\\});/s);
      if (m) { try { return JSON.parse(m[1]); } catch (e) { return null; } }
      return null;
    }
    const pr = getPR();
    const tracks = (pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer && pr.captions.playerCaptionsTracklistRenderer.captionTracks) || [];
    if (!tracks.length) return { available: false, note: 'no caption tracks / no transcript params' };
    const manual = tracks.filter(t => t.kind !== 'asr');
    const asr = tracks.filter(t => t.kind === 'asr');
    let pick = null;
    for (const pool of [manual, asr]) {
      for (const lang of preferred) {
        const hit = pool.find(t => t.languageCode === lang || (t.languageCode||'').indexOf(lang + '-') === 0);
        if (hit) { pick = hit; break; }
      }
      if (pick) break;
    }
    if (!pick) pick = manual[0] || asr[0] || null;
    if (!pick || !pick.baseUrl) return { available: false, note: 'no usable track' };
    const sep = pick.baseUrl.indexOf('?') >= 0 ? '&' : '?';
    let text = '';
    try {
      const res = await fetch(pick.baseUrl + sep + 'fmt=json3');
      if (res.ok) {
        const data = await res.json();
        text = (data.events || []).map(e => (e.segs || []).map(s => s.utf8 || '').join('')).join(' ').replace(/\\s+/g, ' ').trim();
      }
    } catch (e) {}
    if (!text) return { available: false, note: 'empty transcript' };
    return { available: true, text: text, languageCode: pick.languageCode };
    })();
  })()`;

  let result: { available: boolean; text?: string; languageCode?: string; note?: string };
  try {
    result = await page.evalExpr(expr);
  } catch (e) {
    return { videoId, available: false, text: '', note: `evaluate: ${e instanceof Error ? e.message : String(e)}` };
  }
  let text = result.text ?? '';
  const max = options.maxChars ?? 12_000;
  if (text.length > max) text = text.slice(0, max);
  return {
    videoId,
    available: Boolean(result.available && text),
    text: result.available ? text : '',
    languageCode: result.languageCode,
    note: result.note,
  };
}
