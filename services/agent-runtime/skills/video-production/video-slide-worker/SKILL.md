---
name: video-slide-worker
description: Convert one approved meaning-block scene into an assertion-evidence visual fragment using existing AI Slide Video Factory templates. Use after video-scene-planner fixes scene boundaries and before the storyboard is composed, especially when scene fragments can be designed in parallel without changing the approved script or global narrative order.
---

# Video Slide Worker

Read the approved scene from `02_scene_plan.json`. Never change its spoken text, time range, role, or order.

1. Reduce the scene to one viewer-facing assertion.
2. Preserve the planner's `evidence_mode` and `visual_form`. Do not downgrade architecture, chart, screenshot, footage or talking head into a generic statement layout.
3. Select exactly one `selected_factory_scene_type` from the current Factory registry. Keep alternatives only as `rejected_candidates` with reasons.
4. Define `render_mode` as `graphic`, `talking_head`, `photo`, `video`, `screenshot`, `recorded_ui`, or `mixed`.
5. For `photo`, `video`, `screenshot`, `recorded_ui`, or `mixed`, require an `asset_request` with subject, explanatory purpose, crop, duration/range and provenance requirement.
6. Describe a representative 16:9 preview, one focal motion sequence and the exact visual evidence the viewer should understand without narration.
7. Keep lower-center caption space clear and Korean text optically centered.

Write `outputs/{slug}/planning/slide-fragments/{scene_id}.json` with `scene_id`, `source_scene_version`, `assertion`, `evidence`, `evidence_mode`, `visual_form`, `render_mode`, `selected_factory_scene_type`, `rejected_candidates`, `asset_request`, `composition`, `preview_spec`, `safe_areas`, and `issues`.

Fail instead of inventing evidence, media, or unsupported Factory components. A fragment is invalid when it only changes text while reusing the previous scene's composition.
