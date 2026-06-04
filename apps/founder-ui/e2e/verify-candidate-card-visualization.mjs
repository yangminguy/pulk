import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const candidateCardPath = join(root, 'src/components/KeyContentCandidateCard.tsx')
const metricsChartPath = join(root, 'src/components/CandidateMetricsChart.tsx')
const packageJsonPath = join(root, 'package.json')
const chatPagePath = join(root, 'src/app/chat/page.tsx')

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

// AC-5: Check dependencies in package.json
check('package.json includes framer-motion and recharts (AC-5)', () => {
  assert.equal(existsSync(packageJsonPath), true, 'missing package.json')
  const code = readFileSync(packageJsonPath, 'utf8')
  assert.match(code, /"framer-motion"/, 'missing framer-motion in package.json')
  assert.match(code, /"recharts"/, 'missing recharts in package.json')
})

// AC-1, AC-2: Check Framer Motion usage in KeyContentCandidateCard or chat page
check('Framer Motion is used for layout animations (AC-1, AC-2)', () => {
  let usesFramerMotion = false
  if (existsSync(candidateCardPath)) {
    const code = readFileSync(candidateCardPath, 'utf8')
    if (code.includes('framer-motion') && (code.includes('layout') || code.includes('motion.'))) {
      usesFramerMotion = true
    }
  }
  if (!usesFramerMotion && existsSync(chatPagePath)) {
    const code = readFileSync(chatPagePath, 'utf8')
    if (code.includes('AnimatePresence') && code.includes('framer-motion')) {
      usesFramerMotion = true
    }
  }
  assert.equal(usesFramerMotion, true, 'missing framer-motion usage (AnimatePresence, layout, motion.) for optimistic updates')
})

// AC-3: Check CandidateMetricsChart component exists
check('CandidateMetricsChart component exists (AC-3)', () => {
  assert.equal(existsSync(metricsChartPath), true, 'missing src/components/CandidateMetricsChart.tsx')
})

if (existsSync(metricsChartPath)) {
  const code = readFileSync(metricsChartPath, 'utf8')
  
  check('CandidateMetricsChart uses recharts (AC-3)', () => {
    assert.match(code, /recharts/, 'must import recharts')
    assert.match(code, /<.*Chart/, 'must render a recharts component (e.g., BarChart, LineChart)')
  })

  check('CandidateMetricsChart uses design system colors (AC-4)', () => {
    assert.match(code, /var\(--color-|primary|secondary|tailwind/, 'must use theme colors rather than hardcoded colors')
  })
}

if (failures.length > 0) {
  console.error('\nCandidate Card Visualization verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('\nCandidate Card Visualization verification passed.')
