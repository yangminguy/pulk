// CTO Harness — Team Result Packet 집계 (PRD §11).
//
// 여러 Main Agent Work Package의 실행 결과를 받아 충돌(파일 겹침)을 탐지하고,
// 팀 전체 상태와 최종 권고를 결정론적으로 산출한다. I/O·네트워크 없음.

import type { TeamResultPacket } from './types';

type PackageResults = TeamResultPacket['packageResults'];
type PackageResult = PackageResults[number];
type Conflicts = TeamResultPacket['conflicts'];

/** merge 가능/통과로 간주하는 패키지 상태 집합. */
const PASSED_STATUSES = new Set<string>([
  'merge_ready',
  'passed',
  'pass',
  'success',
  'succeeded',
]);

/** 명시적으로 차단된 패키지 상태 집합. */
const BLOCKED_STATUSES = new Set<string>(['blocked', 'boundary_violation']);

/** 두 패키지가 같은 파일을 변경하면 conflict 1건을 생성한다. */
export function detectConflicts(
  packages: Array<{ packageId: string; changedFiles: string[] }>,
): Conflicts {
  const conflicts: Conflicts = [];

  for (let i = 0; i < packages.length; i++) {
    for (let j = i + 1; j < packages.length; j++) {
      const a = packages[i];
      const b = packages[j];

      const bFiles = new Set(b.changedFiles);
      const overlap = a.changedFiles.filter((f) => bFiles.has(f));

      if (overlap.length > 0) {
        conflicts.push({
          files: overlap,
          packages: [a.packageId, b.packageId],
          reason: 'file overlap',
          resolution: 'manual_review',
        });
      }
    }
  }

  return conflicts;
}

function isPassed(pkg: PackageResult): boolean {
  return PASSED_STATUSES.has(pkg.status);
}

function isBlocked(pkg: PackageResult): boolean {
  return (
    BLOCKED_STATUSES.has(pkg.status) || pkg.recommendation === 'discard'
  );
}

function recommendsHumanReview(pkg: PackageResult): boolean {
  return pkg.recommendation === 'human_review';
}

/** Team Result Packet을 집계한다. */
export function aggregateTeamResult(input: {
  teamRunId: string;
  parentTaskId: string;
  packageResults: PackageResults;
  finalChecks?: TeamResultPacket['finalChecks'];
}): TeamResultPacket {
  const { teamRunId, parentTaskId, packageResults } = input;
  const finalChecks = input.finalChecks ?? {};

  const conflicts = detectConflicts(packageResults);

  const passedCount = packageResults.filter(isPassed).length;
  const hasBlocked = packageResults.some(isBlocked);
  const hasHumanReview = packageResults.some(recommendsHumanReview);
  const total = packageResults.length;
  const allPassed = total > 0 && passedCount === total;
  const allFailed = total > 0 && passedCount === 0 && !hasBlocked;

  // ── status 결정 (우선순위: blocked > human_review > 성공/부분/실패) ──
  let status: TeamResultPacket['status'];
  if (hasBlocked) {
    status = 'blocked';
  } else if (hasHumanReview) {
    status = 'needs_human_review';
  } else if (allPassed) {
    status = 'passed';
  } else if (allFailed) {
    status = 'failed';
  } else {
    status = 'partial';
  }

  // ── finalRecommendation 결정 ──
  // conflict가 있으면 무조건 manual_review. 그 다음 실패 패키지가 있으면
  // retry_failed_package. 전부 merge_ready & conflict 없으면 merge_ready.
  const hasConflict = conflicts.length > 0;
  const hasFailedPackage = passedCount < total || hasBlocked;

  let finalRecommendation: TeamResultPacket['finalRecommendation'];
  if (hasConflict) {
    finalRecommendation = 'manual_review';
  } else if (hasFailedPackage) {
    finalRecommendation = 'retry_failed_package';
  } else if (allPassed) {
    finalRecommendation = 'merge_ready';
  } else {
    finalRecommendation = 'manual_review';
  }

  // ── nextAction 문자열 ──
  let nextAction: string;
  if (hasConflict) {
    nextAction = `${conflicts.length}건의 파일 충돌을 사람이 검토해 병합 순서를 결정한다`;
  } else if (finalRecommendation === 'retry_failed_package') {
    const failed = packageResults.filter((p) => !isPassed(p));
    const ids = failed.map((p) => p.packageId).join(', ');
    nextAction = `실패한 패키지(${ids})를 재실행한다`;
  } else if (finalRecommendation === 'merge_ready') {
    nextAction = '전체 패키지를 병합한다';
  } else {
    nextAction = '사람이 결과를 검토한다';
  }

  return {
    teamRunId,
    parentTaskId,
    status,
    packageResults,
    conflicts,
    finalChecks,
    finalRecommendation,
    nextAction,
  };
}
