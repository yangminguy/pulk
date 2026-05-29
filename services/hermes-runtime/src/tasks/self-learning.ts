// self-learning — Wave 2 slice 2.4
// Runs at 09:00 via launchd. Risk level: D1 (read-only observation + file write + optional alert).
//
// Responsibilities:
//   1. Fetch changelogs from Claude / Codex / Antigravity (best-effort, network optional).
//   2. Diff against the last recorded snapshot to detect new content.
//   3. Append only new entries to cto-tool-catalog.md (cumulative log).
//   4. Write a structured "today's discovery" JSON record for the UI to read.
//   5. Send Telegram alert only when changes are detected (silent otherwise).
//   6. Never throws — all I/O is guarded. Safe in offline environments.

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { createTelegramClient } from '../notifier/telegram.js';
import type { TelegramClient } from '../notifier/telegram.js';

// ---------------------------------------------------------------------------
// Paths
//
// We need stable paths in both ESM (production) and CommonJS (jest/ts-jest).
// HERMES_DIR env var is set by launchd and takes priority. When not set
// (tests, local dev), fall back to process.cwd() — jest runs from the
// hermes-runtime package root, so cwd() == hermes-runtime dir.
// ---------------------------------------------------------------------------

// Resolve output paths from HERMES_DIR (set by launchd in production) or an
// explicit override. Tests pass overrides into a tmpdir so they never touch the
// real repo; production calls runSelfLearning() with no opts and gets defaults.
interface ResolvedPaths {
  catalogPath: string;
  stateDir: string;
  snapshotPath: string;
  discoveryPath: string;
}

function resolvePaths(opts?: SelfLearningOptions): ResolvedPaths {
  const hermesDir = process.env.HERMES_DIR ?? process.cwd();
  // cto-tool-catalog.md lives under docs/ at repo root (two levels above hermes-runtime)
  const repoRoot = join(hermesDir, '..', '..');
  const catalogPath = opts?.catalogPath ?? join(repoRoot, 'docs', 'cto-tool-catalog.md');
  // State dir: persisted inside hermes-runtime to keep it local to this service
  const stateDir = opts?.stateDir ?? join(hermesDir, '.omc', 'state');
  return {
    catalogPath,
    stateDir,
    snapshotPath: join(stateDir, 'self-learning-snapshot.json'),
    // Discovery record path — UI (Wave 2.2) reads this to render "오늘의 발견" card
    discoveryPath: join(stateDir, 'todays-discovery.json'),
  };
}

