#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile, rename, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const credentialsPath = resolve('services/youtube/.credentials.json');
const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
const port = 8766;
const redirectUri = `http://127.0.0.1:${port}`;
const state = randomBytes(24).toString('hex');
const scopes = [
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

const params = new URLSearchParams({
  client_id: credentials.oauth.client_id,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: scopes.join(' '),
  access_type: 'offline',
  prompt: 'consent',
  include_granted_scopes: 'true',
  state,
});

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
console.log(`AUTH_URL=${authUrl}`);

const outcome = new Promise((resolveOutcome, rejectOutcome) => {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', redirectUri);
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('잘못된 인증 요청입니다. 이 창을 닫고 다시 시도해주세요.');
        return;
      }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      if (error || !code) {
        throw new Error(error ? `Google authorization failed: ${error}` : 'Authorization code missing');
      }

      const tokenRes = await fetch(credentials.oauth.token_uri || 'https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: credentials.oauth.client_id,
          client_secret: credentials.oauth.client_secret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });
      if (!tokenRes.ok) throw new Error(`Token exchange failed: HTTP ${tokenRes.status}`);
      const tokens = await tokenRes.json();
      if (!tokens.refresh_token) throw new Error('Google did not return a refresh token');

      credentials.oauth.refresh_token = tokens.refresh_token;
      credentials.oauth.redirect_uri = redirectUri;
      credentials.oauth.scopes = scopes;
      const tempPath = `${credentialsPath}.tmp`;
      await writeFile(tempPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
      await rename(tempPath, credentialsPath);
      await chmod(credentialsPath, 0o600);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>YouTube 연결 완료</title><style>body{font-family:-apple-system,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f7f7f3;color:#10251d}.card{padding:48px;border-radius:24px;background:white;box-shadow:0 12px 40px #0001;text-align:center}h1{margin:0 0 12px}</style><div class="card"><h1>YouTube 연결 완료</h1><p>이 창을 닫아도 됩니다. 이제 업로드를 계속합니다.</p></div>');
      server.close(() => resolveOutcome(tokens.scope ?? scopes.join(' ')));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('인증 저장 중 오류가 발생했습니다.');
      server.close(() => rejectOutcome(error));
    }
  });
  server.listen(port, '127.0.0.1');
});

await outcome;
console.log('AUTH_OK');
