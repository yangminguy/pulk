/**
 * Playwright headless fixture for /projects page.
 * Usage: node scripts/e2e-projects.mjs
 * Requires: npx playwright install chromium (first time)
 */
import { chromium } from '@playwright/test'

const BASE = process.env.FOUNDER_UI_URL ?? 'http://localhost:3002'

async function run() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  console.log(`[e2e] Navigating to ${BASE}/projects`)
  await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle', timeout: 15000 })

  // Wait for sub-sidebar to render at least one project link
  let projectHref = null
  try {
    const links = page.locator('aside a[href^="/projects/"]')
    await links.first().waitFor({ timeout: 10000 })
    const count = await links.count()
    console.log(`[e2e] Sub-sidebar rendered ${count} project link(s)`)
    projectHref = await links.first().getAttribute('href')
  } catch {
    console.error('[e2e] FAIL: No project links found in sub-sidebar')
    const html = await page.content()
    console.error('[DOM dump]', html.slice(0, 3000))
    await browser.close()
    process.exit(1)
  }

  // Click the first project
  console.log(`[e2e] Clicking project: ${projectHref}`)
  await page.goto(`${BASE}${projectHref}`, { waitUntil: 'networkidle', timeout: 15000 })

  // Check for required section headers
  const content = await page.evaluate(() => document.body.innerText)
  const hasCTOPlan = content.includes('CTO Plan Timeline')
  const hasAgentActivity = content.includes('Agent Activity')

  if (hasCTOPlan && hasAgentActivity) {
    console.log('[e2e] PASS: "CTO Plan Timeline" and "Agent Activity" headers found')
    await browser.close()
    process.exit(0)
  } else {
    console.error('[e2e] FAIL: Missing required section headers')
    if (!hasCTOPlan) console.error('  - Missing: "CTO Plan Timeline"')
    if (!hasAgentActivity) console.error('  - Missing: "Agent Activity"')
    console.error('[Text dump]', content.slice(0, 3000))
    await browser.close()
    process.exit(1)
  }
}

run().catch(err => {
  console.error('[e2e] Unexpected error:', err)
  process.exit(1)
})
