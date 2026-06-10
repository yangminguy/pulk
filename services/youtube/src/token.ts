import type { YouTubeCredentials } from './credentials.js';

export type FetchLike = (input: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

interface TokenResponse {
  access_token: string;
  expires_in: number; // seconds, typically 3600
}

const EXPIRY_MARGIN_MS = 60_000; // refresh 1 minute before actual expiry

/**
 * Exchanges the long-lived refresh_token for a short-lived access_token
 * and caches it in memory until shortly before expiry.
 */
export class TokenManager {
  private cachedToken: string | null = null;
  private expiresAtMs = 0;

  constructor(
    private readonly creds: YouTubeCredentials,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly now: () => number = Date.now,
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.now() < this.expiresAtMs - EXPIRY_MARGIN_MS) {
      return this.cachedToken;
    }
    const { oauth } = this.creds;
    const tokenUri = oauth.token_uri || 'https://oauth2.googleapis.com/token';
    const body = new URLSearchParams({
      client_id: oauth.client_id,
      client_secret: oauth.client_secret,
      refresh_token: oauth.refresh_token,
      grant_type: 'refresh_token',
    }).toString();

    const res = await this.fetchImpl(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      // Never log response body verbatim — it may contain sensitive details.
      throw new Error(`OAuth token refresh failed with HTTP ${res.status}`);
    }
    const data = (await res.json()) as TokenResponse;
    if (!data.access_token) {
      throw new Error('OAuth token refresh response missing access_token');
    }
    this.cachedToken = data.access_token;
    this.expiresAtMs = this.now() + (data.expires_in ?? 3600) * 1000;
    return this.cachedToken;
  }
}
