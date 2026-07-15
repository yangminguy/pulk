// notion adapter — NotionPublishPort via raw fetch (no @notionhq/client), mirroring
// services/notion-gateway/src/notion-client.ts (Bearer + Notion-Version, ~3 req/s).
//
// Target resolution (spec §7.4):
//   NOTION_RESEARCH_PARENT_PAGE_ID  → create a sub-page (parent = page_id)   [preferred]
//   NOTION_RESEARCH_DATABASE_ID     → create a row (parent = database_id, title only)
//   neither                          → { skipped:true }
//
// Markdown is converted to Notion blocks locally (markdownToBlocks). Page create
// carries the first 100 blocks; the remainder is appended in 100-block PATCH
// batches to /v1/blocks/{page_id}/children.

import type { NotionPublishInput, NotionPublishPort, NotionPublishResult } from '@l5/core';

const API = 'https://api.notion.com/v1';
const MAX_BLOCKS_PER_REQUEST = 100;
const MAX_RICH_TEXT_CHARS = 2000;

// ---------------------------------------------------------------------------
// Notion block model (minimal — plain JSON objects).
// ---------------------------------------------------------------------------

interface Annotations {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export interface RichText {
  type: 'text';
  text: { content: string; link?: { url: string } | null };
  annotations?: Annotations;
}

export type NotionBlock = Record<string, unknown>;

/** Split a string into ≤2000-char rich_text runs (Notion's per-run limit). */
export function splitRichText(
  content: string,
  annotations?: Annotations,
  link?: string | null,
): RichText[] {
  if (content === '') {
    return [{ type: 'text', text: { content: '', link: link ? { url: link } : null }, annotations }];
  }
  const out: RichText[] = [];
  for (let i = 0; i < content.length; i += MAX_RICH_TEXT_CHARS) {
    out.push({
      type: 'text',
      text: { content: content.slice(i, i + MAX_RICH_TEXT_CHARS), link: link ? { url: link } : null },
      ...(annotations ? { annotations } : {}),
    });
  }
  return out;
}

/** Inline parser: **bold** and [text](url) links → rich_text[] (2000-char split). */
export function parseInline(text: string): RichText[] {
  const runs: RichText[] = [];
  // Tokenize on links first, then bold within plain spans.
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushPlain = (s: string) => {
    if (!s) return;
    const boldRe = /\*\*([^*]+)\*\*/g;
    let bl = 0;
    let bm: RegExpExecArray | null;
    while ((bm = boldRe.exec(s)) !== null) {
      if (bm.index > bl) runs.push(...splitRichText(s.slice(bl, bm.index)));
      runs.push(...splitRichText(bm[1], { bold: true }));
      bl = bm.index + bm[0].length;
    }
    if (bl < s.length) runs.push(...splitRichText(s.slice(bl)));
  };
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) pushPlain(text.slice(last, m.index));
    runs.push(...splitRichText(m[1], undefined, m[2]));
    last = m.index + m[0].length;
  }
  if (last < text.length) pushPlain(text.slice(last));
  return runs.length > 0 ? runs : splitRichText(text);
}

function block(type: string, richText: RichText[], extra: Record<string, unknown> = {}): NotionBlock {
  return { object: 'block', type, [type]: { rich_text: richText, ...extra } };
}

function indentWidth(line: string): number {
  const m = line.match(/^(\s*)/);
  if (!m) return 0;
  return m[1].replace(/\t/g, '  ').length;
}

/**
 * Markdown → Notion blocks. Supports: h1-h3, paragraph, bulleted/numbered list
 * (with one level of indentation nesting), fenced code, blockquote, divider,
 * inline bold + links. rich_text is split at 2000 chars.
 */
export function markdownToBlocks(markdown: string): NotionBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: NotionBlock[] = [];
  // Stack of list items by indent level, so deeper items nest as children.
  let listStack: { indent: number; block: NotionBlock }[] = [];

  const resetList = () => {
    listStack = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Fenced code block.
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || 'plain text';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      resetList();
      blocks.push(
        block('code', splitRichText(codeLines.join('\n')), { language: normalizeLang(lang) }),
      );
      continue;
    }

    if (line === '') {
      resetList();
      continue;
    }

    if (line === '---' || line === '***' || line === '___') {
      resetList();
      blocks.push({ object: 'block', type: 'divider', divider: {} });
      continue;
    }

    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      resetList();
      const level = m[1].length;
      const type = `heading_${level}`;
      blocks.push(block(type, parseInline(m[2])));
      continue;
    }

    if (line.startsWith('> ')) {
      resetList();
      blocks.push(block('quote', parseInline(line.slice(2))));
      continue;
    }

    // List items (bulleted / numbered) with indentation-based nesting.
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (bullet || numbered) {
      const indent = indentWidth(rawLine);
      const type = bullet ? 'bulleted_list_item' : 'numbered_list_item';
      const content = (bullet ? bullet[1] : numbered![1]);
      const item = block(type, parseInline(content));

      // Pop deeper/equal levels off the stack.
      while (listStack.length > 0 && listStack[listStack.length - 1].indent >= indent) {
        listStack.pop();
      }
      const parent = listStack[listStack.length - 1];
      if (parent) {
        const pv = parent.block[(parent.block as { type: string }).type as string] as {
          children?: NotionBlock[];
        };
        pv.children = pv.children ?? [];
        pv.children.push(item);
      } else {
        blocks.push(item);
      }
      listStack.push({ indent, block: item });
      continue;
    }

    // Default: paragraph.
    resetList();
    blocks.push(block('paragraph', parseInline(line)));
  }

  return blocks;
}

