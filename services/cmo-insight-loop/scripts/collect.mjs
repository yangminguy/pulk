// CMO Insight Loop — Step 1: 수집.
// 키워드 검색 → 최근 고성과 영상 5개 선정(중복/쇼츠 제외) → 메타+썸네일+자막(도입부) 저장.
//
// Usage: node scripts/collect.mjs [--date YYYY-MM-DD] [--dry]
// Output: data/runs/<date>/collected.json, data/runs/<date>/thumbs/<videoId>.jpg
// Side effect: data/history.json에 선정된 videoId 추가(재분석 방지).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  loadCredentials,
  YouTubeClient,
  fetchTranscript,
} from '../../youtube/dist/index.js';
import { pickBestThumbnailUrl } from '../../youtube/dist/thumbnail-reference.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));
const HISTORY_PATH = join(ROOT, 'data', 'history.json');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}
const DRY = process.argv.includes('--dry');

function todayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return { analyzed: [] };
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, 'utf8'));
  } catch {
    return { analyzed: [] };
  }
}

/** timedtext가 빈 본문을 줄 때 폴백 — youtube_transcript_api (사용자 Mac python3에 설치돼 있음). */
function pythonTranscript(videoId, maxChars) {
  const py = `
import sys, warnings
warnings.filterwarnings('ignore')
from youtube_transcript_api import YouTubeTranscriptApi
try:
    t = YouTubeTranscriptApi().fetch('${videoId}', languages=['ko','en'])
    sys.stdout.write(' '.join(s.text for s in t)[:${maxChars}])
except Exception as e:
    sys.stderr.write(str(e)[:200])
    sys.exit(1)
`;
  try {
    return execFileSync('python3', ['-c', py], { encoding: 'utf8', timeout: 60_000 });
  } catch {
    return '';
  }
}

