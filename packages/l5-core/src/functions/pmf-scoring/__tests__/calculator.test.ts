import { calculatePmfScore, isToolCandidate } from '../index';
import type { PMFExperimentMetric } from '../../../types/entities';

describe('calculatePmfScore', () => {
  const mockMetrics: PMFExperimentMetric[] = [
    {
      id: 'm1',
      experiment_id: 'exp1',
      metric_name: 'waitlist_conversion',
      metric_value: 0.45,
      signal_level: 4,
      collected_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'm2',
      experiment_id: 'exp1',
      metric_name: 'interview_requests',
      metric_value: 12,
      signal_level: 5,
      collected_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'm3',
      experiment_id: 'exp1',
      metric_name: 'customer_calls',
      metric_value: 8,
      signal_level: 4,
      collected_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  it('should return PMF score result with valid metrics', () => {
    const result = calculatePmfScore(mockMetrics);
    expect(result.pmf_score).toBeGreaterThan(0);
    expect(result.pmf_score).toBeLessThanOrEqual(100);
    expect(['weak', 'medium', 'strong']).toContain(result.signal_strength);
  });

  it('should handle empty metrics', () => {
    const result = calculatePmfScore([]);
    expect(result.pmf_score).toBe(0);
    expect(result.signal_strength).toBe('weak');
    expect(result.evidence_count).toBe(0);
  });

  it('should count evidence correctly', () => {
    const result = calculatePmfScore(mockMetrics);
    expect(result.evidence_count).toBe(3);
  });

  it('should weight strong signals higher', () => {
    const strongMetrics: PMFExperimentMetric[] = [
      {
        id: 'm1',
        experiment_id: 'exp1',
        metric_name: 'revenue_generated',
        metric_value: 5000,
        signal_level: 5,
        collected_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    const result = calculatePmfScore(strongMetrics);
    expect(result.pmf_score).toBeGreaterThan(50);
  });

  it('should generate appropriate recommendation', () => {
    const result = calculatePmfScore(mockMetrics);
    expect(result.recommendation).toBeTruthy();
    expect(result.recommendation.length).toBeGreaterThan(10);
  });

  it('should determine strong signal with sufficient evidence', () => {
    const largeDataset: PMFExperimentMetric[] = Array.from({ length: 15 }, (_, i) => ({
      id: `m${i}`,
      experiment_id: 'exp1',
      metric_name: 'customer_calls',
      metric_value: i,
      signal_level: 4,
      collected_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const result = calculatePmfScore(largeDataset);
    expect(result.signal_strength).toBe('strong');
  });
});

describe('isToolCandidate', () => {
  it('should return true for PMF score >= 60', () => {
    expect(isToolCandidate(70)).toBe(true);
    expect(isToolCandidate(60)).toBe(true);
  });

  it('should return false for PMF score < 60', () => {
    expect(isToolCandidate(50)).toBe(false);
    expect(isToolCandidate(0)).toBe(false);
  });
});
