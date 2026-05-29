// model-verify — Wave 2 slice 2.4
// Runs at 08:55 via launchd. Risk level: D1 (read-only observation + internal alert).
//
// Responsibilities:
//   1. Ping known model endpoints/changelog URLs to detect deprecation notices.
//   2. Diff against the MODEL_ROSTER from l5-core (single source of truth).
//   3. Log suggested re-mappings for any deprecated model identifier found.
//   4. Send Telegram alert only when at least one deprecation is detected.
//   5. Never throws — all network calls are guarded. Safe in offline environments.

// MODEL_ROSTER is the single source of truth (packages/l5-core, slice 2.3).
import { MODEL_ROSTER } from '@l5/core';
import { createTelegramClient } from '../notifier/telegram.js';
import type { TelegramClient } from '../notifier/telegram.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModelCheckResult {
  checked_at: string;
  roster_entries: number;
  deprecated_detected: string[];
  remapping_suggestions: RemappingSuggestion[];
  notification_sent: boolean;
  errors: string[];
}

export interface RemappingSuggestion {
  deprecated_model: string;
  suggested_replacement: string;
  tier: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Deprecation hints
//
// These are static heuristics only — no external network is required to
// produce a basic diff. When the changelog fetch succeeds, additional
// deprecated identifiers are merged in. Maintaining this list locally keeps
// the task safe in fully offline environments.
// ---------------------------------------------------------------------------

const KNOWN_DEPRECATED_PATTERNS: RegExp[] = [
  /gpt-4-turbo(?!-preview)/,
  /gpt-3\.5/,
  /claude-2\./,
  /claude-instant/,
];

// Suggested replacements by tier from MODEL_ROSTER
const TIER_REPLACEMENT_MAP: Record<string, string> = {
  T1: MODEL_ROSTER.T1.model,
  T2: MODEL_ROSTER.T2.model,
  T3: MODEL_ROSTER.T3.model,
};

// ---------------------------------------------------------------------------
// Changelog sources to ping (best-effort, may be blocked/unavailable)
// ---------------------------------------------------------------------------

interface ChangelogSource {
  name: string;
  url: string;
  deprecationMarkers: string[];
}

const CHANGELOG_SOURCES: ChangelogSource[] = [
  {
    name: 'anthropic-models',
    url: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
    deprecationMarkers: ['deprecated', 'legacy', 'end-of-life', 'no longer available'],
  },
  {
    name: 'openai-models',
    url: 'https://platform.openai.com/docs/deprecations',
    deprecationMarkers: ['deprecated', 'shutdown', 'legacy'],
  },
];

const FETCH_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function extractDeprecatedModelsFromText(text: string, markers: string[]): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();

  // Look for known model identifiers mentioned near deprecation markers
  const rosterModels = Object.values(MODEL_ROSTER).map((e) => e.model);
  for (const model of rosterModels) {
    const idx = lower.indexOf(model.toLowerCase());
    if (idx === -1) continue;
    const window = lower.slice(Math.max(0, idx - 200), idx + 200);
    if (markers.some((m) => window.includes(m))) {
      found.push(model);
    }
  }
  return found;
}

function buildRemappingSuggestion(deprecated: string): RemappingSuggestion {
  // Find which tier this model belongs to in the roster
  const tierEntry = Object.entries(MODEL_ROSTER).find(([, v]) => v.model === deprecated);
  const tier = tierEntry?.[0] ?? 'T2';
  const suggested = TIER_REPLACEMENT_MAP[tier] ?? MODEL_ROSTER.T2.model;

  return {
    deprecated_model: deprecated,
    suggested_replacement: suggested,
    tier,
    reason: 'Detected deprecation marker in changelog or known-deprecated pattern list',
  };
}

// ---------------------------------------------------------------------------
// Core task
// ---------------------------------------------------------------------------

export async function runModelVerify(
  telegram?: TelegramClient,
): Promise<ModelCheckResult> {
  const checkedAt = new Date().toISOString();
  const errors: string[] = [];
  const deprecatedDetected: string[] = [];

  const rosterModels = Object.values(MODEL_ROSTER).map((e) => e.model);

  // 1. Check against static known-deprecated patterns
  for (const model of rosterModels) {
    if (KNOWN_DEPRECATED_PATTERNS.some((rx) => rx.test(model))) {
      if (!deprecatedDetected.includes(model)) {
        deprecatedDetected.push(model);
      }
    }
  }

  // 2. Best-effort changelog fetch — failures are non-fatal
  for (const source of CHANGELOG_SOURCES) {
    try {
      const text = await fetchWithTimeout(source.url, FETCH_TIMEOUT_MS);
      const found = extractDeprecatedModelsFromText(text, source.deprecationMarkers);
      for (const m of found) {
        if (!deprecatedDetected.includes(m)) {
          deprecatedDetected.push(m);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Network errors are expected in offline/CI environments — record but continue
      errors.push(`[${source.name}] fetch failed: ${msg}`);
    }
  }

  // 3. Build remapping suggestions
  const remappingSuggestions: RemappingSuggestion[] = deprecatedDetected.map(buildRemappingSuggestion);

  // 4. Log always; notify only if deprecations found
  if (deprecatedDetected.length > 0) {
    console.warn('[model-verify] Deprecated models detected:', deprecatedDetected);
    console.warn('[model-verify] Remapping suggestions:', JSON.stringify(remappingSuggestions, null, 2));
  } else {
    console.log('[model-verify] No deprecated models detected. Roster is clean.');
  }

  if (errors.length > 0) {
    console.warn('[model-verify] Non-fatal fetch errors:', errors);
  }

  // 5. Telegram alert — only when deprecations are detected (D1: internal alert)
  let notificationSent = false;
  if (deprecatedDetected.length > 0) {
    const tg = telegram ?? createTelegramClient();
    const body =
      `Deprecated: ${deprecatedDetected.join(', ')}\n\n` +
      remappingSuggestions
        .map((s) => `• ${s.deprecated_model} → ${s.suggested_replacement} (${s.tier})`)
        .join('\n');
    const result = await tg.send({
      title: 'Model Verify: Deprecated Models Detected',
      body,
      level: 'warn',
      dedupKey: `model-verify:${checkedAt.slice(0, 10)}`,
    });
    notificationSent = result.ok;
    if (!result.ok) {
      errors.push(`telegram: ${result.reason}`);
    }
  }

  return {
    checked_at: checkedAt,
    roster_entries: rosterModels.length,
    deprecated_detected: deprecatedDetected,
    remapping_suggestions: remappingSuggestions,
    notification_sent: notificationSent,
    errors,
  };
}
