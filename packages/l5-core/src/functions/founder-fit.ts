// Founder Fit Scoring Logic
// Evaluates how well a business idea matches the founder's profile

import type { BusinessIdea, FounderDNA, FounderFitScore } from '../types/entities';

export function scoreFounderFit(
  idea: BusinessIdea,
  founderDNA: FounderDNA[]
): FounderFitScore {
  if (!founderDNA || founderDNA.length === 0) {
    return {
      score: 50,
      breakdown: {
        interest_fit: 50,
        skill_fit: 50,
        energy_fit: 50,
        brand_fit: 50,
        risk_fit: 50
      },
      reasoning: 'No founder DNA provided for evaluation'
    };
  }

  // Extract idea keywords
  const ideaKeywords = extractKeywords(idea.title + ' ' + idea.raw_description);

  // Calculate individual fit dimensions
  const interestFit = calculateInterestFit(ideaKeywords, founderDNA);
  const skillFit = calculateSkillFit(ideaKeywords, founderDNA);
  const energyFit = calculateEnergyFit(idea.risk_level, founderDNA);
  const brandFit = calculateBrandFit(idea.raw_description, founderDNA);
  const riskFit = calculateRiskFit(idea.risk_level, founderDNA);

  // Weighted average (equal weights for MVP)
  const score = Math.round(
    (interestFit + skillFit + energyFit + brandFit + riskFit) / 5
  );

  const breakdown = {
    interest_fit: interestFit,
    skill_fit: skillFit,
    energy_fit: energyFit,
    brand_fit: brandFit,
    risk_fit: riskFit
  };

  const reasoning = generateFitReasoning(breakdown);

  return {
    score,
    breakdown,
    reasoning
  };
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 20);
}

function calculateInterestFit(ideaKeywords: string[], dnaList: FounderDNA[]): number {
  const interestDNA = dnaList.filter(d => d.category === 'business_preference');

  if (interestDNA.length === 0) return 50;

  let matchCount = 0;
  let totalWeight = 0;

  interestDNA.forEach(dna => {
    const dnaKeywords = extractKeywords(dna.statement);
    const matches = ideaKeywords.filter(k => dnaKeywords.includes(k)).length;

    if (matches > 0) {
      matchCount += matches * dna.confidence;
    }
    totalWeight += dna.confidence;
  });

  return Math.min(100, Math.round((matchCount / totalWeight) * 100));
}

function calculateSkillFit(ideaKeywords: string[], dnaList: FounderDNA[]): number {
  const skillDNA = dnaList.filter(d => d.category === 'strength');
  const weaknessDNA = dnaList.filter(d => d.category === 'weakness');

  if (skillDNA.length === 0) return 50;

  let strengthScore = 0;
  let weaknessScore = 0;

  skillDNA.forEach(dna => {
    const keywords = extractKeywords(dna.statement);
    const relevance = ideaKeywords.filter(k => keywords.includes(k)).length > 0 ? dna.confidence : 0;
    strengthScore += relevance;
  });

  weaknessDNA.forEach(dna => {
    const keywords = extractKeywords(dna.statement);
    const relevance = ideaKeywords.filter(k => keywords.includes(k)).length > 0 ? dna.confidence : 0;
    weaknessScore += relevance;
  });

  const baseScore = Math.min(100, Math.round(strengthScore * 10));
  const adjustedScore = Math.max(0, baseScore - weaknessScore * 5);

  return adjustedScore;
}

function calculateEnergyFit(riskLevel: string, dnaList: FounderDNA[]): number {
  // MVP: Simplified energy calculation
  // D1-D2: lower energy cost = higher fit
  // D4-D5: higher energy commitment

  const riskLevelMap: Record<string, number> = {
    D1: 20,
    D2: 40,
    D3: 60,
    D4: 80,
    D5: 100
  };

  const energyCost = riskLevelMap[riskLevel] || 50;
  return Math.max(30, 100 - energyCost / 2);
}

function calculateBrandFit(description: string, dnaList: FounderDNA[]): number {
  const brandDNA = dnaList.filter(d => d.category === 'brand_tone');

  if (brandDNA.length === 0) return 50;

  // MVP: Simple brand tone matching
  let matchScore = 50;

  brandDNA.forEach(dna => {
    if (description.toLowerCase().includes(dna.statement.toLowerCase())) {
      matchScore += dna.confidence * 10;
    }
  });

  return Math.min(100, matchScore);
}

function calculateRiskFit(riskLevel: string, dnaList: FounderDNA[]): number {
  const riskDNA = dnaList.filter(d => d.category === 'risk_standard');

  if (riskDNA.length === 0) {
    const levelMap: Record<string, number> = { D1: 90, D2: 80, D3: 70, D4: 50, D5: 30 };
    return levelMap[riskLevel] || 50;
  }

  // Check if stated risk level matches founder's risk comfort
  let riskScore = 50;

  riskDNA.forEach(dna => {
    if (dna.statement.includes(riskLevel)) {
      riskScore = Math.min(100, 50 + dna.confidence * 10);
    }
  });

  return riskScore;
}

function generateFitReasoning(breakdown: Record<string, number>): string {
  const scores = Object.values(breakdown);
  const avgScore = Math.round(scores.reduce((a, b) => a + b) / scores.length);

  if (avgScore >= 80) {
    return 'Strong fit: Founder interest, skills, and risk tolerance all align well with this idea.';
  } else if (avgScore >= 60) {
    return 'Moderate fit: Some alignment with founder profile. Review skill gaps and energy commitment.';
  } else if (avgScore >= 40) {
    return 'Weak fit: Limited alignment with founder strengths. Consider acquiring skills or pivoting idea.';
  } else {
    return 'Poor fit: Significant misalignment with founder profile. Not recommended without major changes.';
  }
}
