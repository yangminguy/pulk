import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3002'
const API = 'http://localhost:13000'
const KNOWN_UNIMPL = ['/api/roadmap:list', '/api/discovery:today'] // api.ts: 미구현 safe-fallback

// 1) 토큰 획득
const signin = await fetch(`${API}/api/auth:signIn`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: process.env.NOCOBASE_USERNAME ?? 'nocobase', password: process.env.NOCOBASE_PASSWORD ?? 'admin123' }),
}).then(r => r.json())
const token = signin?.data?.token
if (!token) { console.error('NO TOKEN'); process.exit(1) }
console.log('token acquired: <redacted>')

const PAGES = [
  { path: '/chat',          anchor: ['CEO 채팅'] },
  { path: '/monitor',       anchor: ['다음 Phase 전환'] },
  { path: '/memory',        anchor: ['지식'] },
  { path: '/control-room',  anchor: [] },
  { path: '/tool-requests', anchor: [] },
  { path: '/approval',      anchor: [] },
]

const browser = await chromium.launch({ headless: true })
const rows = []

for (const pg of PAGES) {
  const ctx = await browser.newContext()
  await ctx.addInitScript(t => { try { localStorage.setItem('l5_token', t) } catch {} }, token)
  const page = await ctx.newPage()
  const consoleErrors = []
  const pageErrors = []
  const netReal = []   // 진짜 결함: 401/403/5xx/기타4xx
  const netKnown = []  // 알려진 미구현 404

  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', e => pageErrors.push(e.message))
  page.on('response', r => {
    const s = r.status()
    if (s < 400) return
    const u = r.url()
    if (s === 404 && KNOWN_UNIMPL.some(k => u.includes(k))) netKnown.push(`${s} ${u.replace(API,'')}`)
    else netReal.push(`${s} ${u.replace(API,'')}`)
  })

  let httpStatus = 0
  try {
    const resp = await page.goto(BASE + pg.path, { waitUntil: 'networkidle', timeout: 35000 })
    httpStatus = resp.status()
  } catch (e) { pageErrors.push('GOTO: ' + e.message) }

  // monitor 8s 폴링 1사이클 + 동적 카드 렌더 여유
  await page.waitForTimeout(pg.path === '/monitor' ? 9000 : 2500)

  // 앵커 텍스트 확인
  const body = await page.evaluate(() => document.body.innerText).catch(() => '')
  const anchorOk = pg.anchor.every(a => body.includes(a))
  const hasContent = body.trim().length > 30

  rows.push({
    page: pg.path, http: httpStatus,
    anchor: pg.anchor.length ? (anchorOk ? 'OK' : 'MISS:' + pg.anchor.join(',')) : '(none)',
    content: hasContent ? 'OK' : 'EMPTY',
    pageErr: pageErrors.length, consoleErr: consoleErrors.length,
    netReal: netReal.length, netKnown: netKnown.length,
    _details: { consoleErrors, pageErrors, netReal, netKnown },
  })
  await ctx.close()
}

await browser.close()

console.log('\n========== E2E RESULT: 신규 카드 페이지 ==========')
for (const r of rows) {
  const pass = r.http === 200 && r.pageErr === 0 && r.consoleErr === 0 && r.netReal === 0 && r.content === 'OK' && !r.anchor.startsWith('MISS')
  console.log(`${pass ? '✅' : '❌'} ${r.page.padEnd(15)} http=${r.http} anchor=${r.anchor} content=${r.content} pageErr=${r.pageErr} consoleErr=${r.consoleErr} net(real/known)=${r.netReal}/${r.netKnown}`)
  if (!pass || r.netReal || r.consoleErr || r.pageErr) {
    if (r._details.pageErrors.length) console.log('     pageErrors:', r._details.pageErrors.slice(0,3))
    if (r._details.consoleErrors.length) console.log('     consoleErrors:', r._details.consoleErrors.slice(0,3))
    if (r._details.netReal.length) console.log('     netReal:', r._details.netReal.slice(0,5))
  }
  if (r.netKnown) console.log('     (known-unimpl 404, 무해):', r._details.netKnown.slice(0,3))
}
