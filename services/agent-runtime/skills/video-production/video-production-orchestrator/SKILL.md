---
name: video-production-orchestrator
description: Run the Pulk-owned video-production skill chain from approved VideoExecutionBrief and source media through animated storyboard approval, pilot approval, final Factory render and targeted revision. Use for Video Room production runs and resumptions.
---

# Video Production Orchestrator

Read [repository-integration.md](references/repository-integration.md), [artifact-contract.md](references/artifact-contract.md), and [visual-diversity-contract.md](references/visual-diversity-contract.md).

1. Require approved script, title context and source media.
2. Run content brief, scene planner, per-scene slide workers, media prep, rough cut, asset, motion, sound and caption work.
3. Validate every output before recording it as the active version.
4. Run `scripts/validate-visual-diversity.mjs` after slide fragments and assets are ready. Stop on repeated forms, missing selected scene types, unresolved required media or a composer mismatch.
5. Compose the animated storyboard without changing each fragment's selected form. The Composer may assemble, brand and animate; it may not normalize different forms into one layout.
6. Run the same visual-diversity validation against the composed HTML and stop for Founder approval.
7. After approval, run timeline assembly and pilot rendering; stop for Pilot approval.
8. After Pilot approval, invoke the existing final render and QA path.
9. On revision, invalidate only the owning skill and dependent artifacts.

Never create a Factory job before storyboard approval or a final render before pilot approval.
