#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const credentialsPath = resolve('services/youtube/.credentials.json');
const draftPath = resolve('/Users/wonminyang/ai-slide-video-factory/outputs/zero-ad-content-planning/youtube-upload-draft.json');
const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
const draft = JSON.parse(await readFile(draftPath, 'utf8'));
const metadata = draft.metadata;
const playlistTitle = '풀링콘텐츠';

async function accessToken() {
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

async function apiJson(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${new URL(url).pathname} failed: HTTP ${response.status}`);
  return response.json();
}

async function findPlaylist(token) {
  let pageToken = '';
  do {
    const params = new URLSearchParams({ part: 'snippet,status', mine: 'true', maxResults: '50' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await apiJson(`https://www.googleapis.com/youtube/v3/playlists?${params}`, token);
    const match = (data.items ?? []).find((item) => item.snippet?.title === playlistTitle);
    if (match) return match.id;
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  throw new Error(`Playlist not found: ${playlistTitle}`);
}

async function uploadVideo(token) {
  const filePath = draft.videoFile;
  const fileSize = (await stat(filePath)).size;
  const body = {
    snippet: {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      categoryId: metadata.categoryId,
      defaultLanguage: metadata.defaultLanguage,
      defaultAudioLanguage: metadata.defaultLanguage,
    },
    status: {
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: false,
      license: 'youtube',
      embeddable: true,
      publicStatsViewable: true,
    },
  };
  const start = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(fileSize),
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify(body),
  });
  if (!start.ok) throw new Error(`Video upload session failed: HTTP ${start.status}`);
  const sessionUrl = start.headers.get('location');
  if (!sessionUrl) throw new Error('Video upload session URL missing');
  const bytes = await readFile(filePath);
  const upload = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.byteLength) },
    body: bytes,
  });
  if (!upload.ok) throw new Error(`Video upload failed: HTTP ${upload.status}`);
  return upload.json();
}

async function setThumbnail(token, videoId) {
  const bytes = await readFile(draft.thumbnailFile);
  return apiJson(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', 'Content-Length': String(bytes.byteLength) },
    body: bytes,
  });
}

async function addCaption(token, videoId) {
  const boundary = `codex-${Date.now().toString(16)}`;
  const caption = await readFile(draft.captionFile);
  const json = JSON.stringify({ snippet: { videoId, language: 'ko', name: '한국어', isDraft: false } });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${json}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/x-subrip\r\n\r\n`),
    caption,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return apiJson('https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet', token, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}`, 'Content-Length': String(body.byteLength) },
    body,
  });
}

async function addToPlaylist(token, playlistId, videoId) {
  return apiJson('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } }),
  });
}

async function verify(token, playlistId, videoId) {
  const video = await apiJson(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(videoId)}`, token);
  const playlist = await apiJson(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&videoId=${encodeURIComponent(videoId)}`, token);
  return {
    video: video.items?.[0] ?? null,
    inPlaylist: (playlist.items?.length ?? 0) > 0,
  };
}

const token = await accessToken();
const channel = await apiJson('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', token);
const channelTitle = channel.items?.[0]?.snippet?.title;
if (channelTitle !== credentials.channel.title) {
  throw new Error(`Connected channel mismatch: expected ${credentials.channel.title}, got ${channelTitle ?? 'none'}`);
}
const playlistId = await findPlaylist(token);
console.log(JSON.stringify({ stage: 'preflight_ok', channel: channelTitle, playlist: playlistTitle }));

const uploaded = await uploadVideo(token);
if (!uploaded.id) throw new Error('Uploaded video id missing');
console.log(JSON.stringify({ stage: 'video_uploaded', videoId: uploaded.id, privacyStatus: uploaded.status?.privacyStatus }));

await setThumbnail(token, uploaded.id);
console.log(JSON.stringify({ stage: 'thumbnail_set' }));
await addCaption(token, uploaded.id);
console.log(JSON.stringify({ stage: 'caption_added' }));
await addToPlaylist(token, playlistId, uploaded.id);
console.log(JSON.stringify({ stage: 'playlist_added', playlist: playlistTitle }));

const checked = await verify(token, playlistId, uploaded.id);
console.log(JSON.stringify({
  stage: 'verified',
  videoId: uploaded.id,
  url: `https://www.youtube.com/watch?v=${uploaded.id}`,
  title: checked.video?.snippet?.title,
  privacyStatus: checked.video?.status?.privacyStatus,
  inPlaylist: checked.inPlaylist,
}));
