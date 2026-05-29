// content-extract — turn fetched changelog/web content into readable plain text.
//
// Phase 5 (learning loop) data-quality root fix. The self-learning task fetches
// changelog URLs that often return a full HTML page (sometimes a JS app shell
// with no real prose). Storing that raw HTML as a "discovery" pollutes the
// memory/insight surface. This pure function extracts readable text so only
// genuine, human-readable changes are recorded.
//
// Pure + dependency-free so it is unit-testable without NocoBase or network.

const NAMED_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/** Minimum readable length below which content is treated as "no real prose". */
export const MIN_READABLE_LEN = 40;

function decodeEntities(text: string): string {
  let out = text;
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    out = out.split(entity).join(char);
  }
  // Numeric entities: decimal (&#123;) and hex (&#x1F;)
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => safeFromCodePoint(parseInt(hex, 16)));
  out = out.replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)));
  return out;
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ' ';
  try {
    return String.fromCodePoint(code);
  } catch {
    return ' ';
  }
}

/**
 * Extract readable plain text from raw HTML (or already-plain text).
 *
 * - Drops <script>/<style>/<head>/<svg>/<noscript> blocks entirely (content too).
 * - Strips remaining tags, including a trailing tag truncated without its '>'.
 * - Decodes common named + numeric HTML entities.
 * - Collapses whitespace and truncates to maxLen.
 *
 * Returns '' when nothing readable remains (e.g. a JS app shell with no prose).
 * Callers should treat '' as "no real content" and skip recording it.
 */
export function extractReadableText(raw: string, maxLen = 2000): string {
  if (!raw) return '';

  const withoutBlocks = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, ' ');

  const text = decodeEntities(
    withoutBlocks
      // strip tags, including a trailing tag truncated without its closing '>'
      .replace(/<[^>]*>?/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length < MIN_READABLE_LEN) return '';
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text;
}
