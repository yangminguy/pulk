/**
 * @deprecated v3.1에서 폐기 — scene_type 확정 경로. video-execution-brief.ts(VideoExecutionBrief) 사용. Factory가 scene_type을 결정함.
 */
// CMO Video Room — ScriptBeat → AI Slide Factory VideoJob mapping.
//
// Converts a confirmed script beat list (확정 원고 장면 beat) into a plain-object
// VideoJob that is structurally compatible with the factory's VideoJobSchema /
// SceneSchema (ai-slide-video-factory/src/lib/schema.ts).
//
// All 18 factory scene types are accepted (incl. chart_reveal / kinetic_typo,
// Phase 3 additions). Each type is mapped using fields
// provided on the beat; when a required sub-structure field is absent a sane
// minimum default is derived from headline / speaker_text so the output always
// passes factory Zod validation. Types whose required structure cannot be
// minimally synthesised (screenshot without imagePath, orbital/spotlight without
// items, agenda without items) fall back to an insight scene.
//
// Throws only for:
//   - empty beats array
//   - beat with empty headline
//   - beat with empty speaker_text
//   - beat duration outside [3, 20] seconds

// ── Constants (mirrored from factory schema.ts) ────────────────────────────────

export const FACTORY_MIN_SCENE_SECONDS = 3;
export const FACTORY_MAX_SCENE_SECONDS = 20;

export const FACTORY_SCENE_TYPES = [
  'hero',
  'problem',
  'reframe',
  'metric_cards',
  'comparison',
  'flow',
  'screenshot',
  'quote',
  'insight',
  'cta',
  'agenda',
  'section',
  'split',
  'steps',
  'spotlight',
  'orbital',
  'chart_reveal',
  'kinetic_typo',
] as const;

export type FactorySceneType = (typeof FACTORY_SCENE_TYPES)[number];

export const FACTORY_FORMATS = ['youtube_16_9', 'shorts_9_16'] as const;
export type FactoryFormat = (typeof FACTORY_FORMATS)[number];

export const FACTORY_THEMES = [
  'default_deck',
  'dark_pitch_deck',
  'bright_minimal',
  'warm_ivory_deck',
] as const;
export type FactoryTheme = (typeof FACTORY_THEMES)[number];

// ── ScriptBeat ─────────────────────────────────────────────────────────────────

/** One confirmed script beat (장면 beat) from the script-approval stage. */
export interface ScriptBeat {
  scene_id: string;
  /** Factory scene type. Unknown values fall back to insight. */
  scene_type: string;
  rhythm_role?: 'hook' | 'tension' | 'explain' | 'proof' | 'reset' | 'insight' | 'cta';
  /** Highlighted keywords/phrases (quoted spans, numbers+units, key nouns). Factory renders these emphasised. */
  emphasis?: string[];
  /** Per-scene visual register. Matches factory zod (light | dark | clean). */
  mood?: 'light' | 'dark' | 'clean';
  /** Enter transition. Matches factory zod (cut | fade | fade_scale | slide_up). */
  transition?: 'cut' | 'fade' | 'fade_scale' | 'slide_up';
  headline: string;
  /** Narration / dialogue. Used as the primary sub-field where no richer field is supplied. */
  speaker_text: string;
  /** Seconds. Must be in [FACTORY_MIN_SCENE_SECONDS, FACTORY_MAX_SCENE_SECONDS]. */
  duration: number;

  // ── optional type-specific fields ──────────────────────────────────────────
  subtitle?: string;
  body?: string;
  quote?: string;
  attribution?: string;
  action?: string;
  url?: string;
  from?: string;
  to?: string;
  imagePath?: string;
  annotation?: string;
  /** problem bullets (min 1, max 5) */
  bullets?: string[];
  /** flow steps {label, description?} or steps-scene {label, hint?} */
  steps?: Array<{ label: string; description?: string; hint?: string }>;
  /** metric_cards cards */
  cards?: Array<{ value: string; label: string; delta?: string }>;
  left?: { title: string; points: string[] };
  right?: { title: string; points: string[] };
  /** agenda / orbital items */
  items?: Array<{ label: string; hint?: string; icon?: string }>;
  /** split cards (value optional) */
  splitCards?: Array<{ label: string; value?: string; hint?: string; accent?: boolean }>;
  /** section / agenda title override */
  title?: string;
  /** section number string */
  number?: string;
  meta?: string[];
  /** spotlight icon (camera|film|hashtag|flow|spark|clock|link|target|heart|chat|search|check) */
  icon?: string;
  /** orbital center node */
  center?: { label: string; hint?: string };
  label?: string;
  /** chart_reveal items (label + numeric value, min 2 after mapping) */
  chartItems?: Array<{ label: string; value: number; unit?: string }>;
  /** chart_reveal chart kind */
  chart_kind?: 'bar' | 'line';
  /** kinetic_typo emphasised lines */
  lines?: string[];
}

