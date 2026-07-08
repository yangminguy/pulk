// Router — helpers for the Slack gateway.
//
// Unlike the Telegram gateway (one bot, @mention parsing), each Slack app is a
// dedicated executive: the CEO app *is* the CEO, etc. So routing is decided by
// which socket the event arrived on — not by parsing the text. This module only
// needs to (a) define the 3 executives and (b) turn a raw app_mention/DM text
// into a clean instruction by stripping the bot's own <@ID> mention.
//
// Pure, dependency-free, fully unit-testable (rules/40: logic must have tests).

/** Canonical executive id == the subagent name in `.claude/agents/<id>.md`. */
export type ExecutiveId = 'ceo' | 'cmo' | 'cto';

export interface ExecutiveDef {
  id: ExecutiveId;
  /** Display name used in Slack replies. */
  label: string;
}

export const EXECUTIVES: Record<ExecutiveId, ExecutiveDef> = {
  ceo: { id: 'ceo', label: 'CEO' },
  cmo: { id: 'cmo', label: 'CMO' },
  cto: { id: 'cto', label: 'CTO' },
};

/**
 * Strip the bot's own mention (`<@U123>` or `<@U123|name>`) and any residual
 * Slack mention markup from a raw message, returning the instruction text.
 * Collapses whitespace. Returns '' for non-strings.
 */
export function cleanInstruction(rawText: string, botUserId: string): string {
  if (typeof rawText !== 'string') return '';
  let t = rawText;
  if (botUserId) {
    // <@U123> and <@U123|display-name>
    const re = new RegExp(`<@${escapeRe(botUserId)}(\\|[^>]+)?>`, 'g');
    t = t.replace(re, ' ');
  }
  return t.replace(/\s+/g, ' ').trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The Founder asks for deliverable files when he wants them; otherwise the
// gateway just notes them. Same predicate as the Telegram gateway.
const FILE_REQUEST_RE =
  /(파일|첨부|산출물|결과물|다운로드|다운받|보내줘|보내 줘|전송|html|pdf|docx|pptx|xlsx|csv|mp4|영상|이미지|그림|png|jpe?g|zip|문서로|자료로)/i;

/** True when the instruction explicitly asks for a deliverable file/format. */
export function wantsFiles(instruction: string): boolean {
  if (typeof instruction !== 'string') return false;
  return FILE_REQUEST_RE.test(instruction);
}
