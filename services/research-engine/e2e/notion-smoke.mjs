// Live Notion smoke — creates one real report page from a small markdown doc.
//   node e2e/notion-smoke.mjs
// Requires: NOTION_TOKEN|notionintegrationtoken AND
//           NOTION_RESEARCH_PARENT_PAGE_ID (documented default) or NOTION_RESEARCH_DATABASE_ID.

import { requireBuilt, requireEnv } from './_guard.mjs';

requireBuilt();
requireEnv(['NOTION_TOKEN|notionintegrationtoken']);

const { loadConfig } = await import('../dist/config.js');
const { NotionPublisher } = await import('../dist/adapters/notion.js');

const cfg = loadConfig();
if (!cfg.notionParentPageId && !cfg.notionDatabaseId) {
  console.error('[e2e] set NOTION_RESEARCH_PARENT_PAGE_ID or NOTION_RESEARCH_DATABASE_ID');
  process.exit(1);
}

const pub = new NotionPublisher({
  token: cfg.notionToken,
  version: cfg.notionVersion,
  parentPageId: cfg.notionParentPageId,
  databaseId: cfg.notionDatabaseId,
});

const markdown = [
  '# 리서치 엔진 Notion 스모크',
  '',
  '이 페이지는 research-engine e2e 스모크가 생성했습니다.',
  '',
  '## 확인 항목',
  '- markdown → blocks 변환',
  '- 100블록 배치 append',
  '',
  '> 인라인 **굵게** 와 [링크](https://www.youtube.com) 렌더링 확인.',
  '',
  '```ts',
  'const ok = true;',
  '```',
].join('\n');

const res = await pub.publishReport({ title: `[리서치 스모크] ${new Date().toISOString()}`, markdown });
if (res.skipped) {
  console.error('[e2e] publish skipped — check token/target config');
  process.exit(1);
}
console.log(`[e2e] notion page created: ${res.url}`);
console.log('[e2e] notion-smoke DONE');
