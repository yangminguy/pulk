/**
 * cli.ts — pipeline CLI 진입점 (IMPLEMENTATION §7.1, T2-cli §1)
 *
 *   pipeline <command> --project <dir> [--only …] [--pilot pilot.json]
 *            [--force] [--dry-run] [--human] [--eval] [--emit …]
 *
 * 규약:
 *  - stdout 은 JSON 한 덩어리. 사람용 표는 --human 일 때만 stderr 로.
 *  - 진행 로그는 stderr. stdout 오염 금지(jq 파이프가 깨진다).
 *  - 종료 코드 0 성공 / 1 품질·처리 실패 / 2 입력 오류.
 *
 * T2 는 뼈대다. validate 만 실동작하고 나머지는 스코프 검사 후 "not implemented" exit 2 스텁이다
 *  (조용히 성공하지 않는다). 스코프 표는 SCOPES §6 그대로 — scope.ts 가 판정한다.
 */
import { validateProject, formatHuman, InputError } from './commands/validate.js'
import { runAlign } from './commands/align.js'
import { runReanchor } from './commands/reanchor.js'
import { runIngest } from './commands/ingest.js'
import { runPlan } from './commands/plan.js'
import { runReview } from './commands/review.js'
import { runHarvest } from './commands/harvest.js'
import { runAssemble, parseEmit, EMIT_DEFAULT } from './commands/assemble.js'
import { runQc } from './commands/qc.js'
import { ConfigError } from './lib/profile.js'
import { parseOnly, validateOnly, type OnlyKind } from './lib/scope.js'

const ARGV_OFFSET = 2 // @unit process.argv[0..1] = node, script
const EXIT_OK = 0
const EXIT_FAIL = 1
const EXIT_INPUT = 2 // @unit 입력 오류 종료 코드 (IMPLEMENTATION §7.1)
const HELP_NAME_WIDTH = 10 // @unit help 표 명령어 열 정렬 폭 (표시 형식)

interface CommandSpec {
  name: string
  onlyKind: OnlyKind
  pilot: boolean
  needsProject: boolean
  implemented: boolean
  task: string
  summary: string
}

const COMMANDS: CommandSpec[] = [
  { name: 'validate', onlyKind: 'none', pilot: false, needsProject: true, implemented: true, task: 'T1', summary: '스키마 + 치명 오류/품질 경고 검증' },
  { name: 'ingest', onlyKind: 'none', pilot: false, needsProject: true, implemented: true, task: 'T7b', summary: 'A-roll 등록 (catalog kind:a_roll)' },
  { name: 'align', onlyKind: 'session', pilot: false, needsProject: true, implemented: true, task: 'T3', summary: '통녹음 → 연속 마스터 + 단어 시각 + 자막' },
  { name: 'reanchor', onlyKind: 'beat', pilot: false, needsProject: true, implemented: true, task: 'T3', summary: '시각 재고정 (align-remap → start/end/timing_rev)' },
  { name: 'plan', onlyKind: 'beat', pilot: true, needsProject: true, implemented: true, task: 'T7', summary: 'beat-plan.json 병합 (--apply, Z1)' },
  { name: 'review', onlyKind: 'beat', pilot: true, needsProject: true, implemented: true, task: 'T4', summary: '검수 결정 병합 (--apply, Z2) · 스토리보드 HTML' },
  { name: 'harvest', onlyKind: 'beat', pilot: true, needsProject: true, implemented: true, task: 'T7', summary: '구간 검색 → 후보 수집 → 프록시/고화질 수급' },
  { name: 'assemble', onlyKind: 'none', pilot: true, needsProject: true, implemented: true, task: 'T5', summary: '샷 플랜 → CapCut 초안 + 순번 파일 + 큐 파일' },
  { name: 'qc', onlyKind: 'none', pilot: true, needsProject: true, implemented: true, task: 'T6', summary: '정량 리포트 + 수정 목록' },
]

function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((c) => c.name === name)
}

function getOpt(argv: string[], key: string): string | undefined {
  const i = argv.indexOf(`--${key}`)
  if (i === -1) return undefined
  const val = argv[i + 1]
  return val !== undefined && !val.startsWith('--') ? val : undefined
}

function hasFlag(argv: string[], key: string): boolean {
  return argv.includes(`--${key}`)
}

