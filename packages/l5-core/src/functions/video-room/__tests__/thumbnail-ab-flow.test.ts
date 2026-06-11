import {
  proposeThumbnailSet,
  planAbRotation,
  evaluateAbRound,
} from '../thumbnail-ab-flow';
import type { ThumbnailMatrixInput } from '../thumbnail-matrix';
import type { AbTestResultInput } from '../thumbnail-ab-test';

const INPUT: ThumbnailMatrixInput = {
  video_id: 'vid-1',
  title: '광고비 90% 아끼는 자동화',
  main_click_reason: '수작업을 자동화로 바꾸면 시간·비용이 준다',
  target_audience: '1인 마케터',
  target_problem: '광고 운영이 수작업이라 시간이 없다',
  target_desire: '자동화로 결과를 키우고 싶다',
  target_loss_to_avoid: '광고비 낭비',
  reference_patterns: [],
};

describe('thumbnail-ab-flow (PRD 통합 진입점)', () => {
  it('proposeThumbnailSet: 9개 후보 + 9개 심리분석(결정론 폴백)', async () => {
    const r = await proposeThumbnailSet(INPUT);
    expect(r.source).toBe('fallback');
    expect(r.candidates).toHaveLength(9);
    expect(r.analyses).toHaveLength(9);
    // 후보-분석 candidate_id 매칭.
    for (let i = 0; i < 9; i++) {
      expect(r.analyses[i].candidate_id).toBe(r.candidates[i].candidate_id);
    }
    // 9개 서로 다른 클릭 가설.
    expect(new Set(r.candidates.map((c) => c.click_hypothesis)).size).toBe(9);
  });

  it('planAbRotation: 후보당 기간만큼 순차 구간', () => {
    const plan = planAbRotation(['a', 'b', 'c'], 3);
    expect(plan).toHaveLength(3);
    expect(plan[0]).toMatchObject({ thumbnail_candidate_id: 'a', start_offset_day: 0, end_offset_day: 3 });
    expect(plan[2]).toMatchObject({ thumbnail_candidate_id: 'c', start_offset_day: 6, end_offset_day: 9 });
  });

  it('evaluateAbRound: 승자 + 신뢰도', () => {
    const results: AbTestResultInput[] = [
      { thumbnail_candidate_id: 'a', impressions: 6000, ctr: 0.05, views: 300, watch_time_minutes: 600, average_view_duration_percentage: 40 },
      { thumbnail_candidate_id: 'b', impressions: 6000, ctr: 0.08, views: 480, watch_time_minutes: 1100, average_view_duration_percentage: 52 },
      { thumbnail_candidate_id: 'c', impressions: 6000, ctr: 0.04, views: 240, watch_time_minutes: 500, average_view_duration_percentage: 35 },
    ];
    const r = evaluateAbRound(results);
    expect(r.winner?.thumbnail_candidate_id).toBe('b'); // 최고 CTR+watch_time
    expect(['high', 'medium', 'low', 'insufficient']).toContain(r.confidence);
    expect(r.scored.results).toHaveLength(3);
  });

  it('evaluateAbRound: CTR null이어도 동작(재분배)', () => {
    const results: AbTestResultInput[] = [
      { thumbnail_candidate_id: 'a', impressions: 2000, ctr: null, views: 200, watch_time_minutes: 800, average_view_duration_percentage: 50 },
      { thumbnail_candidate_id: 'b', impressions: 2000, ctr: null, views: 120, watch_time_minutes: 400, average_view_duration_percentage: 30 },
    ];
    const r = evaluateAbRound(results);
    expect(r.winner?.thumbnail_candidate_id).toBe('a');
  });
});