async function main() {
  const date = arg('date', todayKST());
  const creds = loadCredentials(resolve(ROOT, '..', 'youtube', '.credentials.json'));
  const client = new YouTubeClient(creds);
  const history = loadHistory();
  const seen = new Set(history.analyzed.map((e) => e.videoId ?? e));

  const publishedAfter = new Date(Date.now() - CONFIG.recentDays * 86400_000).toISOString();

  // 1) 키워드별 검색 → 후보 풀
  const pool = new Map(); // videoId -> { search, keyword }
  for (const keyword of CONFIG.keywords) {
    try {
      const results = await client.searchVideos(keyword, {
        maxResults: 15,
        order: 'viewCount',
        publishedAfter,
        regionCode: CONFIG.regionCode,
        relevanceLanguage: CONFIG.relevanceLanguage,
      });
      for (const r of results) {
        if (!seen.has(r.videoId) && !pool.has(r.videoId)) {
          pool.set(r.videoId, { search: r, keyword });
        }
      }
    } catch (e) {
      console.error(`[warn] search failed for "${keyword}": ${e.message}`);
    }
  }
  if (pool.size === 0) throw new Error('후보 영상이 0개 — 키워드/기간을 넓혀야 함');

  const ids = [...pool.keys()];

  // 2) 쇼츠 제외 + 통계 결합
  const durations = await client.getVideoDurations(ids);
  const durMap = new Map(durations.map((d) => [d.videoId, d]));
  const stats = await client.getVideoStats(ids);
  const statMap = new Map(stats.map((s) => [s.videoId, s]));

  let candidates = ids
    .map((id) => ({ id, ...pool.get(id), dur: durMap.get(id), stat: statMap.get(id) }))
    .filter((c) => c.stat && c.dur)
    .filter((c) => !(CONFIG.excludeShorts && c.dur.isShort))
    .filter((c) => !CONFIG.requireKorean || /[가-힣]/.test(c.stat.title))
    .filter((c) => c.stat.viewCount >= CONFIG.minViews);

  // minViews로 5개가 안 나오면 기준 완화
  if (candidates.length < CONFIG.videosPerDay) {
    candidates = ids
      .map((id) => ({ id, ...pool.get(id), dur: durMap.get(id), stat: statMap.get(id) }))
      .filter((c) => c.stat && c.dur && !(CONFIG.excludeShorts && c.dur.isShort))
      .filter((c) => !CONFIG.requireKorean || /[가-힣]/.test(c.stat.title));
  }

  // 3) 채널 구독자 수(작은 채널의 떡상 = 썸네일/제목 힘 → 분석 가치 큼)
  const channelIds = [...new Set(candidates.map((c) => c.stat.channelId))];
  let chMap = new Map();
  try {
    const chStats = await client.getChannelStats(channelIds);
    chMap = new Map(chStats.map((c) => [c.channelId, c]));
  } catch (e) {
    console.error(`[warn] channel stats failed: ${e.message}`);
  }

  // 4) 정렬: 조회수 desc, 채널당 maxPerChannel 제한 → 상위 N
  candidates.sort((a, b) => b.stat.viewCount - a.stat.viewCount);
  const perChannel = new Map();
  const picked = [];
  for (const c of candidates) {
    const n = perChannel.get(c.stat.channelId) ?? 0;
    if (n >= CONFIG.maxPerChannel) continue;
    perChannel.set(c.stat.channelId, n + 1);
    picked.push(c);
    if (picked.length >= CONFIG.videosPerDay) break;
  }

  // 5) 자막 + 썸네일 다운로드
  const runDir = join(ROOT, 'data', 'runs', date);
  const thumbDir = join(runDir, 'thumbs');
  mkdirSync(thumbDir, { recursive: true });

  const videos = [];
  for (const c of picked) {
    const t = await fetchTranscript(c.id, fetch, { maxChars: CONFIG.bodyChars + 2000 });
    let text = t.available ? t.text : '';
    let transcriptSource = t.available ? 'timedtext' : null;
    if (!text) {
      text = pythonTranscript(c.id, CONFIG.bodyChars + 2000);
      if (text) transcriptSource = 'youtube_transcript_api';
    }

    let thumbFile = null;
    const thumbUrl = pickBestThumbnailUrl(c.search.thumbnails);
    if (thumbUrl) {
      try {
        // maxresdefault 우선 시도(검색 snippet엔 high까지만 옴)
        let res = await fetch(`https://i.ytimg.com/vi/${c.id}/maxresdefault.jpg`);
        if (!res.ok) res = await fetch(thumbUrl);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          thumbFile = join('thumbs', `${c.id}.jpg`);
          writeFileSync(join(runDir, thumbFile), buf);
        }
      } catch (e) {
        console.error(`[warn] thumbnail failed ${c.id}: ${e.message}`);
      }
    }

    const ch = chMap.get(c.stat.channelId);
    videos.push({
      videoId: c.id,
      url: `https://www.youtube.com/watch?v=${c.id}`,
      title: c.stat.title,
      channelTitle: c.stat.channelTitle,
      subscriberCount: ch?.subscriberCount ?? null,
      avgViewsPerVideo: ch?.avgViewsPerVideo ?? null,
      viewCount: c.stat.viewCount,
      likeCount: c.stat.likeCount,
      commentCount: c.stat.commentCount,
      publishedAt: c.dur.publishedAt,
      durationSeconds: c.dur.durationSeconds,
      keyword: c.keyword,
      thumbnailFile: thumbFile,
      transcript: {
        available: text.length > 0,
        source: transcriptSource,
        note: t.note ?? null,
        intro: text.slice(0, CONFIG.introChars),
        body: text.slice(0, CONFIG.bodyChars),
        totalChars: text.length,
      },
    });
    console.error(`[ok] ${c.id} ${c.stat.viewCount.toLocaleString()}회 — ${c.stat.title}`);
  }

  const out = {
    date,
    generatedAt: new Date().toISOString(),
    keywords: CONFIG.keywords,
    poolSize: pool.size,
    videos,
  };
  writeFileSync(join(runDir, 'collected.json'), JSON.stringify(out, null, 2));

  if (!DRY) {
    history.analyzed.push(
      ...videos.map((v) => ({ videoId: v.videoId, date, title: v.title })),
    );
    writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  }
  console.log(JSON.stringify({ ok: true, date, count: videos.length, runDir }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
