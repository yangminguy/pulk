// CMO M5 후속 — YouTube Reporting API (벌크 CSV) 노출수·CTR 수집 클라이언트.
//
// 배경: 노출수(impressions)·CTR은 targeted Analytics API가 미지원(M2 실측 확정).
// 별도 Reporting API의 reach report(channel_reach_basic_a1, 2026-01-15 추가)로만 나온다.
// 흐름: ① job 등록(오케스트레이터가 GCP에서 완료) → ② 구글이 일자별 리포트를 비동기
// 생성(보통 다음날부터 백필) → ③ 이 클라이언트로 jobs/reports 조회 후 CSV 다운로드·파싱.
//
// TokenManager(refresh_token→access_token)를 그대로 재사용한다. 모든 요청은 Bearer.
// 리포트가 아직 없으면(비동기 생성 대기) 빈 결과 + 사유로 정상 처리한다(실패 아님).

import type { YouTubeCredentials } from '../credentials.js';
import { TokenManager, type FetchLike } from '../token.js';

const REPORTING_API = 'https://youtubereporting.googleapis.com/v1';

/** 우리가 쓰는 reach report 타입 (오케스트레이터가 이 타입으로 job 생성). */
export const REACH_REPORT_TYPE = 'channel_reach_basic_a1';

// ---- API 응답 형태 (subset) ----

export interface ReportingJob {
  id: string;
  reportTypeId: string;
  name?: string;
  createTime?: string;
}

export interface Report {
  id: string;
  jobId: string;
  startTime?: string;
  endTime?: string;
  createTime?: string;
  downloadUrl: string;
}

interface RawJobsResponse {
  jobs?: ReportingJob[];
}

interface RawReportsResponse {
  reports?: Report[];
  nextPageToken?: string;
}

export interface ListReportsOptions {
  /** RFC3339 ts. 이 시각 이후 생성된 리포트만(createdAfter). */
  createdAfter?: string;
  pageToken?: string;
}

/**
 * channel_reach_basic_a1 CSV 한 행을 영상/날짜 단위로 정규화한 노출/CTR 지표.
 *
 * 실제 컬럼명은 라이브 다운로드로 확인하는 게 원칙이나, 리포트가 비동기 생성 대기로
 * 아직 없을 수 있다. 그 경우 공식 reach report 스키마 기준 컬럼명으로 매핑한다:
 *   - video_id              : 영상 식별자 (채널 합계 행이면 빈 문자열)
 *   - date                  : YYYYMMDD
 *   - impressions           : 썸네일 노출수 (card_impressions 등은 별도 컬럼)
 *   - card_impressions      : 카드 노출수 (참고용, CTR 계산엔 미사용)
 *   - card_click_rate       : (있으면) 카드 클릭률
 * impressions 기반 CTR은 reach report가 직접 CTR 컬럼을 주지 않을 수 있어
 * impressions/clicks가 함께 있으면 클라이언트에서 계산하고, 없으면 null.
 */
export interface ReachReportRow {
  video_id: string;
  date: string;
  impressions: number | null;
  /** 노출 대비 클릭률 0~1. CSV에 직접 컬럼이 있으면 사용, 없고 clicks 있으면 계산, 둘 다 없으면 null. */
  impression_ctr: number | null;
  /** 원본 행(컬럼명→문자열). 디버깅/추가 매핑용. */
  raw: Record<string, string>;
}

/** collectImpressionsCtr 영상별 결과. */
export interface ImpressionsCtrResult {
  /** videoId → {impressions, impressionCtr}. 데이터 있는 영상만 포함. */
  byVideo: Record<string, { impressions: number | null; impressionCtr: number | null }>;
  /** 사용한 리포트 id (없으면 null). */
  reportId: string | null;
  /** 리포트가 없거나 부분 수집이면 사유. 정상(리포트 있고 전부 매핑)이면 undefined. */
  note?: string;
}

export interface CollectImpressionsCtrOptions {
  /** 이 job에서만 리포트 조회. 미지정 시 reach report 타입 job을 자동 선택. */
  jobId?: string;
  /** 이 시각 이후 생성된 리포트만. */
  createdAfter?: string;
}

// ---- 컬럼명 후보 (공식 스키마 기준; 라이브로 확인 시 보정) ----

const VIDEO_ID_KEYS = ['video_id', 'videoId'];
const DATE_KEYS = ['date', 'day'];
const IMPRESSIONS_KEYS = ['impressions', 'card_impressions', 'cardImpressions'];
const CTR_KEYS = ['impression_click_through_rate', 'card_click_rate', 'cardClickRate'];
const CLICKS_KEYS = ['impression_clicks', 'card_clicks', 'clicks'];

function pick(row: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return row[k];
  }
  return undefined;
}

