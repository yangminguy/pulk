// Notion REST client — raw fetch, no @notionhq/client dependency.
// Uses only the free public API (query/create/update). No Workers, no webhooks.

import type { NotionPage, NotionPropertiesPayload } from '@l5/core';
import type { NotionGatewayConfig } from './config.js';

const API = 'https://api.notion.com/v1';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class NotionClient {
  constructor(private readonly cfg: NotionGatewayConfig) {}

  private async request(path: string, init: RequestInit): Promise<any> {
    // Respect Notion's ~3 req/s limit with a fixed spacing between calls.
    await sleep(this.cfg.requestSpacingMs);
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.cfg.notionToken}`,
        'Notion-Version': this.cfg.notionVersion,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string>),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Notion API ${res.status} ${init.method ?? 'GET'} ${path}: ${body}`);
    }
    return res.json();
  }

  /** All rows in the target database (follows pagination). */
  async queryDatabase(): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    let cursor: string | undefined;
    do {
      const body: Record<string, unknown> = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const data = await this.request(`/databases/${this.cfg.notionDatabaseId}/query`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      for (const p of data.results ?? []) {
        pages.push({ id: p.id, last_edited_time: p.last_edited_time, properties: p.properties });
      }
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
    return pages;
  }

  /** Create a row; returns the new page id (to store as notion_page_id in pulk). */
  async createPage(properties: NotionPropertiesPayload): Promise<string> {
    const data = await this.request('/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { database_id: this.cfg.notionDatabaseId },
        properties,
      }),
    });
    return data.id as string;
  }

  async updatePage(pageId: string, properties: NotionPropertiesPayload): Promise<void> {
    await this.request(`/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
  }
}
