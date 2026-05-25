# QA_CHECKLIST — L5 Business OS

## Architecture QA

- [ ] NocoBase is used as Shell only.
- [ ] `l5-core` can run tests without NocoBase.
- [ ] Plugins call `l5-core` instead of duplicating logic.
- [ ] Long-running jobs are not inside plugin request handlers.
- [ ] Agent runtime is separated from UI shell.
- [ ] Hermes runtime is separated from UI shell.

## Product QA

- [ ] New business idea creates Founder Fit evaluation.
- [ ] PMF Experiment Plan is created before Tool Request.
- [ ] Workflow and Agent Staffing Plan are created.
- [ ] Business Portfolio status updates correctly.
- [ ] Hermes Alert Queue shows stalled/deadline items.
- [ ] BPR Log captures bottlenecks and actions.
- [ ] Tool Request Lab receives repeated-work candidates.
- [ ] Memory Room stores insights with evidence refs.

## Data Governance QA

- [ ] Customer PII and Business Insight are separate.
- [ ] Customer records have `pii_level`.
- [ ] Customer records have consent scope/status.
- [ ] External actions have risk level.
- [ ] D3-D5 actions require approval.
- [ ] LLM traces do not contain unnecessary PII.
- [ ] Export works for JSON/CSV/Markdown.

## Open Source Guardrail QA

- [ ] No commercial NocoBase plugin is required for MVP-critical path.
- [ ] No paid automation dependency is required.
- [ ] Optional analytics is not required for Phase 1.
- [ ] Licenses are flagged for review before commercialization.

## Manual Test Flow

1. Create FounderDNA records.
2. Create a BusinessIdea.
3. Run Founder Fit scoring.
4. Generate PMF Experiment Plan.
5. Generate Workflow and Agent Staffing.
6. Mark a Workflow as inactive/stalled.
7. Run Hermes stalled workflow detector.
8. Confirm HermesAlert is created.
9. Create PMF metrics.
10. Calculate PMF Score.
11. Create MemoryEntry suggestion.
12. Confirm Tool Request is only suggested when criteria are met.
