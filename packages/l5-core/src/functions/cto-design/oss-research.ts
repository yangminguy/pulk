/**
 * OSS Research Helper — CTO FEATURE/BIG_CHANGE "research" phase
 *
 * Pure logic module: no network IO, no file IO, no secrets.
 * All external access is injected via OssSearchClient.
 * Callers (agent-runtime / nocobase plugin) wire the real transport.
 *
 * Allowed licenses: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause.
 * Passing filter: license allowed AND stars > 1000 AND lastActivity within 6 months.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AllowedLicense =
  | 'MIT'
  | 'Apache-2.0'
  | 'BSD-2-Clause'
  | 'BSD-3-Clause';

export interface OssCandidate {
  /** e.g. "owner/repo" or a display name */
  name: string;
  /** SPDX identifier */
  license: string;
  stars: number;
  /** ISO-8601 string of last commit or release */
  lastActivityAt: string;
  description: string;
  url: string;
}

export interface RepoMeta {
  name: string;
  license: string;
  stars: number;
  lastActivityAt: string;
  description: string;
  url: string;
}

/**
 * Injected search/fetch interface.
 * The l5-core module never calls this directly — it is only the type contract.
 * Implementations live in agent-runtime or nocobase plugins.
 */
export interface OssSearchClient {
  search(query: string): Promise<OssCandidate[]>;
  fetchRepoMeta(repo: string): Promise<RepoMeta>;
}

export interface OssDecisionEntry {
  feature: string;
  decidedAt: string;
  decision: 'adopt' | 'build' | 'defer';
  chosen?: string;
  rationale: string;
  comparisonTable: string;
  candidates: OssCandidate[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_LICENSES: ReadonlySet<string> = new Set<AllowedLicense>([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
]);

const MIN_STARS = 1000;
/** 6 months expressed in milliseconds */
const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Pure filter
// ---------------------------------------------------------------------------

/**
 * Filter OSS candidates against the three hard rules:
 *   1. License must be in ALLOWED_LICENSES
 *   2. Stars must exceed MIN_STARS (> 1000)
 *   3. lastActivityAt must be within the last 6 months relative to `now`
 *
 * @param candidates - raw search results
 * @param now        - reference Date (inject in tests for determinism)
 */
export function filterCandidates(
  candidates: OssCandidate[],
  now: Date,
): OssCandidate[] {
  const cutoff = now.getTime() - SIX_MONTHS_MS;
  return candidates.filter((c) => {
    if (!ALLOWED_LICENSES.has(c.license)) return false;
    if (c.stars <= MIN_STARS) return false;
    const lastMs = new Date(c.lastActivityAt).getTime();
    if (isNaN(lastMs) || lastMs < cutoff) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Comparison table
// ---------------------------------------------------------------------------

/**
 * Build a Markdown comparison table from the filtered candidate list.
 * Returns an empty-state message when the list is empty.
 */
export function buildComparisonTable(candidates: OssCandidate[]): string {
  if (candidates.length === 0) {
    return '_No candidates passed the license / activity / popularity filter._';
  }

  const header = '| Name | License | Stars | Last Activity | Description | URL |';
  const divider = '|------|---------|-------|---------------|-------------|-----|';
  const rows = candidates.map((c) => {
    const activity = c.lastActivityAt.slice(0, 10); // YYYY-MM-DD
    const desc = c.description.replace(/\|/g, '\\|');
    return `| ${c.name} | ${c.license} | ${c.stars.toLocaleString()} | ${activity} | ${desc} | ${c.url} |`;
  });

  return [header, divider, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Decision entry formatter
// ---------------------------------------------------------------------------

/**
 * Format a single `cto-buy-decisions.md` append entry as a Markdown string.
 * The caller is responsible for writing this string to disk.
 *
 * @param entry     - structured decision data
 * @param decidedAt - ISO-8601 timestamp (inject; never call Date.now() inside)
 */
export function formatDecisionEntry(entry: OssDecisionEntry): string {
  const candidateList = entry.candidates
    .map((c) => `- **${c.name}** (${c.license}, ${c.stars.toLocaleString()} stars)`)
    .join('\n');

  return [
    `## ${entry.feature}`,
    '',
    `**Decided:** ${entry.decidedAt}  `,
    `**Decision:** \`${entry.decision}\`${entry.chosen ? `  — ${entry.chosen}` : ''}`,
    '',
    '### Rationale',
    '',
    entry.rationale,
    '',
    '### Candidates evaluated',
    '',
    candidateList || '_none_',
    '',
    '### Comparison table',
    '',
    entry.comparisonTable,
    '',
    '---',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Orchestration helper (pure; wires the above into a single call)
// ---------------------------------------------------------------------------

export interface OssResearchOptions {
  /** Feature or task being researched */
  feature: string;
  /** Search query forwarded to OssSearchClient.search */
  searchQuery: string;
  /** Reference time — inject for determinism */
  now: Date;
  /** Decision rationale written by the caller / LLM */
  rationale: string;
  /** Final decision */
  decision: 'adopt' | 'build' | 'defer';
  /** Name of the chosen library (only when decision === 'adopt') */
  chosen?: string;
}

/**
 * Orchestrate a research pass given pre-fetched candidates.
 * Network calls are NOT made here; the caller must supply `candidates`
 * (obtained via OssSearchClient.search + optional OssSearchClient.fetchRepoMeta).
 */
export function runOssResearch(
  candidates: OssCandidate[],
  opts: OssResearchOptions,
): OssDecisionEntry {
  const filtered = filterCandidates(candidates, opts.now);
  const comparisonTable = buildComparisonTable(filtered);
  const entry: OssDecisionEntry = {
    feature: opts.feature,
    decidedAt: opts.now.toISOString(),
    decision: opts.decision,
    chosen: opts.chosen,
    rationale: opts.rationale,
    comparisonTable,
    candidates: filtered,
  };
  return entry;
}
