# Work Order 002: L5 Core Package - Scoring Functions

**Priority**: P0  
**Phase**: 2  
**Owner**: Claude Code (Orchestrator)  
**Status**: Pending

## Objective

Implement core business logic functions in `packages/l5-core` that are independent of NocoBase UI.

## Acceptance Criteria

- [ ] `scoreFounderFit(idea, founderDNA)` implemented with unit tests
- [ ] `calculatePmfScore(metrics)` implemented with unit tests
- [ ] `decideToolCandidate(pmfScore, metrics)` implemented with unit tests
- [ ] `requiresFounderApproval(decisionType, riskLevel)` implemented with unit tests
- [ ] `generateBusinessBrief(idea, founderFit, relevantMemory)` implemented
- [ ] All functions runnable without NocoBase
- [ ] Jest test suite passes: `pnpm test` in l5-core directory
- [ ] TypeScript types exported properly
- [ ] Core report written to `reports/l5-core-implementation-report.md`

## Functions to Implement

### 1. scoreFounderFit

**Input**: BusinessIdea + FounderDNA  
**Output**: { score: 0-100, breakdown: {interestFit, skillFit, energyFit, brandFit, riskFit} }  
**Algorithm**:
- Match idea keywords against Founder interests → interestFit (0-100)
- Match required skills against Founder strengths → skillFit (0-100)
- Check idea energy cost vs Founder current energy level → energyFit (0-100)
- Match brand tone → brandFit (0-100)
- Check risk level compatibility → riskFit (0-100)
- Average with weightings (default: all equal)

**Unit Tests**:
- [ ] High interest + High skill = high score
- [ ] Low skill + required = lower score
- [ ] Risk mismatch = penalized score
- [ ] Edge cases: empty DNA, empty idea

### 2. calculatePmfScore

**Input**: PMFExperimentMetric[]  
**Output**: { pmfScore: 0-100, signalStrength: 'weak' | 'medium' | 'strong', recommendation: string }  
**Algorithm**:
- Aggregate metric signal levels (1-5) by type
- Weight by metric importance (waitlist conversion, interview requests, survey responses)
- Normalize to 0-100 scale
- Determine signal strength based on sample size and consistency

**Unit Tests**:
- [ ] High conversion waitlist = strong signal
- [ ] Few interviews = weak signal
- [ ] Mixed signals = medium recommendation
- [ ] Edge cases: no metrics, contradictory signals

### 3. decideToolCandidate

**Input**: { pmfScore: number, repetitionCount: number, timeToComplete: number, riskLevel: string }  
**Output**: { isToolCandidate: boolean, reasoning: string, priority: 'high' | 'medium' | 'low' }  
**Algorithm**:
- If pmfScore < 60: return false (not enough demand)
- If repetitionCount < 3: return false (not repetitive enough)
- If timeToComplete < 5 minutes: return false (not worth automating)
- Otherwise: return true with priority based on impact

**Unit Tests**:
- [ ] Low PMF → not a candidate
- [ ] PMF OK but not repetitive → not a candidate
- [ ] High PMF + repetitive + time-consuming → is a candidate

### 4. requiresFounderApproval

**Input**: { decisionType: string, riskLevel: 'D1' | 'D2' | 'D3' | 'D4' | 'D5' }  
**Output**: boolean  
**Rules**:
- D1, D2: false (no approval needed)
- D3, D4, D5: true (approval needed)

**Unit Tests**:
- [ ] D1-D2 → false
- [ ] D3-D5 → true

### 5. generateBusinessBrief

**Input**: { idea: BusinessIdea, founderFit: {score, breakdown}, relevantMemory: MemoryEntry[] }  
**Output**: string (Markdown)  
**Content**:
- Title from idea
- One-liner value prop
- Founder Fit Score with breakdown
- Relevant past learnings (from memory)
- Recommended next steps

**Unit Tests**:
- [ ] Outputs valid Markdown
- [ ] Includes all input data
- [ ] Handles empty memory

## Project Structure

```
packages/l5-core/
  package.json
  tsconfig.json
  src/
    index.ts
    types/
      entities.ts
    functions/
      founder-fit/
        scorer.ts
        scorer.test.ts
      pmf-scoring/
        calculator.ts
        calculator.test.ts
      tool-request/
        decision.ts
        decision.test.ts
      approval/
        rules.ts
        rules.test.ts
      brief-generation/
        generator.ts
        generator.test.ts
  jest.config.js
```

## Testing

- Use Jest framework
- Run: `pnpm test` from l5-core directory
- Target: >80% code coverage for critical functions
- All tests must pass before Phase 3 starts

## No Dependencies on

- ❌ NocoBase
- ❌ Mastra
- ❌ External APIs
- ❌ File system I/O
- ❌ HTTP calls

All inputs must be in-memory data structures.

## Next Phase

Once this WO is done, proceed to **Work Order 003: NocoBase Plugins**
