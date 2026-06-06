import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const FRONT = 'http://127.0.0.1:3000'
const API = 'http://localhost:13000'
const token = readFileSync('/tmp/l5tok.txt', 'utf8').trim()

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

// inject token before app loads
await page.addInitScript(t => localStorage.setItem('l5_token', t), token)

await page.goto(`${FRONT}/video-room`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: '/tmp/vr-00-selector.png', fullPage: true })

// select first project card
const card = page.locator('.j-card').first()
if (await card.count()) {
  await card.click()
  await page.waitForTimeout(1800)
}

async function shotPhase(label, name) {
  // PhaseTimeline buttons carry the Korean phase label.
  const btn = page.locator(`button:has-text("${label}")`).first()
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(1000) }
  await page.screenshot({ path: `/tmp/vr-${name}.png`, fullPage: true })
  console.log(`shot ${name}`)
}

await shotPhase('전략', '01-strategy')
await shotPhase('원고', '02-production')
await shotPhase('발행', '03-review')

// drawer collapsed view (click the › collapse button)
const collapse = page.locator('button[title="패널 접기"]').first()
if (await collapse.count()) { await collapse.click(); await page.waitForTimeout(600) }
await page.screenshot({ path: '/tmp/vr-04-drawer-collapsed.png', fullPage: true })
console.log('shot 04-drawer-collapsed')

await browser.close()
console.log('done')
