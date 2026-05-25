# HANDOFF — L5 Business OS

## Current Status

Development documentation has been generated from the L5 Business OS PRD.

The project is ready for initial repository setup and Phase 1 implementation.

## Current Architecture Decision

- Use NocoBase as MVP Shell.
- Keep all core domain logic in `packages/l5-core`.
- Build L5 features as NocoBase plugins.
- Use Mastra for Agent Runtime.
- Use Trigger.dev for Hermes Runtime.
- Use Langfuse for LLM observability.
- Use Formbricks for PMF signal collection.
- Use Activepieces for external automations.
- Keep customer PII separate from reusable business insights.

## Last Changes

- Created PRD split into implementation-ready documents.
- Added portable data model.
- Added architecture and service boundaries.
- Added agent protocol.
- Added Hermes spec.
- Added workflow factory spec.
- Added data governance and security rules.
- Added initial tasks.

## Next Recommended Tasks

1. Create project repository.
2. Copy this document package into repository root.
3. Install NocoBase + PostgreSQL locally.
4. Verify NocoBase plugin development path.
5. Create `packages/l5-core` with first scoring functions.
6. Implement FounderDNA / BusinessIdea / PMFExperiment collections.
7. Build Founder DNA Room and Business Portfolio Board.

## Known Risks

- NocoBase plugin development may require source install rather than Docker-only setup.
- Commercial plugin boundaries must be rechecked before commercialization.
- Customer PII must not be sent broadly to LLM traces or external tools.
- Trigger.dev/Mastra integration should be isolated behind adapters.
- MVP should not attempt to integrate every open-source tool at once.

## Important Notes

Do not start with polished custom UI.

The MVP success condition is the operating loop:

```text
Idea → PMF Experiment → Workflow → Agent Staffing → Hermes Monitoring → BPR → Memory → Evolution
```
