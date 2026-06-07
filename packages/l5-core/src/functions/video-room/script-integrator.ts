// script-integrator.ts — PRD §5.3 Script Integrator.
// Merges Intro30s + ScriptPart[] into a single IntegratedScript.
// Pure TypeScript, no NocoBase dependency, no Date/randomUUID.

import { Intro30s, ScriptPart, IntegratedScript, CmoVideoStrategyBrief } from './types';

export interface ScriptIntegratorInput {
  intro: Intro30s;
  parts: ScriptPart[];
  brief: CmoVideoStrategyBrief;
}

/**
 * Integrates a set of script parts (each tied to a logic block) with the intro
 * into a single cohesive full_script.
 *
 * Rules:
 * - parts are ordered by their position in brief.logic_blocks (block_id order).
 * - Repeated phrases across parts are detected and removed; removals are recorded.
 * - Transitions between consecutive blocks are added from each part's transition_out.
 * - section_map maps each block_id to its position range label in the full script.
 * - strategy_alignment_notes records how each block maps to the brief's logic_blocks.
 * - Throws if parts is empty.
 */
export function integrateScript(input: ScriptIntegratorInput): IntegratedScript {
  const { intro, parts, brief } = input;

  if (parts.length === 0) {
    throw new Error('integrateScript: parts must not be empty');
  }

  // Sort parts by the order they appear in brief.logic_blocks.
  const blockOrder = brief.logic_blocks.map((b) => b.block_id);
  const sorted = [...parts].sort((a, b) => {
    const ai = blockOrder.indexOf(a.block_id);
    const bi = blockOrder.indexOf(b.block_id);
    // Unknown block_ids go to the end.
    return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
  });

  // Collect all draft sentences split by sentence boundary for repetition detection.
  // We work at the sentence level (split on '.' / '。' / '\n').
  const seen = new Set<string>();
  const removed_repetition: string[] = [];

  function dedup(text: string): string {
    const sentences = text.split(/(?<=[.。\n])\s*/);
    const kept: string[] = [];
    for (const s of sentences) {
      const trimmed = s.trim();
      if (!trimmed) continue;
      const key = trimmed.replace(/\s+/g, ' ').toLowerCase();
      if (seen.has(key)) {
        removed_repetition.push(trimmed);
      } else {
        seen.add(key);
        kept.push(trimmed);
      }
    }
    return kept.join(' ');
  }

  // Build section map and body segments.
  const section_map: string[] = [];
  const added_transitions: string[] = [];
  const strategy_alignment_notes: string[] = [];
  const body_segments: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const part = sorted[i];
    const blockDef = brief.logic_blocks.find((b) => b.block_id === part.block_id);

    // section_map entry: "block_id: role"
    const role = blockDef?.role ?? 'unknown';
    section_map.push(`${part.block_id}: ${role}`);

    // strategy_alignment_notes
    if (blockDef) {
      strategy_alignment_notes.push(
        `${part.block_id} — main_claim: ${blockDef.main_claim}`,
      );
    } else {
      strategy_alignment_notes.push(
        `${part.block_id} — no matching logic_block in brief`,
      );
    }

    // Deduplicate and collect draft text.
    const deduped = dedup(part.draft);
    body_segments.push(deduped);

    // Add transition after each block except the last.
    if (i < sorted.length - 1 && part.transition_out.trim()) {
      added_transitions.push(part.transition_out.trim());
      body_segments.push(part.transition_out.trim());
    }
  }

  const intro_text = intro.script.trim();
  const full_script = [intro_text, ...body_segments].filter(Boolean).join('\n\n');

  return {
    full_script,
    section_map,
    removed_repetition,
    added_transitions,
    strategy_alignment_notes,
  };
}
