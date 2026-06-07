// Run: cd apps/founder-ui && node --import tsx src/app/video-room/_lib/phases.test.ts
import assert from 'node:assert/strict'
import { STATUS_LABEL, PHASES, phaseOfStatus, phaseIndex, phaseState, ORDERED_STATUSES, statusOrder, blockState } from './phases'

// 1. Every known status (except the meta-state `paused`) maps to exactly one phase.
const mappable = Object.keys(STATUS_LABEL).filter(s => s !== 'paused')
for (const status of mappable) {
  const phase = phaseOfStatus(status)
  assert.ok(phase !== null, `status "${status}" has no phase`)
}

// 2. `paused` and unknown statuses return null.
assert.equal(phaseOfStatus('paused'), null, 'paused should be null')
assert.equal(phaseOfStatus('does_not_exist'), null, 'unknown should be null')

// 3. No status belongs to two phases; phase status lists cover all mappable statuses exactly.
const flat = PHASES.flatMap(p => p.statuses)
assert.equal(new Set(flat).size, flat.length, 'a status is listed in more than one phase')
assert.equal(new Set(flat).size, mappable.length, 'phase lists do not cover all statuses')
for (const status of flat) {
  assert.ok(status in STATUS_LABEL, `phase lists unknown status "${status}"`)
}

// 4. Phase ordering is stable and as designed.
assert.deepEqual(PHASES.map(p => p.key), ['strategy', 'research', 'script', 'production', 'publish'])
assert.equal(phaseIndex('strategy'), 0)
assert.equal(phaseIndex('publish'), 4)

// 5. phaseState: done / active / pending relative to current status.
//    current status = script_draft  → phase 'script' (index 2)
assert.equal(phaseState('strategy', 'script_draft'), 'done', 'earlier phase = done')
assert.equal(phaseState('script', 'script_draft'), 'active', 'same phase = active')
assert.equal(phaseState('production', 'script_draft'), 'pending', 'later phase = pending')
assert.equal(phaseState('publish', 'completed'), 'active', 'completed = publish active')
assert.equal(phaseState('strategy', 'paused'), 'pending', 'paused yields no active phase')

// 6. statusOrder / ORDERED_STATUSES: strictly increasing in workflow order.
assert.equal(ORDERED_STATUSES.length, mappable.length, 'ordered list should cover all mappable statuses')
assert.equal(statusOrder('strategy_chat'), 0)
assert.ok(statusOrder('script_draft') < statusOrder('rendering'), 'script precedes production')
assert.equal(statusOrder('paused'), -1, 'paused has no order')
assert.equal(statusOrder('nope'), -1, 'unknown has no order')

// 7. blockState: locked (future) / active (in range) / done (past).
//    block serving the script range, current status across the workflow:
const scriptRange = { from: 'script_planning', to: 'script_approval' }
assert.equal(blockState(scriptRange, 'strategy_chat'), 'locked', 'before range = locked')
assert.equal(blockState(scriptRange, 'script_draft'), 'active', 'in range = active')
assert.equal(blockState(scriptRange, 'rendering'), 'done', 'after range = done')
assert.equal(blockState(scriptRange, 'paused'), 'locked', 'paused = locked')

console.log('phases.test.ts: all assertions passed ✓')
