// Founder-owned columns the founder asked pulk to auto-fill (2026-07-09):
// 영역(select) / 워크플로우 태그(multi_select) / PR·이슈 링크(url).
//
// These stay founder-owned: pulk only FILLS EMPTY values (never overwrites a
// founder edit), derives values deterministically from task text, and picks
// only from the founder's existing option sets (never invents new options —
// writing an unknown select name would silently create it in Notion).
// Schema-checked like the optional pulk columns: missing/wrong-typed → skip.
// Pure — no network, unit-testable.

import type { AgentTask } from '../../types/orchestration';
import type {
  NotionDatabaseSchema,
  NotionPage,
  NotionPropertiesPayload,
  NotionWriteProperty,
} from './types';

/** Founder-owned column names in the "코딩 워크플로우 로그" DB. */
export const FOUNDER_PROP = {
  area: '영역',
  workflowTags: '워크플로우 태그',
  prLink: 'PR/이슈 링크',
} as const;

/** Expected Notion property type for each founder column. */
export const FOUNDER_PROP_TYPE: Record<string, string> = {
  [FOUNDER_PROP.area]: 'select',
  [FOUNDER_PROP.workflowTags]: 'multi_select',
  [FOUNDER_PROP.prLink]: 'url',
};

/** Founder columns present in the live schema WITH the expected type. */
export function filterFounderProps(schema: NotionDatabaseSchema): Set<string> {
  const out = new Set<string>();
  for (const [name, expected] of Object.entries(FOUNDER_PROP_TYPE)) {
    if (schema[name]?.type === expected) out.add(name);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic derivation from task text. Values come ONLY from the founder's
// existing option sets below — if a rule can't decide, fall back ('Etc'/'구현')
// rather than inventing an option.

/** The founder's 영역 select options (fixed — do not add options via sync). */
export type AreaOption = 'Frontend' | 'Backend' | 'Infra/DevOps' | 'Data' | 'Mobile' | 'Etc';

/** The founder's 워크플로우 태그 multi_select options (fixed). */
export type WorkflowTag =
  | '요구사항/분석'
  | '설계'
  | '구현'
  | '디버깅'
  | '리팩토링'
  | '테스트'
  | '문서화'
  | '배포';

// Two-pass matching: the title is the task's own subject, so it decides first;
// rationale/expected_output are only consulted when the title says nothing —
// they mention surrounding systems ("Slack 메시지 스타일", "UI에 표시") and
// mislead when mixed in from the start (observed live 2026-07-09).
function detailText(task: AgentTask): string {
  return [task.rationale, task.expected_output].filter(Boolean).join(' ');
}

function matchArea(t: string): AreaOption | null {
  if (/모바일|mobile|\bios\b|android/i.test(t)) return 'Mobile';
  if (/\bui\b|컴포넌트|프론트|화면|위젯|배지|버튼|\bcss\b|founder-ui|next\.?js|react/i.test(t)) return 'Frontend';
  if (/집계|지표|메트릭|통계|분석 함수|리포트/i.test(t)) return 'Data';
  if (/launchd|데몬|배포 파이프라인|인프라|docker|ci\/cd|스케줄|cron/i.test(t)) return 'Infra/DevOps';
  if (/\bapi\b|서버|엔드포인트|백엔드|플러그인|스키마|\bdb\b|함수|게이트웨이|웹훅|동기화/i.test(t)) return 'Backend';
  return null;
}

/** 영역: decide from the title first; fall back to detail text, then Etc. */
export function deriveArea(task: AgentTask): AreaOption {
  return matchArea(task.title ?? '') ?? matchArea(detailText(task)) ?? 'Etc';
}

function matchTags(t: string): WorkflowTag[] {
  const tags: WorkflowTag[] = [];
  if (/요구사항|리서치|조사|현황 파악/i.test(t)) tags.push('요구사항/분석');
  if (/설계|아키텍처|architecture|스펙 작성/i.test(t)) tags.push('설계');
  if (/버그|디버깅|debug|\bfix\b|오류 수정|장애/i.test(t)) tags.push('디버깅');
  if (/리팩토링|refactor|클린업/i.test(t)) tags.push('리팩토링');
  if (/테스트|\btest\b|스모크|\bqa\b|\be2e\b/i.test(t)) tags.push('테스트');
  if (/문서화|문서 작성|readme|\bdocs\b/i.test(t)) tags.push('문서화');
  if (/배포|deploy|라이브 전환|릴리즈|release/i.test(t)) tags.push('배포');
  return tags;
}

/** 워크플로우 태그: title first, detail fallback; defaults to 구현. */
export function deriveWorkflowTags(task: AgentTask): WorkflowTag[] {
  const title = task.title ?? '';
  const tags = matchTags(title);
  if (tags.length === 0) tags.push(...matchTags(detailText(task)));
  // Implementation is the default nature of an agent task: tag it when the
  // title says so, or when nothing more specific matched.
  if (/구현|개발|추가|만들|생성|작성|연동/i.test(title) || tags.length === 0) tags.unshift('구현');
  return tags;
}

// ---------------------------------------------------------------------------
// Fill-if-empty payload builder.

function isEmptyOnPage(page: NotionPage | null, name: string): boolean {
  if (!page) return true; // create → nothing to preserve
  const p = page.properties?.[name];
  if (!p) return true;
  if (p.select !== undefined) return p.select === null;
  if (p.multi_select !== undefined) return (p.multi_select?.length ?? 0) === 0;
  if (p.url !== undefined) return !p.url;
  return true;
}

/**
 * Founder-column properties to write for this task: only columns that exist in
 * the live schema (availFounderProps) AND are currently empty on the Notion
 * page (founder edits are never overwritten). PR/이슈 링크 is written only when
 * the task actually has a PR (task.acr_pr_url) — no PR, no write.
 */
export function buildFounderFillProps(
  task: AgentTask,
  availFounderProps: ReadonlySet<string> | undefined,
  page: NotionPage | null,
): NotionPropertiesPayload {
  if (!availFounderProps || availFounderProps.size === 0) return {};

  const candidates: Record<string, NotionWriteProperty | null> = {
    [FOUNDER_PROP.area]: { select: { name: deriveArea(task) } },
    [FOUNDER_PROP.workflowTags]: {
      multi_select: deriveWorkflowTags(task).map((name) => ({ name })),
    },
    [FOUNDER_PROP.prLink]: task.acr_pr_url ? { url: task.acr_pr_url } : null,
  };

  const out: NotionPropertiesPayload = {};
  for (const [name, prop] of Object.entries(candidates)) {
    if (prop !== null && availFounderProps.has(name) && isEmptyOnPage(page, name)) {
      out[name] = prop;
    }
  }
  return out;
}