function numOrNull(v: string | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * channel_reach_basic_a1 CSV(헤더 1행 + 데이터)를 영상/날짜별 행으로 파싱한다.
 * 컬럼명은 위 후보 목록으로 유연 매핑(공식 스키마 기준, 라이브 확인 시 보정).
 */
export function parseReachReport(csv: string): ReachReportRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });

    const impressions = numOrNull(pick(row, IMPRESSIONS_KEYS));
    let impression_ctr = numOrNull(pick(row, CTR_KEYS));
    if (impression_ctr == null) {
      const clicks = numOrNull(pick(row, CLICKS_KEYS));
      if (clicks != null && impressions != null && impressions > 0) {
        impression_ctr = clicks / impressions;
      }
    }

    return {
      video_id: pick(row, VIDEO_ID_KEYS) ?? '',
      date: pick(row, DATE_KEYS) ?? '',
      impressions,
      impression_ctr,
      raw: row,
    };
  });
}

/** 단순 CSV 라인 분해(따옴표 감싼 필드 + 이스케이프된 따옴표 지원). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export class ReportingClient {
  private readonly tokens: TokenManager;

  constructor(
    creds: YouTubeCredentials,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    now: () => number = Date.now,
  ) {
    this.tokens = new TokenManager(creds, fetchImpl, now);
  }

  /** GET /v1/jobs — 이 채널에 등록된 reporting job 목록. */
  async listJobs(): Promise<ReportingJob[]> {
    const data = (await this.getJson(`${REPORTING_API}/jobs`)) as RawJobsResponse;
    return data.jobs ?? [];
  }

  /** GET /v1/jobs/{jobId}/reports — 생성된 리포트 목록(createdAfter 필터 지원). */
  async listReports(jobId: string, opts: ListReportsOptions = {}): Promise<Report[]> {
    const params = new URLSearchParams();
    if (opts.createdAfter) params.set('createdAfter', opts.createdAfter);
    if (opts.pageToken) params.set('pageToken', opts.pageToken);
    const qs = params.toString();
    const url = `${REPORTING_API}/jobs/${encodeURIComponent(jobId)}/reports${qs ? `?${qs}` : ''}`;
    const data = (await this.getJson(url)) as RawReportsResponse;
    return data.reports ?? [];
  }

  /** 리포트 CSV 본문 다운로드(Bearer). downloadUrl은 Report.downloadUrl. */
  async downloadReport(downloadUrl: string): Promise<string> {
    const accessToken = await this.tokens.getAccessToken();
    const res = await this.fetchImpl(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Reporting download failed: HTTP ${res.status}`);
    }
    return res.text();
  }

  /**
   * reach report job의 최신 리포트를 받아 지정 영상들의 노출/CTR을 채운다.
   * 리포트가 아직 없으면(비동기 생성 대기) 빈 byVideo + note로 정상 반환(실패 아님).
   */
  async collectImpressionsCtr(
    videoIds: string[],
    opts: CollectImpressionsCtrOptions = {},
  ): Promise<ImpressionsCtrResult> {
    let jobId = opts.jobId;
    if (!jobId) {
      const jobs = await this.listJobs();
      const reach = jobs.find((j) => j.reportTypeId === REACH_REPORT_TYPE);
      if (!reach) {
        return {
          byVideo: {},
          reportId: null,
          note: `reach report job(${REACH_REPORT_TYPE}) 미등록 — GCP에서 job 생성 필요`,
        };
      }
      jobId = reach.id;
    }

    const reports = await this.listReports(jobId, { createdAfter: opts.createdAfter });
    if (reports.length === 0) {
      return {
        byVideo: {},
        reportId: null,
        note: 'job 등록됨, 리포트 생성 대기중 — 구글이 비동기 생성(보통 다음날 백필)',
      };
    }

    // 가장 최근 리포트(createTime 최대) 선택.
    const latest = reports.reduce((a, b) =>
      (a.createTime ?? '') >= (b.createTime ?? '') ? a : b,
    );
    const csv = await this.downloadReport(latest.downloadUrl);
    const rows = parseReachReport(csv);

    // 영상별 최신 행으로 집계(date 최대 행 우선).
    const wanted = new Set(videoIds);
    const byVideo: Record<string, { impressions: number | null; impressionCtr: number | null }> = {};
    const seenDate: Record<string, string> = {};
    for (const r of rows) {
      if (!r.video_id || !wanted.has(r.video_id)) continue;
      if (seenDate[r.video_id] != null && seenDate[r.video_id] >= r.date) continue;
      seenDate[r.video_id] = r.date;
      byVideo[r.video_id] = { impressions: r.impressions, impressionCtr: r.impression_ctr };
    }

    const missing = videoIds.filter((v) => byVideo[v] == null);
    return {
      byVideo,
      reportId: latest.id,
      ...(missing.length > 0
        ? { note: `리포트 수신, 일부 영상 미포함(${missing.length}건): ${missing.join(', ')}` }
        : {}),
    };
  }

  private async getJson(url: string): Promise<unknown> {
    const accessToken = await this.tokens.getAccessToken();
    const res = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const endpoint = url.split('?')[0];
      throw new Error(`Reporting API request failed: HTTP ${res.status} for ${endpoint}`);
    }
    return res.json();
  }
}
