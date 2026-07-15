// youtube-cli adapter — YouTubePort + TranscriptPort backed by the vendored
// youtube-research skill (services/research-engine/vendor/youtube-research/youtube.mjs).
//
// Every method shells out to `node <vendorPath> <cmd> ...` and parses the JSON
// the skill prints on stdout. The skill owns batching (stats/channel-stats chunk
// by 50 internally), caption extraction (manual → auto fallback), chunking and
// sha256 — this adapter is a thin, typed transport.
//
// CAPTION-ONLY: transcript acquisition uses the skill's `transcript` command,
// which is yt-dlp caption download only. There is NO Whisper / ASR / audio
// transcription path anywhere here — asserted by a unit test on the argv.

import { execFile as nodeExecFile } from 'node:child_process';
import type {
  ChannelStats,
  SearchParams,
  TranscriptFetchOptions,
  TranscriptPort,
  VideoStats,
  YouTubePort,
  YouTubeSearchHit,
} from '@l5/core';
import type { Market, Transcript, TranscriptResult } from '@l5/core';

/** Injectable exec seam (tests supply a mock; default wraps node execFile). */
export type ExecFileFn = (
  file: string,
  args: string[],
  options: { cwd?: string; timeout?: number; maxBuffer?: number },
) => Promise<{ stdout: string; stderr: string }>;

const defaultExec: ExecFileFn = (file, args, options) =>
  new Promise((resolve, reject) => {
    nodeExecFile(file, args, options, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`youtube-cli ${args[0] ?? ''} failed: ${err.message}${stderr ? ` — ${String(stderr).slice(0, 400)}` : ''}`));
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });

export interface YouTubeCliOptions {
  /** absolute path to the vendored youtube.mjs. */
  vendorPath: string;
  /** cwd for the child (ancestor walk for services/youtube/.credentials.json). */
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
  /** test seam. */
  exec?: ExecFileFn;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024;

/** market → YouTube Data API regionCode. */
function regionOf(market: Market): string {
  return market === 'US' ? 'US' : 'KR';
}

export class YouTubeCliAdapter implements YouTubePort, TranscriptPort {
  private readonly vendorPath: string;
  private readonly cwd?: string;
  private readonly timeoutMs: number;
  private readonly maxBuffer: number;
  private readonly exec: ExecFileFn;

  constructor(opts: YouTubeCliOptions) {
    this.vendorPath = opts.vendorPath;
    this.cwd = opts.cwd;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBuffer = opts.maxBuffer ?? DEFAULT_MAX_BUFFER;
    this.exec = opts.exec ?? defaultExec;
  }

  private async run(args: string[]): Promise<unknown> {
    const { stdout } = await this.exec('node', [this.vendorPath, ...args], {
      cwd: this.cwd,
      timeout: this.timeoutMs,
      maxBuffer: this.maxBuffer,
    });
    const trimmed = stdout.trim();
    if (!trimmed) throw new Error(`youtube-cli ${args[0] ?? ''} returned empty stdout`);
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`youtube-cli ${args[0] ?? ''} returned invalid JSON: ${(err as Error).message}`);
    }
  }

  async search(params: SearchParams): Promise<YouTubeSearchHit[]> {
    const args = [
      'search',
      params.q,
      `--max=${params.max}`,
      `--order=${params.order ?? 'relevance'}`,
      `--region=${regionOf(params.market)}`,
      `--lang=${params.lang}`,
    ];
    if (params.publishedAfter) args.push(`--published-after=${params.publishedAfter}`);
    const raw = await this.run(args);
    if (!Array.isArray(raw)) return [];
    return raw.map((r): YouTubeSearchHit => {
      const x = r as Record<string, unknown>;
      return {
        videoId: String(x.videoId ?? ''),
        title: String(x.title ?? ''),
        channelTitle: String(x.channelTitle ?? ''),
        channelId: String(x.channelId ?? ''),
        publishedAt: String(x.publishedAt ?? ''),
        description: String(x.description ?? ''),
        thumbnail: x.thumbnail != null ? String(x.thumbnail) : undefined,
        liveBroadcastContent:
          x.liveBroadcastContent != null ? String(x.liveBroadcastContent) : undefined,
      };
    });
  }

  async stats(videoIds: string[]): Promise<VideoStats[]> {
    if (videoIds.length === 0) return [];
    const raw = await this.run(['stats', videoIds.join(',')]);
    if (!Array.isArray(raw)) return [];
    return raw.map((r): VideoStats => {
      const x = r as Record<string, unknown>;
      return {
        videoId: String(x.videoId ?? ''),
        viewCount: numberOr(x.viewCount, 0),
        likeCount: x.likeCount != null ? numberOr(x.likeCount, 0) : undefined,
        commentCount: x.commentCount != null ? numberOr(x.commentCount, 0) : undefined,
        durationSeconds: numberOr(x.durationSeconds, 0),
        isShort: x.isShort != null ? Boolean(x.isShort) : undefined,
        captionsAvailable: x.captionsAvailable != null ? Boolean(x.captionsAvailable) : undefined,
        defaultLanguage: x.defaultLanguage != null ? String(x.defaultLanguage) : undefined,
        defaultAudioLanguage:
          x.defaultAudioLanguage != null ? String(x.defaultAudioLanguage) : undefined,
        tags: Array.isArray(x.tags) ? (x.tags as unknown[]).map(String) : undefined,
      };
    });
  }

  async channelStats(channelIds: string[]): Promise<ChannelStats[]> {
    if (channelIds.length === 0) return [];
    const raw = await this.run(['channel-stats', channelIds.join(',')]);
    if (!Array.isArray(raw)) return [];
    return raw.map((r): ChannelStats => {
      const x = r as Record<string, unknown>;
      return {
        channelId: String(x.channelId ?? ''),
        channelTitle: x.channelTitle != null ? String(x.channelTitle) : undefined,
        country: x.country != null ? String(x.country) : undefined,
        subscriberCount: x.subscriberCount != null ? numberOr(x.subscriberCount, 0) : undefined,
        viewCount: x.viewCount != null ? numberOr(x.viewCount, 0) : undefined,
        videoCount: x.videoCount != null ? numberOr(x.videoCount, 0) : undefined,
      };
    });
  }

  async fetchTranscript(
    videoId: string,
    opts?: TranscriptFetchOptions,
  ): Promise<TranscriptResult> {
    const langs = opts?.langs && opts.langs.length > 0 ? opts.langs : ['ko', 'en'];
    const chunkChars = opts?.chunkChars ?? 7000;
    // Single-video `transcript` command → stdout mode (the fs store persists the
    // raw payload, so we do NOT use `transcripts --output-dir`). Caption-only.
    const args = [
      'transcript',
      videoId,
      `--lang=${langs.join(',')}`,
      `--chunk-chars=${chunkChars}`,
    ];
    const raw = (await this.run(args)) as Record<string, unknown>;

    if (raw.available === false) {
      // Skill's {available:false, skipped:true, note} → domain SkippedTranscript
      // (pipeline records it as SKIPPED_NO_TRANSCRIPT).
      return {
        videoId: String(raw.videoId ?? videoId),
        available: false,
        skipped: true,
        note: String(raw.note ?? 'no captions available'),
      };
    }

    // Pass the skill payload through verbatim (§6: raw stored "스킬 원본 그대로"),
    // normalizing only languageCode which the domain requires to be a string.
    return {
      ...(raw as object),
      videoId: String(raw.videoId ?? videoId),
      languageCode: raw.languageCode != null ? String(raw.languageCode) : '',
    } as Transcript;
  }
}

function numberOr(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
