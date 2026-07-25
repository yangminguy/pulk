/**
 * review.ts — review 명령 (T4, Z2)
 *
 *   pipeline review --project <dir>                       → 스토리보드 review.html 생성
 *   pipeline review --project <dir> --apply <log...>      → 결정 로그 병합(Z2) + usage.json
 *
 * HTML 생성은 src/review/render.ts, 병합은 src/review/apply.ts 가 담당한다. 이 파일은 배선만.
 */
import { resolve } from 'node:path'
import { writeAtomic } from '../lib/io.js'
import { loadReviewInput, renderReviewHtml } from '../review/render.js'
import { applyDecisions, type ApplySummary } from '../review/apply.js'

export interface ReviewOptions {
  applyPaths: string[]
  force: boolean
  only: string[]
  human: boolean
}

export interface RenderSummary {
  ok: boolean
  mode: 'render'
  out: string
  project: string
  revision: number
  cards: number
  warnings: number
}

export type ReviewSummary = RenderSummary | ApplySummary

export function runReview(projectDir: string, opts: ReviewOptions): { summary: ReviewSummary; exitCode: number } {
  if (opts.applyPaths.length > 0) {
    return applyDecisions(projectDir, { applyPaths: opts.applyPaths, force: opts.force, human: opts.human })
  }

  const input = loadReviewInput(projectDir)
  const html = renderReviewHtml(input)
  const out = resolve(projectDir, 'review.html')
  writeAtomic(out, html)

  const summary: RenderSummary = {
    ok: true, mode: 'render', out, project: input.project,
    revision: input.revision, cards: input.cards.length, warnings: input.warnings.length,
  }
  if (opts.human) {
    process.stderr.write(`\n■ review — ${out}\n  project=${input.project} rev=${input.revision} 검수샷=${input.cards.length} 경고=${input.warnings.length}\n`)
  }
  return { summary, exitCode: 0 }
}