/** --apply file1 file2 … : --apply 뒤 연속한 비-플래그 인자를 모두 모은다. */
function getMulti(argv: string[], key: string): string[] {
  const i = argv.indexOf(`--${key}`)
  if (i === -1) return []
  const out: string[] = []
  for (let j = i + 1; j < argv.length; j++) {
    const v = argv[j]
    if (v === undefined || v.startsWith('--')) break
    out.push(v)
  }
  return out
}

function emitJson(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

function topLevelHelp(): string {
  const lines = ['pipeline <command> --project <dir> [--only …] [--pilot pilot.json] [--force] [--dry-run] [--human] [--eval] [--emit …]', '', '명령:']
  for (const c of COMMANDS) {
    const scope = [c.onlyKind !== 'none' ? `--only ${c.onlyKind}` : '', c.pilot ? '--pilot' : ''].filter((s) => s).join(' ')
    const status = c.implemented ? '' : `(미구현 ${c.task})`
    lines.push(`  ${c.name.padEnd(HELP_NAME_WIDTH)} ${c.summary}${scope ? `  [${scope}]` : ''} ${status}`.trimEnd())
  }
  lines.push('', '전역 옵션: --project(필수) --only --pilot --force --dry-run --human --eval --emit')
  return lines.join('\n') + '\n'
}

function commandHelp(spec: CommandSpec): string {
  const only = spec.onlyKind === 'none' ? '미지원 (지정 시 exit 2)' : spec.onlyKind
  const lines = [
    `pipeline ${spec.name} --project <dir>${spec.onlyKind !== 'none' ? ' [--only …]' : ''}${spec.pilot ? ' [--pilot pilot.json]' : ''} [--force] [--dry-run] [--human] [--eval] [--emit …]`,
    ``,
    `  ${spec.summary}`,
    `  --only : ${only}`,
    `  --pilot: ${spec.pilot ? '지원 (첫 연속 구간 spine 룩체크)' : '미지원 (지정 시 exit 2)'}`,
  ]
  if (spec.name === 'assemble') {
    lines.push(
      `  --emit : 콤마 목록 capcut|numbered|resolve (별칭 both=capcut,numbered · all=셋 다)`,
      `           기본 ${EMIT_DEFAULT} (Resolve OTIO 자동 + 순번 파일 병행, capcut 초안은 명시 시만)`,
      `           resolve → resolve/<slug>.otio + RESOLVE.md (Resolve 18.5+ 타임라인 임포트)`,
    )
  }
  lines.push(`  상태  : ${spec.implemented ? '구현됨' : `미구현 (${spec.task})`}`)
  return lines.join('\n') + '\n'
}

function runValidate(projectDir: string, human: boolean): number {
  const { result, stats } = validateProject(projectDir)
  emitJson(result)
  if (human) process.stderr.write(formatHuman(result, stats))
  return result.ok ? EXIT_OK : EXIT_FAIL
}

async function main(): Promise<void> {
  const argv = process.argv.slice(ARGV_OFFSET)
  const command = argv[0]

  // 명시적 --help/-h 만 stdout(exit 0). 명령 없음/알 수 없는 명령은 에러 경로이므로
  // help 를 stderr 로 — stdout 은 JSON 전용이라 에러 시 비어야 `2>/dev/null | jq` 가 안 깨진다.
  if (command === '--help' || command === '-h') {
    process.stdout.write(topLevelHelp())
    process.exit(EXIT_OK)
  }
  if (command === undefined) {
    process.stderr.write(topLevelHelp())
    process.exit(EXIT_INPUT)
  }

  const spec = findCommand(command)
  if (spec === undefined) {
    process.stderr.write(`알 수 없는 명령: ${command}\n`)
    process.stderr.write(topLevelHelp())
    process.exit(EXIT_INPUT)
  }

  if (hasFlag(argv, 'help')) {
    process.stdout.write(commandHelp(spec))
    process.exit(EXIT_OK)
  }

  const projectDir = getOpt(argv, 'project')
  if (spec.needsProject && projectDir === undefined) {
    process.stderr.write(`${spec.name}: 필수 옵션 누락 --project <dir>\n`)
    process.exit(EXIT_INPUT)
  }

  // ── 스코프 검사 (SCOPES §6) — 실동작 전에 flag 부터 판정 ──
  const onlyValues = parseOnly(getOpt(argv, 'only'))
  if (onlyValues.length > 0) {
    const err = validateOnly(spec.onlyKind, onlyValues)
    if (err !== null) {
      process.stderr.write(`${spec.name}: ${err}\n`)
      process.exit(EXIT_INPUT)
    }
  }
  if (getOpt(argv, 'pilot') !== undefined && !spec.pilot) {
    process.stderr.write(`${spec.name}: 이 명령은 --pilot 을 지원하지 않는다\n`)
    process.exit(EXIT_INPUT)
  }

  // ── 디스패치 ──
  const human = hasFlag(argv, 'human')
  try {
    if (spec.name === 'validate') {
      process.exit(runValidate(projectDir!, human))
    }
    if (spec.name === 'align') {
      const { summary, exitCode } = await runAlign(projectDir!, {
        only: onlyValues, dryRun: hasFlag(argv, 'dry-run'), human, model: getOpt(argv, 'model'),
      })
      emitJson(summary)
      process.exit(exitCode)
    }
    if (spec.name === 'reanchor') {
      const { summary, exitCode } = runReanchor(projectDir!, { only: onlyValues, human })
      emitJson(summary)
      process.exit(exitCode)
    }
    if (spec.name === 'plan') {
      const applyPath = getOpt(argv, 'apply')
      if (applyPath === undefined) {
        process.stderr.write(`plan: 필수 옵션 누락 --apply <beat-plan.json>\n`)
        process.exit(EXIT_INPUT)
      }
      const { summary, exitCode } = runPlan(projectDir!, { applyPath, only: onlyValues, human })
      emitJson(summary)
      process.exit(exitCode)
    }
    if (spec.name === 'review') {
      const { summary, exitCode } = runReview(projectDir!, {
        applyPaths: getMulti(argv, 'apply'), force: hasFlag(argv, 'force'), only: onlyValues, human,
      })
      emitJson(summary)
      process.exit(exitCode)
    }
    if (spec.name === 'harvest') {
      const { summary, exitCode } = await runHarvest({
        projectDir: projectDir!,
        only: onlyValues,
        pilotPath: getOpt(argv, 'pilot'),
        evalMode: hasFlag(argv, 'eval'),
        stage: getOpt(argv, 'stage'),
        human,
      })
      emitJson(summary)
      process.exit(exitCode)
    }
    if (spec.name === 'assemble') {
      const parsed = parseEmit(getOpt(argv, 'emit') ?? EMIT_DEFAULT)
      if (!parsed.ok) {
        process.stderr.write(`assemble: ${parsed.error}\n`)
        process.exit(EXIT_INPUT)
      }
      const { summary, exitCode } = await runAssemble(projectDir!, {
        emit: parsed.targets, pilotPath: getOpt(argv, 'pilot'), force: hasFlag(argv, 'force'),
        human, draftsDir: getOpt(argv, 'drafts'),
      })
      emitJson(summary)
      process.exit(exitCode)
    }
    if (spec.name === 'qc') {
      const { report, exitCode } = await runQc(projectDir!, { pilotPath: getOpt(argv, 'pilot'), human })
      emitJson(report)
      process.exit(exitCode)
    }
    if (spec.name === 'ingest') {
      const aRollDir = getOpt(argv, 'a-roll')
      if (aRollDir === undefined) {
        process.stderr.write(`ingest: 필수 옵션 누락 --a-roll <촬영폴더>\n`)
        process.exit(EXIT_INPUT)
      }
      const res = await runIngest({ projectDir: projectDir!, aRollDir, human, dryRun: hasFlag(argv, 'dry-run') })
      emitJson(res.report)
      if (human) process.stderr.write(res.human)
      process.exit(res.exitCode)
    }
    process.stderr.write(`${spec.name}: not implemented (${spec.task})\n`)
    process.exit(EXIT_INPUT)
  } catch (err) {
    if (err instanceof InputError || err instanceof ConfigError) {
      process.stderr.write(`입력 오류: ${err.message}\n`)
      process.exit(EXIT_INPUT)
    }
    throw err
  }
}

main().catch((err) => {
  process.stderr.write(`예외: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(EXIT_FAIL)
})
