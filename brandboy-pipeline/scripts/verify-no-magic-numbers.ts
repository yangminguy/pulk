/**
 * verify-no-magic-numbers.ts — src/ 수치 하드코딩 0건 강제 (T2 §6 선구현)
 *
 * 편집 수치는 전부 config/edit-profile.json(profile.ts) 을 지나야 한다. 코드에 리터럴이 남으면 결함이다.
 *
 * 2단계:
 *  1) stripSpans — 주석·문자열·템플릿 문자열·정규식 구간을 공백으로 지운다(줄바꿈 보존).
 *     TS 스캐너는 파서 문맥 없이는 `/정규식/` 과 나눗셈, 템플릿 꼬리(`}...${`)를 구별하지 못해
 *     `\d{3}` 이나 "15분당" 같은 문자열 속 숫자를 오탐한다. 그래서 그 구간을 먼저 지운다.
 *     템플릿의 `${...}` 표현식은 코드이므로 보존한다(그 안의 매직넘버도 잡는다).
 *  2) tsgo 스캐너로 잔여 코드의 NumericLiteral 토큰을 정확히 집어낸다.
 *
 * 허용:
 *  - 0 · 1 (부호 반전 -1 은 리터럴 1 로 스캔되어 허용)
 *  - 배열/튜플 인덱스 위치 정수 (arr[2] 의 2 — 앞 `[` · 뒤 `]`)
 *  - // @unit 주석이 있는 (원본) 라인
 * 불허: 2 · 100 · 1000 을 포함한 그 밖의 모든 숫자 리터럴
 *
 * 실행:  npx tsx scripts/verify-no-magic-numbers.ts
 * stdout: 결과 JSON 한 덩어리 / 진행: stderr / 위반 시 exit 1
 *
 * 주: tsgo 의 unstable/ast 는 .d.ts 를 제공하지 않아 createRequire + 로컬 인터페이스로 로드한다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

interface Scanner {
  setText(text: string, start: number, length: number): void
  scan(): number
  getTokenValue(): string
  getTokenStart(): number
}
interface AstApi {
  createScanner(target: number, skipTrivia: boolean, variant: number): Scanner
  ScriptTarget: { Latest: number }
  LanguageVariant: { Standard: number }
  SyntaxKind: { NumericLiteral: number; EndOfFile: number; OpenBracketToken: number; CloseBracketToken: number }
}
const ast = require('typescript/unstable/ast') as AstApi
const K = ast.SyntaxKind

const ROOT = resolve(import.meta.dirname, '..')
const SRC = resolve(ROOT, 'src')
const ALLOWED_VALUES = new Set([0, 1])
const UNIT_MARK = '@unit'
// `/` 가 정규식으로 시작하는 직전 유의미 문자 집합 (표현식 위치). 식별자·`)`·`]`·숫자 뒤는 나눗셈.
const REGEX_PREFIX = new Set(['', '(', '{', '[', ',', ';', ':', '=', '!', '&', '|', '?', '+', '-', '*', '%', '^', '~', '<', '>', 'r'])

interface Violation { file: string; line: number; value: string; lineText: string }
interface Tok { kind: number; value: string; start: number }
type Frame = { t: 'tmpl' } | { t: 'expr'; depth: number }

function collectTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

/** 주석·문자열·템플릿 문자열·정규식 구간을 공백으로 치환(줄바꿈 보존). 템플릿 `${...}` 는 코드로 유지. */
function stripSpans(src: string): string {
  const out = src.split('')
  const n = src.length
  const stack: Frame[] = []
  let lastSig = ''
  const blank = (a: number, b: number): void => {
    for (let k = a; k < Math.min(b, n); k++) if (out[k] !== '\n') out[k] = ' '
  }
  let i = 0
  while (i < n) {
    const c = src[i]!
    const top = stack[stack.length - 1]
    if (top?.t === 'tmpl') {
      if (c === '\\') { blank(i, i + 2); i += 2; continue }
      if (c === '`') { out[i] = ' '; stack.pop(); lastSig = '`'; i++; continue }
      if (c === '$' && src[i + 1] === '{') { stack.push({ t: 'expr', depth: 0 }); lastSig = '{'; i += 2; continue }
      out[i] = ' '; i++; continue
    }
    if (c === '/' && src[i + 1] === '/') { const j = src.indexOf('\n', i); blank(i, j < 0 ? n : j); i = j < 0 ? n : j; continue }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const j = e < 0 ? n : e + 2; blank(i, j); i = j; continue }
    if (c === '\'' || c === '"') {
      let j = i + 1
      while (j < n) { if (src[j] === '\\') { j += 2; continue } if (src[j] === c || src[j] === '\n') { j++; break } j++ }
      blank(i, j); lastSig = c; i = j; continue
    }
    if (c === '`') { out[i] = ' '; stack.push({ t: 'tmpl' }); i++; continue }
    if (c === '/' && REGEX_PREFIX.has(lastSig)) {
      let j = i + 1
      let inClass = false
      while (j < n) {
        const d = src[j]
        if (d === '\\') { j += 2; continue }
        if (d === '\n') break
        if (d === '[') inClass = true
        else if (d === ']') inClass = false
        else if (d === '/' && !inClass) { j++; break }
        j++
      }
      while (j < n && /[a-z]/i.test(src[j]!)) j++ // flags
      blank(i, j); lastSig = '/'; i = j; continue
    }
    if (c === '{' && top?.t === 'expr') { top.depth++; lastSig = c; i++; continue }
    if (c === '}' && top?.t === 'expr') {
      if (top.depth === 0) { stack.pop(); lastSig = '}'; i++; continue }
      top.depth--; lastSig = c; i++; continue
    }
    if (!/\s/.test(c)) lastSig = /[A-Za-z0-9_$]/.test(c) ? 'r' : c // 식별자/숫자는 'r'(=나눗셈 문맥)로 접음
    i++
  }
  return out.join('')
}