// ── FactoryScene union (all 16 types) ─────────────────────────────────────────

interface BaseScene {
  scene_id: string;
  duration: number;
  rhythm_role?: ScriptBeat['rhythm_role'];
  emphasis?: string[];
  mood?: 'light' | 'dark' | 'clean';
  transition?: 'cut' | 'fade' | 'fade_scale' | 'slide_up';
  caption?: string;
}

export interface FactoryHeroScene extends BaseScene {
  type: 'hero';
  headline: string;
  subtitle?: string;
  meta?: string[];
}
export interface FactoryProblemScene extends BaseScene {
  type: 'problem';
  headline: string;
  bullets: string[];
}
export interface FactoryReframeScene extends BaseScene {
  type: 'reframe';
  headline: string;
  from: string;
  to: string;
}
export interface FactoryMetricCardsScene extends BaseScene {
  type: 'metric_cards';
  headline: string;
  cards: Array<{ value: string; label: string; delta?: string }>;
}
export interface FactoryComparisonScene extends BaseScene {
  type: 'comparison';
  headline: string;
  left: { title: string; points: string[] };
  right: { title: string; points: string[] };
}
export interface FactoryFlowScene extends BaseScene {
  type: 'flow';
  headline: string;
  steps: Array<{ label: string; description?: string }>;
}
export interface FactoryScreenshotScene extends BaseScene {
  type: 'screenshot';
  headline: string;
  imagePath: string;
  annotation?: string;
}
export interface FactoryQuoteScene extends BaseScene {
  type: 'quote';
  quote: string;
  attribution?: string;
}
export interface FactoryInsightScene extends BaseScene {
  type: 'insight';
  headline: string;
  body?: string;
}
export interface FactoryCtaScene extends BaseScene {
  type: 'cta';
  headline: string;
  action: string;
  url?: string;
}
export interface FactoryAgendaScene extends BaseScene {
  type: 'agenda';
  title: string;
  label?: string;
  items: Array<{ label: string; hint?: string }>;
  active?: number;
}
export interface FactorySectionScene extends BaseScene {
  type: 'section';
  number: string;
  title: string;
  label?: string;
  note?: string;
}
export interface FactorySplitScene extends BaseScene {
  type: 'split';
  headline: string;
  body?: string;
  label?: string;
  cards: Array<{ label: string; value?: string; hint?: string; accent?: boolean }>;
  meta?: string[];
}
export interface FactoryStepsScene extends BaseScene {
  type: 'steps';
  headline: string;
  label?: string;
  steps: Array<{ label: string; hint?: string }>;
}
export interface FactorySpotlightScene extends BaseScene {
  type: 'spotlight';
  icon: string;
  headline: string;
  body?: string;
  label?: string;
}
export interface FactoryOrbitalScene extends BaseScene {
  type: 'orbital';
  headline: string;
  label?: string;
  center: { label: string; hint?: string };
  items: Array<{ icon: string; label: string; hint?: string }>;
}
export interface FactoryChartRevealScene extends BaseScene {
  type: 'chart_reveal';
  headline: string;
  chart_kind?: 'bar' | 'line';
  items: Array<{ label: string; value: number; unit?: string }>;
}
export interface FactoryKineticTypoScene extends BaseScene {
  type: 'kinetic_typo';
  headline: string;
  lines?: string[];
}

export type FactoryScene =
  | FactoryHeroScene
  | FactoryProblemScene
  | FactoryReframeScene
  | FactoryMetricCardsScene
  | FactoryComparisonScene
  | FactoryFlowScene
  | FactoryScreenshotScene
  | FactoryQuoteScene
  | FactoryInsightScene
  | FactoryCtaScene
  | FactoryAgendaScene
  | FactorySectionScene
  | FactorySplitScene
  | FactoryStepsScene
  | FactorySpotlightScene
  | FactoryOrbitalScene
  | FactoryChartRevealScene
  | FactoryKineticTypoScene;

