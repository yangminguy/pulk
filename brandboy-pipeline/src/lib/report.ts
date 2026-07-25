/**
 * report.ts — 부분 실패 리포트 (IMPLEMENTATION §7.4, T2-cli §1)
 *
 * 한 비트가 실패해도 전체를 중단하지 않는다. 단 범위 안 critical 실패는 예외.
 *  - blocked 비어있음        → exit 0
 *  - blocked 있음            → exit 1 (범위 안 critical 미달)
 *  - deferred_blocked 있음   → exit 0 + stderr 경고 (--only 범위 밖 critical. 숨기지 않음)
 *
 * T3/T5/T7: newReport() 로 시작, process/skip/fail/block/defer 로 채우고, finalizeReport() 로 마감.
 */

export interface FailureItem {
  beat_id?: string
  shot_id?: string
  importance?: string
  reason: string
  action_required?: boolean
}

export interface PartialReport {
  ok: boolean
  processed: number
  skipped: number
  failed: FailureItem[]
  blocked: FailureItem[]
  deferred_blocked: FailureItem[]
}

export function newReport(): PartialReport {
  return { ok: true, processed: 0, skipped: 0, failed: [], blocked: [], deferred_blocked: [] }
}

/**
 * ok 와 종료 코드를 계산한다. deferred_blocked 는 stderr 경고를 낸다(숨기지 않음).
 * blocked 가 있으면 exit 1, 아니면 exit 0.
 */
export function finalizeReport(report: PartialReport): { report: PartialReport; exitCode: number } {
  report.ok = report.blocked.length === 0
  if (report.deferred_blocked.length > 0) {
    process.stderr.write(
      `[warn] --only 범위 밖 critical 미달 ${report.deferred_blocked.length}건(deferred_blocked). ` +
        `범위를 넓혀 재처리 필요: ${report.deferred_blocked.map((d) => d.beat_id ?? d.shot_id ?? '-').join(', ')}\n`,
    )
  }
  return { report, exitCode: report.ok ? 0 : 1 }
}
