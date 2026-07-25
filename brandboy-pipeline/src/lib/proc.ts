/**
 * proc.ts — 외부 프로세스 실행 (IMPLEMENTATION §7.6)
 *
 * - shell:true 금지. 인자를 배열로 넘긴다(파일명 공백·한글·특수문자가 실제로 자주 나온다).
 * - 타임아웃 필수(harvest.timeout_sec). yt-dlp·ffmpeg 은 매달릴 수 있다.
 * - 타임아웃 시 SIGTERM → 유예 후 SIGKILL. stderr 는 삼키지 않고 그대로 반환한다
 *   (silencedetect 파싱이 stderr 에 의존).
 *
 * SIGKILL 유예는 편집 수치가 아니라 프로세스 종료 정책이므로 config 가 아니라 여기 @unit 로 둔다.
 */
import { spawn } from 'node:child_process'

const MS_PER_SEC = 1000 // @unit 초→밀리초
const SIGKILL_GRACE_MS = 3000 // @unit SIGTERM 후 SIGKILL 까지 유예(ms)

export interface RunOptions {
  timeoutSec: number
  cwd?: string
  input?: string
}

export interface RunResult {
  stdout: string
  stderr: string
  code: number | null
  timedOut: boolean
}

/** cmd 를 args 배열로 실행한다. shell 미사용. 타임아웃 시 SIGTERM→(유예)→SIGKILL. */
export function run(cmd: string, args: string[], opts: RunOptions): Promise<RunResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let killTimer: NodeJS.Timeout | undefined

    const termTimer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), SIGKILL_GRACE_MS)
    }, opts.timeoutSec * MS_PER_SEC)

    const clear = (): void => {
      clearTimeout(termTimer)
      if (killTimer !== undefined) clearTimeout(killTimer)
    }

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    if (opts.input !== undefined) {
      child.stdin.write(opts.input)
      child.stdin.end()
    }

    child.on('close', (code) => {
      clear()
      resolvePromise({ stdout, stderr, code, timedOut })
    })
    child.on('error', (err) => {
      clear()
      resolvePromise({ stdout, stderr: `${stderr}${(err as Error).message}`, code: null, timedOut })
    })
  })
}
