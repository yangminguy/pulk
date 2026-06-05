import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const layoutPath = join(root, 'src/components/ThreeColumnLayout.tsx')
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

check('ThreeColumnLayout component exists', () => {
  assert.equal(existsSync(layoutPath), true, 'missing src/components/ThreeColumnLayout.tsx')
})

if (existsSync(layoutPath)) {
  const layout = readFileSync(layoutPath, 'utf8')

  check('ThreeColumnLayout uses CSS Grid with 240px 1fr 320px by default', () => {
    assert.match(layout, /display:\s*['"]grid['"]/, 'must use display: grid')
    assert.match(layout, /gridTemplateColumns:\s*`\${leftWidth}px\s+1fr\s+\${rightWidth}px`/, 'must use dynamic grid-template-columns')
  })

  check('ThreeColumnLayout panels have independent scrolling', () => {
    assert.match(layout, /overflowY:\s*['"]auto['"]/, 'panels must use overflowY: auto')
  })

  check('ThreeColumnLayout uses Joinery token for border', () => {
    assert.match(layout, /borderRight:\s*['"]1px solid var\(--silver-2\)['"]/, 'must use var(--silver-2) for borders')
  })

  check('ThreeColumnLayout has responsive tab state', () => {
    assert.match(layout, /useState/, 'must use useState for tabs')
    assert.match(layout, /window\.innerWidth\s*<=\s*768/, 'must check window width for responsiveness')
  })
}

check('Video Room page uses ThreeColumnLayout', () => {
  assert.equal(existsSync(pagePath), true, 'missing src/app/video-room/page.tsx')
  const page = readFileSync(pagePath, 'utf8')
  assert.match(page, /import ThreeColumnLayout/, 'must import ThreeColumnLayout')
  assert.match(page, /<ThreeColumnLayout/, 'must use ThreeColumnLayout component')
  
  // 패널별 플레이스홀더 체크
  assert.match(page, /left=\{/, 'must pass left prop')
  assert.match(page, /center=\{/, 'must pass center prop')
  assert.match(page, /right=\{/, 'must pass right prop')
})

if (failures.length > 0) {
  console.error('\nReview & Publish Layout verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('\nReview & Publish Layout verification passed.')
