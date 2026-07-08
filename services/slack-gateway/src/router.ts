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

// ---------------------------------------------------------------------------
// CTO structured-planning classifier (CTO app only).
//
// Three routes: 'plan' → cto:planMessage (structured PRD/roadmap/tasks turn),
// 'approve' → cto:approvePlan (creates roadmap_items + agent_tasks),
// 'generic' → the existing headless-executive path. Deliberately conservative:
// only explicit planning/approval phrasings are intercepted, so ordinary CTO
// questions ("지금 뭐 진행 중이야?") keep flowing to the generic executive.

export type CtoIntent = 'plan' | 'approve' | 'generic';

const PLANNING_RE =
  /(PRD|개발 기획|기획해|기획 시작|설계해|설계 계획|roadmap|로드맵|작업(으로)?\s*쪼개|(task|태스크|테스크)(로|으로)\s*(나눠|나누|쪼개)|구현 계획|개발 계획|계획(을)?\s*(세워|만들|짜))/i;

// Approval must be a short, explicit command (not a long message that happens
// to contain "실행") — mirrors the "승인" button semantics of the Control Room.
const APPROVAL_RE =
  /^(승인|approve[d]?|실행|진행해|진행 해|이 계획(대로)?\s*(실행|진행)\s*(해|해줘|하자)?|계획 실행\s*(해|해줘)?|go)[.! ~]*$/i;

/** Classify a (mention-stripped) CTO instruction. */
export function classifyCtoIntent(instruction: string): CtoIntent {
  if (typeof instruction !== 'string') return 'generic';
  const t = instruction.trim();
  if (!t) return 'generic';
  if (t.length <= 30 && APPROVAL_RE.test(t)) return 'approve';
  if (PLANNING_RE.test(t)) return 'plan';
  return 'generic';
}
