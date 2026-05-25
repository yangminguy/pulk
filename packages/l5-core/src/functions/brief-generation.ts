// Brief Generation Logic
// Creates executive briefs and decision digests

import type { BusinessIdea, FounderDNA, MemoryEntry, FounderFitScore } from '../types/entities';

export interface BriefGenerationInput {
  idea: BusinessIdea;
  founder_fit: FounderFitScore;
  relevant_memory: MemoryEntry[];
  founder_dna: FounderDNA[];
}

export function generateBusinessBrief(input: BriefGenerationInput): string {
  const lines: string[] = [];

  // Title
  lines.push(`# Business Idea Brief: ${input.idea.title}`);
  lines.push('');

  // One-liner
  lines.push('## Overview');
  lines.push(`${input.idea.raw_description}`);
  lines.push('');

  // Founder Fit
  lines.push('## Founder Fit Analysis');
  lines.push(`**Score**: ${input.founder_fit.score}/100 (${input.founder_fit.breakdown.interest_fit}% interest, ${input.founder_fit.breakdown.skill_fit}% skill)`);
  lines.push(`**Assessment**: ${input.founder_fit.reasoning}`);
  lines.push('');

  // Relevant Lessons
  if (input.relevant_memory.length > 0) {
    lines.push('## Relevant Past Learnings');
    input.relevant_memory.slice(0, 3).forEach(memory => {
      lines.push(`- **${memory.category}**: ${memory.content.substring(0, 100)}...`);
    });
    lines.push('');
  }

  // Founder DNA Match
  const strengths = input.founder_dna.filter(d => d.category === 'strength').slice(0, 2);
  if (strengths.length > 0) {
    lines.push('## Applicable Founder Strengths');
    strengths.forEach(strength => {
      lines.push(`- ${strength.statement}`);
    });
    lines.push('');
  }

  // Recommendation
  lines.push('## Recommendation');
  if (input.founder_fit.score >= 75) {
    lines.push(`✅ **Proceed** - Strong founder fit. This idea aligns well with your strengths and interests.`);
  } else if (input.founder_fit.score >= 50) {
    lines.push(`⚠️ **Conditional** - Moderate fit. Identify gaps and consider skill acquisition or partnerships.`);
  } else {
    lines.push(`❌ **Revisit** - Weak fit. Current profile suggests other ideas may be better suited.`);
  }
  lines.push('');

  // Next Steps
  lines.push('## Next Steps');
  lines.push('1. Define target customer segment');
  lines.push('2. Create simple PMF experiment (waitlist, landing page, or interview)');
  lines.push('3. Collect initial signal without building a tool');
  lines.push('4. Revisit after 1 week of signal collection');
  lines.push('');

  lines.push(`*Generated: ${new Date().toISOString().split('T')[0]}*`);

  return lines.join('\n');
}

export function generateFounderBrief(data: {
  date: Date;
  active_experiments_count: number;
  pending_decisions_count: number;
  urgent_alerts: string[];
  today_priority: string;
  completed_tasks_count: number;
}): string {
  const lines: string[] = [];

  lines.push('# Founder's Daily Operating Brief');
  lines.push(`Date: ${data.date.toISOString().split('T')[0]}`);
  lines.push('');

  lines.push('## Status Summary');
  lines.push(`- Active Experiments: ${data.active_experiments_count}`);
  lines.push(`- Pending Decisions: ${data.pending_decisions_count}`);
  lines.push(`- Completed Tasks: ${data.completed_tasks_count}`);
  lines.push('');

  if (data.urgent_alerts.length > 0) {
    lines.push('## 🚨 Urgent Alerts');
    data.urgent_alerts.forEach(alert => {
      lines.push(`- ${alert}`);
    });
    lines.push('');
  }

  lines.push('## Today\'s Priority');
  lines.push(data.today_priority);
  lines.push('');

  lines.push('## Recommended Actions');
  lines.push('1. Review pending decisions');
  lines.push('2. Check experiment metrics');
  lines.push('3. Identify any stalled workflows');
  lines.push('');

  return lines.join('\n');
}
