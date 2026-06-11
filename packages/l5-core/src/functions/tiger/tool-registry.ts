// 호랑이(Tiger) 자가개선 루프 — 개선 대상 레지스트리(단일 진실원).
// 정본 SPEC: docs/TIGER_SELF_IMPROVE_SPEC.md (§1).
//
// 무인 자율(zero-touch) 원칙: 새 도구는 이 배열에 1줄 등록하면 수집·분석·디스패치
// 전 경로에 자동 편입된다. ACR(agent_control_room_docs)은 은퇴 — 등록하지 않는다.

import type { AgentRole } from '../../types/orchestration';
import type { ImprovementTargetEntry } from './types';

/**
 * 확정 등록 목록. error_sources는 repo_path 기준 상대 glob.
 * 표준 logs/를 아직 안 남기는 도구는 A(구조화 로그 심기) 작업 전까지 manual_intake로 둔다.
 */
export const IMPROVEMENT_TARGET_REGISTRY: readonly ImprovementTargetEntry[] = [
  // ── CMO 마케팅 워크플로우 ──────────────────────────────────────────────
  {
    id: 'cmo_slide_video_factory',
    owner: 'CMO',
    tool: 'AI 슬라이드/영상 팩토리',
    repo_path_kind: 'absolute',
    repo_path: '/Users/wonminyang/ai-slide-video-factory',
    error_sources: ['outputs/**/*.json', 'jobs/**/*.json'],
    manual_intake: true,
  },
  {
    id: 'cmo_viewtrap_youtube',
    owner: 'CMO',
    tool: 'viewtrap/유튜브 발굴',
    repo_path_kind: 'pulk-relative',
    repo_path: 'services/youtube',
    error_sources: ['logs/**/*.log'],
    manual_intake: true,
  },
  {
    id: 'cmo_video_room',
    owner: 'CMO',
    tool: '영상룸',
    repo_path_kind: 'pulk-relative',
    repo_path: 'apps/founder-ui',
    error_sources: ['e2e/artifacts/**/error*'],
    manual_intake: false,
  },
  {
    id: 'cmo_key_content_report',
    owner: 'CMO',
    tool: '키 콘텐츠 보고서',
    repo_path_kind: 'pulk-relative',
    repo_path: 'packages/l5-core',
    error_sources: [],
    manual_intake: true,
  },
  // ── CTO 엔지니어링 워크플로우 ─────────────────────────────────────────
  {
    id: 'cto_native_orchestration',
    owner: 'CTO',
    tool: 'Native Orchestration',
    repo_path_kind: 'pulk-relative',
    repo_path: 'services/agent-runtime',
    error_sources: ['logs/native-orch-*.log'],
    manual_intake: false,
  },
  {
    id: 'cto_hermes_runtime',
    owner: 'CTO',
    tool: 'Hermes 런타임',
    repo_path_kind: 'pulk-relative',
    repo_path: 'services/hermes-runtime',
    error_sources: ['logs/hermes-*.log'],
    manual_intake: false,
  },
  // ── 기타 임원 ─────────────────────────────────────────────────────────
  {
    id: 'ceo_daily_brief',
    owner: 'CEO',
    tool: '데일리 브리프',
    repo_path_kind: 'pulk-relative',
    repo_path: 'services/hermes-runtime',
    error_sources: ['logs/daily-brief-*.log'],
    manual_intake: false,
  },
  {
    id: 'cfo_cost_metrics',
    owner: 'CFO',
    tool: '비용/지표 집계',
    repo_path_kind: 'pulk-relative',
    repo_path: 'packages/l5-core',
    error_sources: [],
    manual_intake: true,
  },
  {
    id: 'cro_signal_intake',
    owner: 'CRO',
    tool: '(확장 슬롯)',
    repo_path_kind: 'pulk-relative',
    repo_path: 'packages/l5-core',
    error_sources: [],
    manual_intake: true,
  },
];

/** 전체 레지스트리(읽기 전용). */
export function listImprovementTargets(): readonly ImprovementTargetEntry[] {
  return IMPROVEMENT_TARGET_REGISTRY;
}

/** id로 단건 조회. */
export function getImprovementTarget(id: string): ImprovementTargetEntry | undefined {
  return IMPROVEMENT_TARGET_REGISTRY.find((e) => e.id === id);
}

/** 특정 임원이 소유한 도구만. */
export function targetsForOwner(owner: AgentRole): ImprovementTargetEntry[] {
  return IMPROVEMENT_TARGET_REGISTRY.filter((e) => e.owner === owner);
}

/**
 * repo_path_kind를 반영해 절대 repo 경로로 변환. 수집기와 CTO 디스패치가 동일 규칙을
 * 쓰도록 한 곳에 둔다(node 'path' 비의존 — 단순 문자열 결합). pulkRoot는 호출측이 주입.
 */
export function resolveRepoAbsPath(entry: ImprovementTargetEntry, pulkRoot: string): string {
  if (entry.repo_path_kind === 'absolute') return entry.repo_path;
  const root = pulkRoot.replace(/\/+$/, '');
  return `${root}/${entry.repo_path}`;
}
