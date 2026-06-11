// CMO 키 콘텐츠 보고서 Step4 — 유튜브 자막(대본) 추출.
//
// 공식 captions.download API는 영상 소유자 OAuth가 필요하므로(타 채널 불가),
// watch 페이지의 ytInitialPlayerResponse.captions에서 자막 트랙 baseUrl을 뽑아
// timedtext XML을 받아 평문으로 환원한다. 자막이 없으면 available=false로 반환(throw 금지).
//
// 순수성: 네트워크 I/O는 주입된 fetch로만. parseTimedTextXml / pickCaptionTrack은 순수함수.

import type { FetchLike } from '../token.js';

export interface TranscriptResult {
  videoId: string;
  available: boolean;
  /** 자막 평문(문장 구분 공백). available=false면 ''. */
  text: string;
  /** 선택된 트랙 언어코드(예: 'ko', 'en', 'a.ko'=자동생성). */
  languageCode?: string;
  /** 진단용 — 트랙이 왜 없었는지/어떤 후보가 있었는지. */
  note?: string;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string; // 'asr' = 자동생성
  name?: string;
}

/** 언어 우선순위로 트랙 1개 선택. ko > en > 첫 트랙. 수동자막 > 자동생성(asr). */
export function pickCaptionTrack(
  tracks: CaptionTrack[],
  preferred: string[] = ['ko', 'en'],
): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const manual = tracks.filter((t) => t.kind !== 'asr');
  const asr = tracks.filter((t) => t.kind === 'asr');
  for (const pool of [manual, asr]) {
    for (const lang of preferred) {
      const hit = pool.find((t) => t.languageCode === lang || t.languageCode.startsWith(`${lang}-`));
      if (hit) return hit;
    }
  }
  return manual[0] ?? asr[0] ?? null;
}

/**
 * ytInitialPlayerResponse JSON에서 captionTracks 추출.
 * `"captionTracks":` 위치부터 `[`~매칭 `]`까지 균형 스캔(비탐욕 정규식은 baseUrl 내부 등에서
 * 조기 종료해 누락됨 — 실측 일부 영상에서 'no caption tracks' 오탐의 원인).
 */
export function extractCaptionTracks(html: string): CaptionTrack[] {
  const key = '"captionTracks":';
  const at = html.indexOf(key);
  if (at < 0) return [];
  const start = html.indexOf('[', at);
  if (start < 0) return [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return [];
  try {
    const raw = JSON.parse(html.slice(start, end + 1)) as Array<{
      baseUrl?: string;
      languageCode?: string;
      kind?: string;
      name?: { simpleText?: string };
    }>;
    return raw
      .filter((t): t is { baseUrl: string; languageCode: string; kind?: string; name?: { simpleText?: string } } =>
        Boolean(t.baseUrl && t.languageCode))
      .map((t) => ({
        baseUrl: t.baseUrl,
        languageCode: t.languageCode,
        kind: t.kind,
        name: t.name?.simpleText,
      }));
  } catch {
    return [];
  }
}

/** timedtext json3({events:[{segs:[{utf8}]}]}) → 평문. */
export function parseTimedTextJson3(json: string): string {
  try {
    const data = JSON.parse(json) as { events?: Array<{ segs?: Array<{ utf8?: string }> }> };
    return (data.events ?? [])
      .map((e) => (e.segs ?? []).map((s) => s.utf8 ?? '').join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

/** timedtext XML(<text ...>...</text>) → 평문. HTML 엔티티 디코드. (json3 폴백용) */
export function parseTimedTextXml(xml: string): string {
  const segments = [...xml.matchAll(/<text[^>]*>(.*?)<\/text>/gs)].map((m) => m[1]);
  return segments
    .map((s) =>
      s
        .replace(/&amp;#39;|&#39;/g, "'")
        .replace(/&amp;quot;|&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join(' ');
}

export interface FetchTranscriptOptions {
  preferredLanguages?: string[];
  /** 평문 최대 길이(LLM 비용 보호). 기본 12000자. */
  maxChars?: number;
}

/**
 * videoId의 자막 평문을 받는다. 실패/부재는 throw하지 않고 available=false로.
 */
export async function fetchTranscript(
  videoId: string,
  fetchImpl: FetchLike,
  options: FetchTranscriptOptions = {},
): Promise<TranscriptResult> {
  const fail = (note: string): TranscriptResult => ({ videoId, available: false, text: '', note });
  let html: string;
  try {
    const res = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}&hl=ko`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko,en;q=0.8' },
    });
    if (!res.ok) return fail(`watch page HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    return fail(`watch fetch error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const tracks = extractCaptionTracks(html);
  if (tracks.length === 0) return fail('no caption tracks');
  const track = pickCaptionTrack(tracks, options.preferredLanguages);
  if (!track) return fail('no usable track');

  // json3 우선(현 YouTube 기본 XML은 <text> 없이 빈 본문이 오는 경우가 있음 — 실측 'empty transcript' 원인).
  const sep = track.baseUrl.includes('?') ? '&' : '?';
  let text = '';
  try {
    const res = await fetchImpl(`${track.baseUrl}${sep}fmt=json3`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) text = parseTimedTextJson3(await res.text());
  } catch {
    /* json3 실패 → XML 폴백 */
  }
  if (!text) {
    try {
      const res = await fetchImpl(track.baseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return fail(`timedtext HTTP ${res.status}`);
      text = parseTimedTextXml(await res.text());
    } catch (e) {
      return fail(`timedtext error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!text) return fail('empty transcript');
  const max = options.maxChars ?? 12000;
  if (text.length > max) text = text.slice(0, max);
  return { videoId, available: true, text, languageCode: track.languageCode };
}
