import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Shape of services/youtube/.credentials.json (gitignored, never commit). */
export interface YouTubeCredentials {
  project_id: string;
  api_key: string;
  oauth: {
    client_id: string;
    client_secret: string;
    refresh_token: string;
    token_uri: string;
    redirect_uri?: string;
    scopes: string[];
  };
  channel: {
    title: string;
    owner: string;
  };
  note?: string;
}

/** Default location: services/youtube/.credentials.json (next to this package). */
export function defaultCredentialsPath(): string {
  // dist/credentials.js or src/credentials.ts → package root is one level up.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '.credentials.json');
}

/**
 * Load credentials from JSON file. Throws with a path-only message
 * (never echoes file contents) when missing or malformed.
 */
export function loadCredentials(path?: string): YouTubeCredentials {
  const resolved = path ?? defaultCredentialsPath();
  let raw: string;
  try {
    raw = readFileSync(resolved, 'utf8');
  } catch {
    throw new Error(`YouTube credentials file not found or unreadable: ${resolved}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`YouTube credentials file is not valid JSON: ${resolved}`);
  }
  const creds = parsed as YouTubeCredentials;
  if (!creds.api_key || !creds.oauth?.client_id || !creds.oauth?.client_secret || !creds.oauth?.refresh_token) {
    throw new Error(`YouTube credentials file is missing required fields: ${resolved}`);
  }
  return creds;
}
