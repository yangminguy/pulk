import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const candidateCardPath = join(root, 'src/components/KeyContentCandidateCard.tsx')
const selectedCardPath = join(root, 'src/components/SelectedKeyContentCard.tsx')
const apiPath = join(root, 'src/lib/api.ts')

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

// AC-1, AC-2, AC-4 for Candidate Card
check('KeyContentCandidateCard component exists', () => {
  assert.equal(existsSync(candidateCardPath), true, 'missing src/components/KeyContentCandidateCard.tsx')
})

if (existsSync(candidateCardPath)) {
  const code = readFileSync(candidateCardPath, 'utf8')
  
  check('Candidate Card renders title, summary, and expected effect (AC-1)', () => {
    assert.match(code, /title/i, 'must render title')
    assert.match(code, /summary/i, 'must render summary')
    assert.match(code, /effect|roi|pmf/i, 'must render expected effect or ROI')
  })

  check('Candidate Card has Select and Reject actions (AC-2, AC-4)', () => {
    assert.match(code, /onSelect|채택|Approve/i, 'must have a Select/Approve action')
    assert.match(code, /onReject|거절/i, 'must have a Reject action')
  })
}

// AC-3 for Selected Card
check('SelectedKeyContentCard component exists', () => {
  assert.equal(existsSync(selectedCardPath), true, 'missing src/components/SelectedKeyContentCard.tsx')
})

if (existsSync(selectedCardPath)) {
  const code = readFileSync(selectedCardPath, 'utf8')
  check('Selected Card uses state indicators (AC-3)', () => {
    assert.match(code, /status|state/i, 'must render status')
  })
}

// Check api.ts for new API calls for AC-2/AC-4
check('api.ts has content selection API endpoints', () => {
  assert.equal(existsSync(apiPath), true, 'missing api.ts')
  const apiCode = readFileSync(apiPath, 'utf8')
  assert.match(apiCode, /approveTask|selectContent|updateContentState|rejectTask/i, 'must have API function for selecting/rejecting content')
})

if (failures.length > 0) {
  console.error('\nKey Content Cards verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('\nKey Content Cards verification passed.')
