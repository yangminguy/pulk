import {
  setVideoThumbnail,
  collectThumbnailPeriodMetrics,
} from '../thumbnail-ab';

describe('setVideoThumbnail (D3 승인 게이트)', () => {
  const base = { videoId: 'v1', imageBytes: new Uint8Array([1, 2, 3]), accessToken: 'tok' };

  it('미승인이면 호출 차단(approval_required)', async () => {
    const up = jest.fn();
    const r = await setVideoThumbnail({ ...base, approved: false }, { uploadThumbnail: up });
    expect(r).toEqual({ ok: false, reason: 'approval_required' });
    expect(up).not.toHaveBeenCalled();
  });

  it('승인됐으나 업로더 미주입이면 not_configured', async () => {
    const r = await setVideoThumbnail({ ...base, approved: true });
    expect(r.reason).toBe('not_configured');
  });

  it('승인 + 업로더 주입 시 업로드 호출', async () => {
    const up = jest.fn(async () => ({ ok: true, thumbnailUrl: 'http://t/v1.jpg' }));
    const r = await setVideoThumbnail({ ...base, approved: true }, { uploadThumbnail: up });
    expect(up).toHaveBeenCalledWith(expect.objectContaining({ videoId: 'v1', mimeType: 'image/jpeg' }));
    expect(r).toEqual({ ok: true, thumbnailUrl: 'http://t/v1.jpg' });
  });

  it('업로드 실패 시 upload_failed', async () => {
    const up = jest.fn(async () => ({ ok: false, status: 403 }));
    const r = await setVideoThumbnail({ ...base, approved: true }, { uploadThumbnail: up });
    expect(r.reason).toBe('upload_failed');
  });
});

describe('collectThumbnailPeriodMetrics (기간 성과 매핑)', () => {
  it('Analytics records → AbTestResultInput 호환 shape', async () => {
    const client = {
      getChannelAnalytics: jest.fn(async () => ({
        columnHeaders: [],
        rows: [],
        records: [{ views: 300, estimatedMinutesWatched: 600, averageViewPercentage: 42 }],
      })),
    };
    const m = await collectThumbnailPeriodMetrics(client as any, 'v1', '2026-06-01', '2026-06-03');
    expect(client.getChannelAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ filters: 'video==v1', startDate: '2026-06-01', endDate: '2026-06-03' }),
    );
    expect(m).toMatchObject({
      video_id: 'v1',
      views: 300,
      watch_time_minutes: 600,
      average_view_duration_percentage: 42,
      impressions: null, // 표준 Analytics에 없음
      ctr: null,
    });
  });

  it('impressions/CTR 있으면 매핑(CTR은 %→비율)', async () => {
    const client = {
      getChannelAnalytics: jest.fn(async () => ({
        columnHeaders: [],
        rows: [],
        records: [{ views: 100, estimatedMinutesWatched: 50, averageViewPercentage: 30, impressions: 5000, impressionClickThroughRate: 8 }],
      })),
    };
    const m = await collectThumbnailPeriodMetrics(client as any, 'v1', '2026-06-01', '2026-06-03');
    expect(m.impressions).toBe(5000);
    expect(m.ctr).toBeCloseTo(0.08);
  });
});
