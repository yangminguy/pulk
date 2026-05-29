/**
 * Phase: CTO Model Tier Routing
 *
 * Pure routing logic that maps (TaskClass × DevPhaseKind) to an LLM model tier,
 * then resolves the concrete model — skipping any tier whose quota is exhausted
 * and falling back along a per-class priority order.
 *
 * Scope (pulk / l5-core only): pure decision functions. This module performs NO
 * filesystem or network IO. The ACR repo is responsible for capturing response
 * headers and writing quota-tracker.json; the caller reads that file and passes
 * the parsed object into `resolveModel` as `quotaState`. When no quota state is
 * supplied, all tiers are assumed available.
 *
 * No API keys or secrets live here — only public model identifiers (aliases the
 * runtime already uses elsewhere, e.g. claude-cli-client / anthropic-client).
 */

import type { TaskClass, DevPhaseKind } from './dev-workflow-spec';

/** Capability tiers. T1 = top reasoning, T2 = balanced, T3 = light/low-cost. */
export type ModelTier = 'T1' | 'T2' | 'T3';

export interface ModelRosterEntry {
  tier: ModelTier;
  /**
   * Public model identifier (alias) the runtime resolves to a concrete API
   * model. NEVER an API key. Mirrors identifiers already used in the codebase.
   */
  model: string;
  /** Human-readable label for operator surfaces. */
  label: string;
}

/**
 * Tier → model roster. Data, not logic, so the concrete model behind each tier
 * can be swapped without touching routing rules. Identifiers are public model
 * aliases only.
 */
export const MODEL_ROSTER: Record<ModelTier, ModelRosterEntry> = {
  T1: { tier: 'T1', model: 'claude-opus-4-7', label: 'Top reasoning (Opus class)' },
  T2: { tier: 'T2', model: 'gpt-4o', label: 'Balanced (GPT-4o class)' },
  T3: { tier: 'T3', model: 'claude-haiku-4-5', label: 'Light/low-cost (Haiku class)' },
};

/**
 * Default tier when a (taskClass, phaseKind) pair is not explicitly mapped.
 * Balanced is the safe middle ground.
 */
const DEFAULT_TIER: ModelTier = 'T2';

/**
 * Per-phase-kind tier defaults, applied when a TaskClass does not override the
 * phase. Reasoning-heavy / design phases lean T1; mutating implementation leans
 * T2; cheap mechanical phases (commit) lean T3.
 */
const PHASE_TIER_DEFAULTS: Record<DevPhaseKind, ModelTier> = {
  rfc: 'T1',
  research: 'T1',
  spec: 'T1',
  review: 'T1',
  test: 'T2',
  implement: 'T2',
  fix: 'T2',
  refactor: 'T2',
  repro: 'T2',
  backup: 'T2',
  smoke: 'T3',
  regress: 'T3',
  commit: 'T3',
};

/**
 * TaskClass-specific overrides. Higher-stakes classes (BIG_CHANGE) escalate
 * design/spec phases to T1; trivial classes (SMALL_FIX) downshift mechanical
 * phases to T3. Only deviations from PHASE_TIER_DEFAULTS are listed.
 */
const CLASS_PHASE_OVERRIDES: Partial<
  Record<TaskClass, Partial<Record<DevPhaseKind, ModelTier>>>
> = {
  SMALL_FIX: {
    // A small fix needs no top-tier reasoning; keep it cheap.
    fix: 'T3',
    repro: 'T3',
  },
  BIG_CHANGE: {
    // High-blast-radius work: spend on design and implementation quality.
    implement: 'T1',
    test: 'T1',
  },
  OPS: {
    // Ops work is mechanical but risky; keep implement balanced, design light.
    backup: 'T3',
  },
};

/**
 * Select the model tier for a (taskClass, phaseKind) pair. Pure lookup:
 * class override → phase default → DEFAULT_TIER.
 */
export function selectModelTier(
  taskClass: TaskClass,
  phaseKind: DevPhaseKind,
): ModelTier {
  const override = CLASS_PHASE_OVERRIDES[taskClass]?.[phaseKind];
  if (override) return override;
  return PHASE_TIER_DEFAULTS[phaseKind] ?? DEFAULT_TIER;
}

/**
 * Per-class fallback order over tiers. When the selected tier is exhausted,
 * resolution walks this order starting from the selected tier's position and
 * picks the first available tier. Cost-sensitive classes prefer to degrade
 * downward (cheaper); quality-sensitive classes also degrade downward but the
 * order keeps T1 reachable as a last resort where it makes sense.
 */
const CLASS_FALLBACK_ORDER: Record<ModelTier, ModelTier[]> = {
  // From T1, degrade to T2 then T3.
  T1: ['T1', 'T2', 'T3'],
  // From T2, prefer cheaper T3 next, then escalate to T1 if T3 also gone.
  T2: ['T2', 'T3', 'T1'],
  // From T3, escalate to T2 then T1 (we never want to drop below "light").
  T3: ['T3', 'T2', 'T1'],
};

/**
 * Quota state for a single tier. `available=false` means the tier's quota is
 * exhausted and must be skipped during resolution.
 */
export interface TierQuota {
  available: boolean;
  /** Optional metadata the ACR daemon may write; ignored by routing. */
  resetAt?: string;
  remaining?: number;
}

/**
 * Parsed shape of quota-tracker.json. Partial: a missing tier is treated as
 * available. The whole object being undefined means "all tiers available".
 */
export interface QuotaState {
  tiers?: Partial<Record<ModelTier, TierQuota>>;
}

function isTierAvailable(quotaState: QuotaState | undefined, tier: ModelTier): boolean {
  const entry = quotaState?.tiers?.[tier];
  // Absent entry => assume available (safe default when no quota info exists).
  if (!entry) return true;
  return entry.available !== false;
}

export interface ResolvedModel {
  /** Concrete public model identifier to call. */
  model: string;
  /** Tier actually resolved (may differ from selected when a fallback fired). */
  tier: ModelTier;
  /** The tier originally selected by the matrix, before any fallback. */
  selectedTier: ModelTier;
  /** True when the selected tier was exhausted and a fallback tier was used. */
  fellBack: boolean;
}

/**
 * Resolve the concrete model for a (taskClass, phaseKind), honoring quota.
 *
 * 1. Select the tier from the matrix.
 * 2. Walk the per-tier fallback order; pick the first available tier.
 * 3. If every tier is exhausted, return the originally selected tier anyway
 *    (the caller decides whether to hard-fail; routing never returns nothing).
 *
 * Pure: quotaState is injected. Pass `undefined` to assume all tiers available.
 */
export function resolveModel(
  taskClass: TaskClass,
  phaseKind: DevPhaseKind,
  quotaState?: QuotaState,
): ResolvedModel {
  const selectedTier = selectModelTier(taskClass, phaseKind);
  const order = CLASS_FALLBACK_ORDER[selectedTier];

  for (const tier of order) {
    if (isTierAvailable(quotaState, tier)) {
      return {
        model: MODEL_ROSTER[tier].model,
        tier,
        selectedTier,
        fellBack: tier !== selectedTier,
      };
    }
  }

  // All tiers exhausted — return the selected tier so the caller still has a
  // concrete target. fellBack stays false because no usable fallback existed.
  return {
    model: MODEL_ROSTER[selectedTier].model,
    tier: selectedTier,
    selectedTier,
    fellBack: false,
  };
}