export interface SelfLearningOptions {
  /** Override the cto-tool-catalog.md path (tests). Defaults to <repo>/docs/. */
  catalogPath?: string;
  /** Override the state dir for snapshot + discovery (tests). */
  stateDir?: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChangelogEntry {
  source: string;
  label: string;
  fetched_at: string;
  /** Trimmed text content (first 2000 chars) */
  content_preview: string;
}

export interface DiscoveryRecord {
  date: string;
  generated_at: string;
  new_entries: ChangelogEntry[];
  sources_checked: number;
  sources_changed: number;
}

export interface SelfLearningResult {
  run_at: string;
  sources_checked: number;
  sources_changed: number;
  catalog_updated: boolean;
  notification_sent: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Changelog sources
// ---------------------------------------------------------------------------

interface ChangelogSource {
  id: string;
  label: string;
  url: string;
}

const CHANGELOG_SOURCES: ChangelogSource[] = [
  {
    id: 'anthropic-release-notes',
    label: 'Anthropic / Claude',
    url: 'https://docs.anthropic.com/en/release-notes/overview',
  },
  {
    id: 'openai-codex-changelog',
    label: 'OpenAI Codex / GPT',
    url: 'https://platform.openai.com/docs/changelog',
  },
  {
    id: 'antigravity-changelog',
    label: 'Antigravity',
    url: 'https://antigravity.dev/changelog',
  },
];

const FETCH_TIMEOUT_MS = 10_000;
const CONTENT_PREVIEW_LIMIT = 2_000;

// ---------------------------------------------------------------------------
// Snapshot: map of source id → content hash (simple string fingerprint)
// ---------------------------------------------------------------------------

type Snapshot = Record<string, string>;

async function loadSnapshot(snapshotPath: string): Promise<Snapshot> {
  try {
    const raw = await fs.readFile(snapshotPath, 'utf-8');
    return JSON.parse(raw) as Snapshot;
  } catch {
    return {};
  }
}

async function saveSnapshot(snapshot: Snapshot, stateDir: string, snapshotPath: string): Promise<void> {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simpleFingerprint(text: string): string {
  // Fast deterministic fingerprint: length + first/last 64 chars
  const trimmed = text.trim();
  const prefix = trimmed.slice(0, 64);
  const suffix = trimmed.slice(-64);
  return `${trimmed.length}:${prefix}:${suffix}`;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Catalog file writer — appends a new dated section
// ---------------------------------------------------------------------------

async function appendToCatalog(entries: ChangelogEntry[], date: string, catalogPath: string): Promise<void> {
  await fs.mkdir(dirname(catalogPath), { recursive: true });

  const separator = '\n\n---\n\n';
  const section =
    `## ${date} 자가학습 발견\n\n` +
    entries
      .map(
        (e) =>
          `### ${e.label ?? e.source} (${e.fetched_at})\n\n` +
          '```\n' +
          e.content_preview +
          '\n```',
      )
      .join('\n\n');

  // Create file with header if it doesn't exist yet
  let existing = '';
  try {
    existing = await fs.readFile(catalogPath, 'utf-8');
  } catch {
    existing = '# CTO Tool Catalog\n\nAI/개발 도구 changelog 자가학습 누적 기록.\n';
  }

  await fs.writeFile(catalogPath, existing + separator + section, 'utf-8');
}

// ---------------------------------------------------------------------------
// Core task
// ---------------------------------------------------------------------------

export async function runSelfLearning(
  telegram?: TelegramClient,
  opts?: SelfLearningOptions,
): Promise<SelfLearningResult> {
  const paths = resolvePaths(opts);
  const runAt = new Date().toISOString();
  const date = runAt.slice(0, 10);
  const errors: string[] = [];

  const snapshot = await loadSnapshot(paths.snapshotPath);
  const newEntries: ChangelogEntry[] = [];

  // 1. Fetch each source (best-effort)
  for (const source of CHANGELOG_SOURCES) {
    let text = '';
    try {
      text = await fetchWithTimeout(source.url, FETCH_TIMEOUT_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[${source.id}] fetch failed: ${msg}`);
      continue;
    }

    const fingerprint = simpleFingerprint(text);
    if (snapshot[source.id] === fingerprint) {
      // No change — stay silent for this source
      continue;
    }

    // Content changed (or first run)
    snapshot[source.id] = fingerprint;
    newEntries.push({
      source: source.id,
      label: source.label,
      fetched_at: new Date().toISOString(),
      content_preview: text.trim().slice(0, CONTENT_PREVIEW_LIMIT),
    });
  }

  // 2. Persist updated snapshot regardless of errors
  try {
    await saveSnapshot(snapshot, paths.stateDir, paths.snapshotPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`snapshot save failed: ${msg}`);
  }

  const sourcesChecked = CHANGELOG_SOURCES.length;
  const sourcesChanged = newEntries.length;

  // 3. If nothing changed, stop here (silent run)
  if (newEntries.length === 0) {
    console.log(`[self-learning] ${date}: no changes detected across ${sourcesChecked} sources.`);
    return {
      run_at: runAt,
      sources_checked: sourcesChecked,
      sources_changed: 0,
      catalog_updated: false,
      notification_sent: false,
      errors,
    };
  }

  // 4. Append to cto-tool-catalog.md
  let catalogUpdated = false;
  try {
    await appendToCatalog(newEntries, date, paths.catalogPath);
    catalogUpdated = true;
    console.log(`[self-learning] ${date}: appended ${newEntries.length} source(s) to catalog.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`catalog write failed: ${msg}`);
    console.error('[self-learning] catalog write failed:', msg);
  }

  // 5. Write "오늘의 발견" discovery record for UI
  const discovery: DiscoveryRecord = {
    date,
    generated_at: runAt,
    new_entries: newEntries,
    sources_checked: sourcesChecked,
    sources_changed: sourcesChanged,
  };
  try {
    await fs.mkdir(paths.stateDir, { recursive: true });
    await fs.writeFile(paths.discoveryPath, JSON.stringify(discovery, null, 2), 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`discovery record write failed: ${msg}`);
  }

  // 6. Telegram alert (D1 — internal observation only)
  let notificationSent = false;
  const tg = telegram ?? createTelegramClient();
  const body =
    `변경된 소스: ${newEntries.map((e) => e.source).join(', ')}\n` +
    `총 ${sourcesChecked}개 소스 중 ${sourcesChanged}개 변경 감지.`;
  const result = await tg.send({
    title: `Self-Learning: ${date} 변경 감지 (${sourcesChanged}개)`,
    body,
    level: 'info',
    dedupKey: `self-learning:${date}`,
  });
  notificationSent = result.ok;
  if (!result.ok) {
    errors.push(`telegram: ${result.reason}`);
  }

  return {
    run_at: runAt,
    sources_checked: sourcesChecked,
    sources_changed: sourcesChanged,
    catalog_updated: catalogUpdated,
    notification_sent: notificationSent,
    errors,
  };
}
