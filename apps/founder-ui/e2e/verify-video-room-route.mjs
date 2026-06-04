import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const sidebarPath = join(root, 'src/components/Sidebar.tsx')
const pagePath = join(root, 'src/app/video-room/page.tsx')

const failures = []

function check(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    failures.push(`${name}: ${error.message}`)
    console.error(`FAIL ${name}: ${error.message}`)
  }
}

check('Sidebar exposes Video Room tool navigation', () => {
  const sidebar = readFileSync(sidebarPath, 'utf8')

  assert.match(sidebar, /href:\s*['"]\/video-room['"]/, 'missing /video-room href in NAV_TOOLS')
  assert.match(sidebar, /label:\s*['"]Video Room['"]/, 'missing Video Room label in NAV_TOOLS')
  assert.match(sidebar, /icon:\s*['"]video['"]/, 'missing video icon assignment in NAV_TOOLS')
})

check('Sidebar defines a video icon for the nav item', () => {
  const sidebar = readFileSync(sidebarPath, 'utf8')

  assert.match(sidebar, /\bvideo:\s*['"][^'"]+['"]/, 'missing ICONS.video path')
})

check('/video-room route page exists and is auth-gated', () => {
  assert.equal(existsSync(pagePath), true, 'missing src/app/video-room/page.tsx')

  const page = readFileSync(pagePath, 'utf8')
  assert.match(page, /AuthGate/, 'page should use AuthGate')
  assert.match(page, /Video Room/, 'page should render the Video Room title')
})

if (failures.length > 0) {
  console.error('\nVideo Room route verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('\nVideo Room route verification passed.')
