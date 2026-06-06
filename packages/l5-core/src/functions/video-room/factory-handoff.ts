// factory-handoff.ts — CMO → AI Slide Factory handoff adapter.
//
// Responsibilities:
//   1. prepareFactoryHandoff: validate a VideoExecutionBrief and produce a
//      VideoExecutionBriefRecord ready for storage / sending.
//   2. sendToFactory: deliver the record to the Factory via an injected
//      FactoryTransport; updates handoff_status in-place on the returned record.
//
// Asset files: CMO does NOT send asset files. Only asset_requests (need/type/reason)
// are included in the brief. Actual files are uploaded directly by the user to the
// Factory's AssetManifest; the Factory falls back to slide generation when an asset
// is missing (CMO_TO_FACTORY_CONTRACT.md §10).
//
// id / created_at are injected by the caller — this module never calls Date or
// randomUUID (pure, deterministic, fully testable).

import type { VideoExecutionBrief } from './types';
import { validateVideoExecutionBrief } from './brief-validators';

// ── VideoExecutionBriefRecord (PRD §16.12) ────────────────────────────────────

export type BriefValidationStatus = 'valid' | 'invalid';
export type BriefHandoffStatus = 'not_sent' | 'sent' | 'failed' | 'rendered';

export interface VideoExecutionBriefRecord {
  /** Caller-supplied stable identifier (UUID). */
  id: string;
  /** The Content Card this brief was produced for. */
  content_card_id: string;
  /** Always 'cmo_to_factory_v2'. */
  schema_version: 'cmo_to_factory_v2';
  /** The validated brief payload. */
  brief: VideoExecutionBrief;
  /** Whether the brief passed validateVideoExecutionBrief. */
  validation_status: BriefValidationStatus;
  /** Delivery status; 'not_sent' until sendToFactory is called. */
  handoff_status: BriefHandoffStatus;
  /** ISO-8601 string injected by caller. */
  created_at: string;
}

// ── FactoryTransport ──────────────────────────────────────────────────────────

/**
 * Minimal transport interface for delivering a brief to the AI Slide Factory.
 * The real implementation lives outside l5-core (plugin or service layer).
 *
 * Sending to the Factory is an outbound action (risk D3) and requires an
 * approval gate before this transport is invoked in production
 * (L5 Founder approval model: plan approved once; outbound actions gated).
 */
export interface FactoryTransport {
  send(brief: VideoExecutionBrief): Promise<{ ok: boolean }>;
}

// ── prepareFactoryHandoff ─────────────────────────────────────────────────────

export interface PrepareHandoffIds {
  /** Stable record id supplied by caller (never generated here). */
  id: string;
  /** ISO-8601 creation timestamp supplied by caller. */
  created_at: string;
}

/**
 * Validate `brief` and return a VideoExecutionBriefRecord.
 *
 * - If validation passes: validation_status='valid', handoff_status='not_sent'.
 * - If validation fails: validation_status='invalid', handoff_status='not_sent'.
 *   An invalid record must NOT be sent to the Factory.
 *
 * id and created_at must be injected via `ids` — this function is pure and
 * never calls Date or randomUUID.
 */
export function prepareFactoryHandoff(
  brief: VideoExecutionBrief,
  ids: PrepareHandoffIds,
): VideoExecutionBriefRecord {
  const result = validateVideoExecutionBrief(brief);

  return {
    id: ids.id,
    content_card_id: brief.content_card_id,
    schema_version: brief.schema_version,
    brief,
    validation_status: result.valid ? 'valid' : 'invalid',
    handoff_status: 'not_sent',
    created_at: ids.created_at,
  };
}

// ── sendToFactory ─────────────────────────────────────────────────────────────

/**
 * Deliver `record.brief` to the Factory via the injected `transport`.
 *
 * Returns a new record (does not mutate the input) with handoff_status updated:
 *   - 'sent'   on transport.send({ ok: true })
 *   - 'failed' on transport.send({ ok: false }) or thrown error
 *
 * Throws immediately (without calling transport) if record.validation_status
 * is 'invalid' — an invalid brief must never reach the Factory.
 *
 * Outbound delivery is an approval-gated action (CMO_TO_FACTORY_CONTRACT.md §0,
 * L5 Founder approval model). The caller is responsible for obtaining approval
 * before invoking this function.
 */
export async function sendToFactory(
  record: VideoExecutionBriefRecord,
  transport: FactoryTransport,
): Promise<VideoExecutionBriefRecord> {
  if (record.validation_status === 'invalid') {
    throw new Error(
      `sendToFactory: refusing to send invalid brief (record id=${record.id}, content_card_id=${record.content_card_id})`,
    );
  }

  let handoff_status: BriefHandoffStatus;
  try {
    const response = await transport.send(record.brief);
    handoff_status = response.ok ? 'sent' : 'failed';
  } catch {
    handoff_status = 'failed';
  }

  return { ...record, handoff_status };
}
