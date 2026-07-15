#!/usr/bin/env node
// youtube-research skill — YouTube Data API v3 + timestamped transcript helper.
// Node 18+ built-in APIs only. Transcript extraction requires yt-dlp.
//
// Credentials lookup (first hit wins):
//   1. $YOUTUBE_API_KEY
//   2. services/youtube/.credentials.json in cwd or any ancestor
//
// Usage: node youtube.mjs <command> [args] [--flags]
// Output: JSON on stdout. Errors on stderr with non-zero exit.


import { createHash } from 'node:crypto';
import { readFileSync, statSync, mkdtempSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DATA_API = 'https://www.googleapis.com/youtube/v3';
const CHUNK = 50;
const DEFAULT_TRANSCRIPT_CHUNK_CHARS = 8000;

function loadApiKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  let dir = process.cwd();
  while (true) {
    const p = join(dir, 'services', 'youtube', '.credentials.json');
    try {
      statSync(p);
      const parsed = JSON.parse(readFileSync(p, 'utf8'));
      if (parsed.api_key) return parsed.api_key;
    } catch { /* keep walking */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('No YouTube API key. Set $YOUTUBE_API_KEY or place services/youtube/.credentials.json in an ancestor dir.');
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const endpoint = url.split('?')[0];
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch {}
    throw new Error(`YouTube API HTTP ${res.status} for ${endpoint}${body ? ` — ${body}` : ''}`);
  }
  return res.json();
}

function parseIsoDuration(iso) {
  const m = String(iso ?? '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

function extractVideoId(input) {
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/live\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = input.match(re);
    if (m) return m[1];
  }
  return null;
}

// ── YouTube Data API commands ───────────────────────────────────────────────

async function cmdSearch(args) {
  const q = args._[0];
  if (!q) throw new Error('search: query required');
  const params = new URLSearchParams({
    part: 'snippet',
    q,
    type: 'video',
    maxResults: String(args.max ?? 25),
    key: loadApiKey(),
  });
  if (args.order) params.set('order', args.order);
  if (args.region) params.set('regionCode', args.region);
  if (args.lang) params.set('relevanceLanguage', args.lang);
  if (args['published-after']) {
    const pa = args['published-after'];
    params.set('publishedAfter', pa.includes('T') ? pa : `${pa}T00:00:00Z`);
  }
  const data = await getJson(`${DATA_API}/search?${params}`);
  return (data.items ?? [])
    .filter((x) => x.id?.videoId)
    .map((x) => ({
      videoId: x.id.videoId,
      title: x.snippet?.title ?? '',
      channelTitle: x.snippet?.channelTitle ?? '',
      channelId: x.snippet?.channelId ?? '',
      publishedAt: x.snippet?.publishedAt ?? '',
      description: x.snippet?.description ?? '',
      thumbnail: x.snippet?.thumbnails?.high?.url ?? x.snippet?.thumbnails?.default?.url ?? '',
      liveBroadcastContent: x.snippet?.liveBroadcastContent ?? 'none',
    }));
}

async function cmdStats(args) {
  const idsCsv = args._[0];
  if (!idsCsv) throw new Error('stats: videoId(s) required (comma-separated)');
  const ids = idsCsv.split(',').map((s) => s.trim()).filter(Boolean);
  const key = loadApiKey();
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const params = new URLSearchParams({
      part: 'statistics,snippet,contentDetails',
      id: chunk.join(','),
      key,
    });
    const data = await getJson(`${DATA_API}/videos?${params}`);
    for (const item of data.items ?? []) {
      if (!item.id) continue;
      const secs = parseIsoDuration(item.contentDetails?.duration ?? '');
      out.push({
        videoId: item.id,
        title: item.snippet?.title ?? '',
        description: item.snippet?.description ?? '',
        channelTitle: item.snippet?.channelTitle ?? '',
        channelId: item.snippet?.channelId ?? '',
        publishedAt: item.snippet?.publishedAt ?? '',
        defaultLanguage: item.snippet?.defaultLanguage ?? null,
        defaultAudioLanguage: item.snippet?.defaultAudioLanguage ?? null,
        categoryId: item.snippet?.categoryId ?? null,
        tags: item.snippet?.tags ?? [],
        viewCount: Number(item.statistics?.viewCount ?? 0),
        likeCount: item.statistics?.likeCount != null ? Number(item.statistics.likeCount) : null,
        commentCount: item.statistics?.commentCount != null ? Number(item.statistics.commentCount) : null,
        durationSeconds: secs,
        isShort: secs > 0 && secs <= 60,
        captionsAvailable: item.contentDetails?.caption === 'true',
      });
    }
  }
  return out;
}

async function cmdComments(args) {
  const videoId = args._[0];
  if (!videoId) throw new Error('comments: videoId required');
  const params = new URLSearchParams({
    part: 'snippet',
    videoId,
    order: 'relevance',
    maxResults: String(args.max ?? 8),
    textFormat: 'plainText',
    key: loadApiKey(),
  });
  try {
    const data = await getJson(`${DATA_API}/commentThreads?${params}`);
    return (data.items ?? [])
      .map((it) => it.snippet?.topLevelComment?.snippet?.textDisplay?.trim() ?? '')
      .filter((t) => t.length > 0);
  } catch {
    return [];
  }
}

async function cmdChannelSearch(args) {
  const q = args._[0];
  if (!q) throw new Error('channel-search: query required');
  const params = new URLSearchParams({
    part: 'snippet',
    q,
    type: 'channel',
    maxResults: String(args.max ?? 10),
    key: loadApiKey(),
  });
  const data = await getJson(`${DATA_API}/search?${params}`);
  return (data.items ?? [])
    .filter((x) => x.id?.channelId)
    .map((x) => ({
      channelId: x.id.channelId,
      title: x.snippet?.title ?? '',
      description: x.snippet?.description ?? '',
    }));
}

async function cmdChannelStats(args) {
  const idsCsv = args._[0];
  if (!idsCsv) throw new Error('channel-stats: channelId(s) required (comma-separated)');
  const ids = [...new Set(idsCsv.split(',').map((s) => s.trim()).filter(Boolean))];
  const key = loadApiKey();
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const params = new URLSearchParams({
      part: 'statistics,snippet',
      id: chunk.join(','),
      key,
    });
    const data = await getJson(`${DATA_API}/channels?${params}`);
    for (const item of data.items ?? []) {
      if (!item.id) continue;
      const viewCount = Number(item.statistics?.viewCount ?? 0);
      const videoCount = Number(item.statistics?.videoCount ?? 0);
      out.push({
        channelId: item.id,
        channelTitle: item.snippet?.title ?? '',
        description: item.snippet?.description ?? '',
        country: item.snippet?.country ?? null,
        customUrl: item.snippet?.customUrl ?? null,
        subscriberCount: item.statistics?.subscriberCount != null ? Number(item.statistics.subscriberCount) : null,
        hiddenSubscriberCount: Boolean(item.statistics?.hiddenSubscriberCount),
        viewCount,
        videoCount,
        avgViewsPerVideo: videoCount > 0 ? Math.round(viewCount / videoCount) : 0,
      });
    }
  }
  return out;
}

