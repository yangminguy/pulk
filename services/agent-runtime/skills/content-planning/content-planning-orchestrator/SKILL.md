---
name: content-planning-orchestrator
description: Run the Pulk-owned content-planning skill chain — from an approved product definition through key-content plan, pulling research, title and thumbnail development, and script draft — filling one founder gate report per stage. Use for Video Room strategy/production planning runs and resumptions up to script approval.
---

# Content Planning Orchestrator

Read [planning-flow.md](references/planning-flow.md) before running. The chain covers the VIDEO_ROOM_FLOW segment from `product_defined` through `script_approval` (state machine: `packages/l5-core/src/functions/video-room/state-machine.ts`). Each skill produces exactly the gate report card its gate requires — no more.

Chain (fixed order):

1. **content-key-plan** → fills `key_content_plan_doc` → gate **key_content_approval**.
2. **content-pulling-research** → fills `pulling_plan_doc` → gate **pulling_content_set_approval**.
3. **content-title-develop** → fills `title_development` (paired with thumbnail) → gate **hook_draft_approval**.
4. **content-thumbnail-develop** → fills `thumbnail_plan` (paired with title) → gate **hook_draft_approval**.
5. **content-script-draft** → fills `script_draft` → gate **script_approval**.

Rules:

1. Require the upstream approval before starting a skill: never run key-plan without an approved product definition, never run pulling without `key_content_approval`, never run title/thumbnail without `pulling_content_set_approval`, never run script without `hook_draft_approval`.
2. Run each skill, validate its output, then record it as the active gate report card under the exact `stage` name in `GATE_REQUIRED_REPORT_STAGES`.
3. The **hook_draft_approval** gate requires BOTH `title_development` and `thumbnail_plan`. Run steps 3 and 4 as a pair and stop for one founder gate only when both cards exist.
4. Stop at every gate for founder approval. Advance only through `advanceStatus` with `gateApproved` and `presentCardStages`.
5. **Report-less approval is blocked (`missingGateReports`).** A gate cannot be approved or advanced while `missingGateReports(status, presentCardStages)` is non-empty. Do not solicit or apply an approval for a gate whose report card stage is absent — produce the report first.
6. On revision, re-run only the owning skill, invalidate its gate report card and any downstream cards that depended on it, and re-collect approval from that gate onward.

Never skip a skill to reach a later gate, and never mark a gate approved without its report card present.