function normalizeLang(lang: string): string {
  const known = new Set([
    'plain text', 'bash', 'shell', 'javascript', 'typescript', 'json', 'python',
    'java', 'go', 'rust', 'sql', 'yaml', 'html', 'css', 'markdown', 'c', 'c++',
  ]);
  const l = lang.toLowerCase();
  if (l === 'sh' || l === 'zsh') return 'shell';
  if (l === 'js') return 'javascript';
  if (l === 'ts') return 'typescript';
  if (l === 'py') return 'python';
  return known.has(l) ? l : 'plain text';
}

/** Split blocks into ≤100-length batches (Notion per-request cap). */
export function chunkBlocks(blocks: NotionBlock[], size = MAX_BLOCKS_PER_REQUEST): NotionBlock[][] {
  const out: NotionBlock[][] = [];
  for (let i = 0; i < blocks.length; i += size) out.push(blocks.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Publisher
// ---------------------------------------------------------------------------

export type FetchFn = typeof fetch;

export interface NotionPublisherOptions {
  token: string;
  version?: string;
  parentPageId?: string;
  databaseId?: string;
  requestSpacingMs?: number;
  fetchImpl?: FetchFn;
  log?: (msg: string) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class NotionPublisher implements NotionPublishPort {
  private readonly token: string;
  private readonly version: string;
  private readonly parentPageId?: string;
  private readonly databaseId?: string;
  private readonly spacingMs: number;
  private readonly fetchImpl: FetchFn;
  private readonly log: (msg: string) => void;

  constructor(opts: NotionPublisherOptions) {
    this.token = opts.token;
    this.version = opts.version ?? '2022-06-28';
    this.parentPageId = opts.parentPageId || undefined;
    this.databaseId = opts.databaseId || undefined;
    this.spacingMs = opts.requestSpacingMs ?? 350;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.log = opts.log ?? ((m) => process.stderr.write(`${m}\n`));
  }

  private async request(path: string, init: RequestInit): Promise<any> {
    await sleep(this.spacingMs);
    const res = await this.fetchImpl(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Notion-Version': this.version,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string>),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Notion API ${res.status} ${init.method ?? 'GET'} ${path}: ${body.slice(0, 400)}`);
    }
    return res.json();
  }

  private async databaseTitlePropName(): Promise<string> {
    try {
      const data = await this.request(`/databases/${this.databaseId}`, { method: 'GET' });
      for (const [name, def] of Object.entries<any>(data.properties ?? {})) {
        if (def?.type === 'title') return name;
      }
    } catch (err) {
      this.log(`[notion] db schema lookup failed, defaulting title prop: ${(err as Error).message}`);
    }
    return 'title';
  }

  async publishReport(input: NotionPublishInput): Promise<NotionPublishResult> {
    if (!this.token || (!this.parentPageId && !this.databaseId)) {
      this.log('[notion] disabled — no token or no NOTION_RESEARCH_PARENT_PAGE_ID/DATABASE_ID');
      return { url: null, skipped: true };
    }

    const blocks = markdownToBlocks(input.markdown);
    const batches = chunkBlocks(blocks);
    const first = batches[0] ?? [];

    let parent: Record<string, unknown>;
    let properties: Record<string, unknown>;
    if (this.parentPageId) {
      parent = { page_id: this.parentPageId };
      properties = { title: { title: [{ text: { content: input.title } }] } };
    } else {
      parent = { database_id: this.databaseId };
      const titleProp = await this.databaseTitlePropName();
      properties = { [titleProp]: { title: [{ text: { content: input.title } }] } };
    }

    const created = await this.request('/pages', {
      method: 'POST',
      body: JSON.stringify({ parent, properties, ...(first.length ? { children: first } : {}) }),
    });
    const pageId = created.id as string;

    for (let i = 1; i < batches.length; i += 1) {
      await this.request(`/blocks/${pageId}/children`, {
        method: 'PATCH',
        body: JSON.stringify({ children: batches[i] }),
      });
    }

    return { url: (created.url as string) ?? null, skipped: false };
  }
}