function lineStartsOf(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return starts
}
function lineIndexOf(starts: number[], pos: number): number {
  let lo = 0
  let hi = starts.length - 1
  let ans = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid]! <= pos) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}

function scanTokens(text: string): Tok[] {
  const scanner = ast.createScanner(ast.ScriptTarget.Latest, true, ast.LanguageVariant.Standard)
  scanner.setText(text, 0, text.length)
  const toks: Tok[] = []
  for (;;) {
    const kind = scanner.scan()
    if (kind === K.EndOfFile) break
    toks.push({ kind, value: scanner.getTokenValue(), start: scanner.getTokenStart() })
  }
  return toks
}

function checkFile(file: string, violations: Violation[]): void {
  const text = readFileSync(file, 'utf8')
  const stripped = stripSpans(text)
  const starts = lineStartsOf(text)
  const lines = text.split('\n')
  const toks = scanTokens(stripped)
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!
    if (t.kind !== K.NumericLiteral) continue
    const value = Number(t.value)
    const li = lineIndexOf(starts, t.start)
    const lineText = lines[li] ?? ''
    const isIndex = toks[i - 1]?.kind === K.OpenBracketToken && toks[i + 1]?.kind === K.CloseBracketToken
    const allowed = ALLOWED_VALUES.has(value) || isIndex || lineText.includes(UNIT_MARK)
    if (!allowed) {
      violations.push({ file: file.slice(ROOT.length + 1), line: li + 1, value: t.value, lineText: lineText.trim() })
    }
  }
}

const files = collectTsFiles(SRC)
const violations: Violation[] = []
for (const f of files) checkFile(f, violations)

for (const v of violations) {
  process.stderr.write(`  ${v.file}:${v.line}  값=${v.value}  |  ${v.lineText}\n`)
}
const pass = violations.length === 0
console.log(JSON.stringify({ pass, scanned: files.length, violations }))
process.stderr.write(`\n${pass ? 'CLEAN' : 'MAGIC NUMBERS FOUND'} — 파일 ${files.length}개 · 위반 ${violations.length}건\n`)
if (!pass) process.exitCode = 1
