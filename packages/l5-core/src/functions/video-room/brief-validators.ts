// brief-validators.ts — VideoExecutionBrief validation (CMO → AI Slide Factory)
// Pure TypeScript, no NocoBase dependency.
// Implements rules from CMO_TO_FACTORY_CONTRACT.md §9.

const FORBIDDEN_FIELDS = [
  'scene_type',
  'best_medium',
  'bestMedium',
  'duration',
  'timeline',
  'timeline_json',
  'scenes',
  'message_unit_id',
] as const;

export interface BriefValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function checkForbiddenFields(
  obj: Record<string, unknown>,
  context: string,
  errors: string[],
): void {
  for (const field of FORBIDDEN_FIELDS) {
    const v = obj[field];
    if (v !== undefined && v !== null) {
      errors.push(`forbidden field present in ${context}: ${field}`);
    }
  }
}

export function validateVideoExecutionBrief(brief: unknown): BriefValidationResult {
  const errors: string[] = [];

  if (!isRecord(brief)) {
    return { valid: false, errors: ['brief must be a non-null object'] };
  }

  // Rule 1: schema_version
  if (brief['schema_version'] !== 'cmo_to_factory_v2') {
    errors.push("schema_version must be 'cmo_to_factory_v2'");
  }

  // Rule 2: top-level required scalar fields
  if (!getString(brief, 'content_card_id')) {
    errors.push('missing required field: content_card_id');
  }

  const contentType = brief['content_type'];
  if (contentType !== 'key' && contentType !== 'pulling') {
    errors.push("content_type must be 'key' or 'pulling'");
  }

  if (!getString(brief, 'title')) {
    errors.push('missing required field: title');
  }

  // Rule 2: target_viewer nested fields
  const tv = brief['target_viewer'];
  if (!isRecord(tv)) {
    errors.push('missing required field: target_viewer');
  } else {
    if (!getString(tv, 'who')) errors.push('missing required field: target_viewer.who');
    if (!getString(tv, 'knowledge_level')) errors.push('missing required field: target_viewer.knowledge_level');
    if (!getString(tv, 'pain')) errors.push('missing required field: target_viewer.pain');
    if (!getString(tv, 'desired_reaction')) errors.push('missing required field: target_viewer.desired_reaction');
  }

  // Rule 2: strategy nested fields
  const strategy = brief['strategy'];
  if (!isRecord(strategy)) {
    errors.push('missing required field: strategy');
  } else {
    if (!getString(strategy, 'core_message')) errors.push('missing required field: strategy.core_message');
    if (!getString(strategy, 'role_in_content_set')) errors.push('missing required field: strategy.role_in_content_set');

    const coveredStages = strategy['covered_stages'];
    if (!Array.isArray(coveredStages) || coveredStages.length === 0) {
      errors.push('strategy.covered_stages must be a non-empty array');
    } else {
      const validStages = new Set(['phenomenon', 'desire', 'plan', 'action', 'reward']);
      for (const stage of coveredStages) {
        if (!validStages.has(stage as string)) {
          errors.push(`invalid stage: ${stage}`);
        }
      }
    }
  }

  // Rule 2 + 3: script nested fields
  const script = brief['script'];
  if (!isRecord(script)) {
    errors.push('missing required field: script');
  } else {
    if (!getString(script, 'full_script')) errors.push('missing required field: script.full_script');
    if (!getString(script, 'intro_30s')) errors.push('missing required field: script.intro_30s');

    const logicBlocks = script['logic_blocks'];
    if (!Array.isArray(logicBlocks)) {
      errors.push('script.logic_blocks must be array');
    } else if (logicBlocks.length < 1) {
      errors.push('script.logic_blocks must have at least 1 block');
    } else {
      for (const block of logicBlocks) {
        if (!isRecord(block)) {
          errors.push('logic_block must be an object');
          continue;
        }
        const blockId = typeof block['block_id'] === 'string' ? block['block_id'] : '(unknown)';
        if (!getString(block, 'block_id')) errors.push('logic_block missing block_id');
        if (!getString(block, 'communication_goal')) {
          errors.push(`logic_block ${blockId} missing communication_goal`);
        }
        if (!getString(block, 'viewer_reaction_target')) {
          errors.push(`logic_block ${blockId} missing viewer_reaction_target`);
        }
        // Rule 4: forbidden fields in each logic block
        checkForbiddenFields(block, `logic_block ${blockId}`, errors);
      }
    }
  }

  // Rule 7: constraints
  const constraints = brief['constraints'];
  if (!isRecord(constraints)) {
    errors.push('missing required field: constraints');
  } else {
    if (!getString(constraints, 'tone')) errors.push('missing required field: constraints.tone');
    const fmt = constraints['format'];
    if (fmt !== 'youtube_16_9' && fmt !== 'shorts_9_16') {
      errors.push("format must be 'youtube_16_9' or 'shorts_9_16'");
    }
  }

  // Rule 4: forbidden fields at brief top level
  checkForbiddenFields(brief, 'brief', errors);

  return { valid: errors.length === 0, errors };
}
