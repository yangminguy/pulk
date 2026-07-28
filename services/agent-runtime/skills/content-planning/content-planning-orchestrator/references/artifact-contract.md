# Content-planning artifact contract (content_planning_v1)

Every content-planning skill writes ONE JSON file per the unified envelope. The skill-executor
bridge (`services/agent-runtime/src/video-production/skill-executor.ts`, contract
`content_planning_v1`) injects this envelope into the prompt, normalizes identity + checksum, and
lifts `gate_stage` to the top level. The deterministic gate `validate-planning-artifact.mjs`
enforces it.

```jsonc
{
  "schema_version": "content_planning_v1",
  "artifact_type": "<string>",
  "gate_stage": "<one of: key_content_plan_doc | pulling_plan_doc | title_development | thumbnail_plan | script_draft>",
  "project_id": "<run.project_id>",
  "run_id": "<run.id>",
  "version": 1,
  "source_versions": {},
  "status": "draft" | "blocked",
  "issues": ["<string>", "..."],
  "generated_by": "<skill name>",
  "checksum": "",            // 브릿지가 채움 — 비워둘 것
  "data": { /* 각 SKILL.md STRICT output이 정의한 도메인 필드 전부 */ }
}
```

Rules:
- **`gate_stage` is the ONLY domain key at top level.** All other domain fields the skill defines
  go inside `data`. (A skill's "STRICT output" field list describes the shape of `data`.)
- Free-text inside `data` MUST be 한국어. Keys/enum literals/identifiers stay English.
- `gate_stage` must exactly match the `GATE_REQUIRED_REPORT_STAGES` stage name in
  `packages/l5-core/src/functions/video-room/state-machine.ts` — the plugin `upsertVideoRoomCard`
  canonical name — or the gate-report precondition (`missingGateReports`) silently fails to match.
- On an unsatisfiable precondition, still write a file with `status:"blocked"` and a reason in
  `issues` (do not throw).
