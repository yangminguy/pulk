import { scoreFounderFit } from '../index';
import type { BusinessIdea, FounderDNA } from '../../../types/entities';

describe('scoreFounderFit', () => {
  const mockIdea: BusinessIdea = {
    id: 'idea-1',
    title: 'AI-powered customer service platform',
    raw_description: 'An automated system for handling customer support',
    source: 'founder',
    status: 'idea',
    risk_level: 'D3',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const mockFounderDNA: FounderDNA[] = [
    {
      id: 'dna-1',
      category: 'business_preference',
      statement: 'AI and automation technologies',
      evidence: 'Past 3 successful AI projects',
      confidence: 5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'dna-2',
      category: 'strength',
      statement: 'Software development and system design',
      evidence: '15 years in software engineering',
      confidence: 5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'dna-3',
      category: 'risk_standard',
      statement: 'Comfortable with D2-D3 technical risk',
      evidence: 'Multiple technical experiments',
      confidence: 4,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  it('should return high score when idea matches founder strengths', () => {
    const result = scoreFounderFit(mockIdea, mockFounderDNA);
    expect(result.score).toBeGreaterThan(60);
    expect(result.breakdown.interest_fit).toBeGreaterThan(50);
    expect(result.breakdown.skill_fit).toBeGreaterThan(50);
  });

  it('should handle empty DNA array', () => {
    const result = scoreFounderFit(mockIdea, []);
    expect(result.score).toBe(50);
    expect(result.reasoning).toContain('No founder DNA');
  });

  it('should penalize weak skill fit', () => {
    const lowSkillIdea: BusinessIdea = {
      ...mockIdea,
      title: 'Healthcare consulting practice',
      raw_description: 'Medical expertise required'
    };

    const result = scoreFounderFit(lowSkillIdea, mockFounderDNA);
    expect(result.breakdown.skill_fit).toBeLessThan(60);
  });

  it('should generate appropriate reasoning', () => {
    const result = scoreFounderFit(mockIdea, mockFounderDNA);
    expect(result.reasoning).toBeTruthy();
    expect(result.reasoning.length).toBeGreaterThan(10);
  });

  it('should return score between 0 and 100', () => {
    const result = scoreFounderFit(mockIdea, mockFounderDNA);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should consider risk level fit', () => {
    const highRiskIdea: BusinessIdea = {
      ...mockIdea,
      risk_level: 'D5'
    };

    const result = scoreFounderFit(highRiskIdea, mockFounderDNA);
    expect(result.breakdown.risk_fit).toBeLessThan(
      scoreFounderFit(mockIdea, mockFounderDNA).breakdown.risk_fit
    );
  });
});
