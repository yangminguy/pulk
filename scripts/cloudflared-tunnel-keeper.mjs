#!/usr/bin/env node
// cloudflared quick-tunnel keeper for L5 founder-ui (node version)
// - Spawns `cloudflared tunnel --url http://localhost:13000`
// - Extracts trycloudflare.com URL from stdout
// - If URL changed since last run, updates Vercel NEXT_PUBLIC_API_BASE
//   (production) and redeploys --prod
// - Exits when cloudflared dies so launchd respawns

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

const LOG_FILE = '/tmp/cloudflared-tunnel-keeper.log'
const STATE_FILE = '/Users/wonminyang/Library/Application Support/L5/cloudflared-tunnel-url'
const PROJECT_DIR = '/Users/wonminyang/Desktop/pulk/apps/founder-ui'
const NOCO_PORT = 13000
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

const PATH_EXTRA = [
  '/opt/homebrew/bin',
  '/Users/wonminyang/.npm-global/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
].join(':')
process.env.PATH = `${PATH_EXTRA}:${process.env.PATH ?? ''}`

mkdirSync(dirname(STATE_FILE), { recursive: true })

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`
  try { appendFileSync(LOG_FILE, line) } catch {}
  process.stdout.write(line)
}

function readState() {
  try { return readFileSync(STATE_FILE, 'utf8').trim() } catch { return '' }
}

function writeState(url) {
  writeFileSync(STATE_FILE, url)
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8', ...opts })
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function vercelEnvSync(url) {
  log(`vercel env sync starting (cwd=${PROJECT_DIR})`)
  const rm = run('vercel', ['env', 'rm', 'NEXT_PUBLIC_API_BASE', 'production', '--yes'], { cwd: PROJECT_DIR })
  log(`vercel env rm: code=${rm.code} ${(rm.stderr || rm.stdout).split('\n').slice(-3).join(' | ')}`)
  const add = spawnSync('vercel', ['env', 'add', 'NEXT_PUBLIC_API_BASE', 'production'], {
    cwd: PROJECT_DIR,
    input: url,
    encoding: 'utf8',
  })
  log(`vercel env add: code=${add.status} ${(add.stderr || add.stdout).split('\n').slice(-3).join(' | ')}`)
  const dep = spawnSync('vercel', ['--prod', '--yes'], { cwd: PROJECT_DIR, encoding: 'utf8' })
  log(`vercel deploy: code=${dep.status} ${(dep.stderr || dep.stdout).split('\n').slice(-3).join(' | ')}`)
}

async function main() {
  const prev = readState()
  log(`==== keeper start (prev=${prev || '<none>'}) ====`)

  const cf = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${NOCO_PORT}`, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  log(`cloudflared spawned pid=${cf.pid}`)

  let buf = ''
  let url = null
  const onChunk = (chunk) => {
    const s = chunk.toString('utf8')
    buf += s
    if (!url) {
      const m = URL_RE.exec(buf)
      if (m) {
        url = m[0]
        log(`tunnel URL = ${url}`)
        if (url !== prev) {
          log(`URL changed: ${prev || '<none>'} -> ${url} — syncing Vercel`)
          writeState(url)
          try { vercelEnvSync(url) } catch (e) { log(`vercel sync threw: ${e?.message}`) }
        } else {
          log(`URL unchanged — no Vercel action`)
        }
      }
    }
  }
  cf.stdout.on('data', onChunk)
  cf.stderr.on('data', onChunk)

  cf.on('exit', (code, signal) => {
    log(`cloudflared exited code=${code} signal=${signal} — keeper exiting for launchd respawn`)
    process.exit(code ?? 1)
  })

  // safety: if we don't see a URL within 60s, kill cloudflared so launchd respawns
  setTimeout(() => {
    if (!url) {
      log('no URL within 60s — killing cloudflared')
      try { cf.kill('SIGTERM') } catch {}
    }
  }, 60_000)
}

main().catch(e => {
  log(`fatal: ${e?.stack || e}`)
  process.exit(1)
})
