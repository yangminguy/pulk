#!/usr/bin/env node
// cloudflared quick-tunnel keeper for L5 founder-ui (node version)
// - Spawns `cloudflared tunnel --url http://localhost:13000`
// - Extracts trycloudflare.com URL from stdout
// - If URL changed since last run, updates Vercel NEXT_PUBLIC_API_BASE
//   (production) and redeploys --prod
// - Exits when cloudflared dies so launchd respawns

import { spawn, spawnSync, execSync } from 'node:child_process'
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

  // --protocol http2: the default QUIC (UDP/7844) is blocked on this network, so
  // the quick tunnel never registers at the edge (URL prints but stays NXDOMAIN).
  // http2 uses TCP/443 and registers reliably.
  const cf = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${NOCO_PORT}`, '--protocol', 'http2', '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  log(`cloudflared spawned pid=${cf.pid}`)

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // Check liveness as an EXTERNAL client (e.g. the founder's phone) would: resolve
  // the host via public DNS (8.8.8.8) — the local router resolver NXDOMAINs fresh
  // trycloudflare subdomains — then curl via that IP. HTTP <500 = tunnel forwarding
  // (530/000 = dead). Avoids both the local-DNS false-negative and dead-tunnel sync.
  function tunnelLive(u) {
    try {
      const host = u.replace(/^https?:\/\//, '')
      const ip = execSync(`nslookup ${host} 8.8.8.8 2>/dev/null | awk '/^Address: /{print $2}' | head -1`, { encoding: 'utf8' }).trim()
      if (!ip) return false
      const code = execSync(`curl -s -m 8 -o /dev/null -w '%{http_code}' --resolve ${host}:443:${ip} https://${host}`, { encoding: 'utf8' }).trim()
      const n = Number(code)
      return n > 0 && n < 500
    } catch { return false }
  }
  // trycloudflare prints the URL BEFORE the edge connection registers, and some
  // sessions never register. Verify external reachability before syncing; if it
  // never comes up, kill cloudflared so launchd respawns a fresh session.
  async function verifyAndSync(u) {
    for (let i = 0; i < 20; i++) {
      await sleep(3000)
      try {
        if (tunnelLive(u)) {
          log(`tunnel reachable (public DNS) after ~${(i + 1) * 3}s`)
          if (u !== prev) {
            log(`URL changed: ${prev || '<none>'} -> ${u} — syncing Vercel`)
            writeState(u)
            try { vercelEnvSync(u) } catch (e) { log(`vercel sync threw: ${e?.message}`) }
          } else {
            log(`URL unchanged — no Vercel action`)
          }
          return
        }
      } catch { /* not up yet */ }
    }
    log('tunnel URL never became reachable (~60s) — killing cloudflared for respawn')
    try { cf.kill('SIGTERM') } catch {}
  }

  let buf = ''
  let url = null
  const onChunk = (chunk) => {
    const s = chunk.toString('utf8')
    buf += s
    if (!url) {
      const m = URL_RE.exec(buf)
      if (m) {
        url = m[0]
        log(`tunnel URL = ${url} — verifying reachability before sync`)
        verifyAndSync(url)
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
