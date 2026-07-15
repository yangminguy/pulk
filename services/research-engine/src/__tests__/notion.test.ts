import {
  markdownToBlocks,
  chunkBlocks,
  splitRichText,
  parseInline,
  NotionPublisher,
  type NotionBlock,
} from '../adapters/notion';

function typeOf(b: NotionBlock): string {
  return b.type as string;
}
function richText(b: NotionBlock): Array<{ text: { content: string } }> {
  const body = b[typeOf(b)] as { rich_text: Array<{ text: { content: string } }> };
  return body.rich_text;
}

describe('markdownToBlocks', () => {
  it('maps headings, paragraph, quote, divider, code', () => {
    const md = ['# H1', '## H2', '### H3', 'a paragraph', '> a quote', '---', '```ts', 'const x = 1;', '```'].join('\n');
    const blocks = markdownToBlocks(md);
    const types = blocks.map(typeOf);
    expect(types).toEqual([
      'heading_1', 'heading_2', 'heading_3', 'paragraph', 'quote', 'divider', 'code',
    ]);
    const code = blocks[6];
    expect((code.code as { language: string }).language).toBe('typescript');
    expect(richText(code)[0].text.content).toBe('const x = 1;');
  });

  it('maps bulleted and numbered lists', () => {
    const blocks = markdownToBlocks(['- one', '- two', '1. first', '2. second'].join('\n'));
    expect(blocks.map(typeOf)).toEqual([
      'bulleted_list_item', 'bulleted_list_item', 'numbered_list_item', 'numbered_list_item',
    ]);
  });

  it('nests indented list items under their parent', () => {
    const blocks = markdownToBlocks(['- parent', '  - child', '  - child2'].join('\n'));
    expect(blocks).toHaveLength(1);
    const parent = blocks[0];
    const body = parent[typeOf(parent)] as { children?: NotionBlock[] };
    expect(body.children).toHaveLength(2);
    expect(typeOf(body.children![0])).toBe('bulleted_list_item');
  });

  it('splits rich_text at 2000 chars', () => {
    const long = 'x'.repeat(2500);
    const blocks = markdownToBlocks(long);
    expect(blocks).toHaveLength(1);
    const rt = richText(blocks[0]);
    expect(rt).toHaveLength(2);
    expect(rt[0].text.content).toHaveLength(2000);
    expect(rt[1].text.content).toHaveLength(500);
  });

  it('parses inline bold and links', () => {
    const runs = parseInline('see **bold** and [docs](https://x.dev)');
    const bold = runs.find((r) => r.annotations?.bold);
    const link = runs.find((r) => r.text.link?.url);
    expect(bold?.text.content).toBe('bold');
    expect(link?.text.link?.url).toBe('https://x.dev');
  });
});

describe('splitRichText', () => {
  it('keeps a short string as a single run', () => {
    expect(splitRichText('hi')).toHaveLength(1);
  });
  it('splits 4100 chars into 3 runs (2000/2000/100)', () => {
    const runs = splitRichText('a'.repeat(4100));
    expect(runs.map((r) => r.text.content.length)).toEqual([2000, 2000, 100]);
  });
});

describe('chunkBlocks', () => {
  it('splits into <=100 batches', () => {
    const blocks = Array.from({ length: 250 }, () => ({ type: 'paragraph' })) as NotionBlock[];
    const batches = chunkBlocks(blocks);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
  });
});

describe('NotionPublisher.publishReport', () => {
  it('skips when neither token+target is configured', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
    const pub = new NotionPublisher({ token: '', fetchImpl, log: () => {} });
    const res = await pub.publishReport({ title: 'T', markdown: '# x' });
    expect(res.skipped).toBe(true);
    expect(res.url).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('creates a sub-page under a parent page and appends overflow blocks', async () => {
    const requests: { url: string; method: string; body: any }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), method: String(init.method), body: JSON.parse(String(init.body)) });
      if (String(url).endsWith('/pages')) {
        return { ok: true, json: async () => ({ id: 'page-1', url: 'https://notion.so/page-1' }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    const pub = new NotionPublisher({
      token: 'secret_x',
      parentPageId: 'parent-1',
      requestSpacingMs: 0,
      fetchImpl,
      log: () => {},
    });
    // 150 paragraph lines → 1 create (100) + 1 append (50).
    const md = Array.from({ length: 150 }, (_, i) => `line ${i}`).join('\n\n');
    const res = await pub.publishReport({ title: '리서치 리포트', markdown: md });

    expect(res.skipped).toBe(false);
    expect(res.url).toBe('https://notion.so/page-1');

    const create = requests[0];
    expect(create.url).toBe('https://api.notion.com/v1/pages');
    expect(create.method).toBe('POST');
    expect(create.body.parent.page_id).toBe('parent-1');
    expect(create.body.properties.title.title[0].text.content).toBe('리서치 리포트');
    expect(create.body.children.length).toBe(100);

    const append = requests[1];
    expect(append.url).toBe('https://api.notion.com/v1/blocks/page-1/children');
    expect(append.method).toBe('PATCH');
    expect(append.body.children.length).toBe(50);
  });
});
