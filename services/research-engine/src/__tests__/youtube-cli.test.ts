import { YouTubeCliAdapter, type ExecFileFn } from '../adapters/youtube-cli';

const VENDOR = '/abs/vendor/youtube.mjs';

function makeExec(responder: (cmd: string, args: string[]) => unknown) {
  const calls: { file: string; args: string[] }[] = [];
  const exec: ExecFileFn = async (file, args) => {
    calls.push({ file, args });
    const cmd = args[1]; // args[0] = vendorPath, args[1] = command
    return { stdout: JSON.stringify(responder(cmd, args)), stderr: '' };
  };
  return { exec, calls };
}

describe('YouTubeCliAdapter.search', () => {
  it('maps hits and passes region/lang/max flags', async () => {
    const { exec, calls } = makeExec(() => [
      {
        videoId: 'abc12345678',
        title: 'T',
        channelTitle: 'CH',
        channelId: 'ch1',
        publishedAt: '2026-01-01T00:00:00Z',
        description: 'D',
        thumbnail: 'http://x',
        liveBroadcastContent: 'none',
      },
    ]);
    const yt = new YouTubeCliAdapter({ vendorPath: VENDOR, exec });
    const hits = await yt.search({ q: '콘텐츠', market: 'KR', lang: 'ko', max: 25, order: 'relevance' });
    expect(hits).toHaveLength(1);
    expect(hits[0].videoId).toBe('abc12345678');
    const args = calls[0].args;
    expect(args[0]).toBe(VENDOR);
    expect(args[1]).toBe('search');
    expect(args).toContain('콘텐츠');
    expect(args).toContain('--max=25');
    expect(args).toContain('--region=KR');
    expect(args).toContain('--lang=ko');
  });

  it('uses US region for US market', async () => {
    const { exec, calls } = makeExec(() => []);
    const yt = new YouTubeCliAdapter({ vendorPath: VENDOR, exec });
    await yt.search({ q: 'x', market: 'US', lang: 'en', max: 40 });
    expect(calls[0].args).toContain('--region=US');
    expect(calls[0].args).toContain('--lang=en');
  });
});

describe('YouTubeCliAdapter.stats / channelStats', () => {
  it('batches ids as csv and coerces numbers', async () => {
    const { exec, calls } = makeExec((cmd) => {
      if (cmd === 'stats') {
        return [{ videoId: 'v1', viewCount: '123', durationSeconds: 300, captionsAvailable: true }];
      }
      return [];
    });
    const yt = new YouTubeCliAdapter({ vendorPath: VENDOR, exec });
    const s = await yt.stats(['v1', 'v2']);
    expect(calls[0].args).toEqual([VENDOR, 'stats', 'v1,v2']);
    expect(s[0].viewCount).toBe(123);
    expect(s[0].durationSeconds).toBe(300);
    expect(s[0].captionsAvailable).toBe(true);
  });

  it('channelStats maps country + subscriberCount', async () => {
    const { exec, calls } = makeExec(() => [
      { channelId: 'ch1', country: 'KR', subscriberCount: '5000' },
    ]);
    const yt = new YouTubeCliAdapter({ vendorPath: VENDOR, exec });
    const c = await yt.channelStats(['ch1']);
    expect(calls[0].args).toEqual([VENDOR, 'channel-stats', 'ch1']);
    expect(c[0].country).toBe('KR');
    expect(c[0].subscriberCount).toBe(5000);
  });
});

describe('YouTubeCliAdapter.fetchTranscript', () => {
  it('passes through an available transcript verbatim (extra fields kept)', async () => {
    const payload = {
      videoId: 'v1',
      available: true,
      text: 'hello world',
      segments: [{ index: 0, startSeconds: 0, endSeconds: 2, startTimestamp: '00:00:00', endTimestamp: '00:00:02', text: 'hello world', sourceUrl: 'u' }],
      chunks: [{ index: 0, segmentStartIndex: 0, segmentEndIndex: 0, startTimestamp: '00:00:00', endTimestamp: '00:00:02', text: 'hello world', charCount: 11, sourceUrl: 'u', startSeconds: 0, endSeconds: 2 }],
      languageCode: 'ko',
      source: 'manual',
      charCount: 11,
      sha256: 'deadbeef',
      truncated: false,
      chunkTargetChars: 7000,
    };
    const { exec, calls } = makeExec(() => payload);
    const yt = new YouTubeCliAdapter({ vendorPath: VENDOR, exec });
    const r = await yt.fetchTranscript('v1', { langs: ['ko', 'en'], chunkChars: 7000 });
    expect(r.available).toBe(true);
    if (r.available) {
      expect(r.sha256).toBe('deadbeef');
      expect(r.source).toBe('manual');
      // extra skill field survives (verbatim persistence, spec §6)
      expect((r as unknown as { chunkTargetChars: number }).chunkTargetChars).toBe(7000);
    }
    const args = calls[0].args;
    expect(args[1]).toBe('transcript');
    expect(args).toContain('--lang=ko,en');
    expect(args).toContain('--chunk-chars=7000');
  });

  it('maps {available:false} to a SkippedTranscript', async () => {
    const { exec } = makeExec(() => ({ videoId: 'v9', available: false, skipped: true, note: 'no captions' }));
    const yt = new YouTubeCliAdapter({ vendorPath: VENDOR, exec });
    const r = await yt.fetchTranscript('v9');
    expect(r.available).toBe(false);
    if (!r.available) {
      expect(r.skipped).toBe(true);
      expect(r.note).toMatch(/no captions/);
    }
  });

  it('NEVER passes any Whisper/ASR/audio arguments (caption-only)', async () => {
    const seen: string[] = [];
    const exec: ExecFileFn = async (file, args) => {
      seen.push(file, ...args);
      return { stdout: JSON.stringify({ videoId: 'v1', available: false, skipped: true, note: 'n' }), stderr: '' };
    };
    const yt = new YouTubeCliAdapter({ vendorPath: VENDOR, exec });
    await yt.search({ q: 'x', market: 'KR', lang: 'ko', max: 25 });
    await yt.stats(['v1']);
    await yt.channelStats(['c1']);
    await yt.fetchTranscript('v1');
    const forbidden = /whisper|asr|audio|--extract-audio|transcribe/i;
    for (const token of seen) {
      expect(token).not.toMatch(forbidden);
    }
    // Transcript acquisition uses the single-video caption command only.
    expect(seen).toContain('transcript');
    expect(seen).not.toContain('transcripts'); // no --output-dir batch mode
  });
});
