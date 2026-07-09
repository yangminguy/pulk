import { slackifyMarkdown } from 'slackify-markdown';

const SLACK_TEXT_LIMIT = 40_000;
const TRUNCATE_AT = 39_900;
const TRUNCATE_SUFFIX = '\n… (truncated)';

export function formatSlackText(markdown: string): string {
  try {
    const converted = slackifyMarkdown(markdown);
    return truncate(converted);
  } catch {
    return truncate(markdown);
  }
}

function truncate(text: string): string {
  if (text.length <= SLACK_TEXT_LIMIT) return text;
  return text.slice(0, TRUNCATE_AT) + TRUNCATE_SUFFIX;
}
