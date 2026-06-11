/**
 * @deprecated PRD v3는 pulling-content-planning.ts 사용.
 * 이 파일은 구 video-room 상태머신 호환용 (createPullingContentPlan/createPullingContentSet 등).
 */
// CMO Video Room — Pulling Content Set builder (PRD §7.6, §12.5).
//
// Pure functions only. No Date.now(), new Date(), or randomUUID() inside.
// All id values must be injected by the caller.

import type {
  PullingContentPlan,
  PullingContentSet,
  KeyContentSet,
  ConsumerStage,
  ApprovalStatus,
} from './types';

// ── Helpers ────────────────────────────────────────────────────────────────

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must not be empty`);
  }
  return value.trim();
}

// ── PullingContentPlan ─────────────────────────────────────────────────────

export interface CreatePullingContentPlanInput {
  id: string;
  order: 1 | 2 | 3 | 4 | 5;
  role: PullingContentPlan['role'];
  consumer_stage: ConsumerStage;
  title: string;
  purpose: string;
  bridge_to_key: string;
}

/**
 * Creates a single PullingContentPlan.
 * PRD rule: 브릿지 없는 풀링 콘텐츠 승인 금지 — throws if bridge_to_key is empty.
 */
export function createPullingContentPlan(input: CreatePullingContentPlanInput): PullingContentPlan {
  requireNonEmpty(input.id, 'id');
  requireNonEmpty(input.title, 'title');
  requireNonEmpty(input.purpose, 'purpose');

  const bridge = requireNonEmpty(input.bridge_to_key, 'bridge_to_key');

  return {
    id: input.id.trim(),
    order: input.order,
    role: input.role,
    consumer_stage: input.consumer_stage,
    title: input.title.trim(),
    purpose: input.purpose.trim(),
    bridge_to_key: bridge,
  };
}

// ── PullingContentSet ──────────────────────────────────────────────────────

export interface CreatePullingContentSetInput {
  id: string;
  key_content_id: string;
  pulling_contents: PullingContentPlan[];
  set_logic: string;
  funnel_coverage: {
    phenomenon: string[];
    desire: string[];
    plan: string[];
    action_bridge: string;
  };
}

/**
 * Creates a PullingContentSet.
 * PRD §7.6: pulling_contents must be exactly 5, with orders 1–5 each appearing exactly once.
 * Each plan's bridge_to_key must be non-empty (enforced by createPullingContentPlan; double-checked here).
 */
export function createPullingContentSet(input: CreatePullingContentSetInput): PullingContentSet {
  requireNonEmpty(input.id, 'id');
  requireNonEmpty(input.key_content_id, 'key_content_id');
  requireNonEmpty(input.set_logic, 'set_logic');

  const contents = input.pulling_contents;

  if (contents.length !== 5) {
    throw new Error(
      `pulling_contents must contain exactly 5 items (PRD §7.6 "풀링 콘텐츠 5개"); got ${contents.length}`,
    );
  }

  const orders = contents.map((p) => p.order).sort((a, b) => a - b);
  const expectedOrders = [1, 2, 3, 4, 5];
  const ordersValid = expectedOrders.every((o, i) => orders[i] === o);
  if (!ordersValid) {
    throw new Error(
      `pulling_contents orders must be exactly 1, 2, 3, 4, 5 (each once); got [${orders.join(', ')}]`,
    );
  }

  for (const plan of contents) {
    if (typeof plan.bridge_to_key !== 'string' || plan.bridge_to_key.trim() === '') {
      throw new Error(
        `pulling content order=${plan.order} has empty bridge_to_key (PRD: 브릿지 없는 풀링 콘텐츠 승인 금지)`,
      );
    }
  }

  return {
    id: input.id.trim(),
    key_content_id: input.key_content_id.trim(),
    pulling_contents: contents,
    set_logic: input.set_logic.trim(),
    funnel_coverage: input.funnel_coverage,
    approval_status: 'draft',
  };
}

export function approvePullingContentSet(set: PullingContentSet): PullingContentSet {
  return { ...set, approval_status: 'approved' };
}

export function requestPullingRevision(set: PullingContentSet): PullingContentSet {
  return { ...set, approval_status: 'needs_revision' };
}

// ── KeyContentSet ──────────────────────────────────────────────────────────

export interface BuildKeyContentSetInput {
  id: string;
  video_project_id: string;
  product: string;
  target_audience: string;
  selected_key_content_id: string;
  pulling_content_ids: string[];
  funnel_logic: string;
}

/**
 * Bundles one selected key content and exactly 5 pulling content ids into a KeyContentSet.
 */
export function buildKeyContentSet(input: BuildKeyContentSetInput): KeyContentSet {
  requireNonEmpty(input.id, 'id');
  requireNonEmpty(input.video_project_id, 'video_project_id');
  requireNonEmpty(input.product, 'product');
  requireNonEmpty(input.target_audience, 'target_audience');
  requireNonEmpty(input.selected_key_content_id, 'selected_key_content_id');
  requireNonEmpty(input.funnel_logic, 'funnel_logic');

  if (input.pulling_content_ids.length !== 5) {
    throw new Error(
      `pulling_content_ids must contain exactly 5 ids; got ${input.pulling_content_ids.length}`,
    );
  }

  return {
    id: input.id.trim(),
    video_project_id: input.video_project_id.trim(),
    product: input.product.trim(),
    target_audience: input.target_audience.trim(),
    selected_key_content_id: input.selected_key_content_id.trim(),
    pulling_content_ids: input.pulling_content_ids,
    funnel_logic: input.funnel_logic.trim(),
    approval_status: 'draft',
  };
}
