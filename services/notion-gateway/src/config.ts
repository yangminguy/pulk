// Notion gateway configuration — read from env (no hardcoded secrets).
// Secrets live in the repo-root .env.local alongside OPENAI_API_KEY / POSTGRES_*.

export interface NotionGatewayConfig {
  notionToken: string;
  notionDatabaseId: string;
  /** PRD저장소 database id — empty string disables the PRD sync round. */
  notionPrdDatabaseId: string;
  notionVersion: string;
  nocobaseUrl: string;
  nocobaseToken: string;
  /** Polling interval in ms (default 60s). */
  pollIntervalMs: number;
  /** Min ms between Notion API calls (~3 req/s cap → 350ms). */
  requestSpacingMs: number;
}

function requiredAny(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

export function loadConfig(): NotionGatewayConfig {
  return {
    // Integration token. Accepts the conventional NOTION_TOKEN or the key the
    // founder placed in .env.local (`notionintegrationtoken`).
    notionToken: process.env.NOTION_TOKEN ?? requiredAny('notionintegrationtoken'),
    // Target = DB1 "코딩 워크플로우 로그". A Notion database id is not a secret,
    // so it's a documented default here (overridable by env).
    notionDatabaseId: process.env.NOTION_DATABASE_ID ?? '39737e66cadf80cfb508fdd49c650088',
    // Target = "PRD저장소". No documented default id yet → env-required to enable.
    notionPrdDatabaseId: process.env.NOTION_PRD_DATABASE_ID ?? '',
    notionVersion: process.env.NOTION_VERSION ?? '2022-06-28',
    nocobaseUrl: process.env.NOCOBASE_URL ?? 'http://localhost:13000',
    nocobaseToken: process.env.NOCOBASE_TOKEN ?? '',
    pollIntervalMs: Number(process.env.NOTION_POLL_INTERVAL_MS ?? 60_000),
    requestSpacingMs: Number(process.env.NOTION_REQUEST_SPACING_MS ?? 350),
  };
}
