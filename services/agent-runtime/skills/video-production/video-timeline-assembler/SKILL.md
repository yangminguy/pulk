---
name: video-timeline-assembler
description: Compile approved production artifacts into a validated AI Slide Video Factory job, pilot selection and layered timeline. Use only after the active animated storyboard version has Founder approval.
---

# Video Timeline Assembler

Require a storyboard approval receipt matching run ID, artifact version and checksum.

1. Verify artifact dependencies and active versions.
2. Use narration as master clock and approved rough-cut ranges as source edits.
3. Build talking-head, media, graphic, caption, effect and music layers.
4. Validate the job with the current Factory Zod schema.
5. Select a pilot of at most 60 seconds that covers talking head, lip sync, caption, graphic and transition behavior.

Write `09_factory_job.json`, `timeline.json`, `pilot_job.json` and `assembly_report.json`. Do not make new creative decisions.