async function cmdChannelTop(args) {
  const channelId = args._[0];
  if (!channelId) throw new Error('channel-top: channelId required');
  const params = new URLSearchParams({
    part: 'snippet',
    channelId,
    type: 'video',
    order: 'viewCount',
    maxResults: String(args.max ?? 10),
    key: loadApiKey(),
  });
  const data = await getJson(`${DATA_API}/search?${params}`);
  return (data.items ?? [])
    .filter((x) => x.id?.videoId)
    .map((x) => ({
      videoId: x.id.videoId,
      title: x.snippet?.title ?? '',
      channelTitle: x.snippet?.channelTitle ?? '',
      publishedAt: x.snippet?.publishedAt ?? '',
    }));
}

// ── Transcript parsing and chunking ─────────────────────────────────────────

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function cleanCaptionText(text) {
  return decodeEntities(String(text ?? ''))
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTimestamp(value) {
  const parts = String(value).trim().replace(',', '.').split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts.pop()) : 0;
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return (hours * 3600) + (minutes * 60) + seconds;
}

function formatTimestamp(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const whole = Math.floor(safe);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function appendWithoutRollingOverlap(previousRaw, currentRaw) {
  const current = cleanCaptionText(currentRaw);
  if (!current) return '';
  const previous = cleanCaptionText(previousRaw);
  if (!previous) return current;
  if (previous === current) return '';

  const prevTokens = previous.split(/\s+/);
  const currTokens = current.split(/\s+/);
  const max = Math.min(prevTokens.length, currTokens.length, 80);
  for (let size = max; size >= 1; size -= 1) {
    const prevSuffix = prevTokens.slice(-size).join(' ');
    const currPrefix = currTokens.slice(0, size).join(' ');
    if (prevSuffix === currPrefix) {
      return currTokens.slice(size).join(' ').trim();
    }
  }
  return current;
}

function normalizeCaptionCues(cues, videoId) {
  const segments = [];
  let previousRaw = '';
  for (const cue of cues) {
    const rawText = cleanCaptionText(cue.text);
    if (!rawText) continue;
    const appended = appendWithoutRollingOverlap(previousRaw, rawText);
    previousRaw = rawText;
    if (!appended) continue;
    const startSeconds = Math.max(0, Number(cue.startSeconds) || 0);
    const endSeconds = Math.max(startSeconds, Number(cue.endSeconds) || startSeconds);
    segments.push({
      index: segments.length,
      startSeconds,
      endSeconds,
      startTimestamp: formatTimestamp(startSeconds),
      endTimestamp: formatTimestamp(endSeconds),
      text: appended,
      sourceUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(startSeconds)}s` : undefined,
    });
  }
  return segments;
}

function parseVtt(vtt, videoId = '') {
  const lines = String(vtt ?? '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const cues = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line.startsWith('WEBVTT') || /^(NOTE|STYLE|REGION|Kind:|Language:)/.test(line)) {
      i += 1;
      continue;
    }

    let timestampLine = line;
    if (!timestampLine.includes('-->') && i + 1 < lines.length && lines[i + 1].includes('-->')) {
      i += 1;
      timestampLine = lines[i].trim();
    }
    if (!timestampLine.includes('-->')) {
      i += 1;
      continue;
    }

    const [startRaw, endAndSettings] = timestampLine.split('-->').map((part) => part.trim());
    const endRaw = endAndSettings.split(/\s+/)[0];
    const startSeconds = parseTimestamp(startRaw);
    const endSeconds = parseTimestamp(endRaw);
    i += 1;

    const textLines = [];
    while (i < lines.length && lines[i].trim() !== '') {
      if (lines[i].includes('-->')) break;
      textLines.push(lines[i]);
      i += 1;
    }
    if (startSeconds != null && endSeconds != null) {
      cues.push({ startSeconds, endSeconds, text: textLines.join(' ') });
    }
  }
  return normalizeCaptionCues(cues, videoId);
}

function parseJson3(json, videoId = '') {
  try {
    const data = JSON.parse(json);
    const cues = [];
    for (const event of data.events ?? []) {
      const text = (event.segs ?? []).map((s) => s.utf8 ?? '').join('');
      if (!cleanCaptionText(text)) continue;
      const startSeconds = Number(event.tStartMs ?? 0) / 1000;
      const durationSeconds = Number(event.dDurationMs ?? 0) / 1000;
      cues.push({
        startSeconds,
        endSeconds: startSeconds + Math.max(0, durationSeconds),
        text,
      });
    }
    return normalizeCaptionCues(cues, videoId);
  } catch {
    return [];
  }
}

function buildTranscriptChunks(segments, targetChars = DEFAULT_TRANSCRIPT_CHUNK_CHARS) {
  const limit = Math.max(1000, Number(targetChars) || DEFAULT_TRANSCRIPT_CHUNK_CHARS);
  const chunks = [];
  let current = [];
  let currentChars = 0;

  const flush = () => {
    if (current.length === 0) return;
    const text = current.map((segment) => segment.text).join(' ').replace(/\s+/g, ' ').trim();
    const first = current[0];
    const last = current[current.length - 1];
    chunks.push({
      index: chunks.length,
      segmentStartIndex: first.index,
      segmentEndIndex: last.index,
      startSeconds: first.startSeconds,
      endSeconds: last.endSeconds,
      startTimestamp: first.startTimestamp,
      endTimestamp: last.endTimestamp,
      text,
      charCount: text.length,
      sourceUrl: first.sourceUrl,
    });
    current = [];
    currentChars = 0;
  };

  for (const segment of segments) {
    const addedChars = segment.text.length + (current.length > 0 ? 1 : 0);
    if (current.length > 0 && currentChars + addedChars > limit) flush();
    current.push(segment);
    currentChars += addedChars;
  }
  flush();
  return chunks;
}

function transcriptPayload({ videoId, segments, languageCode, source, captionFile, chunkChars }) {
  const text = segments.map((segment) => segment.text).join(' ').replace(/\s+/g, ' ').trim();
  const chunks = buildTranscriptChunks(segments, chunkChars);
  const durationCoveredSeconds = segments.length > 0 ? segments[segments.length - 1].endSeconds : 0;
  return {
    videoId,
    available: true,
    text,
    segments,
    chunks,
    languageCode,
    source,
    provenance: {
      provider: 'yt-dlp',
      captionType: source,
      captionFile,
      fetchedAt: new Date().toISOString(),
    },
    charCount: text.length,
    wordCount: text ? text.split(/\s+/).length : 0,
    segmentCount: segments.length,
    chunkCount: chunks.length,
    chunkTargetChars: Math.max(1000, Number(chunkChars) || DEFAULT_TRANSCRIPT_CHUNK_CHARS),
    durationCoveredSeconds,
    sha256: createHash('sha256').update(text).digest('hex'),
    truncated: false,
  };
}

function ytDlpAvailable() {
  const which = spawnSync('sh', ['-c', 'command -v yt-dlp'], { encoding: 'utf8' });
  return which.status === 0 && Boolean(which.stdout.trim());
}

function languageExpression(langs) {
  const expanded = [];
  for (const lang of langs) {
    if (!lang) continue;
    expanded.push(lang);
    if (!lang.includes('*')) expanded.push(`${lang}.*`);
  }
  return [...new Set(expanded)].join(',');
}

function subtitleLanguageFromFile(filename, videoId) {
  const prefix = `${videoId}.`;
  const suffix = filename.endsWith('.json3') ? '.json3' : '.vtt';
  if (!filename.startsWith(prefix) || !filename.endsWith(suffix)) return undefined;
  return filename.slice(prefix.length, -suffix.length);
}

function languageScore(languageCode, langs) {
  const code = String(languageCode ?? '').toLowerCase();
  for (let i = 0; i < langs.length; i += 1) {
    const preferred = String(langs[i]).toLowerCase();
    if (code === preferred) return i * 2;
    if (code.startsWith(`${preferred}-`) || code.startsWith(`${preferred}.`)) return (i * 2) + 1;
  }
  return 999;
}

function downloadSubtitle(videoId, langs, source, parentTmp) {
  const dir = join(parentTmp, source);
  mkdirSync(dir, { recursive: true });
  const writeFlag = source === 'manual' ? '--write-subs' : '--write-auto-subs';
  const ytArgs = [
    '--skip-download',
    writeFlag,
    '--sub-langs', languageExpression(langs),
    '--sub-format', 'vtt',
    '--no-warnings',
    '-o', join(dir, '%(id)s.%(ext)s'),
    `https://www.youtube.com/watch?v=${videoId}`,
  ];
  const result = spawnSync('yt-dlp', ytArgs, { encoding: 'utf8', timeout: 120_000 });
  const files = readdirSync(dir).filter((f) => /\.(vtt|json3)$/.test(f));
  if (files.length === 0) {
    const error = (result.stderr ?? '')
      .split('\n')
      .filter((line) => line.startsWith('ERROR:'))
      .join(' ')
      .slice(0, 500)
      .trim();
    return { source, files: [], error };
  }
  const ranked = files
    .map((file) => ({
      file,
      languageCode: subtitleLanguageFromFile(file, videoId),
    }))
    .sort((a, b) => languageScore(a.languageCode, langs) - languageScore(b.languageCode, langs));
  return { source, dir, files: ranked, error: '' };
}

async function cmdTranscript(args) {
  const input = args._[0];
  if (!input) throw new Error('transcript: videoId or URL required');
  const videoId = extractVideoId(input);
  if (!videoId) throw new Error(`transcript: could not extract videoId from "${input}"`);
  const langs = String(args.lang ?? 'ko,en').split(',').map((s) => s.trim()).filter(Boolean);
  const chunkChars = Number(args['chunk-chars'] ?? args['max-chars'] ?? DEFAULT_TRANSCRIPT_CHUNK_CHARS);
  const fail = (note) => ({ videoId, available: false, skipped: true, note });

  if (!ytDlpAvailable()) {
    return fail('yt-dlp not installed — install with: brew install yt-dlp (macOS) or pipx install yt-dlp');
  }

  const tmp = mkdtempSync(join(tmpdir(), 'yt-transcript-'));
  try {
    // Manual captions first. Only if absent, try auto-generated captions.
    const manual = downloadSubtitle(videoId, langs, 'manual', tmp);
    const selectedSource = manual.files.length > 0 ? manual : downloadSubtitle(videoId, langs, 'auto', tmp);
    if (selectedSource.files.length === 0) {
      return fail(selectedSource.error || manual.error || 'no captions available for this video');
    }

    for (const candidate of selectedSource.files) {
      const path = join(selectedSource.dir, candidate.file);
      const raw = readFileSync(path, 'utf8');
      const segments = candidate.file.endsWith('.json3')
        ? parseJson3(raw, videoId)
        : parseVtt(raw, videoId);
      if (segments.length === 0) continue;
      return transcriptPayload({
        videoId,
        segments,
        languageCode: candidate.languageCode,
        source: selectedSource.source,
        captionFile: candidate.file,
        chunkChars,
      });
    }
    return fail('empty transcript');
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

async function cmdTranscripts(args) {
  const inputsCsv = args._[0];
  if (!inputsCsv) throw new Error('transcripts: videoId(s) or URL(s) required (comma-separated)');
  const inputs = inputsCsv.split(',').map((s) => s.trim()).filter(Boolean);
  const transcripts = [];
  const skipped = [];
  const savedFiles = [];
  const outputDir = args['output-dir'] ? resolve(String(args['output-dir'])) : null;
  if (outputDir) mkdirSync(outputDir, { recursive: true });

  // Sequential by design: avoids spawning many yt-dlp processes and triggering throttling.
  for (const input of inputs) {
    const result = await cmdTranscript({
      _: [input],
      lang: args.lang,
      'chunk-chars': args['chunk-chars'] ?? args['max-chars'],
    });
    if (result.available) {
      if (outputDir) {
        const outputPath = join(outputDir, `${result.videoId}.transcript.json`);
        writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
        savedFiles.push({
          videoId: result.videoId,
          outputPath,
          charCount: result.charCount,
          segmentCount: result.segmentCount,
          chunkCount: result.chunkCount,
          languageCode: result.languageCode,
          source: result.source,
          sha256: result.sha256,
        });
      } else {
        transcripts.push(result);
      }
    } else {
      skipped.push({ videoId: result.videoId, note: result.note });
    }
  }

  const summary = {
    requestedCount: inputs.length,
    availableCount: outputDir ? savedFiles.length : transcripts.length,
    skippedCount: skipped.length,
    ...(outputDir ? { files: savedFiles } : { transcripts }),
    skipped,
    fetchedAt: new Date().toISOString(),
  };

  if (outputDir) {
    const manifestPath = join(outputDir, 'manifest.json');
    writeFileSync(manifestPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    return { ...summary, manifestPath };
  }
  return summary;
}

// ── ingest — stats + comments + full timestamped transcript ─────────────────

async function cmdIngest(args) {
  const input = args._[0];
  if (!input) throw new Error('ingest: URL or videoId required');
  const videoId = extractVideoId(input);
  if (!videoId) throw new Error(`ingest: could not extract videoId from "${input}"`);

  const commentCount = Number(args.comments ?? 15);
  const transcriptLang = String(args.lang ?? 'ko,en');
  const chunkChars = Number(args['chunk-chars'] ?? args['transcript-chars'] ?? DEFAULT_TRANSCRIPT_CHUNK_CHARS);

  const [statsArr, comments, transcript] = await Promise.all([
    cmdStats({ _: [videoId] }),
    cmdComments({ _: [videoId], max: commentCount }),
    cmdTranscript({ _: [videoId], lang: transcriptLang, 'chunk-chars': chunkChars }),
  ]);

  const result = {
    videoId,
    url: `https://youtu.be/${videoId}`,
    meta: statsArr[0] ?? null,
    comments,
    transcript,
    researchEligible: Boolean(transcript.available),
    fetchedAt: new Date().toISOString(),
  };

  if (args.output) {
    const outputPath = resolve(String(args.output));
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    return {
      videoId,
      researchEligible: result.researchEligible,
      outputPath,
      transcriptAvailable: transcript.available,
      transcriptCharCount: transcript.charCount ?? 0,
      transcriptSegmentCount: transcript.segmentCount ?? 0,
      transcriptChunkCount: transcript.chunkCount ?? 0,
      fetchedAt: result.fetchedAt,
    };
  }
  return result;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        args[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args[a.slice(2)] = argv[i + 1];
        i += 1;
      } else {
        args[a.slice(2)] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

const COMMANDS = {
  search: cmdSearch,
  stats: cmdStats,
  transcript: cmdTranscript,
  transcripts: cmdTranscripts,
  comments: cmdComments,
  'channel-search': cmdChannelSearch,
  'channel-stats': cmdChannelStats,
  'channel-top': cmdChannelTop,
  ingest: cmdIngest,
};

async function main() {
  const [,, cmd, ...rest] = process.argv;
  if (!cmd || !COMMANDS[cmd]) {
    process.stderr.write(`Usage: node youtube.mjs <${Object.keys(COMMANDS).join('|')}> [args] [--flags]\n`);
    process.exit(1);
  }
  try {
    const parsed = parseArgs(rest);
    const result = await COMMANDS[cmd](parsed);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

export {
  appendWithoutRollingOverlap,
  buildTranscriptChunks,
  cleanCaptionText,
  extractVideoId,
  formatTimestamp,
  normalizeCaptionCues,
  parseJson3,
  parseTimestamp,
  parseVtt,
  transcriptPayload,
};

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) await main();
