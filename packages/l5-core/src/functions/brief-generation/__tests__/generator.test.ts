import { generateBusinessBrief, generateFounderBrief } from '../index';
import type { BriefGenerationInput } from '../index';

describe('generateBusinessBrief', () => {
  const mockInput: BriefGenerationInput = {
    idea: {
      id: 'idea-1',
      title: 'AI Customer Service Bot',
      raw_description: 'Automated customer support using AI',
      source: 'founder',
      status: 'idea',
      risk_level: 'D3',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    founder_fit: {
      score: 85,
      breakdown: {
        interest_fit: 90,
        skill_fit: 80,
        energy_fit: 85,
        brand_fit: 75,
        risk_fit: 85
      },
      reasoning: 'Strong alignment with founder profile'
    },
    relevant_memory: [
      {
        id: 'm1',
        category: 'pmf_learning',
        content: 'Learned that customers value quick response times',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pii_level: 'none',
        searchable_tags: ['response_time', 'customer_satisfaction'],
        suggested_tags: ['pmf_learning'],
        approval_status: 'approved',
        contains_pii: false
      }
    ],
    founder_dna: [
      {
        id: 'd1',
        category: 'strength',
        statement: 'Excellent at automating repetitive tasks',
        evidence: 'Built 3 automation tools',
        confidence: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ]
  };

  it('should generate valid markdown brief', () => {
    const brief = generateBusinessBrief(mockInput);
    expect(brief).toContain('# Business Idea Brief');
    expect(brief).toContain('AI Customer Service Bot');
    expect(brief).toContain('Founder Fit Analysis');
  });

  it('should include founder fit score', () => {
    const brief = generateBusinessBrief(mockInput);
    expect(brief).toContain('85/100');
  });

  it('should include relevant memory', () => {
    const brief = generateBusinessBrief(mockInput);
    expect(brief).toContain('Relevant Past Learnings');
  });

  it('should recommend proceed for high fit', () => {
    const brief = generateBusinessBrief(mockInput);
    expect(brief).toContain('Proceed');
  });

  it('should recommend revisit for low fit', () => {
    const lowFitInput: BriefGenerationInput = {
      ...mockInput,
      founder_fit: {
        ...mockInput.founder_fit,
        score: 35,
        reasoning: 'Weak alignment'
      }
    };
    const brief = generateBusinessBrief(lowFitInput);
    expect(brief).toContain('Revisit');
  });

  it('should include next steps', () => {
    const brief = generateBusinessBrief(mockInput);
    expect(brief).toContain('Next Steps');
    expect(brief).toContain('PMF experiment');
  });
});

describe('generateFounderBrief', () => {
  const mockData = {
    date: new Date(),
    active_experiments_count: 3,
    pending_decisions_count: 2,
    urgent_alerts: ['Stalled workflow detected', 'PMF deadline approaching'],
    today_priority: 'Review customer interview results',
    completed_tasks_count: 5
  };

  it('should generate valid markdown brief', () => {
    const brief = generateFounderBrief(mockData);
    expect(brief).toContain('Daily Operating Brief');
    expect(brief).toContain('Status Summary');
  });

  it('should include all status counts', () => {
    const brief = generateFounderBrief(mockData);
    expect(brief).toContain('3');
    expect(brief).toContain('2');
    expect(brief).toContain('5');
  });

  it('should include urgent alerts', () => {
    const brief = generateFounderBrief(mockData);
    expect(brief).toContain('Urgent Alerts');
    expect(brief).toContain('Stalled workflow');
  });

  it('should include today priority', () => {
    const brief = generateFounderBrief(mockData);
    expect(brief).toContain('customer interview');
  });
});
