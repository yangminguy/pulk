import { decideToolCandidate, estimateToolBuildingEffort } from '../index';
import type { ToolRequestInput } from '../index';

describe('decideToolCandidate', () => {
  const strongInput: ToolRequestInput = {
    pmf_score: 75,
    repetition_count: 10,
    time_to_complete: 30,
    error_risk: 'high',
    impact_on_revenue: 'high',
    bottleneck_severity: 'high'
  };

  it('should identify strong tool candidate', () => {
    const result = decideToolCandidate(strongInput);
    expect(result.is_tool_candidate).toBe(true);
    expect(result.priority).toBe('high');
  });

  it('should reject low PMF', () => {
    const lowPMF: ToolRequestInput = { ...strongInput, pmf_score: 40 };
    const result = decideToolCandidate(lowPMF);
    expect(result.is_tool_candidate).toBe(false);
  });

  it('should reject low repetition', () => {
    const lowRep: ToolRequestInput = { ...strongInput, repetition_count: 1 };
    const result = decideToolCandidate(lowRep);
    expect(result.is_tool_candidate).toBe(false);
  });

  it('should reject low time investment', () => {
    const lowTime: ToolRequestInput = { ...strongInput, time_to_complete: 2 };
    const result = decideToolCandidate(lowTime);
    expect(result.is_tool_candidate).toBe(false);
  });

  it('should weight high error risk', () => {
    const highRisk: ToolRequestInput = {
      pmf_score: 60,
      repetition_count: 3,
      time_to_complete: 10,
      error_risk: 'high',
      impact_on_revenue: 'none',
      bottleneck_severity: 'low'
    };
    const result = decideToolCandidate(highRisk);
    expect(result.is_tool_candidate).toBe(true);
  });

  it('should generate reasoning', () => {
    const result = decideToolCandidate(strongInput);
    expect(result.reasoning).toBeTruthy();
    expect(result.reasoning.length).toBeGreaterThan(20);
  });
});

describe('estimateToolBuildingEffort', () => {
  it('should estimate high effort for risky automation', () => {
    const input: ToolRequestInput = {
      pmf_score: 80,
      repetition_count: 5,
      time_to_complete: 20,
      error_risk: 'high',
      impact_on_revenue: 'high',
      bottleneck_severity: 'high'
    };
    const effort = estimateToolBuildingEffort(input);
    expect(effort).toContain('High');
  });

  it('should estimate low effort for simple tasks', () => {
    const input: ToolRequestInput = {
      pmf_score: 70,
      repetition_count: 3,
      time_to_complete: 5,
      error_risk: 'low',
      impact_on_revenue: 'low',
      bottleneck_severity: 'low'
    };
    const effort = estimateToolBuildingEffort(input);
    expect(effort).toContain('Low');
  });
});
