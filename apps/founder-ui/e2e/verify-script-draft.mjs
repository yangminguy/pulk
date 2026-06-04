import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const basePath = root.includes('founder-ui') ? root : join(root, 'apps/founder-ui')
const scriptDraftPath = join(basePath, 'src/components/ScriptDraft/ScriptDraft.tsx')
const readingScriptPath = join(basePath, 'src/components/ReadingScriptCard/ReadingScriptCard.tsx')
const chatPagePath = join(basePath, 'src/app/chat/page.tsx')
const videoRoomPagePath = join(basePath, 'src/app/video-room/page.tsx')

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

check('ScriptDraft component exists and uses lexical', () => {
  assert.equal(existsSync(scriptDraftPath), true, 'missing src/components/ScriptDraft/ScriptDraft.tsx')
  
  const content = readFileSync(scriptDraftPath, 'utf8')
  assert.match(content, /@lexical\/react/, 'ScriptDraft should import lexical')
})

check('ReadingScriptCard component exists and uses requestAnimationFrame', () => {
  assert.equal(existsSync(readingScriptPath), true, 'missing src/components/ReadingScriptCard/ReadingScriptCard.tsx')
  
  const content = readFileSync(readingScriptPath, 'utf8')
  assert.match(content, /requestAnimationFrame/, 'ReadingScriptCard should use requestAnimationFrame')
})

check('chat page integrates ScriptDraft', () => {
  if (!existsSync(chatPagePath)) throw new Error(`Missing ${chatPagePath}`)
  const content = readFileSync(chatPagePath, 'utf8')
  assert.match(content, /ScriptDraft/, 'chat page should import and use ScriptDraft')
})

check('video-room page integrates ReadingScriptCard', () => {
  if (!existsSync(videoRoomPagePath)) throw new Error(`Missing ${videoRoomPagePath}`)
  const content = readFileSync(videoRoomPagePath, 'utf8')
  assert.match(content, /ReadingScriptCard/, 'video-room page should import and use ReadingScriptCard')
})

if (failures.length > 0) {
  console.error('\nScriptDraft & ReadingScriptCard verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('\nScriptDraft & ReadingScriptCard verification passed.')
