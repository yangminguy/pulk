import { ReportingClient, parseReachReport, REACH_REPORT_TYPE } from '../reporting/client.js';
import type { FetchLike } from '../token.js';
import type { YouTubeCredentials } from '../credentials.js';

const CREDS: YouTubeCredentials = {
  project_id: 'test-project',
  api_key: 'TEST_API_KEY',
  oauth: {
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    refresh_token: 'test-refresh-token',
    token_uri: 'https://oauth2.googleapis.com/token',
    scopes: ['yt-analytics.readonly'],
  },
  channel: { title: 'test channel', owner: 'test@example.com' },
};

const TOKEN_RESPONSE = { access_token: 'token-1', expires_in: 3600 };

interface Handled {
  ok?: boolean;
  status?: number;
  body?: unknown;
  text?: string;
}

function makeFetch(handler: (url: string) => Handled) {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return {
        ok: true,
        status: 200,
        json: async () => TOKEN_RESPONSE,
        text: async () => JSON.stringify(TOKEN_RESPONSE),
      };
    }
    urls.push(url);
    const r = handler(url);
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.body ?? {},
      text: async () => r.text ?? JSON.stringify(r.body ?? {}),
    };
  };
  return { fetchImpl, urls };
}

describe('parseReachReport', () => {
  it('공식 스키마 컬럼(video_id, date, impressions)을 영상별 행으로 매핑', () => {
    const csv = [
      'date,video_id,impressions,impression_clicks',
      '20260609,vid-1,1000,90',
      '20260609,vid-2,500,25',
    ].join('\n');
    const rows = parseReachReport(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].video_id).toBe('vid-1');
    expect(rows[0].date).toBe('20260609');
    expect(rows[0].impressions).toBe(1000);
    // CTR 직접 컬럼 없음 → clicks/impressions로 계산.
    expect(rows[0].impression_ctr).toBeCloseTo(0.09);
    expect(rows[1].impression_ctr).toBeCloseTo(0.05);
  });

  it('CTR 직접 컬럼이 있으면 그대로 사용', () => {
    const csv = ['video_id,date,impressions,card_click_rate', 'vid-1,20260609,1000,0.12'].join('\n');
    const rows = parseReachReport(csv);
    expect(rows[0].impression_ctr).toBeCloseTo(0.12);
  });

  it('노출/클릭 둘 다 없으면 CTR null', () => {
    const csv = ['video_id,date,impressions', 'vid-1,20260609,'].join('\n');
    const rows = parseReachReport(csv);
    expect(rows[0].impressions).toBeNull();
    expect(rows[0].impression_ctr).toBeNull();
  });

  it('헤더만 있거나 빈 CSV면 빈 배열', () => {
    expect(parseReachReport('')).toEqual([]);
    expect(parseReachReport('video_id,date,impressions')).toEqual([]);
  });
});

describe('ReportingClient.listJobs / listReports', () => {
  it('listJobs는 jobs 배열을 반환', async () => {
    const { fetchImpl, urls } = makeFetch(() => ({
      body: { jobs: [{ id: 'job-1', reportTypeId: REACH_REPORT_TYPE }] },
    }));
    const client = new ReportingClient(CREDS, fetchImpl);
    const jobs = await client.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe('job-1');
    expect(urls[0]).toBe('https://youtubereporting.googleapis.com/v1/jobs');
  });

  it('listReports는 createdAfter를 쿼리에 붙인다', async () => {
    const { fetchImpl, urls } = makeFetch(() => ({ body: { reports: [] } }));
    const client = new ReportingClient(CREDS, fetchImpl);
    await client.listReports('job-1', { createdAfter: '2026-06-01T00:00:00Z' });
    expect(decodeURIComponent(urls[0])).toContain('/jobs/job-1/reports');
    expect(decodeURIComponent(urls[0])).toContain('createdAfter=2026-06-01T00:00:00Z');
  });
});

describe('ReportingClient.collectImpressionsCtr', () => {
  it('리포트 없음 → 빈 결과 + 대기중 사유(실패 아님)', async () => {
    const { fetchImpl } = makeFetch((url) => {
      if (url.endsWith('/jobs')) return { body: { jobs: [{ id: 'job-1', reportTypeId: REACH_REPORT_TYPE }] } };
      return { body: { reports: [] } };
    });
    const client = new ReportingClient(CREDS, fetchImpl);
    const result = await client.collectImpressionsCtr(['vid-1']);
    expect(result.byVideo).toEqual({});
    expect(result.reportId).toBeNull();
    expect(result.note).toContain('대기중');
  });

  it('job 미등록 → 빈 결과 + 미등록 사유', async () => {
    const { fetchImpl } = makeFetch(() => ({ body: { jobs: [] } }));
    const client = new ReportingClient(CREDS, fetchImpl);
    const result = await client.collectImpressionsCtr(['vid-1']);
    expect(result.reportId).toBeNull();
    expect(result.note).toContain('미등록');
  });

  it('리포트 있음 → CSV 다운로드·파싱해 영상별 노출/CTR 반환', async () => {
    const csv = [
      'date,video_id,impressions,impression_clicks',
      '20260608,vid-1,800,40',
      '20260609,vid-1,1000,90',
      '20260609,vid-2,500,25',
    ].join('\n');
    const { fetchImpl } = makeFetch((url) => {
      if (url.endsWith('/jobs')) return { body: { jobs: [{ id: 'job-1', reportTypeId: REACH_REPORT_TYPE }] } };
      if (url.includes('/reports'))
        return {
          body: {
            reports: [
              { id: 'r-1', jobId: 'job-1', createTime: '2026-06-09T01:00:00Z', downloadUrl: 'https://dl/r1' },
            ],
          },
        };
      return { text: csv }; // downloadUrl
    });
    const client = new ReportingClient(CREDS, fetchImpl);
    const result = await client.collectImpressionsCtr(['vid-1', 'vid-2']);
    expect(result.reportId).toBe('r-1');
    // vid-1은 날짜 최대(20260609) 행으로 집계.
    expect(result.byVideo['vid-1'].impressions).toBe(1000);
    expect(result.byVideo['vid-1'].impressionCtr).toBeCloseTo(0.09);
    expect(result.byVideo['vid-2'].impressions).toBe(500);
    expect(result.note).toBeUndefined();
  });

  it('요청 영상 일부 미포함 → note에 누락 기록', async () => {
    const csv = ['video_id,date,impressions,impression_clicks', 'vid-1,20260609,1000,90'].join('\n');
    const { fetchImpl } = makeFetch((url) => {
      if (url.endsWith('/jobs')) return { body: { jobs: [{ id: 'job-1', reportTypeId: REACH_REPORT_TYPE }] } };
      if (url.includes('/reports'))
        return { body: { reports: [{ id: 'r-1', jobId: 'job-1', createTime: '2026-06-09T01:00:00Z', downloadUrl: 'https://dl/r1' }] } };
      return { text: csv };
    });
    const client = new ReportingClient(CREDS, fetchImpl);
    const result = await client.collectImpressionsCtr(['vid-1', 'vid-missing']);
    expect(result.byVideo['vid-1']).toBeDefined();
    expect(result.note).toContain('vid-missing');
  });
});
