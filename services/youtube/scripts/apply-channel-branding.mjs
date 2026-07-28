#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const credentialsPath = resolve('services/youtube/.credentials.json');
const bannerPath = resolve('deliverables/diripda-channel-branding-2026-07-18/diripda-youtube-banner.png');
const channelDescription = [
  '브랜드의 퍼널을 해킹합니다.',
  '',
  '빠르게 성장한 기업은 뭐가 달랐기에 사람을 모으고, 설득하고, 구매하게 만들었을까요?',
  '디립다는 빠르게 성장한 브랜드의 마케팅·세일즈 퍼널을 해부합니다.',
].join('\n');
const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));

async function getAccessToken() {
  const response = await fetch(credentials.oauth.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.oauth.client_id,
      client_secret: credentials.oauth.client_secret,
      refresh_token: credentials.oauth.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error(`OAuth refresh failed: HTTP ${response.status}`);
  const body = await response.json();
  if (!body.access_token) throw new Error('OAuth response missing access token');
  return body.access_token;
}

async function jsonRequest(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${new URL(url).pathname} failed: HTTP ${response.status}`);
  return response.json();
}

async function uploadBanner(token) {
  const bytes = await readFile(bannerPath);
  const size = (await stat(bannerPath)).size;
  if (size > 6 * 1024 * 1024) throw new Error('Banner exceeds YouTube 6MB limit');
  const response = await fetch('https://www.googleapis.com/upload/youtube/v3/channelBanners/insert?uploadType=media', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/png',
      'Content-Length': String(bytes.byteLength),
    },
    body: bytes,
  });
  if (!response.ok) throw new Error(`Channel banner upload failed: HTTP ${response.status}`);
  const body = await response.json();
  if (!body.url) throw new Error('Channel banner upload response missing URL');
  return body.url;
}

async function updateBranding(token, channel, bannerUrl) {
  const brandingSettings = {
    channel: {
      ...(channel.brandingSettings?.channel ?? {}),
      description: channelDescription,
    },
    image: {
      ...(channel.brandingSettings?.image ?? {}),
      bannerExternalUrl: bannerUrl,
    },
  };
  return jsonRequest('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings', token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ id: channel.id, brandingSettings }),
  });
}

const token = await getAccessToken();
const channels = await jsonRequest('https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&mine=true', token);
const channel = channels.items?.[0];
if (!channel?.id) throw new Error('Authenticated channel not found');
if (channel.snippet?.title !== credentials.channel.title) {
  throw new Error(`Connected channel mismatch: expected ${credentials.channel.title}, got ${channel.snippet?.title ?? 'none'}`);
}
console.log(JSON.stringify({ stage: 'preflight_ok', channel: channel.snippet.title, channelId: channel.id }));

const bannerUrl = await uploadBanner(token);
console.log(JSON.stringify({ stage: 'banner_uploaded' }));
await updateBranding(token, channel, bannerUrl);
console.log(JSON.stringify({ stage: 'branding_applied' }));

const verified = await jsonRequest('https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&mine=true', token);
const current = verified.items?.[0];
console.log(JSON.stringify({
  stage: 'verified',
  channel: current?.snippet?.title,
  channelUrl: `https://www.youtube.com/${current?.snippet?.customUrl ?? '@dripda'}`,
  bannerPresent: Boolean(current?.brandingSettings?.image?.bannerExternalUrl),
  descriptionMatches: current?.brandingSettings?.channel?.description === channelDescription,
}));
