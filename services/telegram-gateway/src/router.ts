// Router — parses an inbound Telegram message into { executive, instruction }.
// Pure, dependency-free, fully unit-testable (rules/40: logic must have tests).
//
// Recognizes @mentions for all 9 L5 executives. The mention may appear with a
// leading '@', a trailing ':', any case, and English or a few Korean aliases.

/** Canonical executive id == the subagent name in `.claude/agents/<id>.md`. */
export type ExecutiveId =
  | 'ceo'
  | 'cmo'
  | 'cto'
  | 'cpo'
  | 'cro'
  | 'coo'
  | 'cfo'
  | 'chief-of-staff'
  | 'risk-qa';

export interface ExecutiveDef {
  id: ExecutiveId;
  /** Korean display name used in Telegram replies. */
  label: string;
  /** Lowercased aliases (without '@') that resolve to this executive. */
  aliases: string[];
}

export const EXECUTIVES: readonly ExecutiveDef[] = [
  { id: 'ceo', label: 'CEO', aliases: ['ceo', '대표', '씨이오'] },
  { id: 'cmo', label: 'CMO', aliases: ['cmo', '마케팅', '씨엠오'] },
  { id: 'cto', label: 'CTO', aliases: ['cto', '기술', '씨티오'] },
  { id: 'cpo', label: 'CPO', aliases: ['cpo', '제품'] },
  { id: 'cro', label: 'CRO', aliases: ['cro', '매출', '세일즈', '영업'] },
  { id: 'coo', label: 'COO', aliases: ['coo', '운영'] },
  { id: 'cfo', label: 'CFO', aliases: ['cfo', '재무'] },
  {
    id: 'chief-of-staff',
    label: '비서실장',
    aliases: ['chief-of-staff', 'chief_of_staff', 'chiefofstaff', 'cos', '비서실장', '비서실'],
  },
  {
    id: 'risk-qa',
    label: 'Risk/QA',
    aliases: ['risk-qa', 'risk_qa', 'riskqa', 'risk', 'qa', '리스크'],
  },
];

const ALIAS_TO_ID = new Map<string, ExecutiveId>();
for (const exec of EXECUTIVES) {
  for (const a of exec.aliases) ALIAS_TO_ID.set(a.toLowerCase(), exec.id);
}

export function findExecutive(id: ExecutiveId): ExecutiveDef {
  const def = EXECUTIVES.find((e) => e.id === id);
  if (!def) throw new Error(`unknown executive id: ${id}`);
  return def;
}

export interface RoutedCommand {
  executive: ExecutiveDef;
  instruction: string;
}

/**
 * Parse a raw message. Returns the routed command, or null if no known
 * @executive mention is present. The mention is matched anywhere as a
 * whitespace-delimited token starting with '@'; the instruction is the rest
 * of the message with that mention token removed.
 */
export function routeMessage(raw: string): RoutedCommand | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;

  const tokens = text.split(/\s+/);
  let matchIndex = -1;
  let executive: ExecutiveDef | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok.startsWith('@')) continue;
    // strip leading '@' and trailing punctuation like ':' or ','
    const key = tok.slice(1).replace(/[:,.]+$/, '').toLowerCase();
    const id = ALIAS_TO_ID.get(key);
    if (id) {
      executive = findExecutive(id);
      matchIndex = i;
      break;
    }
  }

  if (!executive || matchIndex === -1) return null;

  const instruction = tokens
    .filter((_, i) => i !== matchIndex)
    .join(' ')
    .trim();

  return { executive, instruction };
}

// Default behavior: do NOT push deliverable files to Telegram on every run —
// the Founder asks when he wants them. These predicates decide when to attach.

const FILE_REQUEST_RE =
  /(파일|첨부|산출물|결과물|다운로드|다운받|보내줘|보내 줘|전송|html|pdf|docx|pptx|xlsx|csv|mp4|영상|이미지|그림|png|jpe?g|zip|문서로|자료로)/i;

const SEND_LAST_RE =
  /(방금|아까|그|지난|위)\s*(거|것|파일|산출물|결과물|영상|자료)?\s*(보내|전송|줘|첨부|다운)/;

/** True when the instruction explicitly asks for a deliverable file/format. */
export function wantsFiles(instruction: string): boolean {
  if (typeof instruction !== 'string') return false;
  return FILE_REQUEST_RE.test(instruction);
}

/**
 * True when the message is essentially "send me the file(s) from the last run"
 * rather than a new task — lets the gateway ship the previous run's deliverables
 * without re-spawning the agent.
 */
export function isSendLastFilesRequest(instruction: string): boolean {
  if (typeof instruction !== 'string') return false;
  const t = instruction.trim();
  if (!t) return false;
  if (SEND_LAST_RE.test(t)) return true;
  // Very short pure-file asks like "파일 보내줘" / "산출물 전송".
  return t.length <= 16 && /(파일|산출물|결과물)/.test(t) && /(보내|전송|줘|다운)/.test(t);
}

/** Help text listing every callable executive (sent on unknown/empty commands). */
export function helpText(): string {
  const lines = EXECUTIVES.map((e) => `@${e.id} (${e.label})`);
  return [
    '호출 가능한 임원:',
    ...lines,
    '',
    '예: "@cto 지금 진행 중인 개발 정리해줘"',
    '예: "@cmo 쿠킹 키 콘텐츠 기획서 html로 뽑아줘"',
  ].join('\n');
}
