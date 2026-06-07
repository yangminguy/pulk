import { MarketResearchPack, ViewtrapReference } from './types';

export interface BuildMarketResearchPackInput {
  topic: string;
  why_this_topic_matters: string;
  market_context: string[];
  competitor_content_patterns: string[];
  unanswered_questions: string[];
  common_misunderstandings: string[];
  /** Raw string materials already formatted by the caller. */
  example_materials?: string[];
  /**
   * ViewtrapReference objects from viewtrap-research / reference-analysis.
   * Each will be appended to example_materials as a formatted string.
   */
  viewtrap_references?: ViewtrapReference[];
  content_opportunities: string[];
}

function formatViewtrapReference(ref: ViewtrapReference): string {
  const parts: string[] = [`[${ref.source}] ${ref.title}`];
  if (ref.channel_name) parts.push(`channel: ${ref.channel_name}`);
  if (ref.url) parts.push(`url: ${ref.url}`);
  if (ref.view_count !== undefined) parts.push(`views: ${ref.view_count}`);
  parts.push(`stage: ${ref.consumer_stage}`);
  parts.push(`reason: ${ref.selected_reason}`);
  return parts.join(' | ');
}

export function buildMarketResearchPack(input: BuildMarketResearchPackInput): MarketResearchPack {
  if (typeof input.topic !== 'string' || input.topic.trim() === '') {
    throw new Error('topic must not be empty');
  }

  const viewtrapMapped: string[] = (input.viewtrap_references ?? []).map(formatViewtrapReference);

  const example_materials: string[] = [
    ...(input.example_materials ?? []),
    ...viewtrapMapped,
  ];

  return {
    topic: input.topic.trim(),
    why_this_topic_matters: input.why_this_topic_matters,
    market_context: input.market_context,
    competitor_content_patterns: input.competitor_content_patterns,
    unanswered_questions: input.unanswered_questions,
    common_misunderstandings: input.common_misunderstandings,
    example_materials,
    content_opportunities: input.content_opportunities,
  };
}
