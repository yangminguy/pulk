# Planning flow

Source of truth: `VIDEO_ROOM_FLOW`, `GATE_BY_STATUS`, and `GATE_REQUIRED_REPORT_STAGES` in `packages/l5-core/src/functions/video-room/state-machine.ts`. This orchestrator owns the flow segment from `product_defined` up to and including `script_approval`. Everything after `script_approval` (voice_recording → storyboard → pilot → render → qa → upload) belongs to the video-production-orchestrator.

## Stage → skill → gate report → gate

| Skill | Fills report stage | Gate status | Gate type |
|---|---|---|---|
| content-key-plan | `key_content_plan_doc` | `key_content_approval` | key_content_approval |
| content-pulling-research | `pulling_plan_doc` | `pulling_content_set_approval` | pulling_content_set_approval |
| content-title-develop | `title_development` | `hook_draft_approval` | hook_draft_approval |
| content-thumbnail-develop | `thumbnail_plan` | `hook_draft_approval` | hook_draft_approval |
| content-script-draft | `script_draft` | `script_approval` | script_approval |

`stage` strings must match the plugin `upsertVideoRoomCard` canonical names exactly, or the gate-report precondition silently fails to match.

## Flow order (from VIDEO_ROOM_FLOW)

```
product_defined
  → key_content_ideation → viewtrap_key_research
  → [gate] key_content_approval            (needs: key_content_plan_doc)
  → viewtrap_pulling_research → pulling_content_set_selection
  → [gate] pulling_content_set_approval    (needs: pulling_plan_doc)
  → thumbnail_pattern_extraction → intro_30s_analysis
  → [gate] hook_draft_approval             (needs: title_development AND thumbnail_plan)
  → script_planning → script_draft
  → [gate] script_approval                 (needs: script_draft)
  → voice_recording ...                    (handed off to video-production)
```

## hook_draft_approval is a two-card gate

`GATE_REQUIRED_REPORT_STAGES.hook_draft_approval = ['title_development', 'thumbnail_plan']`. Run content-title-develop and content-thumbnail-develop as a pair for the same video before the gate. The gate stays blocked until both cards are present; presenting only one leaves `missingGateReports` non-empty.

## Report-less approval block (missingGateReports)

This is the governing invariant of the chain. Before approving/advancing any gate status:

1. Collect the present report card stages for the project (`presentCardStages`).
2. Compute `missingGateReports(status, presentCardStages)`.
3. If it returns a non-empty list, the approval is forbidden — the founder has nothing to review. Run the owning skill(s) to produce the missing stage(s) first, then re-check.
4. Only advance via `advanceStatus(current, { gateApproved: true, presentCardStages })`. Passing `presentCardStages` is what enforces FR-6 at the state-machine level (`advanceStatus` throws `requires report card(s) before approval` when a stage is missing). Omitting it (legacy path) skips the check — always pass it here.

The rule mirrors the state machine comment: "리포트 없는 바로 승인" is blocked at the state-machine level. The orchestrator must never manufacture or accept a gate approval for a stage whose report card does not yet exist.

## Revision routing

On a founder-requested revision at gate G, re-run only the skill that owns G's report stage, replace that gate report card, and invalidate any downstream gate cards produced after G (their inputs changed). Re-collect approvals from G forward in flow order. Do not re-run upstream skills whose approvals still hold.
