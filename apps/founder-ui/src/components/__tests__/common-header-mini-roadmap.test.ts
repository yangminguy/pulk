import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const appRoot = resolve(process.cwd(), 'apps/founder-ui')
const srcRoot = resolve(appRoot, 'src')

const requiredFiles = [
  'src/components/PageHeader.tsx',
  'src/components/Icon.tsx',
  'src/components/AgentBadge.tsx',
]

const appFiles = [
  'src/app/monitor/page.tsx',
  'src/app/projects/page.tsx',
]

const filesWithLocalIcons = [
  'src/components/Sidebar.tsx',
  'src/components/RoadmapMiniCard.tsx',
  'src/app/monitor/page.tsx',
  'src/app/chat/page.tsx',
]

const filesWithLocalAgentBadges = [
  'src/app/monitor/page.tsx',
  'src/components/RoadmapTimeline.tsx',
]

const readAppFile = (path: string) => readFileSync(resolve(appRoot, path), 'utf8')
const relativeToSrc = (path: string) => relative(srcRoot, resolve(appRoot, path))

const failures: string[] = []

for (const file of requiredFiles) {
  if (!existsSync(resolve(appRoot, file))) {
    failures.push(`${file} should exist`)
  }
}

for (const file of appFiles) {
  const source = readAppFile(file)

  if (!source.includes('PageHeader')) {
    failures.push(`${file} should render the shared PageHeader`)
  }
}

for (const file of filesWithLocalIcons) {
  const source = readAppFile(file)

  if (/const ICONS\b/.test(source)) {
    failures.push(`${relativeToSrc(file)} should import shared ICONS instead of declaring local ICONS`)
  }
}

for (const file of filesWithLocalAgentBadges) {
  const source = readAppFile(file)

  if (/AGENT_PASTEL|AGENT_CHIP/.test(source)) {
    failures.push(`${relativeToSrc(file)} should import shared AgentBadge styles instead of declaring local agent color maps`)
  }
}

assert.deepEqual(failures, [])
