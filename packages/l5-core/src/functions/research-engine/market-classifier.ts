// research-engine — market classifier (KR vs US).
//
// Pure, deterministic, no LLM. Signal priority (§4.3):
//   1. channel.country  (KR → KR, US → US)
//   2. defaultAudioLanguage / defaultLanguage  (ko* → KR, en* → US)
//   3. Hangul ratio of title+description (≥ 0.3 → KR, else US when text present)
// regionCode is NEVER used as a signal (search regionCode ≠ production market).

import type { Market } from './types';

export interface MarketSignals {
  channelCountry?: string | null;
  defaultAudioLanguage?: string | null;
  defaultLanguage?: string | null;
  title?: string;
  description?: string;
}

const HANGUL_RE = /[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿]/;

/** Ratio of Hangul characters among non-whitespace characters (0..1). */
export function hangulRatio(text: string): number {
  if (!text) return 0;
  let total = 0;
  let hangul = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    total += 1;
    if (HANGUL_RE.test(ch)) hangul += 1;
  }
  return total === 0 ? 0 : hangul / total;
}

const HANGUL_KR_THRESHOLD = 0.3;

/**
 * Classify a candidate into a market, or null when there is no usable signal.
 * Deterministic and pure.
 */
export function classifyMarket(signals: MarketSignals): Market | null {
  // 1. Explicit channel country wins.
  const country = (signals.channelCountry ?? '').trim().toUpperCase();
  if (country === 'KR') return 'KR';
  if (country === 'US') return 'US';

  // 2. Declared language.
  const lang = (signals.defaultAudioLanguage ?? signals.defaultLanguage ?? '')
    .trim()
    .toLowerCase();
  if (lang.startsWith('ko')) return 'KR';
  if (lang.startsWith('en')) return 'US';

  // 3. Hangul ratio of visible text.
  const text = `${signals.title ?? ''} ${signals.description ?? ''}`.trim();
  if (!text) return null; // no country, no language, no text → undetermined
  return hangulRatio(text) >= HANGUL_KR_THRESHOLD ? 'KR' : 'US';
}