// ── FactoryVideoJob ────────────────────────────────────────────────────────────

/** Plain-object VideoJob matching the factory's VideoJobSchema exactly. */
export interface FactoryVideoJob {
  id: string;
  title: string;
  slug: string;
  format: FactoryFormat;
  theme: FactoryTheme;
  fps: 30;
  width: number;
  height: number;
  status: 'draft';
  generationMode: 'review_only';
  scenes: FactoryScene[];
  output: Record<string, never>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function assertNonEmpty(value: string, field: string): void {
  if (!value || value.trim() === '') {
    throw new Error(`${field} must not be empty`);
  }
}

const VALID_ICONS = [
  'camera', 'film', 'hashtag', 'flow', 'spark', 'clock',
  'link', 'target', 'heart', 'chat', 'search', 'check',
] as const;
type FactoryIcon = (typeof VALID_ICONS)[number];

function resolveIcon(raw: string | undefined): FactoryIcon {
  if (raw && (VALID_ICONS as readonly string[]).includes(raw)) {
    return raw as FactoryIcon;
  }
  return 'spark';
}

/** Split speaker_text on sentence-ending punctuation or "→ / ->" into ≥2 parts. */
function splitToSteps(headline: string, speakerText: string): Array<{ label: string }> {
  const arrow = speakerText.split(/\s*[→\-]+>\s*/);
  if (arrow.length >= 2) {
    return arrow.map((s) => ({ label: s.trim() })).filter((s) => s.label.length > 0);
  }
  const sentences = speakerText.split(/[.。!?]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length >= 2) {
    return sentences.slice(0, 5).map((s) => ({ label: s }));
  }
  // fallback: two steps from headline + speaker_text
  return [{ label: headline.trim() }, { label: speakerText.trim() }];
}

/** Derive reframe from/to from speaker_text or fall back to headline/speaker_text. */
function resolveFromTo(
  beat: ScriptBeat,
): { from: string; to: string } {
  if (beat.from && beat.to) return { from: beat.from.trim(), to: beat.to.trim() };
  const arrow = beat.speaker_text.split(/\s*[→\-]+>\s*/);
  if (arrow.length >= 2) {
    return { from: arrow[0].trim(), to: arrow[arrow.length - 1].trim() };
  }
  return { from: beat.headline.trim(), to: beat.speaker_text.trim() };
}

/** insight fallback — always valid, never throws. */
function insightFallback(base: BaseScene, beat: ScriptBeat): FactoryInsightScene {
  return {
    ...base,
    type: 'insight',
    headline: beat.headline.trim(),
    body: beat.speaker_text.trim(),
    caption: beat.speaker_text.trim(),
  };
}

// ── Scene mapper ───────────────────────────────────────────────────────────────

function mapBeatToScene(beat: ScriptBeat, index: number): FactoryScene {
  const prefix = `beats[${index}]`;

  assertNonEmpty(beat.scene_id, `${prefix}.scene_id`);
  assertNonEmpty(beat.headline, `${prefix}.headline`);
  assertNonEmpty(beat.speaker_text, `${prefix}.speaker_text`);

  if (
    beat.duration < FACTORY_MIN_SCENE_SECONDS ||
    beat.duration > FACTORY_MAX_SCENE_SECONDS
  ) {
    throw new Error(
      `${prefix}.duration ${beat.duration} is outside the factory range ` +
        `[${FACTORY_MIN_SCENE_SECONDS}, ${FACTORY_MAX_SCENE_SECONDS}]`,
    );
  }

  // Normalise scene_type: unknown types resolve to insight fallback (no throw).
  const sceneType = (FACTORY_SCENE_TYPES as readonly string[]).includes(beat.scene_type)
    ? (beat.scene_type as FactorySceneType)
    : 'insight';

  const base: BaseScene = {
    scene_id: beat.scene_id,
    duration: beat.duration,
    ...(beat.rhythm_role !== undefined ? { rhythm_role: beat.rhythm_role } : {}),
    ...(beat.emphasis && beat.emphasis.length > 0 ? { emphasis: beat.emphasis } : {}),
    ...(beat.mood !== undefined ? { mood: beat.mood } : {}),
    ...(beat.transition !== undefined ? { transition: beat.transition } : {}),
    caption: beat.speaker_text.trim(),
  };

  switch (sceneType) {
    case 'hero':
      return {
        ...base,
        type: 'hero',
        headline: beat.headline.trim(),
        subtitle: (beat.subtitle ?? beat.speaker_text).trim(),
        ...(beat.meta ? { meta: beat.meta } : {}),
      };

    case 'problem': {
      const bullets =
        beat.bullets && beat.bullets.length > 0
          ? beat.bullets.slice(0, 5)
          : [beat.speaker_text.trim()];
      return {
        ...base,
        type: 'problem',
        headline: beat.headline.trim(),
        bullets,
      };
    }

    case 'reframe': {
      const { from, to } = resolveFromTo(beat);
      return {
        ...base,
        type: 'reframe',
        headline: beat.headline.trim(),
        from,
        to,
      };
    }

    case 'metric_cards': {
      const cards =
        beat.cards && beat.cards.length > 0
          ? beat.cards.slice(0, 4)
          : [{ value: '·', label: beat.speaker_text.trim() }];
      return {
        ...base,
        type: 'metric_cards',
        headline: beat.headline.trim(),
        cards,
      };
    }

    case 'comparison': {
      const left = beat.left ?? {
        title: beat.headline.trim(),
        points: [beat.speaker_text.trim()],
      };
      const right = beat.right ?? {
        title: beat.headline.trim(),
        points: [beat.speaker_text.trim()],
      };
      return {
        ...base,
        type: 'comparison',
        headline: beat.headline.trim(),
        left,
        right,
      };
    }

    case 'flow': {
      const rawSteps = beat.steps && beat.steps.length >= 2 ? beat.steps : null;
      const steps: Array<{ label: string; description?: string }> = rawSteps
        ? rawSteps.slice(0, 5).map((s) => ({ label: s.label, ...(s.description ? { description: s.description } : {}) }))
        : splitToSteps(beat.headline, beat.speaker_text).slice(0, 5);
      const safeSteps = steps.length >= 2 ? steps : [{ label: beat.headline.trim() }, { label: beat.speaker_text.trim() }];
      return {
        ...base,
        type: 'flow',
        headline: beat.headline.trim(),
        steps: safeSteps,
      };
    }

    case 'screenshot': {
      if (!beat.imagePath) {
        // Cannot produce a valid screenshot without imagePath — fall back to insight.
        return insightFallback(base, beat);
      }
      return {
        ...base,
        type: 'screenshot',
        headline: beat.headline.trim(),
        imagePath: beat.imagePath,
        ...(beat.annotation ? { annotation: beat.annotation } : {}),
      };
    }

    case 'quote':
      return {
        ...base,
        type: 'quote',
        quote: (beat.quote ?? beat.headline).trim(),
        ...(beat.attribution ? { attribution: beat.attribution } : {}),
      };

    case 'insight':
      return {
        ...base,
        type: 'insight',
        headline: beat.headline.trim(),
        body: (beat.body ?? beat.speaker_text).trim(),
      };

    case 'cta':
      return {
        ...base,
        type: 'cta',
        headline: beat.headline.trim(),
        action: (beat.action ?? beat.speaker_text).trim(),
        ...(beat.url ? { url: beat.url } : {}),
      };

    case 'agenda': {
      if (!beat.items || beat.items.length === 0) {
        return insightFallback(base, beat);
      }
      return {
        ...base,
        type: 'agenda',
        title: (beat.title ?? beat.headline).trim(),
        items: beat.items.slice(0, 6).map((it) => ({
          label: it.label,
          ...(it.hint ? { hint: it.hint } : {}),
        })),
        ...(beat.label ? { label: beat.label } : {}),
      };
    }

    case 'section':
      return {
        ...base,
        type: 'section',
        number: (beat.number ?? '01').trim(),
        title: (beat.title ?? beat.headline).trim(),
        ...(beat.label ? { label: beat.label } : {}),
        ...(beat.body ? { note: beat.body } : {}),
      };

    case 'split': {
      const splitCards =
        beat.splitCards && beat.splitCards.length >= 2
          ? beat.splitCards.slice(0, 6)
          : [
              { label: beat.headline.trim() },
              { label: beat.speaker_text.trim() },
            ];
      return {
        ...base,
        type: 'split',
        headline: beat.headline.trim(),
        body: (beat.body ?? beat.speaker_text).trim(),
        cards: splitCards,
        ...(beat.label ? { label: beat.label } : {}),
        ...(beat.meta ? { meta: beat.meta } : {}),
      };
    }

    case 'steps': {
      const rawSteps = beat.steps && beat.steps.length >= 2 ? beat.steps : null;
      const steps: Array<{ label: string; hint?: string }> = rawSteps
        ? rawSteps.slice(0, 6).map((s) => ({ label: s.label, ...(s.hint ? { hint: s.hint } : {}) }))
        : splitToSteps(beat.headline, beat.speaker_text).slice(0, 6);
      const safeSteps =
        steps.length >= 2
          ? steps
          : [{ label: beat.headline.trim() }, { label: beat.speaker_text.trim() }];
      return {
        ...base,
        type: 'steps',
        headline: beat.headline.trim(),
        steps: safeSteps,
        ...(beat.label ? { label: beat.label } : {}),
      };
    }

    case 'spotlight': {
      return {
        ...base,
        type: 'spotlight',
        icon: resolveIcon(beat.icon),
        headline: beat.headline.trim(),
        body: (beat.body ?? beat.speaker_text).trim(),
        ...(beat.label ? { label: beat.label } : {}),
      };
    }

    case 'orbital': {
      if (!beat.center || !beat.items || beat.items.length < 3) {
        return insightFallback(base, beat);
      }
      return {
        ...base,
        type: 'orbital',
        headline: beat.headline.trim(),
        center: beat.center,
        items: beat.items.slice(0, 6).map((it) => ({
          icon: resolveIcon(it.icon),
          label: it.label,
          ...(it.hint ? { hint: it.hint } : {}),
        })),
        ...(beat.label ? { label: beat.label } : {}),
      };
    }

    case 'chart_reveal': {
      if (!beat.chartItems || beat.chartItems.length < 2) {
        return insightFallback(base, beat);
      }
      return {
        ...base,
        type: 'chart_reveal',
        headline: beat.headline.trim(),
        items: beat.chartItems.slice(0, 6),
        ...(beat.chart_kind ? { chart_kind: beat.chart_kind } : {}),
      };
    }

    case 'kinetic_typo':
      return {
        ...base,
        type: 'kinetic_typo',
        headline: beat.headline.trim(),
        ...(beat.lines && beat.lines.length > 0 ? { lines: beat.lines } : {}),
      };
  }
}

// ── buildFactoryVideoJob ───────────────────────────────────────────────────────

export interface BuildFactoryVideoJobInput {
  slug: string;
  title: string;
  beats: ScriptBeat[];
  format?: string;
  theme?: string;
}

/**
 * Maps a confirmed beat list to a factory-compatible VideoJob plain object.
 *
 * Throws only for:
 * - empty beats array
 * - any beat with empty headline or speaker_text
 * - any beat with duration outside [3, 20] seconds
 *
 * Unknown scene_type values and types requiring unprovidable sub-structures
 * are silently converted to insight scenes.
 */
export function buildFactoryVideoJob(input: BuildFactoryVideoJobInput): FactoryVideoJob {
  assertNonEmpty(input.slug, 'slug');
  assertNonEmpty(input.title, 'title');

  if (!Array.isArray(input.beats) || input.beats.length === 0) {
    throw new Error('beats must be a non-empty array');
  }

  const format = (input.format ?? 'youtube_16_9') as FactoryFormat;
  if (!(FACTORY_FORMATS as readonly string[]).includes(format)) {
    throw new Error(`format "${format}" is not allowed. Use: ${FACTORY_FORMATS.join(', ')}`);
  }

  const theme = (input.theme ?? 'default_deck') as FactoryTheme;
  if (!(FACTORY_THEMES as readonly string[]).includes(theme)) {
    throw new Error(`theme "${theme}" is not allowed. Use: ${FACTORY_THEMES.join(', ')}`);
  }

  const scenes = input.beats.map((beat, i) => mapBeatToScene(beat, i));
  const id = `l5-${input.slug}`;

  return {
    id,
    slug: id,
    title: input.title.trim(),
    format,
    theme,
    fps: 30,
    width: 1920,
    height: 1080,
    status: 'draft',
    generationMode: 'review_only',
    scenes,
    output: {},
  };
}
