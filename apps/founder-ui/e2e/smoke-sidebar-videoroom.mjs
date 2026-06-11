import { chromium } from '@playwright/test'

const FRONT = 'http://127.0.0.1:3002'
const API = 'http://localhost:13000'

const r = await fetch(`${API}/api/auth:signIn`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'admin@nocobase.com', password: 'admin123' }),
})
const token = (await r.json())?.data?.token
if (!token) throw new Error('signIn failed')

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.addInitScript(t => localStorage.setItem('l5_token', t), token)

await page.goto(`${FRONT}/chat`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const videoLink = page.locator('a[href="/video-room"]')
const hasVideo = (await videoLink.count()) > 0 && (await videoLink.first().innerText()).includes('영상룸')
const emptyBiz = (await page.locator('text=아직 사업이 없습니다').count()) > 0
const bizRows = await page.locator('aside button:has-text("Demo"), aside button:has-text("디벨롭")').count()

console.log('영상룸 메뉴 존재:', hasVideo)
console.log('활성 사업 비어있음:', emptyBiz)
console.log('잔존 더미 사업 버튼 수:', bizRows)

await page.screenshot({ path: '/tmp/sidebar-after.png', clip: { x: 0, y: 0, width: 240, height: 900 } })

// 영상룸 클릭 → 라우팅 확인
await videoLink.first().click()
await page.waitForTimeout(1200)
console.log('영상룸 클릭 후 URL:', new URL(page.url()).pathname)
await page.screenshot({ path: '/tmp/videoroom-page.png', fullPage: false })

await browser.close()
